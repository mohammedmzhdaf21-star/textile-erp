import { Request } from 'express';

/**
 * Sale/exchange employeeId must come from the JWT, not the client body,
 * unless an ADMIN explicitly attributes the sale to another employee.
 */
export function resolveSaleEmployeeId(
  req: Request,
  bodyEmployeeId?: unknown
): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new Error('User identification missing');
  }

  const requested =
    typeof bodyEmployeeId === 'string' && bodyEmployeeId.trim().length > 0
      ? bodyEmployeeId.trim()
      : null;

  if (!requested || requested === userId) {
    return userId;
  }

  if (req.user?.role === 'ADMIN') {
    return requested;
  }

  throw new Error('Cannot create a sale for another employee');
}
