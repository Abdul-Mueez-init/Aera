import { describe, expect, it } from "vitest";
import { computeWindows } from "../src/modules/scheduling/availability.engine.js";

const instant = (hour: number) =>
  new Date(`2026-11-04T${String(hour).padStart(2, "0")}:00:00.000Z`);

describe("computeWindows", () => {
  it("returns capacity for eligible technicians and removes busy windows", () => {
    const windows = computeWindows({
      range: { startsAt: instant(9), endsAt: instant(13) },
      durationMinutes: 60,
      stepMinutes: 60,
      bufferMinutes: 0,
      technicians: [
        {
          id: "one",
          intervals: [{ startsAt: instant(9), endsAt: instant(13) }],
          serviceIds: ["ac"],
        },
        {
          id: "two",
          intervals: [{ startsAt: instant(9), endsAt: instant(13) }],
          serviceIds: ["ac"],
        },
      ],
      serviceId: "ac",
      existingJobs: [
        { technicianId: "one", startsAt: instant(10), endsAt: instant(11) },
      ],
      holds: [],
    });

    expect(
      windows.map(({ startsAt, capacity }) => [
        startsAt.toISOString(),
        capacity,
      ]),
    ).toEqual([
      [instant(9).toISOString(), 2],
      [instant(10).toISOString(), 1],
      [instant(11).toISOString(), 2],
      [instant(12).toISOString(), 2],
    ]);
  });

  it("applies travel buffers to adjacent work", () => {
    const windows = computeWindows({
      range: { startsAt: instant(9), endsAt: instant(14) },
      durationMinutes: 60,
      stepMinutes: 60,
      bufferMinutes: 30,
      technicians: [
        {
          id: "one",
          intervals: [{ startsAt: instant(9), endsAt: instant(14) }],
        },
      ],
      existingJobs: [
        { technicianId: "one", startsAt: instant(10), endsAt: instant(11) },
      ],
      holds: [],
    });

    expect(windows.map((window) => window.startsAt.toISOString())).toEqual([
      instant(12).toISOString(),
      instant(13).toISOString(),
    ]);
  });

  it("returns no capacity for unsupported services", () => {
    expect(
      computeWindows({
        range: { startsAt: instant(9), endsAt: instant(10) },
        durationMinutes: 60,
        technicians: [
          {
            id: "one",
            intervals: [{ startsAt: instant(9), endsAt: instant(10) }],
            serviceIds: ["plumbing"],
          },
        ],
        serviceId: "hvac",
        existingJobs: [],
        holds: [],
        bufferMinutes: 0,
      }),
    ).toEqual([]);
  });
});
