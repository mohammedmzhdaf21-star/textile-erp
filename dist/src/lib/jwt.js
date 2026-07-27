"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.hashRefreshToken = hashRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
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
// ============================================================
// 🔑 Create ACCESS token (short-lived, 15 min)
// ============================================================
function generateAccessToken(payload) {
    return jsonwebtoken_1.default.sign(payload, ACCESS_SECRET, {
        expiresIn: ACCESS_EXPIRES_IN,
    });
}
// ============================================================
// 🔄 Create REFRESH token (long-lived, 7 days)
// ============================================================
function generateRefreshToken(payload) {
    return jsonwebtoken_1.default.sign(payload, REFRESH_SECRET, {
        expiresIn: REFRESH_EXPIRES_IN,
    });
}
// ============================================================
// ✅ Verify ACCESS token
// ============================================================
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, ACCESS_SECRET);
}
// ============================================================
// ✅ Verify REFRESH token
// ============================================================
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, REFRESH_SECRET);
}
// ============================================================
// 🔐 Hash a refresh token before storing it in DB
// (We NEVER store the raw token — only its hash)
// ============================================================
function hashRefreshToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
//# sourceMappingURL=jwt.js.map