import { useEffect, useState } from "react";
import { useProjectContext, type RDCProject } from "@/context/ProjectContext";
import { useMilestoneContext } from "@/context/MilestoneContext";
import { useNotifications, notificationHelpers } from "@/context/NotificationContext";
import { useAuditTrail, type AuditActorRole } from "@/context/AuditTrailContext";
import { useWallet } from "@/context/WalletContext";
import {
  buildIntegrityRestrictionMessage,
  HIGH_RISK_GAP_THRESHOLD_PCT,
  useFinancialPhysicalIntegrity,
} from "@/features/project";
import { signFunding, signAndLog, logToAuditTrail } from "@/services/signatureGate";
import { useGasGuard } from "@/hooks/useGasGuard";

export type ActiveTab = "dashboard" | "proposals" | "funded" | "flags" | "audit" | "users";

export const MIN_INTEGRITY_JUSTIFICATION_LENGTH = 20;

export function fmtPhp(value: number): string {
  if (value >= 1e9) return `PHP ${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `PHP ${(value / 1e6).toFixed(1)}M`;
  return `PHP ${value.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

export function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function maskWalletAddress(wallet?: string): string {
  const value = String(wallet ?? "").trim();
  if (!value) return "No wallet assigned";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

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

interface UseDpwhNationalPortalParams {
  initialTab?: string;
  setCurrentPage: (page: string) => void;
}

export function useDpwhNationalPortal({ initialTab, setCurrentPage }: UseDpwhNationalPortalParams) {
  const { projects, updateProject, refreshProjects } = useProjectContext();
  const { milestones, refreshMilestones } = useMilestoneContext();
  const { disconnectWallet, walletAddress } = useWallet();
  const { addNotification } = useNotifications();
  const { addAuditEntry, auditEntries } = useAuditTrail();
  const { gasError, clearGasError, handleGasError } = useGasGuard();

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    (["dashboard", "proposals", "funded", "flags", "audit", "users"] as ActiveTab[]).includes(initialTab as ActiveTab)
      ? (initialTab as ActiveTab)
      : "dashboard"
  );

  useEffect(() => {
    if (initialTab && (["dashboard", "proposals", "funded", "flags", "audit", "users"] as ActiveTab[]).includes(initialTab as ActiveTab)) {
      setActiveTab(initialTab as ActiveTab);
    }
  }, [initialTab]);

  useEffect(() => {
    void refreshProjects();
    void refreshMilestones();
  }, [refreshProjects, refreshMilestones]);

  const [dashboardSortMode, setDashboardSortMode] = useState<"budget" | "projects" | "activity">("budget");
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);
  const [regionPage, setRegionPage] = useState(0);
  const [regionSearch, setRegionSearch] = useState("");

  const [monitorSearch, setMonitorSearch] = useState("");
  const [monitorRoleFilter, setMonitorRoleFilter] = useState<AuditActorRole | "all">("all");
  const [monitorActionFilter, setMonitorActionFilter] = useState<
    "all" | "approved" | "rejected" | "submitted" | "created" | "disbursed"
  >("all");
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [expandedFlagProjectId, setExpandedFlagProjectId] = useState<string | null>(null);

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [reviewModalType, setReviewModalType] = useState<"proposal" | "project">("project");
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [proposalRejectionReason, setProposalRejectionReason] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [isProposalReviewing, setIsProposalReviewing] = useState(false);
  const [docVerifyTooltip, setDocVerifyTooltip] = useState<string | null>(null);
  const [saaReference, setSaaReference] = useState("");
  const [finalApprovedBudget, setFinalApprovedBudget] = useState("");

  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationProject, setCelebrationProject] = useState("");
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: "success" | "info";
  }>({ show: false, message: "", type: "success" });

  const proposalInbox = projects.filter((p) => isPendingFundingProject(p));
  const fundedProjects = projects.filter((p) => isFundedLifecycleProject(p));

  const { regionMetricByRegion, projectMetrics, highRiskProjectCount } = useFinancialPhysicalIntegrity({
    projects,
    milestones,
  });

  const flaggedProjectMetrics = projectMetrics
    .filter((metric) => metric.isHighRisk)
    .sort(
      (left, right) =>
        right.gapPct - left.gapPct || right.financialProgressPct - left.financialProgressPct
    );

  const selectedProject =
    selectedProjectId ? projects.find((p) => p.id === selectedProjectId) ?? null : null;

  const resolveProjectRegionKey = (project?: RDCProject | null): string => {
    if (!project) return "";
    const dpwhRegion = String(project.dpwhRegion ?? "").trim();
    if (dpwhRegion) return dpwhRegion;
    const region = String(project.region ?? "").trim();
    if (region) return region;
    return "UNASSIGNED";
  };

  const getSelectedRegionIntegrityMetric = (project?: RDCProject | null) => {
    const regionKey = resolveProjectRegionKey(project);
    if (!regionKey) return null;
    return regionMetricByRegion[regionKey] ?? null;
  };

  const getFundingRestrictionMessage = (project?: RDCProject | null): string | null => {
    const regionMetric = getSelectedRegionIntegrityMetric(project);
    if (!regionMetric || !regionMetric.isHighRisk) return null;

    if (approvalRemarks.trim().length >= MIN_INTEGRITY_JUSTIFICATION_LENGTH) {
      return null;
    }

    return buildIntegrityRestrictionMessage(regionMetric);
  };

  const selectedProjectRegionIntegrity = getSelectedRegionIntegrityMetric(selectedProject);
  const selectedProjectFundingRestrictionWarning =
    selectedProjectRegionIntegrity && selectedProjectRegionIntegrity.isHighRisk
      ? {
          region: selectedProjectRegionIntegrity.region,
          financialProgressPct: selectedProjectRegionIntegrity.financialProgressPct,
          physicalProgressPct: selectedProjectRegionIntegrity.physicalProgressPct,
          requiresJustification:
            approvalRemarks.trim().length < MIN_INTEGRITY_JUSTIFICATION_LENGTH,
          message: buildIntegrityRestrictionMessage(selectedProjectRegionIntegrity),
        }
      : null;

  const anomalyCount = auditEntries.filter((e) => e.actionType.includes("REJECTED")).length;

  const openProposalModal = (proposalId: string) => {
    setSelectedProjectId(proposalId);
    setApprovalRemarks("");
    setProposalRejectionReason("");
    setSaaReference("");
    setFinalApprovedBudget("");
    setReviewModalType("proposal");
    setShowReviewModal(true);
  };

  const closeModal = () => {
    setShowReviewModal(false);
    setSelectedProjectId(null);
  };

  const handleDisconnect = async () => {
    await disconnectWallet();
    setCurrentPage("home");
  };

  const handleProposalApprove = async () => {
    if (!selectedProjectId) return;
    const proposal = projects.find((p) => p.id === selectedProjectId);
    const restrictionMessage = getFundingRestrictionMessage(proposal);
    if (restrictionMessage) {
      setNotification({ show: true, message: restrictionMessage, type: "info" });
      setTimeout(() => setNotification({ show: false, message: "", type: "success" }), 7000);
      return;
    }

    setIsProposalReviewing(true);

    const estBudget = proposal ? parseFloat(proposal.approvedBudget.replace(/[^\d.]/g, "")) || 0 : 0;
    const finalBudget = finalApprovedBudget.trim()
      ? parseFloat(finalApprovedBudget.replace(/[^\d.]/g, "")) || estBudget
      : estBudget;
    const saaRef = saaReference.trim() || `SAA-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    try {
      const signResult = await signFunding({
        referenceId: selectedProjectId,
        saaReference: saaRef,
        regionCode: proposal ? (parseInt(proposal.dpwhRegion?.replace(/\D/g, "") || "0") || 11) : 0,
        allocatedAmount: finalBudget,
        description: `National Budget Authority funds proposal "${proposal?.title}" with SAA ${saaRef}, approved budget ₱${finalBudget.toLocaleString("en-PH")}`,
      });

      if (!signResult.txHash || !signResult.onChainConfirmed) {
        throw new Error("Blockchain transaction was not confirmed. Funding was NOT saved.");
      }

      await updateProject(selectedProjectId, {
        status: "FUNDED",
        approvedBudget: `₱${finalBudget.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
        nationalFundingHash: signResult.txHash,
        blockchainDataHash: signResult.txHash || signResult.dataHash,
        nationalApprovedBy: "NBA Director - National Budget Authority",
        nationalApprovedDate: new Date().toISOString().split("T")[0],
        nationalRemarks: approvalRemarks || `Budget approved. SAA: ${saaRef}`,
        saaReference: saaRef,
        gaaReference: saaRef,
        finalApprovedBudget: finalApprovedBudget.trim()
          ? (finalApprovedBudget.startsWith("₱") ? finalApprovedBudget : `₱${finalApprovedBudget}`)
          : proposal?.approvedBudget ?? "",
      });

      if (proposal) {
        addNotification(notificationHelpers.budgetApproved(proposal.title, proposal.id, finalApprovedBudget || proposal.approvedBudget));
        addAuditEntry({
          actionType: "NATIONAL_APPROVED",
          actorRole: "admin",
          actorName: "NBA Director - National Budget Authority",
          projectId: proposal.id,
          projectName: proposal.title,
          description: `Proposal "${proposal.title}" reviewed, funded & signed on-chain (SAA: ${saaRef}). Final budget: ₱${finalBudget.toLocaleString("en-PH")}`,
          amount: finalBudget,
          previousStatus: proposal.status,
          newStatus: "FUNDED",
          remarks: approvalRemarks || `Budget approved from GAA. SAA Reference: ${saaRef}`,
          metadata: { txHash: signResult.txHash, saaReference: saaRef, finalApprovedBudget: `₱${finalBudget.toLocaleString("en-PH")}` },
        });

        logToAuditTrail(signResult, {
          role: "national_budget",
          actionType: "PROPOSAL_FUNDED",
          referenceId: proposal.id,
          description: `National funded proposal "${proposal.title}" via SAA ${saaRef}`,
          actorName: "NBA Director",
          projectId: proposal.id,
          projectName: proposal.title,
        }).catch(() => {});
      }

      closeModal();
      setSaaReference("");
      setFinalApprovedBudget("");
      setApprovalRemarks("");
      setCelebrationProject(proposal?.title ?? "Project");
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 5000);
      setActiveTab("funded");
    } catch (err) {
      if (handleGasError(err)) return;
      const msg = err instanceof Error ? err.message : "Signing failed";
      if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
        setNotification({ show: true, message: "MetaMask signature rejected — funding cancelled.", type: "info" });
      } else {
        setNotification({ show: true, message: `Funding sign failed: ${msg}`, type: "info" });
      }
      setTimeout(() => setNotification({ show: false, message: "", type: "success" }), 5000);
    } finally {
      setIsProposalReviewing(false);
    }
  };

  const handleProposalReject = async () => {
    if (!selectedProjectId || !proposalRejectionReason.trim()) return;
    setIsProposalReviewing(true);

    const proposal = projects.find((p) => p.id === selectedProjectId);

    try {
      const signResult = await signAndLog({
        role: "admin",
        actionType: "PROPOSAL_REJECTED",
        referenceId: selectedProjectId,
        description: `National Budget Authority rejects proposal "${proposal?.title}" — Reason: ${proposalRejectionReason}`,
        metadata: { projectId: selectedProjectId, reason: proposalRejectionReason },
      });

      if (!signResult.txHash || !signResult.onChainConfirmed) {
        throw new Error("Blockchain transaction was not confirmed. Rejection was NOT saved.");
      }

      updateProject(selectedProjectId, {
        status: "REJECTED",
        proposalRejectedReason: proposalRejectionReason,
        blockchainDataHash: signResult.txHash || signResult.dataHash,
      });

      if (proposal) {
        addNotification(
          notificationHelpers.proposalRejected(proposal.title, proposal.id, proposalRejectionReason)
        );
        addAuditEntry({
          actionType: "PROPOSAL_REJECTED",
          actorRole: "admin",
          actorName: "NBA Director - National Budget Authority",
          projectId: proposal.id,
          projectName: proposal.title,
          description: `Budget proposal "${proposal.title}" rejected by National. Signed on-chain (${signResult.txHash.slice(0, 10)}...)`,
          amount: 0,
          previousStatus: proposal.status,
          newStatus: "REJECTED",
          remarks: proposalRejectionReason,
          metadata: { txHash: signResult.txHash },
        });

        logToAuditTrail(signResult, {
          role: "admin",
          actionType: "PROPOSAL_REJECTED",
          referenceId: proposal.id,
          description: `National rejected proposal "${proposal.title}"`,
          actorName: "NBA Director",
          projectId: proposal.id,
          projectName: proposal.title,
        }).catch(() => {});
      }

      closeModal();
      const name = proposal?.title || "Proposal";
      setNotification({
        show: true,
        message: `Proposal "${name}" rejected & signed on-chain. RDC has been notified.`,
        type: "info",
      });
      setTimeout(() => setNotification({ show: false, message: "", type: "success" }), 5000);
    } catch (err) {
      if (handleGasError(err)) { setIsProposalReviewing(false); return; }
      const msg = err instanceof Error ? err.message : "Signing failed";
      if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
        setNotification({ show: true, message: "MetaMask signature rejected — rejection cancelled. No data was saved.", type: "info" });
      } else {
        setNotification({ show: true, message: `Rejection sign failed: ${msg}`, type: "info" });
      }
      setTimeout(() => setNotification({ show: false, message: "", type: "success" }), 5000);
    } finally {
      setIsProposalReviewing(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedProjectId) return;
    const project = projects.find((p) => p.id === selectedProjectId);
    const restrictionMessage = getFundingRestrictionMessage(project);
    if (restrictionMessage) {
      setNotification({ show: true, message: restrictionMessage, type: "info" });
      setTimeout(() => setNotification({ show: false, message: "", type: "success" }), 7000);
      return;
    }

    setIsApproving(true);

    const budgetAmount = project ? parseFloat(project.approvedBudget.replace(/[^\d.]/g, "")) || 0 : 0;
    const saaRef = saaReference.trim() || `SAA-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    try {
      const signResult = await signFunding({
        referenceId: selectedProjectId,
        saaReference: saaRef,
        regionCode: project ? (parseInt(project.dpwhRegion?.replace(/\D/g, "") || "0") || 11) : 0,
        allocatedAmount: budgetAmount,
        description: `National Budget Authority funds project "${project?.title}" with SAA ${saaRef}`,
      });

      if (!signResult.txHash || !signResult.onChainConfirmed) {
        throw new Error("Blockchain transaction was not confirmed. Funding was NOT saved.");
      }

      updateProject(selectedProjectId, {
        status: "FUNDED_AND_ACTIVE",
        nationalFundingHash: signResult.txHash,
        blockchainDataHash: signResult.txHash || signResult.dataHash,
        nationalApprovedBy: "NBA Director - National Budget Authority",
        nationalApprovedDate: new Date().toISOString().split("T")[0],
        nationalRemarks: approvalRemarks || `Budget approved. SAA: ${saaRef}`,
        saaReference: saaRef,
        gaaReference: saaRef,
      });

      if (project) {
        addAuditEntry({
          actionType: "NATIONAL_APPROVED",
          actorRole: "admin",
          actorName: "NBA Director - National Budget Authority",
          actorWallet: walletAddress,
          projectId: project.id,
          projectName: project.title,
          description: `Budget allocation approved & signed on-chain for "${project.title}" (SAA: ${saaRef})`,
          amount: budgetAmount,
          previousStatus: "SUBMITTED_TO_NATIONAL",
          newStatus: "FUNDED_AND_ACTIVE",
          remarks: approvalRemarks || `Budget approved from GAA. SAA Reference: ${saaRef}`,
          metadata: { txHash: signResult.txHash, saaReference: saaRef },
        });
        addAuditEntry({
          actionType: "BUDGET_RELEASED",
          actorRole: "admin",
          actorName: "Bureau of Treasury",
          actorWallet: walletAddress,
          projectId: project.id,
          projectName: project.title,
          description: `Initial fund tranche released for "${project.title}"`,
          amount: budgetAmount * 0.3,
          remarks: "First tranche - 30% of total budget released for mobilization",
          metadata: { tranche: 1, totalTranches: 4 },
        });
        addNotification(
          notificationHelpers.budgetApproved(project.title, project.id, project.approvedBudget)
        );

        logToAuditTrail(signResult, {
          role: "national_budget",
          actionType: "PROJECT_FUNDED",
          referenceId: project.id,
          description: `National Admin funded "${project.title}" via SAA ${saaRef}`,
          actorName: "NBA Director",
          projectId: project.id,
          projectName: project.title,
        }).catch(() => {});
      }

      closeModal();
      setSaaReference("");
      setCelebrationProject(project?.title || "Project");
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 4000);
      setActiveTab("funded");
    } catch (err) {
      if (handleGasError(err)) { setIsApproving(false); return; }
      const msg = err instanceof Error ? err.message : "Signing failed";
      if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
        setNotification({ show: true, message: "Signature rejected — funding cancelled.", type: "info" });
      } else {
        setNotification({ show: true, message: `Funding sign failed: ${msg}`, type: "info" });
      }
      setTimeout(() => setNotification({ show: false, message: "", type: "success" }), 5000);
    } finally {
      setIsApproving(false);
    }
  };

  const tabs: { id: ActiveTab; label: string; badge?: number }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "proposals", label: "Proposal Review & Funding", badge: proposalInbox.length },
    { id: "funded", label: `Funded (${fundedProjects.length})` },
    { id: "flags", label: highRiskProjectCount > 0 ? `Flags (${highRiskProjectCount})` : "Flags" },
    { id: "audit", label: anomalyCount > 0 ? `Audit Log ${anomalyCount}` : "Audit Log" },
    { id: "users", label: "Users" },
  ];

  return {
    projects,
    milestones,
    auditEntries,
    walletAddress,
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
    highRiskProjectCount,
    flaggedProjectMetrics,
    selectedProject,
    selectedProjectFundingRestrictionWarning,
    anomalyCount,
    openProposalModal,
    closeModal,
    handleDisconnect,
    handleProposalApprove,
    handleProposalReject,
    handleApprove,
    tabs,
  };
}

export { HIGH_RISK_GAP_THRESHOLD_PCT };
