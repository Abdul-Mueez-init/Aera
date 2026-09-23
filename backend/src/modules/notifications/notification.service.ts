import { AppError } from "../../common/errors.js";
import { prisma } from "../../db/prisma.js";

export interface NotificationFilters {
  companyId: string;
  recipientUserId: string;
  page: number;
  pageSize: number;
  unreadOnly: boolean;
}

const notificationSelect = {
  id: true,
  type: true,
  payload: true,
  readAt: true,
  createdAt: true,
} as const;

export async function listNotifications(filters: NotificationFilters) {
  const where = {
    companyId: filters.companyId,
    recipientUserId: filters.recipientUserId,
    ...(filters.unreadOnly ? { readAt: null } : {}),
  };
  const skip = (filters.page - 1) * filters.pageSize;

  const [items, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      select: notificationSelect,
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        companyId: filters.companyId,
        recipientUserId: filters.recipientUserId,
        readAt: null,
      },
    }),
  ]);

  return {
    items,
    meta: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      pageCount: Math.ceil(total / filters.pageSize),
      unreadCount,
    },
  };
}

export async function markNotificationRead(
  companyId: string,
  recipientUserId: string,
  notificationId: string,
) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, companyId, recipientUserId },
    select: { id: true, readAt: true },
  });
  if (!notification) {
    throw new AppError("RESOURCE_NOT_FOUND", "Notification not found", 404);
  }
  if (notification.readAt) {
    return notification;
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
    select: notificationSelect,
  });
}
