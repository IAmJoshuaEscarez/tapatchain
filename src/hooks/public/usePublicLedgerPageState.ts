import { useCallback, useEffect, useState } from "react";

import { useAuditTrail } from "@/context/AuditTrailContext";
import { useMilestoneContext } from "@/context/MilestoneContext";
import { useProjectContext } from "@/context/ProjectContext";
import { communityFeedbackApi, publicReportApi, blockchainApi } from "@/services/api";

type FeedChannel = "global" | "financial" | "decision" | "community";
type ProjectChannel = "global" | "financial" | "decision";
type ProjectLifecycleFilter = "all" | "proposals" | "funded";

interface CommunityFeedbackRow {
  id: string;
  projectId: string;
  projectName: string;
  location: string;
  photo?: string;
  caption: string;
  submittedBy?: string;
  walletAddress?: string;
  createdAt: string;
}

interface CitizenReportRow {
  id: string;
  projectId: string;
  projectName: string;
  reportType: string;
  description: string;
  reportedBy?: string;
  walletAddress?: string;
  photo?: string;
  reportedDate: string;
}

interface LedgerTransactionRow {
  id: string;
  projectId: string;
  amount: number;
  type: string;
  createdAt: string;
  blockchainTxHash?: string;
  blockchainDataHash?: string;
  offchainDataHash?: string;
  integrityStatus?: string;
  isTampered?: boolean;
  tamperedAt?: string;
  integrityCheckedAt?: string;
}

function toEpoch(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
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

export function usePublicLedgerPageState() {
  const [activeChannel, setActiveChannel] = useState<FeedChannel>("financial");
  const [searchQuery, setSearchQuery] = useState("");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedMunicipality, setSelectedMunicipality] = useState("");
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [selectedStatusType, setSelectedStatusType] = useState("");
  const [projectLifecycleFilter, setProjectLifecycleFilter] = useState<ProjectLifecycleFilter>("funded");
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [projectChannelById, setProjectChannelById] = useState<Record<string, ProjectChannel>>({});
  const [projectChannelQueryByKey, setProjectChannelQueryByKey] = useState<Record<string, string>>({});
  const [projectChannelIssueOnlyByKey, setProjectChannelIssueOnlyByKey] = useState<Record<string, boolean>>({});
  const [projectChannelVisibleCountByKey, setProjectChannelVisibleCountByKey] = useState<Record<string, number>>({});
  const [communityFeedback, setCommunityFeedback] = useState<CommunityFeedbackRow[]>([]);
  const [citizenReports, setCitizenReports] = useState<CitizenReportRow[]>([]);
  const [ledgerTransactions, setLedgerTransactions] = useState<LedgerTransactionRow[]>([]);

  const { projects: rdcProjects, refreshProjects } = useProjectContext();
  const { milestones, refreshMilestones } = useMilestoneContext();
  const { auditEntries } = useAuditTrail();

  const loadCommunityData = useCallback(async () => {
    try {
      const [feedbackResponse, reportResponse] = await Promise.all([
        communityFeedbackApi.getAll(),
        publicReportApi.getAll(),
      ]);

      const mappedFeedback: CommunityFeedbackRow[] = (feedbackResponse.data ?? [])
        .map((item) => ({
          id: String(item.id ?? "").trim(),
          projectId: String(item.projectId ?? "").trim(),
          projectName: String(item.projectName ?? "").trim(),
          location: String(item.location ?? "").trim(),
          photo: item.photo ? String(item.photo).trim() : undefined,
          caption: String(item.caption ?? "").trim(),
          submittedBy: item.submittedBy ? String(item.submittedBy).trim() : undefined,
          walletAddress: item.walletAddress ? String(item.walletAddress).trim() : undefined,
          createdAt: String(item.createdAt ?? "").trim(),
        }))
        .filter((row) => row.id && row.projectId && toEpoch(row.createdAt) > 0);

      const mappedReports: CitizenReportRow[] = (reportResponse.data ?? [])
        .map((item) => ({
          id: String(item.id ?? "").trim(),
          projectId: String(item.projectId ?? "").trim(),
          projectName: String(item.projectName ?? "").trim(),
          reportType: String(item.reportType ?? "").trim(),
          description: String(item.description ?? "").trim(),
          reportedBy: item.reportedBy ? String(item.reportedBy).trim() : undefined,
          walletAddress: item.walletAddress ? String(item.walletAddress).trim() : undefined,
          photo: item.photo ? String(item.photo).trim() : undefined,
          reportedDate: String(item.reportedDate ?? "").trim(),
        }))
        .filter((row) => row.id && row.projectId && toEpoch(row.reportedDate) > 0);

      setCommunityFeedback(mappedFeedback);
      setCitizenReports(mappedReports);
    } catch {
      setCommunityFeedback([]);
      setCitizenReports([]);
    }
  }, []);

  const loadLedgerTransactions = useCallback(async () => {
    try {
      const response = await blockchainApi.getTransactions();

      const mappedTransactions: LedgerTransactionRow[] = (response.data ?? [])
        .map((item: Record<string, unknown>) => {
          const rawAmount =
            typeof item.amount === "number"
              ? item.amount
              : typeof item.amount === "string"
                ? Number(item.amount)
                : 0;

          return {
            id: String(item.id ?? "").trim(),
            projectId: String(item.projectId ?? "").trim(),
            amount: Number.isFinite(rawAmount) ? rawAmount : 0,
            type: String(item.type ?? "").trim(),
            createdAt: String(item.createdAt ?? "").trim(),
            blockchainTxHash:
              typeof item.blockchainTxHash === "string" && item.blockchainTxHash.trim()
                ? item.blockchainTxHash.trim()
                : undefined,
            blockchainDataHash:
              typeof item.blockchainDataHash === "string" && item.blockchainDataHash.trim()
                ? item.blockchainDataHash.trim()
                : undefined,
            offchainDataHash:
              typeof item.offchainDataHash === "string" && item.offchainDataHash.trim()
                ? item.offchainDataHash.trim()
                : undefined,
            integrityStatus:
              typeof item.integrityStatus === "string" && item.integrityStatus.trim()
                ? item.integrityStatus.trim()
                : undefined,
            isTampered: parseBackendBoolean(item.isTampered),
            tamperedAt:
              typeof item.tamperedAt === "string" && item.tamperedAt.trim()
                ? item.tamperedAt.trim()
                : undefined,
            integrityCheckedAt:
              typeof item.integrityCheckedAt === "string" && item.integrityCheckedAt.trim()
                ? item.integrityCheckedAt.trim()
                : undefined,
          };
        })
        .filter((row) => row.id && row.projectId && toEpoch(row.createdAt) > 0 && row.amount > 0);

      setLedgerTransactions(mappedTransactions);
    } catch {
      setLedgerTransactions([]);
    }
  }, []);

  useEffect(() => {
    const initialSyncId = window.setTimeout(() => {
      void loadCommunityData();
      void loadLedgerTransactions();
      void refreshProjects();
      void refreshMilestones();
    }, 0);

    const intervalId = window.setInterval(() => {
      void loadCommunityData();
      void loadLedgerTransactions();
      void refreshProjects();
      void refreshMilestones();
    }, 30000);

    return () => {
      window.clearTimeout(initialSyncId);
      window.clearInterval(intervalId);
    };
  }, [loadCommunityData, loadLedgerTransactions, refreshMilestones, refreshProjects]);

  return {
    activeChannel,
    setActiveChannel,
    searchQuery,
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
    setCommunityFeedback,
    citizenReports,
    setCitizenReports,
    ledgerTransactions,
    setLedgerTransactions,
    rdcProjects,
    milestones,
    auditEntries,
    refreshProjects,
    refreshMilestones,
  };
}
