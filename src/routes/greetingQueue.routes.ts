import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  advanceGreetingQueue,
  getGreetingQueueState,
  listRecentGreetingEvents,
} from '../lib/greetingQueue';

const router = Router();

router.use(authenticate);

router.get('/state', async (req: Request, res: Response) => {
  try {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId.trim() : '';
    if (!branchId) {
      return res.status(400).json({ error: 'branchId is required' });
    }

    const state = await getGreetingQueueState({
      branchId,
      viewerId: req.user!.userId,
    });

    return res.status(200).json({ state });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to load greeting queue' });
  }
});

router.post('/advance', async (req: Request, res: Response) => {
  try {
    const branchId =
      typeof req.body?.branchId === 'string' ? req.body.branchId.trim() : '';
    if (!branchId) {
      return res.status(400).json({ error: 'branchId is required' });
    }

    const result = await advanceGreetingQueue({
      branchId,
      employeeId: req.user!.userId,
      employeeRole: req.user!.role,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to advance greeting queue' });
  }
});

router.get('/events', async (req: Request, res: Response) => {
  try {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId.trim() : '';
    if (!branchId) {
      return res.status(400).json({ error: 'branchId is required' });
    }

    const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 20;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;

    const events = await listRecentGreetingEvents(branchId, limit);
    return res.status(200).json({ events });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to list greeting events' });
  }
});

export default router;
