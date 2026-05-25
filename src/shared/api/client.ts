import axios from "axios";
import {
  clearStoredAccessToken,
  getStoredAccessToken,
  setStoredAccessToken,
} from "@/shared/auth/tokenStorage";
import {
  getTurnstileTokenForMutation,
  getTurnstileHeaderName,
} from "@/shared/security/turnstile";
import { resolveApiBaseUrl } from "@/shared/config/apiBaseUrl";

// ============================================
// SHARED API CLIENT (Singleton)
// Axios instance with JWT interceptors
// ============================================

const API_BASE_URL = resolveApiBaseUrl();
const CSRF_COOKIE_NAME = "X-CSRF-TOKEN";
const REFRESH_ENDPOINT = "/Auth/refreshToken";

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Required for JWT refresh token cookies
});

// Request interceptor — attach JWT token
apiClient.interceptors.request.use(async (config) => {
  const token = getStoredAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const method = (config.method || "get").toLowerCase();
  const requiresCsrf = method !== "get" && method !== "head" && method !== "options";
  if (requiresCsrf) {
    const csrfToken = getCookieValue(CSRF_COOKIE_NAME);
    if (csrfToken) {
      config.headers["X-CSRF-TOKEN"] = csrfToken;
    }

    const hasExplicitTurnstileToken =
      (config.data instanceof FormData && config.data.has("turnstileToken")) ||
      (config.data &&
        typeof config.data === "object" &&
        Object.prototype.hasOwnProperty.call(config.data as Record<string, unknown>, "turnstileToken"));

    const explicitPayloadToken =
      config.data instanceof FormData
        ? (config.data.get("turnstileToken") as string | null) ?? undefined
        : config.data && typeof config.data === "object"
          ? ((config.data as Record<string, unknown>).turnstileToken as string | undefined)
          : undefined;

    if (hasExplicitTurnstileToken && explicitPayloadToken) {
      config.headers[getTurnstileHeaderName()] = explicitPayloadToken;
    } else {
      try {
        const dynamicToken = await getTurnstileTokenForMutation();
        if (dynamicToken) {
          config.headers[getTurnstileHeaderName()] = dynamicToken;
        }
      } catch {
        // Keep request flow resilient: backend will decide whether token is mandatory.
      }
    }
  }

  return config;
});

// Response interceptor — handle 401 and token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token);
    } else {
      prom.reject(error);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry the refresh endpoint itself
      if (originalRequest.url?.includes("/Auth/refreshToken")) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue this request until the refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject: (err: unknown) => {
              reject(err);
            },
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const expiredToken = getStoredAccessToken();
        if (!expiredToken) {
          processQueue(error, null);
          return Promise.reject(error);
        }

        const response = await apiClient.post("/Auth/refreshToken", {
          expiredAccessToken: expiredToken,
        });

        const { accessToken } = response.data;
        setStoredAccessToken(accessToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        processQueue(null, accessToken);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearStoredAccessToken();
        localStorage.removeItem("walletConnected");
        localStorage.removeItem("walletAddress");
        // Dispatch a custom event so WalletContext can react
        window.dispatchEvent(new Event("auth:session-expired"));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
