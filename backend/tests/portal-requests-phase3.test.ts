/**
 * Phase 3 — Portal request intake, media and conversation tests.
 *
 * REQUESTS_ENABLED / WORKSPACE_PORTAL_ENABLED / PORTAL_REQUESTS_ENABLED must
 * be set BEFORE any src module is imported (env.ts parses once at load).
 * Supabase Storage is mocked and fetch is stubbed for the HEAD verification,
 * matching photo-upload-security.test.ts — no real storage is touched.
 */
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.REQUESTS_ENABLED = "true";
process.env.WORKSPACE_PORTAL_ENABLED = "true";
process.env.PORTAL_REQUESTS_ENABLED = "true";

const storageBehavior = {
  head: {
    ok: true,
    contentLength: "1024",
    contentType: "image/jpeg",
  } as { ok: boolean; contentLength: string; contentType: string },
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: async (objectKey: string) => ({
          data: {
            signedUrl: "https://storage.test/upload",
            path: objectKey,
          },
          error: null,
        }),
        createSignedUrl: async () => ({
          data: { signedUrl: "https://storage.test/signed-object" },
          error: null,
        }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  }),
}));

type App = ReturnType<(typeof import("../src/app.js"))["buildApp"]>;
type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];
type HashPassword =
  (typeof import("../src/common/auth/password.js"))["hashPassword"];
type CreateAccessToken =
  (typeof import("../src/common/auth/tokens.js"))["createAccessToken"];
type HashRefreshToken =
  (typeof import("../src/common/auth/tokens.js"))["hashRefreshToken"];
type GenerateToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["generateToken"];
type HashToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["hashToken"];

let app: App;
let prisma: PrismaClient;
let hashPassword: HashPassword;
let createAccessToken: CreateAccessToken;
let hashRefreshToken: HashRefreshToken;
let generateToken: GenerateToken;
let hashToken: HashToken;

beforeAll(async () => {
  app = (await import("../src/app.js")).buildApp();
  prisma = (await import("../src/db/prisma.js")).prisma;
  hashPassword = (await import("../src/common/auth/password.js")).hashPassword;
  const tokens = await import("../src/common/auth/tokens.js");
  createAccessToken = tokens.createAccessToken;
  hashRefreshToken = tokens.hashRefreshToken;
  const portalTokens = await import("../src/modules/portal/portal.tokens.js");
  generateToken = portalTokens.generateToken;
  hashToken = portalTokens.hashToken;
}, 60000);

function suffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

interface Fixture {
  companyId: string;
  owner: { Authorization: string; userId: string };
  customerId: string;
  customer2Id: string;
  addressId: string;
  address2Id: string;
}

async function createOwnerAuth(companyId: string, label: string) {
  const user = await prisma.user.create({
    data: {
      email: `owner-${label}-${suffix()}@example.com`,
      passwordHash: await hashPassword("TestPassword123!"),
      firstName: "Olivia",
      lastName: "Owner",
      phone: `+1555${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`,
    },
  });
  await prisma.companyMember.create({
    data: { companyId, userId: user.id, role: "OWNER", status: "ACTIVE" },
  });
  const sessionId = crypto.randomUUID();
  await prisma.refreshSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      companyId,
      tokenHash: hashRefreshToken(crypto.randomUUID()),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  const accessToken = await createAccessToken({
    userId: user.id,
    sessionId,
    companyId,
    role: "OWNER",
  });
  return { Authorization: `Bearer ${accessToken}`, userId: user.id };
}

async function seedCompany(label: string): Promise<Fixture> {
  const company = await prisma.company.create({
    data: {
      name: `P3 ${label}`,
      slug: `p3-${label}-${suffix()}`,
      phone: "+15559998888",
    },
  });
  const owner = await createOwnerAuth(company.id, label);
  const customer = await prisma.customer.create({
    data: {
      companyId: company.id,
      firstName: "Casey",
      lastName: "Customer",
      email: `casey-${label}-${suffix()}@example.com`,
      phone: "+15551234567",
    },
  });
  const customer2 = await prisma.customer.create({
    data: {
      companyId: company.id,
      firstName: "Dana",
      lastName: "Second",
      email: `dana-${label}-${suffix()}@example.com`,
      phone: "+15557654321",
    },
  });
  const address = await prisma.serviceAddress.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      label: "Home",
      line1: "1 Main St",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      countryCode: "US",
    },
  });
  const address2 = await prisma.serviceAddress.create({
    data: {
      companyId: company.id,
      customerId: customer2.id,
      label: "Office",
      line1: "9 Other Ave",
      city: "Austin",
      region: "TX",
      postalCode: "78702",
      countryCode: "US",
    },
  });
  return {
    companyId: company.id,
    owner,
    customerId: customer.id,
    customer2Id: customer2.id,
    addressId: address.id,
    address2Id: address2.id,
  };
}

async function workspaceSession(fx: Fixture, customerId: string) {
  const grant = await prisma.portalAccessGrant.create({
    data: {
      companyId: fx.companyId,
      customerId,
      scope: "WORKSPACE",
      issuedBy: fx.owner.userId,
      linkTokenHash: hashToken(generateToken()),
      linkExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      linkConsumedAt: new Date(),
      status: "ACTIVE",
    },
  });
  const sessionToken = generateToken();
  await prisma.portalSession.create({
    data: {
      grantId: grant.id,
      companyId: fx.companyId,
      customerId,
      scope: "WORKSPACE",
      sessionTokenHash: hashToken(sessionToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      lastSeenAt: new Date(),
    },
  });
  return {
    Authorization: `Bearer ${sessionToken}`,
    "X-Aera-Portal": "1",
  };
}

const portalHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "X-Aera-Portal": "1",
});

async function sessionTokenFor(fx: Fixture, customerId: string) {
  const headers = await workspaceSession(fx, customerId);
  return headers.Authorization.replace("Bearer ", "");
}

function submitBody(fx: Fixture) {
  return {
    serviceAddressId: fx.addressId,
    title: "Leaking faucet",
    description: "Kitchen faucet drips constantly",
    serviceCategory: "PLUMBING",
    equipmentInfo: "Moen single-handle faucet, installed 2019",
  };
}

let fx: Fixture;
let sessionA: string;
let sessionB: string;

beforeEach(async () => {
  await prisma.$transaction([
    prisma.portalSession.deleteMany(),
    prisma.portalAccessGrant.deleteMany(),
    prisma.portalAuditEvent.deleteMany(),
    prisma.serviceRequestMessage.deleteMany(),
    prisma.serviceRequestAttachment.deleteMany(),
    prisma.serviceRequestUpload.deleteMany(),
    prisma.serviceRequestEvent.deleteMany(),
    prisma.quoteApprovalEvent.deleteMany(),
    prisma.quoteItem.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.jobStatusHistory.deleteMany(),
    prisma.job.deleteMany(),
    prisma.serviceRequest.deleteMany(),
    prisma.serviceAddress.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.refreshSession.deleteMany(),
    prisma.companyMember.deleteMany(),
    prisma.user.deleteMany(),
    prisma.company.deleteMany(),
  ]);
  fx = await seedCompany("a");
  sessionA = await sessionTokenFor(fx, fx.customerId);
  sessionB = await sessionTokenFor(fx, fx.customer2Id);
  storageBehavior.head = {
    ok: true,
    contentLength: "1024",
    contentType: "image/jpeg",
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("portal request submission (3.3)", () => {
  it("creates a WEB_PORTAL request scoped to the session customer", async () => {
    const res = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionA))
      .set("Idempotency-Key", `key-${suffix()}`)
      .send(submitBody(fx));
    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe("WEB_PORTAL");
    expect(res.body.data.status).toBe("SUBMITTED");
    expect(res.body.data.customerId).toBe(fx.customerId);
    expect(res.body.data.equipmentInfo).toContain("Moen");
  });

  it("dedupes on Idempotency-Key: a double tap creates exactly one request", async () => {
    const key = `dup-${suffix()}`;
    const first = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionA))
      .set("Idempotency-Key", key)
      .send(submitBody(fx));
    const second = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionA))
      .set("Idempotency-Key", key)
      .send(submitBody(fx));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    const count = await prisma.serviceRequest.count({
      where: { customerId: fx.customerId },
    });
    expect(count).toBe(1);
  });

  it("still accepts submissionKey in the body for older clients", async () => {
    const res = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionA))
      .send({ ...submitBody(fx), submissionKey: `body-${suffix()}` });
    expect(res.status).toBe(201);
  });

  it("rejects a submission with no idempotency key", async () => {
    const res = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionA))
      .send(submitBody(fx));
    expect(res.status).toBe(422);
  });

  it("creates a new customer-owned address via newAddress", async () => {
    const res = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionA))
      .set("Idempotency-Key", `addr-${suffix()}`)
      .send({
        title: "New site",
        description: "Different property",
        serviceCategory: "HVAC",
        newAddress: {
          label: "Rental",
          line1: "42 Pine Rd",
          city: "Dallas",
          region: "TX",
          postalCode: "75201",
          countryCode: "us",
        },
      });
    expect(res.status).toBe(201);
    const address = await prisma.serviceAddress.findUnique({
      where: { id: res.body.data.serviceAddressId },
    });
    expect(address?.customerId).toBe(fx.customerId);
    expect(address?.countryCode).toBe("US");
  });

  it("rejects another customer's address (cross-customer IDOR)", async () => {
    const res = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionA))
      .set("Idempotency-Key", `idor-${suffix()}`)
      .send({ ...submitBody(fx), serviceAddressId: fx.address2Id });
    expect(res.status).toBe(422);
  });

  it("enforces the daily per-customer submission cap", async () => {
    for (let i = 0; i < 10; i += 1) {
      await prisma.serviceRequest.create({
        data: {
          companyId: fx.companyId,
          customerId: fx.customerId,
          serviceAddressId: fx.addressId,
          requestNumber: 5000 + i,
          title: `Bulk ${i}`,
          description: "x",
          serviceCategory: "HVAC",
          source: "WEB_PORTAL",
          status: "SUBMITTED",
        },
      });
    }
    const res = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionA))
      .set("Idempotency-Key", `cap-${suffix()}`)
      .send(submitBody(fx));
    expect(res.status).toBe(429);
  });

  it("hides another customer's request behind a 404", async () => {
    const other = await prisma.serviceRequest.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customer2Id,
        serviceAddressId: fx.address2Id,
        requestNumber: 6000,
        title: "Other customer",
        description: "x",
        serviceCategory: "HVAC",
        source: "WEB_PORTAL",
        status: "SUBMITTED",
      },
    });
    const res = await request(app)
      .get(`/api/v1/portal/requests/${other.id}`)
      .set(portalHeaders(sessionA));
    expect(res.status).toBe(404);
  });
});

describe("request conversation (3.4)", () => {
  async function createRequest() {
    const res = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionA))
      .set("Idempotency-Key", `conv-${suffix()}`)
      .send(submitBody(fx));
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  it("staff request-information + customer reply move status atomically", async () => {
    const requestId = await createRequest();

    const ask = await request(app)
      .post(`/api/v1/service-requests/${requestId}/request-information`)
      .set(fx.owner)
      .send({ body: "What brand is the faucet?" });
    expect(ask.status).toBe(200);
    let row = await prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });
    expect(row?.status).toBe("NEEDS_INFO");

    const reply = await request(app)
      .post(`/api/v1/portal/requests/${requestId}/messages`)
      .set(portalHeaders(sessionA))
      .send({ body: "It is a Moen faucet" });
    expect(reply.status).toBe(201);
    row = await prisma.serviceRequest.findUnique({
      where: { id: requestId },
    });
    expect(row?.status).toBe("SUBMITTED");

    const messages = await prisma.serviceRequestMessage.findMany({
      where: { requestId },
      orderBy: { createdAt: "asc" },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].authorType).toBe("STAFF");
    expect(messages[1].authorType).toBe("CUSTOMER");
  });

  it("customer cannot message another customer's request (404)", async () => {
    const other = await prisma.serviceRequest.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customer2Id,
        serviceAddressId: fx.address2Id,
        requestNumber: 6100,
        title: "Other",
        description: "x",
        serviceCategory: "HVAC",
        source: "WEB_PORTAL",
        status: "NEEDS_INFO",
      },
    });
    const res = await request(app)
      .post(`/api/v1/portal/requests/${other.id}/messages`)
      .set(portalHeaders(sessionA))
      .send({ body: "hello" });
    expect(res.status).toBe(404);
  });
});

describe("request media pipeline (3.2)", () => {
  async function createRequestWithMedia() {
    const created = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionA))
      .set("Idempotency-Key", `media-${suffix()}`)
      .send(submitBody(fx));
    expect(created.status).toBe(201);
    const requestId = created.body.data.id as string;
    const presign = await request(app)
      .post(`/api/v1/portal/requests/${requestId}/media/presign`)
      .set(portalHeaders(sessionA))
      .send({ mimeType: "image/jpeg" });
    expect(presign.status).toBe(201);
    return { requestId, objectKey: presign.body.data.objectKey as string };
  }

  function stubHead() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: storageBehavior.head.ok,
        status: storageBehavior.head.ok ? 200 : 404,
        headers: {
          get: (name: string) =>
            name === "content-length"
              ? storageBehavior.head.contentLength
              : name === "content-type"
                ? storageBehavior.head.contentType
                : null,
        },
      })),
    );
  }

  it("presign → confirm → list round-trips a verified attachment", async () => {
    stubHead();
    const { requestId, objectKey } = await createRequestWithMedia();
    const confirm = await request(app)
      .post(`/api/v1/portal/requests/${requestId}/media`)
      .set(portalHeaders(sessionA))
      .send({ objectKey, mimeType: "image/jpeg", caption: "Leak close-up" });
    expect(confirm.status).toBe(201);
    expect(confirm.body.data.caption).toBe("Leak close-up");

    const list = await request(app)
      .get(`/api/v1/portal/requests/${requestId}/media`)
      .set(portalHeaders(sessionA));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].signedReadUrl).toContain("storage.test");
  });

  it("rejects replayed confirmation", async () => {
    stubHead();
    const { requestId, objectKey } = await createRequestWithMedia();
    const body = { objectKey, mimeType: "image/jpeg" };
    const first = await request(app)
      .post(`/api/v1/portal/requests/${requestId}/media`)
      .set(portalHeaders(sessionA))
      .send(body);
    expect(first.status).toBe(201);
    const replay = await request(app)
      .post(`/api/v1/portal/requests/${requestId}/media`)
      .set(portalHeaders(sessionA))
      .send(body);
    expect(replay.status).toBe(409);
  });

  it("rejects confirmation after presign expiry", async () => {
    stubHead();
    const { requestId, objectKey } = await createRequestWithMedia();
    await prisma.serviceRequestUpload.update({
      where: { objectKey },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await request(app)
      .post(`/api/v1/portal/requests/${requestId}/media`)
      .set(portalHeaders(sessionA))
      .send({ objectKey, mimeType: "image/jpeg" });
    expect(res.status).toBe(410);
  });

  it("rejects a stored object whose real MIME differs", async () => {
    storageBehavior.head.contentType = "application/x-msdownload";
    stubHead();
    const { requestId, objectKey } = await createRequestWithMedia();
    const res = await request(app)
      .post(`/api/v1/portal/requests/${requestId}/media`)
      .set(portalHeaders(sessionA))
      .send({ objectKey, mimeType: "image/jpeg" });
    expect(res.status).toBe(422);
  });

  it("rejects an oversize stored object measured by HEAD", async () => {
    storageBehavior.head.contentLength = "99999999";
    stubHead();
    const { requestId, objectKey } = await createRequestWithMedia();
    const res = await request(app)
      .post(`/api/v1/portal/requests/${requestId}/media`)
      .set(portalHeaders(sessionA))
      .send({ objectKey, mimeType: "image/jpeg" });
    expect(res.status).toBe(422);
  });

  it("hides another customer's request media behind a 404", async () => {
    stubHead();
    const created = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionB))
      .set("Idempotency-Key", `media2-${suffix()}`)
      .send({
        serviceAddressId: fx.address2Id,
        title: "Other media",
        description: "x",
        serviceCategory: "HVAC",
      });
    const requestId = created.body.data.id as string;
    const presign = await request(app)
      .post(`/api/v1/portal/requests/${requestId}/media/presign`)
      .set(portalHeaders(sessionB))
      .send({ mimeType: "image/jpeg" });
    const objectKey = presign.body.data.objectKey as string;

    const res = await request(app)
      .post(`/api/v1/portal/requests/${requestId}/media`)
      .set(portalHeaders(sessionA))
      .send({ objectKey, mimeType: "image/jpeg" });
    expect(res.status).toBe(404);
  });
});

describe("request upload sweeper (3.2)", () => {
  it("deletes expired unconfirmed uploads and keeps referenced ones", async () => {
    const { sweepExpiredRequestUploads } = await import(
      "../src/modules/requests/request.media.js"
    );
    const created = await request(app)
      .post("/api/v1/portal/requests")
      .set(portalHeaders(sessionA))
      .set("Idempotency-Key", `sweep-${suffix()}`)
      .send(submitBody(fx));
    const requestId = created.body.data.id as string;

    const stale = await prisma.serviceRequestUpload.create({
      data: {
        companyId: fx.companyId,
        requestId,
        uploaderType: "PORTAL",
        portalSessionId: (
          await prisma.portalSession.findFirst({
            where: { customerId: fx.customerId },
          })
        )!.id,
        objectKey: `companies/${fx.companyId}/requests/${requestId}/stale.jpg`,
        mimeType: "image/jpeg",
        expiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    });
    const fresh = await prisma.serviceRequestUpload.create({
      data: {
        companyId: fx.companyId,
        requestId,
        uploaderType: "PORTAL",
        portalSessionId: stale.portalSessionId,
        objectKey: `companies/${fx.companyId}/requests/${requestId}/fresh.jpg`,
        mimeType: "image/jpeg",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const swept = await sweepExpiredRequestUploads();
    expect(swept).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.serviceRequestUpload.findUnique({
        where: { id: stale.id },
      }),
    ).toBeNull();
    expect(
      await prisma.serviceRequestUpload.findUnique({
        where: { id: fresh.id },
      }),
    ).not.toBeNull();
  });
});
