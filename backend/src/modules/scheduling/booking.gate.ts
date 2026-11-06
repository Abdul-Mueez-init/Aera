import { prisma } from "../../db/prisma.js";
import type { AcceptanceGate } from "../quotes/quote.service.js";

/**
 * Phase 5.5 — BookingGate. Plugs into the quote-acceptance gate list.
 *
 * - DISPATCHER_CONFIRMS (default): always PASS — the job is created NEW
 *   and the dispatcher schedules it from the unscheduled queue.
 * - SELF_SERVE_WINDOWS: PASS only when a CONFIRMED AppointmentHold exists
 *   for the quote (or its request); otherwise WAIT, leaving the durable
 *   "request ACCEPTED, no job" state until the customer confirms a
 *   booking window, at which point `resumeAcceptedQuoteBooking` creates
 *   the job exactly once.
 */
export const bookingGate: AcceptanceGate = {
  name: "BOOKING",
  async evaluate(ctx) {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: ctx.companyId },
      select: { bookingMode: true },
    });
    if (company.bookingMode !== "SELF_SERVE_WINDOWS") {
      return { result: "PASS" };
    }
    const hold = await prisma.appointmentHold.findFirst({
      where: {
        companyId: ctx.companyId,
        status: "CONFIRMED",
        OR: [
          { quoteId: ctx.quoteId },
          ...(ctx.serviceRequestId
            ? [{ requestId: ctx.serviceRequestId }]
            : []),
        ],
      },
      select: { id: true },
    });
    return hold
      ? { result: "PASS" }
      : { result: "WAIT", reason: "AWAITING_BOOKING_CONFIRMATION" };
  },
};
