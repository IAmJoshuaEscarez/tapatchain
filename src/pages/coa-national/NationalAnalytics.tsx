import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { getEtherscanLink, isRealTxHash } from "@/features/blockchain/services/blockchain";
import { generateAuditNarrative } from "./AuditNarrative";
import type {
  ChainOfCustodyStep,
  NationalLedgerProject,
  NationalRiskLevel,
  NationalRiskProfile,
  NationalTimelineStage,
  RegionalComplianceRow,
} from "./types";

interface NationalAnalyticsProps {
  records: NationalLedgerProject[];
  riskProfiles: NationalRiskProfile[];
  complianceRows: RegionalComplianceRow[];
  getChainOfCustody: (projectId: string) => ChainOfCustodyStep[];
}

const NATIONAL_ANALYTICS_PAGE_SIZE = 10;
const NATIONAL_COMPLIANCE_PAGE_SIZE = 10;

function toEpoch(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function toHours(milliseconds: number): number {
  return milliseconds / (1000 * 60 * 60);
}

function formatTimestamp(value?: string): string {
  if (!value) return "Not yet recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not yet recorded";
  return parsed.toLocaleString();
}

function asPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatHourValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}h`;
}

function formatDayValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}d`;
}

function formatMeterValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}m`;
}

function riskToneClass(level: NationalRiskLevel): string {
  if (level === "HIGH") return "bg-destructive/10 text-destructive";
  if (level === "MEDIUM") return "bg-primary/10 text-primary";
  return "bg-emerald-500/10 text-emerald-600";
}

function statusLabel(status: NationalLedgerProject["blockchainStatus"]): string {
  switch (status) {
    case "RDC_PROPOSED":
      return "RDC Proposed";
    case "RD_ASSIGNED":
      return "RD Assigned";
    case "CONTRACTOR_SUBMITTED":
      return "Contractor Submitted";
    case "ENGINEER_VERIFIED":
      return "Engineer Verified";
    case "COA_REGIONAL_APPROVED":
      return "COA Approved";
    case "FINAL_SEAL":
      return "Final Seal";
    case "FLAGGED":
      return "Flagged";
    default:
      return "Unknown";
  }
}

function resolveTimelineStages(chainOfCustody: ChainOfCustodyStep[]): {
  stages: NationalTimelineStage[];
  longestDwell: NationalTimelineStage | null;
} {
  const withEpoch = chainOfCustody.map((step) => ({
    ...step,
    epoch: toEpoch(step.timestamp),
  }));

  const stages: NationalTimelineStage[] = withEpoch.map((step, index) => {
    if (!step.completed || step.epoch <= 0) {
      return {
        key: step.key,
        label: step.label,
        completed: step.completed,
        timestamp: step.timestamp,
        txHash: step.txHash,
        actorName: step.actorName,
        dwellHoursToNext: null,
      };
    }

    let nextEpoch = 0;
    for (let cursor = index + 1; cursor < withEpoch.length; cursor += 1) {
      if (withEpoch[cursor].completed && withEpoch[cursor].epoch > 0) {
        nextEpoch = withEpoch[cursor].epoch;
        break;
      }
    }

    const dwellHoursToNext = nextEpoch > step.epoch ? toHours(nextEpoch - step.epoch) : null;

    return {
      key: step.key,
      label: step.label,
      completed: step.completed,
      timestamp: step.timestamp,
      txHash: step.txHash,
      actorName: step.actorName,
      dwellHoursToNext,
    };
  });

  const longestDwell = stages
    .filter((stage) => typeof stage.dwellHoursToNext === "number")
    .sort((left, right) => (right.dwellHoursToNext ?? 0) - (left.dwellHoursToNext ?? 0))[0] ?? null;

  return { stages, longestDwell };
}

export function NationalAnalytics({
  records,
  riskProfiles,
  complianceRows,
  getChainOfCustody,
}: NationalAnalyticsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<"ALL" | NationalRiskLevel>("ALL");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);
  const [analyticsPage, setAnalyticsPage] = useState(1);
  const [compliancePage, setCompliancePage] = useState(1);

  const riskByProjectId = useMemo(() => {
    const map = new Map<string, NationalRiskProfile>();
    for (const profile of riskProfiles) {
      map.set(profile.projectId, profile);
    }
    return map;
  }, [riskProfiles]);

  const riskSummary = useMemo(() => {
    const high = riskProfiles.filter((profile) => profile.riskLevel === "HIGH").length;
    const medium = riskProfiles.filter((profile) => profile.riskLevel === "MEDIUM").length;
    const low = riskProfiles.filter((profile) => profile.riskLevel === "LOW").length;

    return {
      high,
      medium,
      low,
    };
  }, [riskProfiles]);

  const analyticsRows = useMemo(() => {
    return records
      .map((record) => {
        const profile = riskByProjectId.get(record.projectId);
        const fallbackRiskLevel: NationalRiskLevel = record.forensicWarningCount > 0 ? "MEDIUM" : "LOW";
        const resolvedRiskLevel = profile?.riskLevel ?? fallbackRiskLevel;
        const searchIndex = [
          record.projectId,
          record.projectName,
          record.region,
          record.municipality,
          record.contractor,
          resolvedRiskLevel,
          statusLabel(record.blockchainStatus),
        ]
          .join(" ")
          .toLowerCase();

        return {
          record,
          profile,
          riskLevel: resolvedRiskLevel,
          searchIndex,
        };
      })
      .sort((left, right) => {
        const riskScoreDelta = (right.profile?.riskScore ?? -1) - (left.profile?.riskScore ?? -1);
        if (riskScoreDelta !== 0) return riskScoreDelta;
        return right.record.forensicWarningCount - left.record.forensicWarningCount;
      });
  }, [records, riskByProjectId]);

  const filteredAnalyticsRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return analyticsRows.filter((row) => {
      const matchesSearch = !q || row.searchIndex.includes(q);
      const matchesRisk = riskFilter === "ALL" || row.riskLevel === riskFilter;
      return matchesSearch && matchesRisk;
    });
  }, [analyticsRows, riskFilter, searchQuery]);

  useEffect(() => {
    setAnalyticsPage(1);
  }, [searchQuery, riskFilter]);

  const analyticsTotalPages = Math.max(1, Math.ceil(filteredAnalyticsRows.length / NATIONAL_ANALYTICS_PAGE_SIZE));
  const pagedAnalyticsRows = useMemo(() => {
    const safePage = Math.min(analyticsPage, analyticsTotalPages);
    const start = (safePage - 1) * NATIONAL_ANALYTICS_PAGE_SIZE;
    return filteredAnalyticsRows.slice(start, start + NATIONAL_ANALYTICS_PAGE_SIZE);
  }, [filteredAnalyticsRows, analyticsPage, analyticsTotalPages]);

  const complianceTotalPages = Math.max(1, Math.ceil(complianceRows.length / NATIONAL_COMPLIANCE_PAGE_SIZE));
  const pagedComplianceRows = useMemo(() => {
    const safePage = Math.min(compliancePage, complianceTotalPages);
    const start = (safePage - 1) * NATIONAL_COMPLIANCE_PAGE_SIZE;
    return complianceRows.slice(start, start + NATIONAL_COMPLIANCE_PAGE_SIZE);
  }, [complianceRows, compliancePage, complianceTotalPages]);

  useEffect(() => {
    setCompliancePage(1);
  }, [complianceRows.length]);

  const expandedRecord = useMemo(
    () => records.find((record) => record.projectId === expandedProjectId) ?? null,
    [records, expandedProjectId]
  );

  const expandedRiskProfile = useMemo(
    () => (expandedProjectId ? riskByProjectId.get(expandedProjectId) : undefined),
    [expandedProjectId, riskByProjectId]
  );

  const expandedChain = useMemo(
    () => (expandedRecord ? getChainOfCustody(expandedRecord.projectId) : []),
    [expandedRecord, getChainOfCustody]
  );

  const expandedTimeline = useMemo(
    () => resolveTimelineStages(expandedChain),
    [expandedChain]
  );

  const expandedNarrative = useMemo(() => {
    if (!expandedRecord) return "";

    return generateAuditNarrative({
      record: expandedRecord,
      chainOfCustody: expandedChain,
      riskProfile: expandedRiskProfile,
    });
  }, [expandedRecord, expandedChain, expandedRiskProfile]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex flex-col gap-3">
            <CardTitle className="text-sm font-semibold text-foreground">National Analytics Table</CardTitle>
            <p className="text-[11px] text-muted-foreground">
              High: {riskSummary.high} | Medium: {riskSummary.medium} | Low: {riskSummary.low}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search project, region, municipality, contractor..."
                className="h-8 flex-1 min-w-0 px-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
              />
              <select
                value={riskFilter}
                onChange={(event) => setRiskFilter(event.target.value as "ALL" | NationalRiskLevel)}
                className="h-8 w-full sm:w-40 px-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
              >
                <option value="ALL">All Risk Levels</option>
                <option value="HIGH">High Risk</option>
                <option value="MEDIUM">Medium Risk</option>
                <option value="LOW">Low Risk</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredAnalyticsRows.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">No projects matched the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-275 text-left table-fixed">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[9%]">Project ID</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[20%]">Project</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[10%]">Region</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[10%]">Risk</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[8%]">Score</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[8%]">Delay</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[8%]">GPS Var</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[7%]">Re-Sub</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[7%]">Warnings</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[8%]">Status</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[5%]">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagedAnalyticsRows.map((row) => {
                    const isExpanded = expandedProjectId === row.record.projectId;
                    const score = row.profile?.riskScore ?? (row.record.forensicWarningCount > 0 ? 40 : 10);

                    return (
                      <Fragment key={row.record.projectId}>
                        <tr className="hover:bg-muted/30">
                          <td className="px-3 py-2 text-xs font-mono text-foreground truncate">{row.record.projectId}</td>
                          <td className="px-3 py-2 min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{row.record.projectName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{row.record.municipality} | {row.record.contractor}</p>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground truncate">{row.record.region}</td>
                          <td className="px-3 py-2 text-xs">
                            <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold", riskToneClass(row.riskLevel))}>
                              {row.riskLevel}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-foreground font-semibold">{score.toFixed(0)}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{formatDayValue(row.profile?.auditDelayDays)}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{formatMeterValue(row.profile?.gpsVarianceMeters)}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{row.profile?.resubmissionCount ?? 0}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{row.profile?.warningCount ?? row.record.forensicWarningCount}</td>
                          <td className="px-3 py-2 text-xs text-foreground truncate">{statusLabel(row.record.blockchainStatus)}</td>
                          <td className="px-3 py-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setExpandedProjectId((prev) => (prev === row.record.projectId ? null : row.record.projectId))}
                              className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                            >
                              <span>{isExpanded ? "Hide" : "Open"}</span>
                              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-180")} />
                            </button>
                          </td>
                        </tr>

                        {isExpanded && expandedRecord?.projectId === row.record.projectId && (
                          <tr className="bg-muted/20">
                            <td colSpan={11} className="px-4 py-4">
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                <div className="rounded border border-border bg-card p-3">
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Risk Signals</div>
                                  {expandedRiskProfile?.reasons && expandedRiskProfile.reasons.length > 0 ? (
                                    <div className="space-y-1">
                                      {expandedRiskProfile.reasons.map((reason, index) => (
                                        <p key={`${expandedRecord.projectId}-reason-${index}`} className="text-xs text-foreground leading-relaxed wrap-break-word">
                                          {reason}
                                        </p>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No high-priority risk signal found for this project.</p>
                                  )}
                                </div>

                                <div className="rounded border border-border bg-card p-3">
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">AI-Ready Narrative</div>
                                  <p className="text-xs text-foreground leading-relaxed wrap-break-word whitespace-pre-wrap">{expandedNarrative}</p>
                                </div>
                              </div>

                              <div className="mt-3 rounded border border-border bg-card overflow-x-auto">
                                <table className="w-full min-w-180 text-left">
                                  <thead className="bg-muted/50 border-b border-border">
                                    <tr>
                                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Lifecycle Stage</th>
                                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">State</th>
                                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Timestamp</th>
                                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Dwell</th>
                                      <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">TX Hash</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {expandedTimeline.stages.length === 0 ? (
                                      <tr>
                                        <td colSpan={5} className="px-3 py-6 text-xs text-center text-muted-foreground">No lifecycle steps recorded for this project.</td>
                                      </tr>
                                    ) : (
                                      expandedTimeline.stages.map((stage) => {
                                        const isLongest = expandedTimeline.longestDwell?.key === stage.key && typeof stage.dwellHoursToNext === "number";

                                        return (
                                          <tr key={`${expandedRecord.projectId}-${stage.key}`}>
                                            <td className="px-3 py-2 text-xs text-foreground font-medium">{stage.label}</td>
                                            <td className="px-3 py-2 text-xs">
                                              <span className={cn(
                                                "inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold",
                                                stage.completed ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                              )}>
                                                {stage.completed ? "Recorded" : "Pending"}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2 text-xs text-muted-foreground">{formatTimestamp(stage.timestamp)}</td>
                                            <td className="px-3 py-2 text-xs text-muted-foreground">
                                              {typeof stage.dwellHoursToNext === "number" ? `${stage.dwellHoursToNext.toFixed(1)}h${isLongest ? " (Longest)" : ""}` : "-"}
                                            </td>
                                            <td className="px-3 py-2 text-xs font-mono">
                                              {stage.txHash && isRealTxHash(stage.txHash) ? (
                                                <a
                                                  href={getEtherscanLink(stage.txHash)}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                                >
                                                  {`${stage.txHash.slice(0, 12)}...`}
                                                  <ExternalLink className="w-3 h-3" />
                                                </a>
                                              ) : (
                                                <span className="text-muted-foreground">{stage.txHash ? `${stage.txHash.slice(0, 12)}...` : "-"}</span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              </div>

                              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="rounded border border-border bg-card p-3">
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Budget</div>
                                  <div className="text-sm font-semibold text-foreground mt-1">{formatCurrency(expandedRecord.project.budget)}</div>
                                </div>
                                <div className="rounded border border-border bg-card p-3">
                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Milestone Paid</div>
                                  <div className="text-sm font-semibold text-foreground mt-1">{formatCurrency(expandedRecord.totalMilestonePaid)}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filteredAnalyticsRows.length > 0 && (
            <div className="p-3">
              <PaginationControls
                page={Math.min(analyticsPage, analyticsTotalPages)}
                totalPages={analyticsTotalPages}
                onPageChange={setAnalyticsPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm font-semibold text-foreground">Regional Compliance Leaderboard (Expandable)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {complianceRows.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">No regional compliance metrics available yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-220 table-fixed text-left">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[28%]">Region</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[16%]">Avg Turnaround</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[20%]">Within SLA</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[14%]">Pending &gt; 48h</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[12%]">Bottleneck</th>
                    <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold w-[10%]">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagedComplianceRows.map((row) => {
                    const isExpanded = expandedRegion === row.region;
                    const progress = Math.min(100, Math.max(0, row.withinSlaRate));
                    const tone = row.withinSlaRate >= 75
                      ? "bg-emerald-500/10 text-emerald-600"
                      : row.withinSlaRate >= 40
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive";

                    return (
                      <Fragment key={row.region}>
                        <tr className="hover:bg-muted/30">
                          <td className="px-3 py-2 text-xs text-foreground font-medium truncate" title={row.region}>{row.region}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{formatHourValue(row.avgTurnaroundHours)}</td>
                          <td className="px-3 py-2 text-xs">
                            <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold", tone)}>
                              {asPercent(row.withinSlaRate)} ({row.withinSlaCount}/{row.resolvedAuditCount})
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{row.pendingBeyondSlaCount}</td>
                          <td className="px-3 py-2 text-xs text-foreground font-semibold">{row.bottleneckCount}</td>
                          <td className="px-3 py-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setExpandedRegion((prev) => (prev === row.region ? null : row.region))}
                              className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                            >
                              <span>{isExpanded ? "Hide" : "Open"}</span>
                              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-180")} />
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-muted/20">
                            <td colSpan={6} className="px-4 py-4">
                              <div className="rounded border border-border bg-card p-3">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Compliance Breakdown</div>
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                  <div>
                                    <div className="text-[10px] text-muted-foreground uppercase">Resolved Audits</div>
                                    <div className="text-sm font-semibold text-foreground mt-1">{row.resolvedAuditCount}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-muted-foreground uppercase">Within SLA</div>
                                    <div className="text-sm font-semibold text-foreground mt-1">{row.withinSlaCount}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-muted-foreground uppercase">Pending Beyond SLA</div>
                                    <div className="text-sm font-semibold text-foreground mt-1">{row.pendingBeyondSlaCount}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-muted-foreground uppercase">Bottleneck Count</div>
                                    <div className="text-sm font-semibold text-foreground mt-1">{row.bottleneckCount}</div>
                                  </div>
                                </div>

                                <div className="mt-3">
                                  <div className="h-2 rounded bg-muted overflow-hidden">
                                    <div className={cn("h-2 rounded", row.withinSlaRate >= 75 ? "bg-emerald-500" : row.withinSlaRate >= 40 ? "bg-primary" : "bg-destructive")} style={{ width: `${progress}%` }} />
                                  </div>
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    SLA compliance: <span className="text-foreground font-semibold">{asPercent(row.withinSlaRate)}</span>
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {complianceRows.length > 0 && (
            <div className="p-3">
              <PaginationControls
                page={Math.min(compliancePage, complianceTotalPages)}
                totalPages={complianceTotalPages}
                onPageChange={setCompliancePage}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
