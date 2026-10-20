import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import { AppError } from "../../common/errors.js";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { logger } from "../../common/logger.js";
import { prisma } from "../../db/prisma.js";
import {
  createCompanyLogoReadUrl,
  createCompanyLogoUploadUrl,
  verifyCompanyLogoUpload,
} from "../../common/storage/supabase-storage.adapter.js";

const router = Router();
router.use(requireAuth, requireRole("OWNER"));

// Google Places/Geocoding can incur usage-based charges. Bound calls per
// authenticated owner; do not key this by a submitted company ID.
const mapsProviderRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  keyGenerator: (request) => request.auth?.userId ?? "unauthenticated",
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many map lookups. Please try again later.",
        429,
      ),
    );
  },
});

const builtInServices = {
  ac_repair: { name: "AC Repair", iconKey: "air_conditioning" },
  ac_installation: { name: "AC Installation", iconKey: "tools" },
  preventive_maintenance: {
    name: "Preventive Maintenance",
    iconKey: "maintenance",
  },
  emergency_diagnostics: {
    name: "Emergency Diagnostics",
    iconKey: "thermometer",
  },
  duct_cleaning_sealing: {
    name: "Duct Cleaning & Sealing",
    iconKey: "airflow",
  },
  thermostat_controls: { name: "Thermostat & Controls", iconKey: "thermostat" },
  commercial_chillers: { name: "Commercial Chillers", iconKey: "cooling" },
  refrigerant_leak_repair: {
    name: "Refrigerant Leak Repair",
    iconKey: "tools",
  },
} as const;

const customIconKeys = new Set([
  "air_conditioning",
  "cooling",
  "heating",
  "thermometer",
  "airflow",
  "thermostat",
  "tools",
  "maintenance",
]);

const businessSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(25)
    .regex(/^\+?[0-9()\s.-]+$/)
    .refine((value) => {
      const digits = value.replace(/\D/g, "").length;
      return digits >= 7 && digits <= 15;
    }, "Enter a valid phone number"),
  taxId: z.string().trim().max(60).optional().nullable(),
  defaultCurrency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((v) => v.toUpperCase()),
});

const coordinatesSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});
const radiusSchema = z.coerce.number().int().min(10).max(50);

const areaSchema = coordinatesSchema
  .extend({
    radiusKm: radiusSchema,
    zonePlaceIds: z
      .array(z.string().trim().min(1).max(300))
      .max(20)
      .default([]),
    customZones: z.array(z.string().trim().min(2).max(80)).max(10).default([]),
  })
  .refine((value) => value.zonePlaceIds.length + value.customZones.length > 0, {
    message: "Select or add at least one service area",
  });

const serviceSchema = z.object({
  services: z
    .array(
      z.object({
        serviceKey: z.string().trim().max(80).optional().nullable(),
        name: z.string().trim().min(1).max(80),
        iconKey: z.string().trim().min(1).max(40),
        isCustom: z.boolean(),
      }),
    )
    .min(1)
    .max(40),
});

function failValidation(error: z.ZodError): never {
  throw new AppError(
    "VALIDATION_FAILED",
    error.issues.map((issue) => issue.message).join(", "),
    422,
  );
}

function companyIdFromRequest(request: Express.Request): string {
  return (request as Express.Request & { auth?: { companyId: string } }).auth!
    .companyId;
}

function companySelect() {
  return {
    id: true,
    name: true,
    slug: true,
    timezone: true,
    defaultCurrency: true,
    phone: true,
    taxId: true,
    logoObjectKey: true,
    headquartersAddress: true,
    headquartersLatitude: true,
    headquartersLongitude: true,
    serviceRadiusKm: true,
    onboardingStep: true,
    onboardingCompletedAt: true,
    services: {
      select: {
        id: true,
        serviceKey: true,
        name: true,
        iconKey: true,
        isCustom: true,
      },
      orderBy: { name: "asc" as const },
    },
    serviceZones: {
      where: { isActive: true },
      select: {
        id: true,
        providerPlaceId: true,
        name: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { name: "asc" as const },
    },
  };
}

export function parseGoogleNeighborhoodPlace(candidate: unknown) {
  if (!candidate || typeof candidate !== "object") return null;
  const place = candidate as {
    id?: unknown;
    displayName?: { text?: unknown };
    location?: { latitude?: unknown; longitude?: unknown };
    types?: unknown;
  };
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  if (
    typeof place.id !== "string" ||
    !place.id ||
    typeof place.displayName?.text !== "string" ||
    !place.displayName.text.trim() ||
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !Array.isArray(place.types) ||
    !place.types.includes("neighborhood")
  ) {
    return null;
  }
  return {
    placeId: place.id,
    name: place.displayName.text.trim(),
    latitude,
    longitude,
  };
}

type GoogleGeocodeResult = {
  place_id?: string;
  formatted_address?: string;
  types?: string[];
  address_components?: Array<{ long_name?: string; types?: string[] }>;
  geometry?: { location?: { lat?: number; lng?: number } };
};

// Single entry point for Google Geocoding. Only the Geocoding API (enabled on
// the server key) is needed for address lookup AND neighborhood discovery.
async function googleGeocode(
  params: Record<string, string>,
): Promise<GoogleGeocodeResult[]> {
  if (!env.GOOGLE_MAPS_PLACES_API_KEY) {
    throw new AppError(
      "MAPS_PROVIDER_NOT_CONFIGURED",
      "Google Maps is not configured. Set GOOGLE_MAPS_PLACES_API_KEY on the API.",
      503,
    );
  }
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("key", env.GOOGLE_MAPS_PLACES_API_KEY);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new AppError(
      "MAPS_PROVIDER_UNAVAILABLE",
      "Google Geocoding could not be reached. Retry when online.",
      502,
    );
  }
  if (!response.ok) {
    logger.error({ status: response.status }, "Google Geocoding HTTP error");
    throw new AppError(
      "MAPS_PROVIDER_UNAVAILABLE",
      "Google Geocoding is temporarily unavailable.",
      502,
    );
  }
  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    results?: GoogleGeocodeResult[];
  };
  if (data.status === "OK") return data.results ?? [];
  if (data.status === "ZERO_RESULTS") return [];
  // Never log the URL: it contains the API key.
  logger.error(
    { googleStatus: data.status, googleMessage: data.error_message },
    "Google Geocoding request rejected",
  );
  throw new AppError(
    "MAPS_PROVIDER_UNAVAILABLE",
    data.status === "REQUEST_DENIED"
      ? "Google rejected the server maps key. Enable the Geocoding API for this key, enable billing, and remove Android-app restrictions from the server key."
      : "Google Geocoding could not complete this request.",
    502,
  );
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

const NEIGHBORHOOD_TYPES = [
  "neighborhood",
  "sublocality",
  "sublocality_level_1",
];

// Finds real neighborhood-level areas around a point by reverse-geocoding a
// small grid (centre + two rings) inside the radius and de-duplicating by
// Google place_id. Uses only the Geocoding API.
async function discoverNeighborhoods(
  latitude: number,
  longitude: number,
  radiusKm: number,
) {
  const points = [{ latitude, longitude }];
  for (let i = 0; i < 6; i++) {
    points.push(offsetPoint(latitude, longitude, radiusKm * 0.5, i * 60));
    points.push(offsetPoint(latitude, longitude, radiusKm * 0.9, i * 60 + 30));
  }
  const settled = await Promise.allSettled(
    points.map((point) =>
      googleGeocode({
        latlng: `${point.latitude},${point.longitude}`,
        result_type: "neighborhood|sublocality|locality",
      }),
    ),
  );
  const fulfilled = settled.filter(
    (item): item is PromiseFulfilledResult<GoogleGeocodeResult[]> =>
      item.status === "fulfilled",
  );
  if (fulfilled.length === 0) {
    const firstFailure = settled.find((item) => item.status === "rejected");
    throw (firstFailure as PromiseRejectedResult).reason;
  }
  const byId = new Map<
    string,
    {
      placeId: string;
      name: string;
      latitude: number;
      longitude: number;
      rank: number;
      distance: number;
    }
  >();
  for (const { value } of fulfilled) {
    for (const result of value) {
      const location = result.geometry?.location;
      const types = result.types ?? [];
      if (
        !result.place_id ||
        typeof location?.lat !== "number" ||
        typeof location.lng !== "number"
      ) {
        continue;
      }
      const isNeighborhood = types.some((type) =>
        NEIGHBORHOOD_TYPES.includes(type),
      );
      if (!isNeighborhood && !types.includes("locality")) continue;
      const component =
        result.address_components?.find((item) =>
          (item.types ?? []).some((type) => types.includes(type)),
        ) ?? result.address_components?.[0];
      const name = (
        component?.long_name ?? result.formatted_address?.split(",")[0]
      )?.trim();
      if (!name) continue;
      const distance = distanceKm(
        latitude,
        longitude,
        location.lat,
        location.lng,
      );
      if (distance > radiusKm) continue;
      if (!byId.has(result.place_id)) {
        byId.set(result.place_id, {
          placeId: result.place_id,
          name,
          latitude: location.lat,
          longitude: location.lng,
          rank: isNeighborhood ? 0 : 1,
          distance,
        });
      }
    }
  }
  return [...byId.values()]
    .sort((a, b) => a.rank - b.rank || a.distance - b.distance)
    .slice(0, 20)
    .map(({ placeId, name, latitude: lat, longitude: lng }) => ({
      placeId,
      name,
      latitude: lat,
      longitude: lng,
    }));
}

async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string> {
  const results = await googleGeocode({ latlng: `${latitude},${longitude}` });
  const address = results[0]?.formatted_address;
  if (!address) {
    throw new AppError(
      "LOCATION_NOT_RESOLVED",
      "The selected coordinates did not resolve to a real address.",
      422,
    );
  }
  return address;
}

async function forwardGeocode(address: string) {
  const results = await googleGeocode({ address });
  const first = results[0];
  const location = first?.geometry?.location;
  if (
    !first?.formatted_address ||
    typeof location?.lat !== "number" ||
    typeof location.lng !== "number"
  ) {
    throw new AppError(
      "LOCATION_NOT_RESOLVED",
      "No address matched that search. Try a more specific address.",
      404,
    );
  }
  return {
    address: first.formatted_address,
    latitude: location.lat,
    longitude: location.lng,
  };
}

// A manually typed area is a label the owner controls. Try to pin it near the
// headquarters; if Google cannot, fall back to the headquarters coordinates.
async function locateCustomArea(
  name: string,
  latitude: number,
  longitude: number,
  radiusKm: number,
) {
  try {
    const sw = offsetPoint(latitude, longitude, radiusKm * 1.5, 225);
    const ne = offsetPoint(latitude, longitude, radiusKm * 1.5, 45);
    const results = await googleGeocode({
      address: name,
      bounds: `${sw.latitude},${sw.longitude}|${ne.latitude},${ne.longitude}`,
    });
    const location = results[0]?.geometry?.location;
    if (
      typeof location?.lat === "number" &&
      typeof location.lng === "number" &&
      distanceKm(latitude, longitude, location.lat, location.lng) <=
        radiusKm * 1.5
    ) {
      return { latitude: location.lat, longitude: location.lng };
    }
  } catch {
    // Fall through to the headquarters coordinates.
  }
  return { latitude, longitude };
}

router.get("/", async (request, response) => {
  const company = await prisma.company.findFirst({
    where: {
      id: companyIdFromRequest(request),
      memberships: {
        some: { userId: request.auth!.userId, status: "ACTIVE", role: "OWNER" },
      },
    },
    select: companySelect(),
  });
  if (!company)
    throw new AppError("TENANT_ACCESS_DENIED", "Company access denied", 403);
  response.status(200).json({ data: company });
});

const logoMimeSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
router.post("/logo/presign", async (request, response) => {
  const parsed = logoMimeSchema.safeParse(request.body);
  if (!parsed.success) failValidation(parsed.error);
  const upload = await createCompanyLogoUploadUrl(
    companyIdFromRequest(request),
    parsed.data.mimeType,
  );
  response.status(201).json({ data: upload });
});

router.post("/logo", async (request, response) => {
  const parsed = z
    .object({
      objectKey: z.string().trim().min(1).max(500),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      sizeBytes: z.number().int().positive().max(5_000_000),
    })
    .safeParse(request.body);
  if (!parsed.success) failValidation(parsed.error);
  const companyId = companyIdFromRequest(request);
  await verifyCompanyLogoUpload(
    parsed.data.objectKey,
    companyId,
    parsed.data.mimeType,
  );
  const company = await prisma.company.update({
    where: { id: companyId },
    data: { logoObjectKey: parsed.data.objectKey },
    select: { id: true, logoObjectKey: true },
  });
  response.status(200).json({ data: company });
});

router.get("/logo", async (request, response) => {
  const company = await prisma.company.findUnique({
    where: { id: companyIdFromRequest(request) },
    select: { logoObjectKey: true },
  });
  if (!company)
    throw new AppError("TENANT_ACCESS_DENIED", "Company access denied", 403);
  const logoUrl = company.logoObjectKey
    ? await createCompanyLogoReadUrl(
        companyIdFromRequest(request),
        company.logoObjectKey,
      )
    : null;
  response.status(200).json({ data: { logoUrl } });
});

router.patch("/business", async (request, response) => {
  const parsed = businessSchema.safeParse(request.body);
  if (!parsed.success) failValidation(parsed.error);
  const company = await prisma.company.update({
    where: { id: companyIdFromRequest(request) },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      taxId: parsed.data.taxId?.trim() || null,
      defaultCurrency: parsed.data.defaultCurrency,
      onboardingStep: 2,
    },
    select: companySelect(),
  });
  response.status(200).json({ data: company });
});

router.get("/zones", mapsProviderRateLimiter, async (request, response) => {
  const parsed = coordinatesSchema
    .extend({ radiusKm: radiusSchema })
    .safeParse(request.query);
  if (!parsed.success) failValidation(parsed.error);
  const zones = await discoverNeighborhoods(
    parsed.data.latitude,
    parsed.data.longitude,
    parsed.data.radiusKm,
  );
  response.status(200).json({ data: zones });
});

router.get("/geocode", mapsProviderRateLimiter, async (request, response) => {
  const parsed = z
    .object({ address: z.string().trim().min(4).max(200) })
    .safeParse(request.query);
  if (!parsed.success) failValidation(parsed.error);
  response
    .status(200)
    .json({ data: await forwardGeocode(parsed.data.address) });
});

router.get(
  "/reverse-geocode",
  mapsProviderRateLimiter,
  async (request, response) => {
    const parsed = z
      .object({
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
      })
      .safeParse(request.query);
    if (!parsed.success) failValidation(parsed.error);
    const address = await reverseGeocode(
      parsed.data.latitude,
      parsed.data.longitude,
    );
    response.status(200).json({ data: { address, ...parsed.data } });
  },
);

router.patch(
  "/service-area",
  mapsProviderRateLimiter,
  async (request, response) => {
    const parsed = areaSchema.safeParse(request.body);
    if (!parsed.success) failValidation(parsed.error);
    const uniqueIds = [...new Set(parsed.data.zonePlaceIds)];
    if (uniqueIds.length !== parsed.data.zonePlaceIds.length) {
      throw new AppError(
        "VALIDATION_FAILED",
        "Duplicate service zones are not allowed",
        422,
      );
    }
    const [resolvedAddress, nearbyPlaces] = await Promise.all([
      reverseGeocode(parsed.data.latitude, parsed.data.longitude),
      uniqueIds.length > 0
        ? discoverNeighborhoods(
            parsed.data.latitude,
            parsed.data.longitude,
            parsed.data.radiusKm,
          )
        : Promise.resolve([]),
    ]);
    const byId = new Map(nearbyPlaces.map((zone) => [zone.placeId, zone]));
    const verified = uniqueIds.map((id) => byId.get(id));
    if (verified.some((zone) => !zone)) {
      throw new AppError(
        "SERVICE_ZONE_INVALID",
        "One or more selected zones are no longer available at this location and radius. Reload zones and select again.",
        422,
      );
    }
    const customByKey = new Map<string, string>();
    for (const rawName of parsed.data.customZones) {
      const name = rawName.replace(/\s+/g, " ").trim();
      const key = name
        .toLocaleLowerCase("en-US")
        .replace(/\s/g, "-")
        .slice(0, 60);
      if (!customByKey.has(key)) customByKey.set(key, name);
    }
    const customZones = await Promise.all(
      [...customByKey.entries()].map(async ([key, name]) => ({
        placeId: `custom:${key}`,
        name,
        ...(await locateCustomArea(
          name,
          parsed.data.latitude,
          parsed.data.longitude,
          parsed.data.radiusKm,
        )),
      })),
    );
    const selected = [
      ...verified.flatMap((zone) => (zone ? [zone] : [])),
      ...customZones,
    ];
    const companyId = companyIdFromRequest(request);
    await prisma.$transaction(async (tx) => {
      await tx.companyServiceZone.deleteMany({ where: { companyId } });
      await tx.companyServiceZone.createMany({
        data: selected.map((zone) => ({
          companyId,
          providerPlaceId: zone.placeId,
          name: zone.name,
          latitude: zone.latitude,
          longitude: zone.longitude,
          isActive: true,
        })),
      });
      await tx.company.update({
        where: { id: companyId },
        data: {
          headquartersAddress: resolvedAddress,
          headquartersLatitude: parsed.data.latitude,
          headquartersLongitude: parsed.data.longitude,
          serviceRadiusKm: parsed.data.radiusKm,
          onboardingStep: 3,
        },
      });
    });
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: companySelect(),
    });
    response.status(200).json({ data: company });
  },
);

router.put("/services", async (request, response) => {
  const parsed = serviceSchema.safeParse(request.body);
  if (!parsed.success) failValidation(parsed.error);
  const prepared = parsed.data.services.map((service) => {
    const normalizedName = service.name.trim().toLocaleLowerCase("en-US");
    if (service.isCustom) {
      if (service.serviceKey != null || !customIconKeys.has(service.iconKey)) {
        throw new AppError(
          "SERVICE_INVALID",
          "Custom service has an invalid identifier or icon",
          422,
        );
      }
      return {
        name: service.name.trim(),
        normalizedName,
        iconKey: service.iconKey,
        isCustom: true,
        serviceKey: null,
      };
    }
    const catalogue = service.serviceKey
      ? builtInServices[service.serviceKey as keyof typeof builtInServices]
      : null;
    if (
      !catalogue ||
      catalogue.name !== service.name.trim() ||
      catalogue.iconKey !== service.iconKey
    ) {
      throw new AppError(
        "SERVICE_INVALID",
        "Selected catalogue service is invalid",
        422,
      );
    }
    return {
      name: catalogue.name,
      normalizedName: catalogue.name.toLocaleLowerCase("en-US"),
      iconKey: catalogue.iconKey,
      isCustom: false,
      serviceKey: service.serviceKey!,
    };
  });
  if (
    new Set(prepared.map((item) => item.normalizedName)).size !==
    prepared.length
  ) {
    throw new AppError(
      "SERVICE_DUPLICATE",
      "Service names must be unique, ignoring letter case",
      422,
    );
  }
  const companyId = companyIdFromRequest(request);
  await prisma.$transaction(async (tx) => {
    await tx.companyService.deleteMany({ where: { companyId } });
    await tx.companyService.createMany({
      data: prepared.map((service) => ({ companyId, ...service })),
    });
    await tx.company.update({
      where: { id: companyId },
      data: { onboardingStep: 4 },
    });
  });
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: companySelect(),
  });
  response.status(200).json({ data: company });
});

router.post("/complete", async (request, response) => {
  const companyId = companyIdFromRequest(request);
  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      memberships: {
        some: { userId: request.auth!.userId, status: "ACTIVE", role: "OWNER" },
      },
    },
    select: {
      name: true,
      phone: true,
      headquartersAddress: true,
      headquartersLatitude: true,
      headquartersLongitude: true,
      serviceRadiusKm: true,
      services: { select: { id: true } },
      serviceZones: { where: { isActive: true }, select: { id: true } },
    },
  });
  if (!company)
    throw new AppError("TENANT_ACCESS_DENIED", "Company access denied", 403);
  if (
    !company.name.trim() ||
    !company.phone ||
    !company.headquartersAddress ||
    company.headquartersLatitude == null ||
    company.headquartersLongitude == null ||
    company.serviceRadiusKm == null ||
    company.services.length === 0 ||
    company.serviceZones.length === 0
  ) {
    throw new AppError(
      "ONBOARDING_INCOMPLETE",
      "Complete the company profile, resolved service area with at least one zone, and select at least one service before finishing setup.",
      422,
    );
  }
  await prisma.company.update({
    where: { id: companyId },
    data: { onboardingCompletedAt: new Date(), onboardingStep: 4 },
  });
  const updated = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: companySelect(),
  });
  response.status(200).json({ data: updated });
});

export { router as onboardingRouter };
