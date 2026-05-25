// ============================================
// MILESTONE FEATURE — API Service Layer
// ============================================

import apiClient from "@/shared/api/client";
import { resolveApiBaseUrl } from "@/shared/config/apiBaseUrl";

// ── Payloads ──

export interface CreateMilestonePayload {
  projectId: string;
  phase: string;
  milestoneName: string;
  description: string;
  requestedAmount: number;
  targetProgress: number;
  photosCount?: number;
  gpsVerified?: boolean;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAccuracy?: string;
  contractorWallet?: string;
  targetCompletion?: string;
  // Blockchain & verification
  blockchainTxHash?: string;
  blockchainDataHash?: string;
  materialsHash?: string;
  contractorRemarks?: string;
}

export interface UpdateMilestoneStatusPayload {
  status: string;
  inspectorRemarks?: string;
  blockchainTxHash?: string;
  blockchainDataHash?: string;
}

// ── Photo Types ──

export interface PhotoGpsInput {
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAccuracy?: number;
  gpsTimestamp?: string;
  distanceFromSite?: number;
  // Forensic metadata
  gpsAltitude?: number;
  gpsDirection?: number;
  deviceMake?: string;
  deviceModel?: string;
  deviceSignature?: string;
  software?: string;
  sourceType?: string;
  sourceVerdict?: string;
  isTampered?: boolean;
  tamperReason?: string;
  dateTimeOriginal?: string;
  forensicFlags?: string;
}

export interface MilestonePhotoResponse {
  id: number;
  milestoneId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAccuracy?: number;
  gpsTimestamp?: string;
  distanceFromSite?: number;
  // Forensic metadata
  gpsAltitude?: number;
  gpsDirection?: number;
  deviceMake?: string;
  deviceModel?: string;
  deviceSignature?: string;
  software?: string;
  sourceType?: string;
  sourceVerdict?: string;
  isTampered?: boolean;
  tamperReason?: string;
  dateTimeOriginal?: string;
  forensicFlags?: string;
  uploadedAt: string;
  base64Data?: string;
}

export interface PhotoMetadata {
  id: number;
  fileName: string;
  contentType: string;
  fileSize: number;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAccuracy?: number;
  gpsTimestamp?: string;
  distanceFromSite?: number;
  // Forensic metadata
  gpsAltitude?: number;
  gpsDirection?: number;
  deviceMake?: string;
  deviceModel?: string;
  deviceSignature?: string;
  software?: string;
  sourceType?: string;
  sourceVerdict?: string;
  isTampered?: boolean;
  tamperReason?: string;
  dateTimeOriginal?: string;
  forensicFlags?: string;
  hasGps: boolean;
  uploadedAt: string;
}

// ── Blueprint Types ──

export interface BlueprintResponse {
  id: number;
  projectId: string;
  label: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedByWallet?: string;
  uploadedAt: string;
  verificationStatus: string;
  verifiedByWallet?: string;
  verifiedAt?: string;
  verificationRemarks?: string;
  blockchainTxHash?: string;
  base64Data?: string;
}

export interface VerifyBlueprintPayload {
  verificationStatus: string;
  verifiedByWallet?: string;
  verificationRemarks?: string;
  blockchainTxHash?: string;
}

// ── Milestone API ──

export const milestoneApi = {
  getAll: () => apiClient.get("/Milestone"),

  getByProjectId: (projectId: string) =>
    apiClient.get(`/Milestone/project/${projectId}`),

  getById: (id: string) => apiClient.get(`/Milestone/${id}`),

  getByStatus: (status: string) => apiClient.get(`/Milestone/status/${status}`),

  create: (data: CreateMilestonePayload) => apiClient.post("/Milestone", data),

  updateStatus: (id: string, data: UpdateMilestoneStatusPayload) =>
    apiClient.patch(`/Milestone/${id}/status`, data),

  delete: (id: string) => apiClient.delete(`/Milestone/${id}`),
};

// ── Photo API ──

export const milestonePhotoApi = {
  /** Upload photos for a milestone (multipart/form-data) */
  upload: (milestoneId: string, files: File[], gpsInputs?: PhotoGpsInput[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    if (gpsInputs) {
      formData.append("gpsData", JSON.stringify(gpsInputs));
    }
    return apiClient.post(`/MilestonePhoto/${milestoneId}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  /** Get all photos for a milestone (with base64 data) */
  getByMilestoneId: (milestoneId: string) =>
    apiClient.get<MilestonePhotoResponse[]>(`/MilestonePhoto/${milestoneId}`),

  /** Get only metadata (no file data) for manual GPS inspection */
  getMetadata: (milestoneId: string) =>
    apiClient.get<PhotoMetadata[]>(`/MilestonePhoto/${milestoneId}/metadata`),

  /** Get download URL for a single photo */
  getFileUrl: (photoId: number) => `${resolveApiBaseUrl()}/api/MilestonePhoto/file/${photoId}`,
};

// ── Blueprint API ──

export const blueprintApi = {
  /** Upload a blueprint file */
  upload: (projectId: string, label: string, file: File, uploadedByWallet?: string) => {
    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("label", label);
    formData.append("file", file);
    if (uploadedByWallet) formData.append("uploadedByWallet", uploadedByWallet);
    return apiClient.post<BlueprintResponse>("/Blueprint", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  /** Get all blueprints for a project */
  getByProjectId: (projectId: string) =>
    apiClient.get<BlueprintResponse[]>(`/Blueprint/project/${projectId}`),

  /** Get a single blueprint */
  getById: (id: number) =>
    apiClient.get<BlueprintResponse>(`/Blueprint/${id}`),

  /** Verify a blueprint (site engineer) */
  verify: (id: number, data: VerifyBlueprintPayload) =>
    apiClient.patch<BlueprintResponse>(`/Blueprint/${id}/verify`, data),

  /** Get file download URL */
  getFileUrl: (id: number) => `${resolveApiBaseUrl()}/api/Blueprint/${id}/file`,
};
