// ============================================
// AUTH FEATURE — API Service Layer
// ============================================

import apiClient from "@/shared/api/client";
import type { UserProfile } from "@/shared/types";

// ── Payloads ──

export interface WalletLoginPayload {
  walletAddress: string;
  signature: string;
  message: string;
  nonce: string;
  turnstileToken: string;
  // Backward-compat field for older backend deployments.
  recaptchaToken?: string;
  displayName?: string;
  role?: string;
  region?: string;
}

export interface AdminRegisterUserPayload {
  fullName: string;
  walletAddress: string;
  role: string;
  region?: string;
  regionCode: number;
  email?: string;
  noaReference?: string;
  prcLicenseNumber?: string;
  documentHash?: string;
}

// ── Auth API ──

export const authApi = {
  register: (email: string, password: string) =>
    apiClient.post("/Auth/register", { email, password }),

  login: (email: string, password: string) =>
    apiClient.post("/Auth/login", { email, password }),

  walletChallenge: (walletAddress: string) =>
    apiClient.get<{ message: string; nonce: string; expiresAt: string }>(
      `/Auth/wallet-challenge/${walletAddress}`
    ),

  walletLogin: (data: WalletLoginPayload) =>
    apiClient.post("/Auth/wallet-login", data),

  getProfile: () => apiClient.get<UserProfile>("/Auth/me"),

  updateProfile: (data: {
    displayName?: string;
    email?: string;
    assignedRegion?: string;
    profilePhoto?: string;
  }) => apiClient.put("/Auth/profile", data),

  assignRole: (userId: string, data: { role: string; region?: string }) =>
    apiClient.post(`/Auth/assign-role/${userId}`, data),

  getAllUsers: () => apiClient.get<UserProfile[]>("/Auth/users"),

  roleExistsInRegion: (role: string, region: string) =>
    apiClient.get<{ exists: boolean }>("/Auth/role-exists", { params: { role, region } }),

  coaRegisterAuditor: (data: {
    walletAddress: string;
    region: string;
    regionCode: number;
    transactionHash: string;
    fullName?: string;
    email?: string;
  }) => apiClient.post("/Auth/coa/register-auditor", data),

  getRegionalAuditors: () => apiClient.get<UserProfile[]>("/Auth/regional-auditors"),

  logout: () => apiClient.post("/Auth/logout"),

  refreshToken: (expiredAccessToken: string) =>
    apiClient.post("/Auth/refreshToken", { expiredAccessToken }),
};

// ── Admin API (Auth sub-domain) ──

export const adminApi = {
  registerUser: (data: AdminRegisterUserPayload) =>
    apiClient.post<UserProfile>("/Auth/admin/register-user", data),

  whitelistUser: (userId: string, transactionHash: string) =>
    apiClient.post<UserProfile>(`/Auth/admin/whitelist-user/${userId}`, {
      transactionHash,
    }),

  getAllUsers: () => apiClient.get<UserProfile[]>("/Auth/users"),

  checkWalletExists: (walletAddress: string) =>
    apiClient.get<{
      exists: boolean;
      currentRole?: string;
      upgradeable: boolean;
    }>(`/Auth/admin/check-wallet/${walletAddress}`),

  rejectUser: (userId: string, remarks?: string) =>
    apiClient.post<UserProfile>(`/Auth/admin/reject-user/${userId}`, {
      remarks,
    }),
};
