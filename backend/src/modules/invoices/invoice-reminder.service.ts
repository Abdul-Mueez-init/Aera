import { logger } from "../../common/logger.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { notificationPublisher } from "../notifications/notification.port.js";

const DAY_MS = 86_400_000;
const PAGE_SIZE = 200;
const INITIAL_DELAY_MS = 30_000;

export interface InvoiceReminderSweepOptions {
  intervalDays?: number;
  termsDays?: number;
}

export interface InvoiceReminderSweepResult {
  overdueMarked: number;
  remindersEnqueued: number;
}

function invoiceIdFromPayload(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "invoiceId" in payload) {
    const value = (payload as { invoiceId?: unknown }).invoiceId;
    return typeof value === "string" ? value : null;
  }
  return null;
}

/**
 * One pass over every company's unpaid invoices that are past due:
 *  1. flips ISSUED / PARTIALLY_PAID -> OVERDUE (status-guarded, so a payment
 *     that lands mid-sweep is never overwritten);
 *  2. publishes INVOICE_PAYMENT_REMINDER for each one that has not been
 *     reminded within `intervalDays`.
 *
 * Idempotent: dedupe reads the persisted in-app notification rows, so
 * re-running (or a restart) never double-reminds inside the window. Paged
 * by id so memory stays bounded however many invoices are overdue.
 * Reminder delivery goes through the notification queue and can never fail
 * the sweep (ADR-009).
 */
export async function runInvoiceReminderSweep(
  now: Date = new Date(),
  options: InvoiceReminderSweepOptions = {},
): Promise<InvoiceReminderSweepResult> {
  const intervalDays =
    options.intervalDays ?? env.INVOICE_REMINDER_INTERVAL_DAYS;
  const termsDays = options.termsDays ?? env.INVOICE_PAYMENT_TERMS_DAYS;
  const legacyIssuedBefore = new Date(now.getTime() - termsDays * DAY_MS);
  const dedupeSince = new Date(now.getTime() - intervalDays * DAY_MS);

  let overdueMarked = 0;
  let remindersEnqueued = 0;
  let cursor: string | undefined;

  for (;;) {
    const page = await prisma.invoice.findMany({
      where: {
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        balanceDueMinor: { gt: BigInt(0) },
        OR: [
          { dueAt: { lt: now } },
          { dueAt: null, issuedAt: { lt: legacyIssuedBefore } },
        ],
      },
      select: { id: true, companyId: true, status: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    const toMark = page
      .filter((invoice) => invoice.status !== "OVERDUE")
      .map((invoice) => invoice.id);
    if (toMark.length > 0) {
      const result = await prisma.invoice.updateMany({
        where: {
          id: { in: toMark },
          status: { in: ["ISSUED", "PARTIALLY_PAID"] },
        },
        data: { status: "OVERDUE" },
      });
      overdueMarked += result.count;
    }

    const companyIds = [...new Set(page.map((invoice) => invoice.companyId))];
    const recent = await prisma.notification.findMany({
      where: {
        type: "INVOICE_PAYMENT_REMINDER",
        companyId: { in: companyIds },
        createdAt: { gte: dedupeSince },
      },
      select: { payload: true },
    });
    const alreadyReminded = new Set<string>();
    for (const row of recent) {
      const invoiceId = invoiceIdFromPayload(row.payload);
      if (invoiceId) alreadyReminded.add(invoiceId);
    }

    for (const invoice of page) {
      if (alreadyReminded.has(invoice.id)) continue;
      await notificationPublisher.publish({
        type: "INVOICE_PAYMENT_REMINDER",
        companyId: invoice.companyId,
        invoiceId: invoice.id,
      });
      remindersEnqueued += 1;
    }

    if (page.length < PAGE_SIZE) break;
  }

  return { overdueMarked, remindersEnqueued };
}

/**
 * In-process scheduler (no cron dependency). Timers are unref'd so they
 * never keep the process alive. Runs are serialized — a slow sweep can't
 * overlap the next tick. With more than one API instance each would sweep;
 * dedupe narrows but does not eliminate the double-send race, so move this
 * behind a single worker / BullMQ repeatable job when scaling out.
 */
export function startInvoiceReminderScheduler(): () => void {
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await runInvoiceReminderSweep();
      logger.info(result, "Invoice reminder sweep completed");
    } catch (error) {
      logger.error({ err: error }, "Invoice reminder sweep failed");
    } finally {
      running = false;
    }
  };

  const first = setTimeout(() => void tick(), INITIAL_DELAY_MS);
  const timer = setInterval(
    () => void tick(),
    env.INVOICE_REMINDER_SWEEP_MINUTES * 60_000,
  );
  first.unref();
  timer.unref();

  logger.info(
    { everyMinutes: env.INVOICE_REMINDER_SWEEP_MINUTES },
    "Invoice reminder scheduler started",
  );

  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
