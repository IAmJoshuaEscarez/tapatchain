// Audit Trail Feature — Public API
export { auditTrailApi } from "./api/auditTrailApi";
export type { CreateAuditEntryPayload } from "./api/auditTrailApi";

export {
  AuditTrailProvider,
  useAuditTrail,
  getActionLabel,
  getRoleDisplayName,
  getActionColor,
  getRoleColor,
} from "./context/AuditTrailContext";
export type {
  AuditActionType,
  AuditActorRole,
  AuditEntry,
} from "./context/AuditTrailContext";
