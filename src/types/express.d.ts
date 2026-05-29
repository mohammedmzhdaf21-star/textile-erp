import { JwtPayload } from '../lib/jwt';

// ============================================================
// 🎭 EXPRESS TYPE EXTENSIONS
// ============================================================
// Tells TypeScript that req.user can exist on Express requests
// (Added by our authenticate middleware)
// ============================================================

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// This empty export makes this file a "module"
export {};
