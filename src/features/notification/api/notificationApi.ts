// ── Notification Feature — API Layer ──

import apiClient from "@/shared/api/client";

// ── Types ──

export interface CreateNotificationPayload {
  type: string;
  title: string;
  message: string;
  targetRole: string;
  targetUserId?: string;
  sourceRole?: string;
  actionUrl?: string;
  relatedId?: string;
}

export interface NotificationResponse {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  targetRole: string;
  sourceRole?: string;
  actionUrl?: string;
  relatedId?: string;
  createdAt: string;
}

// ── API ──

export const notificationApi = {
  getAll: () => apiClient.get<NotificationResponse[]>("/Notification"),

  getByRole: (role: string) =>
    apiClient.get<NotificationResponse[]>(`/Notification/role/${role}`),

  getByUserId: (userId: string) =>
    apiClient.get<NotificationResponse[]>(`/Notification/user/${userId}`),

  getUnreadCount: (role: string) =>
    apiClient.get<{ count: number }>(`/Notification/unread-count/${role}`),

  create: (data: CreateNotificationPayload) =>
    apiClient.post("/Notification", data),

  markAsRead: (id: string) =>
    apiClient.patch(`/Notification/${id}/read`),

  markAllAsRead: (role: string) =>
    apiClient.patch(`/Notification/read-all/${role}`),

  delete: (id: string) => apiClient.delete(`/Notification/${id}`),

  deleteAll: (role: string) => apiClient.delete(`/Notification/all/${role}`),
};
