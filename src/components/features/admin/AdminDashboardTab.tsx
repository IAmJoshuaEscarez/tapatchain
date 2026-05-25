import { useState } from "react";
import { MobileCollapse } from "@/components/ui/mobile-collapse";
import {
  ChevronDown,
  ChevronUp,
  Search,
  X,
} from "lucide-react";
import type { RDCProject } from "@/context/ProjectContext";
import type { AuditEntry } from "@/context/AuditTrailContext";
import { buildProjectSpentByMilestones } from "@/lib/utils";
import {
  HIGH_RISK_GAP_THRESHOLD_PCT,
  useFinancialPhysicalIntegrity,
  type IntegrityMilestoneSnapshot,
} from "@/features/project";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PAGE_SIZE = 5;

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

const FINANCE_ALLOCATED_COLOR = "rgba(37, 99, 235, 0.30)";
const FINANCE_DISBURSED_COLOR = "rgba(13, 148, 136, 0.52)";
const PROGRESS_FINANCIAL_COLOR = "rgba(37, 99, 235, 0.52)";
const PROGRESS_PHYSICAL_COLOR = "rgba(22, 163, 74, 0.52)";
const PROGRESS_ANOMALY_COLOR = "rgba(225, 29, 72, 0.58)";

const FUNDED_PROJECT_STATUSES = new Set<RDCProject["status"]>([
  "FUNDED",
  "FUNDED_AND_ACTIVE",
  "PERSONNEL_ASSIGNED",
  "ONGOING",
]);

const PENDING_FUNDING_STATUSES = new Set<RDCProject["status"]>([
  "PROPOSED",
  "PROPOSAL_SUBMITTED",
  "PROPOSAL_APPROVED",
  "SUBMITTED_TO_NATIONAL",
]);

function isFundedLifecycleProject(project: RDCProject): boolean {
  return FUNDED_PROJECT_STATUSES.has(project.status);
}

function isPendingFundingProject(project: RDCProject): boolean {
  return PENDING_FUNDING_STATUSES.has(project.status);
}

function parseBudget(value?: string | null): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAllocatedBudget(project: RDCProject): number {
  return parseBudget(project.finalApprovedBudget || project.approvedBudget);
}

function fmtPhp(value: number): string {
  if (value >= 1e9) return `PHP ${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `PHP ${(value / 1e6).toFixed(1)}M`;
  return `PHP ${value.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatAxisPhp(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return `${Math.round(value)}`;
}

function formatAxisPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function getProjectProgressPercent(project: RDCProject): number {
  const rawCurrent = Number(project.currentProgress ?? 0);
  if (!Number.isFinite(rawCurrent) || rawCurrent <= 0) return 0;

  const rawTarget = Number(project.targetPercent ?? 100);
  const safeTarget = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : 100;

  if (rawCurrent <= 1) {
    if (safeTarget <= 1) return clampPercent((rawCurrent / safeTarget) * 100);
    return clampPercent(rawCurrent * 100);
  }

  if (rawCurrent <= 100) return clampPercent(rawCurrent);
  return clampPercent((rawCurrent / safeTarget) * 100);
}

function getMilestoneProgressPercent(project: RDCProject, milestoneSpent: number): number {
  const reportedProgress = getProjectProgressPercent(project);
  if (reportedProgress > 0) return reportedProgress;

  const budget = getAllocatedBudget(project);
  if (!Number.isFinite(milestoneSpent) || milestoneSpent <= 0 || budget <= 0) {
    return 0;
  }

  return clampPercent((milestoneSpent / budget) * 100);
}

function maskWalletAddress(wallet?: string): string {
  const value = String(wallet ?? "").trim();
  if (!value) return "No wallet assigned";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function toOrdinal(value: number): string {
  if (value % 100 >= 11 && value % 100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

interface RegionStat {
  region: string;
  total: number;
  funded: number;
  pending: number;
  totalBudget: number;
  fundedBudget: number;
  financialProgressPct: number;
  physicalProgressPct: number;
  gapPct: number;
  isHighRisk: boolean;
  activityCount: number;
  avgActivity: number;
}

export interface AdminDashboardTabProps {
  projects: RDCProject[];
  auditEntries: AuditEntry[];
  milestones?: IntegrityMilestoneSnapshot[];
  dashboardSortMode: "budget" | "projects" | "activity";
  setDashboardSortMode: (m: "budget" | "projects" | "activity") => void;
  expandedRegion: string | null;
  setExpandedRegion: (r: string | null) => void;
  regionPage: number;
  setRegionPage: (p: number | ((prev: number) => number)) => void;
  regionSearch: string;
  setRegionSearch: (s: string) => void;
  proposalInboxCount: number;
  projectInboxCount: number;
  setActiveTab: (tab: "dashboard" | "proposals" | "funded" | "flags" | "audit" | "users") => void;
}

export function AdminDashboardTab({
  projects,
  auditEntries,
  milestones = [],
  dashboardSortMode,
  setDashboardSortMode,
  expandedRegion,
  setExpandedRegion,
  regionPage,
  setRegionPage,
  regionSearch,
  setRegionSearch,
  proposalInboxCount,
  projectInboxCount,
  setActiveTab,
}: AdminDashboardTabProps) {
  const spentByProjectId = buildProjectSpentByMilestones(milestones);

  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedMunicipality, setSelectedMunicipality] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");

  const regionOptions = Array.from(
    new Set(
      projects
        .map((project) => String(project.dpwhRegion ?? "").trim())
        .filter(Boolean)
    )
  ).sort();

  const regionScopedProjects = selectedRegion
    ? projects.filter((project) => project.dpwhRegion === selectedRegion)
    : projects;

  const municipalityOptions = Array.from(
    new Set(
      regionScopedProjects
        .map((project) => String(project.municipality ?? "").trim())
        .filter(Boolean)
    )
  ).sort();

  const municipalityScopedProjects = selectedMunicipality
    ? regionScopedProjects.filter((project) => project.municipality === selectedMunicipality)
    : regionScopedProjects;

  const barangayOptions = Array.from(
    new Set(
      municipalityScopedProjects
        .map((project) => String(project.barangay ?? "").trim())
        .filter(Boolean)
    )
  ).sort();

  const searchQuery = regionSearch.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => {
    const regionValue = String(project.dpwhRegion ?? "").trim();
    const municipalityValue = String(project.municipality ?? "").trim();
    const barangayValue = String(project.barangay ?? "").trim();
    const provinceValue = String(project.province ?? "").trim();
    const titleValue = String(project.title ?? "").trim();

    const matchesRegion = selectedRegion === "" || regionValue === selectedRegion;
    const matchesMunicipality =
      selectedMunicipality === "" || municipalityValue === selectedMunicipality;
    const matchesBarangay = selectedBarangay === "" || barangayValue === selectedBarangay;

    if (!matchesRegion || !matchesMunicipality || !matchesBarangay) return false;
    if (!searchQuery) return true;

    const haystack = [titleValue, regionValue, municipalityValue, barangayValue, provinceValue]
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchQuery);
  });

  const filteredRegions = Array.from(
    new Set(
      filteredProjects
        .map((project) => String(project.dpwhRegion ?? "").trim())
        .filter(Boolean)
    )
  ).sort();

  const {
    regionMetrics,
    regionMetricByRegion,
    highRiskProjectCount,
    highRiskRegionCount,
  } = useFinancialPhysicalIntegrity({ projects: filteredProjects, milestones });

  const hasIntegrityData = regionMetrics.length > 0;

  const budgetOverviewData = regionMetrics.map((metric) => ({
    region: metric.region,
    allocatedBudget: metric.allocatedBudget,
    disbursedAmount: metric.disbursedAmount,
    remainingBudget: Math.max(0, metric.allocatedBudget - metric.disbursedAmount),
    isHighRisk: metric.isHighRisk,
  }));

  const progressMonitorData = regionMetrics.map((metric) => ({
    region: metric.region,
    financialProgressPct: metric.financialProgressPct,
    physicalProgressPct: metric.physicalProgressPct,
    gapPct: metric.gapPct,
    isHighRisk: metric.isHighRisk,
    verifiedMilestones: metric.verifiedMilestones,
    totalMilestones: metric.totalMilestones,
  }));

  const progressDomainMax = Math.max(
    100,
    ...progressMonitorData.map((row) => Math.max(row.financialProgressPct, row.physicalProgressPct))
  );

  const pipelineAll = filteredProjects.filter((project) => project.status !== "PROPOSAL_DRAFT");
  const pipelineApproved = filteredProjects.filter((project) =>
    [
      "PROPOSAL_APPROVED",
      "SUBMITTED_TO_NATIONAL",
      "FUNDED",
      "FUNDED_AND_ACTIVE",
      "PERSONNEL_ASSIGNED",
      "ONGOING",
    ].includes(project.status)
  );
  const pipelineFunded = filteredProjects.filter((project) => isFundedLifecycleProject(project));
  const pipelineRejected = filteredProjects.filter((project) =>
    ["PROPOSAL_REJECTED", "REJECTED"].includes(project.status)
  );

  const filteredProposalInboxCount = filteredProjects.filter((project) =>
    isPendingFundingProject(project)
  ).length;
  const filteredProjectInboxCount = filteredProjects.length === 0 ? 0 : projectInboxCount;

  const approvalRate =
    pipelineAll.length > 0 ? Math.round((pipelineApproved.length / pipelineAll.length) * 100) : 0;

  const totalBudgetAll = filteredProjects.reduce((sum, project) => sum + getAllocatedBudget(project), 0);
  const totalFunded = pipelineFunded.length;
  const fundedBudget = pipelineFunded.reduce((sum, project) => sum + getAllocatedBudget(project), 0);
  const pendingBudget = filteredProjects
    .filter((project) => isPendingFundingProject(project))
    .reduce((sum, project) => sum + getAllocatedBudget(project), 0);
  const disbursedBudget = regionMetrics.reduce((sum, region) => sum + region.disbursedAmount, 0);

  const regionStats: RegionStat[] = filteredRegions.map((region) => {
    const regionProjects = filteredProjects.filter((project) => project.dpwhRegion === region);
    const funded = regionProjects.filter((project) => isFundedLifecycleProject(project));
    const pending = regionProjects.filter((project) => isPendingFundingProject(project));

    const totalBudget = regionProjects.reduce((sum, project) => sum + getAllocatedBudget(project), 0);
    const fundedBudgetByRegion = funded.reduce((sum, project) => sum + getAllocatedBudget(project), 0);

    const fallbackFinancialProgress =
      totalBudget > 0
        ? clampPercent(
            (funded.reduce((sum, project) => sum + Number(spentByProjectId[project.id] ?? 0), 0) / totalBudget) *
              100
          )
        : 0;

    const fallbackPhysicalProgress =
      funded.length > 0
        ? clampPercent(
            funded.reduce((sum, project) => sum + getProjectProgressPercent(project), 0) / funded.length
          )
        : 0;

    const integrityMetric = regionMetricByRegion[region];
    const financialProgressPct = integrityMetric
      ? clampPercent(integrityMetric.financialProgressPct)
      : fallbackFinancialProgress;
    const physicalProgressPct = integrityMetric
      ? clampPercent(integrityMetric.physicalProgressPct)
      : fallbackPhysicalProgress;
    const gapPct = integrityMetric ? integrityMetric.gapPct : financialProgressPct - physicalProgressPct;
    const isHighRisk = integrityMetric ? integrityMetric.isHighRisk : gapPct > HIGH_RISK_GAP_THRESHOLD_PCT;

    const regionProjectIds = new Set(regionProjects.map((project) => project.id));
    const activityCount = auditEntries.filter((entry) => regionProjectIds.has(entry.projectId)).length;
    const avgActivity = regionProjects.length > 0 ? activityCount / regionProjects.length : 0;

    return {
      region,
      total: regionProjects.length,
      funded: funded.length,
      pending: pending.length,
      totalBudget,
      fundedBudget: fundedBudgetByRegion,
      financialProgressPct,
      physicalProgressPct,
      gapPct,
      isHighRisk,
      activityCount,
      avgActivity,
    };
  });

  const sortedStats = [...regionStats].sort((left, right) =>
    dashboardSortMode === "budget"
      ? right.totalBudget - left.totalBudget
      : dashboardSortMode === "projects"
      ? right.total - left.total
      : right.avgActivity - left.avgActivity
  );

  const filteredStats = sortedStats;

  const pageCount = Math.ceil(filteredStats.length / PAGE_SIZE);
  const safeRegionPage = Math.max(0, Math.min(regionPage, Math.max(0, pageCount - 1)));
  const pagedStats = filteredStats.slice(
    safeRegionPage * PAGE_SIZE,
    (safeRegionPage + 1) * PAGE_SIZE
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-45">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search region, project, municipality..."
              value={regionSearch}
              onChange={(event) => {
                setRegionSearch(event.target.value);
                setRegionPage(0);
                setExpandedRegion(null);
              }}
              className="w-full pl-8 pr-3 py-1.5 text-[11px] border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
            />
            {regionSearch && (
              <button
                onClick={() => {
                  setRegionSearch("");
                  setRegionPage(0);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="relative w-full sm:w-auto">
            <select
              value={selectedRegion}
              onChange={(event) => {
                setSelectedRegion(event.target.value);
                setSelectedMunicipality("");
                setSelectedBarangay("");
                setRegionPage(0);
                setExpandedRegion(null);
              }}
              className="appearance-none w-full sm:min-w-35 pl-3 pr-7 py-1.5 text-[11px] border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer truncate"
            >
              <option value="">All Regions</option>
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>

          <div className="relative w-full sm:w-auto">
            <select
              value={selectedMunicipality}
              onChange={(event) => {
                setSelectedMunicipality(event.target.value);
                setSelectedBarangay("");
                setRegionPage(0);
                setExpandedRegion(null);
              }}
              className="appearance-none w-full sm:min-w-35 pl-3 pr-7 py-1.5 text-[11px] border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer truncate"
            >
              <option value="">All Municipalities</option>
              {municipalityOptions.map((municipality) => (
                <option key={municipality} value={municipality}>
                  {municipality}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>

          <div className="relative w-full sm:w-auto">
            <select
              value={selectedBarangay}
              onChange={(event) => {
                setSelectedBarangay(event.target.value);
                setRegionPage(0);
                setExpandedRegion(null);
              }}
              className="appearance-none w-full sm:min-w-35 pl-3 pr-7 py-1.5 text-[11px] border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer truncate"
            >
              <option value="">All Barangays</option>
              {barangayOptions.map((barangay) => (
                <option key={barangay} value={barangay}>
                  {barangay}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>

          <span className="text-[10px] text-muted-foreground">
            {filteredStats.length} result{filteredStats.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-800">
              Financial vs. Physical Integrity Monitor
            </p>
            <p className="mt-1 text-[11px] text-slate-600">
              High Risk rule: mark as over-disbursement when Financial Progress is greater than
              Physical Progress + {HIGH_RISK_GAP_THRESHOLD_PCT}%.
            </p>
          </div>
          <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Current Flags</p>
            <p className="text-sm font-bold text-slate-900">
              {highRiskRegionCount} region{highRiskRegionCount !== 1 ? "s" : ""} / {highRiskProjectCount} project
              {highRiskProjectCount !== 1 ? "s" : ""}
            </p>
            <button
              onClick={() => setActiveTab("flags")}
              className="mt-1 text-[10px] font-semibold text-primary hover:underline"
            >
              View flagged projects
            </button>
          </div>
        </div>
      </div>

      <MobileCollapse title="KPI Overview" defaultOpen>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="col-span-2 lg:col-span-1 rounded-xl border border-border bg-card p-3 sm:p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Total Portfolio
            </p>
            <p className="text-2xl sm:text-3xl font-black text-foreground leading-none">
              {fmtPhp(totalBudgetAll)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-2">
              {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""} across {filteredRegions.length} region
              {filteredRegions.length !== 1 ? "s" : ""}
            </p>
            <div className="mt-3 h-1.5 rounded-full overflow-hidden bg-muted flex">
              <div
                className="bg-primary h-full transition-all duration-700"
                style={{
                  width: totalBudgetAll > 0 ? `${(fundedBudget / totalBudgetAll) * 100}%` : "0%",
                }}
              />
              <div
                className="bg-primary/30 h-full transition-all duration-700"
                style={{
                  width: totalBudgetAll > 0 ? `${(pendingBudget / totalBudgetAll) * 100}%` : "0%",
                }}
              />
            </div>
            <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                Funded {fmtPhp(fundedBudget)}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/30 inline-block" />
                Pending {fmtPhp(pendingBudget)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 sm:p-5 flex flex-col">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Approval Rate
            </p>
            <p className="text-2xl sm:text-3xl font-black text-foreground leading-none">
              {approvalRate}
              <span className="text-lg font-bold text-muted-foreground">%</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-2">
              {pipelineApproved.length} of {pipelineAll.length} proposals
            </p>
            <div className="mt-auto pt-3 h-1.5 rounded-full overflow-hidden bg-muted">
              <div
                className="bg-primary h-full rounded-full transition-all duration-700"
                style={{ width: `${approvalRate}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Funded and Active
            </p>
            <p className="text-2xl sm:text-3xl font-black text-foreground leading-none">{totalFunded}</p>
            <p className="text-[11px] text-muted-foreground mt-2">{fmtPhp(disbursedBudget)} disbursed</p>
            <p className="text-[10px] text-muted-foreground mt-2">
              {pipelineRejected.length > 0 ? `${pipelineRejected.length} rejected` : "No rejections"}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Needs Action
            </p>
            <p className="text-2xl sm:text-3xl font-black text-foreground leading-none">
              {filteredProposalInboxCount + filteredProjectInboxCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-2">
              {filteredProposalInboxCount} proposal{filteredProposalInboxCount !== 1 ? "s" : ""} awaiting review and funding
            </p>
            <div className="flex flex-col gap-1 mt-2">
              {filteredProposalInboxCount > 0 && (
                <button
                  onClick={() => setActiveTab("proposals")}
                  className="text-[10px] font-semibold text-primary hover:underline text-left"
                >
                  Review and fund proposals
                </button>
              )}
            </div>
          </div>
        </div>
      </MobileCollapse>

      <MobileCollapse title="Integrity Visualizations" defaultOpen>
        {!hasIntegrityData ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-sm font-semibold text-slate-800">No regional integrity data available yet.</p>
            <p className="mt-1 text-xs text-slate-500">
              Data will appear once projects and milestones are synced.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
              <section className="h-full rounded-2xl border border-slate-200/90 bg-linear-to-b from-white to-slate-50/60 p-4 sm:p-5">
                <div className="mb-3 min-h-14 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-800">
                      1) National Financial Overview
                    </p>
                    <p className="mt-1 max-w-[44ch] text-[11px] leading-relaxed text-slate-500">
                      Grouped bar comparison of allocated ceiling versus disbursed amount per region.
                    </p>
                  </div>
                </div>

                <div className="h-72 sm:h-80 pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={budgetOverviewData}
                      margin={{ top: 8, right: 12, left: -6, bottom: 10 }}
                      barGap={2}
                      barCategoryGap="14%"
                    >
                      <CartesianGrid {...CHART_GRID_PROPS} vertical={false} />
                      <XAxis
                        dataKey="region"
                        tick={CHART_AXIS_TICK}
                        tickMargin={8}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={formatAxisPhp}
                        tick={CHART_AXIS_TICK}
                        width={44}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(148,163,184,0.08)" }}
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: number, key: string) => {
                          if (key === "allocatedBudget") return [fmtPhp(value), "Allocated Budget"];
                          if (key === "disbursedAmount") return [fmtPhp(value), "Disbursed Amount"];
                          return [fmtPhp(value), key];
                        }}
                      />
                      <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} />
                      <Bar
                        dataKey="allocatedBudget"
                        name="Allocated Budget"
                        className="dashboard-bar-ambient dashboard-bar-ambient--primary"
                        fill={FINANCE_ALLOCATED_COLOR}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={34}
                      />
                      <Bar
                        dataKey="disbursedAmount"
                        name="Disbursed Amount"
                        className="dashboard-bar-ambient dashboard-bar-ambient--secondary"
                        fill={FINANCE_DISBURSED_COLOR}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={34}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <p className="mt-3 border-t border-slate-200/70 pt-2 text-[11px] leading-relaxed text-slate-600">
                  Goal: highlight regions with large remaining funds and regions approaching full disbursement.
                </p>
              </section>

              <section className="h-full rounded-2xl border border-slate-200/90 bg-linear-to-b from-white to-slate-50/60 p-4 sm:p-5">
                <div className="mb-3 min-h-14 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-800">
                      2) Progress Integrity Monitor
                    </p>
                    <p className="mt-1 max-w-[44ch] text-[11px] leading-relaxed text-slate-500">
                      Side-by-side progress bars per region: Financial (blue) versus Physical (green/red).
                    </p>
                  </div>
                </div>

                <div className="h-72 sm:h-80 pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={progressMonitorData}
                      margin={{ top: 8, right: 12, left: -6, bottom: 10 }}
                      barGap={2}
                      barCategoryGap="14%"
                    >
                      <CartesianGrid {...CHART_GRID_PROPS} vertical={false} />
                      <XAxis
                        dataKey="region"
                        tick={CHART_AXIS_TICK}
                        tickMargin={8}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, Math.ceil(progressDomainMax / 10) * 10]}
                        tickFormatter={formatAxisPercent}
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
                          return [formatPercent(value), key];
                        }}
                        labelFormatter={(label: string, payload) => {
                          const row = payload?.[0]?.payload as
                            | {
                                gapPct: number;
                                verifiedMilestones: number;
                                totalMilestones: number;
                              }
                            | undefined;
                          if (!row) return label;
                          return `${label} | Gap: ${formatPercent(row.gapPct)} | Verified: ${row.verifiedMilestones}/${row.totalMilestones}`;
                        }}
                      />
                      <Legend wrapperStyle={CHART_LEGEND_STYLE} iconSize={9} />
                      <Bar
                        dataKey="financialProgressPct"
                        name="Financial Progress %"
                        className="dashboard-bar-ambient dashboard-bar-ambient--primary"
                        fill={PROGRESS_FINANCIAL_COLOR}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={30}
                      />
                      <Bar
                        dataKey="physicalProgressPct"
                        name="Physical Progress %"
                        className="dashboard-bar-ambient dashboard-bar-ambient--secondary"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={30}
                      >
                        {progressMonitorData.map((row) => (
                          <Cell
                            key={`physical-cell-${row.region}`}
                            fill={row.isHighRisk ? PROGRESS_ANOMALY_COLOR : PROGRESS_PHYSICAL_COLOR}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

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
            </div>

          </div>
        )}
      </MobileCollapse>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <div className="px-5 py-4 border-b border-border space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Regional Performance</p>
            <p className="text-[11px] text-muted-foreground">
              Sorted highest to lowest. Filters are shown above for flexible drill-down.
            </p>
          </div>
        </div>

        <div className="min-w-[660px] grid grid-cols-[2rem_1fr_7rem_7rem_5rem_5rem_2rem] gap-x-3 px-5 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">
          <span>Rank</span>
          <span>Region</span>
          <span className="text-right">Total Budget</span>
          <span className="text-right">Funded</span>
          <span className="text-right">Projects</span>
          <span className="text-right">Pending</span>
          <span />
        </div>

        <div className="divide-y divide-border">
          {filteredStats.length === 0 && (
            <p className="text-xs text-muted-foreground py-8 text-center">
              No regions match the selected filters.
            </p>
          )}
          {pagedStats.map((regionStat, pageIdx) => {
            const rank = safeRegionPage * PAGE_SIZE + pageIdx + 1;
            const isFirst = rank === 1;
            const isExpanded = expandedRegion === regionStat.region;
            const regionProjects = filteredProjects.filter(
              (project) => project.dpwhRegion === regionStat.region
            );

            return (
              <div key={regionStat.region}>
                <button
                  onClick={() => setExpandedRegion(isExpanded ? null : regionStat.region)}
                  className={`w-full text-left min-w-[660px] grid grid-cols-[2rem_1fr_7rem_7rem_5rem_5rem_2rem] gap-x-3 items-center px-5 py-3.5 transition-colors ${
                    isExpanded
                      ? "bg-primary/5"
                      : isFirst
                      ? "bg-primary/[0.025] hover:bg-muted/50"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <span className={`text-xs font-bold tabular-nums ${isFirst ? "text-primary" : "text-muted-foreground"}`}>
                    {toOrdinal(rank)}
                  </span>
                  <span className={`text-xs font-semibold truncate ${isFirst ? "text-primary" : "text-foreground"}`}>
                    {regionStat.region}
                    {regionStat.isHighRisk && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800">
                        HIGH RISK
                      </span>
                    )}
                  </span>
                  <span className="text-right text-xs font-bold text-foreground tabular-nums">
                    {fmtPhp(regionStat.totalBudget)}
                  </span>
                  <span className="text-right text-[11px] text-foreground tabular-nums">
                    {fmtPhp(regionStat.fundedBudget)}
                  </span>
                  <span className="text-right text-[11px] text-muted-foreground tabular-nums">
                    {regionStat.total}
                  </span>
                  <span className="text-right text-[11px] text-muted-foreground tabular-nums">
                    {regionStat.pending}
                  </span>
                  <span className="flex justify-center">
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-border bg-muted/20">
                    <div className="px-5 pt-3 pb-2 text-[11px] text-muted-foreground">
                      Financial {formatPercent(regionStat.financialProgressPct)} vs Physical {formatPercent(regionStat.physicalProgressPct)}
                      {" "}(Gap {formatPercent(regionStat.gapPct)})
                    </div>
                    <div className="overflow-x-auto">
                      <div className="min-w-[1080px] grid grid-cols-[minmax(9rem,1.2fr)_minmax(8rem,0.95fr)_minmax(6rem,0.65fr)_minmax(6rem,0.65fr)_minmax(6rem,0.75fr)_minmax(8rem,0.9fr)_minmax(5rem,0.55fr)_minmax(10rem,1fr)_minmax(10rem,1fr)] gap-x-3 px-4 sm:px-8 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/60 bg-muted/40">
                        <span className="leading-tight">Project Title</span>
                        <span className="leading-tight">Location</span>
                        <span className="text-right">Budget</span>
                        <span className="text-right">Spent</span>
                        <span className="text-center">Status</span>
                        <span className="leading-tight">Milestone Progress</span>
                        <span className="text-right">Audit Events</span>
                        <span className="pl-3 border-l border-border/60">Contractor</span>
                        <span>Site Engineer</span>
                      </div>
                      <div className="divide-y divide-border/50 min-w-[1080px]">
                        {regionProjects.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">
                            No projects in this region.
                          </p>
                        ) : (
                          regionProjects.map((project) => {
                            const isFunded = isFundedLifecycleProject(project);
                            const isPending = isPendingFundingProject(project);
                            const milestoneSpent = Number(spentByProjectId[project.id] ?? 0);
                            const milestoneProgressPct = getMilestoneProgressPercent(project, milestoneSpent);
                            const targetPercent = clampPercent(Number(project.targetPercent ?? 100));
                            const contractorWalletRaw = project.contractorWallet || "";
                            const engineerWalletRaw = project.engineerWallet || "";
                            const contractorWallet = maskWalletAddress(contractorWalletRaw);
                            const engineerWallet = maskWalletAddress(engineerWalletRaw);
                            const contractorName = project.contractorName || "Unassigned";
                            const engineerName = project.engineerName || project.inspectorName || "Unassigned";
                            const eventCount = auditEntries.filter((entry) => entry.projectId === project.id).length;

                            return (
                              <div
                                key={project.id}
                                className="grid grid-cols-[minmax(9rem,1.2fr)_minmax(8rem,0.95fr)_minmax(6rem,0.65fr)_minmax(6rem,0.65fr)_minmax(6rem,0.75fr)_minmax(8rem,0.9fr)_minmax(5rem,0.55fr)_minmax(10rem,1fr)_minmax(10rem,1fr)] gap-x-3 items-start px-4 sm:px-8 py-2.5"
                              >
                                <p className="text-[11px] font-medium text-foreground whitespace-normal break-words leading-tight">
                                  {project.title}
                                </p>
                                <p className="text-[11px] text-muted-foreground whitespace-normal break-words leading-tight">
                                  {project.municipality}, {project.province}
                                </p>
                                <p className="text-right text-[11px] font-semibold text-foreground tabular-nums">
                                  {fmtPhp(getAllocatedBudget(project))}
                                </p>
                                <p className="text-right text-[11px] font-semibold text-foreground tabular-nums">
                                  {fmtPhp(milestoneSpent)}
                                </p>
                                <p className="text-center pt-0.5">
                                  <span
                                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                      isFunded ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {isFunded
                                      ? "Funded"
                                      : isPending
                                      ? "Pending"
                                      : project.status.replace(/_/g, " ")}
                                  </span>
                                </p>
                                <div className="space-y-1">
                                  <p className="text-[11px] font-semibold text-foreground tabular-nums">
                                    {milestoneProgressPct.toFixed(0)}%
                                  </p>
                                  <div className="h-1.5 bg-muted rounded-sm overflow-hidden">
                                    <div className="h-full bg-primary rounded-sm" style={{ width: `${milestoneProgressPct}%` }} />
                                  </div>
                                  <p className="text-[10px] text-muted-foreground">
                                    Target {targetPercent.toFixed(0)}%
                                  </p>
                                </div>
                                <p className="text-right text-[11px] text-muted-foreground tabular-nums">{eventCount}</p>
                                <div className="min-w-0 space-y-0.5 pl-3 border-l border-border/40">
                                  <p
                                    className="text-[10px] font-semibold text-foreground whitespace-normal break-words leading-tight"
                                    title={contractorName}
                                  >
                                    {contractorName}
                                  </p>
                                  <p
                                    className="text-[10px] text-muted-foreground font-mono whitespace-normal break-all leading-tight"
                                    title={contractorWalletRaw || contractorWallet}
                                  >
                                    {contractorWallet}
                                  </p>
                                </div>
                                <div className="min-w-0 space-y-0.5">
                                  <p
                                    className="text-[10px] font-semibold text-foreground whitespace-normal break-words leading-tight"
                                    title={engineerName}
                                  >
                                    {engineerName}
                                  </p>
                                  <p
                                    className="text-[10px] text-muted-foreground font-mono whitespace-normal break-all leading-tight"
                                    title={engineerWalletRaw || engineerWallet}
                                  >
                                    {engineerWallet}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border text-[11px] text-muted-foreground">
            <span>
              Page {safeRegionPage + 1} of {pageCount} and {filteredStats.length} region
              {filteredStats.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={safeRegionPage === 0}
                onClick={() => {
                  setRegionPage((page) => page - 1);
                  setExpandedRegion(null);
                }}
                className="px-3 py-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              {Array.from({ length: pageCount }).map((_, pageIndex) => (
                <button
                  key={pageIndex}
                  onClick={() => {
                    setRegionPage(pageIndex);
                    setExpandedRegion(null);
                  }}
                  className={`w-7 h-7 rounded border text-[11px] font-medium transition-colors ${
                    pageIndex === safeRegionPage
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {pageIndex + 1}
                </button>
              ))}
              <button
                disabled={safeRegionPage === pageCount - 1}
                onClick={() => {
                  setRegionPage((page) => page + 1);
                  setExpandedRegion(null);
                }}
                className="px-3 py-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
