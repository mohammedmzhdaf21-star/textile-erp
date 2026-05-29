import { Router, Request, Response } from 'express';
import { loginUser, logoutUser, refreshAccessToken } from '../lib/auth';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
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
    let ipAddress: string | undefined;
    if (forwarded) {
      const parts = forwarded.split(',');
      ipAddress = parts[0].trim();
    } else {
      ipAddress = req.socket.remoteAddress || undefined;
    }

    const result = await loginUser(email, password, userAgent, ipAddress);

    return res.status(200).json({
      message: 'Login successful',
      ...result,
    });
  } catch (error: any) {
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

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({
        error: 'refreshToken is required',
      });
    }

    const result = await refreshAccessToken(refreshToken);

    return res.status(200).json({
      message: 'Token refreshed',
      ...result,
    });
  } catch (error: any) {
    return res.status(401).json({
      error: error.message || 'Token refresh failed',
    });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({
        error: 'refreshToken is required',
      });
    }

    await logoutUser(refreshToken);

    return res.status(200).json({
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error.message || 'Logout failed',
    });
  }
});

router.get('/me', authenticate, (req: Request, res: Response) => {
  return res.status(200).json({
    message: 'You are authenticated!',
    user: req.user,
  });
});

export default router;
