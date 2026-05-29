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

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('❌ JWT secrets not set in .env file!');
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
  return jwt.sign(payload, ACCESS_SECRET as string, {
    expiresIn: ACCESS_EXPIRES_IN,
  } as SignOptions);
}

// ============================================================
// 🔄 Create REFRESH token (long-lived, 7 days)
// ============================================================
export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, REFRESH_SECRET as string, {
    expiresIn: REFRESH_EXPIRES_IN,
  } as SignOptions);
}

// ============================================================
// ✅ Verify ACCESS token
// ============================================================
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET as string) as JwtPayload;
}

// ============================================================
// ✅ Verify REFRESH token
// ============================================================
export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET as string) as JwtPayload;
}

// ============================================================
// 🔐 Hash a refresh token before storing it in DB
// (We NEVER store the raw token — only its hash)
// ============================================================
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
