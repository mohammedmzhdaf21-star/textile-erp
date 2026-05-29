import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  JwtPayload,
} from './jwt';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const REFRESH_TOKEN_DAYS = 7;

export async function loginUser(
  email: string,
  password: string,
  userAgent?: string,
  ipAddress?: string
) {
  const employee = await prisma.employee.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!employee) {
    throw new Error('Invalid email or password');
  }

  if (!employee.isActive || employee.deletedAt) {
    throw new Error('Account is inactive');
  }

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

  return {
    accessToken,
    refreshToken,
    user: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
    },
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

  const newAccessToken = generateAccessToken({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
  });

  return { accessToken: newAccessToken };
}
