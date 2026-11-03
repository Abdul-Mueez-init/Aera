import type { AuthContext } from "../../common/auth/auth.types.js";
import { AppError } from "../../common/errors.js";

export function assertCanManageRequests(context: AuthContext): void {
  if (context.role !== "OWNER" && context.role !== "DISPATCHER") {
    throw new AppError(
      "AUTH_FORBIDDEN",
      "Only owners and dispatchers can manage service requests",
      403,
    );
  }
}
