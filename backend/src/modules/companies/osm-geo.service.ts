import { AppError } from "../../common/errors.js";
import { logger } from "../../common/logger.js";
import { env } from "../../config/env.js";

// Single-process only: this in-memory throttle/cache works for one systemd
// service instance. Do not add Redis for multi-process scaling without
// a full redesign.
const THROTTLE_DELAY_MS = 1100;
const CACHE_TTL_GEOCODE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_TTL_NEIGHBORHOOD_MS = 24 * 60 * 60 * 1000; // 24 hours
const OVERPASS_TIMEOUT_MS = 22000;
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
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function getCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
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

export async function discoverNeighborhoods(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<
  Array<{ placeId: string; name: string; latitude: number; longitude: number }>
> {
  const cacheKey = `neighborhoods:${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm}`;
  const cached = getCache<
    Array<{
      placeId: string;
      name: string;
      latitude: number;
      longitude: number;
    }>
  >(neighborhoodCache, cacheKey);
  if (cached) return cached;

  const radiusM = Math.round(radiusKm * 1000);
  const placeTypes = "(suburb|neighbourhood|quarter|city_district)";

  const query = `
[out:json][timeout:20];
(
  node["place"~"^${placeTypes}$"]["name"](around:${radiusM},${lat},${lng});
  way["place"~"^${placeTypes}$"]["name"](around:${radiusM},${lat},${lng});
  relation["place"~"^${placeTypes}$"]["name"](around:${radiusM},${lat},${lng});
);
out center tags 100;
`.trim();

  let elements = (await runOverpassQuery(query)).elements;
  let result = parseOverpassElements(elements, { lat, lng }, radiusKm);

  // Fallback to town/village if no results
  if (result.length === 0) {
    const fallbackPlaceTypes = "(town|village|hamlet|locality)";
    const fallbackQuery = `
[out:json][timeout:20];
(
  node["place"~"^${fallbackPlaceTypes}$"]["name"](around:${radiusM},${lat},${lng});
  way["place"~"^${fallbackPlaceTypes}$"]["name"](around:${radiusM},${lat},${lng});
  relation["place"~"^${fallbackPlaceTypes}$"]["name"](around:${radiusM},${lat},${lng});
);
out center tags 100;
`.trim();

    elements = (await runOverpassQuery(fallbackQuery)).elements;
    result = parseOverpassElements(elements, { lat, lng }, radiusKm);
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
