// ============================================
// PROJECT FEATURE — API Service Layer
// ============================================

import apiClient from "@/shared/api/client";

// ── Payloads ──

export interface CreateProjectPayload {
  title: string;
  projectType: string;
  currentPhase?: string;
  startDate?: string;
  expectedCompletion?: string;
  region: string;
  province?: string;
  municipality: string;
  barangay: string;
  rdcProposedBudget?: number;
  approvedBudget: number;
  fundSource?: string;
  contractorName?: string;
  pcabLicense?: string;
  dpwhRegion?: string;
  lguApproval?: string;
  inspectorName?: string;
  priorityLevel?: string;
  justification?: string;
  category?: string;
  createdByWallet?: string;
  status?: string;
  // Target-based Progress & Geolocation
  targetPercent?: number;
  currentProgress?: number;
  siteLatitude?: number;
  siteLongitude?: number;
  isLocationAnchored?: boolean;
  blockchainDataHash?: string;
}

export interface UpdateProjectStatusPayload {
  status: string;
  remarks?: string;
  actorName?: string;
  actorWallet?: string;
  actorRole?: string;
  blockchainTxHash?: string;
  blockchainDataHash?: string;
  approvedBudget?: number;
}

// ── Project API ──

export const projectApi = {
  getAll: () => apiClient.get("/Project"),

  getById: (id: string) => apiClient.get(`/Project/${id}`),

  getByStatus: (status: string) => apiClient.get(`/Project/status/${status}`),

  getByRegion: (region: string) => apiClient.get(`/Project/region/${region}`),

  create: (data: CreateProjectPayload) => apiClient.post("/Project", data),

  update: (id: string, data: Partial<CreateProjectPayload>) =>
    apiClient.put(`/Project/${id}`, data),

  updateStatus: (id: string, data: UpdateProjectStatusPayload) =>
    apiClient.patch(`/Project/${id}/status`, data),

  delete: (id: string) => apiClient.delete(`/Project/${id}`),
};
