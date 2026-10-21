import { AppError } from "../../common/errors.js";
import { logger } from "../../common/logger.js";
import { env } from "../../config/env.js";

// Single-process only: this in-memory throttle/cache works for one systemd
// service instance. Do not add Redis for multi-process scaling without
// a full redesign.
const THROTTLE_DELAY_MS = 1100;
const CACHE_TTL_GEOCODE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_TTL_NEIGHBORHOOD_MS = 24 * 60 * 60 * 1000; // 24 hours
const OVERPASS_TIMEOUT_MS = 7000;
// After every Overpass mirror fails, skip Overpass for a while and go straight
// to the Nominatim fallback so users are not stuck waiting on a dead service.
const OVERPASS_COOLDOWN_MS = 5 * 60 * 1000;
const NOMINATIM_DISCOVERY_BUDGET_MS = 12000;
let overpassDownUntil = 0;
// Public Overpass instances are frequently overloaded; query several at once
// and use the first one that answers.
const OVERPASS_FALLBACK_URLS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const MAX_CACHE_ENTRIES = 500;

type CacheEntry<T> = { value: T; expiresAt: number };

const geocodeCache = new Map<string, CacheEntry<unknown>>();
const neighborhoodCache = new Map<string, CacheEntry<unknown>>();

function setCache<T>(
  cache: Map<string, CacheEntry<unknown>>,
  key: string,
  value: T,
  ttlMs: number,
): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function getCache<T>(
  cache: Map<string, CacheEntry<unknown>>,
  key: string,
): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

// Per-host serial queue to guarantee >= THROTTLE_DELAY_MS between requests
const hostQueue = new Map<string, { lastRequestAt: number }>();

async function throttledFetch(
  url: URL,
  options?: RequestInit,
  timeoutMs = 20000,
): Promise<Response> {
  const hostname = url.hostname;
  const now = Date.now();
  const state = hostQueue.get(hostname) ?? { lastRequestAt: 0 };
  const elapsed = now - state.lastRequestAt;
  if (elapsed < THROTTLE_DELAY_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, THROTTLE_DELAY_MS - elapsed),
    );
  }
  state.lastRequestAt = Date.now();
  hostQueue.set(hostname, state);

  const headers: Record<string, string> = {
    "User-Agent": env.OSM_USER_AGENT,
    ...((options?.headers as Record<string, string>) ?? {}),
  };

  try {
    return await fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    logger.error(
      {
        err: error,
        errName: error instanceof Error ? error.name : undefined,
        errMessage: error instanceof Error ? error.message : undefined,
        hostname,
      },
      "OSM fetch failed",
    );
    throw new AppError(
      "MAPS_PROVIDER_UNAVAILABLE",
      "Map service is temporarily unavailable. Please try again.",
      502,
    );
  }
}

function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function offsetPoint(
  latitude: number,
  longitude: number,
  distanceKmValue: number,
  bearingDeg: number,
) {
  const bearing = (bearingDeg * Math.PI) / 180;
  const dLat = (distanceKmValue * Math.cos(bearing)) / 111.32;
  const cosLat = Math.max(0.05, Math.cos((latitude * Math.PI) / 180));
  const dLng = (distanceKmValue * Math.sin(bearing)) / (111.32 * cosLat);
  return {
    latitude: Math.max(-90, Math.min(90, latitude + dLat)),
    longitude: Math.max(-180, Math.min(180, longitude + dLng)),
  };
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string> {
  const cacheKey = `reverse:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = getCache<string>(geocodeCache, cacheKey);
  if (cached) return cached;

  const url = new URL(`${env.NOMINATIM_BASE_URL}/reverse`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lon", lng.toString());
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");

  const response = await throttledFetch(url);
  if (!response.ok) {
    logger.error(
      { status: response.status },
      "Nominatim reverse geocode HTTP error",
    );
    throw new AppError(
      "MAPS_PROVIDER_UNAVAILABLE",
      "Address lookup is temporarily unavailable.",
      502,
    );
  }

  const data = (await response.json()) as {
    error?: string;
    display_name?: string;
  };
  if (data.error) {
    throw new AppError(
      "LOCATION_NOT_RESOLVED",
      "The selected coordinates did not resolve to a real address.",
      422,
    );
  }

  const address = data.display_name?.trim();
  if (!address) {
    throw new AppError(
      "LOCATION_NOT_RESOLVED",
      "The selected coordinates did not resolve to a real address.",
      422,
    );
  }

  setCache(geocodeCache, cacheKey, address, CACHE_TTL_GEOCODE_MS);
  return address;
}

export async function forwardGeocode(
  address: string,
): Promise<{ address: string; latitude: number; longitude: number }> {
  const normalized = address.trim().toLowerCase();
  const cacheKey = `forward:${normalized}`;
  const cached = getCache<{
    address: string;
    latitude: number;
    longitude: number;
  }>(geocodeCache, cacheKey);
  if (cached) return cached;

  const url = new URL(`${env.NOMINATIM_BASE_URL}/search`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", address);
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");

  const response = await throttledFetch(url);
  if (!response.ok) {
    logger.error(
      { status: response.status },
      "Nominatim forward geocode HTTP error",
    );
    throw new AppError(
      "MAPS_PROVIDER_UNAVAILABLE",
      "Address search is temporarily unavailable.",
      502,
    );
  }

  const results = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;

  if (!results || results.length === 0) {
    throw new AppError(
      "LOCATION_NOT_RESOLVED",
      "No address matched that search. Try a more specific address.",
      404,
    );
  }

  const first = results[0];
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new AppError(
      "LOCATION_NOT_RESOLVED",
      "Address lookup returned invalid coordinates.",
      422,
    );
  }

  const result = {
    address: first.display_name.trim(),
    latitude,
    longitude,
  };

  setCache(geocodeCache, cacheKey, result, CACHE_TTL_GEOCODE_MS);
  return result;
}

export function parseOverpassElements(
  elements: unknown,
  origin: { lat: number; lng: number },
  radiusKm: number,
): Array<{
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
}> {
  if (!Array.isArray(elements)) return [];

  const result: Array<{
    placeId: string;
    name: string;
    latitude: number;
    longitude: number;
    rank: number;
    distance: number;
  }> = [];

  for (const element of elements) {
    if (!element || typeof element !== "object") continue;

    const el = element as {
      type?: string;
      id?: number;
      lat?: number;
      lon?: number;
      center?: { lat?: number; lon?: number };
      tags?: { name?: string };
    };

    if (!el.type || typeof el.id !== "number") continue;
    if (typeof el.tags?.name !== "string" || !el.tags.name.trim()) continue;

    let latitude: number;
    let longitude: number;

    if (el.type === "node") {
      if (typeof el.lat !== "number" || typeof el.lon !== "number") continue;
      latitude = el.lat;
      longitude = el.lon;
    } else {
      if (
        typeof el.center?.lat !== "number" ||
        typeof el.center?.lon !== "number"
      )
        continue;
      latitude = el.center.lat;
      longitude = el.center.lon;
    }

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    )
      continue;

    const distance = distanceKm(origin.lat, origin.lng, latitude, longitude);
    if (distance > radiusKm) continue;

    const name = el.tags.name.trim();
    const placeId = `osm:${el.type}:${el.id}`;

    result.push({
      placeId,
      name,
      latitude,
      longitude,
      rank: 0,
      distance,
    });
  }

  // De-duplicate by lower-cased name, keep nearest
  const byName = new Map<string, (typeof result)[0]>();
  for (const item of result) {
    const key = item.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || item.distance < existing.distance) {
      byName.set(key, item);
    }
  }

  return [...byName.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 20)
    .map(({ placeId, name, latitude, longitude }) => ({
      placeId,
      name,
      latitude,
      longitude,
    }));
}

async function runOverpassQueryOn(
  endpoint: string,
  query: string,
): Promise<{ elements: unknown[] }> {
  const url = new URL(endpoint);
  const params = new URLSearchParams();
  params.set("data", query);
  const response = await throttledFetch(
    url,
    {
      method: "POST",
      body: params,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
    OVERPASS_TIMEOUT_MS,
  );

  if (!response.ok) {
    logger.error(
      { status: response.status, hostname: url.hostname },
      "Overpass API HTTP error",
    );
    throw new Error(`Overpass HTTP ${response.status}`);
  }

  const body = (await response.json()) as { elements?: unknown[] };
  if (!Array.isArray(body.elements)) {
    throw new Error("Overpass response missing elements");
  }
  return { elements: body.elements };
}

async function runOverpassQuery(
  query: string,
): Promise<{ elements: unknown[] }> {
  const endpoints = [
    env.OVERPASS_BASE_URL,
    ...OVERPASS_FALLBACK_URLS.filter((u) => u !== env.OVERPASS_BASE_URL),
  ];
  try {
    return await Promise.any(
      endpoints.map((endpoint) => runOverpassQueryOn(endpoint, query)),
    );
  } catch {
    throw new AppError(
      "MAPS_PROVIDER_UNAVAILABLE",
      "Neighborhood discovery is temporarily unavailable.",
      502,
    );
  }
}

type Neighborhood = {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
};

async function discoverViaOverpass(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<Neighborhood[]> {
  const radiusM = Math.round(radiusKm * 1000);
  const buildQuery = (placeTypes: string): string =>
    `
[out:json][timeout:20];
(
  node["place"~"^${placeTypes}$"]["name"](around:${radiusM},${lat},${lng});
  way["place"~"^${placeTypes}$"]["name"](around:${radiusM},${lat},${lng});
  relation["place"~"^${placeTypes}$"]["name"](around:${radiusM},${lat},${lng});
);
out center tags 100;
`.trim();

  let elements = (
    await runOverpassQuery(
      buildQuery("(suburb|neighbourhood|quarter|city_district)"),
    )
  ).elements;
  let result = parseOverpassElements(elements, { lat, lng }, radiusKm);

  // Fallback to town/village if no results
  if (result.length === 0) {
    elements = (
      await runOverpassQuery(buildQuery("(town|village|hamlet|locality)"))
    ).elements;
    result = parseOverpassElements(elements, { lat, lng }, radiusKm);
  }
  return result;
}

// Fallback when Overpass is unavailable: reverse-geocode a ring of points
// around the headquarters with Nominatim and collect the distinct suburb /
// neighbourhood names it returns. Slower and less complete than Overpass, but
// it only depends on the Nominatim service that already handles addresses.
async function discoverViaNominatim(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<Neighborhood[]> {
  const ringKm = Math.max(radiusKm * 0.6, 1);
  const points = [
    { latitude: lat, longitude: lng },
    ...[0, 60, 120, 180, 240, 300].map((bearing) =>
      offsetPoint(lat, lng, ringKm, bearing),
    ),
  ];

  const deadline = Date.now() + NOMINATIM_DISCOVERY_BUDGET_MS;
  const byName = new Map<string, Neighborhood & { distance: number }>();
  let succeeded = 0;

  for (const point of points) {
    if (Date.now() >= deadline) break;
    try {
      const url = new URL(`${env.NOMINATIM_BASE_URL}/reverse`);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", point.latitude.toString());
      url.searchParams.set("lon", point.longitude.toString());
      url.searchParams.set("zoom", "14");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("accept-language", "en");

      const response = await throttledFetch(url, undefined, 8000);
      if (!response.ok) continue;
      succeeded += 1;

      const data = (await response.json()) as {
        error?: string;
        lat?: string;
        lon?: string;
        osm_type?: string;
        osm_id?: number;
        address?: {
          suburb?: string;
          neighbourhood?: string;
          quarter?: string;
          city_district?: string;
        };
      };
      if (data.error || !data.address) continue;

      const name = (
        data.address.suburb ??
        data.address.neighbourhood ??
        data.address.quarter ??
        data.address.city_district
      )?.trim();
      if (!name) continue;

      const latitude = Number(data.lat);
      const longitude = Number(data.lon);
      const hasCoords =
        Number.isFinite(latitude) && Number.isFinite(longitude);
      const itemLat = hasCoords ? latitude : point.latitude;
      const itemLng = hasCoords ? longitude : point.longitude;
      const distance = distanceKm(lat, lng, itemLat, itemLng);
      if (distance > radiusKm) continue;

      const key = name.toLowerCase();
      const existing = byName.get(key);
      if (!existing || distance < existing.distance) {
        byName.set(key, {
          placeId:
            data.osm_type && typeof data.osm_id === "number"
              ? `osm:${data.osm_type}:${data.osm_id}`
              : `osm:name:${key}`,
          name,
          latitude: itemLat,
          longitude: itemLng,
          distance,
        });
      }
    } catch {
      // throttledFetch already logged the failure; try the next point.
    }
  }

  if (succeeded === 0) {
    throw new AppError(
      "MAPS_PROVIDER_UNAVAILABLE",
      "Neighborhood discovery is temporarily unavailable.",
      502,
    );
  }

  return [...byName.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 20)
    .map(({ placeId, name, latitude, longitude }) => ({
      placeId,
      name,
      latitude,
      longitude,
    }));
}

export async function discoverNeighborhoods(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<Neighborhood[]> {
  const cacheKey = `neighborhoods:${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm}`;
  const cached = getCache<Neighborhood[]>(neighborhoodCache, cacheKey);
  if (cached) return cached;

  let result: Neighborhood[] | undefined;

  if (Date.now() >= overpassDownUntil) {
    try {
      result = await discoverViaOverpass(lat, lng, radiusKm);
    } catch {
      overpassDownUntil = Date.now() + OVERPASS_COOLDOWN_MS;
      logger.warn(
        { cooldownMs: OVERPASS_COOLDOWN_MS },
        "Overpass unavailable; using Nominatim neighborhood fallback",
      );
    }
  }

  if (!result) {
    result = await discoverViaNominatim(lat, lng, radiusKm);
  }

  setCache(neighborhoodCache, cacheKey, result, CACHE_TTL_NEIGHBORHOOD_MS);
  return result;
}

export async function locateCustomArea(
  name: string,
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<{ latitude: number; longitude: number }> {
  try {
    const sw = offsetPoint(lat, lng, radiusKm * 1.5, 225);
    const ne = offsetPoint(lat, lng, radiusKm * 1.5, 45);

    const url = new URL(`${env.NOMINATIM_BASE_URL}/search`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("q", name);
    url.searchParams.set(
      "viewbox",
      `${sw.longitude},${sw.latitude},${ne.longitude},${ne.latitude}`,
    );
    url.searchParams.set("bounded", "0");
    url.searchParams.set("limit", "1");

    const response = await throttledFetch(url);
    if (!response.ok) {
      logger.error(
        { status: response.status },
        "Nominatim custom area search HTTP error",
      );
      throw new AppError(
        "MAPS_PROVIDER_UNAVAILABLE",
        "Map service unavailable.",
        502,
      );
    }

    const results = (await response.json()) as Array<{
      lat: string;
      lon: string;
    }>;
    if (results && results.length > 0) {
      const latitude = Number(results[0].lat);
      const longitude = Number(results[0].lon);

      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        distanceKm(lat, lng, latitude, longitude) <= radiusKm * 1.5
      ) {
        return { latitude, longitude };
      }
    }
  } catch {
    // Fall through to headquarters coordinates
  }

  return { latitude: lat, longitude: lng };
}

export { distanceKm, offsetPoint };
