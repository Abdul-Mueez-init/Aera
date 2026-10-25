import { AppError } from "../../common/errors.js";
import { prisma } from "../../db/prisma.js";

export interface CustomerFilters {
  companyId: string;
  page: number;
  pageSize: number;
  search?: string;
  includeArchived: boolean;
}

export interface CustomerInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface AddressInput {
  label: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  countryCode: string;
  lat?: number;
  lng?: number;
}

export interface CustomerJobFilters {
  page: number;
  pageSize: number;
}

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function customerData(input: CustomerInput) {
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: cleanOptional(input.email)?.toLowerCase(),
    phone: cleanOptional(input.phone),
    notes: cleanOptional(input.notes),
  };
}

function addressData(input: AddressInput) {
  return {
    label: input.label.trim(),
    line1: input.line1.trim(),
    line2: cleanOptional(input.line2),
    city: input.city.trim(),
    region: cleanOptional(input.region),
    postalCode: cleanOptional(input.postalCode),
    countryCode: input.countryCode.trim().toUpperCase(),
    lat: input.lat,
    lng: input.lng,
  };
}

function customerSelect() {
  return {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    notes: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

function serviceAddressSelect() {
  return {
    id: true,
    label: true,
    line1: true,
    line2: true,
    city: true,
    region: true,
    postalCode: true,
    countryCode: true,
    lat: true,
    lng: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

function customerJobSelect() {
  return {
    id: true,
    jobNumber: true,
    serviceType: true,
    problemDescription: true,
    priority: true,
    status: true,
    scheduledStart: true,
    scheduledEnd: true,
    completedAt: true,
    createdAt: true,
    assignedTechnician: {
      select: { id: true, firstName: true, lastName: true },
    },
  } as const;
}

export async function listCustomers(filters: CustomerFilters) {
  const where = {
    companyId: filters.companyId,
    ...(filters.includeArchived ? {} : { status: "ACTIVE" as const }),
    ...(filters.search
      ? {
          OR: [
            {
              firstName: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
            {
              lastName: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
            {
              email: { contains: filters.search, mode: "insensitive" as const },
            },
            { phone: { contains: filters.search } },
          ],
        }
      : {}),
  };
  const skip = (filters.page - 1) * filters.pageSize;
  const [items, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      select: {
        ...customerSelect(),
        // The list card renders the customer's first address; without
        // this the API omitted serviceAddresses entirely and every row
        // claimed "No address on file".
        serviceAddresses: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: serviceAddressSelect(),
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip,
      take: filters.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    items,
    meta: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      pageCount: Math.ceil(total / filters.pageSize),
    },
  };
}

export async function createCustomer(companyId: string, input: CustomerInput) {
  return prisma.customer.create({
    data: { companyId, ...customerData(input) },
    select: customerSelect(),
  });
}

export async function getCustomer(companyId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { companyId, id: customerId },
    select: {
      ...customerSelect(),
      serviceAddresses: {
        orderBy: { createdAt: "asc" },
        select: serviceAddressSelect(),
      },
    },
  });

  if (!customer) {
    throw new AppError("RESOURCE_NOT_FOUND", "Customer not found", 404);
  }

  return customer;
}

export async function updateCustomer(
  companyId: string,
  customerId: string,
  input: Partial<CustomerInput>,
) {
  const data = Object.fromEntries(
    Object.entries(
      customerData({
        firstName: input.firstName ?? "",
        lastName: input.lastName ?? "",
        email: input.email,
        phone: input.phone,
        notes: input.notes,
      }),
    ).filter(([key, value]) =>
      key === "firstName" || key === "lastName"
        ? value !== ""
        : value !== undefined,
    ),
  );
  const result = await prisma.customer.updateMany({
    where: { companyId, id: customerId, status: "ACTIVE" },
    data,
  });

  if (result.count !== 1) {
    throw new AppError("RESOURCE_NOT_FOUND", "Customer not found", 404);
  }

  return getCustomer(companyId, customerId);
}

export async function archiveCustomer(
  companyId: string,
  customerId: string,
  actorUserId?: string,
) {
  await prisma.$transaction(async (tx) => {
    const result = await tx.customer.updateMany({
      where: { companyId, id: customerId, status: "ACTIVE" },
      data: { status: "ARCHIVED", deletedAt: new Date() },
    });

    if (result.count !== 1) {
      throw new AppError("RESOURCE_NOT_FOUND", "Customer not found", 404);
    }

    // Archiving a customer must end their portal access with it: an
    // ACTIVE grant + live session would otherwise keep working — the
    // archived customer could still view the job, approve quotes and
    // leave a review. Deactivate every ACTIVE grant, revoke its
    // sessions, and audit each deactivation.
    const grants = await tx.portalAccessGrant.findMany({
      where: { companyId, customerId, status: "ACTIVE" },
      select: { id: true, jobId: true },
    });
    for (const grant of grants) {
      await tx.portalAccessGrant.update({
        where: { id: grant.id },
        data: {
          status: "DEACTIVATED",
          deactivatedAt: new Date(),
          deactivatedReason: "MANUAL",
          deactivatedBy: actorUserId ?? null,
        },
      });
      await tx.portalSession.updateMany({
        where: { grantId: grant.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.portalAuditEvent.create({
        data: {
          companyId,
          jobId: grant.jobId,
          customerId,
          grantId: grant.id,
          actorUserId: actorUserId ?? null,
          action: "PORTAL_DEACTIVATED",
          metadata: { reason: "CUSTOMER_ARCHIVED" },
        },
      });
    }
  });
}

export async function createServiceAddress(
  companyId: string,
  customerId: string,
  input: AddressInput,
) {
  const customer = await prisma.customer.findFirst({
    where: { companyId, id: customerId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!customer) {
    throw new AppError("RESOURCE_NOT_FOUND", "Customer not found", 404);
  }

  return prisma.serviceAddress.create({
    data: { companyId, customerId, ...addressData(input) },
  });
}

export async function listCustomerJobs(
  companyId: string,
  customerId: string,
  filters: CustomerJobFilters,
) {
  const customer = await prisma.customer.findFirst({
    where: { companyId, id: customerId },
    select: { id: true },
  });

  if (!customer) {
    throw new AppError("RESOURCE_NOT_FOUND", "Customer not found", 404);
  }

  const where = { companyId, customerId };
  const skip = (filters.page - 1) * filters.pageSize;
  const [items, total] = await prisma.$transaction([
    prisma.job.findMany({
      where,
      select: customerJobSelect(),
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: filters.pageSize,
    }),
    prisma.job.count({ where }),
  ]);

  return {
    items,
    meta: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      pageCount: Math.ceil(total / filters.pageSize),
    },
  };
}
