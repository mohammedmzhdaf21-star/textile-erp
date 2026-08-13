import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { roleHasFullAccess } from '../lib/employeeSections';
import {
  completeBranchTask,
  completeCuttingBranchTasks,
  countOpenBranchTasks,
  createBranchTask,
  deleteBranchTask,
  hasOpenCuttingTask,
  listBranchTaskAssignments,
  listBranchTasks,
  reopenBranchTask,
  upsertBranchTaskAssignment,
} from '../lib/branchTasks';

const router = Router();

router.use(authenticate);

router.get('/open-count', async (req: Request, res: Response) => {
  try {
    const mine = req.query.mine === 'true';
    const count = await countOpenBranchTasks({
      viewerId: req.user!.userId,
      viewerEmail: req.user!.email,
      viewerRole: req.user!.role,
      mine,
    });
    return res.status(200).json({ count });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to count tasks' });
  }
});

router.get('/assignments', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const branch = typeof req.query.branch === 'string' ? req.query.branch : undefined;
    const assignments = await listBranchTaskAssignments(branch);
    return res.status(200).json({ assignments });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to list task assignments' });
  }
});

router.put('/assignments', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const { branch, templateKey, title, assignedTo, note, schedule } = req.body;
    if (!branch || !templateKey || !title || !assignedTo || !schedule) {
      return res.status(400).json({ error: 'branch, templateKey, title, assignedTo, and schedule are required' });
    }

    const result = await upsertBranchTaskAssignment({
      branch: String(branch),
      templateKey: String(templateKey),
      title: String(title),
      assignedTo: String(assignedTo),
      note: note ? String(note) : '',
      schedule: String(schedule),
    });

    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to save task assignment' });
  }
});

router.get('/cutting/open', async (req: Request, res: Response) => {
  try {
    const branch = typeof req.query.branch === 'string' ? req.query.branch : undefined;
    const code = req.query.code !== undefined ? Number(req.query.code) : undefined;
    const colorName = typeof req.query.colorName === 'string' ? req.query.colorName : undefined;
    if (!branch) {
      return res.status(400).json({ error: 'branch is required' });
    }

    const open = await hasOpenCuttingTask({ branch, code, colorName });
    return res.status(200).json({ open });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to check cutting task' });
  }
});

router.post('/cutting/complete', requireRole('ADMIN', 'MANAGER', 'EMPLOYEE', 'TRUSTEE'), async (req: Request, res: Response) => {
  try {
    const { branch, rollItemId, code, colorName } = req.body;
    if (!branch) {
      return res.status(400).json({ error: 'branch is required' });
    }

    const tasks = await completeCuttingBranchTasks({
      branch: String(branch),
      rollItemId: rollItemId ? String(rollItemId) : undefined,
      code: code !== undefined ? Number(code) : undefined,
      colorName: colorName ? String(colorName) : undefined,
    });

    return res.status(200).json({ tasks });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to complete cutting tasks' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const branch = typeof req.query.branch === 'string' ? req.query.branch : undefined;
    const mine = req.query.mine === 'true';
    const tasks = await listBranchTasks({
      branch,
      viewerId: req.user!.userId,
      viewerEmail: req.user!.email,
      viewerRole: req.user!.role,
      mine,
    });
    return res.status(200).json({ tasks });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to list tasks' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      branch,
      templateKey,
      title,
      assignedTo,
      note,
      schedule,
      dueAt,
      sourceSaleId,
      sourceItemId,
      code,
      colorName,
    } = req.body;

    if (!branch || !templateKey || !title || !assignedTo || !schedule) {
      return res.status(400).json({ error: 'branch, templateKey, title, assignedTo, and schedule are required' });
    }

    const isCuttingTask = String(templateKey) === 'CUTTING_FABRIC_ROLL';
    if (!isCuttingTask && !roleHasFullAccess(req.user!.role)) {
      return res.status(403).json({ error: 'Only managers can create tasks' });
    }

    const task = await createBranchTask({
      branch: String(branch),
      templateKey: String(templateKey),
      title: String(title),
      assignedTo: String(assignedTo),
      note: note ? String(note) : '',
      schedule: String(schedule),
      dueAt: dueAt ? String(dueAt) : undefined,
      sourceSaleId: sourceSaleId ? String(sourceSaleId) : undefined,
      sourceItemId: sourceItemId ? String(sourceItemId) : undefined,
      code: code !== undefined ? Number(code) : undefined,
      colorName: colorName ? String(colorName) : undefined,
    });

    return res.status(201).json({ task });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to create task' });
  }
});

router.patch('/:id/complete', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const checkedBy = req.body?.checkedBy ? String(req.body.checkedBy) : req.user!.email;
    const task = await completeBranchTask(id, checkedBy, {
      userId: req.user!.userId,
      email: req.user!.email,
      role: req.user!.role,
    });
    return res.status(200).json({ task });
  } catch (error: any) {
    const status = error.message === 'Task not found' ? 404 : error.message.includes('access') ? 403 : 400;
    return res.status(status).json({ error: error.message || 'Failed to complete task' });
  }
});

router.patch('/:id/reopen', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const task = await reopenBranchTask(id, {
      userId: req.user!.userId,
      email: req.user!.email,
      role: req.user!.role,
    });
    return res.status(200).json({ task });
  } catch (error: any) {
    const status = error.message === 'Task not found' ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to reopen task' });
  }
});

router.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await deleteBranchTask(id);
    return res.status(200).json({ message: 'Task deleted' });
  } catch (error: any) {
    const status = error.message === 'Task not found' ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to delete task' });
  }
});

export default router;
