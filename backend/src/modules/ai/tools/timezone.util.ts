import { prisma } from "../../../db/prisma.js";

/**
 * Company-timezone-aware day/date helpers, shared by get_jobs_at_risk,
 * get_schedule_workload, and get_business_metrics.
 *
 * `jobs-at-risk.tool.ts` originally computed "today" using the same
 * UTC-day convention as `listTechnicianToday`/`getDaySchedule`
 * (job.service.ts / scheduling.service.ts), for consistency with the rest
 * of the codebase rather than introducing new logic. That doesn't match
 * the actual product decision on file: AI-facing "today"/"this month"
 * questions should follow the asking company's own `Company.timezone`
 * (schema.md, architecture.md) — a dispatcher asking "what's at risk
 * today" at 11pm local time should not get an answer computed against
 * UTC's midnight, which could be hours away from their own day boundary.
 *
 * No timezone library is added (rules.md: no silent new dependency).
 * `Intl.DateTimeFormat` with a `timeZone` option is built into Node and is
 * sufficient for both "what's today's date here" and "what UTC instant is
 * local midnight on this date".
 */

const FALLBACK_TIMEZONE = "UTC";

/** Looks up the asking company's IANA timezone, falling back to UTC. */
export async function getCompanyTimezone(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });
  return company?.timezone || FALLBACK_TIMEZONE;
}

/** Today's calendar date (YYYY-MM-DD) as observed in `timeZone`. */
export function todayInTimezone(
  timeZone: string,
  reference: Date = new Date(),
): string {
  try {
    // The en-CA locale conveniently formats as YYYY-MM-DD — exactly the
    // wire format the rest of the codebase already uses for date params.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(reference);
  } catch {
    // Invalid/unknown IANA zone on the company record — fail open to UTC
    // rather than breaking the tool call.
    return reference.toISOString().slice(0, 10);
  }
}

/**
 * Offset of `timeZone` from UTC at `instant`, in milliseconds, such that
 * `localWallClock = instant + offset`.
 */
function offsetMsAt(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  // Some engines report local midnight as hour "24" rather than "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(hour),
    Number(get("minute")),
    Number(get("second")),
  );
  return asUtc - instant.getTime();
}

/**
 * UTC instant range `[start, end)` covering one calendar day (`dateStr`,
 * YYYY-MM-DD) as observed in `timeZone`. Used to scope "today"/"this
 * month" queries by company-local day rather than UTC day.
 *
 * The offset is resolved once, from a naive UTC-midnight guess. A DST
 * transition landing exactly at local midnight could shift the true
 * boundary by up to an hour in that rare case; that's an acceptable
 * precision trade-off for a day-bucketed AI/dashboard query, and matches
 * the day-bucket precision already used elsewhere in the codebase.
 */
export function dayBoundsInTimezone(
  dateStr: string,
  timeZone: string,
): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new RangeError("dateStr must be YYYY-MM-DD");
  }
  const naiveUtcMidnight = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(naiveUtcMidnight.getTime())) {
    throw new RangeError("Invalid date");
  }
  const offsetMs = offsetMsAt(timeZone, naiveUtcMidnight);
  const start = new Date(naiveUtcMidnight.getTime() - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** First day of `dateStr`'s calendar month, e.g. "2026-09-23" -> "2026-09-01". */
export function monthStartDateStr(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}