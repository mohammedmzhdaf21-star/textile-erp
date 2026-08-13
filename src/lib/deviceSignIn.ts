import crypto from 'crypto';
import { prisma } from './prisma';
import { roleHasFullAccess } from './employeeSections';
import { notifyAdminsOfDeviceSignIn } from './notifications';

export type DeviceSignInPublic = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  employeeRole: string;
  deviceLabel: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
};

export const roleRequiresDeviceSignInApproval = (role: string) => !roleHasFullAccess(role);

export function hashDeviceKey(deviceId: string) {
  return crypto.createHash('sha256').update(deviceId.trim()).digest('hex');
}

function summarizeUserAgent(userAgent?: string | null) {
  if (!userAgent?.trim()) return 'Unknown device';
  const ua = userAgent.trim();
  if (ua.length <= 120) return ua;
  return `${ua.slice(0, 117)}...`;
}

const formatRequest = (request: {
  id: string;
  employeeId: string;
  deviceLabel: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: Date;
  employee: { name: string; email: string; role: string };
}): DeviceSignInPublic => ({
  id: request.id,
  employeeId: request.employeeId,
  employeeName: request.employee.name,
  employeeEmail: request.employee.email,
  employeeRole: request.employee.role,
  deviceLabel: request.deviceLabel,
  userAgent: request.userAgent,
  ipAddress: request.ipAddress,
  status: request.status,
  createdAt: request.createdAt.toISOString(),
});

export async function ensureDeviceSignInApproved(input: {
  employeeId: string;
  role: string;
  name: string;
  email: string;
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
}) {
  if (!roleRequiresDeviceSignInApproval(input.role)) {
    return { approved: true as const };
  }

  if (!input.deviceId?.trim()) {
    throw new Error('Device identification is required to sign in');
  }

  const deviceKey = hashDeviceKey(input.deviceId);
  const existing = await prisma.deviceSignInRequest.findUnique({
    where: {
      employeeId_deviceKey: {
        employeeId: input.employeeId,
        deviceKey,
      },
    },
  });

  if (existing?.status === 'APPROVED') {
    return { approved: true as const };
  }

  if (existing?.status === 'PENDING') {
    return {
      approved: false as const,
      error: 'Sign-in on this device is waiting for administrator approval',
      code: 'DEVICE_SIGN_IN_PENDING',
    };
  }

  const deviceLabel = summarizeUserAgent(input.userAgent);
  const request = await prisma.deviceSignInRequest.upsert({
    where: {
      employeeId_deviceKey: {
        employeeId: input.employeeId,
        deviceKey,
      },
    },
    create: {
      employeeId: input.employeeId,
      deviceKey,
      deviceLabel,
      userAgent: input.userAgent || null,
      ipAddress: input.ipAddress || null,
      status: 'PENDING',
    },
    update: {
      status: 'PENDING',
      deviceLabel,
      userAgent: input.userAgent || null,
      ipAddress: input.ipAddress || null,
      approvedAt: null,
      approvedById: null,
    },
    include: {
      employee: { select: { name: true, email: true, role: true } },
    },
  });

  await notifyAdminsOfDeviceSignIn({
    id: request.id,
    employeeName: input.name,
    employeeEmail: input.email,
    deviceLabel,
  });

  return {
    approved: false as const,
    error:
      'Sign-in request sent to your administrator for this device. Try again after approval.',
    code: 'DEVICE_SIGN_IN_PENDING',
  };
}

export async function listPendingDeviceSignIns() {
  const requests = await prisma.deviceSignInRequest.findMany({
    where: { status: 'PENDING' },
    include: {
      employee: { select: { name: true, email: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return requests.map(formatRequest);
}

export async function approveDeviceSignIn(id: string, approvedById: string) {
  const existing = await prisma.deviceSignInRequest.findFirst({
    where: { id, status: 'PENDING' },
    include: {
      employee: { select: { name: true, email: true, role: true } },
    },
  });
  if (!existing) {
    throw new Error('Pending sign-in request not found');
  }

  const updated = await prisma.deviceSignInRequest.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedAt: new Date(),
      approvedById,
    },
    include: {
      employee: { select: { name: true, email: true, role: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'DeviceSignInRequest',
      entityId: id,
      action: 'UPDATE',
      performedById: approvedById,
      changes: {
        employeeId: existing.employeeId,
        deviceLabel: existing.deviceLabel,
        status: 'APPROVED',
      },
    },
  });

  return formatRequest(updated);
}

export async function rejectDeviceSignIn(id: string, approvedById: string) {
  const existing = await prisma.deviceSignInRequest.findFirst({
    where: { id, status: 'PENDING' },
  });
  if (!existing) {
    throw new Error('Pending sign-in request not found');
  }

  await prisma.deviceSignInRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      approvedAt: new Date(),
      approvedById,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'DeviceSignInRequest',
      entityId: id,
      action: 'UPDATE',
      performedById: approvedById,
      changes: {
        employeeId: existing.employeeId,
        deviceLabel: existing.deviceLabel,
        status: 'REJECTED',
      },
    },
  });

  return { success: true };
}
