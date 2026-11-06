import { AppError } from "../../common/errors.js";

export type ServiceRequestStatusValue =
  | "SUBMITTED"
  | "NEEDS_INFO"
  | "QUOTING"
  | "QUOTED"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED"
  | "CLOSED";

export const requestTransitions: Record<
  ServiceRequestStatusValue,
  readonly ServiceRequestStatusValue[]
> = {
  // QUOTED is allowed directly from SUBMITTED: Phase 4 quote-before-job
  // lets staff send a quote on a fresh intake without a QUOTING detour.
  SUBMITTED: ["NEEDS_INFO", "QUOTING", "QUOTED", "CANCELLED", "CLOSED"],
  NEEDS_INFO: ["SUBMITTED", "CANCELLED", "EXPIRED"],
  QUOTING: ["QUOTED", "NEEDS_INFO", "CANCELLED"],
  QUOTED: ["ACCEPTED", "DECLINED", "QUOTING", "EXPIRED"],
  ACCEPTED: ["CLOSED", "CANCELLED"],
  DECLINED: ["QUOTING", "CLOSED"],
  EXPIRED: ["QUOTING", "CLOSED"],
  CANCELLED: ["SUBMITTED"],
  CLOSED: [],
};

export function assertRequestTransition(
  from: ServiceRequestStatusValue,
  to: ServiceRequestStatusValue,
): void {
  if (!requestTransitions[from].includes(to)) {
    throw new AppError(
      "REQUEST_INVALID_TRANSITION",
      `Cannot transition request from ${from} to ${to}`,
      422,
    );
  }
}
