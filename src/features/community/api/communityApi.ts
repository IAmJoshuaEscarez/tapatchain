// ── Community Feature — API Layer ──

import apiClient from "@/shared/api/client";

// ── Community Feedback Types ──

export interface CreateCommunityFeedbackPayload {
  projectId: string;
  projectName: string;
  location: string;
  photo?: string;
  caption: string;
  submittedBy?: string;
  walletAddress?: string;
}

export interface CommunityFeedbackResponse {
  id: string;
  projectId: string;
  projectName: string;
  location: string;
  photo?: string;
  caption: string;
  likes: number;
  verified: boolean;
  submittedBy?: string;
  walletAddress?: string;
  createdAt: string;
}

export type CommunityReactionType = "like" | "love" | "angry";

export interface CommunityReactionCount {
  reactionType: CommunityReactionType | string;
  count: number;
}

export interface CommunityFeedbackCommentResponse {
  id: string;
  feedbackId: string;
  parentCommentId?: string;
  content: string;
  actorName: string;
  actorWallet?: string;
  createdAt: string;
  replies: CommunityFeedbackCommentResponse[];
}

export interface CommunityFeedbackEngagementResponse {
  feedbackId: string;
  reactionSummary: CommunityReactionCount[];
  totalReactions: number;
  commentsCount: number;
  currentUserReaction?: CommunityReactionType | string;
  comments: CommunityFeedbackCommentResponse[];
}

export interface ReactToCommunityFeedbackPayload {
  reactionType: CommunityReactionType;
  actorKey: string;
  actorName?: string;
  actorWallet?: string;
}

export interface AddCommunityFeedbackCommentPayload {
  content: string;
  actorName?: string;
  actorWallet?: string;
  actorKey?: string;
}

// ── Public Report Types ──

export interface CreatePublicReportPayload {
  projectId: string;
  projectName: string;
  reportType: string;
  description: string;
  latitude?: number;
  longitude?: number;
  photosCount?: number;
  photo?: string;
  reportedBy?: string;
  walletAddress?: string;
}

export interface PublicReportResponse {
  id: string;
  projectId: string;
  projectName: string;
  reportType: string;
  description: string;
  latitude?: number;
  longitude?: number;
  photosCount: number;
  photo?: string;
  reportedBy: string;
  walletAddress?: string;
  status: string;
  reportedDate: string;
}

// ── Community Feedback API ──

export const communityFeedbackApi = {
  getAll: () => apiClient.get<CommunityFeedbackResponse[]>("/CommunityFeedback"),

  getByProject: (projectId: string) =>
    apiClient.get<CommunityFeedbackResponse[]>(`/CommunityFeedback/project/${projectId}`),

  create: (data: CreateCommunityFeedbackPayload) =>
    apiClient.post("/CommunityFeedback", data),

  like: (id: string) => apiClient.post(`/CommunityFeedback/${id}/like`),

  getEngagement: (id: string, actorKey?: string, actorWallet?: string) =>
    apiClient.get<CommunityFeedbackEngagementResponse>(`/CommunityFeedback/${id}/engagement`, {
      params:
        actorKey || actorWallet
          ? {
              ...(actorKey ? { actorKey } : {}),
              ...(actorWallet ? { actorWallet } : {}),
            }
          : undefined,
    }),

  react: (id: string, data: ReactToCommunityFeedbackPayload) =>
    apiClient.post<CommunityFeedbackEngagementResponse>(`/CommunityFeedback/${id}/react`, data),

  addComment: (id: string, data: AddCommunityFeedbackCommentPayload) =>
    apiClient.post<CommunityFeedbackCommentResponse>(`/CommunityFeedback/${id}/comments`, data),

  addReply: (id: string, commentId: string, data: AddCommunityFeedbackCommentPayload) =>
    apiClient.post<CommunityFeedbackCommentResponse>(`/CommunityFeedback/${id}/comments/${commentId}/replies`, data),

  delete: (id: string) => apiClient.delete(`/CommunityFeedback/${id}`),
};

// ── Public Report API ──

export const publicReportApi = {
  getAll: () => apiClient.get<PublicReportResponse[]>("/PublicReport"),

  getByProject: (projectId: string) =>
    apiClient.get<PublicReportResponse[]>(`/PublicReport/project/${projectId}`),

  getByStatus: (status: string) =>
    apiClient.get<PublicReportResponse[]>(`/PublicReport/status/${status}`),

  create: (data: CreatePublicReportPayload) =>
    apiClient.post("/PublicReport", data),

  getEngagement: (id: string, actorKey?: string, actorWallet?: string) =>
    apiClient.get<CommunityFeedbackEngagementResponse>(`/PublicReport/${id}/engagement`, {
      params:
        actorKey || actorWallet
          ? {
              ...(actorKey ? { actorKey } : {}),
              ...(actorWallet ? { actorWallet } : {}),
            }
          : undefined,
    }),

  react: (id: string, data: ReactToCommunityFeedbackPayload) =>
    apiClient.post<CommunityFeedbackEngagementResponse>(`/PublicReport/${id}/react`, data),

  addComment: (id: string, data: AddCommunityFeedbackCommentPayload) =>
    apiClient.post<CommunityFeedbackCommentResponse>(`/PublicReport/${id}/comments`, data),

  addReply: (id: string, commentId: string, data: AddCommunityFeedbackCommentPayload) =>
    apiClient.post<CommunityFeedbackCommentResponse>(`/PublicReport/${id}/comments/${commentId}/replies`, data),

  updateStatus: (id: string, status: string) =>
    apiClient.patch(`/PublicReport/${id}/status`, { status }),

  delete: (id: string) => apiClient.delete(`/PublicReport/${id}`),
};
