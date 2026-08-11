import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import {
  getCommissionRate,
  getItemMinimumPrices,
  saveCommissionRate,
  saveItemMinimumPrice,
  saveItemMinimumPricesBulk,
  ItemMinimumPriceRecord,
} from '../lib/commissionSettings';
import {
  backfillCommissionEntries,
  listPendingCommissions,
  markEmployeeCommissionsPaid,
} from '../lib/commissions';
import { roleHasFullAccess } from '../lib/employeeSections';

const router = Router();

router.use(authenticate);

router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const [rate, prices] = await Promise.all([getCommissionRate(), getItemMinimumPrices()]);
    return res.status(200).json({ rate, prices });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load commission settings' });
  }
});

router.put('/settings/rate', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const ratePercent = Number(req.body?.ratePercent);
    const rate = await saveCommissionRate(ratePercent, req.user!.userId);
    return res.status(200).json({ rate });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to save commission rate' });
  }
});

router.put('/settings/prices', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const { price, prices } = req.body as {
      price?: ItemMinimumPriceRecord;
      prices?: Record<string, ItemMinimumPriceRecord>;
    };

    if (price) {
      const saved = await saveItemMinimumPrice(price, req.user!.userId);
      return res.status(200).json({ price: saved });
    }

    if (prices && typeof prices === 'object') {
      const saved = await saveItemMinimumPricesBulk(prices, req.user!.userId);
      return res.status(200).json({ prices: saved });
    }

    return res.status(400).json({ error: 'Provide price or prices in request body' });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to save item prices' });
  }
});

router.get('/pending', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const employeeId =
      roleHasFullAccess(user.role) && req.query.employeeId
        ? String(req.query.employeeId)
        : roleHasFullAccess(user.role)
        ? undefined
        : user.userId;

    const groups = await listPendingCommissions({ employeeId });
    return res.status(200).json({ groups });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list pending commissions' });
  }
});

router.post('/pay/:employeeId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const employeeId = Array.isArray(req.params.employeeId)
      ? req.params.employeeId[0]
      : req.params.employeeId;

    const result = await markEmployeeCommissionsPaid(
      employeeId,
      req.user!.userId,
      req.user!.email
    );

    return res.status(200).json({
      message: 'Commission marked as paid',
      paidCount: result.paidCount,
      amountPaid: result.amountPaid,
      payment: result.payment,
    });
  } catch (error: any) {
    const status = error.message?.includes('No pending') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to mark commission paid' });
  }
});

router.post('/backfill', requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const result = await backfillCommissionEntries();
    return res.status(200).json({
      message: 'Commission backfill complete',
      created: result.created,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to backfill commissions' });
  }
});

export default router;
