import { Router, Request, Response } from 'express';
import { loginUser, logoutUser, refreshAccessToken, registerEmployee, listPublicBranches } from '../lib/auth';
import { getEmployeeAuthProfile } from '../lib/employees';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.get('/branches', async (_req: Request, res: Response) => {
  try {
    const branches = await listPublicBranches();
    return res.status(200).json({ branches });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list branches' });
  }
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, branchId, registrationNote } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const result = await registerEmployee({
      name: String(name),
      email: String(email),
      password: String(password),
      phone: phone ? String(phone) : undefined,
      branchId: branchId ? String(branchId) : undefined,
      registrationNote: registrationNote ? String(registrationNote) : undefined,
    });

    return res.status(201).json({
      message: 'Registration submitted. An administrator must approve your account before you can sign in.',
      employee: result,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Registration failed' });
  }
});

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
    if (msg.includes('inactive') || msg.includes('pending') || msg.includes('rejected')) {
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
    const msg = error.message || 'Token refresh failed';
    if (msg.includes('pending') || msg.includes('rejected') || msg.includes('inactive')) {
      return res.status(403).json({ error: msg });
    }
    return res.status(401).json({
      error: msg,
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

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const profile = await getEmployeeAuthProfile(req.user!.userId);
    if (!profile) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json({
      message: 'You are authenticated!',
      user: profile,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load profile' });
  }
});

export default router;
