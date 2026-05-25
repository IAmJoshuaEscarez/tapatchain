// ============================================
// PROPOSAL DOCUMENT FEATURE — API Service Layer
// Upload/download documents attached to proposals
// ============================================

import apiClient from "@/shared/api/client";
import { resolveApiBaseUrl } from "@/shared/config/apiBaseUrl";

// ── Response type (metadata only) ──
export interface ProposalDocumentResponse {
  id: number;
  projectId: string;
  key: string;
  name: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  hash: string;
  uploadedAt: string;
}

// ── API ──
export const proposalDocumentApi = {
  /** Get all document metadata for a project */
  getByProjectId: (projectId: string) =>
    apiClient.get<ProposalDocumentResponse[]>(`/ProposalDocument/project/${projectId}`),

  /** Get the raw file for inline viewing / download */
  getFileUrl: (documentId: number) => {
    const base = resolveApiBaseUrl();
    return `${base}/api/ProposalDocument/${documentId}/file`;
  },

  /** Upload a document (multipart form data) */
  upload: (projectId: string, key: string, name: string, hash: string, file: File) => {
    const form = new FormData();
    form.append("projectId", projectId);
    form.append("key", key);
    form.append("name", name);
    form.append("hash", hash);
    form.append("file", file);
    return apiClient.post<ProposalDocumentResponse>("/ProposalDocument/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};
