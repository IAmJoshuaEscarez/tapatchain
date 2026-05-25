// ── Stakeholder Feature — API Layer ──

import apiClient from "@/shared/api/client";

// ── Types ──

export interface CreateStakeholderPayload {
  name: string;
  type: string; // Contractor, Inspector, ProjectType
  walletAddress?: string;
  licenseNo?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  region?: string;
  description?: string;
  // Blockchain registration traceability
  registeredByWallet?: string;
  registrationTxHash?: string;
  registrationDataHash?: string;
  blockchainDataHash?: string;
  onChainConfirmed?: boolean;
}

export interface StakeholderResponse {
  id: string;
  name: string;
  type: string;
  walletAddress?: string;
  licenseNo?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  region?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  // Blockchain registration traceability
  registeredByWallet?: string;
  registrationTxHash?: string;
  registrationDataHash?: string;
  onChainConfirmed?: boolean;
  blockchainDataHash?: string;
  offchainDataHash?: string;
  integrityStatus?: string;
  isTampered?: boolean;
  tamperedAt?: string;
  integrityCheckedAt?: string;
}

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  pendingApproval: number;
  totalBudget: number;
  totalDisbursed: number;
  totalMilestones: number;
  approvedMilestones: number;
  rejectedMilestones: number;
  totalContractors: number;
  totalInspectors: number;
  totalAuditEntries: number;
  suspendedProjects: number;
  regionalStats: Array<{
    region: string;
    projectCount: number;
    totalBudget: number;
    fundedCount: number;
    activeCount: number;
  }>;
}

// ── API ──

export const stakeholderApi = {
  getAll: () => apiClient.get<StakeholderResponse[]>("/Stakeholder"),

  getByType: (type: string) =>
    apiClient.get<StakeholderResponse[]>(`/Stakeholder/type/${type}`),

  getById: (id: string) => apiClient.get<StakeholderResponse>(`/Stakeholder/${id}`),

  create: (data: CreateStakeholderPayload) =>
    apiClient.post("/Stakeholder", data),

  update: (id: string, data: Partial<CreateStakeholderPayload> & { isActive?: boolean }) =>
    apiClient.put(`/Stakeholder/${id}`, data),

  delete: (id: string) => apiClient.delete(`/Stakeholder/${id}`),

  getDashboardStats: () =>
    apiClient.get<DashboardStats>("/Stakeholder/dashboard/stats"),
};
