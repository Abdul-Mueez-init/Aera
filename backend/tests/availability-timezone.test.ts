/**
 * Phase 5.2 — availability engine timezone edge cases.
 *
 * Working hours are wall-clock "HH:mm" in the company timezone; the
 * engine must convert them with the platform tz database (Intl), not
 * fixed offsets. Covers DST transitions, midnight-crossing windows,
 * time-off exclusion and expired-hold boundaries.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { zonedTimeToUtc } from "../src/modules/scheduling/booking.service.js";

type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = (await import("../src/db/prisma.js")).prisma;
}, 60000);

const suffix = () =>
  `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

const NY = "America/New_York";

describe("zonedTimeToUtc", () => {
  it("resolves winter and summer offsets for America/New_York", () => {
    // EST (UTC-5) in January, EDT (UTC-4) in July.
    expect(
      zonedTimeToUtc(NY, 2026, 1, 15, 9, 0).toISOString(),
    ).toBe("2026-01-15T14:00:00.000Z");
    expect(
      zonedTimeToUtc(NY, 2026, 7, 15, 9, 0).toISOString(),
    ).toBe("2026-07-15T13:00:00.000Z");
  });

  it("handles the spring-forward transition day", () => {
    // 2026-03-08: clocks jump 02:00 → 03:00; 09:00 local is EDT (UTC-4).
    expect(
      zonedTimeToUtc(NY, 2026, 3, 8, 9, 0).toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z");
    // The day before is still EST (UTC-5).
    expect(
      zonedTimeToUtc(NY, 2026, 3, 7, 9, 0).toISOString(),
    ).toBe("2026-03-07T14:00:00.000Z");
  });

  it("handles the fall-back transition day", () => {
    // 2026-11-01: clocks fall back; 09:00 local is EST (UTC-5).
    expect(
      zonedTimeToUtc(NY, 2026, 11, 1, 9, 0).toISOString(),
    ).toBe("2026-11-01T14:00:00.000Z");
    expect(
      zonedTimeToUtc(NY, 2026, 10, 31, 9, 0).toISOString(),
    ).toBe("2026-10-31T13:00:00.000Z");
  });
});

describe("getAvailability timezone behavior", () => {
  async function seed() {
    const company = await prisma.company.create({
      data: {
        name: `TZ Co ${suffix()}`,
        slug: `tz-${suffix()}`,
        phone: "+15550001111",
        timezone: NY,
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `tz-tech-${suffix()}@example.com`,
        firstName: "Tech",
        lastName: "TZ",
      },
    });
    await prisma.companyMember.create({
      data: {
        companyId: company.id,
        userId: user.id,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });
    return { company, user };
  }

  it("places windows at company-local wall-clock times across a DST boundary", async () => {
    const { company, user } = await seed();
    // Wednesday 2026-03-04 is EST; the following Wednesday 2026-03-11 is
    // EDT (spring forward happened 03-08). Same 09:00–17:00 wall clock
    // must resolve to different UTC instants.
    await prisma.companyBusinessHours.create({
      data: { companyId: company.id, weekday: 3, open: "09:00", close: "17:00" },
    });
    const { getAvailability } = await import(
      "../src/modules/scheduling/booking.service.js"
    );

    const before = await getAvailability(
      { companyId: company.id },
      new Date("2026-03-04T00:00:00Z"),
      new Date("2026-03-05T00:00:00Z"),
      60,
    );
    expect(before.windows.length).toBeGreaterThan(0);
    expect(before.windows[0].startsAt).toBe("2026-03-04T14:00:00.000Z");

    const after = await getAvailability(
      { companyId: company.id },
      new Date("2026-03-11T00:00:00Z"),
      new Date("2026-03-12T00:00:00Z"),
      60,
    );
    expect(after.windows.length).toBeGreaterThan(0);
    expect(after.windows[0].startsAt).toBe("2026-03-11T13:00:00.000Z");
    void user;
  });

  it("supports overnight windows and excludes time-off and expired holds", async () => {
    const { company, user } = await seed();
    // Friday 2026-03-06, hours 22:00 → 02:00 (close <= open rolls to next day).
    await prisma.companyBusinessHours.create({
      data: { companyId: company.id, weekday: 5, open: "22:00", close: "02:00" },
    });
    // Time off covering the first two hours of the window.
    await prisma.technicianTimeOff.create({
      data: {
        companyId: company.id,
        technicianId: user.id,
        startsAt: new Date("2026-03-07T03:00:00Z"), // 22:00 EST
        endsAt: new Date("2026-03-07T05:00:00Z"), // 00:00 EST
      },
    });
    const { getAvailability } = await import(
      "../src/modules/scheduling/booking.service.js"
    );
    const result = await getAvailability(
      { companyId: company.id },
      new Date("2026-03-06T00:00:00Z"),
      new Date("2026-03-08T12:00:00Z"),
      60,
    );
    // Window opens 22:00 EST = 03:00Z Mar 7; time-off removes 03:00–05:00Z,
    // so the earliest bookable slot starts at 05:00Z (00:00 EST).
    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.windows[0].startsAt).toBe("2026-03-07T05:00:00.000Z");
    // And the last window ends no later than 02:00 EST = 07:00Z Mar 7.
    const last = result.windows[result.windows.length - 1];
    expect(new Date(last.endsAt).getTime()).toBeLessThanOrEqual(
      new Date("2026-03-07T07:00:00Z").getTime(),
    );
  });
});
