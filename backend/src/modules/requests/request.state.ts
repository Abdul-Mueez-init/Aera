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
  SUBMITTED: ["NEEDS_INFO", "QUOTING", "CANCELLED", "CLOSED"],
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
