import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { createShopBranch, listShopBranches, removeShopBranch } from '../lib/branches';

const router = Router();

router.use(authenticate);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const branches = await listShopBranches();
    return res.status(200).json({ branches });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list branches' });
  }
});

router.post('/', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const branch = await createShopBranch({
      code: String(req.body?.code ?? ''),
      name: String(req.body?.name ?? ''),
    });
    return res.status(201).json({ branch });
  } catch (error: any) {
    const msg = error.message || 'Failed to add branch';
    if (msg.includes('required') || msg.includes('must') || msg.includes('reserved') || msg.includes('exists') || msg.includes('left')) {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
});

router.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) return res.status(400).json({ error: 'Branch id is required' });
    const result = await removeShopBranch(id);
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || 'Failed to remove branch';
    if (msg.includes('not found')) return res.status(404).json({ error: msg });
    if (msg.includes('must stay')) return res.status(400).json({ error: msg });
    return res.status(500).json({ error: msg });
  }
});

export default router;
