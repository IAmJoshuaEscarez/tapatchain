import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  notificationApi,
  type NotificationResponse,
} from "@/features/notification/api/notificationApi";
import { getStoredAccessToken } from "@/shared/auth/tokenStorage";

// ============================================
// NOTIFICATION CONTEXT
// Cross-role notification system with API integration
// ============================================

export type NotificationType = "info" | "success" | "warning" | "error" | "milestone" | "approval" | "rejection";
export type UserRole = "rdc" | "admin" | "contractor" | "inspector" | "auditor" | "overseer" | "public";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  targetRole: UserRole | "all";
  sourceRole?: UserRole;
  actionUrl?: string;
  relatedId?: string; // projectId or milestoneId
  metadata?: Record<string, unknown>;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAllNotifications: () => void;
  getNotificationsByRole: (role: UserRole) => Notification[];
  getUnreadCountByRole: (role: UserRole) => number;
  loadNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Map API response to local Notification shape
function mapApiNotification(n: NotificationResponse): Notification {
  return {
    id: n.id,
    type: n.type as NotificationType,
    title: n.title,
    message: n.message,
    timestamp: n.createdAt,
    read: n.isRead,
    targetRole: n.targetRole as UserRole | "all",
    sourceRole: n.sourceRole as UserRole | undefined,
    actionUrl: n.actionUrl,
    relatedId: n.relatedId,
  };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem("tapatchain_notifications");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationApi.getAll();
      const mapped = res.data.map(mapApiNotification);
      setNotifications(mapped);
    } catch {
      console.warn("Could not load notifications from API, using local data.");
    }
  }, []);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (token) {
      loadNotifications();
    }
  }, [loadNotifications]);

  useEffect(() => {
    localStorage.setItem("tapatchain_notifications", JSON.stringify(notifications));
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const addNotification = (notification: Omit<Notification, "id" | "timestamp" | "read">) => {
    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications((prev) => [newNotification, ...prev]);

    notificationApi
      .create({
        type: notification.type,
        title: notification.title,
        message: notification.message,
        targetRole: notification.targetRole,
        sourceRole: notification.sourceRole,
        actionUrl: notification.actionUrl,
        relatedId: notification.relatedId,
      })
      .catch(() => {});
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    notificationApi.markAsRead(id).catch(() => {});
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    notificationApi.delete(id).catch(() => {});
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const getNotificationsByRole = (role: UserRole) => {
    return notifications.filter((n) => n.targetRole === role || n.targetRole === "all");
  };

  const getUnreadCountByRole = (role: UserRole) => {
    return notifications.filter(
      (n) => !n.read && (n.targetRole === role || n.targetRole === "all")
    ).length;
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotification,
        clearAllNotifications,
        getNotificationsByRole,
        getUnreadCountByRole,
        loadNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}

// Helper functions for common notification types
export const notificationHelpers = {
  projectEndorsed: (projectTitle: string, projectId: string) => ({
    type: "approval" as NotificationType,
    title: "New Project Endorsed",
    message: `"${projectTitle}" has been endorsed by RDC and is awaiting your budget approval.`,
    targetRole: "admin" as UserRole,
    sourceRole: "rdc" as UserRole,
    actionUrl: "/admin",
    relatedId: projectId,
  }),

  budgetApproved: (projectTitle: string, projectId: string, budget: string) => ({
    type: "success" as NotificationType,
    title: "Budget Approved",
    message: `Budget of ${budget} approved for "${projectTitle}". You may now begin project implementation.`,
    targetRole: "contractor" as UserRole,
    sourceRole: "admin" as UserRole,
    actionUrl: "/contractor",
    relatedId: projectId,
  }),

  milestoneSubmitted: (projectTitle: string, milestoneName: string, milestoneId: string) => ({
    type: "milestone" as NotificationType,
    title: "New Milestone Submitted",
    message: `Milestone "${milestoneName}" for "${projectTitle}" is awaiting your verification.`,
    targetRole: "inspector" as UserRole,
    sourceRole: "contractor" as UserRole,
    actionUrl: "/inspector",
    relatedId: milestoneId,
  }),

  milestoneVerified: (projectTitle: string, milestoneName: string, milestoneId: string) => ({
    type: "approval" as NotificationType,
    title: "Milestone Verified",
    message: `Milestone "${milestoneName}" for "${projectTitle}" has been verified and is ready for COA audit.`,
    targetRole: "auditor" as UserRole,
    sourceRole: "inspector" as UserRole,
    actionUrl: "/auditor",
    relatedId: milestoneId,
  }),

  milestoneRejected: (projectTitle: string, milestoneName: string, milestoneId: string, reason: string) => ({
    type: "rejection" as NotificationType,
    title: "Milestone Rejected",
    message: `Milestone "${milestoneName}" for "${projectTitle}" was rejected. Reason: ${reason}`,
    targetRole: "contractor" as UserRole,
    sourceRole: "inspector" as UserRole,
    actionUrl: "/contractor",
    relatedId: milestoneId,
  }),

  coaApproved: (projectTitle: string, milestoneName: string, milestoneId: string) => ({
    type: "success" as NotificationType,
    title: "COA Approval Complete",
    message: `Milestone "${milestoneName}" for "${projectTitle}" has been approved by COA and published to the public ledger.`,
    targetRole: "contractor" as UserRole,
    sourceRole: "auditor" as UserRole,
    actionUrl: "/ledger",
    relatedId: milestoneId,
  }),

  coaRejected: (projectTitle: string, milestoneName: string, milestoneId: string, reason: string) => ({
    type: "rejection" as NotificationType,
    title: "COA Audit Failed",
    message: `Milestone "${milestoneName}" for "${projectTitle}" was rejected by COA. Reason: ${reason}`,
    targetRole: "inspector" as UserRole,
    sourceRole: "auditor" as UserRole,
    actionUrl: "/inspector",
    relatedId: milestoneId,
  }),

  proposalSubmitted: (proposalTitle: string, proposalId: string) => ({
    type: "info" as NotificationType,
    title: "New Budget Proposal",
    message: `RDC submitted a budget proposal: "${proposalTitle}". Your review is required before the project can proceed.`,
    targetRole: "admin" as UserRole,
    sourceRole: "rdc" as UserRole,
    actionUrl: "/admin:proposals",
    relatedId: proposalId,
  }),

  proposalApproved: (proposalTitle: string, proposalId: string) => ({
    type: "success" as NotificationType,
    title: "Budget Proposal Approved!",
    message: `Your proposal "${proposalTitle}" has been approved by National. You may now create the full project.`,
    targetRole: "rdc" as UserRole,
    sourceRole: "admin" as UserRole,
    actionUrl: "/rdc",
    relatedId: proposalId,
  }),

  proposalRejected: (proposalTitle: string, proposalId: string, reason: string) => ({
    type: "rejection" as NotificationType,
    title: "Budget Proposal Rejected",
    message: `Your proposal "${proposalTitle}" was not approved by National. Reason: ${reason}`,
    targetRole: "rdc" as UserRole,
    sourceRole: "admin" as UserRole,
    actionUrl: "/rdc",
    relatedId: proposalId,
  }),

  systemAlert: (title: string, message: string) => ({
    type: "warning" as NotificationType,
    title,
    message,
    targetRole: "all" as UserRole,
  }),
};
