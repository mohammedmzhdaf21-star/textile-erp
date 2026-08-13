import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../lib/jwt';
import { checkEmployeeAccess } from '../lib/employeeAccess';

// ============================================================
// 🛡️ AUTHENTICATION MIDDLEWARE
// ============================================================
// Verifies JWT access token from "Authorization: Bearer <token>" header
// If valid, attaches user info to req.user and continues
// If invalid, returns 401 Unauthorized
// ============================================================

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Missing or invalid Authorization header',
        hint: 'Use format: "Authorization: Bearer <token>"',
      });
      return;
    }

    const token = authHeader.substring(7);

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    let payload: JwtPayload;
    try {
      payload = verifyAccessToken(token);
    } catch (error: any) {
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
      return;
    }

    const access = await checkEmployeeAccess(payload.userId);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    req.user = {
      userId: access.employee.id,
      email: access.employee.email,
      role: access.employee.role,
    };

    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
}

// ============================================================
// 🎭 ROLE-BASED ACCESS CONTROL
// ============================================================
// Usage: router.get('/admin-only', authenticate, requireRole('ADMIN'), handler)
// ============================================================

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
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
