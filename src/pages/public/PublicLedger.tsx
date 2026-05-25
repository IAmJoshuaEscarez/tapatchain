import {
  AlertCircle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Hash,
  Heart,
  MessageCircle,
  MessageSquareQuote,
  QrCode,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  UserCircle2,
} from "lucide-react";
import { useState } from "react";

import { Card, PaginationControls } from "@/components/ui";
import tapatChainLogo from "@/assets/images/tapatchain.png";
import { HIGH_RISK_GAP_THRESHOLD_PCT } from "@/features/project/hooks/useFinancialPhysicalIntegrity";
import {
  usePublicLedgerViewModel,
  type FeedPost,
  type IntegrityRecordSnapshot,
} from "@/hooks/public/usePublicLedgerViewModel";
import { getEtherscanLink, isRealTxHash } from "@/services/blockchain";

interface PublicLedgerPageProps {
  setCurrentPage: (page: string) => void;
  trackingSlug?: string;
}

function resolvePublicMonitorBaseUrl(): string {
  const configured = String(import.meta.env.VITE_SITE_URL ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "https://www.tapatchain.site";
}

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
const PROPOSAL_BUDGET_ACTION_TYPES = new Set([
  "PROPOSAL_SIGNED",
  "PROPOSAL_SUBMITTED",
  "PROPOSAL_APPROVED",
  "SUBMITTED_TO_NATIONAL",
]);

const ORIGINAL_RDC_PROPOSAL_ACTION_TYPES = new Set([
  "PROPOSAL_SIGNED",
  "PROPOSAL_SUBMITTED",
]);

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toHumanTimestamp(value?: string): string {
  if (!value) return "Timestamp unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncateHex(value?: string, left = 6, right = 4): string {
  if (!value) return "-";
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function getIntegrityBadgeClass(status: IntegrityRecordSnapshot["integrityStatus"]): string {
  if (status === "MATCHED") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "TAMPERED") return "bg-red-500/15 text-red-700 dark:text-red-300";
  return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
}

function getIntegrityResultMessage(snapshot: IntegrityRecordSnapshot): string {
  if (snapshot.integrityStatus === "NO_ANCHOR") {
    return "No on-chain transaction hash anchor exists yet for this record. Integrity cannot be verified until a blockchain transaction is anchored.";
  }

  if (snapshot.isMatch) {
    return "Off-chain record hash matches the anchored on-chain hash.";
  }

  return "Mismatch detected. Off-chain record hash does not match the anchored on-chain hash.";
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

function parsePesoAmountFromText(text?: string): number | undefined {
  if (!text) return undefined;

  const match = text.match(/(?:PHP\s*|\u20b1)([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!match?.[1]) return undefined;

  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formatPeso(value: number): string {
  return pesoFormatter.format(Number.isFinite(value) ? value : 0);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return value;
}

function normalizeLocationValue(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTrackingSlug(value?: string | number): string {
  return String(value ?? "").trim();
}

function buildMonitorLink(trackingSlug?: string, projectId?: string | number): string | undefined {
  const normalizedTrackingSlug = normalizeTrackingSlug(trackingSlug);
  if (!normalizedTrackingSlug) return undefined;

  const normalizedProjectId = normalizeTrackingSlug(projectId);
  const slug = normalizedProjectId || normalizedTrackingSlug;
  return `${resolvePublicMonitorBaseUrl()}/monitor/${encodeURIComponent(slug)}`;
}

function buildQrImageUrl(monitorUrl?: string): string | undefined {
  if (!monitorUrl) return undefined;
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(monitorUrl)}`;
}

async function downloadQrCodeImage(imageUrl: string, fileName: string): Promise<void> {
  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load image"));
      image.src = src;
    });

  const [qrImage, logoImage] = await Promise.all([
    loadImage(imageUrl),
    loadImage(tapatChainLogo),
  ]);

  const size = Math.max(qrImage.naturalWidth || 320, qrImage.naturalHeight || 320);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable");

  context.drawImage(qrImage, 0, 0, size, size);

  const logoSize = Math.round(size * 0.24);
  const logoX = Math.round((size - logoSize) / 2);
  const logoY = Math.round((size - logoSize) / 2);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(logoImage, logoX, logoY, logoSize, logoSize);

  const dataUrl = canvas.toDataURL("image/png");
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
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

  const romanRegionMatch = cleaned.match(/^Region\s+([IVXLCDM]+)(-[A-Za-z])?\s*(?:-|\u2013)?\s*(.*)$/i);
  if (romanRegionMatch) {
    const romanCode = romanRegionMatch[1] ?? "";
    const suffix = (romanRegionMatch[2] ?? "").toUpperCase();
    const tail = (romanRegionMatch[3] ?? "").trim();
    const numericCode = romanToArabic(romanCode);
    const regionCode = suffix ? `${numericCode}${suffix}` : numericCode;
    return tail ? `Region ${regionCode} ${tail}` : `Region ${regionCode}`;
  }

  const numericRegionMatch = cleaned.match(/^Region\s+([0-9]+(?:-[A-Za-z])?)\s*(?:-|\u2013)?\s*(.*)$/i);
  if (numericRegionMatch) {
    const code = (numericRegionMatch[1] ?? "").toUpperCase();
    const tail = (numericRegionMatch[2] ?? "").trim();
    return tail ? `Region ${code} ${tail}` : `Region ${code}`;
  }

  return cleaned.replace(/\s*-\s*/g, " ");
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

function shouldShowFundingMetrics(actionType: string): boolean {
  const normalized = actionType.toUpperCase();

  if (isFinancialAction(normalized)) return true;

  return (
    normalized.includes("APPROVE") ||
    normalized.includes("VERIFIED") ||
    normalized.includes("FUNDED") ||
    normalized.includes("RELEASE") ||
    normalized.includes("DISBURSE") ||
    normalized.includes("COMMIT") ||
    normalized.includes("PAYMENT_AUTHORIZED")
  );
}

function isSpentActionType(actionType: string): boolean {
  const normalized = actionType.toUpperCase();

  return (
    normalized === "DISBURSEMENT" ||
    normalized === "FUND_DISBURSED" ||
    normalized === "MILESTONE_PAYMENT_AUTHORIZED" ||
    normalized.includes("PAYMENT_AUTHORIZED") ||
    normalized.includes("DISBURSE")
  );
}

function isReleaseActionType(actionType: string): boolean {
  const normalized = actionType.toUpperCase();

  return (
    normalized === "FUND_RELEASED" ||
    normalized === "BUDGET_RELEASED" ||
    normalized === "PROJECT_FUNDED" ||
    normalized === "COMMIT_FUNDS" ||
    normalized === "FUNDS_COMMITTED" ||
    normalized.includes("RELEASE")
  );
}

function isProposalBudgetActionType(actionType: string): boolean {
  const normalized = actionType.toUpperCase();
  if (PROPOSAL_BUDGET_ACTION_TYPES.has(normalized)) return true;

  return normalized.includes("PROPOSAL") && (normalized.includes("SIGNED") || normalized.includes("SUBMITTED"));
}

function getCitizenCategoryLabel(post: FeedPost): string {
  if (post.actorKind === "citizen") {
    return "Citizen Feedback";
  }

  if (isAssignmentAction(post.actionType)) {
    return "Personnel Assignment";
  }

  if (isFinancialAction(post.actionType)) {
    return "Funding & Release";
  }

  if (isDecisionAction(post.actionType)) {
    return "Approval & Audit";
  }

  if (CONTRACTOR_STEP_ACTIONS.has(post.actionType.toUpperCase())) {
    return "Progress Submission";
  }

  return "Project Update";
}
export function PublicLedgerPage({ setCurrentPage, trackingSlug }: PublicLedgerPageProps) {
  const [selectedIntegritySnapshot, setSelectedIntegritySnapshot] = useState<IntegrityRecordSnapshot | null>(null);
  const [projectChannelOfficeFilterByKey, setProjectChannelOfficeFilterByKey] = useState<Record<string, string>>({});

  const {
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
  } = usePublicLedgerViewModel({ setCurrentPage, trackingSlug });

  const lifecycleLabel =
    projectLifecycleFilter === "proposals"
      ? "proposal"
      : projectLifecycleFilter === "all"
        ? "project"
        : "funded project";

  const lifecycleTitle =
    projectLifecycleFilter === "proposals"
      ? "No proposal matched your search."
      : projectLifecycleFilter === "all"
        ? "No project matched your search."
        : "No funded project matched your search.";

  const lifecycleHint =
    projectLifecycleFilter === "proposals"
      ? "Try another keyword or wait for new proposals to sync."
      : projectLifecycleFilter === "all"
        ? "Try another keyword or wait for new projects to sync."
        : "Try another keyword or wait for new funded projects to sync.";

  return (
    <div className="public-ledger-page min-h-screen bg-background pt-20">
      <div className="sticky left-0 right-0 top-14 z-20 border-b border-border bg-background/95 backdrop-blur-sm sm:top-16">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6" style={{ transform: "scale(0.9)", transformOrigin: "top center" }}>
          <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground dark:text-zinc-200">Public Ledger</h1>
              <p className="text-xs leading-6 text-muted-foreground">
                Clean view: DPWH National funded projects first.
              </p>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 text-xs text-muted-foreground sm:w-auto sm:flex-nowrap">
              <RefreshCw className={`h-3.5 w-3.5 ${chainSyncing ? "animate-spin" : ""}`} />
              <span>{chainSyncing ? "Syncing ledger" : "Ledger updated"}</span>
              {lastSeenBlock !== null && (
                <span className="rounded-full border border-border px-2 py-0.5">Latest block: {lastSeenBlock}</span>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setCurrentPage("community-feedback")}
              className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/80 sm:w-auto"
              title="Open citizen hub"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Citizen News Feed
            </button>
          </div>

            <div className="mt-4 space-y-3 rounded-xl border border-border/60 bg-card/50 p-3 sm:p-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-2.5 lg:grid-cols-3 xl:grid-cols-4">
              <div className="relative col-span-1 min-w-0 sm:col-span-2 lg:col-span-3 xl:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={projectSearchQuery}
                  onChange={(event) => setProjectSearchQuery(event.target.value)}
                  placeholder="Search"
                  className="h-8 w-full min-w-0 rounded-full border border-border bg-background pl-8 pr-2 text-[11px] text-foreground outline-none transition-colors focus:border-primary sm:h-9 sm:pl-9 sm:pr-3 sm:text-sm"
                />
              </div>

              <select
                value={projectLifecycleFilter}
                onChange={(event) => setProjectLifecycleFilter(event.target.value as "all" | "proposals" | "funded")}
                className="h-8 w-full min-w-0 rounded-full border border-border bg-background px-2 pr-6 text-[11px] text-foreground outline-none transition-colors focus:border-primary sm:h-9 sm:px-3 sm:pr-8 sm:text-sm"
              >
                <option value="funded">Funded</option>
                <option value="proposals">Proposals</option>
                <option value="all">All projects</option>
              </select>

              <select
                value={selectedRegion}
                onChange={(event) => setSelectedRegion(event.target.value)}
                className="h-8 w-full min-w-0 rounded-full border border-border bg-background px-2 pr-6 text-[11px] text-foreground outline-none transition-colors focus:border-primary sm:h-9 sm:px-3 sm:pr-8 sm:text-sm"
              >
                <option value="">Region</option>
                {projectRegionOptions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>

              <select
                value={selectedMunicipality}
                onChange={(event) => setSelectedMunicipality(event.target.value)}
                className="h-8 w-full min-w-0 rounded-full border border-border bg-background px-2 pr-6 text-[11px] text-foreground outline-none transition-colors focus:border-primary sm:h-9 sm:px-3 sm:pr-8 sm:text-sm"
              >
                <option value="">Municipality</option>
                {projectMunicipalityOptions.map((municipality) => (
                  <option key={municipality} value={municipality}>
                    {municipality}
                  </option>
                ))}
              </select>

              <select
                value={selectedBarangay}
                onChange={(event) => setSelectedBarangay(event.target.value)}
                className="h-8 w-full min-w-0 rounded-full border border-border bg-background px-2 pr-6 text-[11px] text-foreground outline-none transition-colors focus:border-primary sm:h-9 sm:px-3 sm:pr-8 sm:text-sm"
              >
                <option value="">Barangay</option>
                {projectBarangayOptions.map((barangay) => (
                  <option key={barangay} value={barangay}>
                    {barangay}
                  </option>
                ))}
              </select>

              <select
                value={selectedStatusType}
                onChange={(event) => setSelectedStatusType(event.target.value)}
                className="h-8 w-full min-w-0 rounded-full border border-border bg-background px-2 pr-6 text-[11px] text-foreground outline-none transition-colors focus:border-primary sm:h-9 sm:px-3 sm:pr-8 sm:text-sm"
              >
                <option value="">Status</option>
                {projectStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col items-start gap-2 text-xs leading-6 text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2.5">
              <span>
                Showing {filteredFundedProjects.length} {lifecycleLabel}
                {filteredFundedProjects.length === 1 ? "" : "s"}.
              </span>

              {hasProjectFilters && (
                <button
                  onClick={clearProjectFilters}
                  className="rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                >
                  Clear filters
                </button>
              )}
            </div>
            </div>

        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6" style={{ transform: "scale(0.9)", transformOrigin: "top center" }}>
        {filteredFundedProjects.length === 0 ? (
          <Card className="border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm font-medium text-foreground dark:text-zinc-200">{lifecycleTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {lifecycleHint}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {pagedFilteredFundedProjects.map((project) => {
              const projectId = String(project.id ?? "").trim();
              const isExpandedProject = Boolean(expandedProjects[projectId]);
              const selectedProjectChannel = projectChannelById[projectId] ?? "financial";
              const channelKey = makeProjectChannelKey(projectId, selectedProjectChannel);
              const channelQuery = (projectChannelQueryByKey[channelKey] ?? "").trim().toLowerCase();
              const issueOnly = Boolean(projectChannelIssueOnlyByKey[channelKey]);
              const selectedOfficeFilter = projectChannelOfficeFilterByKey[channelKey] ?? "all";
              const visibleCount = projectChannelVisibleCountByKey[channelKey] ?? 8;
              const allProjectPosts = getProjectChannelPosts(projectId, "global");
              const channelPosts = getProjectChannelPosts(projectId, selectedProjectChannel);
              const fundPosts = getProjectChannelPosts(projectId, "financial");
              const decisionPosts = getProjectChannelPosts(projectId, "decision");
              const officeOptionMap = channelPosts.reduce<Record<string, string>>((accumulator, post) => {
                const officeLabel = String(post.officeLabel ?? post.actorRole ?? "").trim() || "Unknown office";
                const officeKey = officeLabel.toLowerCase();

                if (!accumulator[officeKey]) {
                  accumulator[officeKey] = officeLabel;
                }

                return accumulator;
              }, {});
              const officeOptions = [
                { value: "all", label: "All offices" },
                ...Object.entries(officeOptionMap)
                  .map(([value, label]) => ({ value, label }))
                  .sort((left, right) => left.label.localeCompare(right.label)),
              ];
              const channelPostsFiltered = channelPosts.filter((post) => {
                const actionUpper = post.actionType.toUpperCase();
                const flaggedByAction = /REJECT|SUSPEND|FLAG|DISALLOW|AOM|FRAUD|TAMPER/.test(actionUpper);
                const hasIssueSignal = flaggedByAction || Boolean(post.isHighRisk);
                const postOfficeKey = String(post.officeLabel ?? post.actorRole ?? "").trim().toLowerCase() || "unknown office";

                if (selectedOfficeFilter !== "all" && postOfficeKey !== selectedOfficeFilter) {
                  return false;
                }

                if (issueOnly && !hasIssueSignal) {
                  return false;
                }

                if (!channelQuery) {
                  return true;
                }

                const searchable = [
                  post.projectName,
                  post.officeLabel,
                  post.actionLabel,
                  post.actionType,
                  post.decisionText,
                  post.milestoneName,
                  post.txHash,
                  post.region,
                  post.municipality,
                  post.barangay,
                ]
                  .filter(Boolean)
                  .join(" ")
                  .toLowerCase();

                return searchable.includes(channelQuery);
              });
              const visibleChannelPosts = channelPostsFiltered.slice(0, visibleCount);
              const realtime = getRealtimeProjectMetrics(projectId, project);
              const statusFingerprint = `${project.rawStatus ?? ""} ${project.status ?? ""}`.toUpperCase();
              const isProposalStage =
                /(PROPOSAL|PROPOSED|PENDING|SUBMIT|REVIEW|DRAFT|ENDORSE|VALIDAT|EVALUAT)/.test(statusFingerprint);
              const projectBudgetRecord = project as {
                rdcProposedBudget?: number;
                nationalFundedBudget?: number;
              };
              const proposalBudgetFromPosts = [...allProjectPosts]
                .filter((post) => {
                  const actionUpper = post.actionType.toUpperCase();
                  return ORIGINAL_RDC_PROPOSAL_ACTION_TYPES.has(actionUpper);
                })
                .sort((left, right) => left.sortKey - right.sortKey)
                .reduce((resolved, post) => {
                  if (resolved > 0) return resolved;
                  return (
                    toPositiveAmount(post.amount) ??
                    parsePesoAmountFromText(post.decisionText) ??
                    0
                  );
                }, 0);
              const fundedBudgetFromPosts = allProjectPosts.reduce((highest, post) => {
                const actionUpper = post.actionType.toUpperCase();
                const role = String(post.actorRole ?? "").toLowerCase();
                const isFundingSignal =
                  actionUpper === "PROJECT_FUNDED" ||
                  actionUpper === "PROPOSAL_FUNDED" ||
                  actionUpper === "NATIONAL_APPROVED" ||
                  actionUpper === "COMMIT_FUNDS" ||
                  actionUpper === "FUNDS_COMMITTED" ||
                  actionUpper.includes("FUNDED") ||
                  actionUpper.includes("NATIONAL_APPROVED");
                const isNationalActor =
                  role.includes("national") ||
                  role.includes("admin") ||
                  role.includes("dpwh");
                if (!isFundingSignal || !isNationalActor) return highest;

                const amount = toPositiveAmount(post.amount) ?? toPositiveAmount(post.fundedAmount) ?? 0;
                return amount > highest ? amount : highest;
              }, 0);
              const hasNationalFinalBudget = Boolean(toPositiveAmount(projectBudgetRecord.nationalFundedBudget));
              const proposalBudgetFromSchema = toPositiveAmount(projectBudgetRecord.rdcProposedBudget);
              const fallbackProposalBudget =
                isProposalStage
                  ? proposalBudgetFromSchema ?? toPositiveAmount(project.budget) ?? 0
                  : hasNationalFinalBudget
                    ? 0
                    : proposalBudgetFromSchema ?? 0;
              const rdcProposedBudgetValue =
                proposalBudgetFromSchema ||
                proposalBudgetFromPosts ||
                fallbackProposalBudget;
              const nationalFundedBudgetValue =
                toPositiveAmount(realtime.fundedAmount) ||
                fundedBudgetFromPosts ||
                toPositiveAmount(projectBudgetRecord.nationalFundedBudget) ||
                (isProposalStage ? 0 : toPositiveAmount(project.budget) ?? 0);
              const budgetVarianceValue =
                rdcProposedBudgetValue > 0 && nationalFundedBudgetValue > 0
                  ? nationalFundedBudgetValue - rdcProposedBudgetValue
                  : undefined;
              const projectStatusLabel = isProposalStage ? "Signed proposal by RDC" : "Funded by DPWH National";
              const projectStatusBadgeClass = isProposalStage
                ? "bg-amber-100/70 text-amber-800"
                : "bg-primary/15 text-primary";
              const verificationStatus = String(project.verificationStatus ?? "").toLowerCase();
              const isIntegrityTampered = verificationStatus === "tampered";
              const integrityCheckedLabel = toHumanTimestamp(project.lastVerified);
              const projectIntegritySnapshot = resolveProjectIntegrity(projectId);
              const regionLabel = normalizeRegionLabel(project.region || project.dpwhRegion || "") || "Unspecified region";
              const municipalityLabel = normalizeLocationValue(project.municipality) ?? "Unspecified city/municipality";
              const barangayLabel = normalizeLocationValue(project.barangay) ?? "Unspecified barangay";
              const monitorUrl = buildMonitorLink(project.trackingSlug, projectId);
              const qrImageUrl = buildQrImageUrl(monitorUrl) || project.qrCodeUrl;

              return (
                <article
                  key={projectId}
                  className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_10px_30px_-22px_rgba(15,23,42,0.35)] transition-shadow hover:shadow-[0_14px_34px_-20px_rgba(15,23,42,0.45)]"
                >
                  <div className="px-4 py-4 sm:px-5">
                  <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                    <div>
                      <p className="text-base font-semibold leading-6 text-foreground dark:text-zinc-200">{project.name}</p>
                      <p className="mt-0.5 text-xs leading-6 text-muted-foreground">{regionLabel} • {municipalityLabel} • {barangayLabel}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isIntegrityTampered
                              ? "bg-red-500/15 text-red-700 dark:text-red-300"
                              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {isIntegrityTampered ? <AlertCircle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                          {isIntegrityTampered ? "TAMPERED RECORD" : "INTEGRITY MATCHED"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Checked: {integrityCheckedLabel}</span>
                        <button
                          onClick={() => {
                            if (projectIntegritySnapshot) {
                              setSelectedIntegritySnapshot(projectIntegritySnapshot);
                            }
                          }}
                          disabled={!projectIntegritySnapshot}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                            projectIntegritySnapshot
                              ? "bg-primary/15 text-primary hover:bg-primary/25"
                              : "cursor-not-allowed bg-muted/60 text-muted-foreground"
                          }`}
                          title="Verify project integrity hashes"
                        >
                          <ShieldCheck className="h-3 w-3" /> Verify Project Hash
                        </button>
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${projectStatusBadgeClass}`}>
                      {projectStatusLabel}
                    </span>
                  </div>

                  <div className="mt-3.5 overflow-hidden rounded-xl border border-border/60 bg-background/70">
                    <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Budget Snapshot</p>
                      <span className="text-[10px] text-muted-foreground">Live context</span>
                    </div>

                    <div className="divide-y divide-border/60 text-xs">
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-3.5">
                        <span className="text-muted-foreground">RDC proposed budget</span>
                        <span className="text-right text-sm font-semibold text-foreground">
                          {rdcProposedBudgetValue > 0 ? formatPeso(rdcProposedBudgetValue) : "Not available"}
                        </span>
                      </div>

                      {!isProposalStage && nationalFundedBudgetValue > 0 && (
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-3.5">
                          <span className="text-muted-foreground">DPWH funded budget</span>
                          <span className="text-right text-sm font-semibold text-foreground">{formatPeso(nationalFundedBudgetValue)}</span>
                        </div>
                      )}

                      {!isProposalStage && budgetVarianceValue !== undefined && (
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-3.5">
                          <span className="text-muted-foreground">Funding variance</span>
                          <span className="text-right text-sm font-semibold text-foreground">
                            {budgetVarianceValue >= 0 ? "+" : "-"}
                            {formatPeso(Math.abs(budgetVarianceValue))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {qrImageUrl && monitorUrl && (
                    <details className="mt-3.5 rounded-xl border border-border/60 bg-background/70">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/40">
                        <span className="inline-flex items-center gap-1.5">
                          <QrCode className="h-3.5 w-3.5" /> Public Project QR
                        </span>
                        <span className="text-[11px] text-muted-foreground">Tap to expand</span>
                      </summary>

                      <div className="border-t border-border/60 p-3 pt-3">
                        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
                          <div className="relative h-28 w-28">
                            <img
                              src={qrImageUrl}
                              alt={`QR code for ${project.name}`}
                              className="h-28 w-28 rounded-md border border-border bg-white dark:bg-muted/70 p-1"
                              loading="lazy"
                            />

                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-sm">
                              <img
                                src={tapatChainLogo}
                                alt="TapaChain logo"
                                className="h-9 w-9 object-contain"
                                loading="lazy"
                              />
                            </div>
                          </div>

                          <div className="min-w-0 flex-1 space-y-2.5">
                            <a
                              href={monitorUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-xs text-primary hover:underline"
                              title={monitorUrl}
                            >
                              {monitorUrl}
                            </a>

                            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                              <a
                                href={monitorUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-foreground/10"
                              >
                                <ExternalLink className="h-3.5 w-3.5" /> Open monitor
                              </a>

                              <button
                                onClick={() => {
                                  void downloadQrCodeImage(qrImageUrl, `${projectId}-qr-code.png`);
                                }}
                                className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/25"
                              >
                                <Download className="h-3.5 w-3.5" /> Download QR
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </details>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => toggleProjectExpansion(projectId)}
                      className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-foreground/5 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/10 sm:w-auto"
                    >
                      {isExpandedProject ? "Hide details" : `Expand details (${allProjectPosts.length})`}
                    </button>
                  </div>
                  </div>

                  {isExpandedProject && (
                    <div className="space-y-4 border-t border-border/70 bg-background/80 px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap justify-center gap-2.5 sm:justify-start">
                        {[
                          { id: "financial" as const, label: "Budget & Releases", count: fundPosts.length },
                          { id: "global" as const, label: "Project Timeline", count: allProjectPosts.length },
                          { id: "decision" as const, label: "Approvals & Audits", count: decisionPosts.length },
                        ].map((pill) => {
                          const active = selectedProjectChannel === pill.id;
                          return (
                            <button
                              key={pill.id}
                              onClick={() => setProjectChannel(projectId, pill.id)}
                              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                active
                                  ? "bg-primary/15 text-primary shadow-sm"
                                    : "bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                              }`}
                            >
                              {pill.label}
                              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{pill.count}</span>
                            </button>
                          );
                        })}
                      </div>

                     

                      <div className="grid gap-2.5 sm:grid-cols-[1fr_auto_auto]">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="text"
                            value={projectChannelQueryByKey[channelKey] ?? ""}
                            onChange={(event) => setProjectChannelQuery(projectId, selectedProjectChannel, event.target.value)}
                            placeholder="Find transaction, tx hash, office, or keyword"
                            className="h-9 w-full rounded-full border border-border bg-card pl-9 pr-3 text-xs text-foreground outline-none transition-colors focus:border-primary"
                          />
                        </div>

                        <select
                          value={selectedOfficeFilter}
                          onChange={(event) => {
                            const nextOfficeFilter = event.target.value;
                            setProjectChannelOfficeFilterByKey((previous) => ({
                              ...previous,
                              [channelKey]: nextOfficeFilter,
                            }));
                            resetProjectChannelPostsView(projectId, selectedProjectChannel);
                          }}
                          className="h-9 rounded-full border border-border bg-card px-3 text-xs text-foreground outline-none transition-colors focus:border-primary"
                        >
                          {officeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => toggleProjectChannelIssueOnly(projectId, selectedProjectChannel)}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                            issueOnly
                              ? "bg-amber-100/70 text-amber-800"
                              : "bg-card text-muted-foreground hover:bg-background/80 hover:text-foreground"
                          }`}
                          title="Show only records with potential issues"
                        >
                          {issueOnly ? "Issues only: ON" : "Issues only"}
                        </button>
                      </div>

                      <p className="text-xs leading-6 text-muted-foreground">
                        Showing {Math.min(visibleChannelPosts.length, visibleCount)} of {channelPostsFiltered.length} records in this category.
                      </p>

                      {channelPostsFiltered.length === 0 ? (
                        <Card className="bg-card/80 p-7 text-center shadow-sm">
                          <p className="text-xs text-muted-foreground">No records found in this section for this project.</p>
                        </Card>
                      ) : (
                        <div className="space-y-3">
                          {visibleChannelPosts.map((post) => {
              const isGovernment = post.actorKind === "government";
              const decisionPath = isGovernment ? buildDecisionPath(post) : [];
              const isExpanded = Boolean(expandedPaths[post.id]);
              const isSpentAction = isSpentActionType(post.actionType);
              const isReleaseAction = isReleaseActionType(post.actionType);
              const isProposalBudgetAction = isProposalBudgetActionType(post.actionType);
              const proposalBudgetValue = rdcProposedBudgetValue;
              const approvedBudgetValue = toPositiveAmount(post.fundedAmount) ?? nationalFundedBudgetValue ?? 0;
              const spentEventValue = isSpentAction ? toPositiveAmount(post.amount) ?? 0 : 0;
              const releasedFundValue = isReleaseAction ? toPositiveAmount(post.amount) ?? toPositiveAmount(post.disbursedAmount) ?? 0 : 0;
              const spentProgressValue =
                approvedBudgetValue > 0
                  ? clampPercent((spentEventValue / approvedBudgetValue) * 100)
                  : clampPercent(Number(post.financialProgressPct ?? 0));
              const physicalProgressValue = clampPercent(
                Number.isFinite(Number(post.physicalProgressPct))
                  ? Number(post.physicalProgressPct)
                  : Number(post.progress ?? 0)
              );
              const gapValue = spentProgressValue - physicalProgressValue;
              const highRisk = gapValue > HIGH_RISK_GAP_THRESHOLD_PCT;
              const locationParts = [post.barangay, post.municipality, post.region].filter(Boolean);
              const locationSummary = locationParts.length > 0 ? locationParts.join(", ") : post.locationText ?? "No location";
              const regionLabel = normalizeLocationValue(post.region) ?? "Unspecified region";
              const municipalityLabel = normalizeLocationValue(post.municipality) ?? "Unspecified city/municipality";
              const barangayLabel = normalizeLocationValue(post.barangay) ?? "Unspecified barangay";
              const actionTag = post.actionType.toLowerCase().replace(/_/g, "-");
              const citizenCategory = getCitizenCategoryLabel(post);
              const canVerifyOnChain = Boolean(post.txHash && isRealTxHash(post.txHash));
              const txUrl = canVerifyOnChain ? getEtherscanLink(post.txHash as string) : undefined;
              const milestoneIntegritySnapshot = resolveMilestoneIntegrity(post.milestoneId);
              const transactionIntegritySnapshot = resolveTransactionIntegrity(projectId, post.txHash);
              const manualIntegritySnapshot = transactionIntegritySnapshot ?? milestoneIntegritySnapshot ?? projectIntegritySnapshot;
              const actorHandle = post.officeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18) || "citizen";
              const hasDecisionContext = decisionPath.some((step) => step.complete || Boolean(step.signature));
              const showFundingSnapshot = isGovernment && shouldShowFundingMetrics(post.actionType);
              const showTotalFundMetric = showFundingSnapshot && approvedBudgetValue > 0;
              const showSpentMetrics = showFundingSnapshot && isSpentAction && spentEventValue > 0;
              const showReleasedMetric = showFundingSnapshot && isReleaseAction && releasedFundValue > 0;
              const showProposalMetric = isGovernment && isProposalBudgetAction && proposalBudgetValue > 0;
              const showComparisonMetric =
                showFundingSnapshot &&
                proposalBudgetValue > 0 &&
                approvedBudgetValue > 0 &&
                Math.abs(approvedBudgetValue - proposalBudgetValue) > 0;
              const showFundingBlock =
                showTotalFundMetric || showSpentMetrics || showReleasedMetric || showProposalMetric || showComparisonMetric;

              return (
                <article
                  key={post.id}
                  className="rounded-2xl border border-border/70 bg-card/95 px-4 py-4 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.45)] transition-shadow hover:shadow-[0_14px_28px_-18px_rgba(15,23,42,0.5)] sm:px-5"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 ${
                        isGovernment
                          ? "bg-primary/12 text-primary"
                          : "bg-muted/90 text-foreground"
                      }`}
                    >
                      {isGovernment ? (
                        post.actorRole.toLowerCase().includes("coa") || post.actorRole.toLowerCase().includes("auditor") ? (
                          <ShieldCheck className="h-4 w-4" />
                        ) : (
                          <Building2 className="h-4 w-4" />
                        )
                      ) : (
                        <UserCircle2 className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5">
                        <span className="truncate text-sm font-semibold text-foreground">{post.officeLabel}</span>
                        <span className="text-muted-foreground/90">@{actorHandle}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground/90">
                          <Clock3 className="h-3 w-3" />
                          {toHumanTimestamp(new Date(post.sortKey).toISOString())}
                        </span>
                        {post.txHash && (
                          <span className="rounded-full border border-border/60 bg-muted/55 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            TX {truncateHex(post.txHash)}
                          </span>
                        )}
                        {isGovernment ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-primary">
                            <BadgeCheck className="h-3 w-3" /> Official
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/65 px-2 py-0.5 text-foreground">
                            <CheckCircle2 className="h-3 w-3" /> Citizen
                          </span>
                        )}
                      </div>

                      <p className="text-[15px] leading-6 text-foreground/95">
                        <span className="font-semibold">{post.projectName}</span> — {post.actionLabel}.
                      </p>

                      {showFundingBlock && (
                        <div className="grid grid-cols-1 gap-x-3 gap-y-2 rounded-2xl border border-border/60 bg-background/70 px-3 py-3 text-xs leading-6 text-muted-foreground sm:grid-cols-3">
                          {showTotalFundMetric && (
                            <div className="flex items-center justify-between gap-2">
                              <span>DPWH funded</span>
                              <span className="font-medium text-foreground">{formatPeso(approvedBudgetValue)}</span>
                            </div>
                          )}

                          {showProposalMetric && (
                            <div className="flex items-center justify-between gap-2">
                              <span>RDC proposal</span>
                              <span className="font-medium text-foreground">{formatPeso(proposalBudgetValue)}</span>
                            </div>
                          )}

                          {showComparisonMetric && (
                            <div className="flex items-center justify-between gap-2">
                              <span>Variance</span>
                              <span className="font-medium text-foreground">
                                {approvedBudgetValue - proposalBudgetValue >= 0 ? "+" : "-"}
                                {formatPeso(Math.abs(approvedBudgetValue - proposalBudgetValue))}
                              </span>
                            </div>
                          )}

                          {showSpentMetrics && (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span>Spent fund</span>
                                <span className="font-medium text-foreground">{formatPeso(spentEventValue)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span>Spent (%)</span>
                                <span className="font-medium text-foreground">{spentProgressValue.toFixed(2)}%</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span>Work completed (%)</span>
                                <span className="font-medium text-foreground">{physicalProgressValue.toFixed(2)}%</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span>Gap (%)</span>
                                <span className="font-medium text-foreground">{gapValue >= 0 ? "+" : ""}{gapValue.toFixed(2)}%</span>
                              </div>
                            </>
                          )}

                          {showReleasedMetric && (
                            <div className="flex items-center justify-between gap-2">
                              <span>Released fund</span>
                              <span className="font-medium text-foreground">{formatPeso(releasedFundValue)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {post.decisionText && (
                        <p className="rounded-2xl bg-muted/35 px-3 py-2.5 text-sm leading-7 text-muted-foreground">{post.decisionText}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 text-xs leading-6">
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-medium text-primary">
                          Category: {citizenCategory}
                        </span>

                        {showSpentMetrics && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${
                              highRisk
                                ? "border-amber-200/90 bg-amber-100/70 text-amber-800"
                                : "border-emerald-200/90 bg-emerald-100/70 text-emerald-800"
                            }`}
                          >
                            {highRisk ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {highRisk ? "NEEDS ATTENTION" : "ON TRACK"}
                          </span>
                        )}

                        {post.statusType && (
                          <button
                            onClick={() => setSelectedStatusType(post.statusType ?? "")}
                            className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted/90 hover:text-foreground"
                            title="Filter by status"
                          >
                            Status: {post.statusType}
                          </button>
                        )}

                        <button
                          onClick={() => setSearchQuery(post.projectName)}
                          className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted/90 hover:text-foreground"
                          title="Filter by project"
                        >
                          Project: {post.projectName}
                        </button>

                        <button
                          onClick={() => setSearchQuery(post.actionType)}
                          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted/90 hover:text-foreground"
                          title="Search by update type"
                        >
                          <Hash className="h-3 w-3" /> #{actionTag}
                        </button>

                        <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-muted-foreground">Region: {regionLabel}</span>
                        <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-muted-foreground">City/Municipality: {municipalityLabel}</span>
                        <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-muted-foreground">Barangay: {barangayLabel}</span>
                        {!post.region && !post.municipality && !post.barangay && (
                          <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-muted-foreground">{locationSummary}</span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 border-t border-border/60 pt-2.5 text-xs leading-6 text-muted-foreground">
                        <button
                          onClick={() => routeToCommunityComposer(post, "feedback")}
                          className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 transition-colors hover:bg-muted/60 hover:text-foreground"
                          title="Open feedback form"
                        >
                          <MessageSquareQuote className="h-3.5 w-3.5" /> Give feedback
                        </button>

                        <button
                          onClick={() => routeToCommunityComposer(post, "reports")}
                          className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 transition-colors hover:bg-muted/60 hover:text-foreground"
                          title="Open report form"
                        >
                          <AlertCircle className="h-3.5 w-3.5" /> Report
                        </button>

                        <button
                          onClick={() => {
                            setProjectChannel(projectId, "global");
                          }}
                          className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 transition-colors hover:bg-muted/60 hover:text-foreground"
                          title="Open full project history"
                        >
                          <Heart className="h-3.5 w-3.5" /> Full history
                        </button>

                        <button
                          onClick={() => {
                            if (manualIntegritySnapshot) {
                              setSelectedIntegritySnapshot(manualIntegritySnapshot);
                            }
                          }}
                          disabled={!manualIntegritySnapshot}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
                            manualIntegritySnapshot
                              ? "bg-primary/12 text-primary hover:bg-primary/20"
                              : "cursor-not-allowed bg-background/70 opacity-60"
                          }`}
                          title="Manually compare off-chain and on-chain hashes for this update"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Manual compare
                        </button>

                        <button
                          onClick={() => {
                            if (projectIntegritySnapshot) {
                              setSelectedIntegritySnapshot(projectIntegritySnapshot);
                            }
                          }}
                          disabled={!projectIntegritySnapshot}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
                            projectIntegritySnapshot
                              ? "bg-background/70 hover:bg-muted/60 hover:text-foreground"
                              : "cursor-not-allowed bg-background/70 opacity-60"
                          }`}
                          title="Check project off-chain vs on-chain hash"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Verify project
                        </button>

                        <button
                          onClick={() => {
                            if (milestoneIntegritySnapshot) {
                              setSelectedIntegritySnapshot(milestoneIntegritySnapshot);
                            }
                          }}
                          disabled={!milestoneIntegritySnapshot}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
                            milestoneIntegritySnapshot
                              ? "bg-background/70 hover:bg-muted/60 hover:text-foreground"
                              : "cursor-not-allowed bg-background/70 opacity-60"
                          }`}
                          title="Check milestone off-chain vs on-chain hash"
                        >
                          <Hash className="h-3.5 w-3.5" /> Verify milestone
                        </button>

                        <button
                          onClick={() => {
                            if (transactionIntegritySnapshot) {
                              setSelectedIntegritySnapshot(transactionIntegritySnapshot);
                            }
                          }}
                          disabled={!transactionIntegritySnapshot}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
                            transactionIntegritySnapshot
                              ? "bg-background/70 hover:bg-muted/60 hover:text-foreground"
                              : "cursor-not-allowed bg-background/70 opacity-60"
                          }`}
                          title="Check transaction off-chain vs on-chain hash"
                        >
                          <Hash className="h-3.5 w-3.5" /> Verify transaction
                        </button>

                        {canVerifyOnChain && txUrl ? (
                          <a
                            href={txUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 transition-colors hover:bg-muted/60 hover:text-foreground"
                            title="View on Etherscan"
                          >
                            <Share2 className="h-3.5 w-3.5" /> View on Etherscan <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 opacity-60">
                            <Share2 className="h-3.5 w-3.5" /> No chain link
                          </span>
                        )}

                        {isGovernment && hasDecisionContext && (
                          <button
                            onClick={() => {
                              togglePath(post.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 transition-colors hover:bg-muted/60 hover:text-foreground"
                            title="Show approval path"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> {isExpanded ? "Hide path" : "View path"}
                          </button>
                        )}
                      </div>

                      {isGovernment && isExpanded && (
                        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4 text-xs leading-6">
                          {decisionPath.map((step) => (
                            <div key={step.key} className="rounded-xl border border-border/60 bg-card/80 px-3 py-2">
                              <p className="font-semibold text-foreground dark:text-zinc-200">{step.title}</p>
                              <p className="text-muted-foreground leading-6">{step.detail}</p>
                              <p className="mt-1.5 text-muted-foreground">
                                Time: {toHumanTimestamp(step.timestamp)} • Wallet: {truncateHex(step.wallet)} • Signature: {truncateHex(step.signature)}
                                {step.blockNumber ? ` • Block #: ${step.blockNumber}` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}

                          {channelPostsFiltered.length > visibleCount && (
                            <div className="flex justify-center px-4 py-1">
                              <button
                                onClick={() => showMoreProjectChannelPosts(projectId, selectedProjectChannel)}
                                className="rounded-full bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/10"
                              >
                                Load 8 more records
                              </button>
                            </div>
                          )}

                          {channelPostsFiltered.length > 8 && visibleCount > 8 && (
                            <div className="flex justify-center px-4 py-1">
                              <button
                                onClick={() => resetProjectChannelPostsView(projectId, selectedProjectChannel)}
                                className="rounded-full bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                              >
                                Show fewer
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}

            <PaginationControls
              page={Math.min(projectPage, projectTotalPages)}
              totalPages={projectTotalPages}
              onPageChange={setProjectPage}
            />
          </div>
        )}
      </div>

      {selectedIntegritySnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Integrity Verification</p>
                <p className="text-xs text-muted-foreground">{selectedIntegritySnapshot.title}</p>
              </div>
              <button
                onClick={() => setSelectedIntegritySnapshot(null)}
                className="rounded-full bg-foreground/5 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-foreground/10"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-muted-foreground">
                  Type: {selectedIntegritySnapshot.recordType}
                </span>
                <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-muted-foreground">
                  Record ID: {selectedIntegritySnapshot.recordId}
                </span>
                {selectedIntegritySnapshot.txHash && (
                  <span className="rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-muted-foreground">
                    TX: {truncateHex(selectedIntegritySnapshot.txHash)}
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${getIntegrityBadgeClass(
                    selectedIntegritySnapshot.integrityStatus
                  )}`}
                >
                  {selectedIntegritySnapshot.integrityStatus}
                </span>
              </div>

              {selectedIntegritySnapshot.txHash && (
                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Etherscan Transaction Hash</p>
                  <p className="mt-2 break-all rounded-md bg-muted/50 px-2 py-1.5 font-mono text-[11px] text-foreground">
                    {selectedIntegritySnapshot.txHash}
                  </p>
                  {isRealTxHash(selectedIntegritySnapshot.txHash) && (
                    <a
                      href={getEtherscanLink(selectedIntegritySnapshot.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-foreground/10"
                      title="Open transaction on Etherscan"
                    >
                      View on Etherscan <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">On-chain Anchor (Tx Hash)</p>
                  <p className="mt-2 break-all rounded-md bg-muted/50 px-2 py-1.5 font-mono text-[11px] text-foreground">
                    {selectedIntegritySnapshot.onChainHash || "No on-chain anchor"}
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Off-chain Hash</p>
                  <p className="mt-2 break-all rounded-md bg-muted/50 px-2 py-1.5 font-mono text-[11px] text-foreground">
                    {selectedIntegritySnapshot.offChainHash || "No off-chain snapshot"}
                  </p>
                </div>
              </div>

              <div
                className={`rounded-xl border p-3 text-xs leading-6 ${
                  selectedIntegritySnapshot.integrityStatus === "MATCHED"
                    ? "border-emerald-300/70 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                    : selectedIntegritySnapshot.integrityStatus === "TAMPERED"
                      ? "border-red-300/70 bg-red-500/10 text-red-800 dark:text-red-300"
                      : "border-amber-300/70 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                }`}
              >
                <p className="font-semibold">Verification Result</p>
                <p>{getIntegrityResultMessage(selectedIntegritySnapshot)}</p>
                <p className="mt-1 text-[11px] opacity-90">
                  Manual compare: {selectedIntegritySnapshot.isMatch ? "MATCH" : "MISMATCH"}
                </p>
                <p className="mt-1 text-[11px] opacity-90">
                  Checked: {toHumanTimestamp(selectedIntegritySnapshot.checkedAt)}
                  {selectedIntegritySnapshot.tamperedAt ? ` • Tampered at: ${toHumanTimestamp(selectedIntegritySnapshot.tamperedAt)}` : ""}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



