import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  auditTrailApi,
  type CreateAuditEntryPayload,
} from "@/features/audit-trail/api/auditTrailApi";
import { blockchainApi } from "@/features/blockchain/api/blockchainApi";
import { InsufficientGasError } from "@/features/blockchain/services/blockchain";

// ============================================
// AUDIT TRAIL CONTEXT
// Tracks all actions for full transparency
// RDC → National → Contractor → Inspector → COA
// ============================================

export type AuditActionType = string;

export type AuditActorRole = string;

export interface AuditEntry {
  id: string;
  timestamp: string;
  actionType: AuditActionType;
  actorRole: AuditActorRole;
  actorName: string;
  actorWallet?: string;
  projectId: string;
  projectName: string;
  // Location fields
  region?: string;
  municipality?: string;
  barangay?: string;
  milestoneId?: string;
  milestoneName?: string;
  description: string;
  amount?: number;
  previousStatus?: string;
  newStatus?: string;
  remarks?: string;
  blockchainHash?: string;
  metadata?: Record<string, unknown>;
}

interface AuditTrailContextType {
  auditEntries: AuditEntry[];
  addAuditEntry: (
    entry: Omit<AuditEntry, "id" | "timestamp" | "blockchainHash">
  ) => void;
  getEntriesByProject: (projectId: string) => AuditEntry[];
  getEntriesByMilestone: (milestoneId: string) => AuditEntry[];
  getEntriesByAction: (actionType: AuditActionType) => AuditEntry[];
  getRecentEntries: (count?: number) => AuditEntry[];
  getEntriesByRole: (role: AuditActorRole) => AuditEntry[];
}

const AuditTrailContext = createContext<AuditTrailContextType | undefined>(
  undefined
);

const AUDIT_REFRESH_INTERVAL_MS = 15000;

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function toTitleCaseWords(value: string): string {
  return value
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function mapApiEntry(e: Record<string, unknown>): AuditEntry {
  const amountRaw = e.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
      ? Number(amountRaw) || undefined
      : undefined;

  return {
    id: String(e.id ?? ""),
    timestamp: String(e.timestamp ?? new Date().toISOString()),
    actionType: String(e.actionType ?? "UNKNOWN_ACTION"),
    actorRole: String(e.actorRole ?? "system"),
    actorName: String(e.actorName ?? "Unknown Actor"),
    actorWallet: typeof e.actorWallet === "string" ? e.actorWallet : undefined,
    projectId: String(e.projectId ?? "UNKNOWN_PROJECT"),
    projectName: String(e.projectName ?? "Unknown Project"),
    region: typeof e.region === "string" ? e.region : undefined,
    municipality: typeof e.municipality === "string" ? e.municipality : undefined,
    barangay: typeof e.barangay === "string" ? e.barangay : undefined,
    milestoneId: typeof e.milestoneId === "string" ? e.milestoneId : undefined,
    milestoneName: typeof e.milestoneName === "string" ? e.milestoneName : undefined,
    description: String(e.description ?? ""),
    amount,
    previousStatus: typeof e.previousStatus === "string" ? e.previousStatus : undefined,
    newStatus: typeof e.newStatus === "string" ? e.newStatus : undefined,
    remarks: typeof e.remarks === "string" ? e.remarks : undefined,
    blockchainHash:
      typeof e.blockchainTxHash === "string"
        ? e.blockchainTxHash
        : typeof e.blockchainHash === "string"
        ? e.blockchainHash
        : undefined,
    metadata:
      typeof e.metadata === "object" && e.metadata !== null
        ? (e.metadata as Record<string, unknown>)
        : undefined,
  };
}

function buildEntryKey(entry: AuditEntry): string {
  const hash = String(entry.blockchainHash ?? "").trim().toLowerCase();
  if (hash.length > 0) {
    const action = String(entry.actionType ?? "").trim().toUpperCase() || "UNKNOWN_ACTION";
    const projectId = String(entry.projectId ?? "").trim().toLowerCase() || "UNKNOWN_PROJECT";
    const actorRole = String(entry.actorRole ?? "").trim().toLowerCase() || "UNKNOWN_ROLE";
    return `tx:${hash}:${action}:${projectId}:${actorRole}`;
  }

  return [
    entry.timestamp,
    entry.actionType,
    entry.actorRole,
    entry.projectId,
    entry.description,
  ]
    .map((value) => String(value ?? "").trim())
    .join("|");
}

function mergeAndSortEntries(remoteEntries: AuditEntry[], localEntries: AuditEntry[]): AuditEntry[] {
  const byKey = new Map<string, AuditEntry>();

  localEntries.forEach((entry) => {
    byKey.set(buildEntryKey(entry), entry);
  });

  remoteEntries.forEach((entry) => {
    byKey.set(buildEntryKey(entry), entry);
  });

  return Array.from(byKey.values()).sort(
    (left, right) =>
      new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  );
}

export function AuditTrailProvider({ children }: { children: ReactNode }) {
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  const refreshAuditEntries = useCallback(async () => {
    try {
      const response = await auditTrailApi.getAll(400);
      const apiEntries: AuditEntry[] = Array.isArray(response.data)
        ? response.data.map((entry: Record<string, unknown>) => mapApiEntry(entry))
        : [];

      setAuditEntries((prev) => mergeAndSortEntries(apiEntries, prev));
    } catch {
      console.warn("Audit Trail API unavailable");
    }
  }, []);

  // Keep monitor stream fresh so logs from every role/session appear without reload.
  useEffect(() => {
    void refreshAuditEntries();

    const intervalId = window.setInterval(() => {
      void refreshAuditEntries();
    }, AUDIT_REFRESH_INTERVAL_MS);

    const handleWindowVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshAuditEntries();
      }
    };

    window.addEventListener("focus", handleWindowVisible);
    document.addEventListener("visibilitychange", handleWindowVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowVisible);
      document.removeEventListener("visibilitychange", handleWindowVisible);
    };
  }, [refreshAuditEntries]);

  const addAuditEntry = async (
    entry: Omit<AuditEntry, "id" | "timestamp" | "blockchainHash">
  ) => {
    const entryId = `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = new Date().toISOString();

    // Step 1: Record data hash on blockchain via backend
    let blockchainTxHash = "";
    let blockchainDataHash = "";
    try {
      const dataHashRaw = JSON.stringify({
        projectId: entry.projectId,
        actionType: entry.actionType,
        actor: entry.actorWallet || entry.actorName,
        timestamp,
      });
      // Simple hex encoding of SHA-like string for the data hash
      const dataHash = Array.from(new TextEncoder().encode(dataHashRaw))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 64);
      blockchainDataHash = dataHash;

      const blockchainResult = await blockchainApi.recordOnChain({
        projectId: entry.projectId,
        actionType: entry.actionType,
        dataHash,
        actorWallet: entry.actorWallet,
      });

      // ── GAS GUARD: If insufficient gas, throw and do NOT save to database ──
      if (!blockchainResult.data.success && blockchainResult.data.message?.includes("INSUFFICIENT_GAS")) {
        throw new InsufficientGasError(blockchainResult.data.message);
      }

      blockchainTxHash = blockchainResult.data.transactionHash || "";
    } catch (err) {
      // Re-throw gas errors — these must NOT be silently caught
      if (err instanceof InsufficientGasError) {
        throw err;
      }
      // Check axios error responses for gas errors too
      const axiosMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (axiosMsg?.includes("INSUFFICIENT_GAS")) {
        throw new InsufficientGasError(axiosMsg);
      }
      // Block the save if the blockchain backend is unreachable or returns a non-gas error
      // This prevents off-chain-only audit entries from being created silently
      console.error("Blockchain recording failed — blocking off-chain save:", err);
      throw new Error("Blockchain recording failed. Transaction was not saved. Please try again.");
    }

    const newEntry: AuditEntry = {
      ...entry,
      id: entryId,
      timestamp,
      blockchainHash: blockchainTxHash,
    };
    setAuditEntries((prev) => mergeAndSortEntries([newEntry], prev));

    // Step 2: Persist audit entry to API
    const payload: CreateAuditEntryPayload = {
      actionType: entry.actionType,
      actorRole: entry.actorRole,
      actorName: entry.actorName,
      actorWallet: entry.actorWallet,
      projectId: entry.projectId,
      projectName: entry.projectName,
      region: entry.region,
      municipality: entry.municipality,
      barangay: entry.barangay,
      milestoneId: entry.milestoneId,
      milestoneName: entry.milestoneName,
      description: entry.description,
      amount: entry.amount,
      previousStatus: entry.previousStatus,
      newStatus: entry.newStatus,
      remarks: entry.remarks,
      blockchainTxHash,
      blockchainDataHash,
    };
    auditTrailApi.create(payload).catch(() => {
      console.warn("Failed to persist audit entry to API");
    });
  };

  const getEntriesByProject = (projectId: string) => {
    return auditEntries.filter((e) => e.projectId === projectId);
  };

  const getEntriesByMilestone = (milestoneId: string) => {
    return auditEntries.filter((e) => e.milestoneId === milestoneId);
  };

  const getEntriesByAction = (actionType: AuditActionType) => {
    return auditEntries.filter((e) => e.actionType === actionType);
  };

  const getRecentEntries = (count: number = 50) => {
    return auditEntries.slice(0, count);
  };

  const getEntriesByRole = (role: AuditActorRole) => {
    return auditEntries.filter((e) => e.actorRole === role);
  };

  return (
    <AuditTrailContext.Provider
      value={{
        auditEntries,
        addAuditEntry,
        getEntriesByProject,
        getEntriesByMilestone,
        getEntriesByAction,
        getRecentEntries,
        getEntriesByRole,
      }}
    >
      {children}
    </AuditTrailContext.Provider>
  );
}

export function useAuditTrail() {
  const context = useContext(AuditTrailContext);
  if (!context) {
    throw new Error(
      "useAuditTrail must be used within an AuditTrailProvider"
    );
  }
  return context;
}

// Helper function to get readable action name
export function getActionLabel(actionType: AuditActionType): string {
  const labels: Record<string, string> = {
    PROJECT_CREATED: "Project Created",
    PROJECT_DRAFT_SAVED: "Draft Saved",
    PROPOSAL_SUBMITTED: "Proposal Submitted",
    PROPOSAL_SIGNED: "Proposal Signed",
    PROPOSAL_APPROVED: "Proposal Approved",
    PROPOSAL_REJECTED: "Proposal Rejected",
    PROPOSAL_FUNDED: "Proposal Funded",
    RDC_ENDORSED: "RDC Endorsed",
    RDC_REJECTED: "RDC Rejected",
    NATIONAL_APPROVED: "Budget Approved",
    NATIONAL_REJECTED: "Budget Rejected",
    BUDGET_RELEASED: "Budget Released",
    PROJECT_FUNDED: "Project Funded",
    CONTRACTOR_ASSIGNED: "Contractor Assigned",
    MILESTONE_SUBMITTED: "Milestone Submitted",
    MILESTONE_UPDATED: "Milestone Updated",
    ACCOMPLISHMENT_REPORT: "Accomplishment Report Signed",
    MILESTONE_PAYMENT_AUTHORIZED: "Milestone Payment Authorized",
    INSPECTOR_APPROVED: "Inspection Passed",
    INSPECTOR_REJECTED: "Inspection Failed",
    ENGINEER_VERIFIED: "Engineer Verified",
    ENGINEER_ATTESTATION: "Engineer Attestation Signed",
    ENGINEER_REJECTED: "Engineer Rejected",
    COA_AUDITED: "COA Audited",
    COA_FORENSIC_VERIFIED: "COA Forensic Verified",
    COA_MILESTONE_SUSPENDED: "COA Milestone Suspended",
    COA_REJECTED: "COA Rejected",
    PUBLISHED_TO_LEDGER: "Published to Ledger",
    FUND_DISBURSED: "Fund Disbursed",
    PROJECT_COMPLETED: "Project Completed",
    PROJECT_FINALIZED: "Project Finalized",
    PROFESSIONAL_REGISTERED: "Professional Registered",
    PERSONNEL_WHITELISTED: "Personnel Whitelisted",
    MULTI_PROJECT_PERSONNEL_BOUND: "Personnel Bound to Project",
    DATA_MODIFIED: "Data Modified",
    PROJECT_SUSPENDED: "Project Suspended",
    COA_DISALLOWANCE_ISSUED: "COA Disallowance Issued",
    CITIZEN_FEEDBACK: "Citizen Feedback",
  };

  const normalized = String(actionType ?? "").trim();
  if (!normalized) return "Unknown Action";
  return labels[normalized] || toTitleCaseWords(normalized);
}

// Helper function to get role display name matching system roles
export function getRoleDisplayName(role: AuditActorRole): string {
  const normalizedRole = normalizeText(String(role ?? ""));

  if (normalizedRole === "admin" || normalizedRole === "national_budget") {
    return "DPWH National";
  }
  if (normalizedRole === "rd") {
    return "DPWH Regional";
  }
  if (normalizedRole === "auditor") {
    return "COA Regional";
  }
  if (
    normalizedRole === "overseer" ||
    normalizedRole === "coa_overseer" ||
    normalizedRole === "coa_admin"
  ) {
    return "COA National";
  }
  if (normalizedRole === "contractor") {
    return "Contractor";
  }
  if (normalizedRole === "inspector" || normalizedRole === "engineer") {
    return "DPWH Site Engineer";
  }
  if (normalizedRole === "rdc") {
    return "RDC";
  }
  if (normalizedRole === "system") {
    return "System";
  }
  if (normalizedRole === "public") {
    return "Public";
  }

  return toTitleCaseWords(normalizedRole);
}

// Helper function to get action color — theme-only palette
export function getActionColor(actionType: AuditActionType): string {
  if (
    actionType.includes("APPROVED") ||
    actionType.includes("ENDORSED") ||
    actionType === "PUBLISHED_TO_LEDGER" ||
    actionType === "FUND_DISBURSED" ||
    actionType === "PROJECT_COMPLETED"
  ) {
    return "text-primary bg-primary/10 border border-primary/25 font-semibold";
  }
  if (
    actionType.includes("REJECTED") ||
    actionType === "PROJECT_SUSPENDED" ||
    actionType === "COA_DISALLOWANCE_ISSUED"
  ) {
    return "text-foreground bg-muted border border-border font-semibold";
  }
  if (actionType === "DATA_MODIFIED") {
    return "text-foreground bg-muted border border-border font-semibold";
  }
  if (
    actionType.includes("SUBMITTED") ||
    actionType === "PROJECT_CREATED" ||
    actionType === "PROJECT_DRAFT_SAVED" ||
    actionType === "BUDGET_RELEASED"
  ) {
    return "text-primary/80 bg-primary/5 border border-primary/15";
  }
  return "text-muted-foreground bg-muted border border-border";
}

// Helper function to get role badge color — theme-only
export function getRoleColor(role: AuditActorRole): string {
  const normalizedRole = normalizeText(String(role ?? ""));

  if (normalizedRole === "admin" || normalizedRole === "national_budget") {
    return "text-primary bg-primary/10 border border-primary/25 font-medium";
  }
  if (normalizedRole === "rd") {
    return "text-primary/80 bg-primary/5 border border-primary/15 font-medium";
  }
  if (normalizedRole === "auditor") {
    return "text-foreground bg-muted border border-border font-medium";
  }
  if (
    normalizedRole === "overseer" ||
    normalizedRole === "coa_overseer" ||
    normalizedRole === "coa_admin"
  ) {
    return "text-foreground bg-muted border border-border font-semibold";
  }
  if (normalizedRole === "contractor") {
    return "text-muted-foreground bg-muted border border-border";
  }
  if (normalizedRole === "inspector" || normalizedRole === "engineer") {
    return "text-primary/70 bg-primary/5 border border-primary/15";
  }
  if (normalizedRole === "rdc") {
    return "text-foreground bg-muted border border-border font-medium";
  }
  if (normalizedRole === "system") {
    return "text-muted-foreground/70 bg-muted/60 border border-border";
  }

  return "text-muted-foreground bg-muted border border-border";
}
