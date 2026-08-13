import { NotificationType } from '@prisma/client';
import { prisma } from './prisma';

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  metadata: unknown;
  createdAt: string;
};

const formatNotification = (notification: {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  metadata: unknown;
  createdAt: Date;
}): NotificationItem => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  isRead: notification.isRead,
  metadata: notification.metadata,
  createdAt: notification.createdAt.toISOString(),
});

export async function notifyAdminsOfDeviceSignIn(input: {
  id: string;
  employeeName: string;
  employeeEmail: string;
  deviceLabel: string | null;
}) {
  const admins = await prisma.employee.findMany({
    where: {
      role: 'ADMIN',
      isActive: true,
      deletedAt: null,
      approvalStatus: 'APPROVED',
    },
    select: { id: true },
  });

  if (admins.length === 0) return;

  const deviceText = input.deviceLabel ?? 'Unknown device';

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      type: 'DEVICE_SIGN_IN',
      title: 'Employee sign-in request',
      message: `${input.employeeName} (${input.employeeEmail}) wants to sign in from ${deviceText}`,
      recipientId: admin.id,
      metadata: { signInRequestId: input.id, employeeEmail: input.employeeEmail },
    })),
  });
}

export async function notifyAdminsOfRegistration(
  employee: {
    id: string;
    name: string;
    email: string;
  },
  options?: {
    title?: string;
    message?: string;
  }
) {
  const admins = await prisma.employee.findMany({
    where: {
      role: 'ADMIN',
      isActive: true,
      deletedAt: null,
      approvalStatus: 'APPROVED',
    },
    select: { id: true },
  });

  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      type: 'EMPLOYEE_REGISTRATION',
      title: options?.title ?? 'New employee registration',
      message:
        options?.message ??
        `${employee.name} (${employee.email}) requested workspace access`,
      recipientId: admin.id,
      metadata: { employeeId: employee.id },
    })),
  });
}

export async function markRegistrationNotificationsRead(employeeId: string) {
  await prisma.notification.updateMany({
    where: {
      type: 'EMPLOYEE_REGISTRATION',
      isRead: false,
      metadata: {
        path: ['employeeId'],
        equals: employeeId,
      },
    },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function listNotificationsForUser(recipientId: string, limit = 50) {
  const notifications = await prisma.notification.findMany({
    where: { recipientId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return notifications.map(formatNotification);
}

export async function getUnreadNotificationCount(recipientId: string) {
  return prisma.notification.count({
    where: { recipientId, isRead: false },
  });
}

export async function markNotificationRead(id: string, recipientId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id, recipientId },
  });
  if (!notification) {
    throw new Error('Notification not found');
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
  });
  return formatNotification(updated);
}

export async function markAllNotificationsRead(recipientId: string) {
  await prisma.notification.updateMany({
    where: { recipientId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { success: true };
}
