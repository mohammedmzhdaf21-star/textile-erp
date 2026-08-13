import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import {
  approveDeviceSignIn,
  listPendingDeviceSignIns,
  rejectDeviceSignIn,
} from '../lib/deviceSignIn';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN', 'MANAGER'));

router.get('/pending', async (_req: Request, res: Response) => {
  try {
    const requests = await listPendingDeviceSignIns();
    return res.status(200).json({ requests });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list sign-in requests' });
  }
});

router.post('/:id/approve', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const request = await approveDeviceSignIn(id, req.user!.userId);
    return res.status(200).json({ message: 'Device sign-in approved', request });
  } catch (error: any) {
    const status = error.message === 'Pending sign-in request not found' ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to approve sign-in' });
  }
});

router.post('/:id/reject', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await rejectDeviceSignIn(id, req.user!.userId);
    return res.status(200).json({ message: 'Device sign-in rejected' });
  } catch (error: any) {
    const status = error.message === 'Pending sign-in request not found' ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to reject sign-in' });
  }
});

export default router;
