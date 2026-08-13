import { Router, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/authenticate';
import {
  createEmployee,
  getEmployeeById,
  listBranches,
  listEmployees,
  listPendingEmployees,
  approveEmployee,
  rejectEmployee,
  updateEmployee,
} from '../lib/employees';
import {
  EMPLOYEE_SECTION_KEYS,
  EmployeeSectionKey,
  parseAllowedSections,
} from '../lib/employeeSections';

const router = Router();

const singleParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

router.use(authenticate);
router.use(requireRole('ADMIN', 'MANAGER'));

const parseRole = (value: unknown): UserRole | null => {
  if (value === 'ADMIN' || value === 'MANAGER' || value === 'EMPLOYEE' || value === 'TRUSTEE') {
    return value;
  }
  return null;
};

const parseSections = (value: unknown): EmployeeSectionKey[] | undefined => {
  const parsed = parseAllowedSections(value);
  return parsed ?? undefined;
};

router.get('/', async (_req: Request, res: Response) => {
  try {
    const employees = await listEmployees();
    return res.status(200).json({ employees });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list employees' });
  }
});

router.get('/sections', (_req: Request, res: Response) => {
  return res.status(200).json({ sections: EMPLOYEE_SECTION_KEYS });
});

router.get('/branches/list', async (_req: Request, res: Response) => {
  try {
    const branches = await listBranches();
    return res.status(200).json({ branches });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list branches' });
  }
});

router.get('/pending', async (_req: Request, res: Response) => {
  try {
    const employees = await listPendingEmployees();
    return res.status(200).json({ employees });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to list pending registrations' });
  }
});

router.post('/:id/approve', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { branchIds, allowedSections, assignedWork } = req.body;
    const employee = await approveEmployee(singleParam(req.params.id) ?? '', {
      branchIds: Array.isArray(branchIds) ? branchIds.map(String) : undefined,
      allowedSections: parseSections(allowedSections),
      assignedWork: assignedWork ? String(assignedWork) : undefined,
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
    });
    return res.status(200).json({ message: 'Employee approved', employee });
  } catch (error: any) {
    const status = error.message === 'Pending registration not found' ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to approve employee' });
  }
});

router.post('/:id/reject', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    await rejectEmployee(singleParam(req.params.id) ?? '', {
      reason: reason ? String(reason) : undefined,
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
    });
    return res.status(200).json({ message: 'Registration rejected' });
  } catch (error: any) {
    const status = error.message === 'Pending registration not found' ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to reject registration' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const employee = await getEmployeeById(singleParam(req.params.id) ?? '');
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    return res.status(200).json({ employee });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to get employee' });
  }
});

router.post('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, role, assignedWork, allowedSections, branchIds } =
      req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const parsedRole = parseRole(role) ?? 'EMPLOYEE';
    const employee = await createEmployee({
      name: String(name),
      email: String(email),
      password: String(password),
      phone: phone ? String(phone) : undefined,
      role: parsedRole,
      assignedWork: assignedWork ? String(assignedWork) : undefined,
      allowedSections: parseSections(allowedSections),
      branchIds: Array.isArray(branchIds) ? branchIds.map(String) : undefined,
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
    });

    return res.status(201).json({ message: 'Employee account created', employee });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to create employee' });
  }
});

router.patch('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, phone, role, assignedWork, allowedSections, branchIds, isActive, password } =
      req.body;

    const parsedRole = role === undefined ? undefined : parseRole(role);
    if (role !== undefined && !parsedRole) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const employee = await updateEmployee(singleParam(req.params.id) ?? '', {
      name: name !== undefined ? String(name) : undefined,
      phone: phone !== undefined ? (phone ? String(phone) : null) : undefined,
      role: parsedRole ?? undefined,
      assignedWork: assignedWork !== undefined ? String(assignedWork || '') : undefined,
      allowedSections:
        allowedSections === undefined ? undefined : parseSections(allowedSections) ?? [],
      branchIds: Array.isArray(branchIds) ? branchIds.map(String) : undefined,
      isActive: typeof isActive === 'boolean' ? isActive : undefined,
      password: password ? String(password) : undefined,
      performedById: req.user!.userId,
      performedByEmail: req.user!.email,
    });

    return res.status(200).json({ message: 'Employee updated', employee });
  } catch (error: any) {
    const status = error.message === 'Employee not found' ? 404 : 400;
    return res.status(status).json({ error: error.message || 'Failed to update employee' });
  }
});

export default router;
