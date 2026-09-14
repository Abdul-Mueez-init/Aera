import { prisma } from "../../db/prisma.js";
import { AppError } from "../../common/errors.js";

export type DeviceTokenPlatformInput = "ANDROID" | "IOS" | "WEB";

/**
 * Registers (or re-owns) a device token. Upsert-by-token rather than a
 * plain insert: the same physical device can reasonably send the same FCM
 * token again after a token "refresh" no-op, or a different user can sign
 * in on a previously-registered device — both should succeed idempotently
 * rather than erroring on a unique-constraint collision.
 */
export async function registerDeviceToken(params: {
  companyId: string;
  userId: string;
  token: string;
  platform: DeviceTokenPlatformInput;
}) {
  return prisma.deviceToken.upsert({
    where: { token: params.token },
    create: {
      companyId: params.companyId,
      userId: params.userId,
      token: params.token,
      platform: params.platform,
    },
    update: {
      companyId: params.companyId,
      userId: params.userId,
      platform: params.platform,
      lastSeenAt: new Date(),
    },
    select: { id: true, platform: true, createdAt: true },
  });
}

/**
 * Removes one device token, scoped to the requesting user (never another
 * user's token, even within the same company) — call this on logout so a
 * signed-out device stops receiving push for that account.
 */
export async function removeDeviceToken(userId: string, token: string): Promise<void> {
  const existing = await prisma.deviceToken.findFirst({
    where: { token, userId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError("RESOURCE_NOT_FOUND", "Device token not found", 404);
  }
  await prisma.deviceToken.delete({ where: { id: existing.id } });
}

/** Used by the push dispatch handler to fan a notification event out to every registered device for the resolved recipients. */
export async function listTokensForUsers(
  userIds: string[],
): Promise<Array<{ token: string; userId: string }>> {
  if (userIds.length === 0) return [];
  return prisma.deviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true, userId: true },
  });
}

/** Called when FCM reports a token as unregistered — prunes it so future sends stop wasting a call on it. */
export async function removeInvalidToken(token: string): Promise<void> {
  await prisma.deviceToken.deleteMany({ where: { token } });
}