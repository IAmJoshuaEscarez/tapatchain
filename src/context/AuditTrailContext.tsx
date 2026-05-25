// Legacy re-export shim — implementations in @/features/audit-trail/context/AuditTrailContext
export {
  AuditTrailProvider,
  useAuditTrail,
  getActionLabel,
  getRoleDisplayName,
  getActionColor,
  getRoleColor,
} from "@/features/audit-trail/context/AuditTrailContext";
export type {
  AuditActionType,
  AuditActorRole,
  AuditEntry,
} from "@/features/audit-trail/context/AuditTrailContext";
