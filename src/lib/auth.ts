import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  JwtPayload,
} from './jwt';
import { getEmployeeAuthProfile } from './employees';
import { DEFAULT_EMPLOYEE_SECTIONS } from './employeeSections';
import { assertEmployeeRecordCanSignIn, checkEmployeeAccess } from './employeeAccess';
import { ensureDeviceSignInApproved } from './deviceSignIn';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const REFRESH_TOKEN_DAYS = 7;
const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

export async function registerEmployee(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  branchId?: string;
  registrationNote?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!name || !email || !input.password) {
    throw new Error('Name, email, and password are required');
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const existing = await prisma.employee.findUnique({ where: { email } });
  if (existing && !existing.deletedAt) {
    throw new Error('An account with this email already exists');
  }

  if (input.branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: input.branchId, isActive: true, deletedAt: null },
    });
    if (!branch) {
      throw new Error('Selected branch is not available');
    }
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const employee = await prisma.employee.create({
    data: {
      name,
      email,
      phone: input.phone?.trim() || null,
      passwordHash,
      role: 'EMPLOYEE',
      isActive: true,
      approvalStatus: 'APPROVED',
      allowedSections: DEFAULT_EMPLOYEE_SECTIONS,
      registrationNote: input.registrationNote?.trim() || null,
      branches: input.branchId
        ? { create: [{ branchId: input.branchId }] }
        : undefined,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'Employee',
      entityId: employee.id,
      action: 'CREATE',
      performedByEmail: email,
      changes: {
        source: 'self_registration',
        approvalStatus: 'APPROVED',
      },
    },
  });

  return {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    approvalStatus: employee.approvalStatus,
  };
}

export async function listPublicBranches() {
  return prisma.branch.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
}

export async function loginUser(
  email: string,
  password: string,
  userAgent?: string,
  ipAddress?: string,
  deviceId?: string
) {
  const employee = await prisma.employee.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!employee) {
    throw new Error('Invalid email or password');
  }

  assertEmployeeRecordCanSignIn(employee);

  if (employee.lockedUntil && employee.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil(
      (employee.lockedUntil.getTime() - Date.now()) / 60000
    );
    throw new Error(`Account locked. Try again in ${minutesLeft} minute(s).`);
  }

  const passwordValid = await bcrypt.compare(password, employee.passwordHash);

  if (!passwordValid) {
    const newFailedCount = employee.failedLoginAttempts + 1;
    const shouldLock = newFailedCount >= MAX_FAILED_ATTEMPTS;

    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        failedLoginAttempts: newFailedCount,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
          : null,
      },
    });

    if (shouldLock) {
      throw new Error(
        `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`
      );
    }
    throw new Error('Invalid email or password');
  }

  const deviceCheck = await ensureDeviceSignInApproved({
    employeeId: employee.id,
    role: employee.role,
    name: employee.name,
    email: employee.email,
    deviceId,
    userAgent,
    ipAddress,
  });

  if (!deviceCheck.approved) {
    const error = new Error(deviceCheck.error) as Error & { code?: string };
    error.code = deviceCheck.code;
    throw error;
  }

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  const payload: JwtPayload = {
    userId: employee.id,
    email: employee.email,
    role: employee.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.session.create({
    data: {
      employeeId: employee.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: 'Employee',
      entityId: employee.id,
      action: 'LOGIN',
      performedById: employee.id,
      performedByEmail: employee.email,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    },
  });

  const profile = await getEmployeeAuthProfile(employee.id);
  if (!profile) {
    throw new Error('Account is inactive');
  }

  return {
    accessToken,
    refreshToken,
    user: profile,
  };
}

export async function logoutUser(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);

  await prisma.session.updateMany({
    where: { refreshTokenHash: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return { success: true };
}

export async function refreshAccessToken(refreshToken: string) {
  let payload: JwtPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new Error('Invalid or expired refresh token');
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: tokenHash },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.revokedAt) {
    throw new Error('Session has been revoked');
  }

  if (session.expiresAt < new Date()) {
    throw new Error('Session has expired');
  }

  const access = await checkEmployeeAccess(payload.userId);
  if (!access.ok) {
    throw new Error(access.error);
  }

  const newAccessToken = generateAccessToken({
    userId: access.employee.id,
    email: access.employee.email,
    role: access.employee.role,
  });

  return { accessToken: newAccessToken };
}
