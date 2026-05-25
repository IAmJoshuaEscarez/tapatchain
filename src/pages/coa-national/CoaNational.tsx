import { useState, useMemo, useEffect, useCallback, useRef, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletContext";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Landmark,
  Link2,
  RefreshCw,
  ScrollText,
  Shield,
  Stamp,
  UserPlus,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildProjectSpentByMilestones, formatCurrency, mapRDCToProject } from "@/lib/utils";
import { useAuditTrail, type AuditEntry } from "@/context/AuditTrailContext";
import { useProjectContext } from "@/context/ProjectContext";
import { useMilestoneContext } from "@/context/MilestoneContext";
import { useNotifications } from "@/context/NotificationContext";
import { authApi } from "@/services/api";
import { finalizeProject, logToAuditTrail } from "@/services/signatureGate";
import { useGasGuard } from "@/hooks/useGasGuard";
import { InsufficientGasModal, PaginationControls } from "@/components/ui";
import { getEtherscanLink, isRealTxHash } from "@/features/blockchain/services/blockchain";
import type { UserProfile } from "@/shared/types";

import type {
  ChainOfCustodyStep,
  NationalBlockchainStatus,
  NationalDataSyncState,
  NationalLedgerProject,
  NationalRiskProfile,
} from "./types";
import { useNationalOversightHub } from "@/hooks/coa/useNationalOversightHub";
import { AuditNetwork } from "./AuditNetwork";

type DashboardTab = "national-ledger" | "immutable-audit-trail" | "final-audit-seal" | "coa-regional-accounts";

interface COANationalOversightDashboardProps {
  setCurrentPage: (page: string) => void;
  initialTab?: DashboardTab;
  initialFinalSealProjectId?: string | null;
}

const ACTOR_NAME = "COA National Oversight";

const TAB_ITEMS: Array<{
  id: DashboardTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "national-ledger", label: "National Project Ledger", icon: Landmark },
  { id: "immutable-audit-trail", label: "Immutable Audit Trail", icon: ScrollText },
  { id: "final-audit-seal", label: "Final Audit Seal", icon: Stamp },
  { id: "coa-regional-accounts", label: "COA Regional Accounts", icon: UserPlus },
];

const STATUS_LABELS: Record<NationalBlockchainStatus, string> = {
  RDC_PROPOSED: "RDC Proposed",
  RD_ASSIGNED: "RD Assigned",
  CONTRACTOR_SUBMITTED: "Contractor Submitted",
  ENGINEER_VERIFIED: "Engineer Verified",
  COA_REGIONAL_APPROVED: "Regional Approved",
  FINAL_SEAL: "Finalized",
  FLAGGED: "Flagged",
  UNKNOWN: "Unknown",
};

const STATUS_BADGE_CLASS: Record<NationalBlockchainStatus, string> = {
  RDC_PROPOSED: "bg-muted text-muted-foreground",
  RD_ASSIGNED: "bg-primary/10 text-primary",
  CONTRACTOR_SUBMITTED: "bg-primary/10 text-primary",
  ENGINEER_VERIFIED: "bg-primary/10 text-primary",
  COA_REGIONAL_APPROVED: "bg-primary/10 text-primary",
  FINAL_SEAL: "bg-primary/15 text-primary",
  FLAGGED: "bg-destructive/10 text-destructive",
  UNKNOWN: "bg-muted text-muted-foreground",
};

const REGION_FILTER_OPTIONS = [
  "All Regions",
  "Region I",
  "Region II",
  "Region III",
  "Region IV-A",
  "Region IV-B",
  "Region V",
  "Region VI",
  "Region VII",
  "Region VIII",
  "Region IX",
  "Region X",
  "Region XI",
  "Region XII",
  "Region XIII",
  "BARMM",
];

const ALL_MUNICIPALITIES_OPTION = "All Municipalities";
const ALL_BARANGAYS_OPTION = "All Barangays";
const UNKNOWN_MUNICIPALITY_LABEL = "Unknown Municipality";
const UNKNOWN_BARANGAY_LABEL = "Unknown Barangay";

const MONITORED_UPDATE_ROLES: ReadonlySet<string> = new Set([
  "contractor",
  "inspector",
  "engineer",
  "auditor",
  "rd",
]);

const MONITORED_UPDATE_ACTIONS: ReadonlySet<string> = new Set([
  "MILESTONE_SUBMITTED",
  "MILESTONE_UPDATED",
  "INSPECTOR_APPROVED",
  "INSPECTOR_REJECTED",
  "ENGINEER_VERIFIED",
  "ENGINEER_REJECTED",
  "COA_AUDITED",
  "COA_REJECTED",
  "MILESTONE_PAYMENT_AUTHORIZED",
  "BUDGET_RELEASED",
  "FUND_DISBURSED",
]);

const MONITORED_ALL_ACTIONS_OPTION = "all-actions";

const MONITORED_ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "contractor", label: "Contractor" },
  { value: "site-engineer", label: "Site Engineer" },
  { value: "coa-regional", label: "COA Regional" },
  { value: "regional-director", label: "Regional Director" },
] as const;

type MonitoredRoleFilterValue = (typeof MONITORED_ROLE_FILTER_OPTIONS)[number]["value"];

const MONITORED_TX_FILTER_OPTIONS = [
  { value: "all", label: "All TX Status" },
  { value: "with-tx", label: "With Verified TX" },
  { value: "missing-tx", label: "Missing TX" },
] as const;

type MonitoredTxFilterValue = (typeof MONITORED_TX_FILTER_OPTIONS)[number]["value"];

const CRITICAL_ANOMALY_GAP_THRESHOLD_PCT = 20;
const COA_NATIONAL_LEDGER_PAGE_SIZE = 10;
const COA_NATIONAL_TRAIL_PAGE_SIZE = 10;
const COA_NATIONAL_MONITORED_UPDATES_PAGE_SIZE = 10;
const COA_NATIONAL_SEAL_CANDIDATES_PAGE_SIZE = 10;
const COA_NATIONAL_HISTORY_PAGE_SIZE = 10;
const CHART_GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: "#cbd5e1",
  strokeOpacity: 0.28,
};

const CHART_AXIS_TICK = {
  fontSize: 10,
  fill: "#64748b",
};

const CHART_TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  backgroundColor: "rgba(255,255,255,0.96)",
  boxShadow: "0 10px 28px rgba(15,23,42,0.10)",
  fontSize: 12,
};

const CHART_LEGEND_STYLE = {
  fontSize: 11,
  color: "#475569",
  paddingTop: 8,
};

const PROGRESS_FINANCIAL_COLOR = "rgba(37, 99, 235, 0.52)";
const PROGRESS_PHYSICAL_COLOR = "rgba(22, 163, 74, 0.52)";
const PROGRESS_ANOMALY_COLOR = "rgba(225, 29, 72, 0.58)";

interface ForensicProjectMetric {
  projectId: string;
  region: string;
  originalBudget: number;
  totalDisbursed: number;
  financialProgressPct: number;
  physicalProgressPct: number;
  integrityGapPct: number;
  overDisbursedPhp: number;
  isCriticalAnomaly: boolean;
}

interface ForensicRegionMetric {
  region: string;
  projectCount: number;
  originalBudget: number;
  totalDisbursed: number;
  financialProgressPct: number;
  physicalProgressPct: number;
  integrityGapPct: number;
  anomalyGapPct: number;
  overDisbursedPhp: number;
  criticalProjectCount: number;
  isCriticalAnomaly: boolean;
}

interface SignatureTimelineSnapshot {
  key: ChainOfCustodyStep["key"];
  title: string;
  actionName: string;
  actorWallet?: string;
  timestamp?: string;
  txHash?: string;
  completed: boolean;
  signatureVerified: boolean;
}

function toEpoch(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCompletionPercent(record: NationalLedgerProject): number {
  const progress = Number(record.project.progress ?? 0);
  const currentProgress = Number(record.project.currentProgress ?? 0);
  const completion = Math.max(progress, currentProgress);
  if (!Number.isFinite(completion)) return 0;
  return Math.max(0, Math.min(100, completion));
}

function getPhysicalProgressPercent(record: NationalLedgerProject): number {
  const currentProgress = Number(record.project.currentProgress ?? 0);
  if (!Number.isFinite(currentProgress)) return 0;
  return Math.max(0, Math.min(100, currentProgress));
}

function toSafeAmount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function getFinancialProgressPercent(totalDisbursed: number, originalBudget: number): number {
  if (!Number.isFinite(totalDisbursed) || !Number.isFinite(originalBudget) || originalBudget <= 0) {
    return 0;
  }
  return (totalDisbursed / originalBudget) * 100;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatPercentAxis(value: number): string {
  return `${Math.round(value)}%`;
}

function normalizeRegion(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function matchesRegionFilter(region: string, selectedRegion: string): boolean {
  if (selectedRegion === "All Regions") return true;
  return normalizeRegion(region).includes(normalizeRegion(selectedRegion));
}

function formatActionName(actionName: string): string {
  return actionName
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function formatDateTime(value?: string): string {
  if (!value) return "Not Recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not Recorded";
  if (parsed.getUTCFullYear() <= 1970) return "Not Recorded";
  return parsed.toLocaleString();
}

function formatWalletAddress(value?: string): string {
  const wallet = String(value ?? "").trim();
  if (!wallet) return "Not Recorded";
  if (wallet.length <= 14) return wallet;
  return `${wallet.slice(0, 8)}...${wallet.slice(-6)}`;
}

function formatTxHash(value?: string): string {
  const hash = String(value ?? "").trim();
  if (!hash) return "Not Recorded";
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function getMunicipalityLabel(record: NationalLedgerProject): string {
  const municipality = String(record.municipality ?? "").trim();
  return municipality || UNKNOWN_MUNICIPALITY_LABEL;
}

function getBarangayLabel(record: NationalLedgerProject): string {
  const barangay = String(record.barangay ?? "").trim();
  return barangay || UNKNOWN_BARANGAY_LABEL;
}

function getMonitoredRoleLabel(role: AuditEntry["actorRole"] | string): string {
  const normalizedRole = String(role).toLowerCase();
  if (normalizedRole === "contractor") return "Contractor";
  if (normalizedRole === "inspector" || normalizedRole === "engineer") return "Site Engineer";
  if (normalizedRole === "auditor") return "COA Regional";
  if (normalizedRole === "rd") return "Regional Director";
  return String(role);
}

function matchesMonitoredRoleFilter(
  role: AuditEntry["actorRole"] | string,
  selectedRole: MonitoredRoleFilterValue
): boolean {
  const normalizedRole = String(role).toLowerCase();
  if (selectedRole === "all") return true;
  if (selectedRole === "contractor") return normalizedRole === "contractor";
  if (selectedRole === "site-engineer") return normalizedRole === "inspector" || normalizedRole === "engineer";
  if (selectedRole === "coa-regional") return normalizedRole === "auditor";
  if (selectedRole === "regional-director") return normalizedRole === "rd";
  return true;
}

function getSyncLabel(state: NationalDataSyncState): string {
  if (state === "loading") return "Syncing on-chain and off-chain records.";
  if (state === "offchain-ready") return "Off-chain records loaded. On-chain reconciliation in progress.";
  return "Data reconciliation complete. Actions can proceed if checklist is fully green.";
}

function isProjectReconciled(record: NationalLedgerProject, syncState: NationalDataSyncState): boolean {
  if (syncState !== "reconciled") return false;

  const hasOnChainSnapshot = Boolean(record.onChain);
  const hasOffChainEvidence = Boolean(record.finalSitePhotoUrl);
  const hasRegionalAuditProof = Boolean(record.regionalAuditorTxHash && isRealTxHash(record.regionalAuditorTxHash));

  return hasOnChainSnapshot && hasOffChainEvidence && hasRegionalAuditProof;
}

function renderStepVerification(step: ChainOfCustodyStep): { label: string; className: string } {
  if (!step.completed) {
    return { label: "Pending", className: "bg-muted text-muted-foreground" };
  }
  if (step.signatureVerified) {
    return { label: "Verified", className: "bg-primary/10 text-primary" };
  }
  return { label: "Needs Verification", className: "bg-accent/15 text-accent" };
}

function formatAuditEfficiency(averageHours: number | null): string {
  if (averageHours === null) return "No finalized baseline";
  if (averageHours >= 24) return `${(averageHours / 24).toFixed(1)} days`;
  return `${averageHours.toFixed(1)} hrs`;
}

function DataSyncBanner({ syncState, syncError }: { syncState: NationalDataSyncState; syncError: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold text-foreground">Data Reconciliation Gate</p>
        <p className="text-[11px] text-muted-foreground">{getSyncLabel(syncState)}</p>
      </div>
      {syncError && <p className="mt-1 text-[11px] text-destructive">{syncError}</p>}
    </div>
  );
}

function LedgerSkeletonRows() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={`ledger-skeleton-${index}`} className="grid min-w-245 grid-cols-[8rem_2fr_1.3fr_8.5rem_7rem_8.5rem_10rem] gap-2 px-3 py-3">
          {Array.from({ length: 7 }).map((__, cellIndex) => (
            <div key={`ledger-skeleton-cell-${index}-${cellIndex}`} className="h-4 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: NationalBlockchainStatus }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE_CLASS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function ReconciliationBadge({ ready }: { ready: boolean }) {
  if (ready) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
        <CheckCircle2 className="h-3 w-3" /> Reconciled
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
      <AlertTriangle className="h-3 w-3" /> Pending
    </span>
  );
}

function NationalProjectLedgerTab({
  records,
  loading,
  syncState,
  riskProfiles,
  getChainOfCustody,
}: {
  records: NationalLedgerProject[];
  loading: boolean;
  syncState: NationalDataSyncState;
  riskProfiles: NationalRiskProfile[];
  getChainOfCustody: (projectId: string) => ChainOfCustodyStep[];
}) {
  const integrityChartViewportRef = useRef<HTMLDivElement | null>(null);
  const [integrityChartViewportWidth, setIntegrityChartViewportWidth] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("All Regions");
  const [municipalityFilter, setMunicipalityFilter] = useState(ALL_MUNICIPALITIES_OPTION);
  const [barangayFilter, setBarangayFilter] = useState(ALL_BARANGAYS_OPTION);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [ledgerPage, setLedgerPage] = useState(1);

  useEffect(() => {
    setMunicipalityFilter(ALL_MUNICIPALITIES_OPTION);
    setBarangayFilter(ALL_BARANGAYS_OPTION);
  }, [regionFilter]);

  useEffect(() => {
    setBarangayFilter(ALL_BARANGAYS_OPTION);
  }, [municipalityFilter]);

  useEffect(() => {
    const container = integrityChartViewportRef.current;
    if (!container) return;

    let rafId = 0;

    const syncWidth = (nextWidth: number) => {
      const normalizedWidth = Math.max(0, Math.floor(nextWidth));
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setIntegrityChartViewportWidth((current) =>
          Math.abs(current - normalizedWidth) > 1 ? normalizedWidth : current
        );
      });
    };

    syncWidth(container.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      syncWidth(entry.contentRect.width);
    });

    observer.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  const municipalityOptions = useMemo(() => {
    const options = new Set<string>();
    for (const record of records) {
      if (!matchesRegionFilter(record.region, regionFilter)) continue;
      options.add(getMunicipalityLabel(record));
    }
    return [ALL_MUNICIPALITIES_OPTION, ...Array.from(options).sort((a, b) => a.localeCompare(b))];
  }, [records, regionFilter]);

  const barangayOptions = useMemo(() => {
    const options = new Set<string>();
    for (const record of records) {
      if (!matchesRegionFilter(record.region, regionFilter)) continue;
      const municipality = getMunicipalityLabel(record);
      if (municipalityFilter !== ALL_MUNICIPALITIES_OPTION && municipality !== municipalityFilter) continue;
      options.add(getBarangayLabel(record));
    }
    return [ALL_BARANGAYS_OPTION, ...Array.from(options).sort((a, b) => a.localeCompare(b))];
  }, [records, regionFilter, municipalityFilter]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSearch =
        !q ||
        record.projectId.toLowerCase().includes(q) ||
        record.projectName.toLowerCase().includes(q) ||
        record.contractor.toLowerCase().includes(q);

      const municipality = getMunicipalityLabel(record);
      const barangay = getBarangayLabel(record);

      const matchesMunicipality =
        municipalityFilter === ALL_MUNICIPALITIES_OPTION || municipality === municipalityFilter;
      const matchesBarangay = barangayFilter === ALL_BARANGAYS_OPTION || barangay === barangayFilter;

      return (
        matchesSearch &&
        matchesRegionFilter(record.region, regionFilter) &&
        matchesMunicipality &&
        matchesBarangay
      );
    });
  }, [records, searchQuery, regionFilter, municipalityFilter, barangayFilter]);

  useEffect(() => {
    setLedgerPage(1);
  }, [searchQuery, regionFilter, municipalityFilter, barangayFilter]);

  const ledgerTotalPages = Math.max(1, Math.ceil(filteredRecords.length / COA_NATIONAL_LEDGER_PAGE_SIZE));
  const pagedLedgerRecords = useMemo(() => {
    const safePage = Math.min(ledgerPage, ledgerTotalPages);
    const start = (safePage - 1) * COA_NATIONAL_LEDGER_PAGE_SIZE;
    return filteredRecords.slice(start, start + COA_NATIONAL_LEDGER_PAGE_SIZE);
  }, [filteredRecords, ledgerPage, ledgerTotalPages]);

  useEffect(() => {
    setSelectedProjectId((current) => {
      if (current && filteredRecords.some((record) => record.projectId === current)) {
        return current;
      }
      return null;
    });
  }, [filteredRecords]);

  const ledgerSnapshot = useMemo(() => {
    const projectCount = filteredRecords.length;

    const totalBudget = filteredRecords.reduce((sum, record) => {
      const budget = Number(record.project.budget ?? 0);
      return sum + (Number.isFinite(budget) ? budget : 0);
    }, 0);

    const integrityCompliantCount = filteredRecords.filter((record) => {
      const hasNoForensicWarnings = record.forensicWarningCount === 0;
      const isNotFlagged = record.blockchainStatus !== "FLAGGED";
      const isReconciled = isProjectReconciled(record, syncState);
      return hasNoForensicWarnings && isNotFlagged && isReconciled;
    }).length;

    const integrityScore = projectCount > 0 ? (integrityCompliantCount / projectCount) * 100 : 0;

    return {
      projectCount,
      totalBudget,
      integrityCompliantCount,
      integrityScore,
    };
  }, [filteredRecords, syncState]);

  const disbursementInScope = useMemo(() => {
    return filteredRecords.reduce((sum, record) => sum + Number(record.totalMilestonePaid ?? 0), 0);
  }, [filteredRecords]);

  const forensicProjectMetrics = useMemo<ForensicProjectMetric[]>(() => {
    return filteredRecords.map((record) => {
      const originalBudget = toSafeAmount(record.project.budget);
      const totalDisbursed = toSafeAmount(record.totalMilestonePaid);
      const financialProgressPct = getFinancialProgressPercent(totalDisbursed, originalBudget);
      const physicalProgressPct = getPhysicalProgressPercent(record);
      const integrityGapPct = financialProgressPct - physicalProgressPct;
      const isCriticalAnomaly = integrityGapPct > CRITICAL_ANOMALY_GAP_THRESHOLD_PCT;

      return {
        projectId: record.projectId,
        region: record.region,
        originalBudget,
        totalDisbursed,
        financialProgressPct,
        physicalProgressPct,
        integrityGapPct,
        overDisbursedPhp: Math.max(0, totalDisbursed - originalBudget),
        isCriticalAnomaly,
      };
    });
  }, [filteredRecords]);

  const forensicRegionMetrics = useMemo<ForensicRegionMetric[]>(() => {
    const accumulator: Record<
      string,
      {
        projectCount: number;
        originalBudget: number;
        totalDisbursed: number;
        physicalProgressSum: number;
        criticalProjectCount: number;
      }
    > = {};

    for (const metric of forensicProjectMetrics) {
      if (!accumulator[metric.region]) {
        accumulator[metric.region] = {
          projectCount: 0,
          originalBudget: 0,
          totalDisbursed: 0,
          physicalProgressSum: 0,
          criticalProjectCount: 0,
        };
      }

      const regionAccumulator = accumulator[metric.region];
      regionAccumulator.projectCount += 1;
      regionAccumulator.originalBudget += metric.originalBudget;
      regionAccumulator.totalDisbursed += metric.totalDisbursed;
      regionAccumulator.physicalProgressSum += metric.physicalProgressPct;
      if (metric.isCriticalAnomaly) regionAccumulator.criticalProjectCount += 1;
    }

    return Object.entries(accumulator)
      .map(([region, data]) => {
        const financialProgressPct = getFinancialProgressPercent(data.totalDisbursed, data.originalBudget);
        const physicalProgressPct =
          data.projectCount > 0 ? data.physicalProgressSum / data.projectCount : 0;
        const integrityGapPct = financialProgressPct - physicalProgressPct;
        const anomalyGapPct = Math.max(0, integrityGapPct);
        const isCriticalAnomaly = integrityGapPct > CRITICAL_ANOMALY_GAP_THRESHOLD_PCT;

        return {
          region,
          projectCount: data.projectCount,
          originalBudget: data.originalBudget,
          totalDisbursed: data.totalDisbursed,
          financialProgressPct,
          physicalProgressPct,
          integrityGapPct,
          anomalyGapPct,
          overDisbursedPhp: Math.max(0, data.totalDisbursed - data.originalBudget),
          criticalProjectCount: data.criticalProjectCount,
          isCriticalAnomaly,
        };
      })
      .sort(
        (left, right) =>
          Number(right.isCriticalAnomaly) - Number(left.isCriticalAnomaly) ||
          right.integrityGapPct - left.integrityGapPct ||
          left.region.localeCompare(right.region)
      );
  }, [forensicProjectMetrics]);

  const integrityMonitorDomainMax = useMemo(() => {
    if (forensicRegionMetrics.length === 0) return 100;

    return Math.max(
      100,
      ...forensicRegionMetrics.map((metric) =>
        Math.max(metric.financialProgressPct, metric.physicalProgressPct, metric.anomalyGapPct)
      )
    );
  }, [forensicRegionMetrics]);

  const integrityChartMinWidth = useMemo(() => {
    return Math.max(620, forensicRegionMetrics.length * 90);
  }, [forensicRegionMetrics.length]);

  const integrityChartWidth = useMemo(() => {
    return Math.max(integrityChartMinWidth, integrityChartViewportWidth || integrityChartMinWidth);
  }, [integrityChartMinWidth, integrityChartViewportWidth]);

  const criticalAnomalyRegionCount = useMemo(() => {
    return forensicRegionMetrics.filter((metric) => metric.isCriticalAnomaly).length;
  }, [forensicRegionMetrics]);

  const criticalAnomalyProjectCount = useMemo(() => {
    return forensicProjectMetrics.filter((metric) => metric.isCriticalAnomaly).length;
  }, [forensicProjectMetrics]);

  const totalOverDisbursedInScope = useMemo(() => {
    return forensicRegionMetrics.reduce((sum, metric) => sum + metric.overDisbursedPhp, 0);
  }, [forensicRegionMetrics]);

  const criticalAnomalyProjectIds = useMemo(() => {
    return new Set(
      forensicProjectMetrics
        .filter((metric) => metric.isCriticalAnomaly)
        .map((metric) => metric.projectId)
    );
  }, [forensicProjectMetrics]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return filteredRecords.find((record) => record.projectId === selectedProjectId) ?? null;
  }, [filteredRecords, selectedProjectId]);

  const signatureTimeline = useMemo<SignatureTimelineSnapshot[]>(() => {
    if (!selectedProject) return [];

    const steps = getChainOfCustody(selectedProject.projectId);

    const contractorSubmission = steps.find((step) => step.key === "CONTRACTOR_SUBMISSION");
    const engineerVerification = steps.find((step) => step.key === "ENGINEER_VERIFICATION");
    const regionalAudit = steps.find((step) => step.key === "REGIONAL_AUDIT_APPROVAL");

    return [
      {
        key: "CONTRACTOR_SUBMISSION",
        title: "[Contractor] Milestone Submission",
        actionName: contractorSubmission?.actionName ?? "Not Recorded",
        actorWallet: contractorSubmission?.actorWallet,
        timestamp: contractorSubmission?.timestamp,
        txHash: contractorSubmission?.txHash,
        completed: Boolean(contractorSubmission?.completed),
        signatureVerified: Boolean(
          contractorSubmission?.completed && contractorSubmission.signatureVerified
        ),
      },
      {
        key: "ENGINEER_VERIFICATION",
        title: "[Engineer] Technical Verification",
        actionName: engineerVerification?.actionName ?? "Not Recorded",
        actorWallet: engineerVerification?.actorWallet,
        timestamp: engineerVerification?.timestamp,
        txHash: engineerVerification?.txHash,
        completed: Boolean(engineerVerification?.completed),
        signatureVerified: Boolean(
          engineerVerification?.completed && engineerVerification.signatureVerified
        ),
      },
      {
        key: "REGIONAL_AUDIT_APPROVAL",
        title: "[COA Regional] Forensic Audit Signature",
        actionName: regionalAudit?.actionName ?? "Not Recorded",
        actorWallet: regionalAudit?.actorWallet,
        timestamp: regionalAudit?.timestamp,
        txHash: regionalAudit?.txHash,
        completed: Boolean(regionalAudit?.completed),
        signatureVerified: Boolean(regionalAudit?.completed && regionalAudit.signatureVerified),
      },
    ];
  }, [getChainOfCustody, selectedProject]);

  const filteredAuditEfficiency = useMemo(() => {
    let totalHours = 0;
    let sampleSize = 0;

    for (const record of filteredRecords) {
      const chain = getChainOfCustody(record.projectId);
      const regionalApproval = chain.find((step) => step.key === "REGIONAL_AUDIT_APPROVAL");
      const nationalSeal = chain.find((step) => step.key === "NATIONAL_FINAL_SEAL");

      const start = toEpoch(regionalApproval?.timestamp);
      const end = toEpoch(nationalSeal?.timestamp);
      if (!start || !end || end < start) continue;

      totalHours += (end - start) / (1000 * 60 * 60);
      sampleSize += 1;
    }

    return {
      averageHours: sampleSize > 0 ? totalHours / sampleSize : null,
      sampleSize,
    };
  }, [filteredRecords, getChainOfCustody]);

  const forensicIntegrityAlertCount = useMemo(() => {
    const riskByProjectId = new Map(riskProfiles.map((profile) => [profile.projectId, profile]));
    const flagged = new Set<string>();

    for (const record of filteredRecords) {
      const profile = riskByProjectId.get(record.projectId);
      const gpsAlert = profile?.gpsVarianceMeters !== null && profile?.gpsVarianceMeters !== undefined && profile.gpsVarianceMeters > 50;
      const metadataAlert = (profile?.warningCount ?? 0) > 0;

      if (record.blockchainStatus === "FLAGGED" || record.forensicWarningCount > 0 || gpsAlert || metadataAlert) {
        flagged.add(record.projectId);
      }
    }

    return flagged.size;
  }, [filteredRecords, riskProfiles]);

  return (
    <div className="space-y-3">
      
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search Project ID or Contractor"
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <select
            value={regionFilter}
            onChange={(event) => setRegionFilter(event.target.value)}
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            {REGION_FILTER_OPTIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          <select
            value={municipalityFilter}
            onChange={(event) => setMunicipalityFilter(event.target.value)}
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            {municipalityOptions.map((municipality) => (
              <option key={municipality} value={municipality}>
                {municipality}
              </option>
            ))}
          </select>
          <select
            value={barangayFilter}
            onChange={(event) => setBarangayFilter(event.target.value)}
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            {barangayOptions.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Unified Oversight Snapshot ({regionFilter === "All Regions" ? "All Regions (National)" : regionFilter})
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total Disbursement in Scope</p>
              <p className="mt-1 text-lg font-bold text-foreground">{formatCurrency(disbursementInScope)}</p>
              <p className="text-[11px] text-muted-foreground">On-chain sum of paid milestones in current filters.</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Audit Efficiency Rate</p>
              <p className="mt-1 text-lg font-bold text-foreground">{formatAuditEfficiency(filteredAuditEfficiency.averageHours)}</p>
              <p className="text-[11px] text-muted-foreground">
                Avg Regional-to-Seal turnaround ({filteredAuditEfficiency.sampleSize} finalized project(s)).
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Critical Anomaly Trigger</p>
              <p className="mt-1 text-lg font-bold text-foreground">{criticalAnomalyProjectCount}</p>
              <p className="text-[11px] text-muted-foreground">
                {criticalAnomalyRegionCount} region(s) with gap &gt; {CRITICAL_ANOMALY_GAP_THRESHOLD_PCT}%.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Projects in Scope</p>
              <p className="mt-1 text-lg font-bold text-foreground">{ledgerSnapshot.projectCount}</p>
              <p className="text-[11px] text-muted-foreground">Based on active search + location filters.</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total Budget in Scope</p>
              <p className="mt-1 text-lg font-bold text-foreground">{formatCurrency(ledgerSnapshot.totalBudget)}</p>
              <p className="text-[11px] text-muted-foreground">Exact sum of project ABC budgets in the filtered set.</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Integrity Score</p>
              <p className="mt-1 text-lg font-bold text-foreground">{ledgerSnapshot.integrityScore.toFixed(1)}%</p>
              <p className="text-[11px] text-muted-foreground">
                {ledgerSnapshot.integrityCompliantCount}/{ledgerSnapshot.projectCount} compliant | Metadata/GPS alerts: {forensicIntegrityAlertCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200/90 bg-linear-to-b from-white to-slate-50/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-800">Progress Integrity Monitor</p>
            <p className="mt-1 max-w-[44ch] text-[11px] leading-relaxed text-slate-500">
              Side-by-side progress bars per region: Financial (blue) versus Physical (green/red).
            </p>
          </div>
          <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Over-Disbursed in Scope</p>
            <p className="text-sm font-bold text-slate-900">{formatCurrency(totalOverDisbursedInScope)}</p>
            <p className="text-[10px] text-red-600">
              {criticalAnomalyRegionCount} high-risk region{criticalAnomalyRegionCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {forensicRegionMetrics.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm font-semibold text-slate-800">No regional integrity data available yet.</p>
            <p className="mt-1 text-xs text-slate-500">
              Data will appear once projects and milestones are synced.
            </p>
          </div>
        ) : (
          <div ref={integrityChartViewportRef} className="pt-1 overflow-x-auto overflow-y-hidden">
            <div className="min-w-140" style={{ width: `${integrityChartWidth}px` }}>
              <BarChart
                width={integrityChartWidth}
                height={320}
                data={forensicRegionMetrics}
                margin={{ top: 8, right: 12, left: -6, bottom: 10 }}
                barGap={2}
                barCategoryGap="14%"
              >
                <CartesianGrid {...CHART_GRID_PROPS} vertical={false} />
                <XAxis
                  dataKey="region"
                  tick={CHART_AXIS_TICK}
                  tickMargin={8}
                  interval={0}
                  minTickGap={12}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, Math.ceil(integrityMonitorDomainMax / 10) * 10]}
                  tickFormatter={formatPercentAxis}
                  tick={CHART_AXIS_TICK}
                  width={40}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(148,163,184,0.08)" }}
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number, key: string) => {
                    if (key === "financialProgressPct") return [formatPercent(value), "Financial Progress"];
                    if (key === "physicalProgressPct") return [formatPercent(value), "Physical Progress"];
                    if (key === "anomalyGapPct") return [formatPercent(value), "Gap / Anomaly"];
                    return [formatPercent(value), key];
                  }}
                  labelFormatter={(label: string, payload) => {
                    const row = payload?.[0]?.payload as
                      | {
                          integrityGapPct: number;
                          anomalyGapPct: number;
                          projectCount: number;
                          criticalProjectCount: number;
                        }
                      | undefined;
                    if (!row) return label;
                    return `${label} | Gap: ${formatPercent(row.integrityGapPct)} | Anomaly: ${formatPercent(row.anomalyGapPct)} | Projects: ${row.projectCount} | Critical: ${row.criticalProjectCount}`;
                  }}
                />
                <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} />
                <Bar
                  dataKey="financialProgressPct"
                  name="Financial Progress %"
                  isAnimationActive={false}
                  fill={PROGRESS_FINANCIAL_COLOR}
                  radius={[5, 5, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="physicalProgressPct"
                  name="Physical Progress %"
                  isAnimationActive={false}
                  fill={PROGRESS_PHYSICAL_COLOR}
                  radius={[5, 5, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="anomalyGapPct"
                  name="Gap / Anomaly %"
                  isAnimationActive={false}
                  fill={PROGRESS_ANOMALY_COLOR}
                  radius={[5, 5, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </div>
          </div>
        )}

        <div className="mt-3 border-t border-slate-200/70 pt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PROGRESS_FINANCIAL_COLOR }} />
            Financial % (Pondong nailabas)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PROGRESS_PHYSICAL_COLOR }} />
            Physical % (Verified work)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PROGRESS_ANOMALY_COLOR }} />
            Gap / Anomaly
          </span>
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <p className="border-b border-border bg-muted/25 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
          Click any project row to open its read-only Digital Signature Timeline.
        </p>
        <div className="grid min-w-245 grid-cols-[8rem_2fr_1.3fr_8.5rem_7rem_8.5rem_10rem] bg-muted/80 px-3 py-2">
          {[
            "Project ID",
            "Project",
            "Contractor",
            "Region",
            "Physical",
            "Status",
            "Reconciliation",
          ].map((header) => (
            <p key={header} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {header}
            </p>
          ))}
        </div>

        {loading ? (
          <LedgerSkeletonRows />
        ) : filteredRecords.length === 0 ? (
          <div className="px-3 py-12 text-center text-xs text-muted-foreground">No projects matched the current ledger filters.</div>
        ) : (
          <div className="divide-y divide-border">
            {pagedLedgerRecords.map((record) => {
              const physicalProgress = getPhysicalProgressPercent(record);
              const reconciled = isProjectReconciled(record, syncState);
              const isCriticalAnomaly = criticalAnomalyProjectIds.has(record.projectId);
              const isSelected = selectedProjectId === record.projectId;

              return (
                <button
                  key={record.projectId}
                  type="button"
                  onClick={() =>
                    setSelectedProjectId((current) =>
                      current === record.projectId ? null : record.projectId
                    )
                  }
                  className={`grid min-w-245 w-full grid-cols-[8rem_2fr_1.3fr_8.5rem_7rem_8.5rem_10rem] items-center gap-2 px-3 py-3 text-left transition-colors ${
                    isSelected ? "bg-slate-100" : "hover:bg-muted/30"
                  }`}
                >
                  <p className="truncate font-mono text-[11px] font-semibold text-foreground">{record.projectId}</p>
                  <div>
                    <p className="truncate text-xs font-semibold text-foreground">{record.projectName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{record.municipality || "Unknown Municipality"}</p>
                    {isCriticalAnomaly ? (
                      <span className="mt-1 inline-flex rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
                        High Risk
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{record.contractor || "Not Recorded"}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{record.region}</p>
                  <p className="text-[11px] font-semibold text-foreground">{formatPercent(physicalProgress)}</p>
                  <div>
                    <StatusBadge status={record.blockchainStatus} />
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <ReconciliationBadge ready={reconciled} />
                    <span className="text-[10px] font-semibold text-primary">{isSelected ? "Hide Detail" : "Open Detail"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!loading && filteredRecords.length > 0 && (
        <PaginationControls
          page={Math.min(ledgerPage, ledgerTotalPages)}
          totalPages={ledgerTotalPages}
          onPageChange={setLedgerPage}
        />
      )}

      {selectedProject && (
        <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Project Detail View</p>
              <p className="text-sm font-semibold text-slate-900">{selectedProject.projectName}</p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                {selectedProject.projectId} | {selectedProject.region} | {selectedProject.municipality || UNKNOWN_MUNICIPALITY_LABEL}
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
              Read-Only Chain of Custody
            </span>
          </div>

          <p className="mt-3 text-[11px] text-slate-600">
            COA National observes signature evidence only and verifies the chain of custody before applying the Final Audit Seal.
          </p>

          <div className="mt-4 space-y-4">
            {signatureTimeline.map((step, index) => {
              const hasVerifiedTx = Boolean(step.txHash && isRealTxHash(step.txHash));

              return (
                <div key={step.key} className="relative pl-8">
                  {index < signatureTimeline.length - 1 ? (
                    <div className="absolute left-2.75 top-6 h-[calc(100%+0.5rem)] w-px bg-slate-200" />
                  ) : null}

                  <div className="absolute left-0 top-1 rounded-full bg-white">
                    {step.completed ? (
                      <CheckCircle2 className="h-6 w-6 text-slate-700" />
                    ) : (
                      <ChevronRight className="h-6 w-6 text-slate-400" />
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{step.title}</p>
                        <p className="text-[11px] text-slate-600">Action: {formatActionName(step.actionName)}</p>
                      </div>
                      <span
                        className={`inline-flex w-fit rounded px-2 py-0.5 text-[10px] font-semibold ${
                          step.signatureVerified
                            ? "bg-slate-800 text-white"
                            : step.completed
                              ? "bg-slate-200 text-slate-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {step.signatureVerified ? "Signature Verified" : step.completed ? "Recorded" : "Pending"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] md:grid-cols-3">
                      <div>
                        <p className="font-semibold text-slate-600">Wallet Address</p>
                        <p className="font-mono text-slate-900">{formatWalletAddress(step.actorWallet)}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-600">Blockchain Timestamp</p>
                        <p className="text-slate-900">{formatDateTime(step.timestamp)}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-600">TX Hash</p>
                        {hasVerifiedTx ? (
                          <a
                            href={getEtherscanLink(String(step.txHash))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                          >
                            {formatTxHash(step.txHash)} <Link2 className="h-3 w-3" />
                          </a>
                        ) : (
                          <p className="font-mono text-slate-500">{formatTxHash(step.txHash)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ImmutableAuditTrailTab({
  records,
  loading,
  getChainOfCustody,
  auditEntries,
}: {
  records: NationalLedgerProject[];
  loading: boolean;
  getChainOfCustody: (projectId: string) => ChainOfCustodyStep[];
  auditEntries: AuditEntry[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("All Regions");
  const [municipalityFilter, setMunicipalityFilter] = useState(ALL_MUNICIPALITIES_OPTION);
  const [barangayFilter, setBarangayFilter] = useState(ALL_BARANGAYS_OPTION);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [trailPage, setTrailPage] = useState(1);
  const [monitoredSearchQuery, setMonitoredSearchQuery] = useState("");
  const [monitoredRoleFilter, setMonitoredRoleFilter] = useState<MonitoredRoleFilterValue>("all");
  const [monitoredActionFilter, setMonitoredActionFilter] = useState(MONITORED_ALL_ACTIONS_OPTION);
  const [monitoredTxFilter, setMonitoredTxFilter] = useState<MonitoredTxFilterValue>("all");
  const [monitoredPage, setMonitoredPage] = useState(1);

  useEffect(() => {
    setMunicipalityFilter(ALL_MUNICIPALITIES_OPTION);
    setBarangayFilter(ALL_BARANGAYS_OPTION);
  }, [regionFilter]);

  useEffect(() => {
    setBarangayFilter(ALL_BARANGAYS_OPTION);
  }, [municipalityFilter]);

  const municipalityOptions = useMemo(() => {
    const options = new Set<string>();
    for (const record of records) {
      if (!matchesRegionFilter(record.region, regionFilter)) continue;
      options.add(getMunicipalityLabel(record));
    }
    return [ALL_MUNICIPALITIES_OPTION, ...Array.from(options).sort((a, b) => a.localeCompare(b))];
  }, [records, regionFilter]);

  const barangayOptions = useMemo(() => {
    const options = new Set<string>();
    for (const record of records) {
      if (!matchesRegionFilter(record.region, regionFilter)) continue;
      const municipality = getMunicipalityLabel(record);
      if (municipalityFilter !== ALL_MUNICIPALITIES_OPTION && municipality !== municipalityFilter) continue;
      options.add(getBarangayLabel(record));
    }
    return [ALL_BARANGAYS_OPTION, ...Array.from(options).sort((a, b) => a.localeCompare(b))];
  }, [records, regionFilter, municipalityFilter]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSearch =
        !q ||
        record.projectId.toLowerCase().includes(q) ||
        record.projectName.toLowerCase().includes(q) ||
        record.contractor.toLowerCase().includes(q);

      const municipality = getMunicipalityLabel(record);
      const barangay = getBarangayLabel(record);

      const matchesMunicipality =
        municipalityFilter === ALL_MUNICIPALITIES_OPTION || municipality === municipalityFilter;
      const matchesBarangay = barangayFilter === ALL_BARANGAYS_OPTION || barangay === barangayFilter;

      return (
        matchesSearch &&
        matchesRegionFilter(record.region, regionFilter) &&
        matchesMunicipality &&
        matchesBarangay
      );
    });
  }, [records, searchQuery, regionFilter, municipalityFilter, barangayFilter]);

  useEffect(() => {
    setTrailPage(1);
  }, [searchQuery, regionFilter, municipalityFilter, barangayFilter]);

  const trailTotalPages = Math.max(1, Math.ceil(filteredRecords.length / COA_NATIONAL_TRAIL_PAGE_SIZE));
  const pagedTrailRecords = useMemo(() => {
    const safePage = Math.min(trailPage, trailTotalPages);
    const start = (safePage - 1) * COA_NATIONAL_TRAIL_PAGE_SIZE;
    return filteredRecords.slice(start, start + COA_NATIONAL_TRAIL_PAGE_SIZE);
  }, [filteredRecords, trailPage, trailTotalPages]);

  useEffect(() => {
    setSelectedProjectId((current) => {
      if (current && filteredRecords.some((record) => record.projectId === current)) {
        return current;
      }
      return null;
    });
  }, [filteredRecords]);

  useEffect(() => {
    setMonitoredSearchQuery("");
    setMonitoredRoleFilter("all");
    setMonitoredActionFilter(MONITORED_ALL_ACTIONS_OPTION);
    setMonitoredTxFilter("all");
  }, [selectedProjectId]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return records.find((record) => record.projectId === selectedProjectId) ?? null;
  }, [records, selectedProjectId]);

  const timelineSteps = useMemo(() => {
    if (!selectedProject) return [];
    return getChainOfCustody(selectedProject.projectId);
  }, [selectedProject, getChainOfCustody]);

  const monitoredUpdates = useMemo(() => {
    if (!selectedProject) return [];

    return auditEntries
      .filter((entry) => entry.projectId === selectedProject.projectId)
      .filter(
        (entry) =>
          MONITORED_UPDATE_ROLES.has(String(entry.actorRole)) ||
          MONITORED_UPDATE_ACTIONS.has(String(entry.actionType))
      )
      .sort((left, right) => toEpoch(right.timestamp) - toEpoch(left.timestamp));
  }, [auditEntries, selectedProject]);

  const monitoredActionOptions = useMemo(() => {
    const actionSet = new Set<string>();

    for (const entry of monitoredUpdates) {
      if (!matchesMonitoredRoleFilter(entry.actorRole, monitoredRoleFilter)) continue;
      actionSet.add(String(entry.actionType));
    }

    return [
      MONITORED_ALL_ACTIONS_OPTION,
      ...Array.from(actionSet).sort((left, right) =>
        formatActionName(left).localeCompare(formatActionName(right))
      ),
    ];
  }, [monitoredUpdates, monitoredRoleFilter]);

  useEffect(() => {
    setMonitoredActionFilter((current) =>
      monitoredActionOptions.includes(current) ? current : MONITORED_ALL_ACTIONS_OPTION
    );
  }, [monitoredActionOptions]);

  const filteredMonitoredUpdates = useMemo(() => {
    const query = monitoredSearchQuery.trim().toLowerCase();
    return monitoredUpdates.filter((entry) => {
      const roleLabel = getMonitoredRoleLabel(entry.actorRole);
      const hasVerifiedTx = Boolean(entry.blockchainHash && isRealTxHash(entry.blockchainHash));

      if (!matchesMonitoredRoleFilter(entry.actorRole, monitoredRoleFilter)) return false;
      if (monitoredActionFilter !== MONITORED_ALL_ACTIONS_OPTION && String(entry.actionType) !== monitoredActionFilter) {
        return false;
      }
      if (monitoredTxFilter === "with-tx" && !hasVerifiedTx) return false;
      if (monitoredTxFilter === "missing-tx" && hasVerifiedTx) return false;
      if (!query) return true;

      const searchable = [
        entry.actorName,
        entry.actionType,
        formatActionName(entry.actionType),
        roleLabel,
        entry.remarks,
        entry.description,
        entry.actorWallet,
        entry.blockchainHash,
        formatDateTime(entry.timestamp),
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return searchable.includes(query);
    });
  }, [
    monitoredUpdates,
    monitoredSearchQuery,
    monitoredRoleFilter,
    monitoredActionFilter,
    monitoredTxFilter,
  ]);

  useEffect(() => {
    setMonitoredPage(1);
  }, [selectedProjectId, monitoredSearchQuery, monitoredRoleFilter, monitoredActionFilter, monitoredTxFilter]);

  const monitoredTotalPages = Math.max(
    1,
    Math.ceil(filteredMonitoredUpdates.length / COA_NATIONAL_MONITORED_UPDATES_PAGE_SIZE)
  );
  const pagedMonitoredUpdates = useMemo(() => {
    const safePage = Math.min(monitoredPage, monitoredTotalPages);
    const start = (safePage - 1) * COA_NATIONAL_MONITORED_UPDATES_PAGE_SIZE;
    return filteredMonitoredUpdates.slice(start, start + COA_NATIONAL_MONITORED_UPDATES_PAGE_SIZE);
  }, [filteredMonitoredUpdates, monitoredPage, monitoredTotalPages]);

  return (
    <div className="space-y-3">
      

      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search project for transaction timeline"
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <select
            value={regionFilter}
            onChange={(event) => setRegionFilter(event.target.value)}
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            {REGION_FILTER_OPTIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          <select
            value={municipalityFilter}
            onChange={(event) => setMunicipalityFilter(event.target.value)}
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            {municipalityOptions.map((municipality) => (
              <option key={municipality} value={municipality}>
                {municipality}
              </option>
            ))}
          </select>
          <select
            value={barangayFilter}
            onChange={(event) => setBarangayFilter(event.target.value)}
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            {barangayOptions.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <div className="grid min-w-215 grid-cols-[8rem_2fr_9rem_8rem_7rem] bg-muted/80 px-3 py-2">
          {["Project ID", "Project", "Region", "Status", "View"].map((header) => (
            <p key={header} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {header}
            </p>
          ))}
        </div>

        {loading ? (
          <div className="px-3 py-10 text-center text-xs text-muted-foreground">Loading immutable trail records...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-muted-foreground">No projects matched the audit trail filters.</div>
        ) : (
          <div className="divide-y divide-border">
            {pagedTrailRecords.map((record) => {
              const isSelected = selectedProjectId === record.projectId;

              return (
              <button
                key={record.projectId}
                type="button"
                onClick={() =>
                  setSelectedProjectId((current) =>
                    current === record.projectId ? null : record.projectId
                  )
                }
                className={`grid min-w-215 w-full grid-cols-[8rem_2fr_9rem_8rem_7rem] items-center gap-2 px-3 py-3 text-left transition-colors ${
                  isSelected ? "bg-muted" : "hover:bg-muted/30"
                }`}
              >
                <p className="truncate font-mono text-[11px] font-semibold text-foreground">{record.projectId}</p>
                <p className="truncate text-xs font-semibold text-foreground">{record.projectName}</p>
                <p className="truncate text-[11px] text-muted-foreground">{record.region}</p>
                <div>
                  <StatusBadge status={record.blockchainStatus} />
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                  {isSelected ? "Hide" : "Open"}
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isSelected ? "rotate-90" : ""}`} />
                </span>
              </button>
            );
            })}
          </div>
        )}
      </div>

      {!loading && filteredRecords.length > 0 && (
        <PaginationControls
          page={Math.min(trailPage, trailTotalPages)}
          totalPages={trailTotalPages}
          onPageChange={setTrailPage}
        />
      )}

      {selectedProject && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">{selectedProject.projectName}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {selectedProject.projectId} | {selectedProject.region} | {selectedProject.municipality}
          </p>

          <div className="mt-4 space-y-4">
            {timelineSteps.map((step, index) => {
              const verification = renderStepVerification(step);
              const isVerifiedTx = Boolean(step.txHash && isRealTxHash(step.txHash));

              return (
                <div key={step.key} className="relative pl-8">
                  {index < timelineSteps.length - 1 && (
                    <div className="absolute left-2.75 top-6 h-[calc(100%+0.25rem)] w-px bg-border" />
                  )}

                  <div className="absolute left-0 top-1 rounded-full bg-card">
                    {step.completed ? (
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                    ) : (
                      <ChevronRight className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>

                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{step.label}</p>
                        <p className="text-[11px] text-muted-foreground">{step.description}</p>
                      </div>
                      <span className={`inline-flex w-fit rounded px-2 py-0.5 text-[10px] font-semibold ${verification.className}`}>
                        Verification Badge: {verification.label}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] md:grid-cols-4">
                      <div>
                        <p className="font-semibold text-muted-foreground">Action Name</p>
                        <p className="text-foreground">{formatActionName(step.actionName)}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-muted-foreground">Wallet Address</p>
                        <p className="font-mono text-foreground">{formatWalletAddress(step.actorWallet)}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-muted-foreground">Block Timestamp</p>
                        <p className="text-foreground">{formatDateTime(step.timestamp)}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-muted-foreground">TX Hash</p>
                        {isVerifiedTx ? (
                          <a
                            href={getEtherscanLink(String(step.txHash))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                          >
                            {formatTxHash(step.txHash)} <Link2 className="h-3 w-3" />
                          </a>
                        ) : (
                          <p className="font-mono text-muted-foreground">{formatTxHash(step.txHash)}</p>
                        )}
                      </div>
                    </div>

                    {step.key === "RD_ASSIGNMENT" && step.assignedPersonnel && step.assignedPersonnel.length > 0 && (
                      <div className="mt-3 rounded border border-border bg-card p-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Assigned Personnel by RD
                        </p>
                        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                          {step.assignedPersonnel.map((person) => (
                            <div
                              key={`${person.roleLabel}-${person.wallet || person.name || "unknown"}`}
                              className="rounded border border-border bg-muted/40 px-2.5 py-2"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {person.roleLabel}
                              </p>
                              <p className="text-[11px] font-semibold text-foreground">{person.name || "Not Recorded"}</p>
                              <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                                {person.wallet || "Not Recorded"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {timelineSteps.length === 0 && (
              <div className="rounded border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-xs text-muted-foreground">
                No chain-of-custody steps found for this project.
              </div>
            )}

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  Monitored Action Updates (Contractor • Site Engineer • COA Regional • Regional Director)
                </p>
                <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {filteredMonitoredUpdates.length} update(s)
                </span>
              </div>

              {monitoredUpdates.length === 0 ? (
                <div className="mt-2 rounded border border-dashed border-border bg-card px-3 py-6 text-center text-xs text-muted-foreground">
                  No monitored contractor/site/COA/RD actions found for this project.
                </div>
              ) : (
                <>
                  <div className="mt-2 rounded border border-border bg-card p-2">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.6fr_0.9fr_1fr_0.9fr]">
                      <input
                        type="text"
                        value={monitoredSearchQuery}
                        onChange={(event) => setMonitoredSearchQuery(event.target.value)}
                        placeholder="Search actor, action, details, timestamp, or TX hash"
                        className="h-8 rounded border border-border bg-card px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                      />
                      <select
                        value={monitoredRoleFilter}
                        onChange={(event) => setMonitoredRoleFilter(event.target.value as MonitoredRoleFilterValue)}
                        className="h-8 rounded border border-border bg-card px-2.5 text-xs text-foreground outline-none focus:border-primary"
                      >
                        {MONITORED_ROLE_FILTER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={monitoredActionFilter}
                        onChange={(event) => setMonitoredActionFilter(event.target.value)}
                        className="h-8 rounded border border-border bg-card px-2.5 text-xs text-foreground outline-none focus:border-primary"
                      >
                        {monitoredActionOptions.map((action) => (
                          <option key={action} value={action}>
                            {action === MONITORED_ALL_ACTIONS_OPTION ? "All Actions" : formatActionName(action)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={monitoredTxFilter}
                        onChange={(event) => setMonitoredTxFilter(event.target.value as MonitoredTxFilterValue)}
                        className="h-8 rounded border border-border bg-card px-2.5 text-xs text-foreground outline-none focus:border-primary"
                      >
                        {MONITORED_TX_FILTER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {filteredMonitoredUpdates.length === 0 ? (
                    <div className="mt-2 rounded border border-dashed border-border bg-card px-3 py-6 text-center text-xs text-muted-foreground">
                      No monitored updates matched the selected filter combination.
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 overflow-x-auto rounded border border-border bg-card">
                        <div className="grid min-w-220 grid-cols-[9rem_10rem_8rem_8.5rem_2fr_9rem] gap-2 bg-muted/70 px-3 py-2">
                          {["Timestamp", "Actor", "Role", "Action", "Details", "TX Hash"].map((header) => (
                            <p key={header} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {header}
                            </p>
                          ))}
                        </div>

                        <div className="divide-y divide-border">
                          {pagedMonitoredUpdates.map((entry) => {
                            const hasVerifiedTx = Boolean(entry.blockchainHash && isRealTxHash(entry.blockchainHash));

                            return (
                              <div
                                key={entry.id}
                                className="grid min-w-220 grid-cols-[9rem_10rem_8rem_8.5rem_2fr_9rem] items-start gap-2 px-3 py-2.5"
                              >
                                <p className="text-[11px] text-muted-foreground">{formatDateTime(entry.timestamp)}</p>
                                <div>
                                  <p className="truncate text-[11px] font-medium text-foreground">{entry.actorName || "Unknown"}</p>
                                  <p className="font-mono text-[10px] text-muted-foreground">{formatWalletAddress(entry.actorWallet)}</p>
                                </div>
                                <span className="inline-flex w-fit rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                  {getMonitoredRoleLabel(entry.actorRole)}
                                </span>
                                <p className="text-[11px] font-semibold text-foreground">{formatActionName(entry.actionType)}</p>
                                <p className="text-[11px] text-muted-foreground">{entry.remarks || entry.description}</p>
                                {hasVerifiedTx ? (
                                  <a
                                    href={getEtherscanLink(String(entry.blockchainHash))}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                                  >
                                    {formatTxHash(entry.blockchainHash)} <Link2 className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <p className="font-mono text-[11px] text-muted-foreground">{formatTxHash(entry.blockchainHash)}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <PaginationControls
                        page={Math.min(monitoredPage, monitoredTotalPages)}
                        totalPages={monitoredTotalPages}
                        onPageChange={setMonitoredPage}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FinalAuditSealTab({
  records,
  loading,
  syncState,
  sealingProjectId,
  initialSelectedProjectId,
  onInitialSelectionApplied,
  getChainOfCustody,
  onRequestFinalSeal,
}: {
  records: NationalLedgerProject[];
  loading: boolean;
  syncState: NationalDataSyncState;
  sealingProjectId: string | null;
  initialSelectedProjectId?: string | null;
  onInitialSelectionApplied?: () => void;
  getChainOfCustody: (projectId: string) => ChainOfCustodyStep[];
  onRequestFinalSeal: (record: NationalLedgerProject, remarks: string) => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("All Regions");
  const [municipalityFilter, setMunicipalityFilter] = useState(ALL_MUNICIPALITIES_OPTION);
  const [barangayFilter, setBarangayFilter] = useState(ALL_BARANGAYS_OPTION);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sealRemarks, setSealRemarks] = useState("");
  const [sealError, setSealError] = useState<string | null>(null);
  const [sealSuccess, setSealSuccess] = useState<string | null>(null);
  const [sealViewMode, setSealViewMode] = useState<"seal-candidates" | "finalized-registry">("seal-candidates");
  const [sealCandidatePage, setSealCandidatePage] = useState(1);
  const [finalizedRegistryPage, setFinalizedRegistryPage] = useState(1);

  useEffect(() => {
    setMunicipalityFilter(ALL_MUNICIPALITIES_OPTION);
    setBarangayFilter(ALL_BARANGAYS_OPTION);
  }, [regionFilter]);

  useEffect(() => {
    setBarangayFilter(ALL_BARANGAYS_OPTION);
  }, [municipalityFilter]);

  const municipalityOptions = useMemo(() => {
    const options = new Set<string>();
    for (const record of records) {
      if (!matchesRegionFilter(record.region, regionFilter)) continue;
      options.add(getMunicipalityLabel(record));
    }
    return [ALL_MUNICIPALITIES_OPTION, ...Array.from(options).sort((a, b) => a.localeCompare(b))];
  }, [records, regionFilter]);

  const barangayOptions = useMemo(() => {
    const options = new Set<string>();
    for (const record of records) {
      if (!matchesRegionFilter(record.region, regionFilter)) continue;
      const municipality = getMunicipalityLabel(record);
      if (municipalityFilter !== ALL_MUNICIPALITIES_OPTION && municipality !== municipalityFilter) continue;
      options.add(getBarangayLabel(record));
    }
    return [ALL_BARANGAYS_OPTION, ...Array.from(options).sort((a, b) => a.localeCompare(b))];
  }, [records, regionFilter, municipalityFilter]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSearch =
        !q ||
        record.projectId.toLowerCase().includes(q) ||
        record.projectName.toLowerCase().includes(q) ||
        record.contractor.toLowerCase().includes(q);

      const municipality = getMunicipalityLabel(record);
      const barangay = getBarangayLabel(record);

      const matchesMunicipality =
        municipalityFilter === ALL_MUNICIPALITIES_OPTION || municipality === municipalityFilter;
      const matchesBarangay = barangayFilter === ALL_BARANGAYS_OPTION || barangay === barangayFilter;

      return (
        matchesSearch &&
        matchesRegionFilter(record.region, regionFilter) &&
        matchesMunicipality &&
        matchesBarangay
      );
    });
  }, [records, searchQuery, regionFilter, municipalityFilter, barangayFilter]);

  const milestoneReadyRecords = useMemo(() => {
    return filteredRecords.filter((record) => getCompletionPercent(record) >= 100);
  }, [filteredRecords]);

  const sealCandidates = useMemo(() => {
    return milestoneReadyRecords.filter((record) => record.blockchainStatus !== "FINAL_SEAL");
  }, [milestoneReadyRecords]);

  useEffect(() => {
    setSealCandidatePage(1);
    setFinalizedRegistryPage(1);
  }, [searchQuery, regionFilter, municipalityFilter, barangayFilter, sealViewMode]);

  const sealCandidatesTotalPages = Math.max(
    1,
    Math.ceil(sealCandidates.length / COA_NATIONAL_SEAL_CANDIDATES_PAGE_SIZE)
  );
  const pagedSealCandidates = useMemo(() => {
    const safePage = Math.min(sealCandidatePage, sealCandidatesTotalPages);
    const start = (safePage - 1) * COA_NATIONAL_SEAL_CANDIDATES_PAGE_SIZE;
    return sealCandidates.slice(start, start + COA_NATIONAL_SEAL_CANDIDATES_PAGE_SIZE);
  }, [sealCandidates, sealCandidatePage, sealCandidatesTotalPages]);

  const hasAnyEligibleSealCandidate = useMemo(() => {
    return records.some(
      (record) => getCompletionPercent(record) >= 100 && record.blockchainStatus !== "FINAL_SEAL"
    );
  }, [records]);

  const historicalRegistry = useMemo(() => {
    return filteredRecords
      .filter((record) => record.blockchainStatus === "FINAL_SEAL")
      .sort((left, right) => {
        const leftEpoch = toEpoch(left.latestActionAt || left.project.lastVerified || left.project.startDate);
        const rightEpoch = toEpoch(right.latestActionAt || right.project.lastVerified || right.project.startDate);
        return rightEpoch - leftEpoch;
      });
  }, [filteredRecords]);

  const historicalRegistryTotalPages = Math.max(
    1,
    Math.ceil(historicalRegistry.length / COA_NATIONAL_HISTORY_PAGE_SIZE)
  );
  const pagedHistoricalRegistry = useMemo(() => {
    const safePage = Math.min(finalizedRegistryPage, historicalRegistryTotalPages);
    const start = (safePage - 1) * COA_NATIONAL_HISTORY_PAGE_SIZE;
    return historicalRegistry.slice(start, start + COA_NATIONAL_HISTORY_PAGE_SIZE);
  }, [historicalRegistry, finalizedRegistryPage, historicalRegistryTotalPages]);

  useEffect(() => {
    if (!initialSelectedProjectId) return;

    const targetRecord = records.find((record) => record.projectId === initialSelectedProjectId);
    if (!targetRecord) return;

    setRegionFilter("All Regions");
    setMunicipalityFilter(ALL_MUNICIPALITIES_OPTION);
    setBarangayFilter(ALL_BARANGAYS_OPTION);
    setSealViewMode("seal-candidates");
    setSearchQuery(initialSelectedProjectId);
    setSelectedProjectId(initialSelectedProjectId);
    onInitialSelectionApplied?.();
  }, [initialSelectedProjectId, onInitialSelectionApplied, records]);

  useEffect(() => {
    setSelectedProjectId((current) => {
      if (current && sealCandidates.some((record) => record.projectId === current)) {
        return current;
      }
      return null;
    });
  }, [sealCandidates]);

  useEffect(() => {
    setSealError(null);
    setSealSuccess(null);
  }, [selectedProjectId]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return sealCandidates.find((record) => record.projectId === selectedProjectId) ?? null;
  }, [sealCandidates, selectedProjectId]);

  const chainOfCustody = useMemo(() => {
    if (!selectedProject) return [];
    return getChainOfCustody(selectedProject.projectId);
  }, [selectedProject, getChainOfCustody]);

  const engineerStep = chainOfCustody.find((step) => step.key === "ENGINEER_VERIFICATION");
  const regionalStep = chainOfCustody.find((step) => step.key === "REGIONAL_AUDIT_APPROVAL");

  const completionPercent = selectedProject ? getCompletionPercent(selectedProject) : 0;
  const completionReady = completionPercent >= 100;
  const statusReady = selectedProject?.blockchainStatus === "COA_REGIONAL_APPROVED";
  const engineerSignatureReady = Boolean(engineerStep?.completed && engineerStep.signatureVerified);
  const regionalSignatureReady = Boolean(regionalStep?.completed && regionalStep.signatureVerified);
  const reconciliationReady = selectedProject ? isProjectReconciled(selectedProject, syncState) : false;
  const alreadyFinalized = selectedProject?.blockchainStatus === "FINAL_SEAL";

  const canFinalize = Boolean(
    selectedProject &&
    completionReady &&
    statusReady &&
    reconciliationReady &&
    !alreadyFinalized
  );

  const finalSealDisabledReason = (() => {
    if (!selectedProject) return "Select a project first.";
    if (alreadyFinalized) return "Project already finalized and archived as read-only.";
    if (!completionReady || !statusReady) {
      return "Final Audit Seal is locked: require 100% completion and status COA_REGIONAL_APPROVED.";
    }
    if (!reconciliationReady) {
      return "Action blocked: on-chain status and off-chain evidence are not fully reconciled.";
    }
    return "";
  })();

  const readinessChecklist = [
    { label: "Engineer Signature Verified", value: engineerSignatureReady },
    { label: "Regional Signature Verified", value: regionalSignatureReady },
    { label: "100% Physical Progress", value: completionReady },
    { label: "Status = COA_REGIONAL_APPROVED", value: Boolean(statusReady) },
    { label: "On-chain + Off-chain Reconciliation", value: reconciliationReady },
  ];
  const readinessPassedCount = readinessChecklist.filter((item) => item.value).length;

  const handleSeal = async () => {
    if (!selectedProject) return;

    setSealError(null);
    setSealSuccess(null);

    try {
      await onRequestFinalSeal(selectedProject, sealRemarks);
      setSealSuccess(`Final Audit Seal affixed for ${selectedProject.projectName}. Project archived to historical registry.`);
      setSealRemarks("");
    } catch (error) {
      setSealError(error instanceof Error ? error.message : "Final Audit Seal failed.");
    }
  };

  return (
    <div className="space-y-3">

      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search project for final audit sealing"
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <select
            value={regionFilter}
            onChange={(event) => setRegionFilter(event.target.value)}
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            {REGION_FILTER_OPTIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
          <select
            value={municipalityFilter}
            onChange={(event) => setMunicipalityFilter(event.target.value)}
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            {municipalityOptions.map((municipality) => (
              <option key={municipality} value={municipality}>
                {municipality}
              </option>
            ))}
          </select>
          <select
            value={barangayFilter}
            onChange={(event) => setBarangayFilter(event.target.value)}
            className="h-9 rounded border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            {barangayOptions.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-2 shadow-sm">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setSealViewMode("seal-candidates")}
            className={`inline-flex h-10 items-center justify-between rounded-lg border px-3 text-xs font-semibold transition-colors ${
              sealViewMode === "seal-candidates"
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <span className="tracking-wide">Seal Candidates</span>
            <span
              className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                sealViewMode === "seal-candidates" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              }`}
            >
              {sealCandidates.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSealViewMode("finalized-registry")}
            className={`inline-flex h-10 items-center justify-between rounded-lg border px-3 text-xs font-semibold transition-colors ${
              sealViewMode === "finalized-registry"
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            <span className="tracking-wide">Finalized Registry</span>
            <span
              className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                sealViewMode === "finalized-registry" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              }`}
            >
              {historicalRegistry.length}
            </span>
          </button>
        </div>
      </div>

      {sealViewMode === "seal-candidates" && (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <div className="grid min-w-252 grid-cols-[8rem_2fr_1.3fr_8rem_8.5rem_10rem_7rem] bg-muted/80 px-3 py-2">
              {[
                "Project ID",
                "Project",
                "Contractor",
                "Progress",
                "Status",
                "Reconciliation",
                "View",
              ].map((header) => (
                <p key={header} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {header}
                </p>
              ))}
            </div>

            {loading ? (
              <div className="px-3 py-10 text-center text-xs text-muted-foreground">Loading seal candidates...</div>
            ) : sealCandidates.length === 0 ? (
              <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                {hasAnyEligibleSealCandidate
                  ? "No seal candidates matched the current final seal filters."
                  : "No project has reached 100% milestone completion yet. Final Audit Seal stays empty until one qualifies."}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pagedSealCandidates.map((record) => {
                  const completion = getCompletionPercent(record);
                  const reconciled = isProjectReconciled(record, syncState);
                  const physicalProgressPct = getPhysicalProgressPercent(record);
                  const financialProgressPct = getFinancialProgressPercent(
                    toSafeAmount(record.totalMilestonePaid),
                    toSafeAmount(record.project.budget)
                  );
                  const isCriticalAnomaly =
                    financialProgressPct - physicalProgressPct > CRITICAL_ANOMALY_GAP_THRESHOLD_PCT;
                  const isSelected = selectedProjectId === record.projectId;

                  return (
                    <button
                      key={record.projectId}
                      type="button"
                      onClick={() =>
                        setSelectedProjectId((current) =>
                          current === record.projectId ? null : record.projectId
                        )
                      }
                      className={`grid min-w-252 w-full grid-cols-[8rem_2fr_1.3fr_8rem_8.5rem_10rem_7rem] items-center gap-2 px-3 py-3 text-left transition-colors ${
                        isSelected ? "bg-muted" : "hover:bg-muted/30"
                      }`}
                    >
                      <p className="truncate font-mono text-[11px] font-semibold text-foreground">{record.projectId}</p>
                      <p className="truncate text-xs font-semibold text-foreground">{record.projectName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{record.contractor || "Not Recorded"}</p>
                      <p className="text-[11px] font-semibold text-foreground">{completion.toFixed(0)}%</p>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={record.blockchainStatus} />
                        {isCriticalAnomaly ? (
                          <span className="inline-flex rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
                            High Risk
                          </span>
                        ) : null}
                      </div>
                      <div>
                        <ReconciliationBadge ready={reconciled} />
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                        {isSelected ? "Hide" : "Open"}
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isSelected ? "rotate-90" : ""}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!loading && sealCandidates.length > 0 && (
            <PaginationControls
              page={Math.min(sealCandidatePage, sealCandidatesTotalPages)}
              totalPages={sealCandidatesTotalPages}
              onPageChange={setSealCandidatePage}
            />
          )}

          {selectedProject && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Project Seal Workspace</p>
                  <p className="text-sm font-semibold text-foreground">{selectedProject.projectName}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded bg-muted px-2 py-0.5 font-mono font-semibold text-foreground">{selectedProject.projectId}</span>
                    <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">{selectedProject.region}</span>
                    <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                      {selectedProject.municipality || UNKNOWN_MUNICIPALITY_LABEL}
                    </span>
                  </div>
                </div>
                <StatusBadge status={selectedProject.blockchainStatus} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">Readiness Checklist</p>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {readinessPassedCount}/{readinessChecklist.length} passed
                    </span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {readinessChecklist.map((item) => (
                      <div key={item.label} className="flex min-h-9 items-center justify-between rounded border border-border bg-card px-2.5 py-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground">
                          {item.value ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-accent" />
                          )}
                          {item.label}
                        </span>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${item.value ? "bg-primary/10 text-primary" : "bg-accent/15 text-accent"}`}>
                          {item.value ? "Passed" : "Pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold text-foreground">Seal Control</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Strict Activation Logic: disabled if progress &lt; 100 or status is not COA_REGIONAL_APPROVED.
                  </p>

                  <textarea
                    value={sealRemarks}
                    onChange={(event) => setSealRemarks(event.target.value)}
                    className="mt-3 min-h-19 w-full rounded border border-border bg-card px-2.5 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                    placeholder="Optional national remarks before final seal..."
                  />

                  {finalSealDisabledReason && (
                    <div className="mt-2 rounded border border-accent/30 bg-accent/10 px-2.5 py-2 text-[11px] text-accent">
                      {finalSealDisabledReason}
                    </div>
                  )}
                  {sealError && <p className="mt-2 text-[11px] text-destructive">{sealError}</p>}
                  {sealSuccess && <p className="mt-2 text-[11px] text-primary">{sealSuccess}</p>}

                  <Button
                    type="button"
                    onClick={() => void handleSeal()}
                    disabled={!canFinalize || sealingProjectId === selectedProject.projectId}
                    className="mt-3 w-full bg-primary text-primary-foreground hover:bg-accent"
                  >
                    {sealingProjectId === selectedProject.projectId ? "Applying Final Audit Seal..." : "Final Audit Seal"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {sealViewMode === "finalized-registry" && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-1 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Historical Registry (Read-only)</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Projects sealed by COA National are archived here and cannot be edited.</p>
            </div>
            <span className="inline-flex w-fit items-center rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {historicalRegistry.length} finalized project(s)
            </span>
          </div>

          {historicalRegistry.length === 0 ? (
            <div className="mt-4 rounded border border-dashed border-border bg-muted/30 px-3 py-8 text-center text-xs text-muted-foreground">
              No finalized projects matched the current final seal filters.
            </div>
          ) : (
            <>
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <div className="grid min-w-190 grid-cols-[8rem_2fr_9rem_10rem_9rem] bg-muted px-3 py-2">
                  {["Project ID", "Project", "Region", "Finalized At", "TX Hash"].map((header) => (
                    <p key={header} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {header}
                    </p>
                  ))}
                </div>

                <div className="divide-y divide-border">
                  {pagedHistoricalRegistry.map((record) => (
                    <div key={`history-${record.projectId}`} className="grid min-w-190 grid-cols-[8rem_2fr_9rem_10rem_9rem] items-center gap-2 px-3 py-3">
                      <p className="truncate font-mono text-[11px] font-semibold text-foreground">{record.projectId}</p>
                      <p className="truncate text-xs font-semibold text-foreground">{record.projectName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{record.region}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDateTime(record.latestActionAt || record.project.lastVerified)}</p>
                      {record.latestTxHash && isRealTxHash(record.latestTxHash) ? (
                        <a
                          href={getEtherscanLink(record.latestTxHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                        >
                          {formatTxHash(record.latestTxHash)} <Link2 className="h-3 w-3" />
                        </a>
                      ) : (
                        <p className="font-mono text-[11px] text-muted-foreground">{formatTxHash(record.latestTxHash)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <PaginationControls
                page={Math.min(finalizedRegistryPage, historicalRegistryTotalPages)}
                totalPages={historicalRegistryTotalPages}
                onPageChange={setFinalizedRegistryPage}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function COANationalOversightDashboard({
  setCurrentPage,
  initialTab,
  initialFinalSealProjectId,
}: COANationalOversightDashboardProps) {
  const { disconnectWallet, walletAddress } = useWallet();
  const { addNotification, notifications } = useNotifications();
  const { gasError, clearGasError, handleGasError } = useGasGuard();

  const [pageView, setPageView] = useState<DashboardTab>(initialTab ?? "national-ledger");
  const [deepLinkedFinalSealProjectId, setDeepLinkedFinalSealProjectId] = useState<string | null>(
    initialFinalSealProjectId ?? null
  );
  const [sealingProjectId, setSealingProjectId] = useState<string | null>(null);
  const [localFinalSealProjectIds, setLocalFinalSealProjectIds] = useState<Set<string>>(new Set());
  const [auditNetworkView, setAuditNetworkView] = useState<"register" | "auditors">("register");
  const [registeredAuditors, setRegisteredAuditors] = useState<UserProfile[]>([]);
  const [auditorsLoading, setAuditorsLoading] = useState(false);
  const [auditorsError, setAuditorsError] = useState<string | null>(null);

  const [profile, setProfile] = useState<{ walletAddress?: string; assignedRegion?: string; displayName?: string } | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const res = await authApi.getProfile();
      setProfile(res.data);
    } catch {
      // Keep dashboard accessible even when profile API is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const loadRegisteredAuditors = useCallback(async () => {
    setAuditorsLoading(true);
    setAuditorsError(null);

    try {
      const response = await authApi.getRegionalAuditors();
      const auditors = Array.isArray(response.data) ? response.data : [];

      setRegisteredAuditors(
        [...auditors].sort((left, right) => {
          const leftRegion = String(left.assignedRegion ?? "");
          const rightRegion = String(right.assignedRegion ?? "");
          const regionSort = leftRegion.localeCompare(rightRegion);
          if (regionSort !== 0) return regionSort;

          const leftName = String(left.displayName ?? left.walletAddress ?? left.id ?? "");
          const rightName = String(right.displayName ?? right.walletAddress ?? right.id ?? "");
          return leftName.localeCompare(rightName);
        })
      );
    } catch {
      setAuditorsError("Unable to load COA Regional accounts right now. Please retry.");
    } finally {
      setAuditorsLoading(false);
    }
  }, []);

  const { auditEntries } = useAuditTrail();
  const { projects: rdcProjects } = useProjectContext();
  const { milestones } = useMilestoneContext();

  const spentByProjectId = useMemo(() => buildProjectSpentByMilestones(milestones), [milestones]);
  const mappedProjects = useMemo(
    () =>
      rdcProjects.map((project) => ({
        ...mapRDCToProject(project),
        spent: spentByProjectId[project.id] ?? 0,
      })),
    [rdcProjects, spentByProjectId]
  );

  const globalProjects = useMemo(() => {
    return mappedProjects.filter((project) => {
      const status = String(project.rawStatus ?? project.status ?? "").toUpperCase();
      return status !== "PROPOSAL_REJECTED" && status !== "REJECTED";
    });
  }, [mappedProjects]);

  const {
    syncState,
    isLoading,
    syncError,
    ledgerProjects,
    riskProfiles,
    getChainOfCustody,
    fetchAllRegionalData,
  } = useNationalOversightHub({
    projects: globalProjects,
    milestones,
    auditEntries,
    localFinalSealProjectIds,
  });

  useEffect(() => {
    void fetchAllRegionalData();
  }, [fetchAllRegionalData]);

  useEffect(() => {
    if (pageView === "coa-regional-accounts") {
      void loadRegisteredAuditors();
    }
  }, [loadRegisteredAuditors, pageView]);

  useEffect(() => {
    if (initialTab) {
      setPageView(initialTab);
    }

    if (initialFinalSealProjectId) {
      setPageView("final-audit-seal");
      setDeepLinkedFinalSealProjectId(initialFinalSealProjectId);
    }
  }, [initialFinalSealProjectId, initialTab]);

  const roleBadgeLabel = "COA | National Oversight";

  const handleRequestFinalSeal = useCallback(
    async (record: NationalLedgerProject, remarks: string) => {
      if (!isProjectReconciled(record, syncState)) {
        throw new Error("Data reconciliation is incomplete. Final Audit Seal is blocked until on-chain and off-chain evidence are synchronized.");
      }

      const completion = Math.max(
        Number(record.project.progress ?? 0),
        Number(record.project.currentProgress ?? 0)
      );

      if (completion < 100 || record.blockchainStatus !== "COA_REGIONAL_APPROVED") {
        throw new Error("Final Audit Seal requires 100% project progress and blockchain status COA_REGIONAL_APPROVED.");
      }

      const normalizedRemarks = remarks.trim();
      const remarksSuffix = normalizedRemarks ? ` Remarks: ${normalizedRemarks}` : "";

      setSealingProjectId(record.projectId);

      try {
        const signResult = await finalizeProject({
          projectId: record.projectId,
          description: `COA National finalized ${record.projectName} on-chain.${remarksSuffix}`,
          metadata: {
            projectId: record.projectId,
            projectName: record.projectName,
            region: record.region,
            municipality: record.municipality,
            nationalRemarks: normalizedRemarks || "N/A",
            strictSealGate: "progress>=100_and_status=COA_REGIONAL_APPROVED",
          },
        });

        if (!signResult.txHash || !signResult.onChainConfirmed) {
          throw new Error("Blockchain transaction was not confirmed. Project finalization was not applied.");
        }

        await logToAuditTrail(signResult, {
          role: "coa_overseer",
          actionType: "PROJECT_FINALIZED",
          referenceId: record.projectId,
          description: `Project finalized on-chain by COA National for ${record.projectName}.${remarksSuffix}`,
          actorName: ACTOR_NAME,
          projectId: record.projectId,
          projectName: record.projectName,
          region: record.region,
        });

        setLocalFinalSealProjectIds((previous) => {
          const next = new Set(previous);
          next.add(record.projectId);
          return next;
        });

        await fetchAllRegionalData();
      } catch (error) {
        if (handleGasError(error)) {
          throw new Error("Insufficient gas for Final Audit Seal transaction.");
        }
        throw error;
      } finally {
        setSealingProjectId(null);
      }
    },
    [fetchAllRegionalData, handleGasError, syncState]
  );

  const finalSealReadyProjects = useMemo(() => {
    return ledgerProjects.filter((record) => {
      const completion = getCompletionPercent(record);
      const regionallyApproved = record.blockchainStatus === "COA_REGIONAL_APPROVED";
      return completion >= 100 && regionallyApproved;
    });
  }, [ledgerProjects]);

  useEffect(() => {
    if (finalSealReadyProjects.length === 0) return;

    for (const record of finalSealReadyProjects) {
      const alreadyNotified = notifications.some(
        (notification) =>
          notification.targetRole === "overseer" &&
          notification.relatedId === record.projectId &&
          notification.title === "Final Audit Seal Ready"
      );

      if (alreadyNotified) continue;

      addNotification({
        type: "approval",
        title: "Final Audit Seal Ready",
        message: `${record.projectName} reached 100% completion and passed COA Regional audit. Tap to open Final Audit Seal for this exact project.`,
        targetRole: "overseer",
        sourceRole: "auditor",
        actionUrl: `/overseer:final-audit-seal:${encodeURIComponent(record.projectId)}`,
        relatedId: record.projectId,
        metadata: {
          notificationKind: "FINAL_AUDIT_SEAL_READY",
        },
      });
    }
  }, [addNotification, finalSealReadyProjects, notifications]);

  const walletMismatch = (() => {
    if (!profile || !walletAddress) return false;
    if (!profile.walletAddress) return false;
    return profile.walletAddress.toLowerCase() !== walletAddress.toLowerCase();
  })();

  if (walletMismatch) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background pt-20">
        <div className="mx-auto max-w-md space-y-4 rounded-xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
          <Shield className="mx-auto h-16 w-16 text-destructive" />
          <h2 className="text-xl font-bold text-foreground">Wallet Mismatch Detected</h2>
          <p className="text-sm text-muted-foreground">The connected MetaMask wallet does not match the authorized wallet for your COA account.</p>
          <Button
            onClick={async () => {
              await disconnectWallet();
              setCurrentPage("home");
            }}
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
          >
            Disconnect & Return
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="relative z-10 border-b border-border bg-card shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 sm:py-5">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-base font-bold tracking-tight text-foreground sm:text-lg">COA National</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">Strict accountability, 100% completion guardrails, and executive-level national monitoring.</p>
              <span className="mt-2 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                {roleBadgeLabel}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void fetchAllRegionalData()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                Sync Nationwide
              </button>

              <button
                type="button"
                onClick={async () => {
                  await disconnectWallet();
                  setCurrentPage("home");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Wallet className="h-3.5 w-3.5" /> Disconnect
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-border">
          <div className="mx-auto flex max-w-7xl gap-1 px-4 sm:px-6 lg:px-8">
            {TAB_ITEMS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPageView(tab.id)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                    pageView === tab.id
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        {pageView !== "coa-regional-accounts" && <DataSyncBanner syncState={syncState} syncError={syncError} />}
                                
        {pageView === "national-ledger" && (
          <NationalProjectLedgerTab
            records={ledgerProjects}
            loading={isLoading}
            syncState={syncState}
            riskProfiles={riskProfiles}
            getChainOfCustody={getChainOfCustody}
          />
        )}

        {pageView === "immutable-audit-trail" && (
          <ImmutableAuditTrailTab
            records={ledgerProjects}
            loading={isLoading}
            getChainOfCustody={getChainOfCustody}
            auditEntries={auditEntries}
          />
        )} 

        {pageView === "final-audit-seal" && (
          <FinalAuditSealTab
            records={ledgerProjects}
            loading={isLoading}
            syncState={syncState}
            sealingProjectId={sealingProjectId}
            initialSelectedProjectId={deepLinkedFinalSealProjectId}
            onInitialSelectionApplied={() => setDeepLinkedFinalSealProjectId(null)}
            getChainOfCustody={getChainOfCustody}
            onRequestFinalSeal={handleRequestFinalSeal}
          />
        )}

        {pageView === "coa-regional-accounts" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">COA Regional Account Provisioning</p>
                <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  Recorded On-chain + Off-chain
                </span>
              </div>

              <p className="mt-1 text-[11px] text-muted-foreground">
                Register auditor wallets on-chain, then automatically sync and whitelist account data in the backend registry.
              </p>

              <div className="mt-3 inline-flex rounded-lg border border-border bg-muted/20 p-1">
                <button
                  type="button"
                  onClick={() => setAuditNetworkView("register")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    auditNetworkView === "register"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  Register Auditor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuditNetworkView("auditors");
                    void loadRegisteredAuditors();
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    auditNetworkView === "auditors"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  Registered Auditors
                </button>
              </div>

              {auditorsError && <p className="mt-2 text-[11px] text-destructive">{auditorsError}</p>}
            </div>

            <AuditNetwork
              pageView={auditNetworkView}
              setPageView={setAuditNetworkView}
              registeredAuditors={registeredAuditors}
              auditorsLoading={auditorsLoading}
              loadRegisteredAuditors={() => {
                void loadRegisteredAuditors();
              }}
            />
          </div>
        )}
      </div>

      <InsufficientGasModal open={gasError.open} onClose={clearGasError} message={gasError.message} />
    </div>
  );
}

 