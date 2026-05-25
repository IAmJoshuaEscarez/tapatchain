// ============================================
// ENDORSEMENT FEATURE — API Service Layer
// RD endorsement → National Admin approval pipeline
// ============================================

import apiClient from "@/shared/api/client";
import type { EndorsementResponse } from "@/shared/types";

// ── Payloads ──

export interface EndorsementRequestPayload {
  candidateFullName: string;
  candidateWalletAddress: string;
  candidateRole: string;
  candidateEmail?: string;
  noaReference?: string;
  prcLicenseNumber?: string;
  documentHash?: string;
}

// Re-export response type for convenience
export type { EndorsementResponse };

// ── Endorsement API ──

export const endorsementApi = {
  // RD endpoints
  submit: (data: EndorsementRequestPayload) =>
    apiClient.post<EndorsementResponse>("/Endorsement/submit", data),

  getMyEndorsements: () =>
    apiClient.get<EndorsementResponse[]>("/Endorsement/my-endorsements"),

  // National Admin endpoints
  getQueue: (params?: { status?: string; regionCode?: number }) =>
    apiClient.get<EndorsementResponse[]>("/Endorsement/queue", { params }),

  getById: (id: string) =>
    apiClient.get<EndorsementResponse>(`/Endorsement/${id}`),

  approve: (id: string, remarks?: string) =>
    apiClient.post<EndorsementResponse>(`/Endorsement/${id}/approve`, {
      status: "APPROVED",
      remarks,
    }),

  reject: (id: string, remarks?: string) =>
    apiClient.post<EndorsementResponse>(`/Endorsement/${id}/reject`, {
      status: "REJECTED",
      remarks,
    }),

  whitelist: (id: string, transactionHash: string) =>
    apiClient.post<EndorsementResponse>(`/Endorsement/${id}/whitelist`, {
      transactionHash,
    }),
};
