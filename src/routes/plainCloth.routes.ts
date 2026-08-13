import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { writeAuditLog } from '../lib/auditLog';
import {
  createPlainClothPricing,
  deletePlainClothPricing,
  listPlainClothPricing,
  updatePlainClothPricing,
} from '../lib/plainClothPricing';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
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

router.post('/', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const item = await createPlainClothPricing({
      name: String(req.body?.name ?? ''),
      pricePerM: Number(req.body?.pricePerM),
    });
    await writeAuditLog({
      entityType: 'PlainClothPricing',
      entityId: item.id,
      action: 'CREATE',
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
      changes: { name: item.name, pricePerM: item.pricePerM },
    });
    return res.status(201).json({ item });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to create plain cloth type' });
  }
});

router.put('/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const item = await updatePlainClothPricing(id, {
      name: req.body?.name !== undefined ? String(req.body.name) : undefined,
      pricePerM: req.body?.pricePerM !== undefined ? Number(req.body.pricePerM) : undefined,
      isActive: req.body?.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
    });
    await writeAuditLog({
      entityType: 'PlainClothPricing',
      entityId: item.id,
      action: 'UPDATE',
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
      changes: { name: item.name, pricePerM: item.pricePerM, isActive: item.isActive },
    });
    return res.status(200).json({ item });
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to update plain cloth type' });
  }
});

router.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await deletePlainClothPricing(id);
    await writeAuditLog({
      entityType: 'PlainClothPricing',
      entityId: id,
      action: 'DELETE',
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
      changes: result as Record<string, unknown>,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to delete plain cloth type' });
  }
});

export default router;
