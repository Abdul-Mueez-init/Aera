import { describe, expect, it } from "vitest";
import {
  assertRequestTransition,
  requestTransitions,
  type ServiceRequestStatusValue,
} from "../src/modules/requests/request.state.js";

const statuses = Object.keys(requestTransitions) as ServiceRequestStatusValue[];

describe("service request state machine", () => {
  it("allows exactly the documented transitions", () => {
    for (const from of statuses) {
      for (const to of statuses) {
        const allowed = requestTransitions[from].includes(to);
        if (allowed) {
          expect(() => assertRequestTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertRequestTransition(from, to)).toThrow(
            /Cannot transition/,
          );
        }
      }
    }
  });

  it("does not allow terminal states to transition", () => {
    expect(requestTransitions.CLOSED).toEqual([]);
    expect(() => assertRequestTransition("CLOSED", "SUBMITTED")).toThrow();
  });
});
