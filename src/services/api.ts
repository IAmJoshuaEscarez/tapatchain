// ════════════════════════════════════════════════════════════════
// LEGACY RE-EXPORT SHIM — src/services/api.ts
// All implementations live in src/features/* and src/shared/*
// This file preserves backward compatibility for existing imports.
// ════════════════════════════════════════════════════════════════

// ── Default export: shared Axios client ──
export { default } from "@/shared/api/client";

// ── Auth ──
export { authApi, adminApi } from "@/features/auth/api/authApi";
export type { WalletLoginPayload, AdminRegisterUserPayload } from "@/features/auth/api/authApi";

// ── Project ──
export { projectApi } from "@/features/project/api/projectApi";
export type { CreateProjectPayload, UpdateProjectStatusPayload } from "@/features/project/api/projectApi";

// ── Endorsement ──
export { endorsementApi } from "@/features/endorsement/api/endorsementApi";
export type { EndorsementRequestPayload } from "@/features/endorsement/api/endorsementApi";

// ── Milestone ──
export { milestoneApi } from "@/features/milestone/api/milestoneApi";
export type { CreateMilestonePayload, UpdateMilestoneStatusPayload } from "@/features/milestone/api/milestoneApi";

// ── Audit Trail ──
export { auditTrailApi } from "@/features/audit-trail/api/auditTrailApi";
export type { CreateAuditEntryPayload } from "@/features/audit-trail/api/auditTrailApi";

// ── Blockchain ──
export { blockchainApi } from "@/features/blockchain/api/blockchainApi";
export type { VerifySignaturePayload, RecordOnChainPayload, CreateTransactionPayload } from "@/features/blockchain/api/blockchainApi";

// ── Notification ──
export { notificationApi } from "@/features/notification/api/notificationApi";
export type { CreateNotificationPayload, NotificationResponse } from "@/features/notification/api/notificationApi";

// ── Community ──
export { communityFeedbackApi, publicReportApi } from "@/features/community/api/communityApi";
export type {
  CreateCommunityFeedbackPayload,
  CommunityFeedbackResponse,
  CreatePublicReportPayload,
  PublicReportResponse,
} from "@/features/community/api/communityApi";

// ── Stakeholder ──
export { stakeholderApi } from "@/features/stakeholder/api/stakeholderApi";
export type { CreateStakeholderPayload, StakeholderResponse, DashboardStats } from "@/features/stakeholder/api/stakeholderApi";

// ── Shared Types (previously co-located in api.ts) ──
export type { UserProfile, EndorsementResponse } from "@/shared/types";
