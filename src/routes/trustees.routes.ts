import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import {
  createTrusteeRule,
  deleteTrusteeRule,
  listTrusteeRules,
  updateTrusteeRule,
} from '../lib/trustees';
import { writeAuditLog } from '../lib/auditLog';
import { toInputJson } from '../lib/routeHelpers';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const includeInactive =
      req.query.includeInactive === 'true' &&
      (req.user!.role === 'ADMIN' || req.user!.role === 'MANAGER');
    const rules = await listTrusteeRules({ includeInactive });
    return res.status(200).json({ rules });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list trustee rules' });
  }
});

router.post('/', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const rule = await createTrusteeRule({
      trusteeName: String(req.body?.trusteeName ?? ''),
      contactInfo: req.body?.contactInfo !== undefined ? String(req.body.contactInfo) : undefined,
      branches: Array.isArray(req.body?.branches) ? req.body.branches.map(String) : [],
      percentage: Number(req.body?.percentage),
      isActive: req.body?.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
    });

    await writeAuditLog({
      entityType: 'TrusteeRule',
      entityId: rule.id,
      action: 'CREATE',
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
      changes: toInputJson(rule),
    });

    return res.status(201).json({ rule });
  } catch (error: any) {
    const status = error.message?.includes('already exists') ? 409 : 400;
    return res.status(status).json({ error: error.message || 'Failed to create trustee rule' });
  }
});

router.put('/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rule = await updateTrusteeRule(id, {
      trusteeName: String(req.body?.trusteeName ?? ''),
      contactInfo: req.body?.contactInfo !== undefined ? String(req.body.contactInfo) : undefined,
      branches: Array.isArray(req.body?.branches) ? req.body.branches.map(String) : [],
      percentage: Number(req.body?.percentage),
      isActive: req.body?.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
    });

    await writeAuditLog({
      entityType: 'TrusteeRule',
      entityId: rule.id,
      action: 'UPDATE',
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
      changes: toInputJson(rule),
    });

    return res.status(200).json({ rule });
  } catch (error: any) {
    const status = error.message?.includes('not found')
      ? 404
      : error.message?.includes('already exists')
      ? 409
      : 400;
    return res.status(status).json({ error: error.message || 'Failed to update trustee rule' });
  }
});

router.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await deleteTrusteeRule(id);

    await writeAuditLog({
      entityType: 'TrusteeRule',
      entityId: id,
      action: 'DELETE',
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
      changes: toInputJson(result),
    });

    return res.status(200).json(result);
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to delete trustee rule' });
  }
});

export default router;
