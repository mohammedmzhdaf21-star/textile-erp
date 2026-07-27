"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRole = requireRole;
const jwt_1 = require("../lib/jwt");
// ============================================================
// 🛡️ AUTHENTICATION MIDDLEWARE
// ============================================================
// Verifies JWT access token from "Authorization: Bearer <token>" header
// If valid, attaches user info to req.user and continues
// If invalid, returns 401 Unauthorized
// ============================================================
function authenticate(req, res, next) {
    try {
        // ---- 1. Get token from header ----
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: 'Missing or invalid Authorization header',
                hint: 'Use format: "Authorization: Bearer <token>"',
            });
            return;
        }
        const token = authHeader.substring(7); // remove "Bearer "
        if (!token) {
            res.status(401).json({ error: 'No token provided' });
            return;
        }
        // ---- 2. Verify token ----
        const payload = (0, jwt_1.verifyAccessToken)(token);
        // ---- 3. Attach user to request ----
        req.user = payload;
        // ---- 4. Continue to the actual route handler ----
        next();
    }
    catch (error) {
        if (error.name === 'TokenExpiredError') {
            res.status(401).json({
                error: 'Token expired',
                hint: 'Use /api/auth/refresh to get a new token',
            });
            return;
        }
        if (error.name === 'JsonWebTokenError') {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }
        res.status(401).json({ error: 'Authentication failed' });
    }
}
// ============================================================
// 🎭 ROLE-BASED ACCESS CONTROL
// ============================================================
// Usage: router.get('/admin-only', authenticate, requireRole('ADMIN'), handler)
// ============================================================
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({
                error: 'Forbidden',
                message: `This action requires one of these roles: ${allowedRoles.join(', ')}`,
                yourRole: req.user.role,
            });
            return;
        }
        next();
    };
}
//# sourceMappingURL=authenticate.js.map