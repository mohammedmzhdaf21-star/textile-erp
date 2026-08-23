import { AxiosError } from 'axios';

const TRANSIENT_STATUSES = new Set([502, 503, 504, 530]);

export function isTransientApiError(status?: number): boolean {
  return status !== undefined && TRANSIENT_STATUSES.has(status);
}

export function formatApiError(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback;

  const axiosErr = err as AxiosError<{ error?: string; message?: string } | string>;
  const status = axiosErr.response?.status;
  const body = axiosErr.response?.data;

  if (typeof body === 'string') {
    if (/error code:\s*1033/i.test(body)) {
      return 'Connection to server is reconnecting. Please wait and try again.';
    }
    if (/error code:\s*530/i.test(body)) {
      return 'Server temporarily unreachable. Please try again in a few seconds.';
    }
  }

  if (isTransientApiError(status)) {
    return 'Server temporarily unreachable. Please try again in a few seconds.';
  }

  if (body && typeof body === 'object') {
    return body.error ?? body.message ?? axiosErr.message ?? fallback;
  }

  return axiosErr.message ?? fallback;
}
