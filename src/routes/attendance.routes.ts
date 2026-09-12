import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import {
  getOrCreateDailyAttendanceQr,
  listAttendanceRecords,
  recordAttendanceCheckIn,
} from '../lib/attendance';

const router = Router();

router.use(authenticate);

router.get('/qr', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId.trim() : '';
    if (!branchId) {
      return res.status(400).json({ error: 'branchId is required' });
    }

    const qr = await getOrCreateDailyAttendanceQr(branchId);
    return res.status(200).json({ qr });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to load attendance QR' });
  }
});

router.post('/check-in', async (req: Request, res: Response) => {
  try {
    const qrValue =
      typeof req.body?.qrValue === 'string'
        ? req.body.qrValue
        : typeof req.body?.code === 'string'
          ? req.body.code
          : '';

    if (!qrValue.trim()) {
      return res.status(400).json({ error: 'qrValue is required' });
    }

    const result = await recordAttendanceCheckIn({
      employeeId: req.user!.userId,
      employeeRole: req.user!.role,
      qrValue,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Check-in failed' });
  }
});

router.get('/records', async (req: Request, res: Response) => {
  try {
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId.trim() : undefined;
    const attendanceDay =
      typeof req.query.attendanceDay === 'string' ? req.query.attendanceDay.trim() : undefined;
    const employeeId =
      typeof req.query.employeeId === 'string' ? req.query.employeeId.trim() : undefined;

    const records = await listAttendanceRecords({
      viewerId: req.user!.userId,
      viewerRole: req.user!.role,
      branchId,
      attendanceDay,
      employeeId,
    });

    return res.status(200).json({ records });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to list attendance records' });
  }
});

export default router;
