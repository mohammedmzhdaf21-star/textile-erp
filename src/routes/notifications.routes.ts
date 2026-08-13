import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  getUnreadNotificationCount,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/notifications';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const notifications = await listNotificationsForUser(req.user!.userId);
    return res.status(200).json({ notifications });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list notifications' });
  }
});

router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const count = await getUnreadNotificationCount(req.user!.userId);
    return res.status(200).json({ count });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to get unread count' });
  }
});

router.patch('/read-all', async (req: Request, res: Response) => {
  try {
    const result = await markAllNotificationsRead(req.user!.userId);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to mark notifications read' });
  }
});

router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const notification = await markNotificationRead(id, req.user!.userId);
    return res.status(200).json({ notification });
  } catch (error: any) {
    const status = error.message === 'Notification not found' ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to mark notification read' });
  }
});

export default router;
