import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { BrowserProvider, Contract } from "ethers";
import { useWallet } from "@/context/WalletContext";
import { buildProjectSpentByMilestones, calculateDistance, mapRDCToProject } from "@/lib/utils";
import { useAuditTrail, type AuditEntry } from "@/context/AuditTrailContext";
import { useProjectContext } from "@/context/ProjectContext";
import { useMilestoneContext, type Milestone } from "@/context/MilestoneContext";
import { authApi } from "@/services/api";
import { useGasGuard } from "@/hooks/useGasGuard";
import { signAuditAttestation, logToAuditTrail, type SignatureGateResult } from "@/services/signatureGate";
import type { Project } from "@/types";

const ACTOR_NAME = "COA Regional Auditor";
const GATE_PROJECT_DETAILS_ABI = [
  "function getProjectDetails(uint256 _numericId) view returns (uint8 regionId, uint8 provinceId, uint16 municipalityId, address contractorWallet, address engineerWallet, bool personnelAssigned)",
] as const;
const GPS_VARIANCE_THRESHOLD_METERS = 50;
const BLOCK_TIMESTAMP_PATTERN = /Block Timestamp:\s*([^|]+)/i;

const AUDITOR_REGISTRY_ACTIONS = new Set<string>([
  "COA_AUDITED",
  "COA_REJECTED",
  "PROJECT_SUSPENDED",
  "COA_DISALLOWANCE_ISSUED",
]);

const CHAIN_OF_CUSTODY_ACTIONS = new Set<string>([
  "MILESTONE_SUBMITTED",
  "ACCOMPLISHMENT_REPORT",
  "INSPECTOR_APPROVED",
  "ENGINEER_VERIFIED",
  "ENGINEER_REJECTED",
  "INSPECTOR_REJECTED",
]);

interface ForensicValidationResult {
  milestoneId: string;
  triggeredAt: string;
  integrityScore: number;
  gpsVarianceMeters: number | null;
  metadataMatch: boolean;
  timestampMatch: boolean;
  chainMatch: boolean;
  flagged: boolean;
  notes: string[];
  chainReference: string;
}

interface RegistryTraceStep {
  id: string;
  actorName: string;
  actorRole: string;
  actionType: string;
  timestamp: string;
  blockchainHash?: string;
}

interface ProjectRegistryTrace {
  latestTransactionHash?: string;
  latestBlockTimestamp?: string;
  latestActionType?: string;
  latestRemarks?: string;
  chainOfCustody: RegistryTraceStep[];
}

interface OnChainProjectRequirements {
  regionId: number;
  provinceId: number;
  municipalityId: number;
  contractorWallet: string;
  engineerWallet: string;
  personnelAssigned: boolean;
}

function toEpoch(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAddress(value?: string): string {
  return value?.toLowerCase() ?? "";
}

function isZeroAddress(value?: string): boolean {
  return /^0x0{40}$/i.test(value ?? "");
}

function extractBlockTimestampFromDescription(description?: string): string | undefined {
  if (!description) return undefined;
  const match = description.match(BLOCK_TIMESTAMP_PATTERN);
  return match?.[1]?.trim();
}

interface UseCoaRegionalAuditorDashboardParams {
  setCurrentPage: (page: string) => void;
}

export function useCoaRegionalAuditorDashboard({ setCurrentPage }: UseCoaRegionalAuditorDashboardParams) {
  const { disconnectWallet, walletAddress } = useWallet();
  const [assignedRegion, setAssignedRegion] = useState("All Regions");
  const [profile, setProfile] = useState<{ walletAddress?: string; assignedRegion?: string; displayName?: string; } | null>(null);
  const onChainProjectDetailsCacheRef = useRef<Record<string, OnChainProjectRequirements>>({});
  const blockTimestampCacheRef = useRef<Record<string, string>>({});

  const loadProfile = useCallback(async () => {
    try {
      const res = await authApi.getProfile();
      setProfile(res.data);
      if (res.data.assignedRegion) setAssignedRegion(res.data.assignedRegion);
    } catch {}
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const [mainTab, setMainTab] = useState<"pending" | "history" | "audit-log">("pending");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMunicipality, setSelectedMunicipality] = useState("All");
  const [selectedBarangay, setSelectedBarangay] = useState("All");

  const [coaRemarks, setCoaRemarks] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSignResult, setLastSignResult] = useState<SignatureGateResult | null>(null);
  const [forensicVerifiedMilestones, setForensicVerifiedMilestones] = useState<Set<string>>(new Set());
  const [forensicChecks, setForensicChecks] = useState<Record<string, ForensicValidationResult>>({});

  const [aomRemarks, setAomRemarks] = useState("");
  const [showAomModal, setShowAomModal] = useState(false);
  const [aomTargetMilestone, setAomTargetMilestone] = useState<Milestone | null>(null);
  const [suspendedMilestones, setSuspendedMilestones] = useState<Record<string, { reason: string; issuedAt: string }>>({});

  const { addAuditEntry, auditEntries } = useAuditTrail();
  const { projects: rdcProjects } = useProjectContext();
  const { milestones, updateMilestoneStatus, refreshMilestones } = useMilestoneContext();
  const { gasError, clearGasError, handleGasError } = useGasGuard();

  useEffect(() => { void refreshMilestones(); }, [refreshMilestones, walletAddress]);

  const spentByProjectId = useMemo(() => buildProjectSpentByMilestones(milestones), [milestones]);

  const mappedProjects = useMemo(
    () =>
      rdcProjects.map((project) => ({
        ...mapRDCToProject(project),
        spent: spentByProjectId[project.id] ?? 0,
      })),
    [rdcProjects, spentByProjectId]
  );

  useEffect(() => {
    if (!selectedProject) return;
    const latest = mappedProjects.find((project) => project.id === selectedProject.id);
    if (!latest) return;

    if (
      latest.spent === selectedProject.spent &&
      latest.progress === selectedProject.progress &&
      latest.status === selectedProject.status
    ) {
      return;
    }

    setSelectedProject(latest);
  }, [mappedProjects, selectedProject]);

  const allProjects = mappedProjects.filter((p) => {
    if (mainTab !== "pending") return true;
    const s = p.status; const raw = p.rawStatus;
    return raw === "ONGOING" || raw === "FUNDED_AND_ACTIVE" || raw === "PERSONNEL_ASSIGNED" || s === "ONGOING" || s === "Funded & Active" || s === "Personnel Assigned" || s.includes("Ongoing") || s.includes("Assigned");
  });

  const pendingAuditProjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of milestones) {
      if (m.status === "ENGINEER_VERIFIED") ids.add(m.projectId);
    }
    return ids;
  }, [milestones]);

  const isEntryOwnedByCurrentAuditor = useCallback((entry: AuditEntry): boolean => {
    const connected = normalizeAddress(walletAddress);
    const profileWallet = normalizeAddress(profile?.walletAddress);
    const actorWallet = normalizeAddress(entry.actorWallet);

    if (connected && actorWallet) return actorWallet === connected;
    if (!connected && profileWallet && actorWallet) return actorWallet === profileWallet;

    return entry.actorRole === "auditor";
  }, [walletAddress, profile?.walletAddress]);

  const auditedProjectIds = useMemo(() => {
    const ids = new Set<string>();

    for (const milestone of milestones) {
      if (milestone.status === "COA_AUDITED" || milestone.status === "COA_REJECTED") {
        ids.add(milestone.projectId);
      }
    }

    for (const e of auditEntries) {
      const actionType = e.actionType ?? "";
      if (!AUDITOR_REGISTRY_ACTIONS.has(actionType)) continue;
      if (!isEntryOwnedByCurrentAuditor(e)) continue;
      ids.add(e.projectId);
    }
    return ids;
  }, [milestones, auditEntries, isEntryOwnedByCurrentAuditor]);

  const regionScopedProjects = useMemo(() => {
    if (assignedRegion === "All Regions") return allProjects;
    return allProjects.filter((p) => p.dpwhRegion === assignedRegion || p.region === assignedRegion);
  }, [allProjects, assignedRegion]);

  const municipalities = useMemo(() => ["All", ...Array.from(new Set(regionScopedProjects.map((p) => p.municipality)))], [regionScopedProjects]);
  const barangays = useMemo(() => {
    const base = selectedMunicipality === "All" ? regionScopedProjects : regionScopedProjects.filter((p) => p.municipality === selectedMunicipality);
    return ["All", ...Array.from(new Set(base.map((p) => p.barangay)))];
  }, [regionScopedProjects, selectedMunicipality]);

  const pendingPriorityByProjectId = useMemo(() => {
    const priority: Record<string, number> = {};
    for (const m of milestones) {
      if (m.status !== "ENGINEER_VERIFIED") continue;
      const submitted = toEpoch(m.submittedDate || m.gpsMetadata?.timestamp);
      if (!submitted) continue;
      if (!priority[m.projectId] || submitted < priority[m.projectId]) {
        priority[m.projectId] = submitted;
      }
    }
    return priority;
  }, [milestones]);

  const registryTraceByProjectId = useMemo(() => {
    const byProject = new Map<string, AuditEntry[]>();
    for (const entry of auditEntries) {
      if (!entry.projectId) continue;
      const existing = byProject.get(entry.projectId) ?? [];
      existing.push(entry);
      byProject.set(entry.projectId, existing);
    }

    const traces: Record<string, ProjectRegistryTrace> = {};

    for (const [projectId, entries] of byProject.entries()) {
      const sorted = [...entries].sort((a, b) => toEpoch(a.timestamp) - toEpoch(b.timestamp));

      const ownRegistryActions = sorted.filter((entry) => {
        const actionType = entry.actionType ?? "";
        return AUDITOR_REGISTRY_ACTIONS.has(actionType) && isEntryOwnedByCurrentAuditor(entry);
      });

      if (ownRegistryActions.length === 0) continue;

      const firstAuditorAction = ownRegistryActions[0];
      const firstAuditorActionEpoch = toEpoch(firstAuditorAction.timestamp);
      const latestAction = ownRegistryActions[ownRegistryActions.length - 1];

      const custodyChain = sorted
        .filter((entry) => {
          if (toEpoch(entry.timestamp) > firstAuditorActionEpoch) return false;
          if (entry.actorRole === "auditor") return false;
          return CHAIN_OF_CUSTODY_ACTIONS.has(entry.actionType ?? "");
        })
        .map((entry) => ({
          id: entry.id,
          actorName: entry.actorName,
          actorRole: entry.actorRole,
          actionType: entry.actionType,
          timestamp: entry.timestamp,
          blockchainHash: entry.blockchainHash,
        }));

      traces[projectId] = {
        latestTransactionHash: latestAction.blockchainHash,
        latestBlockTimestamp: extractBlockTimestampFromDescription(latestAction.description) ?? latestAction.timestamp,
        latestActionType: latestAction.actionType,
        latestRemarks: latestAction.remarks,
        chainOfCustody: custodyChain,
      };
    }

    return traces;
  }, [auditEntries, isEntryOwnedByCurrentAuditor]);

  const projectMilestones = useMemo(() => {
    if (!selectedProject) return [];
    return milestones
      .filter((m) => m.projectId === selectedProject.id)
      .filter((m) => {
        if (mainTab === "pending") return m.status === "ENGINEER_VERIFIED";
        return m.status === "ENGINEER_VERIFIED" || m.status === "COA_AUDITED" || m.status === "COA_REJECTED";
      });
  }, [milestones, selectedProject, mainTab]);

  const regionalAuditLogs = useMemo(() => {
    const regionProjectIds = new Set(regionScopedProjects.map((project) => String(project.id)));
    const regionProjectById = new Map(
      regionScopedProjects.map((project) => [String(project.id), project])
    );

    return auditEntries
      .filter((entry) => regionProjectIds.has(String(entry.projectId)))
      .map((entry) => {
        const projectKey = String(entry.projectId ?? "");
        const project = regionProjectById.get(projectKey);
        const blockTimestamp = extractBlockTimestampFromDescription(entry.description);
        return {
          id: String(entry.id),
          event: String(entry.actionType ?? "UNKNOWN_ACTION"),
          actor: String(entry.actorName ?? "Unknown Actor"),
          actorRole: String(entry.actorRole ?? "system"),
          date: blockTimestamp ?? String(entry.timestamp),
          hash: String(entry.blockchainHash ?? "—"),
          amount: Number(entry.amount ?? 0),
          description: String(entry.description ?? ""),
          projectName: String(entry.projectName ?? project?.name ?? "Unknown Project"),
          municipality: String(entry.municipality ?? project?.municipality ?? ""),
          barangay: String(entry.barangay ?? project?.barangay ?? ""),
          source: "audit" as const,
        };
      })
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [auditEntries, regionScopedProjects]);

  const fetchProjectRequirementsOnChain = useCallback(async (project: Project): Promise<OnChainProjectRequirements | null> => {
    const cached = onChainProjectDetailsCacheRef.current[project.id];
    if (cached) return cached;

    if (typeof window === "undefined" || !window.ethereum) return null;
    const gateAddress = import.meta.env.VITE_GATE_CONTRACT_ADDRESS as string | undefined;
    if (!gateAddress) return null;

    const numericProjectId =
      typeof project.numericProjectId === "number"
        ? project.numericProjectId
        : Number.parseInt(project.id.replace(/\D/g, ""), 10);

    if (!Number.isFinite(numericProjectId) || numericProjectId < 0) return null;

    try {
      const provider = new BrowserProvider(window.ethereum);
      const gate = new Contract(gateAddress, GATE_PROJECT_DETAILS_ABI, provider);
      const raw = await gate.getProjectDetails(BigInt(numericProjectId));

      const details: OnChainProjectRequirements = {
        regionId: Number(raw.regionId ?? raw[0] ?? 0),
        provinceId: Number(raw.provinceId ?? raw[1] ?? 0),
        municipalityId: Number(raw.municipalityId ?? raw[2] ?? 0),
        contractorWallet: String(raw.contractorWallet ?? raw[3] ?? ""),
        engineerWallet: String(raw.engineerWallet ?? raw[4] ?? ""),
        personnelAssigned: Boolean(raw.personnelAssigned ?? raw[5] ?? false),
      };

      onChainProjectDetailsCacheRef.current[project.id] = details;
      return details;
    } catch {
      return null;
    }
  }, []);

  const resolveBlockTimestamp = useCallback(async (txHash: string): Promise<string | null> => {
    if (!txHash) return null;
    const cached = blockTimestampCacheRef.current[txHash];
    if (cached) return cached;

    if (typeof window === "undefined" || !window.ethereum) return null;

    try {
      const provider = new BrowserProvider(window.ethereum);
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt?.blockNumber) return null;

      const block = await provider.getBlock(receipt.blockNumber);
      if (!block?.timestamp) return null;

      const blockTimestamp = new Date(Number(block.timestamp) * 1000).toISOString();
      blockTimestampCacheRef.current[txHash] = blockTimestamp;
      return blockTimestamp;
    } catch {
      return null;
    }
  }, []);

  const handleRunForensicValidation = useCallback(async (ms: Milestone) => {
    if (!selectedProject) return;

    setIsProcessing(true);
    try {
      const notes: string[] = [];

      const hasAnchor = typeof selectedProject.siteLatitude === "number" && typeof selectedProject.siteLongitude === "number";
      const hasMetadataGps = Number.isFinite(ms.gpsMetadata?.latitude) && Number.isFinite(ms.gpsMetadata?.longitude);

      let gpsVarianceMeters: number | null = null;
      if (hasAnchor && hasMetadataGps) {
        gpsVarianceMeters = calculateDistance(
          selectedProject.siteLatitude as number,
          selectedProject.siteLongitude as number,
          ms.gpsMetadata.latitude,
          ms.gpsMetadata.longitude
        );
      } else {
        notes.push("Unable to compute GPS variance due to missing anchor or metadata coordinates.");
      }

      const gpsWithinThreshold = gpsVarianceMeters !== null && gpsVarianceMeters <= GPS_VARIANCE_THRESHOLD_METERS;
      if (gpsVarianceMeters !== null && gpsVarianceMeters > GPS_VARIANCE_THRESHOLD_METERS) {
        notes.push(`GPS variance is ${gpsVarianceMeters.toFixed(2)}m which exceeds the ${GPS_VARIANCE_THRESHOLD_METERS}m threshold.`);
      }

      const now = Date.now();
      const metadataTimestamp = toEpoch(ms.gpsMetadata?.timestamp);
      const submittedTimestamp = toEpoch(ms.submittedDate);
      const futureSkew = metadataTimestamp > now + 5 * 60 * 1000;
      const submissionDriftOk = metadataTimestamp && submittedTimestamp
        ? Math.abs(metadataTimestamp - submittedTimestamp) <= 72 * 60 * 60 * 1000
        : true;
      const timestampMatch = !futureSkew && submissionDriftOk;

      if (futureSkew) notes.push("Metadata timestamp is ahead of the current system time.");
      if (!submissionDriftOk) notes.push("Metadata timestamp drift from submission exceeds 72 hours.");

      const onChain = await fetchProjectRequirementsOnChain(selectedProject);
      let chainMatch = false;
      let chainReference = "fallback";

      if (onChain) {
        const regionMatches = typeof selectedProject.regionId === "number"
          ? onChain.regionId === selectedProject.regionId
          : true;
        const municipalityMatches = typeof selectedProject.municipalityId === "number"
          ? onChain.municipalityId === selectedProject.municipalityId
          : true;

        const contractorMatches = !selectedProject.contractorWallet || isZeroAddress(onChain.contractorWallet)
          ? true
          : normalizeAddress(onChain.contractorWallet) === normalizeAddress(selectedProject.contractorWallet);
        const engineerMatches = !selectedProject.engineerWallet || isZeroAddress(onChain.engineerWallet)
          ? true
          : normalizeAddress(onChain.engineerWallet) === normalizeAddress(selectedProject.engineerWallet);

        chainMatch = onChain.personnelAssigned && regionMatches && municipalityMatches && contractorMatches && engineerMatches;
        chainReference = "on-chain";

        if (!onChain.personnelAssigned) notes.push("Advisory: on-chain project requirement indicates personnel are not fully assigned.");
        if (!regionMatches) notes.push("Advisory: on-chain region assignment does not match project region requirement.");
        if (!municipalityMatches) notes.push("Advisory: on-chain municipality assignment does not match project requirement.");
        if (!contractorMatches) notes.push("Advisory: on-chain contractor wallet does not match the project record.");
        if (!engineerMatches) notes.push("Advisory: on-chain engineer wallet does not match the project record.");
      } else {
        chainMatch = Boolean(selectedProject.personnelAssigned);
        notes.push("Advisory: on-chain project details unavailable; using local personnel assignment fallback.");
      }

      const photos = ms.photos ?? [];
      const cleanPhotoCount = photos.filter((photo) => !photo.isTampered && photo.sourceType !== "edited").length;
      const photoRatio = photos.length > 0 ? cleanPhotoCount / photos.length : 0;
      const hasPhotos = photos.length > 0;
      const photoIntegrityMatch = hasPhotos && cleanPhotoCount === photos.length;

      if (!hasPhotos) {
        notes.push("No contractor photo evidence is attached to this milestone.");
      }
      if (hasPhotos && !photoIntegrityMatch) {
        notes.push(`Photo integrity check flagged ${photos.length - cleanPhotoCount} photo(s) as edited/tampered.`);
      }

      const gpsScore = gpsVarianceMeters === null ? 20 : gpsWithinThreshold ? 40 : gpsVarianceMeters <= 100 ? 15 : 0;
      const timestampScore = timestampMatch ? 25 : 5;
      const photoScore = Math.round(photoRatio * 35);
      const integrityScore = Math.max(0, Math.min(100, gpsScore + timestampScore + photoScore));

      const metadataMatch = gpsWithinThreshold && timestampMatch && photoIntegrityMatch;
      const flagged = !metadataMatch;

      if (!notes.length) {
        notes.push("All forensic checks passed based on contractor-submitted evidence (GPS, timestamp, photos).");
      }

      setForensicChecks((prev) => ({
        ...prev,
        [ms.id]: {
          milestoneId: ms.id,
          triggeredAt: new Date().toISOString(),
          integrityScore,
          gpsVarianceMeters,
          metadataMatch,
          timestampMatch,
          chainMatch,
          flagged,
          notes,
          chainReference,
        },
      }));

      alert(
        `Forensic validation complete. Integrity score: ${integrityScore}/100. ` +
        `GPS variance: ${gpsVarianceMeters !== null ? `${gpsVarianceMeters.toFixed(2)}m` : "N/A"}. ` +
        `${flagged ? "Project flagged for anomaly review." : "Metadata checks passed."}`
      );
    } finally {
      setIsProcessing(false);
    }
  }, [selectedProject, fetchProjectRequirementsOnChain]);

  const getTripleLockBlockers = useCallback((ms: Milestone): string[] => {
    const blockers: string[] = [];
    const check = forensicChecks[ms.id];

    if (!check) blockers.push("Forensic validation has not been triggered.");
    if (check && !check.metadataMatch) blockers.push("Metadata mismatch detected (GPS/timestamp/photo integrity check failed).");
    if (!coaRemarks.trim()) blockers.push("Auditor remark is required before approval.");
    if (!walletAddress) blockers.push("COA Regional wallet is not connected for digital signature.");

    return blockers;
  }, [forensicChecks, coaRemarks, walletAddress]);

  const handleConfirmForensicIntegrity = async (ms: Milestone) => {
    const blockers = getTripleLockBlockers(ms);
    if (blockers.length > 0) {
      alert(`Approval blocked:\n- ${blockers.join("\n- ")}`);
      return;
    }

    const forensicCheck = forensicChecks[ms.id];
    setIsProcessing(true); setLastSignResult(null);
    try {
      const signResult = await signAuditAttestation({
        projectId: ms.projectId,
        milestoneId: ms.id,
        verdict: "ATTESTED",
        description: `COA Regional approved milestone "${ms.milestoneName}" after forensic-first validation`,
        metadata: {
          milestoneName: ms.milestoneName,
          photoCount: ms.photos?.length ?? 0,
          region: assignedRegion,
          forensicScore: forensicCheck?.integrityScore ?? 0,
          gpsVarianceMeters: forensicCheck?.gpsVarianceMeters ?? "n/a",
          metadataMatch: forensicCheck?.metadataMatch ?? false,
        },
      });

      if (!signResult.txHash || !signResult.onChainConfirmed) throw new Error("Blockchain transaction was not confirmed.");
      if (!walletAddress || normalizeAddress(signResult.signer) !== normalizeAddress(walletAddress)) {
        throw new Error("Digital signature validation failed: signer wallet does not match the connected COA regional wallet.");
      }

      const blockTimestamp = await resolveBlockTimestamp(signResult.txHash);
      const blockStampText = blockTimestamp ?? signResult.timestamp;

      setLastSignResult(signResult);
      setForensicVerifiedMilestones((prev) => new Set(prev).add(ms.id));
      setSuspendedMilestones((prev) => {
        if (!prev[ms.id]) return prev;
        const next = { ...prev };
        delete next[ms.id];
        return next;
      });

      addAuditEntry({
        actionType: "COA_AUDITED",
        actorRole: "auditor",
        actorName: ACTOR_NAME,
        actorWallet: walletAddress,
        projectId: ms.projectId,
        projectName: selectedProject?.name ?? "",
        milestoneId: ms.id,
        milestoneName: ms.milestoneName,
        description: `Forensic integrity confirmed. Score ${forensicCheck?.integrityScore ?? 0}/100. Signed on-chain (${signResult.txHash}). | Block Timestamp: ${blockStampText}`,
        previousStatus: ms.status,
        newStatus: "COA_AUDITED",
        remarks: coaRemarks,
      });

      await updateMilestoneStatus(ms.id, "COA_AUDITED", coaRemarks, signResult.txHash, signResult.txHash || signResult.dataHash);

      logToAuditTrail(signResult, { role: "auditor", actionType: "COA_FORENSIC_VERIFIED", referenceId: ms.id, description: `COA Regional forensic-verified milestone "${ms.milestoneName}"`, actorName: ACTOR_NAME, projectId: ms.projectId, projectName: selectedProject?.name ?? "", region: assignedRegion }).catch(() => {});

      alert(`Milestone "${ms.milestoneName}" forensic integrity confirmed & recorded on-chain.`);
    } catch (err: unknown) {
      if (handleGasError(err)) { setIsProcessing(false); return; }
      const msg = err instanceof Error ? err.message : "Signing failed";
      if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) alert("MetaMask signature rejected — no data was saved.");
      else alert(`Signature Gate: ${msg}`);
    } finally { setIsProcessing(false); }
  };

  const handleSuspendMilestone = async () => {
    if (!aomRemarks.trim() || !aomTargetMilestone) return;
    const forensicCheck = forensicChecks[aomTargetMilestone.id];
    if (!forensicCheck) {
      alert("Run forensic validation before issuing an AOM.");
      return;
    }

    setIsProcessing(true);
    try {
      const signResult = await signAuditAttestation({
        projectId: aomTargetMilestone.projectId,
        milestoneId: aomTargetMilestone.id,
        verdict: "FLAGGED",
        description: `COA Regional issues AOM for milestone "${aomTargetMilestone.milestoneName}" — Reason: ${aomRemarks}`,
        metadata: {
          milestoneName: aomTargetMilestone.milestoneName,
          enforcementType: "AOM_ISSUANCE",
          region: assignedRegion,
          forensicScore: forensicCheck.integrityScore,
          gpsVarianceMeters: forensicCheck.gpsVarianceMeters ?? "n/a",
        },
      });

      if (!signResult.txHash || !signResult.onChainConfirmed) {
        throw new Error("Blockchain transaction was not confirmed for AOM issuance.");
      }
      if (!walletAddress || normalizeAddress(signResult.signer) !== normalizeAddress(walletAddress)) {
        throw new Error("Digital signature validation failed: signer wallet does not match the connected COA regional wallet.");
      }

      const blockTimestamp = await resolveBlockTimestamp(signResult.txHash);
      const blockStampText = blockTimestamp ?? signResult.timestamp;

      setSuspendedMilestones((prev) => ({ ...prev, [aomTargetMilestone.id]: { reason: aomRemarks, issuedAt: new Date().toISOString() } }));

      addAuditEntry({
        actionType: "PROJECT_SUSPENDED",
        actorRole: "auditor",
        actorName: ACTOR_NAME,
        actorWallet: walletAddress,
        projectId: aomTargetMilestone.projectId,
        projectName: selectedProject?.name ?? "",
        milestoneId: aomTargetMilestone.id,
        milestoneName: aomTargetMilestone.milestoneName,
        description: `AOM issued. Milestone flagged for anomaly review. Signed on-chain (${signResult.txHash}). | Block Timestamp: ${blockStampText}. Reason: ${aomRemarks}`,
        previousStatus: aomTargetMilestone.status,
        newStatus: "COA_REJECTED",
        remarks: aomRemarks,
      });

      await updateMilestoneStatus(aomTargetMilestone.id, "COA_REJECTED", aomRemarks, signResult.txHash, signResult.txHash || signResult.dataHash);
      logToAuditTrail(signResult, { role: "auditor", actionType: "COA_MILESTONE_SUSPENDED", referenceId: aomTargetMilestone.id, description: `AOM suspension for milestone "${aomTargetMilestone.milestoneName}"`, actorName: ACTOR_NAME, projectId: aomTargetMilestone.projectId, projectName: selectedProject?.name ?? "", region: assignedRegion }).catch(() => {});

      setAomRemarks(""); setShowAomModal(false); setAomTargetMilestone(null);
      alert(`AOM issued. Milestone "${aomTargetMilestone.milestoneName}" suspended on-chain.`);
    } catch (err: unknown) {
      if (handleGasError(err)) { setIsProcessing(false); return; }
      const msg = err instanceof Error ? err.message : "Signing failed";
      if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) alert("MetaMask signature rejected — suspension cancelled.");
      else alert(`Signature Gate: ${msg}`);
    } finally { setIsProcessing(false); }
  };

  const syncState = useCallback(async () => {
    const auditedMilestones = new Map<string, { txHash?: string; dataHash?: string; remarks?: string }>();

    for (const milestone of milestones) {
      if (milestone.status === "COA_AUDITED") {
        auditedMilestones.set(milestone.id, {
          txHash: milestone.blockchainHash,
          dataHash: milestone.blockchainDataHash,
          remarks: milestone.coaRemarks,
        });
      }
    }

    for (const entry of auditEntries) {
      if (entry.actionType !== "COA_AUDITED" || !entry.milestoneId) continue;
      auditedMilestones.set(entry.milestoneId, {
        txHash: entry.blockchainHash,
        remarks: entry.remarks,
      });
    }

    if (auditedMilestones.size === 0) return;

    const repairs: Promise<void>[] = [];
    for (const milestone of milestones) {
      const lock = auditedMilestones.get(milestone.id);
      if (!lock) continue;
      if (milestone.status === "COA_AUDITED") continue;

      repairs.push(
        updateMilestoneStatus(
          milestone.id,
          "COA_AUDITED",
          lock.remarks ?? milestone.coaRemarks ?? "Reconciled from blockchain audit trail",
          lock.txHash ?? milestone.blockchainHash,
          lock.dataHash ?? milestone.blockchainDataHash
        )
      );
    }

    if (repairs.length > 0) {
      await Promise.allSettled(repairs);
    }

    setForensicVerifiedMilestones((prev) => {
      const next = new Set(prev);
      for (const id of auditedMilestones.keys()) next.add(id);
      return next;
    });

    setSuspendedMilestones((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of auditedMilestones.keys()) {
        if (next[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [milestones, auditEntries, updateMilestoneStatus]);

  useEffect(() => {
    void syncState();
  }, [syncState]);

  const walletMismatch = (() => {
    if (!profile || !walletAddress) return false;
    if (!profile.walletAddress) return false;
    return profile.walletAddress.toLowerCase() !== walletAddress.toLowerCase();
  })();

  const handleDisconnect = async () => {
    await disconnectWallet();
    setCurrentPage("home");
  };

  const handleOpenSuspendModal = (ms: Milestone) => {
    setAomTargetMilestone(ms);
    setShowAomModal(true);
  };

  const handleCloseSuspendModal = () => {
    setShowAomModal(false);
    setAomTargetMilestone(null);
    setAomRemarks("");
  };

  return {
    mainTab,
    setMainTab,
    assignedRegion,
    regionScopedProjects,
    pendingAuditProjectIds,
    auditedProjectIds,
    pendingPriorityByProjectId,
    registryTraceByProjectId,
    regionalAuditLogs,
    milestones,
    searchQuery,
    setSearchQuery,
    selectedMunicipality,
    setSelectedMunicipality,
    selectedBarangay,
    setSelectedBarangay,
    municipalities,
    barangays,
    selectedProject,
    setSelectedProject,
    auditEntries,
    projectMilestones,
    forensicVerifiedMilestones,
    forensicChecks,
    suspendedMilestones,
    coaRemarks,
    setCoaRemarks,
    isProcessing,
    handleRunForensicValidation,
    handleConfirmForensicIntegrity,
    handleOpenSuspendModal,
    lastSignResult,
    showAomModal,
    aomTargetMilestone,
    aomRemarks,
    setAomRemarks,
    handleSuspendMilestone,
    handleCloseSuspendModal,
    gasError,
    clearGasError,
    walletMismatch,
    walletAddress,
    profile,
    handleDisconnect,
  };
}
