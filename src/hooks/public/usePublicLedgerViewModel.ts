import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, Interface, JsonRpcProvider, type EventLog } from "ethers";

import { getActionLabel, type AuditEntry } from "@/context/AuditTrailContext";
import {
  HIGH_RISK_GAP_THRESHOLD_PCT,
  useFinancialPhysicalIntegrity,
} from "@/features/project/hooks/useFinancialPhysicalIntegrity";
import { buildProjectSpentByMilestones, mapRDCToProject } from "@/lib/utils";
import { isRealTxHash } from "@/services/blockchain";
import type { Project } from "@/types";

import { usePublicLedgerPageState } from "./usePublicLedgerPageState";

export type ProjectChannel = "global" | "financial" | "decision";
export type ProjectLifecycleFilter = "all" | "proposals" | "funded";
type ActorKind = "government" | "citizen";
type FeedSource = "audit" | "database" | "blockchain";

export interface FeedPost {
  id: string;
  sortKey: number;
  source: FeedSource;
  actorKind: ActorKind;
  actorRole: string;
  actorName: string;
  actorWallet?: string;
  officeLabel: string;
  actionType: string;
  actionLabel: string;
  statusType?: string;
  decisionText: string;
  projectId: string;
  projectName: string;
  milestoneId?: string;
  milestoneName?: string;
  txHash?: string;
  blockNumber?: number;
  amount?: number;
  fundedAmount?: number;
  totalSpent?: number;
  disbursedAmount?: number;
  financialProgressPct?: number;
  physicalProgressPct?: number;
  progressGapPct?: number;
  isHighRisk?: boolean;
  progress: number;
  officialPhotoUrl?: string;
  citizenPhotoUrl?: string;
  region?: string;
  municipality?: string;
  barangay?: string;
  locationText?: string;
}

export interface DecisionPathStep {
  key: "contractor" | "rd" | "coa";
  title: string;
  detail: string;
  timestamp?: string;
  wallet?: string;
  signature?: string;
  blockNumber?: string;
  complete: boolean;
}

export type IntegrityRecordType = "project" | "milestone" | "transaction";

export interface IntegrityRecordSnapshot {
  recordType: IntegrityRecordType;
  title: string;
  recordId: string;
  projectId: string;
  txHash?: string;
  onChainHash: string;
  offChainHash: string;
  integrityStatus: "MATCHED" | "TAMPERED" | "NO_ANCHOR";
  isTampered: boolean;
  checkedAt?: string;
  tamperedAt?: string;
  hasAnchor: boolean;
  isMatch: boolean;
}

const GATE_FEED_ABI = [
  "event MilestonePaymentAuthorized(string indexed projectId, string indexed milestoneId, address indexed rd, uint256 amount, bytes32 dataHash, uint256 timestamp)",
  "event FundsCommitted(string indexed referenceId, uint8 regionCode, uint256 amount, address indexed authority, uint256 timestamp)",
  "event AuditAttested(string indexed projectId, string indexed milestoneId, address indexed auditor, bytes32 dataHash, string verdict, uint256 timestamp)",
  "event PersonnelWhitelisted(string indexed projectId, address indexed rd, address contractor, address engineer, bytes32 noaHash, uint256 timestamp)",
  "event MultiProjectPersonnelBound(uint256 indexed numericProjectId, string projectId, address indexed contractor, address indexed engineer, uint16 municipalityId, bytes32 dataHash, uint256 timestamp)",
  "event WhitelistFinalized(string indexed referenceId, address indexed admin, address indexed user, string role, uint256 timestamp)",
  "event ProfessionalRegistered(address indexed professionalAddress, string role, string region, string licenseId, address indexed registeredBy, bytes32 dataHash, uint256 timestamp)",
  "event SignedAction(address indexed signer, string role, string actionType, bytes32 dataHash, string referenceId, uint256 timestamp)",
  "event MilestoneApproved(string indexed projectId, string indexed milestoneId, address indexed approver, uint256 amount, bytes32 dataHash, uint256 timestamp)",
  "event FundReleased(string indexed referenceId, uint256 amount, address indexed authority, bytes32 dataHash, uint256 timestamp)",
  "event AuditSigned(string indexed projectId, string indexed milestoneId, address indexed auditor, bytes32 dataHash, string decision, uint256 timestamp)",
] as const;

const CORE_ASSIGNMENT_ABI = [
  "event UserAuthorized(address indexed user, string role, uint8 regionCode, uint256 timestamp)",
  "function authorizeUser(address _user, string _role, uint8 _regionCode) external",
  "function authorizeUser(address _user, string _role) external",
  "function authorizePersonnelByRD(address _user, string _role, uint8 _regionCode) external",
  "function registerRegionalCOA(address _auditor, uint8 _regionCode) external",
] as const;

const DEFAULT_LEDGER_LOOKBACK_BLOCKS = 150000;
const PUBLIC_LEDGER_PROJECTS_PAGE_SIZE = 8;

const FINANCIAL_ACTION_TYPES = new Set([
  "DISBURSEMENT",
  "BUDGET_RELEASED",
  "FUND_DISBURSED",
  "FUND_RELEASED",
  "PROJECT_FUNDED",
  "COMMIT_FUNDS",
  "FUNDS_COMMITTED",
  "MILESTONE_PAYMENT_AUTHORIZED",
]);

const ASSIGNMENT_ACTION_TYPES = new Set([
  "FINAL_WHITELIST",
  "PERSONNEL_WHITELISTED",
  "MULTI_PROJECT_PERSONNEL_BOUND",
  "PROFESSIONAL_REGISTERED",
  "CONTRACTOR_ASSIGNED",
  "PERSONNEL_ASSIGNED",
  "COA_AUDITOR_REGISTERED",
]);

const CONTRACTOR_STEP_ACTIONS = new Set(["MILESTONE_SUBMITTED", "ACCOMPLISHMENT_REPORT", "PROGRESS_SUBMITTED"]);
const RD_STEP_ACTIONS = new Set(["MILESTONE_PAYMENT_AUTHORIZED", "PERSONNEL_WHITELISTED", "MULTI_PROJECT_PERSONNEL_BOUND"]);
const COA_STEP_ACTIONS = new Set(["COA_AUDITED", "COA_REJECTED", "AUDIT_ATTESTATION", "COA_FORENSIC_VERIFIED"]);

function toEpoch(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function truncateHex(value?: string, left = 6, right = 4): string {
  if (!value) return "-";
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function normalizeHash(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
}

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

function resolveIntegrityStatus(input: {
  integrityStatus?: string;
  onChainHash?: string;
  offChainHash?: string;
  isTampered?: boolean;
}): "MATCHED" | "TAMPERED" | "NO_ANCHOR" {
  const normalizedStatus = String(input.integrityStatus ?? "").trim().toUpperCase();
  if (normalizedStatus === "MATCHED" || normalizedStatus === "TAMPERED" || normalizedStatus === "NO_ANCHOR") {
    return normalizedStatus;
  }

  const normalizedOnChain = normalizeHash(input.onChainHash);
  const normalizedOffChain = normalizeHash(input.offChainHash);

  if (!normalizedOnChain) return "NO_ANCHOR";
  if (parseBackendBoolean(input.isTampered)) return "TAMPERED";
  return normalizedOnChain === normalizedOffChain ? "MATCHED" : "TAMPERED";
}

function buildIntegritySnapshot(input: {
  recordType: IntegrityRecordType;
  title: string;
  recordId: string;
  projectId: string;
  txHash?: string;
  onChainHash?: string;
  offChainHash?: string;
  integrityStatus?: string;
  isTampered?: boolean;
  checkedAt?: string;
  tamperedAt?: string;
}): IntegrityRecordSnapshot | undefined {
  const onChainHash = String(input.onChainHash ?? "").trim();
  const offChainHash = String(input.offChainHash ?? "").trim();

  const hasAnyIntegritySignal =
    Boolean(onChainHash) ||
    Boolean(offChainHash) ||
    Boolean(input.integrityStatus) ||
    Boolean(input.checkedAt) ||
    Boolean(input.tamperedAt);

  if (!hasAnyIntegritySignal) {
    return undefined;
  }

  const integrityStatus = resolveIntegrityStatus({
    integrityStatus: input.integrityStatus,
    onChainHash,
    offChainHash,
    isTampered: input.isTampered,
  });

  const normalizedOnChain = normalizeHash(onChainHash);
  const normalizedOffChain = normalizeHash(offChainHash);
  const hasAnchor = normalizedOnChain.length > 0;
  const isMatch =
    integrityStatus === "MATCHED"
      ? true
      : integrityStatus === "TAMPERED"
        ? false
        : hasAnchor && normalizedOnChain === normalizedOffChain;

  return {
    recordType: input.recordType,
    title: input.title,
    recordId: input.recordId,
    projectId: input.projectId,
    txHash: input.txHash,
    onChainHash,
    offChainHash,
    integrityStatus,
    isTampered: integrityStatus === "TAMPERED" || parseBackendBoolean(input.isTampered),
    checkedAt: input.checkedAt,
    tamperedAt: input.tamperedAt,
    hasAnchor,
    isMatch,
  };
}

function fromCentavo(raw: unknown): number {
  if (typeof raw === "bigint") return Number(raw) / 100;
  if (typeof raw === "number") return raw / 100;
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed / 100 : 0;
  }
  return 0;
}

function toPositiveAmount(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : undefined;
  }

  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
}

function parsePesoAmountFromText(text: string): number | undefined {
  if (!text) return undefined;

  const match = text.match(/(?:PHP\s*|\u20b1)([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!match?.[1]) return undefined;

  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isFinancialAction(actionType: string): boolean {
  const normalized = actionType.toUpperCase();
  return (
    FINANCIAL_ACTION_TYPES.has(normalized) ||
    normalized.includes("FUND") ||
    normalized.includes("PAYMENT") ||
    normalized.includes("BUDGET") ||
    normalized.includes("DISBURSE")
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return value;
}

function normalizeMediaUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${trimmed.slice("ipfs://".length)}`;
  }
  return trimmed;
}

function normalizeLocationValue(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeWalletAddress(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : undefined;
}

function normalizeStatusTypeValue(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/_/g, " ").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isGovernmentRole(role: string): boolean {
  const normalized = role.toLowerCase();
  return ["admin", "national_budget", "rd", "auditor", "coa", "overseer", "engineer", "inspector", "rdc"].some(
    (tag) => normalized.includes(tag)
  );
}

function isCoaOrRdRole(role: string): boolean {
  const normalized = role.toLowerCase();
  return (
    normalized === "rd" ||
    normalized.includes("regional") ||
    normalized.includes("national") ||
    normalized.includes("dpwh") ||
    normalized.includes("auditor") ||
    normalized.includes("coa") ||
    normalized.includes("overseer") ||
    normalized.includes("admin") ||
    normalized.includes("national_budget")
  );
}

function isAssignmentAction(actionType: string): boolean {
  const normalized = actionType.toUpperCase();
  return (
    ASSIGNMENT_ACTION_TYPES.has(normalized) ||
    normalized.includes("ASSIGN") ||
    normalized.includes("WHITELIST") ||
    normalized.includes("PERSONNEL") ||
    normalized.includes("REGISTER")
  );
}

function isDecisionAction(actionType: string): boolean {
  return /(APPROVED|REJECTED|AUDIT|ATTEST|DECISION|VERIFIED|PAYMENT_AUTHORIZED|WHITELIST|ASSIGN|PERSONNEL|REGISTERED)/.test(
    actionType.toUpperCase()
  );
}

function getActionHeadline(actionType: string): string {
  const normalized = actionType.toUpperCase();

  if (FINANCIAL_ACTION_TYPES.has(normalized)) return "Funds released";
  if (normalized === "FINAL_WHITELIST") return "National whitelist update";
  if (isAssignmentAction(normalized)) return "Personnel update";
  if (normalized.includes("AUDIT") || normalized.includes("COA") || normalized.includes("ATTEST")) {
    return "Audit update";
  }
  if (normalized.includes("REJECT")) return "Not approved";
  if (normalized.includes("APPROVE") || normalized.includes("VERIFIED")) return "Approved";
  if (normalized.includes("CITIZEN") || normalized.includes("REPORT")) return "Citizen report";

  return getActionLabel(actionType);
}

function romanToArabic(value: string): string {
  const roman = value.toUpperCase();
  const map: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  let total = 0;
  let previous = 0;

  for (let index = roman.length - 1; index >= 0; index -= 1) {
    const current = map[roman[index]];
    if (!current) return value;
    if (current < previous) {
      total -= current;
    } else {
      total += current;
      previous = current;
    }
  }

  return String(total);
}

function normalizeRegionLabel(region?: string): string {
  if (!region) return "";

  const cleaned = region.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const romanRegionMatch = cleaned.match(/^Region\s+([IVXLCDM]+)(-[A-Za-z])?\s*(?:-|–)?\s*(.*)$/i);
  if (romanRegionMatch) {
    const romanCode = romanRegionMatch[1] ?? "";
    const suffix = (romanRegionMatch[2] ?? "").toUpperCase();
    const tail = (romanRegionMatch[3] ?? "").trim();
    const numericCode = romanToArabic(romanCode);
    const regionCode = suffix ? `${numericCode}${suffix}` : numericCode;
    return tail ? `Region ${regionCode} ${tail}` : `Region ${regionCode}`;
  }

  const numericRegionMatch = cleaned.match(/^Region\s+([0-9]+(?:-[A-Za-z])?)\s*(?:-|–)?\s*(.*)$/i);
  if (numericRegionMatch) {
    const code = (numericRegionMatch[1] ?? "").toUpperCase();
    const tail = (numericRegionMatch[2] ?? "").trim();
    return tail ? `Region ${code} ${tail}` : `Region ${code}`;
  }

  return cleaned.replace(/\s*-\s*/g, " ");
}

function normalizeRegionValue(region?: string): string | undefined {
  const normalized = normalizeRegionLabel(region);
  if (!normalized) return undefined;

  if (/\u2022/.test(normalized)) return undefined;

  const officeLikeRegionPattern =
    /\b(dpwh|coa|director|auditor|engineer|inspector|office|budget|admin|chair)\b/i;

  if (officeLikeRegionPattern.test(normalized)) {
    return /^\s*national\s*$/i.test(normalized) ? "National" : undefined;
  }

  return normalized;
}

function normalizeActorName(name?: string): string {
  const normalized = String(name ?? "").replace(/\s+/g, " ").trim();
  return normalized || "Assigned official";
}

function roleLabelFromValue(role?: string): string {
  const normalized = String(role ?? "").trim();
  if (!normalized) return "User";

  return normalized
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function officeLabelFromRole(role: string, actorName: string, region?: string): string {
  const normalized = role.toLowerCase();
  const regionLabel = normalizeRegionValue(region);
  const fallbackRegion =
    regionLabel ??
    (normalized.includes("national") || normalized.includes("admin") || normalized.includes("budget")
      ? "National"
      : undefined);

  const withRegion = (baseLabel: string): string =>
    fallbackRegion ? `${baseLabel} \u2022 ${fallbackRegion}` : baseLabel;

  if (!normalized.trim()) {
    return withRegion(normalizeActorName(actorName || "Reporting citizen"));
  }

  let officeTitle = "DPWH National";

  if (normalized.includes("rdc")) {
    officeTitle = "RDC";
  } else if (normalized.includes("coa_overseer") || normalized.includes("coa_admin") || normalized === "overseer") {
    officeTitle = "COA National";
  } else if (normalized.includes("auditor") || normalized.includes("coa") || normalized.includes("overseer")) {
    officeTitle = "COA";
  } else if (normalized.includes("engineer") || normalized.includes("inspector")) {
    officeTitle = "DPWH Engineer";
  } else if (
    normalized === "rd" ||
    normalized.includes("regional director") ||
    normalized.includes("regional_director") ||
    normalized.includes("regional")
  ) {
    officeTitle = "DPWH Regional";
  } else if (normalized.includes("national_budget") || normalized.includes("admin")) {
    officeTitle = "DPWH National";
  } else if (normalized.includes("contractor")) {
    officeTitle = "Contractor";
  } else if (normalized.includes("citizen") || normalized.includes("public") || normalized.includes("community")) {
    officeTitle = "Citizen";
  } else {
    officeTitle = roleLabelFromValue(normalized);
  }

  return withRegion(officeTitle);
}

function postKey(post: FeedPost): string {
  const hash = (post.txHash ?? "").toLowerCase();
  if (hash) {
    const action = String(post.actionType ?? "").trim().toUpperCase() || "UNKNOWN_ACTION";
    const project = String(post.projectId ?? "").trim().toLowerCase() || "NO_PROJECT";
    return `tx:${hash}:${action}:${project}`;
  }
  return `${post.source}:${post.id}`;
}

function postScore(post: FeedPost): number {
  let score = 0;
  if (post.projectName && post.projectName !== post.projectId) score += 2;
  if (post.txHash) score += 2;
  if (post.decisionText) score += 1;
  if (post.officialPhotoUrl || post.citizenPhotoUrl) score += 1;
  if ((post.amount ?? 0) > 0) score += 1;
  return score;
}

function sourcePriority(source: FeedSource): number {
  if (source === "blockchain") return 3;
  if (source === "audit") return 2;
  return 1;
}

function mergeDuplicatePost(existing: FeedPost, incoming: FeedPost): FeedPost {
  const existingScore = postScore(existing);
  const incomingScore = postScore(incoming);

  let preferred = existing;
  if (incomingScore > existingScore) {
    preferred = incoming;
  } else if (incomingScore === existingScore) {
    const existingAmount = existing.amount ?? 0;
    const incomingAmount = incoming.amount ?? 0;

    if (incomingAmount > existingAmount) {
      preferred = incoming;
    } else if (incomingAmount === existingAmount) {
      const incomingSourcePriority = sourcePriority(incoming.source);
      const existingSourcePriority = sourcePriority(existing.source);

      if (incomingSourcePriority > existingSourcePriority) {
        preferred = incoming;
      } else if (incomingSourcePriority === existingSourcePriority && incoming.sortKey > existing.sortKey) {
        preferred = incoming;
      }
    }
  }

  const secondary = preferred === existing ? incoming : existing;
  const richestAmount = Math.max(preferred.amount ?? 0, secondary.amount ?? 0);

  return {
    ...secondary,
    ...preferred,
    amount: richestAmount > 0 ? richestAmount : undefined,
    statusType: preferred.statusType || secondary.statusType,
    decisionText: preferred.decisionText || secondary.decisionText,
    milestoneName: preferred.milestoneName || secondary.milestoneName,
    officialPhotoUrl: preferred.officialPhotoUrl || secondary.officialPhotoUrl,
    citizenPhotoUrl: preferred.citizenPhotoUrl || secondary.citizenPhotoUrl,
    blockNumber: preferred.blockNumber ?? secondary.blockNumber,
  };
}

function mergePosts(posts: FeedPost[]): FeedPost[] {
  const deduped = new Map<string, FeedPost>();

  for (const post of posts) {
    const key = postKey(post);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, post);
      continue;
    }

    deduped.set(key, mergeDuplicatePost(existing, post));
  }

  return Array.from(deduped.values()).sort((left, right) => right.sortKey - left.sortKey);
}

function createReadProvider(): BrowserProvider | JsonRpcProvider {
  if (typeof window !== "undefined" && window.ethereum) {
    return new BrowserProvider(window.ethereum);
  }
  return new JsonRpcProvider("https://rpc.sepolia.org");
}

interface UsePublicLedgerViewModelArgs {
  setCurrentPage: (page: string) => void;
  trackingSlug?: string;
}

function normalizeTrackingSlug(value?: string | number): string {
  return String(value ?? "").trim().toLowerCase();
}

export function usePublicLedgerViewModel({ setCurrentPage, trackingSlug }: UsePublicLedgerViewModelArgs) {
  const {
    setSearchQuery,
    projectSearchQuery,
    setProjectSearchQuery,
    selectedRegion,
    setSelectedRegion,
    selectedMunicipality,
    setSelectedMunicipality,
    selectedBarangay,
    setSelectedBarangay,
    selectedStatusType,
    setSelectedStatusType,
    projectLifecycleFilter,
    setProjectLifecycleFilter,
    expandedPaths,
    setExpandedPaths,
    expandedProjects,
    setExpandedProjects,
    projectChannelById,
    setProjectChannelById,
    projectChannelQueryByKey,
    setProjectChannelQueryByKey,
    projectChannelIssueOnlyByKey,
    setProjectChannelIssueOnlyByKey,
    projectChannelVisibleCountByKey,
    setProjectChannelVisibleCountByKey,
    communityFeedback,
    citizenReports,
    ledgerTransactions,
    rdcProjects,
    milestones,
    auditEntries,
  } = usePublicLedgerPageState();

  const [chainPosts, setChainPosts] = useState<FeedPost[]>([]);
  const [chainSyncing, setChainSyncing] = useState(false);
  const [lastSeenBlock, setLastSeenBlock] = useState<number | null>(null);
  const [blockNumberByTx, setBlockNumberByTx] = useState<Record<string, string>>({});
  const [projectPage, setProjectPage] = useState(1);

  const { projectMetricById } = useFinancialPhysicalIntegrity({
    projects: rdcProjects,
    milestones,
  });

  const spentByProjectId = useMemo(() => buildProjectSpentByMilestones(milestones), [milestones]);

  const allProjects = useMemo(
    () =>
      rdcProjects.map((rdcProject) => {
        const mapped = mapRDCToProject(rdcProject);
        return {
          ...mapped,
          spent: Number(spentByProjectId[rdcProject.id] ?? 0),
        };
      }),
    [rdcProjects, spentByProjectId]
  );

  const projectById = useMemo(() => {
    const map = new Map<string, Project>();
    allProjects.forEach((project) => map.set(String(project.id), project));
    return map;
  }, [allProjects]);

  const projectIdByPersonnelWallet = useMemo(() => {
    const map = new Map<string, string>();

    allProjects.forEach((project) => {
      const projectId = String(project.id ?? "").trim();
      if (!projectId) return;

      const contractorWallet = normalizeWalletAddress(project.contractorWallet);
      if (contractorWallet && !map.has(contractorWallet)) {
        map.set(contractorWallet, projectId);
      }

      const engineerWallet = normalizeWalletAddress(project.engineerWallet);
      if (engineerWallet && !map.has(engineerWallet)) {
        map.set(engineerWallet, projectId);
      }
    });

    return map;
  }, [allProjects]);

  const milestonesByProject = useMemo(() => {
    const map = new Map<string, typeof milestones>();

    milestones.forEach((milestone) => {
      const key = String(milestone.projectId);
      const current = map.get(key) ?? [];
      current.push(milestone);
      map.set(key, current);
    });

    for (const [projectId, grouped] of map.entries()) {
      grouped.sort((left, right) => toEpoch(right.submittedDate) - toEpoch(left.submittedDate));
      map.set(projectId, grouped);
    }

    return map;
  }, [milestones]);

  const milestoneById = useMemo(() => {
    const map = new Map<string, (typeof milestones)[number]>();
    milestones.forEach((milestone) => {
      map.set(String(milestone.id), milestone);
    });
    return map;
  }, [milestones]);

  const getRealtimeProjectMetrics = useCallback(
    (projectId: string, project?: Project) => {
      const metric = projectMetricById[String(projectId)];
      const fundedAmount =
        metric && metric.allocatedBudget > 0
          ? metric.allocatedBudget
          : toPositiveAmount(project?.budget);

      const totalSpent = metric?.disbursedAmount ?? toPositiveAmount(project?.spent) ?? 0;
      const approvedBudget = fundedAmount ?? 0;

      const financialProgressPct =
        approvedBudget > 0
          ? clampPercent((totalSpent / approvedBudget) * 100)
          : clampPercent(metric?.financialProgressPct ?? 0);

      const physicalProgressPct = clampPercent(
        Number(project?.currentProgress ?? project?.progress ?? metric?.physicalProgressPct ?? 0)
      );

      const progressGapPct = financialProgressPct - physicalProgressPct;
      const isHighRisk = progressGapPct > HIGH_RISK_GAP_THRESHOLD_PCT;

      return {
        fundedAmount,
        totalSpent,
        disbursedAmount: metric && metric.disbursedAmount > 0 ? metric.disbursedAmount : undefined,
        financialProgressPct,
        physicalProgressPct,
        progressGapPct,
        isHighRisk,
      };
    },
    [projectMetricById]
  );

  const pickOfficialPhoto = useCallback(
    (projectId: string, milestoneId?: string): string | undefined => {
      const grouped = milestonesByProject.get(projectId) ?? [];

      if (milestoneId) {
        const scoped = grouped.find((item) => item.id === milestoneId);
        const preferred = scoped?.photos?.find((photo) => Boolean(photo.url))?.url;
        if (preferred) return normalizeMediaUrl(preferred);
      }

      for (const milestone of grouped) {
        const url = milestone.photos?.find((photo) => Boolean(photo.url))?.url;
        if (url) return normalizeMediaUrl(url);
      }

      return undefined;
    },
    [milestonesByProject]
  );

  const latestCitizenEvidenceByProject = useMemo(() => {
    const map = new Map<string, { photo?: string; text?: string }>();

    const feedbackFirst = [...communityFeedback].sort((left, right) => toEpoch(right.createdAt) - toEpoch(left.createdAt));
    feedbackFirst.forEach((row) => {
      const key = String(row.projectId);
      if (map.has(key)) return;
      map.set(key, {
        photo: normalizeMediaUrl(row.photo),
        text: row.caption,
      });
    });

    const reportsFirst = [...citizenReports].sort((left, right) => toEpoch(right.reportedDate) - toEpoch(left.reportedDate));
    reportsFirst.forEach((row) => {
      const key = String(row.projectId);
      if (map.has(key)) return;
      map.set(key, {
        photo: normalizeMediaUrl(row.photo),
        text: `${row.reportType}: ${row.description}`,
      });
    });

    return map;
  }, [communityFeedback, citizenReports]);

  const auditNarrativeByTxHash = useMemo(() => {
    const map: Record<string, string> = {};

    for (const entry of auditEntries) {
      const txHash = String(entry.blockchainHash ?? "").trim().toLowerCase();
      if (!txHash || map[txHash]) continue;

      const narrative = String(entry.remarks ?? entry.description ?? "").trim();
      if (!narrative) continue;
      map[txHash] = narrative;
    }

    return map;
  }, [auditEntries]);

  const chainAmountByTxHash = useMemo(() => {
    const map: Record<string, number> = {};

    chainPosts.forEach((post) => {
      const txHash = String(post.txHash ?? "").trim().toLowerCase();
      const amount = post.amount ?? 0;
      if (!txHash || amount <= 0) return;
      if (!map[txHash] || amount > map[txHash]) {
        map[txHash] = amount;
      }
    });

    return map;
  }, [chainPosts]);

  const transactionAmountByTxHash = useMemo(() => {
    const map: Record<string, number> = {};

    ledgerTransactions.forEach((row) => {
      const txHash = String(row.blockchainTxHash ?? "").trim().toLowerCase();
      if (!txHash || row.amount <= 0) return;
      if (!map[txHash] || row.amount > map[txHash]) {
        map[txHash] = row.amount;
      }
    });

    return map;
  }, [ledgerTransactions]);

  const latestTransactionAmountByProject = useMemo(() => {
    const map: Record<string, number> = {};

    const sorted = [...ledgerTransactions].sort((left, right) => toEpoch(right.createdAt) - toEpoch(left.createdAt));
    sorted.forEach((row) => {
      if (!map[row.projectId] && row.amount > 0) {
        map[row.projectId] = row.amount;
      }
    });

    return map;
  }, [ledgerTransactions]);

  const transactionByTxHash = useMemo(() => {
    const map = new Map<string, (typeof ledgerTransactions)[number]>();

    ledgerTransactions.forEach((row) => {
      const txHash = String(row.blockchainTxHash ?? "").trim().toLowerCase();
      if (!txHash) return;

      const existing = map.get(txHash);
      if (!existing || toEpoch(row.createdAt) > toEpoch(existing.createdAt)) {
        map.set(txHash, row);
      }
    });

    return map;
  }, [ledgerTransactions]);

  const latestTransactionByProject = useMemo(() => {
    const map = new Map<string, (typeof ledgerTransactions)[number]>();
    const sorted = [...ledgerTransactions].sort((left, right) => toEpoch(right.createdAt) - toEpoch(left.createdAt));

    sorted.forEach((row) => {
      const projectId = String(row.projectId ?? "").trim();
      if (!projectId || map.has(projectId)) return;
      map.set(projectId, row);
    });

    return map;
  }, [ledgerTransactions]);

  const resolveProjectIntegrity = useCallback(
    (projectId: string): IntegrityRecordSnapshot | undefined => {
      const resolvedProjectId = String(projectId ?? "").trim();
      if (!resolvedProjectId) return undefined;

      const project = projectById.get(resolvedProjectId);
      if (!project) return undefined;

      return buildIntegritySnapshot({
        recordType: "project",
        title: `Project: ${project.name || resolvedProjectId}`,
        recordId: String(project.id ?? resolvedProjectId),
        projectId: String(project.id ?? resolvedProjectId),
        txHash: String(project.blockchainTxHash ?? project.blockchainHash ?? "").trim() || undefined,
        onChainHash: project.blockchainDataHash ?? project.blockchainTxHash ?? project.blockchainHash,
        offChainHash: project.offchainDataHash ?? project.offchainHash,
        integrityStatus: project.integrityStatus,
        isTampered: project.isTampered,
        checkedAt: project.integrityCheckedAt ?? project.lastVerified,
        tamperedAt: project.tamperedAt,
      });
    },
    [projectById]
  );

  const resolveMilestoneIntegrity = useCallback(
    (milestoneId?: string): IntegrityRecordSnapshot | undefined => {
      const resolvedMilestoneId = String(milestoneId ?? "").trim();
      if (!resolvedMilestoneId) return undefined;

      const milestone = milestoneById.get(resolvedMilestoneId);
      if (!milestone) return undefined;

      return buildIntegritySnapshot({
        recordType: "milestone",
        title: `Milestone: ${String(milestone.milestoneName ?? resolvedMilestoneId)}`,
        recordId: String(milestone.id ?? resolvedMilestoneId),
        projectId: String(milestone.projectId ?? ""),
        txHash: String(milestone.blockchainHash ?? "").trim() || undefined,
        onChainHash: milestone.blockchainDataHash ?? milestone.blockchainHash,
        offChainHash: milestone.offchainDataHash,
        integrityStatus: milestone.integrityStatus,
        isTampered: milestone.isTampered,
        checkedAt: milestone.integrityCheckedAt,
        tamperedAt: milestone.tamperedAt,
      });
    },
    [milestoneById]
  );

  const resolveTransactionIntegrity = useCallback(
    (projectId: string, txHash?: string): IntegrityRecordSnapshot | undefined => {
      const normalizedTxHash = String(txHash ?? "").trim().toLowerCase();
      const resolvedProjectId = String(projectId ?? "").trim();

      const transaction = normalizedTxHash
        ? transactionByTxHash.get(normalizedTxHash)
        : (resolvedProjectId ? latestTransactionByProject.get(resolvedProjectId) : undefined);

      if (!transaction) return undefined;

      const resolvedTxHash = String(transaction.blockchainTxHash ?? "").trim();
      const resolvedRecordId = String(transaction.id ?? "").trim() || resolvedTxHash || resolvedProjectId;
      return buildIntegritySnapshot({
        recordType: "transaction",
        title: `Transaction: ${String(transaction.type ?? "Ledger Entry")}`,
        recordId: resolvedRecordId,
        projectId: String(transaction.projectId ?? resolvedProjectId),
        txHash: resolvedTxHash || undefined,
        onChainHash: transaction.blockchainDataHash ?? resolvedTxHash,
        offChainHash: transaction.offchainDataHash,
        integrityStatus: transaction.integrityStatus,
        isTampered: transaction.isTampered,
        checkedAt: transaction.integrityCheckedAt,
        tamperedAt: transaction.tamperedAt,
      });
    },
    [latestTransactionByProject, transactionByTxHash]
  );

  const locationByProject = useMemo(() => {
    const map = new Map<string, { region?: string; municipality?: string; barangay?: string; locationText?: string }>();

    projectById.forEach((project, projectId) => {
      map.set(String(projectId), {
        region: normalizeLocationValue(project.region),
        municipality: normalizeLocationValue(project.municipality),
        barangay: normalizeLocationValue(project.barangay),
        locationText: normalizeLocationValue(project.location),
      });
    });

    auditEntries.forEach((entry) => {
      const projectId = String(entry.projectId ?? "").trim();
      if (!projectId) return;

      const existing = map.get(projectId) ?? {};
      map.set(projectId, {
        region: existing.region ?? normalizeRegionValue(entry.region),
        municipality: existing.municipality ?? normalizeLocationValue(entry.municipality),
        barangay: existing.barangay ?? normalizeLocationValue(entry.barangay),
        locationText:
          existing.locationText ??
          [normalizeLocationValue(entry.barangay), normalizeLocationValue(entry.municipality), normalizeRegionValue(entry.region)]
            .filter(Boolean)
            .join(", "),
      });
    });

    return map;
  }, [auditEntries, projectById]);

  const buildLiveChainPost = useCallback(
    (input: {
      id: string;
      projectId: string;
      milestoneId?: string;
      txHash: string;
      blockNumber?: number;
      timestampMs: number;
      actionType: string;
      actorRole: string;
      actorName: string;
      actorWallet?: string;
      amount: number;
      decisionText: string;
    }): FeedPost => {
      const project = projectById.get(input.projectId);
      const evidence = latestCitizenEvidenceByProject.get(input.projectId);
      const location = locationByProject.get(input.projectId);
      const realtime = getRealtimeProjectMetrics(input.projectId, project);

      return {
        id: input.id,
        sortKey: input.timestampMs,
        source: "blockchain",
        actorKind: "government",
        actorRole: input.actorRole,
        actorName: input.actorName,
        actorWallet: input.actorWallet,
        officeLabel: officeLabelFromRole(input.actorRole, input.actorName, project?.region),
        actionType: input.actionType,
        actionLabel: getActionHeadline(input.actionType),
        statusType: normalizeStatusTypeValue(project?.status),
        decisionText: input.decisionText,
        projectId: input.projectId,
        projectName: project?.name || input.projectId,
        milestoneId: input.milestoneId,
        txHash: input.txHash,
        blockNumber: input.blockNumber,
        amount: input.amount,
        fundedAmount: realtime.fundedAmount,
        totalSpent: realtime.totalSpent,
        disbursedAmount: realtime.disbursedAmount,
        financialProgressPct: realtime.financialProgressPct,
        physicalProgressPct: realtime.physicalProgressPct,
        progressGapPct: realtime.progressGapPct,
        isHighRisk: realtime.isHighRisk,
        progress: realtime.physicalProgressPct,
        officialPhotoUrl: pickOfficialPhoto(input.projectId, input.milestoneId),
        citizenPhotoUrl: evidence?.photo,
        region: location?.region,
        municipality: location?.municipality,
        barangay: location?.barangay,
        locationText: location?.locationText,
      };
    },
    [getRealtimeProjectMetrics, latestCitizenEvidenceByProject, locationByProject, pickOfficialPhoto, projectById]
  );

  useEffect(() => {
    const gateAddress = String(import.meta.env.VITE_GATE_CONTRACT_ADDRESS ?? "").trim();
    if (!gateAddress) return;

    const coreAddress = String(import.meta.env.VITE_CONTRACT_ADDRESS ?? "").trim();
    const configuredStartBlock = Number(import.meta.env.VITE_PUBLIC_LEDGER_START_BLOCK ?? 0);
    const configuredLookback = Number(import.meta.env.VITE_PUBLIC_LEDGER_LOOKBACK_BLOCKS ?? DEFAULT_LEDGER_LOOKBACK_BLOCKS);
    const lookbackBlocks =
      Number.isFinite(configuredLookback) && configuredLookback > 0
        ? Math.floor(configuredLookback)
        : DEFAULT_LEDGER_LOOKBACK_BLOCKS;

    let disposed = false;
    let cleanupBlockListener: (() => void) | undefined;

    const startListener = async () => {
      try {
        setChainSyncing(true);
        const provider = createReadProvider();
        const contract = new Contract(gateAddress, GATE_FEED_ABI, provider);
        const coreContract = coreAddress ? new Contract(coreAddress, CORE_ASSIGNMENT_ABI, provider) : null;
        const coreDecoder = new Interface(CORE_ASSIGNMENT_ABI);

        let lastProcessedBlock = await provider.getBlockNumber();
        const bootstrapFrom =
          Number.isFinite(configuredStartBlock) && configuredStartBlock > 0
            ? Math.floor(configuredStartBlock)
            : Math.max(0, lastProcessedBlock - lookbackBlocks);

        const pushEventsFromRange = async (fromBlock: number, toBlock: number) => {
          if (toBlock < fromBlock) return;

          const [
            milestoneEvents,
            fundsEvents,
            auditEvents,
            milestoneApprovedEvents,
            fundReleasedEvents,
            auditSignedEvents,
            personnelWhitelistedEvents,
            multiProjectPersonnelEvents,
            whitelistFinalizedEvents,
            professionalRegisteredEvents,
            signedActionEvents,
            coreUserAuthorizedEvents,
          ] = await Promise.all([
            contract.queryFilter(contract.filters.MilestonePaymentAuthorized(), fromBlock, toBlock).catch(() => []),
            contract.queryFilter(contract.filters.FundsCommitted(), fromBlock, toBlock).catch(() => []),
            contract.queryFilter(contract.filters.AuditAttested(), fromBlock, toBlock).catch(() => []),
            contract.queryFilter(contract.filters.MilestoneApproved(), fromBlock, toBlock).catch(() => []),
            contract.queryFilter(contract.filters.FundReleased(), fromBlock, toBlock).catch(() => []),
            contract.queryFilter(contract.filters.AuditSigned(), fromBlock, toBlock).catch(() => []),
            contract.queryFilter(contract.filters.PersonnelWhitelisted(), fromBlock, toBlock).catch(() => []),
            contract.queryFilter(contract.filters.MultiProjectPersonnelBound(), fromBlock, toBlock).catch(() => []),
            contract.queryFilter(contract.filters.WhitelistFinalized(), fromBlock, toBlock).catch(() => []),
            contract.queryFilter(contract.filters.ProfessionalRegistered(), fromBlock, toBlock).catch(() => []),
            contract.queryFilter(contract.filters.SignedAction(), fromBlock, toBlock).catch(() => []),
            coreContract ? coreContract.queryFilter(coreContract.filters.UserAuthorized(), fromBlock, toBlock).catch(() => []) : [],
          ]);

          const incoming: FeedPost[] = [];

          milestoneEvents.forEach((eventLog) => {
            const event = eventLog as EventLog;
            const args = event.args;
            const timestampMs = Number(args[5] ?? 0) * 1000;
            if (timestampMs <= 0) return;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            incoming.push(
              buildLiveChainPost({
                id: `chain-milestone-payment-${txHash}`,
                projectId: String(args[0] ?? ""),
                milestoneId: String(args[1] ?? ""),
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType: "MILESTONE_PAYMENT_AUTHORIZED",
                actorRole: "rd",
                actorName: "Regional Director",
                actorWallet: String(args[2] ?? ""),
                amount: toPositiveAmount(fromCentavo(args[3])) ?? 0,
                decisionText: txNarrative,
              })
            );
          });

          fundsEvents.forEach((eventLog) => {
            const event = eventLog as EventLog;
            const args = event.args;
            const timestampMs = Number(args[4] ?? 0) * 1000;
            if (timestampMs <= 0) return;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            incoming.push(
              buildLiveChainPost({
                id: `chain-funds-committed-${txHash}`,
                projectId: String(args[0] ?? ""),
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType: "FUND_RELEASED",
                actorRole: "national_budget",
                actorName: "DPWH National Budget",
                actorWallet: String(args[3] ?? ""),
                amount: toPositiveAmount(fromCentavo(args[2])) ?? 0,
                decisionText: txNarrative,
              })
            );
          });

          auditEvents.forEach((eventLog) => {
            const event = eventLog as EventLog;
            const args = event.args;
            const timestampMs = Number(args[5] ?? 0) * 1000;
            if (timestampMs <= 0) return;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            const onChainVerdict = String(args[4] ?? "").trim();
            incoming.push(
              buildLiveChainPost({
                id: `chain-audit-attested-${txHash}`,
                projectId: String(args[0] ?? ""),
                milestoneId: String(args[1] ?? ""),
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType: "AUDIT_SIGNED",
                actorRole: "auditor",
                actorName: "COA Auditor",
                actorWallet: String(args[2] ?? ""),
                amount: 0,
                decisionText: txNarrative || onChainVerdict,
              })
            );
          });

          milestoneApprovedEvents.forEach((eventLog) => {
            const event = eventLog as EventLog;
            const args = event.args;
            const timestampMs = Number(args[5] ?? 0) * 1000;
            if (timestampMs <= 0) return;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            incoming.push(
              buildLiveChainPost({
                id: `chain-milestone-approved-${txHash}`,
                projectId: String(args[0] ?? ""),
                milestoneId: String(args[1] ?? ""),
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType: "MILESTONE_APPROVED",
                actorRole: "rd",
                actorName: "Regional Director",
                actorWallet: String(args[2] ?? ""),
                amount: toPositiveAmount(fromCentavo(args[3])) ?? 0,
                decisionText: txNarrative,
              })
            );
          });

          fundReleasedEvents.forEach((eventLog) => {
            const event = eventLog as EventLog;
            const args = event.args;
            const timestampMs = Number(args[4] ?? 0) * 1000;
            if (timestampMs <= 0) return;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            incoming.push(
              buildLiveChainPost({
                id: `chain-fund-released-${txHash}`,
                projectId: String(args[0] ?? ""),
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType: "FUND_RELEASED",
                actorRole: "national_budget",
                actorName: "DPWH National Budget",
                actorWallet: String(args[2] ?? ""),
                amount: toPositiveAmount(fromCentavo(args[1])) ?? 0,
                decisionText: txNarrative,
              })
            );
          });

          auditSignedEvents.forEach((eventLog) => {
            const event = eventLog as EventLog;
            const args = event.args;
            const timestampMs = Number(args[5] ?? 0) * 1000;
            if (timestampMs <= 0) return;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            const onChainVerdict = String(args[4] ?? "").trim();
            incoming.push(
              buildLiveChainPost({
                id: `chain-audit-signed-${txHash}`,
                projectId: String(args[0] ?? ""),
                milestoneId: String(args[1] ?? ""),
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType: "AUDIT_SIGNED",
                actorRole: "auditor",
                actorName: "COA Auditor",
                actorWallet: String(args[2] ?? ""),
                amount: 0,
                decisionText: txNarrative || onChainVerdict,
              })
            );
          });

          personnelWhitelistedEvents.forEach((eventLog) => {
            const event = eventLog as EventLog;
            const args = event.args;
            const timestampMs = Number(args[5] ?? 0) * 1000;
            if (timestampMs <= 0) return;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            const contractor = String(args[2] ?? "").trim();
            const engineer = String(args[3] ?? "").trim();
            const defaultNarrative = [
              contractor ? `Contractor ${truncateHex(contractor)}` : "",
              engineer ? `Engineer ${truncateHex(engineer)}` : "",
            ]
              .filter(Boolean)
              .join(" \u2022 ");

            incoming.push(
              buildLiveChainPost({
                id: `chain-personnel-whitelisted-${txHash}`,
                projectId: String(args[0] ?? ""),
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType: "PERSONNEL_WHITELISTED",
                actorRole: "rd",
                actorName: "Regional Director",
                actorWallet: String(args[1] ?? ""),
                amount: 0,
                decisionText: txNarrative || defaultNarrative,
              })
            );
          });

          multiProjectPersonnelEvents.forEach((eventLog) => {
            const event = eventLog as EventLog;
            const args = event.args;
            const timestampMs = Number(args[6] ?? 0) * 1000;
            if (timestampMs <= 0) return;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            const contractor = String(args[2] ?? "").trim();
            const engineer = String(args[3] ?? "").trim();
            const municipalityId = String(args[4] ?? "").trim();
            const fallbackDetails = [
              contractor ? `Contractor ${truncateHex(contractor)}` : "",
              engineer ? `Engineer ${truncateHex(engineer)}` : "",
              municipalityId ? `Municipality #${municipalityId}` : "",
            ]
              .filter(Boolean)
              .join(" \u2022 ");

            incoming.push(
              buildLiveChainPost({
                id: `chain-multi-project-personnel-${txHash}`,
                projectId: String(args[1] ?? ""),
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType: "MULTI_PROJECT_PERSONNEL_BOUND",
                actorRole: "rd",
                actorName: "Regional Director",
                actorWallet: undefined,
                amount: 0,
                decisionText: txNarrative || fallbackDetails,
              })
            );
          });

          whitelistFinalizedEvents.forEach((eventLog) => {
            const event = eventLog as EventLog;
            const args = event.args;
            const timestampMs = Number(args[4] ?? 0) * 1000;
            if (timestampMs <= 0) return;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            const role = String(args[3] ?? "").trim();
            const userWallet = String(args[2] ?? "").trim();
            const resolvedProjectId =
              projectIdByPersonnelWallet.get(normalizeWalletAddress(userWallet) ?? "") ?? String(args[0] ?? "");
            const resolvedProjectName = projectById.get(resolvedProjectId)?.name;

            incoming.push(
              buildLiveChainPost({
                id: `chain-whitelist-finalized-${txHash}`,
                projectId: resolvedProjectId,
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType: "FINAL_WHITELIST",
                actorRole: "admin",
                actorName: "DPWH National",
                actorWallet: String(args[1] ?? ""),
                amount: 0,
                decisionText:
                  txNarrative ||
                  `Whitelisted ${role || "official"} wallet ${truncateHex(userWallet)}${resolvedProjectName ? ` for ${resolvedProjectName}` : ""}.`,
              })
            );
          });

          professionalRegisteredEvents.forEach((eventLog) => {
            const event = eventLog as EventLog;
            const args = event.args;
            const timestampMs = Number(args[6] ?? 0) * 1000;
            if (timestampMs <= 0) return;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            const professional = String(args[0] ?? "").trim();
            const role = String(args[1] ?? "").trim();
            const region = String(args[2] ?? "").trim();
            const licenseId = String(args[3] ?? "").trim();
            const referenceId = licenseId ? `REG-${licenseId}` : `PRO-${professional.slice(-8)}`;

            incoming.push(
              buildLiveChainPost({
                id: `chain-professional-registered-${txHash}`,
                projectId: referenceId,
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType: "PROFESSIONAL_REGISTERED",
                actorRole: "rd",
                actorName: "Regional Director",
                actorWallet: String(args[4] ?? ""),
                amount: 0,
                decisionText:
                  txNarrative ||
                  `Registered ${role || "professional"} ${truncateHex(professional)}${region ? ` for ${region}` : ""}.`,
              })
            );
          });

          signedActionEvents.forEach((eventLog) => {
            const event = eventLog as EventLog;
            const args = event.args;
            const actionType = String(args[2] ?? "").trim().toUpperCase();
            if (!isAssignmentAction(actionType)) return;

            const timestampMs = Number(args[5] ?? 0) * 1000;
            if (timestampMs <= 0) return;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            const referenceId = String(args[4] ?? "").trim();
            const role = String(args[1] ?? "").trim().toLowerCase();

            let actorName = "Assigned official";
            if (role.includes("coa") || role.includes("overseer")) {
              actorName = "COA National";
            } else if (role.includes("rd")) {
              actorName = "Regional Director";
            } else if (role.includes("admin") || role.includes("national")) {
              actorName = "DPWH National";
            }

            incoming.push(
              buildLiveChainPost({
                id: `chain-signed-action-${txHash}`,
                projectId: referenceId || `ACTION-${txHash.slice(-8)}`,
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType,
                actorRole: role || "admin",
                actorName,
                actorWallet: String(args[0] ?? ""),
                amount: 0,
                decisionText: txNarrative,
              })
            );
          });

          for (const eventLog of coreUserAuthorizedEvents) {
            const event = eventLog as EventLog;
            const args = event.args;
            const timestampMs = Number(args[3] ?? 0) * 1000;
            if (timestampMs <= 0) continue;

            const txHash = event.transactionHash;
            const txNarrative = auditNarrativeByTxHash[txHash.toLowerCase()] ?? "";
            const assigneeWallet = String(args[0] ?? "").trim();
            const assignedRole = String(args[1] ?? "").trim();
            const regionCode = Number(args[2] ?? 0);
            const resolvedProjectId =
              projectIdByPersonnelWallet.get(normalizeWalletAddress(assigneeWallet) ?? "") ?? "";
            const resolvedProjectName = resolvedProjectId ? projectById.get(resolvedProjectId)?.name : undefined;

            let actorRole = "admin";
            let actorName = "DPWH National";
            let actionType = "FINAL_WHITELIST";
            let actorWallet = "";

            try {
              const tx = await provider.getTransaction(txHash);
              actorWallet = String(tx?.from ?? "").trim();

              if (tx?.data) {
                const parsedTx = coreDecoder.parseTransaction({
                  data: tx.data,
                  value: tx.value ?? 0n,
                });

                if (parsedTx?.name === "registerRegionalCOA") {
                  actorRole = "coa_overseer";
                  actorName = "COA National";
                  actionType = "COA_AUDITOR_REGISTERED";
                } else if (parsedTx?.name === "authorizePersonnelByRD") {
                  actorRole = "rd";
                  actorName = "Regional Director";
                  actionType = "PERSONNEL_WHITELISTED";
                } else if (parsedTx?.name === "authorizeUser") {
                  actorRole = "admin";
                  actorName = "DPWH National";
                  actionType = "FINAL_WHITELIST";
                }
              }
            } catch {
              // Intentionally ignore decode errors and keep fallback values.
            }

            const regionLabel = regionCode > 0 ? `Region ${regionCode}` : "National";
            const assignmentNarrative =
              txNarrative ||
              `${actorName} assigned ${roleLabelFromValue(assignedRole || "official")} wallet ${truncateHex(assigneeWallet)} (${regionLabel})${resolvedProjectName ? ` for ${resolvedProjectName}` : ""}.`;

            incoming.push(
              buildLiveChainPost({
                id: `chain-core-user-authorized-${txHash}`,
                projectId:
                  resolvedProjectId || `AUTH-${assigneeWallet.slice(-8).toUpperCase() || txHash.slice(-8).toUpperCase()}`,
                txHash,
                blockNumber: event.blockNumber,
                timestampMs,
                actionType,
                actorRole,
                actorName,
                actorWallet: actorWallet || undefined,
                amount: 0,
                decisionText: assignmentNarrative,
              })
            );
          }

          if (!disposed && incoming.length > 0) {
            setChainPosts((prev) => mergePosts([...incoming, ...prev]));
          }
        };

        await pushEventsFromRange(bootstrapFrom, lastProcessedBlock);
        if (disposed) return;

        setLastSeenBlock(lastProcessedBlock);

        const handleBlock = async (blockNumber: number) => {
          if (disposed || blockNumber <= lastProcessedBlock) return;
          await pushEventsFromRange(lastProcessedBlock + 1, blockNumber);
          lastProcessedBlock = blockNumber;
          setLastSeenBlock(blockNumber);
        };

        provider.on("block", handleBlock);
        cleanupBlockListener = () => {
          provider.off("block", handleBlock);
        };
      } finally {
        if (!disposed) setChainSyncing(false);
      }
    };

    void startListener();

    return () => {
      disposed = true;
      cleanupBlockListener?.();
    };
  }, [auditNarrativeByTxHash, buildLiveChainPost, projectById, projectIdByPersonnelWallet]);

  const auditPosts = useMemo(() => {
    const projectBudgetFallbackActionTypes = new Set(["PROJECT_FUNDED", "COMMIT_FUNDS", "FUNDS_COMMITTED", "NATIONAL_APPROVED"]);

    const resolveAuditAmount = (entry: AuditEntry): number | undefined => {
      const fromAudit = toPositiveAmount(entry.amount);
      if (fromAudit) return fromAudit;

      const txHash = String(entry.blockchainHash ?? "").trim().toLowerCase();
      if (txHash) {
        const chainAmount = chainAmountByTxHash[txHash];
        if (chainAmount && chainAmount > 0) return chainAmount;

        const transactionAmount = transactionAmountByTxHash[txHash];
        if (transactionAmount && transactionAmount > 0) return transactionAmount;
      }

      const actionType = String(entry.actionType ?? "").toUpperCase();
      if (!isFinancialAction(actionType)) return undefined;

      const milestoneId = String(entry.milestoneId ?? "").trim();
      if (milestoneId) {
        const milestone = milestoneById.get(milestoneId);
        const milestoneAmount = toPositiveAmount(milestone?.requestedAmount);
        if (milestoneAmount) return milestoneAmount;
      }

      const textAmount = parsePesoAmountFromText(`${entry.remarks ?? ""} ${entry.description ?? ""}`.trim());
      if (textAmount) return textAmount;

      const projectId = String(entry.projectId ?? "").trim();
      if (projectBudgetFallbackActionTypes.has(actionType)) {
        const transactionAmount = latestTransactionAmountByProject[projectId];
        if (transactionAmount && transactionAmount > 0) return transactionAmount;

        const projectBudget = toPositiveAmount(projectById.get(projectId)?.budget);
        if (projectBudget) return projectBudget;
      }

      return undefined;
    };

    return auditEntries.map((entry) => {
      const projectId = String(entry.projectId ?? "");
      const project = projectById.get(projectId);
      const role = String(entry.actorRole ?? "");
      const actorKind: ActorKind = isGovernmentRole(role) ? "government" : "citizen";
      const evidence = latestCitizenEvidenceByProject.get(projectId);
      const location = locationByProject.get(projectId);
      const realtime = getRealtimeProjectMetrics(projectId, project);

      return {
        id: `audit-${entry.id}`,
        sortKey: toEpoch(entry.timestamp),
        source: "audit" as const,
        actorKind,
        actorRole: role,
        actorName: entry.actorName,
        actorWallet: entry.actorWallet,
        officeLabel: officeLabelFromRole(role, entry.actorName, entry.region),
        actionType: entry.actionType,
        actionLabel: getActionHeadline(entry.actionType),
        statusType:
          normalizeStatusTypeValue(entry.newStatus) ||
          normalizeStatusTypeValue(project?.status) ||
          normalizeStatusTypeValue(entry.previousStatus),
        decisionText: entry.remarks || entry.description || "",
        projectId,
        projectName: project?.name || entry.projectName || projectId,
        milestoneId: entry.milestoneId,
        milestoneName: entry.milestoneName,
        txHash: entry.blockchainHash,
        amount: resolveAuditAmount(entry),
        fundedAmount: realtime.fundedAmount,
        totalSpent: realtime.totalSpent,
        disbursedAmount: realtime.disbursedAmount,
        financialProgressPct: realtime.financialProgressPct,
        physicalProgressPct: realtime.physicalProgressPct,
        progressGapPct: realtime.progressGapPct,
        isHighRisk: realtime.isHighRisk,
        progress: realtime.physicalProgressPct,
        officialPhotoUrl: pickOfficialPhoto(projectId, entry.milestoneId),
        citizenPhotoUrl: evidence?.photo,
        region: normalizeRegionValue(entry.region) ?? location?.region,
        municipality: normalizeLocationValue(entry.municipality) ?? location?.municipality,
        barangay: normalizeLocationValue(entry.barangay) ?? location?.barangay,
        locationText:
          [normalizeLocationValue(entry.barangay), normalizeLocationValue(entry.municipality), normalizeRegionValue(entry.region)]
            .filter(Boolean)
            .join(", ") || location?.locationText,
      };
    });
  }, [
    auditEntries,
    chainAmountByTxHash,
    getRealtimeProjectMetrics,
    latestCitizenEvidenceByProject,
    latestTransactionAmountByProject,
    locationByProject,
    milestoneById,
    pickOfficialPhoto,
    projectById,
    transactionAmountByTxHash,
  ]);

  const communityPosts = useMemo(() => {
    const fromFeedback: FeedPost[] = communityFeedback.map((row) => {
      const project = projectById.get(String(row.projectId));
      const location = locationByProject.get(String(row.projectId));
      const realtime = getRealtimeProjectMetrics(String(row.projectId), project);
      return {
        id: `community-feedback-${row.id}`,
        sortKey: toEpoch(row.createdAt),
        source: "database",
        actorKind: "citizen",
        actorRole: "public",
        actorName: row.submittedBy || "Reporting citizen",
        actorWallet: row.walletAddress,
        officeLabel: row.submittedBy || "Reporting citizen",
        actionType: "CITIZEN_FEEDBACK",
        actionLabel: "Citizen feedback",
        statusType: normalizeStatusTypeValue(project?.status),
        decisionText: row.caption,
        projectId: String(row.projectId),
        projectName: project?.name || row.projectName || row.projectId,
        txHash: undefined,
        amount: undefined,
        fundedAmount: realtime.fundedAmount,
        totalSpent: realtime.totalSpent,
        disbursedAmount: realtime.disbursedAmount,
        financialProgressPct: realtime.financialProgressPct,
        physicalProgressPct: realtime.physicalProgressPct,
        progressGapPct: realtime.progressGapPct,
        isHighRisk: realtime.isHighRisk,
        progress: realtime.physicalProgressPct,
        officialPhotoUrl: pickOfficialPhoto(String(row.projectId)),
        citizenPhotoUrl: normalizeMediaUrl(row.photo),
        region: location?.region,
        municipality: location?.municipality,
        barangay: location?.barangay,
        locationText: normalizeLocationValue(row.location) || location?.locationText,
      };
    });

    const fromReports: FeedPost[] = citizenReports.map((row) => {
      const project = projectById.get(String(row.projectId));
      const location = locationByProject.get(String(row.projectId));
      const realtime = getRealtimeProjectMetrics(String(row.projectId), project);
      return {
        id: `community-report-${row.id}`,
        sortKey: toEpoch(row.reportedDate),
        source: "database",
        actorKind: "citizen",
        actorRole: "public",
        actorName: row.reportedBy || "Reporting citizen",
        actorWallet: row.walletAddress,
        officeLabel: row.reportedBy || "Reporting citizen",
        actionType: "CITIZEN_REPORT",
        actionLabel: "Citizen report",
        statusType: normalizeStatusTypeValue(project?.status),
        decisionText: [row.reportType, row.description].filter(Boolean).join(": "),
        projectId: String(row.projectId),
        projectName: project?.name || row.projectName || row.projectId,
        txHash: undefined,
        amount: undefined,
        fundedAmount: realtime.fundedAmount,
        totalSpent: realtime.totalSpent,
        disbursedAmount: realtime.disbursedAmount,
        financialProgressPct: realtime.financialProgressPct,
        physicalProgressPct: realtime.physicalProgressPct,
        progressGapPct: realtime.progressGapPct,
        isHighRisk: realtime.isHighRisk,
        progress: realtime.physicalProgressPct,
        officialPhotoUrl: pickOfficialPhoto(String(row.projectId)),
        citizenPhotoUrl: normalizeMediaUrl(row.photo),
        region: location?.region,
        municipality: location?.municipality,
        barangay: location?.barangay,
        locationText: location?.locationText,
      };
    });

    return [...fromFeedback, ...fromReports];
  }, [citizenReports, communityFeedback, getRealtimeProjectMetrics, locationByProject, pickOfficialPhoto, projectById]);

  const mergedFeed = useMemo(() => mergePosts([...chainPosts, ...auditPosts, ...communityPosts]), [chainPosts, auditPosts, communityPosts]);

  useEffect(() => {
    const unresolved = mergedFeed
      .filter((post) => post.txHash && isRealTxHash(post.txHash))
      .map((post) => String(post.txHash).toLowerCase())
      .filter((txHash) => !blockNumberByTx[txHash]);

    if (unresolved.length === 0) return;

    let disposed = false;

    const hydrateBlockNumbers = async () => {
      const provider = createReadProvider();
      const updates: Record<string, string> = {};

      for (const txHash of unresolved.slice(0, 20)) {
        try {
          const receipt = await provider.getTransactionReceipt(txHash);
          if (receipt?.blockNumber) {
            updates[txHash] = String(receipt.blockNumber);
          }
        } catch {
          // Ignore non-critical tx lookup errors.
        }
      }

      if (!disposed && Object.keys(updates).length > 0) {
        setBlockNumberByTx((prev) => ({ ...prev, ...updates }));
      }
    };

    void hydrateBlockNumbers();

    return () => {
      disposed = true;
    };
  }, [blockNumberByTx, mergedFeed]);

  const auditEntriesByProject = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();

    auditEntries.forEach((entry) => {
      const key = String(entry.projectId ?? "");
      const current = map.get(key) ?? [];
      current.push(entry);
      map.set(key, current);
    });

    for (const [projectId, entries] of map.entries()) {
      entries.sort((left, right) => toEpoch(right.timestamp) - toEpoch(left.timestamp));
      map.set(projectId, entries);
    }

    return map;
  }, [auditEntries]);

  const buildDecisionPath = useCallback(
    (post: FeedPost): DecisionPathStep[] => {
      const scopedEntries = (auditEntriesByProject.get(post.projectId) ?? []).filter((entry) => {
        if (!post.milestoneId) return true;
        if (!entry.milestoneId) return true;
        return String(entry.milestoneId) === String(post.milestoneId);
      });

      const contractor = scopedEntries.find(
        (entry) => entry.actorRole.toLowerCase().includes("contractor") || CONTRACTOR_STEP_ACTIONS.has(entry.actionType.toUpperCase())
      );
      const rd = scopedEntries.find(
        (entry) => entry.actorRole.toLowerCase() === "rd" || RD_STEP_ACTIONS.has(entry.actionType.toUpperCase())
      );
      const coa = scopedEntries.find(
        (entry) =>
          entry.actorRole.toLowerCase().includes("auditor") ||
          entry.actorRole.toLowerCase().includes("coa") ||
          COA_STEP_ACTIONS.has(entry.actionType.toUpperCase())
      );

      const coaHash = coa?.blockchainHash || post.txHash;

      return [
        {
          key: "contractor",
          title: "Contractor",
          detail: contractor
            ? `${contractor.actorName || "Contractor"} submitted proof of completed work.`
            : "No contractor submission has been logged yet.",
          timestamp: contractor?.timestamp,
          wallet: contractor?.actorWallet,
          signature: contractor?.blockchainHash,
          complete: Boolean(contractor),
        },
        {
          key: "rd",
          title: "Regional Director",
          detail: rd
            ? `${rd.actorName || "Regional Director"} reviewed and signed for approval.`
            : "No Regional Director review has been logged yet.",
          timestamp: rd?.timestamp,
          wallet: rd?.actorWallet,
          signature: rd?.blockchainHash,
          complete: Boolean(rd),
        },
        {
          key: "coa",
          title: "COA Auditor",
          detail: coa
            ? `${coa.actorName || "COA Auditor"} issued final audit approval.`
            : "No final audit approval has been logged yet.",
          timestamp: coa?.timestamp,
          wallet: coa?.actorWallet,
          signature: coaHash,
          blockNumber: coaHash ? blockNumberByTx[coaHash.toLowerCase()] : post.blockNumber ? String(post.blockNumber) : undefined,
          complete: Boolean(coa || post.actionType.toUpperCase().includes("AUDIT")),
        },
      ];
    },
    [auditEntriesByProject, blockNumberByTx]
  );

  const togglePath = (postId: string) => {
    setExpandedPaths((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  const postsByProject = useMemo(() => {
    const map = new Map<string, FeedPost[]>();

    mergedFeed.forEach((post) => {
      const projectId = String(post.projectId ?? "").trim();
      if (!projectId) return;
      const current = map.get(projectId) ?? [];
      current.push(post);
      map.set(projectId, current);
    });

    for (const [projectId, posts] of map.entries()) {
      posts.sort((left, right) => right.sortKey - left.sortKey);
      map.set(projectId, posts);
    }

    return map;
  }, [mergedFeed]);

  const nationalFundingProjectIds = useMemo(() => {
    const ids = new Set<string>();

    mergedFeed.forEach((post) => {
      const projectId = String(post.projectId ?? "").trim();
      if (!projectId) return;

      const role = String(post.actorRole ?? "").toLowerCase();
      const action = String(post.actionType ?? "").toUpperCase();
      const nationalFundingSignal =
        role.includes("national_budget") &&
        (isFinancialAction(post.actionType) || action.includes("FUNDED") || action.includes("RELEASE"));

      if (nationalFundingSignal) {
        ids.add(projectId);
      }
    });

    return ids;
  }, [mergedFeed]);

  const projectLifecycleGroups = useMemo(() => {
    return allProjects.reduce(
      (groups, project) => {
        const projectId = String(project.id ?? "").trim();
        if (!projectId) return groups;

        const statusFingerprint = `${project.rawStatus ?? ""} ${project.status ?? ""}`.toUpperCase();
        const fundedByStatus = /(FUNDED|ONGOING|PERSONNEL_ASSIGNED)/.test(statusFingerprint);
        const realtime = getRealtimeProjectMetrics(projectId, project);
        const fundedByAmount = (toPositiveAmount(realtime.fundedAmount) ?? toPositiveAmount(project.budget) ?? 0) > 0;
        const publicByActivation = Boolean(project.isPublic && project.isQrActive && project.trackingSlug);
        const isFunded = publicByActivation || nationalFundingProjectIds.has(projectId) || fundedByStatus || fundedByAmount;

        const isProposal =
          !isFunded &&
          /(PROPOSAL|PROPOSED|PENDING|SUBMIT|REVIEW|DRAFT|ENDORSE|VALIDAT|EVALUAT)/.test(statusFingerprint);

        if (isFunded) {
          groups.funded.push(project);
        }

        if (isProposal) {
          groups.proposals.push(project);
        }

        return groups;
      },
      { funded: [] as Project[], proposals: [] as Project[] }
    );
  }, [allProjects, getRealtimeProjectMetrics, nationalFundingProjectIds]);

  const fundedProjects = useMemo(() => {
    return [...projectLifecycleGroups.funded].sort((left, right) => left.name.localeCompare(right.name));
  }, [projectLifecycleGroups.funded]);

  const proposalProjects = useMemo(() => {
    return [...projectLifecycleGroups.proposals].sort((left, right) => left.name.localeCompare(right.name));
  }, [projectLifecycleGroups.proposals]);

  const lifecycleProjects = useMemo(() => {
    if (projectLifecycleFilter === "proposals") return proposalProjects;

    if (projectLifecycleFilter === "all") {
      const merged = [...fundedProjects, ...proposalProjects];
      const unique = new Map<string, Project>();

      merged.forEach((project) => {
        const projectId = String(project.id ?? "").trim();
        if (!projectId || unique.has(projectId)) return;
        unique.set(projectId, project);
      });

      return Array.from(unique.values()).sort((left, right) => left.name.localeCompare(right.name));
    }

    return fundedProjects;
  }, [fundedProjects, projectLifecycleFilter, proposalProjects]);

  const normalizedTrackingSlug = useMemo(() => normalizeTrackingSlug(trackingSlug), [trackingSlug]);

  const monitoredProjectId = useMemo(() => {
    if (!normalizedTrackingSlug) return "";

    const matched = fundedProjects.find((project) => {
      const tracking = normalizeTrackingSlug(project.trackingSlug);
      const projectId = normalizeTrackingSlug(project.id);
      return tracking === normalizedTrackingSlug || projectId === normalizedTrackingSlug;
    });

    return String(matched?.id ?? "").trim();
  }, [fundedProjects, normalizedTrackingSlug]);

  useEffect(() => {
    if (!normalizedTrackingSlug || !monitoredProjectId) return;

    setExpandedProjects((prev) => ({
      ...prev,
      [monitoredProjectId]: true,
    }));
  }, [monitoredProjectId, normalizedTrackingSlug, setExpandedProjects]);

  useEffect(() => {
    if (normalizedTrackingSlug) return;

    const selectedProjectId = String(sessionStorage.getItem("selectedProjectId") ?? "").trim();
    if (!selectedProjectId) return;

    const targetProject = lifecycleProjects.find(
      (project) => String(project.id ?? "").trim() === selectedProjectId
    );
    if (!targetProject) return;

    setProjectLifecycleFilter("all");
    setProjectSearchQuery((prev) => prev || String(targetProject.name ?? selectedProjectId));
    setExpandedProjects((prev) => ({
      ...prev,
      [selectedProjectId]: true,
    }));

    sessionStorage.removeItem("selectedProjectId");
  }, [
    lifecycleProjects,
    normalizedTrackingSlug,
    setExpandedProjects,
    setProjectLifecycleFilter,
    setProjectSearchQuery,
  ]);

  const projectRegionOptions = useMemo(() => {
    return Array.from(
      new Set(
        lifecycleProjects
          .map((project) => normalizeRegionLabel(project.region || project.dpwhRegion || ""))
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right));
  }, [lifecycleProjects]);

  const projectMunicipalityOptions = useMemo(() => {
    const source = selectedRegion
      ? lifecycleProjects.filter(
          (project) =>
            normalizeRegionLabel(project.region || project.dpwhRegion || "").toLowerCase() ===
            selectedRegion.toLowerCase()
        )
      : lifecycleProjects;

    return Array.from(new Set(source.map((project) => normalizeLocationValue(project.municipality)).filter(Boolean) as string[])).sort(
      (left, right) => left.localeCompare(right)
    );
  }, [lifecycleProjects, selectedRegion]);

  const projectBarangayOptions = useMemo(() => {
    const source = lifecycleProjects.filter((project) => {
      const region = normalizeRegionLabel(project.region || project.dpwhRegion || "");
      const municipality = normalizeLocationValue(project.municipality) ?? "";

      if (selectedRegion && region.toLowerCase() !== selectedRegion.toLowerCase()) {
        return false;
      }

      if (selectedMunicipality && municipality.toLowerCase() !== selectedMunicipality.toLowerCase()) {
        return false;
      }

      return true;
    });

    return Array.from(new Set(source.map((project) => normalizeLocationValue(project.barangay)).filter(Boolean) as string[])).sort(
      (left, right) => left.localeCompare(right)
    );
  }, [lifecycleProjects, selectedMunicipality, selectedRegion]);

  const projectStatusOptions = useMemo(() => {
    const source = lifecycleProjects.filter((project) => {
      const region = normalizeRegionLabel(project.region || project.dpwhRegion || "");
      const municipality = normalizeLocationValue(project.municipality) ?? "";
      const barangay = normalizeLocationValue(project.barangay) ?? "";

      if (selectedRegion && region.toLowerCase() !== selectedRegion.toLowerCase()) {
        return false;
      }

      if (selectedMunicipality && municipality.toLowerCase() !== selectedMunicipality.toLowerCase()) {
        return false;
      }

      if (selectedBarangay && barangay.toLowerCase() !== selectedBarangay.toLowerCase()) {
        return false;
      }

      return true;
    });

    return Array.from(new Set(source.map((project) => normalizeStatusTypeValue(project.status)).filter(Boolean) as string[])).sort(
      (left, right) => left.localeCompare(right)
    );
  }, [lifecycleProjects, selectedBarangay, selectedMunicipality, selectedRegion]);

  useEffect(() => {
    if (!selectedRegion) return;

    const stillValid = projectRegionOptions.some((region) => region.toLowerCase() === selectedRegion.toLowerCase());
    if (!stillValid) {
      setSelectedRegion("");
    }
  }, [projectRegionOptions, selectedRegion, setSelectedRegion]);

  useEffect(() => {
    if (!selectedMunicipality) return;

    const stillValid = projectMunicipalityOptions.some(
      (municipality) => municipality.toLowerCase() === selectedMunicipality.toLowerCase()
    );
    if (!stillValid) {
      setSelectedMunicipality("");
    }
  }, [projectMunicipalityOptions, selectedMunicipality, setSelectedMunicipality]);

  useEffect(() => {
    if (!selectedBarangay) return;

    const stillValid = projectBarangayOptions.some((barangay) => barangay.toLowerCase() === selectedBarangay.toLowerCase());
    if (!stillValid) {
      setSelectedBarangay("");
    }
  }, [projectBarangayOptions, selectedBarangay, setSelectedBarangay]);

  useEffect(() => {
    if (!selectedStatusType) return;

    const stillValid = projectStatusOptions.some((status) => status.toLowerCase() === selectedStatusType.toLowerCase());
    if (!stillValid) {
      setSelectedStatusType("");
    }
  }, [projectStatusOptions, selectedStatusType, setSelectedStatusType]);

  const filteredFundedProjects = useMemo(() => {
    const query = projectSearchQuery.trim().toLowerCase();
    const source = monitoredProjectId
      ? lifecycleProjects.filter((project) => String(project.id ?? "").trim() === monitoredProjectId)
      : lifecycleProjects;

    return source.filter((project) => {
      const region = normalizeRegionLabel(project.region || project.dpwhRegion || "");
      const municipality = normalizeLocationValue(project.municipality) ?? "";
      const barangay = normalizeLocationValue(project.barangay) ?? "";
      const status = normalizeStatusTypeValue(project.status) ?? "";

      if (selectedRegion && region.toLowerCase() !== selectedRegion.toLowerCase()) {
        return false;
      }

      if (selectedMunicipality && municipality.toLowerCase() !== selectedMunicipality.toLowerCase()) {
        return false;
      }

      if (selectedBarangay && barangay.toLowerCase() !== selectedBarangay.toLowerCase()) {
        return false;
      }

      if (selectedStatusType && status.toLowerCase() !== selectedStatusType.toLowerCase()) {
        return false;
      }

      if (!query) return true;

      const searchable = [
        String(project.id ?? ""),
        String(project.name ?? ""),
        region,
        municipality,
        barangay,
        status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [
    lifecycleProjects,
    monitoredProjectId,
    projectSearchQuery,
    selectedBarangay,
    selectedMunicipality,
    selectedRegion,
    selectedStatusType,
  ]);

  useEffect(() => {
    setProjectPage(1);
  }, [projectSearchQuery, selectedRegion, selectedMunicipality, selectedBarangay, selectedStatusType, projectLifecycleFilter]);

  const projectTotalPages = Math.max(
    1,
    Math.ceil(filteredFundedProjects.length / PUBLIC_LEDGER_PROJECTS_PAGE_SIZE)
  );

  const pagedFilteredFundedProjects = useMemo(() => {
    const safePage = Math.min(projectPage, projectTotalPages);
    const start = (safePage - 1) * PUBLIC_LEDGER_PROJECTS_PAGE_SIZE;
    return filteredFundedProjects.slice(start, start + PUBLIC_LEDGER_PROJECTS_PAGE_SIZE);
  }, [filteredFundedProjects, projectPage, projectTotalPages]);

  const hasProjectFilters =
    projectSearchQuery.trim().length > 0 ||
    selectedRegion.length > 0 ||
    selectedMunicipality.length > 0 ||
    selectedBarangay.length > 0 ||
    selectedStatusType.length > 0 ||
    projectLifecycleFilter !== "funded";

  const clearProjectFilters = useCallback(() => {
    setProjectSearchQuery("");
    setSelectedRegion("");
    setSelectedMunicipality("");
    setSelectedBarangay("");
    setSelectedStatusType("");
    setProjectLifecycleFilter("funded");
  }, [
    setProjectSearchQuery,
    setSelectedBarangay,
    setSelectedMunicipality,
    setSelectedRegion,
    setSelectedStatusType,
    setProjectLifecycleFilter,
  ]);

  const getProjectChannelPosts = useCallback(
    (projectId: string, channel: ProjectChannel): FeedPost[] => {
      const source = postsByProject.get(projectId) ?? [];

      if (channel === "financial") {
        return source.filter((post) => {
          const upper = post.actionType.toUpperCase();
          return FINANCIAL_ACTION_TYPES.has(upper) || isFinancialAction(post.actionType);
        });
      }

      if (channel === "decision") {
        return source.filter(
          (post) =>
            isCoaOrRdRole(post.actorRole) &&
            isDecisionAction(post.actionType) &&
            !isAssignmentAction(post.actionType)
        );
      }

      // Keep citizen entries in Community Hub only; timeline should focus on official project updates.
      return source.filter((post) => post.actorKind !== "citizen");
    },
    [postsByProject]
  );

  const toggleProjectExpansion = useCallback((projectId: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  }, [setExpandedProjects]);

  const setProjectChannel = useCallback((projectId: string, channel: ProjectChannel) => {
    setProjectChannelById((prev) => ({
      ...prev,
      [projectId]: channel,
    }));
  }, [setProjectChannelById]);

  const makeProjectChannelKey = useCallback((projectId: string, channel: ProjectChannel) => `${projectId}:${channel}`, []);

  const setProjectChannelQuery = useCallback((projectId: string, channel: ProjectChannel, value: string) => {
    const key = `${projectId}:${channel}`;
    setProjectChannelQueryByKey((prev) => ({
      ...prev,
      [key]: value,
    }));
    setProjectChannelVisibleCountByKey((prev) => ({
      ...prev,
      [key]: 8,
    }));
  }, [setProjectChannelQueryByKey, setProjectChannelVisibleCountByKey]);

  const toggleProjectChannelIssueOnly = useCallback((projectId: string, channel: ProjectChannel) => {
    const key = `${projectId}:${channel}`;
    setProjectChannelIssueOnlyByKey((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setProjectChannelVisibleCountByKey((prev) => ({
      ...prev,
      [key]: 8,
    }));
  }, [setProjectChannelIssueOnlyByKey, setProjectChannelVisibleCountByKey]);

  const showMoreProjectChannelPosts = useCallback((projectId: string, channel: ProjectChannel) => {
    const key = `${projectId}:${channel}`;
    setProjectChannelVisibleCountByKey((prev) => ({
      ...prev,
      [key]: (prev[key] ?? 8) + 8,
    }));
  }, [setProjectChannelVisibleCountByKey]);

  const resetProjectChannelPostsView = useCallback((projectId: string, channel: ProjectChannel) => {
    const key = `${projectId}:${channel}`;
    setProjectChannelVisibleCountByKey((prev) => ({
      ...prev,
      [key]: 8,
    }));
  }, [setProjectChannelVisibleCountByKey]);

  const routeToCommunityComposer = useCallback(
    (post: FeedPost, mode: "feedback" | "reports") => {
      const location =
        [
          normalizeLocationValue(post.barangay),
          normalizeLocationValue(post.municipality),
          normalizeLocationValue(post.region),
        ]
          .filter(Boolean)
          .join(", ") || normalizeLocationValue(post.locationText) || "";

      const prefillPayload = {
        mode,
        projectId: String(post.projectId ?? "").trim(),
        projectName: String(post.projectName ?? post.projectId ?? "").trim(),
        location,
        region: normalizeLocationValue(post.region),
        municipality: normalizeLocationValue(post.municipality),
        barangay: normalizeLocationValue(post.barangay),
        actionType: String(post.actionType ?? "").trim(),
        txHash: String(post.txHash ?? "").trim(),
        timestamp: new Date(post.sortKey).toISOString(),
      };

      try {
        sessionStorage.setItem("communityComposerPrefill", JSON.stringify(prefillPayload));
      } catch {
        // Ignore storage write failures and keep navigation working.
      }

      setCurrentPage(mode === "reports" ? "community-report-form" : "community-feedback-form");
    },
    [setCurrentPage]
  );

  return {
    chainSyncing,
    lastSeenBlock,
    projectSearchQuery,
    setProjectSearchQuery,
    selectedRegion,
    setSelectedRegion,
    selectedMunicipality,
    setSelectedMunicipality,
    selectedBarangay,
    setSelectedBarangay,
    selectedStatusType,
    setSelectedStatusType,
    projectLifecycleFilter,
    setProjectLifecycleFilter,
    projectRegionOptions,
    projectMunicipalityOptions,
    projectBarangayOptions,
    projectStatusOptions,
    filteredFundedProjects,
    pagedFilteredFundedProjects,
    hasProjectFilters,
    clearProjectFilters,
    expandedProjects,
    projectChannelById,
    projectChannelQueryByKey,
    projectChannelIssueOnlyByKey,
    projectChannelVisibleCountByKey,
    expandedPaths,
    projectPage,
    setProjectPage,
    projectTotalPages,
    setSearchQuery,
    setProjectChannel,
    setProjectChannelQuery,
    toggleProjectChannelIssueOnly,
    showMoreProjectChannelPosts,
    resetProjectChannelPostsView,
    toggleProjectExpansion,
    togglePath,
    makeProjectChannelKey,
    getProjectChannelPosts,
    getRealtimeProjectMetrics,
    resolveProjectIntegrity,
    resolveMilestoneIntegrity,
    resolveTransactionIntegrity,
    buildDecisionPath,
    routeToCommunityComposer,
  };
}
