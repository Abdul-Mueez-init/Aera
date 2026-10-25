/**
 * Portal transport & hardening tests (remediation R-21).
 *
 * This file deliberately runs with NODE_ENV=development and a real
 * CORS_ORIGINS allowlist (set below, BEFORE any src module is imported)
 * because the production-shaped behaviors under test — the CSRF Origin
 * check, credentialed CORS, and the rate limiters — are bypassed under
 * the default test environment (limiters skip under NODE_ENV=test and
 * the Origin check only applies when CORS_ORIGINS is configured).
 */
import { Writable } from "node:stream";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.NODE_ENV = "development";
process.env.CORS_ORIGINS = "https://portal.quantixlabs.live";

type App = ReturnType<(typeof import("../src/app.js"))["buildApp"]>;

let app: App;
let prisma: (typeof import("../src/db/prisma.js"))["prisma"];
let generateToken: (typeof import("../src/modules/portal/portal.tokens.js"))["generateToken"];
let hashToken: (typeof import("../src/modules/portal/portal.tokens.js"))["hashToken"];
let logger: (typeof import("../src/common/logger.js"))["logger"];

const PORTAL_ORIGIN = "https://portal.quantixlabs.live";
const EVIL_ORIGIN = "https://evil.example";

beforeAll(async () => {
  const appModule = await import("../src/app.js");
  app = appModule.buildApp();
  prisma = (await import("../src/db/prisma.js")).prisma;
  const tokens = await import("../src/modules/portal/portal.tokens.js");
  generateToken = tokens.generateToken;
  hashToken = tokens.hashToken;
  logger = (await import("../src/common/logger.js")).logger;
});

// Full wipe, not a hand-ordered deleteMany list: other suites share this
// database and may leave quotes/invoices/etc. behind, and a partial list
// breaks on their FK constraints depending on file execution order.
async function wipeAllTables() {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const names = rows.map((row) => `"${row.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  await wipeAllTables();
});

async function seedGrant() {
  const company = await prisma.company.create({
    data: {
      name: "Transport Co",
      slug: `transport-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      phone: "+15550001111",
    },
  });
  const customer = await prisma.customer.create({
    data: {
      companyId: company.id,
      firstName: "Tess",
      lastName: "Transport",
      email: "tess@example.com",
      phone: "+15550003333",
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
      postalCode: "73301",
      countryCode: "US",
    },
  });
  const job = await prisma.job.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      serviceAddressId: address.id,
      jobNumber: 55,
      serviceType: "REPAIR",
      problemDescription: "Transport test job",
      status: "NEW",
      handshakeVersion: 1,
    },
  });
  const linkToken = generateToken();
  const grant = await prisma.portalAccessGrant.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      jobId: job.id,
      linkTokenHash: hashToken(linkToken),
      linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "ACTIVE",
    },
  });
  return { company, customer, job, grant, linkToken };
}

describe("Portal transport (origin, CORS, rate limits, logs)", () => {
  it("bad Origin is rejected", async () => {
    const { grant, linkToken } = await seedGrant();

    const response = await request(app)
      .post("/api/v1/portal/exchange")
      .set("X-Aera-Portal", "1")
      .set("Origin", EVIL_ORIGIN)
      .send({ token: linkToken })
      .expect(403);

    expect(response.body.error.code).toBe("CSRF_ORIGIN_INVALID");

    // The rejected attempt must not burn the link.
    const after = await prisma.portalAccessGrant.findFirst({
      where: { id: grant.id },
    });
    expect(after?.linkConsumedAt).toBeNull();

    // The allowlisted portal origin passes the same guard.
    await request(app)
      .post("/api/v1/portal/exchange")
      .set("X-Aera-Portal", "1")
      .set("Origin", PORTAL_ORIGIN)
      .send({ token: linkToken })
      .expect(200);
  });

  it("CORS allows the portal origin with credentials and not others", async () => {
    const allowed = await request(app)
      .get("/api/v1/portal/session")
      .set("Origin", PORTAL_ORIGIN);
    expect(allowed.headers["access-control-allow-origin"]).toBe(PORTAL_ORIGIN);
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const other = await request(app)
      .get("/api/v1/portal/session")
      .set("Origin", EVIL_ORIGIN);
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("logs never contain tokens", async () => {
    const { linkToken } = await seedGrant();

    const pino = (await import("pino")).default;
    const streamSym = (pino as unknown as { symbols: { streamSym: symbol } })
      .symbols.streamSym;
    const loggerInternals = logger as unknown as Record<symbol, unknown>;
    const originalStream = loggerInternals[streamSym];

    const chunks: string[] = [];
    const capture = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      },
    });
    loggerInternals[streamSym] = capture;
    let sessionCookie = "";
    try {
      const exchange = await request(app)
        .post("/api/v1/portal/exchange")
        .set("X-Aera-Portal", "1")
        .set("Origin", PORTAL_ORIGIN)
        .send({ token: linkToken })
        .expect(200);
      sessionCookie = String(exchange.headers["set-cookie"]?.[0] ?? "");

      await request(app)
        .get("/api/v1/portal/job")
        .set("Cookie", sessionCookie.split(";")[0])
        .expect(200);

      // Give the response-finish logger a tick to flush.
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      loggerInternals[streamSym] = originalStream;
    }

    const output = chunks.join("");
    // Capture actually captured request logs — otherwise the assertions
    // below would be vacuous.
    expect(output).toContain("/api/v1/portal/exchange");
    expect(output).not.toContain(linkToken);
    const sessionToken = sessionCookie.match(/__Host-aera_portal=([^;]+)/)?.[1];
    expect(sessionToken).toBeTruthy();
    expect(output).not.toContain(sessionToken as string);
  });

  it("portal routes are rate limited", async () => {
    const statuses: number[] = [];
    // The exchange limiter allows 20 requests / 15 min per IP; earlier
    // tests in this file consumed a few, so an unknown-token exchange
    // must flip from 401 to 429 well within 30 attempts.
    for (let i = 0; i < 30; i++) {
      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .set("X-Aera-Portal", "1")
        .set("Origin", PORTAL_ORIGIN)
        .send({ token: generateToken() });
      statuses.push(response.status);
      if (response.status === 429) break;
    }
    expect(statuses).toContain(429);
    expect(statuses[statuses.length - 1]).toBe(429);
    expect(statuses.slice(0, -1).every((s) => s === 401)).toBe(true);
  });
});
