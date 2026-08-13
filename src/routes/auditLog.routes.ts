import { Router, Request, Response } from 'express';
import { AuditAction } from '@prisma/client';
import { authenticate } from '../middleware/authenticate';
import { listAuditLogEntityTypes, listAuditLogs } from '../lib/auditLog';

const router = Router();

router.use(authenticate);

const VALID_ACTIONS = new Set<string>(Object.values(AuditAction));

router.get('/', async (req: Request, res: Response) => {
  try {
    const actionParam = typeof req.query.action === 'string' ? req.query.action : undefined;
    const action =
      actionParam && VALID_ACTIONS.has(actionParam) ? (actionParam as AuditAction) : undefined;

    const result = await listAuditLogs({
      page: req.query.page ? parseInt(String(req.query.page), 10) : 1,
      pageSize: req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : 50,
      fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
      toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
      action,
      entityType: typeof req.query.entityType === 'string' ? req.query.entityType : undefined,
      performedById:
        typeof req.query.performedById === 'string' ? req.query.performedById : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      viewerId: req.user!.userId,
      viewerRole: req.user!.role,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list activity history' });
  }
});

router.get('/entity-types', async (req: Request, res: Response) => {
  try {
    const types = await listAuditLogEntityTypes(req.user!.userId, req.user!.role);
    return res.status(200).json({ entityTypes: types });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list entity types' });
  }
});

export default router;
