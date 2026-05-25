import { useCallback, useMemo, useRef, useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import type { Project } from "@/types";
import type { Milestone } from "@/context/MilestoneContext";
import type { AuditEntry } from "@/context/AuditTrailContext";
import { calculateDistance } from "@/lib/utils";
import type {
  ChainOfCustodyStep,
  NationalBlockchainStatus,
  NationalDataSyncState,
  NationalLedgerProject,
  NationalOversightKpis,
  NationalRiskLevel,
  NationalRiskProfile,
  RegionalComplianceRow,
  NationalRegistryRow,
  OnChainProjectSnapshot,
} from "@/pages/coa-national/types";

const GATE_PROJECT_DETAILS_ABI = [
  "function getProjectDetails(uint256 _numericId) view returns (uint8 regionId, uint8 provinceId, uint16 municipalityId, address contractorWallet, address engineerWallet, bool personnelAssigned)",
] as const;

const FLAGGED_ACTIONS = new Set<string>([
  "PROJECT_SUSPENDED",
  "COA_REJECTED",
  "COA_DISALLOWANCE_ISSUED",
]);

const FINAL_SEAL_ACTIONS = new Set<string>([
  "FINAL_SEAL_AFFIXED",
  "PROJECT_COMPLETED",
  "PROJECT_FINALIZED",
]);

const REGIONAL_APPROVAL_ACTIONS = new Set<string>(["COA_AUDITED"]);
const ENGINEER_VERIFIED_ACTIONS = new Set<string>(["ENGINEER_VERIFIED", "INSPECTOR_APPROVED"]);
const CONTRACTOR_SUBMISSION_ACTIONS = new Set<string>([
  "MILESTONE_SUBMITTED",
  "PROGRESS_SUBMITTED",
  "ACCOMPLISHMENT_REPORT",
]);
const RD_ASSIGNMENT_ACTIONS = new Set<string>([
  "CONTRACTOR_ASSIGNED",
  "BUDGET_RELEASED",
]);
const RDC_PROPOSAL_ACTIONS = new Set<string>([
  "PROJECT_CREATED",
  "PROPOSAL_SUBMITTED",
  "RDC_ENDORSED",
  "PROPOSAL_SIGNED",
  "PROJECT_PROPOSED",
]);

const GPS_VARIANCE_HIGH_RISK_METERS = 50;
const AUDIT_DELAY_HIGH_RISK_DAYS = 7;
const AUDIT_SLA_HOURS = 48;

const ENGINEER_REVIEW_STATUSES = new Set<Milestone["status"]>([
  "ENGINEER_VERIFIED",
  "INSPECTOR_APPROVED",
  "COA_AUDITED",
  "COA_REJECTED",
  "MILESTONE_PAID",
]);

const COA_REVIEWED_STATUSES = new Set<Milestone["status"]>([
  "COA_AUDITED",
  "COA_REJECTED",
  "MILESTONE_PAID",
]);

const CHAIN_STEP_ACTIONS: Record<
  ChainOfCustodyStep["key"],
  ReadonlySet<string>
> = {
  RDC_PROPOSAL: RDC_PROPOSAL_ACTIONS,
  RD_ASSIGNMENT: RD_ASSIGNMENT_ACTIONS,
  CONTRACTOR_SUBMISSION: CONTRACTOR_SUBMISSION_ACTIONS,
  ENGINEER_VERIFICATION: ENGINEER_VERIFIED_ACTIONS,
  REGIONAL_AUDIT_APPROVAL: REGIONAL_APPROVAL_ACTIONS,
  NATIONAL_FINAL_SEAL: FINAL_SEAL_ACTIONS,
};

function toEpoch(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function isWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isTransactionHash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

function hasVerifiedSignature(txHash?: string, wallet?: string): boolean {
  const normalizedHash = normalizeText(txHash);
  const normalizedWallet = normalizeText(wallet);
  return isTransactionHash(normalizedHash) && isWalletAddress(normalizedWallet);
}

function normalizeTimestamp(value?: string): string | undefined {
  const raw = normalizeText(value);
  if (!raw) return undefined;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  if (parsed.getUTCFullYear() <= 1970) return undefined;

  return raw;
}

function toHours(milliseconds: number): number {
  return milliseconds / (1000 * 60 * 60);
}

function toDays(milliseconds: number): number {
  return milliseconds / (1000 * 60 * 60 * 24);
}

function hasFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function computeGpsVarianceMeters(project: Project, milestones: Milestone[]): number | null {
  if (!hasFiniteCoordinate(project.siteLatitude) || !hasFiniteCoordinate(project.siteLongitude)) {
    return null;
  }

  let worstVariance: number | null = null;
  for (const milestone of milestones) {
    if (!hasFiniteCoordinate(milestone.gpsMetadata?.latitude) || !hasFiniteCoordinate(milestone.gpsMetadata?.longitude)) {
      continue;
    }

    const variance = calculateDistance(
      project.siteLatitude,
      project.siteLongitude,
      milestone.gpsMetadata.latitude,
      milestone.gpsMetadata.longitude
    );

    if (!Number.isFinite(variance)) continue;
    worstVariance = worstVariance === null ? variance : Math.max(worstVariance, variance);
  }

  return worstVariance;
}

function computeAuditDelayDays(milestones: Milestone[]): number | null {
  const engineerReferenceEpoch = milestones
    .filter((milestone) => ENGINEER_REVIEW_STATUSES.has(milestone.status))
    .map((milestone) => toEpoch(milestone.inspectedDate || milestone.submittedDate || milestone.gpsMetadata?.timestamp))
    .filter((epoch) => epoch > 0)
    .sort((left, right) => right - left)[0];

  if (!engineerReferenceEpoch) return null;

  const coaReviewEpoch = milestones
    .filter((milestone) => COA_REVIEWED_STATUSES.has(milestone.status))
    .map((milestone) => toEpoch(milestone.coaApprovedDate || milestone.inspectedDate || milestone.submittedDate))
    .filter((epoch) => epoch > 0)
    .sort((left, right) => right - left)[0];

  if (!coaReviewEpoch) {
    return toDays(Date.now() - engineerReferenceEpoch);
  }

  return toDays(Math.max(0, coaReviewEpoch - engineerReferenceEpoch));
}

function computeResubmissionCount(
  milestones: Milestone[],
  entries: AuditEntry[]
): number {
  const contractorSubmissions = entries.filter((entry) => {
    const actionType = String(entry.actionType ?? "");
    const actorRole = String(entry.actorRole ?? "").toLowerCase();
    return CONTRACTOR_SUBMISSION_ACTIONS.has(actionType) && actorRole === "contractor";
  });

  if (contractorSubmissions.length === 0) return 0;

  const milestoneRefCount = new Set(
    contractorSubmissions
      .map((entry) => normalizeText(entry.milestoneId))
      .filter((milestoneId) => milestoneId.length > 0)
  ).size;

  const activeMilestoneCount = milestones.filter((milestone) => milestone.status !== "DRAFT").length;
  const baselineSubmissionCount = milestoneRefCount > 0
    ? milestoneRefCount
    : Math.max(1, activeMilestoneCount);

  return Math.max(0, contractorSubmissions.length - baselineSubmissionCount);
}

function resolveRiskLevel(
  gpsVarianceMeters: number | null,
  auditDelayDays: number | null,
  resubmissionCount: number,
  warningCount: number
): NationalRiskLevel {
  const isHighRisk =
    (gpsVarianceMeters !== null && gpsVarianceMeters > GPS_VARIANCE_HIGH_RISK_METERS) ||
    (auditDelayDays !== null && auditDelayDays > AUDIT_DELAY_HIGH_RISK_DAYS) ||
    resubmissionCount > 1;

  if (isHighRisk) return "HIGH";

  const isMediumRisk =
    warningCount > 0 ||
    (gpsVarianceMeters !== null && gpsVarianceMeters > 30) ||
    (auditDelayDays !== null && auditDelayDays > 2) ||
    resubmissionCount === 1;

  return isMediumRisk ? "MEDIUM" : "LOW";
}

function riskLevelSortValue(level: NationalRiskLevel): number {
  if (level === "HIGH") return 1;
  if (level === "MEDIUM") return 2;
  return 3;
}

function resolveNumericProjectId(project: Project): number | null {
  if (typeof project.numericProjectId === "number" && Number.isFinite(project.numericProjectId)) {
    return project.numericProjectId;
  }

  const digits = String(project.id ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickLatestEntry(
  entries: AuditEntry[],
  actions: ReadonlySet<string>
): AuditEntry | undefined {
  const matched = entries.filter((entry) => actions.has(String(entry.actionType ?? "")));
  if (matched.length === 0) return undefined;
  return matched.sort((left, right) => toEpoch(right.timestamp) - toEpoch(left.timestamp))[0];
}

function getMetadataTxHash(entry?: AuditEntry): string | undefined {
  const metadata = entry?.metadata;
  if (!metadata || typeof metadata !== "object") return undefined;

  const txFromMetadata = normalizeText((metadata as Record<string, unknown>).txHash);
  return txFromMetadata || undefined;
}

function pickLatestEntryWithTx(
  entries: AuditEntry[],
  actions: ReadonlySet<string>
): AuditEntry | undefined {
  const matched = entries
    .filter((entry) => actions.has(String(entry.actionType ?? "")))
    .sort((left, right) => toEpoch(right.timestamp) - toEpoch(left.timestamp));

  return matched.find((entry) => {
    const txHash = normalizeText(entry.blockchainHash || getMetadataTxHash(entry) || "");
    return txHash.length > 0;
  });
}

function isFinalSealEntry(entry: AuditEntry): boolean {
  const actionType = String(entry.actionType ?? "");
  if (FINAL_SEAL_ACTIONS.has(actionType)) return true;
  return normalizeLower(entry.newStatus) === "final_seal";
}

function countForensicWarnings(
  projectId: string,
  milestones: Milestone[],
  entries: AuditEntry[]
): number {
  let count = 0;

  for (const milestone of milestones) {
    if (String(milestone.projectId) !== projectId) continue;

    if (milestone.status === "COA_REJECTED") count += 1;

    for (const photo of milestone.photos ?? []) {
      if (photo.isTampered || photo.sourceType === "edited") count += 1;
    }
  }

  for (const entry of entries) {
    if (String(entry.projectId) !== projectId) continue;
    if (FLAGGED_ACTIONS.has(String(entry.actionType ?? ""))) count += 1;
  }

  return count;
}

function resolveBlockchainStatus(
  project: Project,
  projectMilestones: Milestone[],
  projectEntries: AuditEntry[],
  warningCount: number,
  hasLocalFinalSeal: boolean
): NationalBlockchainStatus {
  const hasFinalSeal =
    hasLocalFinalSeal ||
    projectEntries.some((entry) => isFinalSealEntry(entry));

  if (hasFinalSeal) return "FINAL_SEAL";

  if (
    warningCount > 0 ||
    projectEntries.some((entry) => FLAGGED_ACTIONS.has(String(entry.actionType ?? "")))
  ) {
    return "FLAGGED";
  }

  if (
    projectEntries.some((entry) => REGIONAL_APPROVAL_ACTIONS.has(String(entry.actionType ?? ""))) ||
    projectMilestones.some((milestone) => milestone.status === "COA_AUDITED")
  ) {
    return "COA_REGIONAL_APPROVED";
  }

  if (
    projectEntries.some((entry) => ENGINEER_VERIFIED_ACTIONS.has(String(entry.actionType ?? ""))) ||
    projectMilestones.some((milestone) => milestone.status === "ENGINEER_VERIFIED")
  ) {
    return "ENGINEER_VERIFIED";
  }

  if (
    projectEntries.some((entry) => CONTRACTOR_SUBMISSION_ACTIONS.has(String(entry.actionType ?? ""))) ||
    projectMilestones.some((milestone) =>
      milestone.status === "SUBMITTED" || milestone.status === "UNDER_REVIEW"
    )
  ) {
    return "CONTRACTOR_SUBMITTED";
  }

  if (
    projectEntries.some((entry) => RD_ASSIGNMENT_ACTIONS.has(String(entry.actionType ?? ""))) ||
    project.personnelAssigned
  ) {
    return "RD_ASSIGNED";
  }

  if (
    projectEntries.some((entry) => RDC_PROPOSAL_ACTIONS.has(String(entry.actionType ?? ""))) ||
    normalizeLower(project.rawStatus).includes("proposal") ||
    normalizeLower(project.rawStatus).includes("proposed")
  ) {
    return "RDC_PROPOSED";
  }

  return "UNKNOWN";
}

function buildChainOfCustody(
  project: Project,
  milestones: Milestone[],
  entries: AuditEntry[],
  hasLocalFinalSeal: boolean,
  txSignerByHash: Record<string, string>,
  txTimestampByHash: Record<string, string>
): ChainOfCustodyStep[] {
  const rdcProposalTxEntry = pickLatestEntryWithTx(entries, CHAIN_STEP_ACTIONS.RDC_PROPOSAL);

  const regionApprovalEntry = pickLatestEntry(entries, REGIONAL_APPROVAL_ACTIONS);
  const finalSealEntry = [...entries]
    .filter((entry) => isFinalSealEntry(entry))
    .sort((left, right) => toEpoch(right.timestamp) - toEpoch(left.timestamp))[0];

  const submissionMilestone = [...milestones]
    .filter((milestone) =>
      milestone.status === "SUBMITTED" ||
      milestone.status === "UNDER_REVIEW" ||
      milestone.status === "ENGINEER_VERIFIED" ||
      milestone.status === "COA_AUDITED" ||
      milestone.status === "MILESTONE_PAID"
    )
    .sort((left, right) => toEpoch(right.submittedDate) - toEpoch(left.submittedDate))[0];

  const engineerMilestone = [...milestones]
    .filter((milestone) =>
      milestone.status === "ENGINEER_VERIFIED" ||
      milestone.status === "COA_AUDITED" ||
      milestone.status === "MILESTONE_PAID"
    )
    .sort((left, right) =>
      toEpoch(right.inspectedDate || right.submittedDate) - toEpoch(left.inspectedDate || left.submittedDate)
    )[0];

  const normalizedSteps: Array<{
    key: ChainOfCustodyStep["key"];
    label: string;
    description: string;
    entry?: AuditEntry;
    fallbackRole?: string;
    fallbackActor?: string;
    fallbackWallet?: string;
    fallbackTimestamp?: string;
    fallbackTxHash?: string;
    completed?: boolean;
  }> = [
    {
      key: "RDC_PROPOSAL",
      label: "RDC Proposal",
      description: "RDC proposal endorsed and queued for project lifecycle.",
      entry: pickLatestEntry(entries, CHAIN_STEP_ACTIONS.RDC_PROPOSAL),
      fallbackRole: "rdc",
      fallbackActor: project.proposedBy || project.endorsedBy || "RDC Initiator",
      fallbackWallet: project.proposerWallet,
      fallbackTimestamp: project.rdcEndorsedDate || project.lastVerified || project.startDate,
      fallbackTxHash:
        rdcProposalTxEntry?.blockchainHash ||
        getMetadataTxHash(rdcProposalTxEntry) ||
        project.rdcSignatureHash ||
        project.blockchainHash,
      completed: true,
    },
    {
      key: "RD_ASSIGNMENT",
      label: "RD Assignment",
      description: "Regional Director assignment and personnel delegation captured.",
      entry: pickLatestEntry(entries, CHAIN_STEP_ACTIONS.RD_ASSIGNMENT),
      fallbackRole: "rd",
      fallbackActor: "Regional Director",
      fallbackTimestamp: project.startDate || project.lastVerified,
      fallbackTxHash: project.personnelTxHash,
      completed: Boolean(project.personnelAssigned || project.personnelTxHash),
    },
    {
      key: "CONTRACTOR_SUBMISSION",
      label: "Contractor Submission",
      description: "Contractor milestone/evidence submission recorded.",
      entry: pickLatestEntry(entries, CHAIN_STEP_ACTIONS.CONTRACTOR_SUBMISSION),
      fallbackRole: "contractor",
      fallbackActor: project.contractor,
      fallbackWallet: project.contractorWallet,
      fallbackTimestamp: submissionMilestone?.submittedDate,
      fallbackTxHash: submissionMilestone?.blockchainHash,
      completed: Boolean(submissionMilestone),
    },
    {
      key: "ENGINEER_VERIFICATION",
      label: "Engineer Verification",
      description: "Engineer/inspector forensic and metadata verification completed.",
      entry: pickLatestEntry(entries, CHAIN_STEP_ACTIONS.ENGINEER_VERIFICATION),
      fallbackRole: "engineer",
      fallbackActor: project.siteEngineer || engineerMilestone?.inspectorName,
      fallbackWallet: project.engineerWallet,
      fallbackTimestamp: engineerMilestone?.inspectedDate || engineerMilestone?.submittedDate,
      fallbackTxHash: engineerMilestone?.blockchainHash,
      completed: Boolean(engineerMilestone),
    },
    {
      key: "REGIONAL_AUDIT_APPROVAL",
      label: "Regional Auditor Approval",
      description: "COA Regional approval finalized on the audit chain.",
      entry: regionApprovalEntry,
      fallbackRole: "auditor",
      fallbackActor: project.coaAuditor,
      fallbackTimestamp:
        milestones.find((milestone) => milestone.status === "COA_AUDITED")?.coaApprovedDate ||
        milestones.find((milestone) => milestone.status === "COA_AUDITED")?.inspectedDate ||
        milestones.find((milestone) => milestone.status === "COA_AUDITED")?.submittedDate,
      fallbackTxHash: milestones.find((milestone) => milestone.status === "COA_AUDITED")?.blockchainHash,
      completed: Boolean(regionApprovalEntry || milestones.some((milestone) => milestone.status === "COA_AUDITED")),
    },
    {
      key: "NATIONAL_FINAL_SEAL",
      label: "National Final Seal",
      description: "Final national seal authority executed and archived.",
      entry: finalSealEntry,
      fallbackRole: "coa_overseer",
      fallbackActor: "COA National Oversight",
      completed: Boolean(hasLocalFinalSeal || finalSealEntry),
    },
  ];

  return normalizedSteps.map((step) => {
    const txHash =
      normalizeText(step.entry?.blockchainHash || getMetadataTxHash(step.entry) || step.fallbackTxHash || "") || undefined;
    const signerWallet = txHash ? normalizeText(txSignerByHash[txHash] || "") : "";
    const actorWallet = normalizeText(step.entry?.actorWallet || step.fallbackWallet || signerWallet || "") || undefined;
    const txTimestamp = txHash ? normalizeTimestamp(txTimestampByHash[txHash]) : undefined;
    const entryTimestamp = normalizeTimestamp(step.entry?.timestamp);
    const fallbackTimestamp = normalizeTimestamp(step.fallbackTimestamp);
    const assignedPersonnel =
      step.key === "RD_ASSIGNMENT"
        ? [
            {
              roleLabel: "Contractor",
              name: normalizeText(project.contractor || "") || undefined,
              wallet: normalizeText(project.contractorWallet || "") || undefined,
            },
            {
              roleLabel: "Site Engineer",
              name: normalizeText(project.siteEngineer || "") || undefined,
              wallet: normalizeText(project.engineerWallet || "") || undefined,
            },
          ].filter((person) => person.name || person.wallet)
        : undefined;

    return {
      key: step.key,
      label: step.label,
      actionName: normalizeText(step.entry?.actionType || step.label),
      description: step.description,
      completed: Boolean(step.entry || step.completed),
      actorRole: normalizeText(step.entry?.actorRole || step.fallbackRole || "") || undefined,
      actorName: step.entry?.actorName || step.fallbackActor,
      actorWallet,
      assignedPersonnel: assignedPersonnel && assignedPersonnel.length > 0 ? assignedPersonnel : undefined,
      timestamp: entryTimestamp || fallbackTimestamp || txTimestamp,
      txHash,
      signatureVerified: hasVerifiedSignature(txHash, actorWallet),
    };
  });
}

function statusSortValue(status: NationalBlockchainStatus): number {
  const order: Record<NationalBlockchainStatus, number> = {
    FINAL_SEAL: 1,
    COA_REGIONAL_APPROVED: 2,
    ENGINEER_VERIFIED: 3,
    CONTRACTOR_SUBMITTED: 4,
    RD_ASSIGNED: 5,
    RDC_PROPOSED: 6,
    FLAGGED: 7,
    UNKNOWN: 8,
  };
  return order[status] ?? 99;
}

interface UseNationalOversightHubParams {
  projects: Project[];
  milestones: Milestone[];
  auditEntries: AuditEntry[];
  localFinalSealProjectIds: Set<string>;
}

export function useNationalOversightHub({
  projects,
  milestones,
  auditEntries,
  localFinalSealProjectIds,
}: UseNationalOversightHubParams) {
  const [syncState, setSyncState] = useState<NationalDataSyncState>("offchain-ready");
  const [isLoading, setIsLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [cacheRevision, setCacheRevision] = useState(0);

  const onChainCacheRef = useRef<Record<string, OnChainProjectSnapshot>>({});
  const txSignerByHashRef = useRef<Record<string, string>>({});
  const txTimestampByHashRef = useRef<Record<string, string>>({});

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const project of projects) {
      map.set(String(project.id), project);
    }
    return map;
  }, [projects]);

  const milestonesByProjectId = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    for (const milestone of milestones) {
      const projectId = String(milestone.projectId ?? "");
      if (!projectId) continue;
      const existing = map.get(projectId) ?? [];
      existing.push(milestone);
      map.set(projectId, existing);
    }
    return map;
  }, [milestones]);

  const entriesByProjectId = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const entry of auditEntries) {
      const projectId = String(entry.projectId ?? "");
      if (!projectId) continue;
      const existing = map.get(projectId) ?? [];
      existing.push(entry);
      map.set(projectId, existing);
    }
    return map;
  }, [auditEntries]);

  const paidAmountByProjectId = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const milestone of milestones) {
      if (milestone.status !== "MILESTONE_PAID") continue;
      const projectId = String(milestone.projectId ?? "");
      if (!projectId) continue;
      totals[projectId] = (totals[projectId] ?? 0) + Number(milestone.requestedAmount ?? 0);
    }
    return totals;
  }, [milestones]);

  const warningCountByProjectId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const project of projects) {
      const projectId = String(project.id);
      counts[projectId] = countForensicWarnings(projectId, milestones, auditEntries);
    }
    return counts;
  }, [projects, milestones, auditEntries]);

  const ledgerProjects = useMemo<NationalLedgerProject[]>(() => {
    const records: NationalLedgerProject[] = projects.map((project) => {
      const projectId = String(project.id);
      const projectMilestones = milestonesByProjectId.get(projectId) ?? [];
      const projectEntries = entriesByProjectId.get(projectId) ?? [];
      const warningCount = warningCountByProjectId[projectId] ?? 0;

      const finalSitePhotoCandidate = projectMilestones
        .flatMap((milestone) =>
          (milestone.photos ?? []).map((photo) => ({
            url: normalizeText(photo.url),
            capturedAt: normalizeText(
              photo.timestamp ||
                milestone.inspectedDate ||
                milestone.submittedDate ||
                milestone.coaApprovedDate
            ),
          }))
        )
        .filter((photo) => photo.url.length > 0)
        .sort((left, right) => toEpoch(right.capturedAt) - toEpoch(left.capturedAt))[0];

      const auditedMilestone = [...projectMilestones]
        .filter((milestone) => milestone.status === "COA_AUDITED" && normalizeText(milestone.blockchainHash).length > 0)
        .sort(
          (left, right) =>
            toEpoch(right.coaApprovedDate || right.inspectedDate || right.submittedDate) -
            toEpoch(left.coaApprovedDate || left.inspectedDate || left.submittedDate)
        )[0];

      const auditedEntry = [...projectEntries]
        .filter((entry) => String(entry.actionType ?? "") === "COA_AUDITED" && normalizeText(entry.blockchainHash).length > 0)
        .sort((left, right) => toEpoch(right.timestamp) - toEpoch(left.timestamp))[0];

      const regionalAuditorTxHash = normalizeText(
        auditedMilestone?.blockchainHash || auditedEntry?.blockchainHash || ""
      );
      const regionalAuditorReviewedAt = normalizeText(
        auditedMilestone?.coaApprovedDate ||
          auditedMilestone?.inspectedDate ||
          auditedMilestone?.submittedDate ||
          auditedEntry?.timestamp ||
          ""
      );

      const latestEntry = [...projectEntries]
        .sort((left, right) => toEpoch(right.timestamp) - toEpoch(left.timestamp))[0];

      const blockchainStatus = resolveBlockchainStatus(
        project,
        projectMilestones,
        projectEntries,
        warningCount,
        localFinalSealProjectIds.has(projectId)
      );

      const onChain = onChainCacheRef.current[projectId];
      const region = normalizeText(project.dpwhRegion || project.region || "Unknown Region");
      const municipality = normalizeText(project.municipality || "Unknown Municipality");
      const contractor = normalizeText(project.contractor || "Unknown Contractor");
      const latestTxHash = normalizeText(
        latestEntry?.blockchainHash ||
          project.blockchainHash ||
          project.nationalFundingHash ||
          project.rdcSignatureHash ||
          ""
      );

      const searchIndex = [
        project.id,
        project.name,
        region,
        municipality,
        project.barangay,
        contractor,
        latestTxHash,
        regionalAuditorTxHash,
        blockchainStatus,
      ]
        .map((value) => normalizeLower(value))
        .join(" ");

      return {
        id: projectId,
        project,
        projectId,
        projectName: project.name,
        region,
        municipality,
        barangay: normalizeText(project.barangay || ""),
        contractor,
        contractorWallet: project.contractorWallet,
        engineerWallet: project.engineerWallet,
        latestActionType: latestEntry?.actionType,
        latestActionAt: latestEntry?.timestamp,
        latestTxHash,
        finalSitePhotoUrl: finalSitePhotoCandidate?.url || undefined,
        finalSitePhotoCapturedAt: finalSitePhotoCandidate?.capturedAt || undefined,
        regionalAuditorTxHash: regionalAuditorTxHash || undefined,
        regionalAuditorReviewedAt: regionalAuditorReviewedAt || undefined,
        blockchainStatus,
        forensicWarningCount: warningCount,
        totalMilestonePaid: paidAmountByProjectId[projectId] ?? 0,
        onChain,
        searchIndex,
      };
    });

    return records.sort((left, right) => {
      const statusDelta = statusSortValue(left.blockchainStatus) - statusSortValue(right.blockchainStatus);
      if (statusDelta !== 0) return statusDelta;

      const leftEpoch = toEpoch(left.latestActionAt || left.project.lastVerified || left.project.startDate);
      const rightEpoch = toEpoch(right.latestActionAt || right.project.lastVerified || right.project.startDate);
      return rightEpoch - leftEpoch;
    });
  }, [
    projects,
    milestonesByProjectId,
    entriesByProjectId,
    warningCountByProjectId,
    paidAmountByProjectId,
    localFinalSealProjectIds,
    cacheRevision,
  ]);

  const riskProfiles = useMemo<NationalRiskProfile[]>(() => {
    const profiles = ledgerProjects.map((record) => {
      const projectMilestones = milestonesByProjectId.get(record.projectId) ?? [];
      const projectEntries = entriesByProjectId.get(record.projectId) ?? [];

      const gpsVarianceMeters = computeGpsVarianceMeters(record.project, projectMilestones);
      const auditDelayDays = computeAuditDelayDays(projectMilestones);
      const resubmissionCount = computeResubmissionCount(projectMilestones, projectEntries);
      const warningCount = record.forensicWarningCount;

      const reasons: string[] = [];
      if (gpsVarianceMeters !== null && gpsVarianceMeters > GPS_VARIANCE_HIGH_RISK_METERS) {
        reasons.push(`GPS variance exceeded ${GPS_VARIANCE_HIGH_RISK_METERS}m (${gpsVarianceMeters.toFixed(2)}m).`);
      }
      if (auditDelayDays !== null && auditDelayDays > AUDIT_DELAY_HIGH_RISK_DAYS) {
        reasons.push(`Audit turnaround exceeded ${AUDIT_DELAY_HIGH_RISK_DAYS} days (${auditDelayDays.toFixed(1)} days).`);
      }
      if (resubmissionCount > 1) {
        reasons.push(`Multiple contractor re-submissions detected (${resubmissionCount}).`);
      }
      if (warningCount > 0) {
        reasons.push(`Forensic warning count: ${warningCount}.`);
      }

      const riskLevel = resolveRiskLevel(gpsVarianceMeters, auditDelayDays, resubmissionCount, warningCount);

      const computedRiskScore = Math.min(
        100,
        (gpsVarianceMeters !== null
          ? gpsVarianceMeters > GPS_VARIANCE_HIGH_RISK_METERS
            ? 35
            : gpsVarianceMeters > 30
              ? 18
              : 0
          : 8) +
          (auditDelayDays !== null
            ? auditDelayDays > AUDIT_DELAY_HIGH_RISK_DAYS
              ? 30
              : auditDelayDays > 2
                ? 14
                : 0
            : 0) +
          (resubmissionCount > 1 ? 20 : resubmissionCount === 1 ? 10 : 0) +
          Math.min(20, warningCount * 8)
      );

      return {
        projectId: record.projectId,
        projectName: record.projectName,
        region: record.region,
        municipality: record.municipality,
        contractor: record.contractor,
        riskLevel,
        riskScore: computedRiskScore,
        gpsVarianceMeters,
        auditDelayDays,
        resubmissionCount,
        warningCount,
        reasons,
      };
    });

    return profiles.sort((left, right) => {
      const levelDelta = riskLevelSortValue(left.riskLevel) - riskLevelSortValue(right.riskLevel);
      if (levelDelta !== 0) return levelDelta;
      return right.riskScore - left.riskScore;
    });
  }, [ledgerProjects, milestonesByProjectId, entriesByProjectId]);

  const statusByProjectId = useMemo(() => {
    const map = new Map<string, NationalBlockchainStatus>();
    for (const record of ledgerProjects) {
      map.set(record.projectId, record.blockchainStatus);
    }
    return map;
  }, [ledgerProjects]);

  const registryRows = useMemo<NationalRegistryRow[]>(() => {
    const rows = auditEntries.map((entry) => {
      const projectId = String(entry.projectId ?? "");
      const project = projectById.get(projectId);
      const recordStatus = statusByProjectId.get(projectId) ?? "UNKNOWN";
      const region = normalizeText(entry.region || project?.dpwhRegion || project?.region || "Unknown Region");
      const municipality = normalizeText(entry.municipality || project?.municipality || "Unknown Municipality");
      const contractor = normalizeText(project?.contractor || "Unknown Contractor");
      const txHash = normalizeText(entry.blockchainHash || "—");

      const searchIndex = [
        entry.id,
        projectId,
        entry.projectName || project?.name,
        region,
        municipality,
        contractor,
        entry.actionType,
        txHash,
        entry.actorName,
        recordStatus,
      ]
        .map((value) => normalizeLower(value))
        .join(" ");

      return {
        id: String(entry.id),
        projectId,
        projectName: normalizeText(entry.projectName || project?.name || "Unknown Project"),
        region,
        municipality,
        contractor,
        actorName: normalizeText(entry.actorName || "Unknown Actor"),
        actionType: normalizeText(entry.actionType || "UNKNOWN_ACTION"),
        timestamp: normalizeText(entry.timestamp),
        txHash,
        status: recordStatus,
        searchIndex,
      };
    });

    return rows.sort((left, right) => toEpoch(right.timestamp) - toEpoch(left.timestamp));
  }, [auditEntries, projectById, statusByProjectId]);

  const availableRegions = useMemo(() => {
    return Array.from(new Set(ledgerProjects.map((project) => project.region))).sort();
  }, [ledgerProjects]);

  const availableContractors = useMemo(() => {
    return Array.from(new Set(ledgerProjects.map((project) => project.contractor))).sort();
  }, [ledgerProjects]);

  const availableStatuses = useMemo(() => {
    return Array.from(new Set(ledgerProjects.map((project) => project.blockchainStatus))).sort(
      (left, right) => statusSortValue(left) - statusSortValue(right)
    );
  }, [ledgerProjects]);

  const complianceRows = useMemo<RegionalComplianceRow[]>(() => {
    const regionAccumulator: Record<string, { resolvedHours: number[]; pendingBeyondSlaCount: number }> = {};

    for (const project of projects) {
      const region = normalizeText(project.dpwhRegion || project.region || "Unknown Region");
      if (!regionAccumulator[region]) {
        regionAccumulator[region] = {
          resolvedHours: [],
          pendingBeyondSlaCount: 0,
        };
      }
    }

    const nowEpoch = Date.now();
    for (const milestone of milestones) {
      if (!ENGINEER_REVIEW_STATUSES.has(milestone.status) && !COA_REVIEWED_STATUSES.has(milestone.status)) {
        continue;
      }

      const projectId = normalizeText(milestone.projectId);
      const sourceProject = projectById.get(projectId);
      const region = normalizeText(milestone.region || sourceProject?.dpwhRegion || sourceProject?.region || "Unknown Region");

      if (!regionAccumulator[region]) {
        regionAccumulator[region] = {
          resolvedHours: [],
          pendingBeyondSlaCount: 0,
        };
      }

      const inspectedEpoch = toEpoch(milestone.inspectedDate || milestone.submittedDate || milestone.gpsMetadata?.timestamp);
      if (!inspectedEpoch) continue;

      const coaEpoch = toEpoch(milestone.coaApprovedDate);
      if (coaEpoch > 0 && coaEpoch >= inspectedEpoch) {
        regionAccumulator[region].resolvedHours.push(toHours(coaEpoch - inspectedEpoch));
        continue;
      }

      const pendingHours = toHours(nowEpoch - inspectedEpoch);
      if (pendingHours > AUDIT_SLA_HOURS) {
        regionAccumulator[region].pendingBeyondSlaCount += 1;
      }
    }

    const rows = Object.entries(regionAccumulator).map(([region, data]) => {
      const resolvedAuditCount = data.resolvedHours.length;
      const withinSlaCount = data.resolvedHours.filter((hours) => hours <= AUDIT_SLA_HOURS).length;
      const avgTurnaroundHours =
        resolvedAuditCount > 0
          ? data.resolvedHours.reduce((sum, hours) => sum + hours, 0) / resolvedAuditCount
          : null;
      const delayedResolvedCount = data.resolvedHours.filter((hours) => hours > AUDIT_SLA_HOURS).length;
      const bottleneckCount = delayedResolvedCount + data.pendingBeyondSlaCount;

      return {
        region,
        avgTurnaroundHours,
        resolvedAuditCount,
        withinSlaCount,
        withinSlaRate: resolvedAuditCount > 0 ? (withinSlaCount / resolvedAuditCount) * 100 : 0,
        pendingBeyondSlaCount: data.pendingBeyondSlaCount,
        bottleneckCount,
      };
    });

    return rows.sort((left, right) => {
      if (right.withinSlaRate !== left.withinSlaRate) {
        return right.withinSlaRate - left.withinSlaRate;
      }

      const leftAvg = left.avgTurnaroundHours ?? Number.POSITIVE_INFINITY;
      const rightAvg = right.avgTurnaroundHours ?? Number.POSITIVE_INFINITY;
      if (leftAvg !== rightAvg) {
        return leftAvg - rightAvg;
      }

      return left.region.localeCompare(right.region);
    });
  }, [projects, milestones, projectById]);

  const oversightKpis = useMemo<NationalOversightKpis>(() => {
    const totalNationalDisbursement = milestones
      .filter((milestone) => milestone.status === "MILESTONE_PAID")
      .reduce((sum, milestone) => sum + Number(milestone.requestedAmount ?? 0), 0);

    const totalProjects = ledgerProjects.length;
    const finalSealCount = ledgerProjects.filter((project) => project.blockchainStatus === "FINAL_SEAL").length;
    const auditCompletionRate = totalProjects > 0 ? (finalSealCount / totalProjects) * 100 : 0;

    const warningByRegion: Record<string, number> = {};
    for (const project of ledgerProjects) {
      if (project.forensicWarningCount <= 0 && project.blockchainStatus !== "FLAGGED") continue;
      warningByRegion[project.region] = (warningByRegion[project.region] ?? 0) + 1;
    }

    const anomalyHeatmap = Object.entries(warningByRegion)
      .map(([region, warningCount]) => ({ region, warningCount }))
      .sort((left, right) => right.warningCount - left.warningCount);

    return {
      totalNationalDisbursement,
      totalProjects,
      finalSealCount,
      auditCompletionRate,
      anomalyHeatmap,
    };
  }, [milestones, ledgerProjects]);

  const getChainOfCustody = useCallback(
    (projectId: string): ChainOfCustodyStep[] => {
      const normalizedProjectId = String(projectId);
      const project = projectById.get(normalizedProjectId);
      if (!project) return [];

      const projectMilestones = milestonesByProjectId.get(normalizedProjectId) ?? [];
      const projectEntries = entriesByProjectId.get(normalizedProjectId) ?? [];

      return buildChainOfCustody(
        project,
        projectMilestones,
        projectEntries,
        localFinalSealProjectIds.has(normalizedProjectId),
        txSignerByHashRef.current,
        txTimestampByHashRef.current
      );
    },
    [projectById, milestonesByProjectId, entriesByProjectId, localFinalSealProjectIds]
  );

  const fetchAllRegionalData = useCallback(async () => {
    setIsLoading(true);
    setSyncError(null);
    setSyncState("loading");

    // Fast path: render off-chain aggregate first.
    setSyncState("offchain-ready");

    if (typeof window === "undefined" || !window.ethereum) {
      setIsLoading(false);
      return;
    }

    const provider = new BrowserProvider(window.ethereum);
    let cacheTouched = false;

    const gateAddress = import.meta.env.VITE_GATE_CONTRACT_ADDRESS as string | undefined;

    try {
      if (gateAddress) {
        const candidates = projects.filter((project) => {
          const projectId = String(project.id);
          if (onChainCacheRef.current[projectId]) return false;
          return resolveNumericProjectId(project) !== null;
        });

        if (candidates.length > 0) {
          const gate = new Contract(gateAddress, GATE_PROJECT_DETAILS_ABI, provider);
          const batchSize = 6;

          for (let start = 0; start < candidates.length; start += batchSize) {
            const batch = candidates.slice(start, start + batchSize);
            await Promise.all(
              batch.map(async (project) => {
                const projectId = String(project.id);
                const numericProjectId = resolveNumericProjectId(project);
                if (numericProjectId === null) return;

                try {
                  const raw = await gate.getProjectDetails(BigInt(numericProjectId));
                  onChainCacheRef.current[projectId] = {
                    regionId: Number(raw.regionId ?? raw[0] ?? 0),
                    provinceId: Number(raw.provinceId ?? raw[1] ?? 0),
                    municipalityId: Number(raw.municipalityId ?? raw[2] ?? 0),
                    contractorWallet: String(raw.contractorWallet ?? raw[3] ?? ""),
                    engineerWallet: String(raw.engineerWallet ?? raw[4] ?? ""),
                    personnelAssigned: Boolean(raw.personnelAssigned ?? raw[5] ?? false),
                    fetchedAt: new Date().toISOString(),
                  };
                  cacheTouched = true;
                } catch {
                  // Skip failed per-project reads and continue reconciliation for the rest.
                }
              })
            );
          }
        }
      }

      const txHashes = new Set<string>();
      const pushTxHash = (value?: string) => {
        const hash = normalizeText(value);
        if (!isTransactionHash(hash)) return;
        txHashes.add(hash);
      };

      for (const project of projects) {
        pushTxHash(project.rdcSignatureHash);
        pushTxHash(project.personnelTxHash);
        pushTxHash(project.nationalFundingHash);
        pushTxHash(project.blockchainHash);
      }

      for (const milestone of milestones) {
        pushTxHash(milestone.blockchainHash);
      }

      for (const entry of auditEntries) {
        const actionType = String(entry.actionType ?? "");
        if (
          CHAIN_STEP_ACTIONS.RDC_PROPOSAL.has(actionType) ||
          CHAIN_STEP_ACTIONS.RD_ASSIGNMENT.has(actionType) ||
          CHAIN_STEP_ACTIONS.CONTRACTOR_SUBMISSION.has(actionType) ||
          CHAIN_STEP_ACTIONS.ENGINEER_VERIFICATION.has(actionType) ||
          CHAIN_STEP_ACTIONS.REGIONAL_AUDIT_APPROVAL.has(actionType) ||
          FINAL_SEAL_ACTIONS.has(actionType) ||
          isFinalSealEntry(entry)
        ) {
          pushTxHash(entry.blockchainHash);
          pushTxHash(getMetadataTxHash(entry));
        }
      }

      const unresolvedTxHashes = Array.from(txHashes).filter(
        (hash) => !txSignerByHashRef.current[hash] || !txTimestampByHashRef.current[hash]
      );

      if (unresolvedTxHashes.length > 0) {
        const batchSize = 10;
        for (let start = 0; start < unresolvedTxHashes.length; start += batchSize) {
          const batch = unresolvedTxHashes.slice(start, start + batchSize);
          await Promise.all(
            batch.map(async (txHash) => {
              try {
                const tx = await provider.getTransaction(txHash);
                const signer = normalizeText(tx?.from);
                if (isWalletAddress(signer) && !txSignerByHashRef.current[txHash]) {
                  txSignerByHashRef.current[txHash] = signer;
                  cacheTouched = true;
                }

                if (!txTimestampByHashRef.current[txHash]) {
                  let blockNumber: number | null = typeof tx?.blockNumber === "number" ? tx.blockNumber : null;

                  if (blockNumber === null) {
                    const receipt = await provider.getTransactionReceipt(txHash);
                    blockNumber = typeof receipt?.blockNumber === "number" ? receipt.blockNumber : null;
                  }

                  if (blockNumber !== null) {
                    const block = await provider.getBlock(blockNumber);
                    const blockTimestamp = block?.timestamp;
                    if (typeof blockTimestamp === "number" && Number.isFinite(blockTimestamp) && blockTimestamp > 0) {
                      txTimestampByHashRef.current[txHash] = new Date(blockTimestamp * 1000).toISOString();
                      cacheTouched = true;
                    }
                  }
                }
              } catch {
                // Keep unresolved hashes as-is when provider cannot resolve transaction.
              }
            })
          );
        }
      }

      if (cacheTouched) {
        setCacheRevision((prev) => prev + 1);
      }

      setSyncState("reconciled");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "On-chain reconciliation failed");
    } finally {
      setIsLoading(false);
    }
  }, [projects]);

  return {
    syncState,
    isLoading,
    syncError,
    ledgerProjects,
    riskProfiles,
    complianceRows,
    registryRows,
    availableRegions,
    availableContractors,
    availableStatuses,
    oversightKpis,
    getChainOfCustody,
    fetchAllRegionalData,
  };
}
