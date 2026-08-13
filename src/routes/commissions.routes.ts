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
  recalculatePendingCommissionEntries,
} from '../lib/commissions';
import {
  createPlainClothPricing,
  deletePlainClothPricing,
  listPlainClothPricing,
  updatePlainClothPricing,
} from '../lib/plainClothPricing';
import { roleHasFullAccess } from '../lib/employeeSections';

const router = Router();

router.use(authenticate);

router.get('/plain-cloth', async (req: Request, res: Response) => {
  try {
    const includeInactive =
      req.query.includeInactive === 'true' &&
      (req.user!.role === 'ADMIN' || req.user!.role === 'MANAGER');
    const items = await listPlainClothPricing({ includeInactive });
    return res.status(200).json({ items });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list plain cloth types' });
  }
});

router.post('/plain-cloth', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const item = await createPlainClothPricing({
      name: String(req.body?.name ?? ''),
      pricePerM: Number(req.body?.pricePerM),
    });
    return res.status(201).json({ item });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to create plain cloth type' });
  }
});

router.put('/plain-cloth/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const item = await updatePlainClothPricing(id, {
      name: req.body?.name !== undefined ? String(req.body.name) : undefined,
      pricePerM: req.body?.pricePerM !== undefined ? Number(req.body.pricePerM) : undefined,
      isActive: req.body?.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
    });
    return res.status(200).json({ item });
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to update plain cloth type' });
  }
});

router.delete('/plain-cloth/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await deletePlainClothPricing(id);
    return res.status(200).json(result);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to delete plain cloth type' });
  }
});

router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const [rate, prices, plainClothTypes] = await Promise.all([
      getCommissionRate(),
      getItemMinimumPrices(),
      listPlainClothPricing({ includeInactive: true }).catch(() => []),
    ]);
    return res.status(200).json({ rate, prices, plainClothTypes });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to load commission settings' });
  }
});

router.put('/settings/rate', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const ratePercent = Number(req.body?.ratePercent);
    const baseAmountPerUnit =
      req.body?.baseAmountPerUnit !== undefined
        ? Number(req.body.baseAmountPerUnit)
        : undefined;
    const rate = await saveCommissionRate(
      ratePercent,
      req.user!.userId,
      baseAmountPerUnit
    );
    await recalculatePendingCommissionEntries();
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
      const backfill = await backfillCommissionEntries();
      return res.status(200).json({ price: saved, backfillCreated: backfill.created });
    }

    if (prices && typeof prices === 'object') {
      const saved = await saveItemMinimumPricesBulk(prices, req.user!.userId);
      const backfill = await backfillCommissionEntries();
      return res.status(200).json({ prices: saved, backfillCreated: backfill.created });
    }

    return res.status(400).json({ error: 'Provide price or prices in request body' });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to save item prices' });
  }
});

router.post('/settings/plain-cloth', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const item = await createPlainClothPricing({
      name: String(req.body?.name ?? ''),
      pricePerM: Number(req.body?.pricePerM),
    });
    return res.status(201).json({ item });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to create plain cloth type' });
  }
});

router.put('/settings/plain-cloth/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const item = await updatePlainClothPricing(id, {
      name: req.body?.name !== undefined ? String(req.body.name) : undefined,
      pricePerM: req.body?.pricePerM !== undefined ? Number(req.body.pricePerM) : undefined,
      isActive: req.body?.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
    });
    return res.status(200).json({ item });
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to update plain cloth type' });
  }
});

router.delete('/settings/plain-cloth/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await deletePlainClothPricing(id);
    return res.status(200).json(result);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to delete plain cloth type' });
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
