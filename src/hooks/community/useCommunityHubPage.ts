import { useState, useEffect, useCallback, useMemo } from "react";
import { communityFeedbackApi, publicReportApi } from "@/services/api";
import { mapRDCToProject } from "@/lib/utils";
import { useProjectContext } from "@/context/ProjectContext";
import { useMilestoneContext, type Milestone } from "@/context/MilestoneContext";
import { useWallet } from "@/context/WalletContext";
import type { CommunityFeedback, PublicReport } from "@/types";
import { useLookup } from "@/hooks";

type ComposerMode = "feedback" | "reports";

interface CommunityComposerPrefill {
  mode?: ComposerMode;
  projectId?: string;
  projectName?: string;
  location?: string;
  region?: string;
  municipality?: string;
  barangay?: string;
}

const COMPOSER_PREFILL_KEY = "communityComposerPrefill.disabled";
const COMMUNITY_INITIAL_TAB_KEY = "communityInitialContentType";

function toEpoch(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMilestoneSortDate(milestone: Milestone): string {
  return (
    milestone.submittedDate ||
    milestone.rdPaymentDate ||
    milestone.coaApprovedDate ||
    milestone.inspectedDate ||
    milestone.gpsMetadata?.timestamp ||
    ""
  );
}

function formatMilestoneStatus(rawStatus?: string): string {
  const value = String(rawStatus ?? "").trim();
  if (!value) return "No milestone status";
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeCommunityPhoto(raw?: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  if (/^data:image\//i.test(value)) {
    const commaIndex = value.indexOf(",");
    if (commaIndex === -1) return value.replace(/\s+/g, "");

    const metadata = value.slice(0, commaIndex + 1);
    const payload = value
      .slice(commaIndex + 1)
      .replace(/\s+/g, "")
      .replace(/ /g, "+");

    return `${metadata}${payload}`;
  }

  if (/^(https?:\/\/|blob:)/i.test(value)) return value;

  const compact = value.replace(/\s+/g, "").replace(/ /g, "+");
  const looksLikeBase64 =
    compact.length > 64 &&
    (compact.startsWith("/9j/") ||
      compact.startsWith("iVBOR") ||
      compact.startsWith("R0lGOD") ||
      compact.startsWith("UklGR") ||
      /^[A-Za-z0-9+/=]+$/.test(compact));

  if (looksLikeBase64) {
    return `data:image/jpeg;base64,${compact}`;
  }

  return value;
}

interface UseCommunityHubPageParams {
  setCurrentPage: (page: string) => void;
}

export function useCommunityHubPage({ setCurrentPage }: UseCommunityHubPageParams) {
  const { userProfile, walletAddress } = useWallet();
  const { milestones } = useMilestoneContext();
  const [selectedFilter, setSelectedFilter] = useState<"all" | "verified">("all");
  const [contentType, setContentType] = useState<"feedback" | "reports">("feedback");
  const [communityFeedback, setCommunityFeedback] = useState<CommunityFeedback[]>([]);
  const [publicReports, setPublicReports] = useState<PublicReport[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [isSubmittingComposer, setIsSubmittingComposer] = useState(false);
  const [composerAlert, setComposerAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState({
    projectId: "",
    projectName: "",
    location: "",
    caption: "",
    photo: "",
  });
  const [reportDraft, setReportDraft] = useState({
    projectId: "",
    projectName: "",
    reportType: "Quality Concern",
    description: "",
    photo: "",
  });
  const { projects: rdcProjects } = useProjectContext();
  const { items: regionLookup } = useLookup("Region");
  const { items: reportTypeLookup } = useLookup("ReportType");
  const allProjects = rdcProjects.map(mapRDCToProject);
  const projectById = useMemo(
    () => new Map(allProjects.map((project) => [String(project.id), project])),
    [allProjects]
  );

  const latestMilestoneByProjectId = useMemo(() => {
    const byProject = new Map<string, Milestone>();

    for (const milestone of milestones) {
      const projectId = String(milestone.projectId ?? "").trim();
      if (!projectId) continue;

      const existing = byProject.get(projectId);
      if (!existing) {
        byProject.set(projectId, milestone);
        continue;
      }

      const existingEpoch = toEpoch(getMilestoneSortDate(existing));
      const currentEpoch = toEpoch(getMilestoneSortDate(milestone));
      if (currentEpoch >= existingEpoch) {
        byProject.set(projectId, milestone);
      }
    }

    return byProject;
  }, [milestones]);

  const reportTypeOptions = useMemo(() => {
    const options = reportTypeLookup
      .map((item) => String(item.name ?? "").trim())
      .filter(Boolean);

    if (options.length > 0) return options;
    return ["Quality Concern", "Safety Concern", "Delay Concern", "Positive Feedback"];
  }, [reportTypeLookup]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterMunicipality, setFilterMunicipality] = useState("");
  const [filterRegion, setFilterRegion] = useState("");

  const resolveProjectDraft = useCallback(
    (projectId: string) => {
      const selectedProject = allProjects.find((project) => String(project.id) === String(projectId));
      if (!selectedProject) {
        return {
          projectName: "",
          location: "",
        };
      }

      const location =
        [selectedProject.barangay, selectedProject.municipality, selectedProject.region || selectedProject.dpwhRegion]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
          .join(", ") || String(selectedProject.location ?? "").trim();

      return {
        projectName: String(selectedProject.name ?? "").trim(),
        location,
      };
    },
    [allProjects]
  );

  const loadData = useCallback(async () => {
    try {
      const [fbRes, rpRes] = await Promise.all([
        communityFeedbackApi.getAll().catch(() => ({ data: [] })),
        publicReportApi.getAll().catch(() => ({ data: [] })),
      ]);
      setCommunityFeedback(
        (fbRes.data ?? []).map((f) => ({
          id: f.id,
          projectId: f.projectId,
          projectName: f.projectName ?? "",
          location: f.location ?? "",
          photo: normalizeCommunityPhoto(f.photo),
          caption: f.caption ?? "",
          timestamp: f.createdAt ?? "",
          likes: f.likes ?? 0,
          verified: f.verified ?? false,
        }))
      );
      setPublicReports(
        (rpRes.data ?? []).map((r) => ({
          id: r.id,
          projectId: r.projectId,
          projectName: r.projectName ?? "",
          reportType: r.reportType ?? "",
          description: r.description ?? "",
          location: { lat: 0, lng: 0 },
          photosCount: r.photosCount ?? 0,
          photo: normalizeCommunityPhoto(r.photo),
          reportedBy: r.reportedBy ?? "",
          reportedDate: r.reportedDate ?? "",
          status: r.status ?? "",
        }))
      );
    } catch {
      // Keep UI functional with empty feeds on network errors.
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const initialTab = sessionStorage.getItem(COMMUNITY_INITIAL_TAB_KEY);
    if (initialTab === "feedback" || initialTab === "reports") {
      setContentType(initialTab);
    }
    sessionStorage.removeItem(COMMUNITY_INITIAL_TAB_KEY);
  }, []);

  useEffect(() => {
    const rawPrefill = sessionStorage.getItem(COMPOSER_PREFILL_KEY);
    if (!rawPrefill) return;

    try {
      const parsed = JSON.parse(rawPrefill) as CommunityComposerPrefill;
      const mode: ComposerMode = parsed.mode === "reports" ? "reports" : "feedback";
      const projectId = String(parsed.projectId ?? "").trim();
      const resolvedProject = resolveProjectDraft(projectId);
      const projectName = String(parsed.projectName ?? resolvedProject.projectName).trim();
      const fallbackLocation = [parsed.barangay, parsed.municipality, parsed.region]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(", ");
      const location = String(parsed.location ?? "").trim() || resolvedProject.location || fallbackLocation;

      setContentType(mode);
      setShowComposer(true);

      if (mode === "feedback") {
        setFeedbackDraft((prev) => ({
          ...prev,
          projectId,
          projectName,
          location,
          caption: prev.caption || (projectName ? `Feedback for ${projectName}: ` : ""),
        }));
      } else {
        setReportDraft((prev) => ({
          ...prev,
          projectId,
          projectName,
          reportType: prev.reportType || reportTypeOptions[0],
          description: prev.description || (projectName ? `Report for ${projectName}: ` : ""),
        }));
      }
    } catch {
      // Ignore invalid prefill payloads and keep standard page behavior.
    } finally {
      sessionStorage.removeItem(COMPOSER_PREFILL_KEY);
    }
  }, [reportTypeOptions, resolveProjectDraft]);

  const reporterDisplayName =
    String(userProfile?.displayName ?? "").trim() ||
    String(userProfile?.email ?? "").trim() ||
    "Citizen Reporter";
  const reporterWallet = walletAddress || userProfile?.walletAddress || undefined;

  const openComposer = (mode: ComposerMode) => {
    setContentType(mode);
    setComposerAlert(null);
    setShowComposer(true);
  };

  const closeComposer = () => {
    setShowComposer(false);
  };

  const getProjectCoreMeta = useCallback(
    (projectId: string) => {
      const project = projectById.get(String(projectId));
      const milestone = latestMilestoneByProjectId.get(String(projectId));

      const region = String(project?.region ?? project?.dpwhRegion ?? "").trim() || "Unknown Region";
      const municipality = String(project?.municipality ?? "").trim();
      const barangay = String(project?.barangay ?? "").trim();
      const locationLabel =
        [barangay, municipality].filter(Boolean).join(", ") ||
        String(project?.location ?? "").trim() ||
        "Unknown location";

      const milestoneName =
        String(milestone?.milestoneName ?? "").trim() ||
        String(project?.currentPhase ?? "").trim() ||
        "No milestone yet";

      const milestoneStatus = formatMilestoneStatus(milestone?.status);
      const projectProgress = Number.isFinite(Number(project?.progress))
        ? `${Number(project?.progress).toFixed(1)}%`
        : "N/A";

      return {
        region,
        municipality,
        barangay,
        locationLabel,
        milestoneName,
        milestoneStatus,
        projectProgress,
      };
    },
    [latestMilestoneByProjectId, projectById]
  );

  const handleFeedbackProjectChange = (projectId: string) => {
    const resolved = resolveProjectDraft(projectId);
    setFeedbackDraft((prev) => ({
      ...prev,
      projectId,
      projectName: resolved.projectName,
      location: resolved.location,
    }));
  };

  const handleReportProjectChange = (projectId: string) => {
    const resolved = resolveProjectDraft(projectId);
    setReportDraft((prev) => ({
      ...prev,
      projectId,
      projectName: resolved.projectName,
    }));
  };

  const handleSubmitFeedback = async () => {
    const projectId = String(feedbackDraft.projectId ?? "").trim();
    const projectName = String(feedbackDraft.projectName ?? "").trim();
    const caption = String(feedbackDraft.caption ?? "").trim();

    if (!projectId || !projectName) {
      setComposerAlert({ type: "error", message: "Please select a project before submitting feedback." });
      return;
    }

    if (!caption) {
      setComposerAlert({ type: "error", message: "Please write your feedback caption before submitting." });
      return;
    }

    setIsSubmittingComposer(true);
    setComposerAlert(null);

    try {
      await communityFeedbackApi.create({
        projectId,
        projectName,
        location: String(feedbackDraft.location ?? "").trim(),
        caption,
        photo: String(feedbackDraft.photo ?? "").trim() || undefined,
        submittedBy: reporterDisplayName,
        walletAddress: reporterWallet,
      });

      await loadData();
      setContentType("feedback");
      setShowComposer(false);
      setFeedbackDraft((prev) => ({
        ...prev,
        caption: "",
        photo: "",
      }));
      setComposerAlert({ type: "success", message: "Feedback submitted successfully and synced to Community Hub." });
    } catch (error) {
      const apiMessage =
        (error as { response?: { data?: { message?: string; errors?: string[] } } })?.response?.data
          ?.message ??
        (error as { response?: { data?: { reason?: string } } })?.response?.data?.reason ??
        (error as { response?: { data?: { errors?: string[] } } })?.response?.data?.errors?.[0];

      const directErrorMessage = error instanceof Error ? error.message : undefined;

      setComposerAlert({
        type: "error",
        message:
          apiMessage ||
          directErrorMessage ||
          "Failed to submit feedback. Please try again.",
      });
    } finally {
      setIsSubmittingComposer(false);
    }
  };

  const handleSubmitReport = async () => {
    const projectId = String(reportDraft.projectId ?? "").trim();
    const projectName = String(reportDraft.projectName ?? "").trim();
    const reportType = String(reportDraft.reportType ?? "").trim() || reportTypeOptions[0];
    const description = String(reportDraft.description ?? "").trim();

    if (!projectId || !projectName) {
      setComposerAlert({ type: "error", message: "Please select a project before submitting a report." });
      return;
    }

    if (!description) {
      setComposerAlert({ type: "error", message: "Please add report details before submitting." });
      return;
    }

    setIsSubmittingComposer(true);
    setComposerAlert(null);

    try {
      await publicReportApi.create({
        projectId,
        projectName,
        reportType,
        description,
        photo: String(reportDraft.photo ?? "").trim() || undefined,
        reportedBy: reporterDisplayName,
        walletAddress: reporterWallet,
      });

      await loadData();
      setContentType("reports");
      setShowComposer(false);
      setReportDraft((prev) => ({
        ...prev,
        reportType,
        description: "",
        photo: "",
      }));
      setComposerAlert({ type: "success", message: "Report submitted successfully and synced to Reports." });
    } catch (error) {
      const apiMessage =
        (error as { response?: { data?: { message?: string; errors?: string[] } } })?.response?.data
          ?.message ??
        (error as { response?: { data?: { reason?: string } } })?.response?.data?.reason ??
        (error as { response?: { data?: { errors?: string[] } } })?.response?.data?.errors?.[0];

      const directErrorMessage = error instanceof Error ? error.message : undefined;

      setComposerAlert({
        type: "error",
        message:
          apiMessage ||
          directErrorMessage ||
          "Failed to submit report. Please try again.",
      });
    } finally {
      setIsSubmittingComposer(false);
    }
  };

  const filteredFeedback = useMemo(() => {
    return communityFeedback.filter((f) => {
      const query = searchQuery.toLowerCase();
      const coreMeta = getProjectCoreMeta(f.projectId);

      if (selectedFilter === "verified" && !f.verified) return false;

      if (
        searchQuery &&
        !(
          f.projectName.toLowerCase().includes(query) ||
          f.location.toLowerCase().includes(query) ||
          f.caption.toLowerCase().includes(query) ||
          coreMeta.region.toLowerCase().includes(query) ||
          coreMeta.municipality.toLowerCase().includes(query) ||
          coreMeta.barangay.toLowerCase().includes(query) ||
          coreMeta.milestoneName.toLowerCase().includes(query) ||
          coreMeta.milestoneStatus.toLowerCase().includes(query)
        )
      ) {
        return false;
      }

      if (
        filterMunicipality &&
        !(
          f.location.toLowerCase().includes(filterMunicipality.toLowerCase()) ||
          coreMeta.municipality.toLowerCase().includes(filterMunicipality.toLowerCase())
        )
      ) {
        return false;
      }

      if (
        filterRegion &&
        !(
          f.location.toLowerCase().includes(filterRegion.toLowerCase()) ||
          coreMeta.region.toLowerCase().includes(filterRegion.toLowerCase())
        )
      ) {
        return false;
      }

      return true;
    });
  }, [communityFeedback, filterMunicipality, filterRegion, getProjectCoreMeta, searchQuery, selectedFilter]);

  const filteredReports = useMemo(() => {
    return publicReports.filter((r) => {
      const query = searchQuery.toLowerCase();
      const coreMeta = getProjectCoreMeta(r.projectId);

      if (
        searchQuery &&
        !(
          r.projectName.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query) ||
          r.reportedBy.toLowerCase().includes(query) ||
          coreMeta.region.toLowerCase().includes(query) ||
          coreMeta.municipality.toLowerCase().includes(query) ||
          coreMeta.barangay.toLowerCase().includes(query) ||
          coreMeta.milestoneName.toLowerCase().includes(query) ||
          coreMeta.milestoneStatus.toLowerCase().includes(query)
        )
      ) {
        return false;
      }

      if (filterMunicipality && !coreMeta.municipality.toLowerCase().includes(filterMunicipality.toLowerCase())) {
        return false;
      }

      if (filterRegion && !coreMeta.region.toLowerCase().includes(filterRegion.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [filterMunicipality, filterRegion, getProjectCoreMeta, publicReports, searchQuery]);

  const handleNavigateToProject = (projectId: string) => {
    const project = allProjects.find((p) => p.id === projectId);
    if (project) {
      sessionStorage.setItem("selectedProjectId", projectId);
      setCurrentPage("ledger");
    }
  };

  return {
    selectedFilter,
    setSelectedFilter,
    contentType,
    setContentType,
    communityFeedback,
    publicReports,
    showComposer,
    isSubmittingComposer,
    composerAlert,
    feedbackDraft,
    setFeedbackDraft,
    reportDraft,
    setReportDraft,
    allProjects,
    regionLookup,
    reportTypeOptions,
    searchQuery,
    setSearchQuery,
    filterMunicipality,
    setFilterMunicipality,
    filterRegion,
    setFilterRegion,
    openComposer,
    closeComposer,
    getProjectCoreMeta,
    handleFeedbackProjectChange,
    handleReportProjectChange,
    handleSubmitFeedback,
    handleSubmitReport,
    filteredFeedback,
    filteredReports,
    handleNavigateToProject,
  };
}
