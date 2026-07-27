"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../lib/auth");
const authenticate_1 = require("../middleware/authenticate");
const router = (0, express_1.Router)();
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required',
            });
        }
        if (typeof email !== 'string' || typeof password !== 'string') {
            return res.status(400).json({
                error: 'Email and password must be strings',
            });
        }
        const userAgent = req.get('user-agent');
        const forwarded = req.get('x-forwarded-for');
        let ipAddress;
        if (forwarded) {
            const parts = forwarded.split(',');
            ipAddress = parts[0].trim();
        }
        else {
            ipAddress = req.socket.remoteAddress || undefined;
        }
        const result = await (0, auth_1.loginUser)(email, password, userAgent, ipAddress);
        return res.status(200).json({
            message: 'Login successful',
            ...result,
        });
    }
    catch (error) {
        const msg = error.message || 'Login failed';
        if (msg.includes('locked')) {
            return res.status(423).json({ error: msg });
        }
        if (msg.includes('inactive')) {
            return res.status(403).json({ error: msg });
        }
        return res.status(401).json({ error: msg });
    }
});
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken || typeof refreshToken !== 'string') {
            return res.status(400).json({
                error: 'refreshToken is required',
            });
        }
        const result = await (0, auth_1.refreshAccessToken)(refreshToken);
        return res.status(200).json({
            message: 'Token refreshed',
            ...result,
        });
    }
    catch (error) {
        return res.status(401).json({
            error: error.message || 'Token refresh failed',
        });
    }
});
router.post('/logout', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken || typeof refreshToken !== 'string') {
            return res.status(400).json({
                error: 'refreshToken is required',
            });
        }
        await (0, auth_1.logoutUser)(refreshToken);
        return res.status(200).json({
            message: 'Logged out successfully',
        });
    }
    catch (error) {
        return res.status(500).json({
            error: error.message || 'Logout failed',
        });
    }
});
router.get('/me', authenticate_1.authenticate, (req, res) => {
    return res.status(200).json({
        message: 'You are authenticated!',
        user: req.user,
    });
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map