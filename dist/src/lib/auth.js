"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginUser = loginUser;
exports.logoutUser = logoutUser;
exports.refreshAccessToken = refreshAccessToken;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("./prisma");
const jwt_1 = require("./jwt");
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const REFRESH_TOKEN_DAYS = 7;
async function loginUser(email, password, userAgent, ipAddress) {
    const employee = await prisma_1.prisma.employee.findUnique({
        where: { email: email.toLowerCase() },
    });
    if (!employee) {
        throw new Error('Invalid email or password');
    }
    if (!employee.isActive || employee.deletedAt) {
        throw new Error('Account is inactive');
    }
    if (employee.lockedUntil && employee.lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((employee.lockedUntil.getTime() - Date.now()) / 60000);
        throw new Error(`Account locked. Try again in ${minutesLeft} minute(s).`);
    }
    const passwordValid = await bcryptjs_1.default.compare(password, employee.passwordHash);
    if (!passwordValid) {
        const newFailedCount = employee.failedLoginAttempts + 1;
        const shouldLock = newFailedCount >= MAX_FAILED_ATTEMPTS;
        await prisma_1.prisma.employee.update({
            where: { id: employee.id },
            data: {
                failedLoginAttempts: newFailedCount,
                lockedUntil: shouldLock
                    ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
                    : null,
            },
        });
        if (shouldLock) {
            throw new Error(`Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`);
        }
        throw new Error('Invalid email or password');
    }
    await prisma_1.prisma.employee.update({
        where: { id: employee.id },
        data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
        },
    });
    const payload = {
        userId: employee.id,
        email: employee.email,
        role: employee.role,
    };
    const accessToken = (0, jwt_1.generateAccessToken)(payload);
    const refreshToken = (0, jwt_1.generateRefreshToken)(payload);
    await prisma_1.prisma.session.create({
        data: {
            employeeId: employee.id,
            refreshTokenHash: (0, jwt_1.hashRefreshToken)(refreshToken),
            userAgent: userAgent || null,
            ipAddress: ipAddress || null,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
        },
    });
    await prisma_1.prisma.auditLog.create({
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
async function logoutUser(refreshToken) {
    const tokenHash = (0, jwt_1.hashRefreshToken)(refreshToken);
    await prisma_1.prisma.session.updateMany({
        where: { refreshTokenHash: tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    return { success: true };
}
async function refreshAccessToken(refreshToken) {
    let payload;
    try {
        payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
    }
    catch {
        throw new Error('Invalid or expired refresh token');
    }
    const tokenHash = (0, jwt_1.hashRefreshToken)(refreshToken);
    const session = await prisma_1.prisma.session.findUnique({
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
    const newAccessToken = (0, jwt_1.generateAccessToken)({
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
    });
    return { accessToken: newAccessToken };
}
//# sourceMappingURL=auth.js.map