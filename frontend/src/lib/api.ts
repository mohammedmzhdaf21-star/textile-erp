import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';

export const api = axios.create({
  baseURL: apiBaseUrl.replace(/\/$/, ''),
  headers: {
    'Content-Type': 'application/json',
  },
});

const RETRYABLE_STATUSES = new Set([502, 503, 504, 530]);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1200;

type RetryConfig = InternalAxiosRequestConfig & { __retryCount?: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    const method = (config?.method ?? 'get').toLowerCase();
    const isIdempotent = method === 'get' || method === 'head' || method === 'options';
    const retryCount = config?.__retryCount ?? 0;
    const shouldRetry =
      config &&
      isIdempotent &&
      retryCount < MAX_RETRIES &&
      (RETRYABLE_STATUSES.has(status ?? 0) || !error.response);

    if (shouldRetry) {
      config.__retryCount = retryCount + 1;
      await sleep(RETRY_DELAY_MS * config.__retryCount);
      return api(config);
    }

    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      if (!url.includes('/auth/login') && window.location.pathname !== '/login') {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
