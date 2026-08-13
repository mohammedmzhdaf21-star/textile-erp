import type { TFunction } from 'i18next';

type ApiErrorLike = {
  response?: { status?: number; data?: { error?: string; message?: string } };
  message?: string;
};

export const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 530]);

export function getApiErrorDetails(error: unknown) {
  const apiError = error as ApiErrorLike;
  const status = apiError?.response?.status;
  const body = apiError?.response?.data;
  const message = body?.error ?? body?.message ?? apiError?.message;
  return { status, message };
}

export function isTransientApiError(error: unknown) {
  const { status } = getApiErrorDetails(error);
  return status !== undefined && TRANSIENT_HTTP_STATUSES.has(status);
}

export function formatApiError(t: TFunction, error: unknown) {
  const { status, message } = getApiErrorDetails(error);

  if (status === 404) {
    return t('common.notFound', {
      status: t('common.notFoundStatus', { status }),
      message: message ?? t('errors.unexpected'),
    });
  }

  if (isTransientApiError(error) || (!status && message?.toLowerCase().includes('network error'))) {
    return t('common.serverUnavailable', {
      status: status ? t('common.requestFailedStatus', { status }) : '',
      message: message ?? t('common.serverUnavailableHint'),
    });
  }

  return t('common.requestFailed', {
    status: status ? t('common.requestFailedStatus', { status }) : '',
    message: message ?? t('errors.unexpected'),
  });
}
