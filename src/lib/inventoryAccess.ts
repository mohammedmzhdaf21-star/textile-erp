import { Request, Response, NextFunction } from 'express';

const EMPLOYEE_ROLL_CONVERSION_TYPES = new Set(['ROLL_TO_PIECE', 'ROLL_TO_REMANENT']);

const EMPLOYEE_PATCH_FIELDS = new Set([
  'version',
  'meters',
  'quantity',
  'qrCodeValue',
  'qrCodeDataUrl',
]);

export function isEmployeeAllowedInventoryCreate(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  const conversionType = String(record.conversionType ?? '');
  const sourceItemId = String(record.sourceItemId ?? '').trim();
  return (
    sourceItemId.length > 0 && EMPLOYEE_ROLL_CONVERSION_TYPES.has(conversionType)
  );
}

export function isEmployeeAllowedInventoryPatch(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record).filter(
    (key) => record[key] !== undefined && record[key] !== null
  );
  if (!keys.includes('version')) return false;
  return keys.every((key) => EMPLOYEE_PATCH_FIELDS.has(key));
}

function hasInventoryManagerAccess(role?: string) {
  return role === 'ADMIN' || role === 'MANAGER';
}

function hasEmployeeStockAccess(role?: string) {
  return role === 'EMPLOYEE' || role === 'TRUSTEE';
}

export function requireInventoryCreateAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (hasInventoryManagerAccess(req.user.role)) {
    next();
    return;
  }

  if (
    hasEmployeeStockAccess(req.user.role) &&
    isEmployeeAllowedInventoryCreate(req.body)
  ) {
    next();
    return;
  }

  res.status(403).json({
    error: 'Forbidden',
    message: 'Inventory creation requires manager access or an approved roll-cut conversion',
    yourRole: req.user.role,
  });
}

export function requireInventoryUpdateAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (hasInventoryManagerAccess(req.user.role)) {
    next();
    return;
  }

  if (
    hasEmployeeStockAccess(req.user.role) &&
    isEmployeeAllowedInventoryPatch(req.body)
  ) {
    next();
    return;
  }

  res.status(403).json({
    error: 'Forbidden',
    message: 'Inventory updates require manager access or an approved stock adjustment',
    yourRole: req.user.role,
  });
}
