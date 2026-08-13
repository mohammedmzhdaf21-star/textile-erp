import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';

// ============================================================
// 🎫 JWT TOKEN UTILITIES
// ============================================================

// ---- Read secrets from environment ----
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function requireJwtSecret(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set in .env`);
  }
  return value;
}

// ---- Type for token payload ----
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

// ============================================================
// 🔑 Create ACCESS token (short-lived, 15 min)
// ============================================================
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, requireJwtSecret('JWT_ACCESS_SECRET', ACCESS_SECRET), {
    expiresIn: ACCESS_EXPIRES_IN,
  } as SignOptions);
}

// ============================================================
// 🔄 Create REFRESH token (long-lived, 7 days)
// ============================================================
export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, requireJwtSecret('JWT_REFRESH_SECRET', REFRESH_SECRET), {
    expiresIn: REFRESH_EXPIRES_IN,
  } as SignOptions);
}

// ============================================================
// ✅ Verify ACCESS token
// ============================================================
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, requireJwtSecret('JWT_ACCESS_SECRET', ACCESS_SECRET)) as JwtPayload;
}

// ============================================================
// ✅ Verify REFRESH token
// ============================================================
export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, requireJwtSecret('JWT_REFRESH_SECRET', REFRESH_SECRET)) as JwtPayload;
}

// ============================================================
// 🔐 Hash a refresh token before storing it in DB
// (We NEVER store the raw token — only its hash)
// ============================================================
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
