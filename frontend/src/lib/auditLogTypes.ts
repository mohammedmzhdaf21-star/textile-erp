export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VOID'
  | 'RESTORE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'REFUND';

export const AUDIT_ACTIONS: AuditAction[] = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'VOID',
  'RESTORE',
  'LOGIN',
  'LOGOUT',
  'REFUND',
];
