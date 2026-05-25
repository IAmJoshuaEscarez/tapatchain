import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdvancedFilterBar } from "@/components/features/coa";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/ui";
import { ExternalLink, Stamp, Loader2, CheckSquare, Square } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getEtherscanLink, isRealTxHash } from "@/features/blockchain/services/blockchain";
import type {
  ChainOfCustodyStep,
  NationalBlockchainStatus,
  NationalDataSyncState,
  NationalLedgerProject,
  NationalRiskProfile,
} from "./types";
import { NationalActionModal } from "./NationalActionModal";

interface GlobalLedgerHubProps {
  records: NationalLedgerProject[];
  riskProfiles: NationalRiskProfile[];
  loading: boolean;
  syncState: NationalDataSyncState;
  syncError: string | null;
  onRequestFinalSeal: (project: NationalLedgerProject, remarks: string) => Promise<void>;
  sealingProjectId: string | null;
  getChainOfCustody: (projectId: string) => ChainOfCustodyStep[];
  reconciliationOnly?: boolean;
}

const STATUS_LABELS: Record<NationalBlockchainStatus, string> = {
  RDC_PROPOSED: "RDC Proposed",
  RD_ASSIGNED: "RD Assigned",
  CONTRACTOR_SUBMITTED: "Contractor Submitted",
  ENGINEER_VERIFIED: "Engineer Verified",
  COA_REGIONAL_APPROVED: "COA Regional Approved",
  FINAL_SEAL: "Final Seal",
  FLAGGED: "Flagged",
  UNKNOWN: "Unknown",
};

const STATUS_TONE: Record<NationalBlockchainStatus, string> = {
  RDC_PROPOSED: "bg-muted text-muted-foreground",
  RD_ASSIGNED: "bg-primary/10 text-primary",
  CONTRACTOR_SUBMITTED: "bg-primary/10 text-primary",
  ENGINEER_VERIFIED: "bg-primary/10 text-primary",
  COA_REGIONAL_APPROVED: "bg-emerald-500/10 text-emerald-600",
  FINAL_SEAL: "bg-emerald-500/10 text-emerald-600",
  FLAGGED: "bg-destructive/10 text-destructive",
  UNKNOWN: "bg-muted text-muted-foreground",
};

const GLOBAL_LEDGER_PAGE_SIZE = 10;

function getSyncLabel(state: NationalDataSyncState): string {
  switch (state) {
    case "loading":
      return "Syncing off-chain and on-chain data...";
    case "offchain-ready":
      return "Off-chain snapshot loaded. On-chain reconciliation in progress.";
    case "reconciled":
      return "On-chain and off-chain data reconciled.";
    default:
      return "Sync state unavailable.";
  }
}

function getCompletionPercent(record: NationalLedgerProject): number {
  const progress = Number(record.project.progress ?? 0);
  const currentProgress = Number(record.project.currentProgress ?? 0);
  const completion = Math.max(progress, currentProgress);
  if (!Number.isFinite(completion)) return 0;
  return Math.max(0, Math.min(100, completion));
}

function isBatchEligibleForFinalSeal(record: NationalLedgerProject): boolean {
  return (
    record.blockchainStatus === "COA_REGIONAL_APPROVED" &&
    getCompletionPercent(record) >= 100
  );
}

export function GlobalLedgerHub({
  records,
  riskProfiles,
  loading,
  syncState,
  syncError,
  onRequestFinalSeal,
  sealingProjectId,
  getChainOfCustody,
  reconciliationOnly = false,
}: GlobalLedgerHubProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sealRemarks, setSealRemarks] = useState("");
  const [sealError, setSealError] = useState<string | null>(null);
  const [sealSuccess, setSealSuccess] = useState<string | null>(null);
  const [selectedBatchProjectIds, setSelectedBatchProjectIds] = useState<Set<string>>(new Set());
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchRemarks, setBatchRemarks] = useState("");
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSuccess, setBatchSuccess] = useState<string | null>(null);
  const [ledgerPage, setLedgerPage] = useState(1);

  const availableRegions = useMemo(() => {
    return ["All", ...Array.from(new Set(records.map((record) => record.region))).sort()];
  }, [records]);

  const availableStatuses = useMemo(() => {
    return [
      "All",
      ...Array.from(new Set(records.map((record) => record.blockchainStatus))).map(
        (status) => STATUS_LABELS[status]
      ),
    ];
  }, [records]);

  const statusByLabel = useMemo(() => {
    const pairs = Object.entries(STATUS_LABELS).map(
      ([key, label]) => [label, key as NationalBlockchainStatus] as const
    );
    return new Map<string, NationalBlockchainStatus>(pairs);
  }, []);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const selectedStatus = statusByLabel.get(statusFilter);

    return records.filter((record) => {
      const matchesSearch =
        !q ||
        record.searchIndex.includes(q) ||
        record.projectId.toLowerCase().includes(q) ||
        record.latestTxHash?.toLowerCase().includes(q);

      const matchesRegion = regionFilter === "All" || record.region === regionFilter;
      const matchesStatus =
        statusFilter === "All" ||
        (selectedStatus ? record.blockchainStatus === selectedStatus : STATUS_LABELS[record.blockchainStatus] === statusFilter);

      return matchesSearch && matchesRegion && matchesStatus;
    });
  }, [records, searchQuery, regionFilter, statusFilter, statusByLabel]);

  useEffect(() => {
    setLedgerPage(1);
  }, [searchQuery, regionFilter, statusFilter]);

  const ledgerTotalPages = Math.max(1, Math.ceil(filteredRecords.length / GLOBAL_LEDGER_PAGE_SIZE));
  const pagedFilteredRecords = useMemo(() => {
    const safePage = Math.min(ledgerPage, ledgerTotalPages);
    const start = (safePage - 1) * GLOBAL_LEDGER_PAGE_SIZE;
    return filteredRecords.slice(start, start + GLOBAL_LEDGER_PAGE_SIZE);
  }, [filteredRecords, ledgerPage, ledgerTotalPages]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return records.find((record) => record.projectId === selectedProjectId) ?? null;
  }, [records, selectedProjectId]);

  const riskProfileByProjectId = useMemo(() => {
    const map = new Map<string, NationalRiskProfile>();
    for (const profile of riskProfiles) {
      map.set(profile.projectId, profile);
    }
    return map;
  }, [riskProfiles]);

  const selectedRiskProfile = useMemo(() => {
    if (!selectedProject) return undefined;
    return riskProfileByProjectId.get(selectedProject.projectId);
  }, [selectedProject, riskProfileByProjectId]);

  const chainOfCustody = useMemo(() => {
    if (!selectedProject) return [];
    return getChainOfCustody(selectedProject.projectId);
  }, [selectedProject, getChainOfCustody]);

  const eligibleFilteredRecords = useMemo(() => {
    return filteredRecords.filter((record) => isBatchEligibleForFinalSeal(record));
  }, [filteredRecords]);

  const selectedBatchRecords = useMemo(() => {
    return records.filter((record) => selectedBatchProjectIds.has(record.projectId));
  }, [records, selectedBatchProjectIds]);

  useEffect(() => {
    setSelectedBatchProjectIds((previous) => {
      const allowedIds = new Set(
        records
          .filter((record) => isBatchEligibleForFinalSeal(record))
          .map((record) => record.projectId)
      );

      const next = new Set<string>();
      for (const projectId of previous) {
        if (allowedIds.has(projectId)) {
          next.add(projectId);
        }
      }

      if (next.size === previous.size) return previous;
      return next;
    });
  }, [records]);

  const toggleBatchSelection = (projectId: string) => {
    setSelectedBatchProjectIds((previous) => {
      const next = new Set(previous);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleSelectAllCleared = () => {
    setSelectedBatchProjectIds(new Set(eligibleFilteredRecords.map((record) => record.projectId)));
    setBatchError(null);
    setBatchSuccess(null);
  };

  const handleClearBatchSelection = () => {
    setSelectedBatchProjectIds(new Set());
    setBatchError(null);
    setBatchSuccess(null);
  };

  const handleOpenBatchModal = () => {
    if (selectedBatchRecords.length === 0) {
      setBatchError("Select at least one eligible project (100% completion and COA Regional Approved) for batch final seal.");
      return;
    }

    setBatchError(null);
    setBatchSuccess(null);
    setIsBatchModalOpen(true);
  };

  const handleBatchFinalSeal = async () => {
    if (selectedBatchRecords.length === 0) {
      setBatchError("No selected projects for batch final seal.");
      return;
    }

    setBatchError(null);
    setBatchSuccess(null);
    setIsBatchProcessing(true);

    const failures: Array<{ projectId: string; reason: string }> = [];
    const total = selectedBatchRecords.length;

    try {
      for (let index = 0; index < selectedBatchRecords.length; index += 1) {
        const record = selectedBatchRecords[index];
        try {
          await onRequestFinalSeal(
            record,
            `${batchRemarks.trim()} [Batch ${index + 1}/${total}]`
          );
        } catch (error) {
          failures.push({
            projectId: record.projectId,
            reason: error instanceof Error ? error.message : "Unknown batch final seal error",
          });
        }
      }

      if (failures.length === 0) {
        setBatchSuccess(`Batch final seal completed for ${total} project(s).`);
        setSelectedBatchProjectIds(new Set());
        setBatchRemarks("");
        setIsBatchModalOpen(false);
        return;
      }

      const failureSummary = failures
        .slice(0, 3)
        .map((failure) => `${failure.projectId}: ${failure.reason}`)
        .join(" | ");
      setBatchError(`Batch completed with ${failures.length} failure(s). ${failureSummary}`);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleSeal = async () => {
    if (!selectedProject) return;
    setSealError(null);
    setSealSuccess(null);

    try {
      await onRequestFinalSeal(selectedProject, sealRemarks);
      setSealSuccess(`Final audit seal successfully affixed for ${selectedProject.projectName}.`);
      setSealRemarks("");
    } catch (error) {
      setSealError(error instanceof Error ? error.message : "Final seal request failed.");
    }
  };

  const selectedProjectCompletion = selectedProject ? getCompletionPercent(selectedProject) : 0;
  const isFinalSealReady = Boolean(
    selectedProject &&
    selectedProjectCompletion >= 100 &&
    selectedProject.blockchainStatus === "COA_REGIONAL_APPROVED"
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Global Ledger Sync</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{getSyncLabel(syncState)}</p>
            {syncError && <p className="text-[11px] text-destructive mt-1">{syncError}</p>}
          </div>
          <div className="text-xs text-muted-foreground">
            Nationwide projects: <span className="font-semibold text-foreground">{records.length}</span>
          </div>
        </CardContent>
      </Card>

      <AdvancedFilterBar
        searchPlaceholder="Global search by Project ID or Transaction Hash..."
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        extraFilters={(
          <>
            <select
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              className="h-8 w-full sm:w-55 px-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
            >
              {availableRegions.map((region) => (
                <option key={region} value={region}>{region === "All" ? "All Regions" : region}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-8 w-full sm:w-55 px-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
            >
              {availableStatuses.map((status) => (
                <option key={status} value={status}>{status === "All" ? "All Statuses" : status}</option>
              ))}
            </select>
          </>
        )}
      />

      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">
                {reconciliationOnly ? "Evidence Reconciliation Registry" : "Global Ledger Master List"}
              </CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {reconciliationOnly
                  ? "Review off-chain final site photo against on-chain regional auditor transaction before sealing."
                  : "Batch Final Seal can only include projects with 100% completion and COA Regional Approved status."}
              </p>
            </div>

            {!reconciliationOnly && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={handleSelectAllCleared}>
                  <CheckSquare className="w-3.5 h-3.5 mr-1" /> Select All Eligible ({eligibleFilteredRecords.length})
                </Button>
                <Button type="button" variant="outline" onClick={handleClearBatchSelection}>
                  Clear Selection
                </Button>
                <Button type="button" onClick={handleOpenBatchModal} disabled={selectedBatchProjectIds.size === 0 || isBatchProcessing}>
                  Batch Final Seal ({selectedBatchProjectIds.size})
                </Button>
              </div>
            )}
          </div>

          {!reconciliationOnly && batchError && <p className="text-[11px] text-destructive mt-1">{batchError}</p>}
          {!reconciliationOnly && batchSuccess && <p className="text-[11px] text-primary mt-1">{batchSuccess}</p>}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">Loading national ledger...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">No nationwide projects matched the global filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-190 grid grid-cols-[4.5rem_8rem_2fr_9rem_8rem_9rem] bg-muted/50 border-b border-border">
                {[
                  "Batch",
                  "Project ID",
                  "Project",
                  "Region",
                  "Status",
                  "Latest TX",
                ].map((header) => (
                  <div key={header} className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{header}</div>
                ))}
              </div>

              <div className="divide-y divide-border">
                {pagedFilteredRecords.map((record) => (
                  <div
                    key={record.projectId}
                    onClick={() => {
                      setSelectedProjectId(record.projectId);
                      setSealError(null);
                      setSealSuccess(null);
                    }}
                    className="min-w-190 w-full grid grid-cols-[4.5rem_8rem_2fr_9rem_8rem_9rem] text-left items-center hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <div
                      className="px-3 py-2"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      {!reconciliationOnly && isBatchEligibleForFinalSeal(record) ? (
                        <button
                          type="button"
                          onClick={() => toggleBatchSelection(record.projectId)}
                          className="text-primary hover:text-primary/80"
                          aria-label={selectedBatchProjectIds.has(record.projectId) ? "Unselect project from batch" : "Select project for batch"}
                        >
                          {selectedBatchProjectIds.has(record.projectId) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">-</span>
                      )}
                    </div>

                    <div className="px-3 py-2 text-[11px] font-mono text-foreground truncate">{record.projectId}</div>

                    <div className="px-3 py-2">
                      <p className="text-xs font-semibold text-foreground truncate">{record.projectName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{record.municipality || "—"} | {record.contractor || "—"}</p>
                    </div>

                    <div className="px-3 py-2 text-[11px] text-muted-foreground truncate">{record.region}</div>

                    <div className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_TONE[record.blockchainStatus]}`}>
                        {STATUS_LABELS[record.blockchainStatus]}
                      </span>
                    </div>

                    <div className="px-3 py-2 text-[10px] font-mono text-muted-foreground truncate">
                      {record.latestTxHash ? `${record.latestTxHash.slice(0, 10)}...` : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && filteredRecords.length > 0 && (
            <div className="p-3">
              <PaginationControls
                page={Math.min(ledgerPage, ledgerTotalPages)}
                totalPages={ledgerTotalPages}
                onPageChange={setLedgerPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {selectedProject && (
        <Card>
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-sm font-semibold text-foreground">Project Details</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {selectedProject.projectName} • {selectedProject.region} • {selectedProject.municipality}
            </p>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded border border-border bg-card px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ABC</div>
                <div className="text-xs font-semibold text-foreground mt-0.5">{formatCurrency(selectedProject.project.budget)}</div>
              </div>
              <div className="rounded border border-border bg-card px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Milestone Paid (National)</div>
                <div className="text-xs font-semibold text-foreground mt-0.5">{formatCurrency(selectedProject.totalMilestonePaid)}</div>
              </div>
              <div className="rounded border border-border bg-card px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Seal Readiness</div>
                <div className="text-xs font-semibold text-foreground mt-0.5">
                  {isFinalSealReady ? "Ready" : "Not Ready"}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {selectedProjectCompletion.toFixed(0)}% complete • {selectedProject.forensicWarningCount} warning(s)
                  {selectedRiskProfile ? ` • ${selectedRiskProfile.riskLevel} risk` : ""}
                </p>
              </div>
            </div>

            <div className="rounded border border-border bg-card p-3">
              <div className="text-xs font-semibold text-foreground mb-2">Evidence Reconciliation</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded border border-border bg-background p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Final Site Photo (Off-chain)</div>
                  {selectedProject.finalSitePhotoUrl ? (
                    <div className="space-y-2">
                      <img
                        src={selectedProject.finalSitePhotoUrl}
                        alt="Final Site Evidence"
                        className="w-full h-44 object-cover rounded border border-border"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Captured: {selectedProject.finalSitePhotoCapturedAt ? new Date(selectedProject.finalSitePhotoCapturedAt).toLocaleString() : "Unknown"}
                      </p>
                    </div>
                  ) : (
                    <div className="h-44 rounded border border-dashed border-border bg-muted/30 flex items-center justify-center text-[11px] text-muted-foreground">
                      No final site photo found.
                    </div>
                  )}
                </div>

                <div className="rounded border border-border bg-background p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Regional Auditor TX Hash (On-chain)</div>
                  {selectedProject.regionalAuditorTxHash && isRealTxHash(selectedProject.regionalAuditorTxHash) ? (
                    <div className="space-y-2">
                      <a
                        href={getEtherscanLink(selectedProject.regionalAuditorTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline text-xs font-mono"
                      >
                        {selectedProject.regionalAuditorTxHash}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <p className="text-[10px] text-muted-foreground">
                        Reviewed: {selectedProject.regionalAuditorReviewedAt ? new Date(selectedProject.regionalAuditorReviewedAt).toLocaleString() : "Unknown"}
                      </p>
                    </div>
                  ) : (
                    <div className="h-44 rounded border border-dashed border-border bg-muted/30 flex items-center justify-center text-[11px] text-muted-foreground px-3 text-center">
                      No regional auditor transaction hash found.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded border border-border bg-card p-3">
              <div className="text-xs font-semibold text-foreground mb-2">Complete Signature Path</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-170 text-left">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Stage</th>
                      <th className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">State</th>
                      <th className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Actor</th>
                      <th className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Timestamp</th>
                      <th className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">TX Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {chainOfCustody.map((step) => (
                      <tr key={step.key}>
                        <td className="px-3 py-2 text-[11px] text-foreground font-medium">{step.label}</td>
                        <td className="px-3 py-2 text-[11px]">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${step.completed ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {step.completed ? "Recorded" : "Pending"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground">{step.actorName ?? "—"}</td>
                        <td className="px-3 py-2 text-[11px] text-muted-foreground">{step.timestamp ? new Date(step.timestamp).toLocaleString() : "—"}</td>
                        <td className="px-3 py-2 text-[11px] font-mono">
                          {step.txHash && isRealTxHash(step.txHash) ? (
                            <a
                              href={getEtherscanLink(step.txHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              {`${step.txHash.slice(0, 10)}...`} <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">{step.txHash ? `${step.txHash.slice(0, 10)}...` : "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {!reconciliationOnly && (
              <div className="rounded border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                    <Stamp className="w-3.5 h-3.5 text-primary" /> Final Audit Seal
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_TONE[selectedProject.blockchainStatus]}`}>
                    Current: {STATUS_LABELS[selectedProject.blockchainStatus]}
                  </span>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Final Audit Seal is enabled only when progress is
                  <span className="font-semibold text-foreground"> 100%</span> and status is
                  <span className="font-semibold text-foreground"> COA_REGIONAL_APPROVED</span>.
                </p>

                <textarea
                  value={sealRemarks}
                  onChange={(event) => setSealRemarks(event.target.value)}
                  className="w-full min-h-17.5 px-2.5 py-2 text-xs border border-border bg-background text-foreground rounded focus:outline-none focus:border-primary"
                  placeholder="Optional national remarks before sealing..."
                />

                {sealError && <p className="text-[11px] text-destructive">{sealError}</p>}
                {sealSuccess && <p className="text-[11px] text-primary">{sealSuccess}</p>}

                <Button
                  onClick={() => void handleSeal()}
                  disabled={
                    sealingProjectId === selectedProject.projectId ||
                    !isFinalSealReady
                  }
                  className="w-full sm:w-auto"
                >
                  {sealingProjectId === selectedProject.projectId ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      Applying Final Seal...
                    </>
                  ) : (
                    "Affix Final Audit Seal"
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!reconciliationOnly && (
        <NationalActionModal
          open={isBatchModalOpen}
          onOpenChange={setIsBatchModalOpen}
          selectedRecords={selectedBatchRecords}
          remarks={batchRemarks}
          onRemarksChange={setBatchRemarks}
          isProcessing={isBatchProcessing}
          onConfirm={handleBatchFinalSeal}
          errorMessage={batchError}
          successMessage={batchSuccess}
        />
      )}
    </div>
  );
}
