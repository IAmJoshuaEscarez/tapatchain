import { useEffect, useMemo, useState } from "react";
import { Button, PaginationControls } from "@/components/ui";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  X,
} from "lucide-react";
import { HIGH_RISK_GAP_THRESHOLD_PCT, maskWalletAddress, fmtPct, fmtPhp, MIN_INTEGRITY_JUSTIFICATION_LENGTH, useDpwhNationalPortal } from "@/hooks/dpwh/useDpwhNationalPortal";
import { AdminUserManagement } from "@/components/features";
import { InsufficientGasModal } from "@/components/ui";
import {
  AdminDashboardTab,
  AdminFundedTab,
  AdminMonitorTab,
  AdminReviewModal,
} from "@/components/features";

// ── Types ──────────────────────────────────────────────────────────────────
interface DPWHNationalAdminPortalProps {
  setCurrentPage: (page: string) => void;
  initialTab?: string;
}

const PROPOSAL_PAGE_SIZE = 8;

// ── Component ──────────────────────────────────────────────────────────────
export function DPWHNationalAdminPortal({ setCurrentPage, initialTab }: DPWHNationalAdminPortalProps) {
  const {
    projects,
    milestones,
    auditEntries,
    gasError,
    clearGasError,
    activeTab,
    setActiveTab,
    dashboardSortMode,
    setDashboardSortMode,
    expandedRegion,
    setExpandedRegion,
    regionPage,
    setRegionPage,
    regionSearch,
    setRegionSearch,
    monitorSearch,
    setMonitorSearch,
    monitorRoleFilter,
    setMonitorRoleFilter,
    monitorActionFilter,
    setMonitorActionFilter,
    expandedAuditId,
    setExpandedAuditId,
    expandedFlagProjectId,
    setExpandedFlagProjectId,
    showReviewModal,
    reviewModalType,
    approvalRemarks,
    setApprovalRemarks,
    proposalRejectionReason,
    setProposalRejectionReason,
    isApproving,
    isProposalReviewing,
    docVerifyTooltip,
    setDocVerifyTooltip,
    saaReference,
    setSaaReference,
    finalApprovedBudget,
    setFinalApprovedBudget,
    showCelebration,
    setShowCelebration,
    celebrationProject,
    notification,
    setNotification,
    proposalInbox,
    fundedProjects,
    flaggedProjectMetrics,
    selectedProject,
    selectedProjectFundingRestrictionWarning,
    openProposalModal,
    closeModal,
    handleDisconnect,
    handleProposalApprove,
    handleProposalReject,
    handleApprove,
    tabs,
  } = useDpwhNationalPortal({ initialTab, setCurrentPage });

  const [proposalPage, setProposalPage] = useState(1);
  const proposalTotalPages = Math.max(1, Math.ceil(proposalInbox.length / PROPOSAL_PAGE_SIZE));

  useEffect(() => {
    setProposalPage(1);
  }, [activeTab, proposalInbox.length]);

  const pagedProposalInbox = useMemo(() => {
    const safePage = Math.min(proposalPage, proposalTotalPages);
    const start = (safePage - 1) * PROPOSAL_PAGE_SIZE;
    return proposalInbox.slice(start, start + PROPOSAL_PAGE_SIZE);
  }, [proposalInbox, proposalPage, proposalTotalPages]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="pt-20 min-h-screen bg-background">

      {/* ── Toast notification ── */}
      {notification.show && (
        <div className="fixed top-24 right-6 z-50 animate-in slide-in-from-right fade-in duration-300">
          <div className="flex items-center gap-3 px-5 py-3 rounded-lg border bg-card border-primary/30 text-foreground">
            <CheckCircle className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">{notification.message}</span>
            <button
              onClick={() => setNotification({ show: false, message: "", type: "success" })}
              className="ml-2 opacity-60 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Celebration modal ── */}
      {showCelebration && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border-2 border-primary rounded-2xl max-w-md w-full text-center p-6 animate-in zoom-in duration-300">
            <div className="w-16 h-16 mx-auto mb-3 bg-primary/10 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground mb-2">Budget Allocated!</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Funds have been successfully allocated and deployed to the blockchain ledger for:
            </p>
            <p className="text-sm font-semibold text-primary mb-4">
              &ldquo;{celebrationProject}&rdquo;
            </p>
            <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground mb-3">
              <span>RDC Endorsed</span>
              <span>&rarr;</span>
              <span>NBA Verified</span>
              <span>&rarr;</span>
              <span className="font-bold text-primary">Funded &amp; Active</span>
            </div>
            <Button
              onClick={() => setShowCelebration(false)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-foreground">
                DPWH National
              </h1>
              <p className="text-muted-foreground text-xs mt-0.5">
                National funding source and budget approval
              </p>
            </div>
            <Button
              onClick={handleDisconnect}
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Disconnect
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">

        {/* ── Tab navigation ── */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-3 py-2 text-sm font-medium transition-all rounded-t-lg whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none rounded-full bg-primary text-primary-foreground">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Pending proposals alert banner (shows on Dashboard) ── */}
        {activeTab === "dashboard" && proposalInbox.length > 0 && (
          <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-500">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {proposalInbox.length} Budget Proposal{proposalInbox.length !== 1 ? "s" : ""} Awaiting Your Review
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  RDC submitted proposal{proposalInbox.length !== 1 ? "s" : ""} that require{proposalInbox.length === 1 ? "s" : ""} National Budget Authority approval before the project can proceed.
                </p>
              </div>
            </div>
            <Button
              onClick={() => setActiveTab("proposals")}
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shrink-0"
            >
              Review Proposals
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* ── Tab content ── */}
        {activeTab === "dashboard" && (
          <AdminDashboardTab
            projects={projects}
            auditEntries={auditEntries}
            milestones={milestones}
            dashboardSortMode={dashboardSortMode}
            setDashboardSortMode={setDashboardSortMode}
            expandedRegion={expandedRegion}
            setExpandedRegion={setExpandedRegion}
            regionPage={regionPage}
            setRegionPage={setRegionPage}
            regionSearch={regionSearch}
            setRegionSearch={setRegionSearch}
            proposalInboxCount={proposalInbox.length}
            projectInboxCount={0}
            setActiveTab={setActiveTab}
          />
        )}

        {/* ── Proposals tab — dedicated for RDC proposal approval ── */}
        {activeTab === "proposals" && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <p className="text-sm font-semibold text-foreground">RDC Regional Proposals — Review & Fund</p>
                  <p className="text-[11px] text-muted-foreground">
                    Review proposals, set final approved budget, sign with MetaMask to fund.
                  </p>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                  proposalInbox.length > 0
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : "border-border bg-muted text-muted-foreground"
                }`}>
                  {proposalInbox.length} pending
                </span>
              </div>

              {proposalInbox.length === 0 ? (
                <div className="py-16 text-center">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 text-primary/30" />
                  <p className="text-sm font-semibold text-foreground">All Caught Up!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No budget proposals awaiting your review.
                  </p>
                </div>
              ) : (
                <>
                  {/* GAA Flow reminder */}
                  <div className="mx-5 mt-4 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
                    <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0" />
                    <p className="text-[10px] text-muted-foreground">
                      <strong>GAA Flow:</strong> RDC Proposes → <strong className="text-foreground">You review &amp; fund here (MetaMask)</strong> → RD Assigns Personnel &amp; Contracts
                    </p>
                  </div>

                  {/* Table header */}
                  <div className="min-w-175 grid grid-cols-[5rem_1fr_6rem_6rem_6rem_7rem_7rem] gap-x-3 px-5 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">
                    <span>ID</span>
                    <span>Proposal Title</span>
                    <span>Region</span>
                    <span>Location</span>
                    <span>Type</span>
                    <span className="text-right">Est. Budget</span>
                    <span className="text-center">Action</span>
                  </div>

                  {/* Table rows */}
                  <div className="divide-y divide-border">
                    {pagedProposalInbox.map((p) => (
                      <div
                        key={p.id}
                        className="min-w-175 grid grid-cols-[5rem_1fr_6rem_6rem_6rem_7rem_7rem] gap-x-3 items-center px-5 py-3.5 hover:bg-muted/30 transition-colors"
                      >
                        <span className="text-[11px] font-mono text-muted-foreground truncate">
                          {p.id}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{p.title}</p>
                          <span
                            className={`text-[10px] font-medium ${
                              p.priorityLevel === "Critical"
                                ? "text-foreground font-bold"
                                : p.priorityLevel === "High"
                                ? "text-primary"
                                : "text-muted-foreground"
                            }`}
                          >
                            {p.priorityLevel} priority
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {p.dpwhRegion || "—"}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {p.municipality}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {p.projectType}
                        </span>
                        <span className="text-right text-[11px] font-semibold text-foreground tabular-nums">
                          {p.approvedBudget}
                        </span>
                        <div className="flex justify-center">
                          <button
                            onClick={() => openProposalModal(p.id)}
                            className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                          >
                            Review & Fund
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {proposalInbox.length > 0 && (
                    <PaginationControls
                      page={Math.min(proposalPage, proposalTotalPages)}
                      totalPages={proposalTotalPages}
                      onPageChange={setProposalPage}
                      className="py-3"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "funded" && (
          <AdminFundedTab fundedProjects={fundedProjects} />
        )}

        {activeTab === "flags" && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <p className="text-sm font-semibold text-foreground">Current Flagged Projects</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                High-risk project is flagged when Financial % is greater than Physical % + {HIGH_RISK_GAP_THRESHOLD_PCT}%.
              </p>
            </div>

            {flaggedProjectMetrics.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
                <p className="text-sm font-medium text-muted-foreground">No flagged projects</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  All projects are currently within the integrity threshold.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-x-auto">
                <div className="min-w-260 grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_1.3fr_2rem] gap-x-3 px-5 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">
                  <span>Project</span>
                  <span>Region</span>
                  <span className="text-right">Budget</span>
                  <span className="text-right">Spent</span>
                  <span className="text-right">Financial</span>
                  <span className="text-right">Physical</span>
                  <span className="text-right">Gap</span>
                  <span>Why Flagged</span>
                  <span className="text-center">More</span>
                </div>
                <div className="divide-y divide-border">
                  {flaggedProjectMetrics.map((metric) => {
                    const sourceProject = projects.find((project) => project.id === metric.projectId);
                    const isExpanded = expandedFlagProjectId === metric.projectId;
                    const siteEngineerName =
                      sourceProject?.engineerName || sourceProject?.inspectorName || "Unassigned";
                    const flagReason =
                      `Financial ${fmtPct(metric.financialProgressPct)} is ahead of Physical ${fmtPct(metric.physicalProgressPct)} by ${fmtPct(metric.gapPct)}.`;

                    return (
                      <div key={metric.projectId} className="min-w-260">
                        <button
                          onClick={() =>
                            setExpandedFlagProjectId((prev) =>
                              prev === metric.projectId ? null : metric.projectId
                            )
                          }
                          className="w-full grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_1.3fr_2rem] gap-x-3 items-center px-5 py-3 text-left hover:bg-muted/30 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{metric.projectTitle}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {sourceProject?.municipality || "Unknown municipality"}
                              {sourceProject?.province ? `, ${sourceProject.province}` : ""}
                            </p>
                          </div>
                          <span className="text-[11px] text-muted-foreground truncate">{metric.region}</span>
                          <span className="text-right text-[11px] font-semibold text-foreground tabular-nums">
                            {fmtPhp(metric.allocatedBudget)}
                          </span>
                          <span className="text-right text-[11px] font-semibold text-foreground tabular-nums">
                            {fmtPhp(metric.disbursedAmount)}
                          </span>
                          <span className="text-right text-[11px] font-semibold text-primary tabular-nums">
                            {fmtPct(metric.financialProgressPct)}
                          </span>
                          <span className="text-right text-[11px] font-semibold text-foreground tabular-nums">
                            {fmtPct(metric.physicalProgressPct)}
                          </span>
                          <span className="text-right text-[11px] font-bold text-rose-700 tabular-nums">
                            {fmtPct(metric.gapPct)}
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate" title={flagReason}>
                            {flagReason}
                          </span>
                          <span className="flex justify-center">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-border bg-muted/20 px-5 py-3.5 space-y-3">
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                              <p className="font-semibold">Why this project was flagged</p>
                              <p className="mt-1">
                                Financial utilization ({fmtPct(metric.financialProgressPct)}) exceeds physical accomplishment ({fmtPct(metric.physicalProgressPct)}) by {fmtPct(metric.gapPct)}, which is above the {HIGH_RISK_GAP_THRESHOLD_PCT}% integrity threshold.
                              </p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
                              <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Assigned Contractor</p>
                                <p className="mt-1 font-semibold text-foreground">
                                  {sourceProject?.contractorName || "Unassigned"}
                                </p>
                                <p
                                  className="mt-1 font-mono text-[11px] text-muted-foreground break-all"
                                  title={sourceProject?.contractorWallet || "No wallet assigned"}
                                >
                                  {maskWalletAddress(sourceProject?.contractorWallet)}
                                </p>
                              </div>

                              <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Assigned Site Engineer</p>
                                <p className="mt-1 font-semibold text-foreground">{siteEngineerName}</p>
                                <p
                                  className="mt-1 font-mono text-[11px] text-muted-foreground break-all"
                                  title={sourceProject?.engineerWallet || "No wallet assigned"}
                                >
                                  {maskWalletAddress(sourceProject?.engineerWallet)}
                                </p>
                              </div>

                              <div className="rounded-lg border border-border bg-card px-3 py-2.5">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Integrity Snapshot</p>
                                <p className="mt-1 text-foreground">
                                  Verified Milestones: <span className="font-semibold">{metric.verifiedMilestones}</span> / {metric.totalMilestones}
                                </p>
                                <p className="mt-1 text-foreground">
                                  Project Status: <span className="font-semibold">{sourceProject?.status?.replace(/_/g, " ") || "Unknown"}</span>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                        </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "audit" && (
          <AdminMonitorTab
            monitorSearch={monitorSearch}
            setMonitorSearch={setMonitorSearch}
            monitorRoleFilter={monitorRoleFilter}
            setMonitorRoleFilter={setMonitorRoleFilter}
            monitorActionFilter={monitorActionFilter}
            setMonitorActionFilter={setMonitorActionFilter}
            expandedAuditId={expandedAuditId}
            setExpandedAuditId={setExpandedAuditId}
          />
        )}

        {activeTab === "users" && <AdminUserManagement />}
      </div>

      {/* ── Review modal ── */}
      <AdminReviewModal
        show={showReviewModal}
        selectedProject={selectedProject}
        reviewModalType={reviewModalType}
        proposalRejectionReason={proposalRejectionReason}
        setProposalRejectionReason={setProposalRejectionReason}
        isProposalReviewing={isProposalReviewing}
        onProposalApprove={handleProposalApprove}
        onProposalReject={handleProposalReject}
        approvalRemarks={approvalRemarks}
        setApprovalRemarks={setApprovalRemarks}
        saaReference={saaReference}
        setSaaReference={setSaaReference}
        finalApprovedBudget={finalApprovedBudget}
        setFinalApprovedBudget={setFinalApprovedBudget}
        isApproving={isApproving}
        onApprove={handleApprove}
        fundingRestrictionWarning={selectedProjectFundingRestrictionWarning}
        justificationMinimumLength={MIN_INTEGRITY_JUSTIFICATION_LENGTH}
        docVerifyTooltip={docVerifyTooltip}
        setDocVerifyTooltip={setDocVerifyTooltip}
        onClose={closeModal}
      />

      {/* ── Insufficient Gas Modal ── */}
      <InsufficientGasModal open={gasError.open} onClose={clearGasError} message={gasError.message} />
    </div>
  );
}
