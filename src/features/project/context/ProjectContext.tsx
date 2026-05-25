import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { projectApi } from "@/features/project/api/projectApi";
import type {
  CreateProjectPayload,
  UpdateProjectStatusPayload,
} from "@/features/project/api/projectApi";

// ============================================
// SHARED PROJECT CONTEXT
// Enables data flow between RDC Portal and
// National Budget Authority Portal
// ============================================

// ---- Document submission types ----
export interface ProposalDocument {
  id: string;
  key: "pow" | "fs" | "resolution" | string;
  name: string; // Display name e.g. "Program of Works (POW)"
  fileName: string; // Original file name
  fileSize: number; // Size in bytes
  hash: string; // Simulated SHA-256 blockchain hash
  uploadedAt: string; // ISO timestamp
  fileDataUrl?: string; // Base64 data URL for file preview/download
}

export const REQUIRED_PROPOSAL_DOCUMENTS: {
  key: string;
  name: string;
  description: string;
}[] = [
  {
    key: "pow",
    name: "Program of Works (POW)",
    description: "Detailed scope of work, timelines, and cost breakdown",
  },
  {
    key: "fs",
    name: "Feasibility Study (FS)",
    description: "Technical and economic feasibility analysis",
  },
  {
    key: "resolution",
    name: "Regional Resolution",
    description:
      "Signed resolution from the Regional Development Council",
  },
];

export interface RDCProject {
  id: string;
  title: string;
  projectType: string;
  currentPhase: string;
  startDate: string;
  expectedCompletion: string;
  region: string;
  province: string;
  municipality: string;
  barangay: string;
  /** Original budget proposed by RDC before National review/funding */
  rdcProposedBudget?: string;
  approvedBudget: string;
  fundSource: string;
  contractorName: string;
  pcabLicense: string;
  dpwhRegion: string;
  lguApproval: string;
  inspectorName: string;
  priorityLevel: "Low" | "Medium" | "High" | "Critical";
  justification: string;
  category: string;
  // Geographic IDs for on-chain mapping
  regionId?: number;
  provinceId?: number;
  municipalityId?: number;
  numericProjectId?: number;
  // Personnel assignment (multi-project)
  contractorWallet?: string;
  engineerWallet?: string;
  engineerName?: string;
  personnelAssigned?: boolean;
  personnelTxHash?: string;
  // Lifecycle status — simplified 3-stage sequential state machine
  status:
    | "PROPOSED"          // Stage 1: RDC signed proposal
    | "FUNDED"            // Stage 2: National signed funding (promotes to active project)
    | "ONGOING"           // Stage 3: RD assigned personnel + contract dates
    // Legacy statuses (backward compat for existing data)
    | "PROPOSAL_DRAFT"
    | "PROPOSAL_SUBMITTED"
    | "PROPOSAL_APPROVED"
    | "PROPOSAL_REJECTED"
    | "DRAFT"
    | "SUBMITTED_TO_NATIONAL"
    | "FUNDED_AND_ACTIVE"
    | "PERSONNEL_ASSIGNED"
    | "REJECTED";
  /** Infrastructure type from seeded dropdown (Roads, Bridges, etc.) */
  infrastructureType?: string;
  /** GAA Reference Number assigned during National funding */
  gaaReference?: string;
  /** Final approved budget set by National (may differ from RDC estimate) */
  finalApprovedBudget?: string;
  /** RDC-proposed target duration (e.g. "6 months", "180 days") */
  targetDuration?: string;
  /** Official contract start date set by RD (YYYY-MM-DD) */
  contractStartDate?: string;
  /** Official contract end date set by RD — legally binding deadline (YYYY-MM-DD) */
  contractEndDate?: string;
  // Proposal approval data (set by National when reviewing budget proposal)
  proposalApprovedBy?: string;
  proposalApprovedDate?: string;
  proposalRejectedReason?: string;
  // For projects linked to an approved proposal
  linkedProposalId?: string;
  // RDC endorsement data
  rdcSignatureHash?: string;
  rdcEndorsedBy?: string;
  rdcEndorsedDate?: string;
  blockchainDataHash?: string;
  offchainDataHash?: string;
  integrityStatus?: string;
  isTampered?: boolean;
  tamperedAt?: string;
  integrityCheckedAt?: string;
  // National approval data (Step 2 — GAA)
  nationalFundingHash?: string;
  nationalApprovedBy?: string;
  nationalApprovedDate?: string;
  nationalRemarks?: string;
  saaReference?: string;
  // Timestamps
  createdAt: string;
  // Attached proposal documents with blockchain hashes
  proposalDocuments?: ProposalDocument[];
  // ── Target-based Progress & Geolocation ──
  targetPercent?: number;
  currentProgress?: number;
  siteLatitude?: number;
  siteLongitude?: number;
  isLocationAnchored?: boolean;
  trackingSlug?: string;
  isPublic?: boolean;
  isQrActive?: boolean;
  qrCodeUrl?: string;
}

interface ProjectContextType {
  projects: RDCProject[];
  loading: boolean;
  addProject: (project: RDCProject) => Promise<RDCProject>;
  updateProject: (id: string, updates: Partial<RDCProject>) => Promise<void>;
  updateProjectStatus: (
    id: string,
    data: UpdateProjectStatusPayload
  ) => Promise<void>;
  createProjectOnApi: (data: CreateProjectPayload) => Promise<RDCProject>;
  getProjectsByStatus: (status: RDCProject["status"]) => RDCProject[];
  refreshProjects: () => Promise<void>;
  /** Validate if a status transition is legal per the sequential state machine */
  canTransition: (currentStatus: RDCProject["status"], targetStatus: RDCProject["status"]) => boolean;
}

/**
 * Sequential State Machine — allowed transitions map.
 * Each key is a current status, value is the set of legal next statuses.
 * Enforced on both frontend and Solidity contract.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  // ── New 3-Stage Sequential Flow ──
  PROPOSED:              ["FUNDED", "REJECTED"],
  FUNDED:                ["ONGOING"],
  ONGOING:               [],
  // ── Legacy transitions (backward compat) ──
  PROPOSAL_DRAFT:        ["PROPOSAL_SUBMITTED", "PROPOSED"],
  PROPOSAL_SUBMITTED:    ["PROPOSAL_APPROVED", "PROPOSAL_REJECTED", "FUNDED"],
  PROPOSAL_APPROVED:     ["DRAFT"],
  DRAFT:                 ["SUBMITTED_TO_NATIONAL"],
  SUBMITTED_TO_NATIONAL: ["FUNDED_AND_ACTIVE", "FUNDED", "REJECTED"],
  FUNDED_AND_ACTIVE:     ["PERSONNEL_ASSIGNED", "ONGOING"],
  // Terminal states
  PERSONNEL_ASSIGNED:    [],
  PROPOSAL_REJECTED:     [],
  REJECTED:              [],
};

function formatPesoAmount(value: unknown): string {
  return `₱${Number(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function isFundedLifecycleStatus(status: unknown): boolean {
  const normalized = String(status ?? "").toUpperCase();
  return (
    normalized === "FUNDED" ||
    normalized === "FUNDED_AND_ACTIVE" ||
    normalized === "PERSONNEL_ASSIGNED" ||
    normalized === "ONGOING"
  );
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

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<RDCProject[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch projects from API on mount
  const refreshProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await projectApi.getAll();
      if (response.data && response.data.length > 0) {
        // Map API response to RDCProject format
        const apiProjects: RDCProject[] = response.data.map(
          (p: Record<string, unknown>) => ({
            id: p.id,
            title: p.title,
            projectType: p.projectType,
            currentPhase: p.currentPhase,
            startDate:
              (p.startDate as string)?.split("T")[0] || p.startDate,
            expectedCompletion:
              (p.expectedCompletion as string)?.split("T")[0] ||
              p.expectedCompletion,
            region: p.region,
            province: p.province,
            municipality: p.municipality,
            barangay: p.barangay,
            rdcProposedBudget:
              p.rdcProposedBudget !== undefined && p.rdcProposedBudget !== null
                ? formatPesoAmount(p.rdcProposedBudget)
                : /(PROPOSAL|PROPOSED|SUBMITTED|DRAFT|ENDORSE)/.test(String(p.status ?? "").toUpperCase())
                  ? formatPesoAmount(p.approvedBudget)
                  : undefined,
            approvedBudget: formatPesoAmount(p.approvedBudget),
            finalApprovedBudget:
              p.finalApprovedBudget !== undefined && p.finalApprovedBudget !== null
                ? formatPesoAmount(p.finalApprovedBudget)
                : isFundedLifecycleStatus(p.status)
                  ? formatPesoAmount(p.approvedBudget)
                  : undefined,
            fundSource: p.fundSource,
            contractorName: p.contractorName,
            pcabLicense: p.pcabLicense || "",
            dpwhRegion: p.dpwhRegion || "",
            lguApproval: p.lguApproval || "",
            inspectorName: p.inspectorName || "",
            priorityLevel: p.priorityLevel || "Medium",
            justification: p.justification || "",
            category: p.category || "",
            status: p.status,
            rdcSignatureHash: p.rdcSignatureHash || p.blockchainTxHash,
            rdcEndorsedBy: p.rdcEndorsedBy,
            rdcEndorsedDate: (p.rdcEndorsedDate as string)?.split("T")[0],
            blockchainDataHash: (p.blockchainDataHash as string) || undefined,
            offchainDataHash: (p.offchainDataHash as string) || undefined,
            integrityStatus: (p.integrityStatus as string) || undefined,
            isTampered: parseBackendBoolean(p.isTampered),
            tamperedAt: (p.tamperedAt as string) || undefined,
            integrityCheckedAt: (p.integrityCheckedAt as string) || undefined,
            nationalFundingHash: p.nationalFundingHash,
            nationalApprovedBy: p.nationalApprovedBy,
            nationalApprovedDate: (p.nationalApprovedDate as string)?.split("T")[0],
            nationalRemarks: p.nationalRemarks,
            // Personnel assignment fields from backend
            contractorWallet: (p.contractorWallet as string) || undefined,
            engineerWallet: (p.engineerWallet as string) || undefined,
            engineerName: (p.engineerName as string) || (p.inspectorName as string) || undefined,
            personnelAssigned: !!p.personnelAssigned,
            personnelTxHash: (p.personnelAssignmentHash as string) || undefined,
            createdAt:
              (p.createdAt as string)?.split("T")[0] || p.createdAt,
            // Target-based Progress & Geolocation
            targetPercent: (p.targetPercent as number) ?? 100,
            currentProgress: (p.currentProgress as number) ?? 0,
            siteLatitude: (p.siteLatitude as number) ?? undefined,
            siteLongitude: (p.siteLongitude as number) ?? undefined,
            isLocationAnchored: parseBackendBoolean(p.isLocationAnchored),
            trackingSlug: (p.trackingSlug as string) || undefined,
            isPublic: parseBackendBoolean(p.isPublic),
            isQrActive: parseBackendBoolean(p.isQrActive),
            qrCodeUrl: (p.qrCodeUrl as string) || undefined,
          })
        );

        // Merge: preserve front-end-only fields (proposalDocuments with file content)
        // that aren't stored on the backend yet
        setProjects((prev) => {
          if (prev.length === 0) return apiProjects;
          return apiProjects.map((ap) => {
            const existing = prev.find((p) => p.id === ap.id);
            return existing?.proposalDocuments
              ? { ...ap, proposalDocuments: existing.proposalDocuments }
              : ap;
          });
        });
      }
    } catch (err) {
      console.warn("API unavailable", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const addProject = async (project: RDCProject): Promise<RDCProject> => {
    // Step 1: Optimistically add to local state for instant UI feedback
    setProjects((prev) => [...prev, project]);

    // Step 2: Persist to backend API
    try {
      const budget =
        parseFloat(project.approvedBudget.replace(/[^0-9.]/g, "")) || 0;
      const response = await projectApi.create({
        title: project.title,
        projectType: project.projectType,
        currentPhase: project.currentPhase || "Planning",
        startDate: project.startDate || undefined,
        expectedCompletion: project.expectedCompletion || undefined,
        region: project.region,
        province: project.province,
        municipality: project.municipality,
        barangay: project.barangay,
        rdcProposedBudget: budget,
        approvedBudget: budget,
        fundSource: project.fundSource,
        contractorName: project.contractorName || undefined,
        pcabLicense: project.pcabLicense || undefined,
        dpwhRegion: project.dpwhRegion || undefined,
        lguApproval: project.lguApproval || undefined,
        inspectorName: project.inspectorName || undefined,
        priorityLevel: project.priorityLevel,
        justification: project.justification,
        category: project.category || undefined,
        status: project.status,
      });

      const p = response.data;
      const serverProject: RDCProject = {
        ...project,
        id: p.id, // Use server-assigned ID
        createdAt: p.createdAt?.split("T")[0] || project.createdAt,
      };

      // Step 3: Replace client-generated entry with server entry (new ID)
      setProjects((prev) =>
        prev.map((existing) =>
          existing.id === project.id ? serverProject : existing
        )
      );
      return serverProject;
    } catch (err) {
      console.warn("API persist failed, project saved locally only:", err);
      return project;
    }
  };

  const updateProject = async (id: string, updates: Partial<RDCProject>): Promise<void> => {
    // Optimistic local update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );

    // Check if this is a personnel assignment update (has contractorWallet or engineerWallet)
    const isPersonnelAssignment = !!(updates.contractorWallet || updates.engineerWallet);

    if (isPersonnelAssignment) {
      // ── Personnel Assignment: send ONE consolidated PUT with ALL fields ──
      // The PUT endpoint handles status + personnel + auto-whitelist atomically
      const consolidated: Record<string, unknown> = {};
      if (updates.status) consolidated.status = updates.status;
      if (updates.contractorWallet) consolidated.contractorWallet = updates.contractorWallet;
      if (updates.engineerWallet) consolidated.engineerWallet = updates.engineerWallet;
      if (updates.contractorName) consolidated.contractorName = updates.contractorName;
      if (updates.engineerName) consolidated.engineerName = updates.engineerName;
      if (updates.inspectorName) consolidated.inspectorName = updates.inspectorName;
      if (updates.personnelTxHash) consolidated.personnelAssignmentHash = updates.personnelTxHash;
      if (updates.blockchainDataHash) consolidated.blockchainDataHash = updates.blockchainDataHash;
      if (updates.personnelAssigned !== undefined) consolidated.personnelAssigned = updates.personnelAssigned;

      console.log(`[ProjectContext] Sending PUT for personnel assignment on project ${id}:`, consolidated);

      try {
        await projectApi.update(id, consolidated as unknown as Partial<CreateProjectPayload>);
        console.log(`[ProjectContext] ✅ Personnel assignment SAVED to DB for project ${id}`);
        // Re-fetch from DB to ensure all dashboards see the persisted data
        await refreshProjects();
      } catch (err) {
        console.error("[ProjectContext] ❌ FAILED to persist personnel assignment:", err);
        // Fallback: try PATCH status + a second PUT for wallets only
        try {
          if (updates.status) {
            await projectApi.updateStatus(id, {
              status: updates.status,
              blockchainTxHash: updates.personnelTxHash,
              blockchainDataHash: updates.blockchainDataHash,
            });
            console.log(`[ProjectContext] Fallback PATCH status succeeded for project ${id}`);
          }
          // Second attempt: try PUT with ONLY the wallet fields (no status)
          const walletOnly: Record<string, unknown> = {};
          if (updates.contractorWallet) walletOnly.contractorWallet = updates.contractorWallet;
          if (updates.engineerWallet) walletOnly.engineerWallet = updates.engineerWallet;
          if (updates.contractorName) walletOnly.contractorName = updates.contractorName;
          if (updates.engineerName) walletOnly.engineerName = updates.engineerName;
          if (updates.personnelAssigned !== undefined) walletOnly.personnelAssigned = updates.personnelAssigned;
          await projectApi.update(id, walletOnly as unknown as Partial<CreateProjectPayload>);
          console.log(`[ProjectContext] Fallback PUT (wallet fields) succeeded for project ${id}`);
          await refreshProjects();
        } catch (fallbackErr) {
          console.error("[ProjectContext] ❌ Fallback also FAILED:", fallbackErr);
          // Re-throw so the caller knows the operation failed
          throw new Error("Failed to save personnel assignment to database. Please try again.");
        }
      }
    } else if (updates.status) {
      // ── Status-only update: use PATCH for proper state transitions ──
      const approvedBudgetRaw =
        (updates as Record<string, unknown>).finalApprovedBudget as string ||
        (updates as Record<string, unknown>).approvedBudget as string ||
        "";
      const parsedApprovedBudget =
        typeof approvedBudgetRaw === "string" && approvedBudgetRaw.trim().length > 0
          ? Number(approvedBudgetRaw.replace(/[^0-9.]/g, ""))
          : NaN;

      // Defensive fallback: persist funded budget via PUT so budget is saved
      // even when older backend status endpoints ignore approvedBudget in PATCH.
      if (
        (updates.status === "FUNDED" || updates.status === "FUNDED_AND_ACTIVE") &&
        Number.isFinite(parsedApprovedBudget) &&
        parsedApprovedBudget > 0
      ) {
        await projectApi
          .update(id, { approvedBudget: parsedApprovedBudget })
          .catch((err) => console.warn("Failed to persist approved budget via PUT:", err));
      }

      await projectApi
        .updateStatus(id, {
          status: updates.status,
          actorName:
            (updates as Record<string, unknown>).rdcEndorsedBy as string ||
            (updates as Record<string, unknown>).nationalApprovedBy as string,
          blockchainTxHash:
            (updates as Record<string, unknown>).rdcSignatureHash as string ||
            (updates as Record<string, unknown>).nationalFundingHash as string ||
            (updates as Record<string, unknown>).personnelTxHash as string,
          blockchainDataHash:
            (updates as Record<string, unknown>).blockchainDataHash as string,
          remarks: (updates as Record<string, unknown>).nationalRemarks as string,
          approvedBudget: Number.isFinite(parsedApprovedBudget) && parsedApprovedBudget > 0 ? parsedApprovedBudget : undefined,
        })
        .catch((err) => console.warn("Failed to update project status:", err));

      await refreshProjects();
    } else {
      // For non-status field updates, use PUT
      await projectApi
        .update(id, updates as unknown as Partial<CreateProjectPayload>)
        .catch((err) => console.warn("Failed to update project:", err));
    }
  };

  const updateProjectStatus = async (
    id: string,
    data: UpdateProjectStatusPayload
  ) => {
    try {
      const response = await projectApi.updateStatus(id, data);
      const updated = response.data;
      setProjects((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: updated.status,
                rdcProposedBudget:
                  updated.rdcProposedBudget !== undefined && updated.rdcProposedBudget !== null
                    ? formatPesoAmount(updated.rdcProposedBudget)
                    : p.rdcProposedBudget,
                approvedBudget: formatPesoAmount(updated.approvedBudget),
                finalApprovedBudget:
                  updated.finalApprovedBudget !== undefined && updated.finalApprovedBudget !== null
                    ? formatPesoAmount(updated.finalApprovedBudget)
                    : isFundedLifecycleStatus(updated.status)
                      ? formatPesoAmount(updated.approvedBudget)
                      : p.finalApprovedBudget,
                rdcSignatureHash: updated.rdcSignatureHash || updated.blockchainTxHash,
                nationalFundingHash: updated.nationalFundingHash,
                nationalApprovedBy: updated.nationalApprovedBy || p.nationalApprovedBy,
                nationalApprovedDate:
                  (updated.nationalApprovedDate as string)?.split("T")[0] || p.nationalApprovedDate,
                blockchainDataHash: (updated.blockchainDataHash as string) || p.blockchainDataHash,
                offchainDataHash: (updated.offchainDataHash as string) || p.offchainDataHash,
                integrityStatus: (updated.integrityStatus as string) || p.integrityStatus,
                isTampered:
                  (updated as Record<string, unknown>).isTampered === undefined
                    ? p.isTampered
                    : parseBackendBoolean((updated as Record<string, unknown>).isTampered),
                tamperedAt: (updated.tamperedAt as string) || p.tamperedAt,
                integrityCheckedAt: (updated.integrityCheckedAt as string) || p.integrityCheckedAt,
                trackingSlug: updated.trackingSlug || p.trackingSlug,
                isPublic:
                  (updated as Record<string, unknown>).isPublic === undefined
                    ? p.isPublic
                    : parseBackendBoolean((updated as Record<string, unknown>).isPublic),
                isQrActive:
                  (updated as Record<string, unknown>).isQrActive === undefined
                    ? p.isQrActive
                    : parseBackendBoolean((updated as Record<string, unknown>).isQrActive),
                qrCodeUrl: updated.qrCodeUrl || p.qrCodeUrl,
              }
            : p
        )
      );

      // Ensure public ledger observes funded/public activation instantly.
      await refreshProjects();
    } catch {
      // Fallback: update locally
      setProjects((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: data.status as RDCProject["status"] }
            : p
        )
      );
    }
  };

  const createProjectOnApi = async (
    data: CreateProjectPayload
  ): Promise<RDCProject> => {
    try {
      const response = await projectApi.create(data);
      const p = response.data;
      const newProject: RDCProject = {
        id: p.id,
        title: p.title,
        projectType: p.projectType,
        currentPhase: p.currentPhase,
        startDate: p.startDate?.split("T")[0] || p.startDate,
        expectedCompletion:
          p.expectedCompletion?.split("T")[0] || p.expectedCompletion,
        region: p.region,
        province: p.province,
        municipality: p.municipality,
        barangay: p.barangay,
        rdcProposedBudget:
          p.rdcProposedBudget !== undefined && p.rdcProposedBudget !== null
            ? formatPesoAmount(p.rdcProposedBudget)
            : `₱${Number(p.approvedBudget).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
        approvedBudget: `₱${Number(p.approvedBudget).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
        fundSource: p.fundSource,
        contractorName: p.contractorName,
        pcabLicense: p.pcabLicense || "",
        dpwhRegion: p.dpwhRegion || "",
        lguApproval: p.lguApproval || "",
        inspectorName: p.inspectorName || "",
        priorityLevel: p.priorityLevel || "Medium",
        justification: p.justification || "",
        category: p.category || "",
        status: p.status as RDCProject["status"],
        createdAt:
          p.createdAt?.split("T")[0] || new Date().toISOString().split("T")[0],
      };
      setProjects((prev) => [newProject, ...prev]);
      return newProject;
    } catch {
      // Fallback: create locally
      const localProject: RDCProject = {
        id: `RDC-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        title: data.title,
        projectType: data.projectType,
        currentPhase: data.currentPhase || "Planning",
        startDate: data.startDate || "",
        expectedCompletion: data.expectedCompletion || "",
        region: data.region,
        province: data.province || "",
        municipality: data.municipality,
        barangay: data.barangay,
        rdcProposedBudget: `₱${data.approvedBudget.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
        approvedBudget: `₱${data.approvedBudget.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
        fundSource: data.fundSource || "National Budget",
        contractorName: data.contractorName || "",
        pcabLicense: data.pcabLicense || "",
        dpwhRegion: data.dpwhRegion || "",
        lguApproval: data.lguApproval || "",
        inspectorName: data.inspectorName || "",
        priorityLevel: (data.priorityLevel as RDCProject["priorityLevel"]) || "Medium",
        justification: data.justification || "",
        category: data.category || "",
        status: "PROPOSAL_DRAFT",
        createdAt: new Date().toISOString().split("T")[0],
      };
      setProjects((prev) => [localProject, ...prev]);
      return localProject;
    }
  };

  const getProjectsByStatus = (status: RDCProject["status"]) => {
    return projects.filter((p) => p.status === status);
  };

  const canTransition = (
    currentStatus: RDCProject["status"],
    targetStatus: RDCProject["status"]
  ): boolean => {
    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    return !!allowed && allowed.includes(targetStatus);
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        loading,
        addProject,
        updateProject,
        updateProjectStatus,
        createProjectOnApi,
        getProjectsByStatus,
        refreshProjects,
        canTransition,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error(
      "useProjectContext must be used within a ProjectProvider"
    );
  }
  return context;
}
