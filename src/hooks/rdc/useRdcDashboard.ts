import { useState, useMemo, useEffect, useCallback, type ChangeEvent } from "react";
import {
  useProjectContext,
  type RDCProject,
  type ProposalDocument,
  REQUIRED_PROPOSAL_DOCUMENTS,
} from "@/context/ProjectContext";
import { useNotifications, notificationHelpers } from "@/context/NotificationContext";
import { useAuditTrail } from "@/context/AuditTrailContext";
import { useWallet } from "@/context/WalletContext";
import { signProposal, logToAuditTrail, type SignatureGateResult } from "@/services/signatureGate";
import { proposalDocumentApi } from "@/features/project/api/proposalDocumentApi";
import { useGasGuard } from "@/hooks/useGasGuard";
import { authApi, type UserProfile } from "@/services/api";
import { useLookup, useLookups } from "@/hooks";

interface UseRdcDashboardParams {
  setCurrentPage: (page: string) => void;
}

export function useRdcDashboard({ setCurrentPage }: UseRdcDashboardParams) {
  const { walletAddress, disconnectWallet } = useWallet();
  const { projects, addProject, updateProjectStatus } = useProjectContext();
  const { addNotification } = useNotifications();
  const { addAuditEntry } = useAuditTrail();
  const { gasError, clearGasError, handleGasError } = useGasGuard();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const { items: regionLookup } = useLookup("Region");
  const regionMap = Object.fromEntries(regionLookup.map((r) => [r.code ?? 0, r.name]));

  const [activeTab, setActiveTab] = useState<"submit" | "proposals">("submit");

  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: "success" | "info" | "warning";
  }>({ show: false, message: "", type: "success" });

  const [isSigning, setIsSigning] = useState(false);
  const [lastSignResult, setLastSignResult] = useState<SignatureGateResult | null>(null);

  const [proposalForm, setProposalForm] = useState({
    title: "",
    projectType: "",
    province: "",
    municipality: "",
    barangay: "",
    estimatedBudget: "",
    targetDuration: "",
    priorityLevel: "Medium" as "Low" | "Medium" | "High" | "Critical",
    justification: "",
  });

  const [proposalDocs, setProposalDocs] = useState<Record<string, ProposalDocument>>({});
  const [rawFiles, setRawFiles] = useState<Record<string, File>>({});

  const { data: lookups } = useLookups(["PriorityLevel", "InfrastructureType"]);
  const priorityLevels = lookups.PriorityLevel?.map((l) => l.name) ?? [];
  const infrastructureTypes = lookups.InfrastructureType?.map((l) => ({ id: l.id, name: l.name })) ?? [];

  useEffect(() => {
    authApi.getProfile().then((res) => setProfile(res.data)).catch(() => {});
  }, []);

  const myRegionName = profile ? regionMap[profile.regionCode] ?? profile.assignedRegion ?? "" : "";
  const myActorName = profile?.displayName ?? "RDC";

  const walletMismatch = useMemo(() => {
    if (!profile || !walletAddress) return false;
    if (!profile.walletAddress) return false;
    return profile.walletAddress.toLowerCase() !== walletAddress.toLowerCase();
  }, [profile, walletAddress]);

  const regionProjects = useMemo(() => {
    if (!profile || !myRegionName) return [];
    return projects.filter(
      (p) =>
        p.region === myRegionName ||
        p.region === profile.assignedRegion ||
        (p.regionId !== undefined && p.regionId === profile.regionCode)
    );
  }, [projects, profile, myRegionName]);

  const myProposals = regionProjects.filter((p) =>
    (
      [
        "PROPOSED",
        "FUNDED",
        "ONGOING",
        "REJECTED",
        "PROPOSAL_DRAFT",
        "PROPOSAL_SUBMITTED",
        "PROPOSAL_APPROVED",
        "PROPOSAL_REJECTED",
      ] as string[]
    ).includes(p.status)
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [municipalityFilter, setMunicipalityFilter] = useState("All");

  const municipalities = useMemo(
    () => ["All", ...Array.from(new Set(myProposals.map((p) => p.municipality).filter(Boolean))).sort()],
    [myProposals]
  );

  const filteredProposals = useMemo(() => {
    return myProposals.filter((p) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        (p.municipality ?? "").toLowerCase().includes(q) ||
        (p.projectType ?? "").toLowerCase().includes(q);
      const matchMuni = municipalityFilter === "All" || p.municipality === municipalityFilter;
      return matchSearch && matchMuni;
    });
  }, [myProposals, searchQuery, municipalityFilter]);

  const generateSimulatedHash = (_fileName: string, _fileSize: number): string => {
    const chars = "abcdef0123456789";
    let hash = "0xSHA256_";
    for (let i = 0; i < 56; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDocumentUpload = (key: string, docName: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const hash = generateSimulatedHash(file.name, file.size);

    const reader = new FileReader();
    reader.onload = () => {
      const doc: ProposalDocument = {
        id: `doc-${key}-${Date.now()}`,
        key,
        name: docName,
        fileName: file.name,
        fileSize: file.size,
        hash,
        uploadedAt: new Date().toISOString(),
        fileDataUrl: reader.result as string,
      };
      setProposalDocs((prev) => ({ ...prev, [key]: doc }));
      setRawFiles((prev) => ({ ...prev, [key]: file }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveDocument = (key: string) => {
    setRawFiles((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setProposalDocs((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const areAllDocsUploaded = REQUIRED_PROPOSAL_DOCUMENTS.every((d) => !!proposalDocs[d.key]);

  const showNotification = useCallback(
    (message: string, type: "success" | "info" | "warning" = "success") => {
      setNotification({ show: true, message, type });
      setTimeout(() => setNotification({ show: false, message: "", type: "success" }), 5000);
    },
    []
  );

  const clearNotification = () => {
    setNotification({ show: false, message: "", type: "success" });
  };

  const handleProposalInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setProposalForm((prev) => ({ ...prev, [name]: value }));
  };

  const isProposalFormValid =
    proposalForm.title &&
    proposalForm.projectType &&
    proposalForm.municipality &&
    proposalForm.estimatedBudget &&
    proposalForm.targetDuration &&
    proposalForm.justification &&
    areAllDocsUploaded;

  const buildProposalObject = (): RDCProject => ({
    id: `PROP-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    title: proposalForm.title,
    projectType: proposalForm.projectType,
    currentPhase: "Planning",
    startDate: "",
    expectedCompletion: "",
    region: myRegionName,
    province: proposalForm.province,
    municipality: proposalForm.municipality,
    barangay: proposalForm.barangay,
    approvedBudget: proposalForm.estimatedBudget.startsWith("₱") ? proposalForm.estimatedBudget : `₱${proposalForm.estimatedBudget}`,
    fundSource: "National Budget",
    contractorName: "",
    pcabLicense: "",
    dpwhRegion: myRegionName,
    lguApproval: "",
    inspectorName: "",
    priorityLevel: proposalForm.priorityLevel,
    justification: proposalForm.justification,
    category: "",
    status: "PROPOSED",
    createdAt: new Date().toISOString().split("T")[0],
    proposalDocuments: Object.values(proposalDocs),
    infrastructureType: proposalForm.projectType,
    regionId: profile?.regionCode,
    targetDuration: proposalForm.targetDuration,
  });

  const resetProposalForm = () => {
    setProposalForm({
      title: "",
      projectType: "",
      province: "",
      municipality: "",
      barangay: "",
      estimatedBudget: "",
      targetDuration: "",
      priorityLevel: "Medium",
      justification: "",
    });
    setProposalDocs({});
    setRawFiles({});
  };

  const handleSubmitProposal = async () => {
    if (!isProposalFormValid) {
      showNotification("Please fill in all required fields and upload all documents.", "warning");
      return;
    }

    setIsSigning(true);
    try {
      const proposal = buildProposalObject();
      const budget = parseFloat(proposalForm.estimatedBudget.replace(/[^\d.]/g, "")) || 0;
      const location = `${proposalForm.municipality || ""}, ${proposalForm.province || ""}`;

      const signResult = await signProposal({
        projectId: proposal.id,
        projectName: proposal.title,
        location,
        estimatedBudget: budget,
        regionCode: profile?.regionCode ?? 0,
        description: `RDC proposes: "${proposal.title}" (${proposalForm.projectType}) in ${location}, est. ₱${budget.toLocaleString("en-PH")}`,
      });

      if (!signResult.txHash || !signResult.onChainConfirmed) {
        throw new Error("Blockchain transaction was not confirmed. Proposal was NOT saved.");
      }
      setLastSignResult(signResult);

      const savedProject = await addProject(proposal);

      await updateProjectStatus(savedProject.id, {
        status: "PROPOSED",
        actorName: myActorName,
        actorWallet: walletAddress || undefined,
        actorRole: "rdc",
        blockchainTxHash: signResult.txHash,
        blockchainDataHash: signResult.txHash || signResult.dataHash,
      });

      const docsToUpload = Object.values(proposalDocs);
      for (const doc of docsToUpload) {
        const rawFile = rawFiles[doc.key];
        if (rawFile) {
          try {
            await proposalDocumentApi.upload(savedProject.id, doc.key, doc.name, doc.hash, rawFile);
          } catch {
            // Keep proposal submission successful even if a document upload fails.
          }
        }
      }

      addNotification(notificationHelpers.proposalSubmitted(savedProject.title, savedProject.id));
      addAuditEntry({
        actionType: "PROPOSAL_SUBMITTED",
        actorRole: "rdc",
        actorName: myActorName,
        actorWallet: walletAddress,
        projectId: savedProject.id,
        projectName: savedProject.title,
        region: myRegionName,
        municipality: proposalForm.municipality,
        description: `Regional proposal "${savedProject.title}" (${proposalForm.projectType}) signed on-chain. Est. budget ₱${budget.toLocaleString("en-PH")}, target ${proposalForm.targetDuration}. Awaiting National funding.`,
        amount: budget,
        previousStatus: "NEW",
        newStatus: "PROPOSED",
        metadata: {
          txHash: signResult.txHash,
          infrastructureType: proposalForm.projectType,
          targetDuration: proposalForm.targetDuration,
        },
      });

      logToAuditTrail(signResult, {
        role: "rdc",
        actionType: "PROPOSAL_SIGNED",
        referenceId: savedProject.id,
        description: `RDC signed regional proposal: "${savedProject.title}"`,
        actorName: myActorName,
        projectId: savedProject.id,
        projectName: savedProject.title,
        region: myRegionName,
      }).catch(() => {});

      showNotification("Proposal signed on-chain & submitted to National!", "success");
      resetProposalForm();
      setActiveTab("proposals");
    } catch (err) {
      if (handleGasError(err)) {
        setIsSigning(false);
        return;
      }
      const msg = err instanceof Error ? err.message : "Signing failed";
      if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
        showNotification("Signature rejected — proposal not submitted.", "warning");
      } else {
        showNotification(`Signing failed: ${msg}`, "warning");
      }
    } finally {
      setIsSigning(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectWallet();
    setCurrentPage("home");
  };

  return {
    walletAddress,
    gasError,
    clearGasError,
    profile,
    activeTab,
    setActiveTab,
    notification,
    clearNotification,
    isSigning,
    lastSignResult,
    proposalForm,
    proposalDocs,
    priorityLevels,
    infrastructureTypes,
    myRegionName,
    walletMismatch,
    myProposals,
    searchQuery,
    setSearchQuery,
    municipalityFilter,
    setMunicipalityFilter,
    municipalities,
    filteredProposals,
    formatFileSize,
    handleDocumentUpload,
    handleRemoveDocument,
    areAllDocsUploaded,
    handleProposalInputChange,
    isProposalFormValid,
    handleSubmitProposal,
    handleDisconnect,
  };
}
