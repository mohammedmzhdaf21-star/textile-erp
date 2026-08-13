import { Prisma } from '@prisma/client';

export function singleRouteParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

export function requireRouteParam(value: string | string[] | undefined, name = 'id'): string {
  const param = singleRouteParam(value);
  if (!param) {
    throw new RouteValidationError(`${name} is required`);
  }
  return param;
}

export function parsePage(value: unknown, fallback = 1): number {
  const parsed = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export function parsePageSize(value: unknown, fallback = 50, max = 200): number {
  const parsed = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.floor(parsed);
}

export function parseQueryDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date;
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class RouteValidationError extends Error {
  status = 400;
}

export class RouteNotFoundError extends Error {
  status = 404;
}

export class RouteForbiddenError extends Error {
  status = 403;
}

export function mapRouteError(error: unknown): { status: number; message: string } {
  if (error instanceof RouteValidationError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof RouteNotFoundError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof RouteForbiddenError) {
    return { status: error.status, message: error.message };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return { status: 409, message: 'Record already exists' };
      case 'P2025':
        return { status: 404, message: 'Record not found' };
      case 'P2003':
        return { status: 400, message: 'Invalid reference' };
      default:
        break;
    }
  }

  if (error instanceof Error) {
    const msg = error.message || 'Request failed';
    if (msg.includes('not found') || msg === 'Employee not found' || msg === 'Task not found') {
      return { status: 404, message: msg };
    }
    if (msg.includes('access') || msg.includes('Forbidden') || msg.includes('permission')) {
      return { status: 403, message: msg };
    }
    return { status: 400, message: msg };
  }

  return { status: 500, message: 'Something went wrong' };
}

export function sendRouteError(res: import('express').Response, error: unknown, fallback = 'Request failed') {
  const mapped = mapRouteError(error);
  if (mapped.status >= 500) {
    console.error('Route error:', error);
  }
  return res.status(mapped.status).json({ error: mapped.message || fallback });
}
