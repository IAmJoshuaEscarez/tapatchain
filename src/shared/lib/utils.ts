import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RDCProject } from "@/features/project/context/ProjectContext";
import type { Project, Transaction } from "@/shared/types";
import type { AuditEntry } from "@/features/audit-trail/context/AuditTrailContext";

interface MilestoneSpentSource {
  projectId?: string | null;
  requestedAmount?: number | string | null;
  status?: string | null;
}

const SPENT_INCLUDED_MILESTONE_STATUSES = new Set<string>([
  "MILESTONE_PAID",
  "PUBLISHED",
  // Defensive legacy aliases for historical rows.
  "PAYMENT_RELEASED",
]);

function parseBackendBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return false;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as Philippine Peso currency
 */
export function formatCurrency(amount: number): string {
  if (amount >= 1000000000) {
    return `₱${(amount / 1000000000).toFixed(2)}B`;
  } else if (amount >= 1000000) {
    return `₱${(amount / 1000000).toFixed(1)}M`;
  }
  return `₱${amount.toLocaleString()}`;
}

/**
 * Format currency with full PHP format
 */
export function formatCurrencyPHP(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(amount);
}

/**
 * Calculate distance between two GPS coordinates in meters
 */
export function calculateDistance(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in meters
}

/**
 * Get status color classes based on status string
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    'Draft': 'bg-muted border border-border',
    'Submitted': 'bg-primary/70',
    'Under Review': 'bg-primary/50',
    'Approved': 'bg-primary',
    'Payment Released': 'bg-primary'
  };
  return colors[status] || 'bg-muted border border-border';
}

/**
 * Build spent totals per project from milestone amounts.
 * Spent counts only milestones that are already paid/disbursed.
 */
export function buildProjectSpentByMilestones(
  milestones: MilestoneSpentSource[]
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const milestone of milestones) {
    const projectId = milestone.projectId ? String(milestone.projectId) : "";
    if (!projectId) continue;

    const status = String(milestone.status ?? "").toUpperCase();
    if (!SPENT_INCLUDED_MILESTONE_STATUSES.has(status)) continue;

    const amountRaw = milestone.requestedAmount;
    const amount =
      typeof amountRaw === "number"
        ? amountRaw
        : typeof amountRaw === "string"
          ? Number(amountRaw)
          : 0;

    if (!Number.isFinite(amount) || amount <= 0) continue;
    totals[projectId] = (totals[projectId] ?? 0) + amount;
  }

  return totals;
}

/**
 * Map RDCProject (from ProjectContext) → Project (used by dashboard pages)
 */
export function mapRDCToProject(rdc: RDCProject): Project {
  // Action-descriptive statuses visible in the Public Ledger
  const statusMap: Record<string, string> = {
    PROPOSAL_DRAFT: "Proposed (Draft)",
    PROPOSAL_SUBMITTED: "Proposed — Awaiting NBA Approval",
    PROPOSAL_APPROVED: "Proposal Approved",
    PROPOSAL_REJECTED: "Proposal Rejected",
    DRAFT: "Created — Pending RDC Endorsement",
    SUBMITTED_TO_NATIONAL: "RDC Endorsed — Under National Review",
    FUNDED_AND_ACTIVE: "Funded & Active",
    PERSONNEL_ASSIGNED: "Personnel Assigned",
    REJECTED: "Rejected",
  };
  const blockchainTxHash = rdc.nationalFundingHash || rdc.rdcSignatureHash || "";
  const blockchainDataHash = rdc.blockchainDataHash || "";
  const offchainHash = rdc.offchainDataHash || "";
  const normalizedIntegrityStatus = String(rdc.integrityStatus ?? "").toUpperCase();
  const isTampered = parseBackendBoolean(rdc.isTampered) || normalizedIntegrityStatus === "TAMPERED";
  const verificationStatus =
    isTampered
      ? "tampered"
      : normalizedIntegrityStatus === "MATCHED"
        ? "verified"
        : "pending";
  const nationalFinalBudget = parseFloat(rdc.finalApprovedBudget?.replace(/[^0-9.]/g, "") ?? "");
  const rdcProposedBudget = parseFloat((rdc.rdcProposedBudget ?? rdc.approvedBudget)?.replace(/[^0-9.]/g, "") ?? "");
  const normalizedRdcProposedBudget = Number.isFinite(rdcProposedBudget) && rdcProposedBudget > 0 ? rdcProposedBudget : undefined;
  const normalizedNationalFundedBudget =
    Number.isFinite(nationalFinalBudget) && nationalFinalBudget > 0 ? nationalFinalBudget : undefined;
  const resolvedBudget =
    normalizedNationalFundedBudget ??
    normalizedRdcProposedBudget ??
    0;

  return {
    id: rdc.id,
    name: rdc.title,
    location: [rdc.municipality, rdc.province].filter(Boolean).join(", "),
    province: rdc.province,
    municipality: rdc.municipality,
    barangay: rdc.barangay,
    type: rdc.projectType || rdc.category || "",
    progress: rdc.currentProgress ?? 0,
    currentPhase: rdc.currentPhase,
    budget: resolvedBudget,
    rdcProposedBudget: normalizedRdcProposedBudget,
    nationalFundedBudget: normalizedNationalFundedBudget,
    spent: 0,
    contractor: rdc.contractorName,
    status: statusMap[rdc.status] || rdc.status,
    blockchainHash: blockchainTxHash,
    blockchainDataHash,
    blockchainTxHash,
    offchainHash,
    offchainDataHash: rdc.offchainDataHash || "",
    lastVerified: rdc.integrityCheckedAt || rdc.createdAt,
    verificationStatus,
    integrityStatus: normalizedIntegrityStatus || undefined,
    isTampered,
    tamperedAt: rdc.tamperedAt,
    integrityCheckedAt: rdc.integrityCheckedAt,
    startDate: rdc.startDate,
    expectedCompletion: rdc.expectedCompletion,
    contractorLicense: rdc.pcabLicense,
    dpwhRegion: rdc.dpwhRegion,
    lguApproval: rdc.lguApproval,
    siteEngineer: rdc.inspectorName,
    region: rdc.region,
    // Proposer & Accountability
    proposedBy: rdc.rdcEndorsedBy || "RDC Initiator",
    proposerRegion: rdc.region || rdc.dpwhRegion || "",
    proposerWallet: rdc.contractorWallet || "",
    endorsedBy: rdc.rdcEndorsedBy || "",
    approvedBy: rdc.nationalApprovedBy || "",
    saaReference: rdc.saaReference || "",
    rdcSignatureHash: rdc.rdcSignatureHash || "",
    nationalFundingHash: rdc.nationalFundingHash || "",
    rawStatus: rdc.status,
    infrastructureType: rdc.projectType || "",
    gaaReference: rdc.saaReference || "",
    // Personnel assignment fields (needed for wallet-based filtering)
    contractorWallet: rdc.contractorWallet,
    engineerWallet: rdc.engineerWallet,
    personnelAssigned: rdc.personnelAssigned,
    personnelTxHash: rdc.personnelTxHash,
    // Target-based Progress & Geolocation
    targetPercent: rdc.targetPercent ?? 100,
    currentProgress: rdc.currentProgress ?? 0,
    siteLatitude: rdc.siteLatitude,
    siteLongitude: rdc.siteLongitude,
    isLocationAnchored: rdc.isLocationAnchored ?? false,
    trackingSlug: rdc.trackingSlug,
    isPublic: rdc.isPublic ?? false,
    isQrActive: rdc.isQrActive ?? false,
    qrCodeUrl: rdc.qrCodeUrl,
  };
}

/**
 * Map AuditEntry → Transaction (for audit trail display)
 */
export function mapAuditToTransaction(entry: AuditEntry): Transaction {
  return {
    hash: entry.blockchainHash || "",
    projectId: entry.projectId || "",
    projectName: entry.projectName || "",
    contractor: entry.actorName,
    amount: entry.amount || 0,
    type: entry.actionType,
    date: entry.timestamp,
    status: entry.blockchainHash ? "Confirmed" : "Pending",
    smartContractTriggered: !!entry.blockchainHash,
  };
}
