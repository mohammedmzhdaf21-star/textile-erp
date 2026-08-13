import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { TRANSIENT_HTTP_STATUSES } from "./apiErrors";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
const MAX_GET_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  __retryCount?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const api = axios.create({
  baseURL: apiBaseUrl.replace(/\/$/, ""),
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableRequestConfig | undefined;
    const status = error.response?.status;
    const method = config?.method?.toLowerCase() ?? "get";
    const retryCount = config?.__retryCount ?? 0;

    if (
      config &&
      method === "get" &&
      status !== undefined &&
      TRANSIENT_HTTP_STATUSES.has(status) &&
      retryCount < MAX_GET_RETRIES
    ) {
      config.__retryCount = retryCount + 1;
      await sleep(RETRY_BASE_DELAY_MS * config.__retryCount);
      return api.request(config);
    }

    if (error.response?.status === 401) {
      const url = error.config?.url || "";
      if (!url.includes("/auth/login") && window.location.pathname !== "/login") {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
