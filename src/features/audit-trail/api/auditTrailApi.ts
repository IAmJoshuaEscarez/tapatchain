// ============================================
// AUDIT TRAIL FEATURE — API Service Layer
// ============================================

import apiClient from "@/shared/api/client";

// ── Payloads ──

export interface CreateAuditEntryPayload {
  actionType: string;
  actorRole: string;
  actorName: string;
  actorWallet?: string;
  projectId: string;
  projectName: string;
  region?: string;
  municipality?: string;
  barangay?: string;
  milestoneId?: string;
  milestoneName?: string;
  description: string;
  amount?: number;
  previousStatus?: string;
  newStatus?: string;
  remarks?: string;
  blockchainTxHash?: string;
  blockchainDataHash?: string;
}

// ── Audit Trail API ──

export const auditTrailApi = {
  getAll: (limit?: number) =>
    apiClient.get("/AuditTrail", { params: limit ? { limit } : {} }),

  getByProject: (projectId: string) =>
    apiClient.get(`/AuditTrail/project/${projectId}`),

  getByAction: (actionType: string) =>
    apiClient.get(`/AuditTrail/action/${actionType}`),

  getByRole: (actorRole: string) =>
    apiClient.get(`/AuditTrail/role/${actorRole}`),

  getByMilestone: (milestoneId: string) =>
    apiClient.get(`/AuditTrail/milestone/${milestoneId}`),

  create: (data: CreateAuditEntryPayload) =>
    apiClient.post("/AuditTrail", data),
};
