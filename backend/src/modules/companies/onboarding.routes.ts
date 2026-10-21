import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import { AppError } from "../../common/errors.js";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import {
  createCompanyLogoReadUrl,
  createCompanyLogoUploadUrl,
  verifyCompanyLogoUpload,
} from "../../common/storage/supabase-storage.adapter.js";
import {
  reverseGeocode,
  forwardGeocode,
  discoverNeighborhoods,
  locateCustomArea,
} from "./osm-geo.service.js";

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
