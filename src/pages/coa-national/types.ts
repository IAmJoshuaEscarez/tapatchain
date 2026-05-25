import type { Project } from "@/types";

export type NationalBlockchainStatus =
  | "RDC_PROPOSED"
  | "RD_ASSIGNED"
  | "CONTRACTOR_SUBMITTED"
  | "ENGINEER_VERIFIED"
  | "COA_REGIONAL_APPROVED"
  | "FINAL_SEAL"
  | "FLAGGED"
  | "UNKNOWN";

export interface OnChainProjectSnapshot {
  regionId: number;
  provinceId: number;
  municipalityId: number;
  contractorWallet: string;
  engineerWallet: string;
  personnelAssigned: boolean;
  fetchedAt: string;
}

export interface NationalLedgerProject {
  id: string;
  project: Project;
  projectId: string;
  projectName: string;
  region: string;
  municipality: string;
  barangay: string;
  contractor: string;
  contractorWallet?: string;
  engineerWallet?: string;
  latestActionType?: string;
  latestActionAt?: string;
  latestTxHash?: string;
  finalSitePhotoUrl?: string;
  finalSitePhotoCapturedAt?: string;
  regionalAuditorTxHash?: string;
  regionalAuditorReviewedAt?: string;
  blockchainStatus: NationalBlockchainStatus;
  forensicWarningCount: number;
  totalMilestonePaid: number;
  onChain?: OnChainProjectSnapshot;
  searchIndex: string;
}

export interface NationalRegistryRow {
  id: string;
  projectId: string;
  projectName: string;
  region: string;
  municipality: string;
  contractor: string;
  actorName: string;
  actionType: string;
  timestamp: string;
  txHash: string;
  status: NationalBlockchainStatus;
  searchIndex: string;
}

export interface ChainOfCustodyStep {
  key:
    | "RDC_PROPOSAL"
    | "RD_ASSIGNMENT"
    | "CONTRACTOR_SUBMISSION"
    | "ENGINEER_VERIFICATION"
    | "REGIONAL_AUDIT_APPROVAL"
    | "NATIONAL_FINAL_SEAL";
  label: string;
  description: string;
  completed: boolean;
  actionName: string;
  actorRole?: string;
  actorName?: string;
  actorWallet?: string;
  assignedPersonnel?: Array<{
    roleLabel: string;
    name?: string;
    wallet?: string;
  }>;
  timestamp?: string;
  txHash?: string;
  signatureVerified: boolean;
}

export type NationalRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface NationalRiskProfile {
  projectId: string;
  projectName: string;
  region: string;
  municipality: string;
  contractor: string;
  riskLevel: NationalRiskLevel;
  riskScore: number;
  gpsVarianceMeters: number | null;
  auditDelayDays: number | null;
  resubmissionCount: number;
  warningCount: number;
  reasons: string[];
}

export interface RegionalComplianceRow {
  region: string;
  avgTurnaroundHours: number | null;
  resolvedAuditCount: number;
  withinSlaCount: number;
  withinSlaRate: number;
  pendingBeyondSlaCount: number;
  bottleneckCount: number;
}

export interface NationalTimelineStage {
  key: ChainOfCustodyStep["key"];
  label: string;
  completed: boolean;
  timestamp?: string;
  txHash?: string;
  actorName?: string;
  dwellHoursToNext: number | null;
}

export interface NationalOversightKpis {
  totalNationalDisbursement: number;
  totalProjects: number;
  finalSealCount: number;
  auditCompletionRate: number;
  anomalyHeatmap: Array<{
    region: string;
    warningCount: number;
  }>;
}

export type NationalDataSyncState = "loading" | "offchain-ready" | "reconciled";
