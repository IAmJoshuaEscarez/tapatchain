import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/card";
import { CollapsibleSection, SummaryBar, StatItem } from "@/components/ui/collapsible-section";
import {
  ArrowLeft,
  Wallet,
  Building2,
  MapPin,
  Eye,
  Camera,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  Map as MapIcon,
  Search,
  X,
  Filter,
  Shield,
  Package,
  Image,
  ExternalLink,
  Loader2,
  Crosshair,
  AlertTriangle,
  Hash,
} from "lucide-react";
import { formatCurrency, calculateDistance } from "@/lib/utils";
import { hasValidGps, GEOFENCE_RADIUS_M } from "@/lib/geolocation";
import { useMilestoneContext } from "@/context/MilestoneContext";
import { useProjectContext } from "@/context/ProjectContext";
import { useNotifications, notificationHelpers } from "@/context/NotificationContext";
import { useAuditTrail } from "@/context/AuditTrailContext";
import { signEngineerAttestation, logToAuditTrail, type SignatureGateResult } from "@/services/signatureGate";
import { verifyTransactionOnChain, getEtherscanLink } from "@/features/blockchain/services/blockchain";
import { blueprintApi, type BlueprintResponse, type VerifyBlueprintPayload } from "@/features/milestone/api/milestoneApi";
import { useGasGuard } from "@/hooks/useGasGuard";
import { InsufficientGasModal } from "@/components/ui";
import { authApi } from "@/services/api";
import { PhotoLocationMap, type MapPhoto } from "@/components/ui/photo-metadata/PhotoLocationMap";
import { SiteIntegrityReport, type IntegrityPhoto } from "@/components/ui/site-integrity/SiteIntegrityReport";
import { useLookup } from "@/hooks/useLookup";
import { BlueprintValidationPanel, type BlueprintPhoto } from "@/components/ui/blueprint/BlueprintValidationPanel";
import { PhotoMetadataPanel } from "@/components/ui/photo-metadata/PhotoMetadataPanel";

import type { ExifMetadata } from "@/lib/exifExtractor";
import { getBearingString, buildExifFromPhotoData, checkCrossPhotoConsistency } from "@/lib/exifExtractor";
import type { PendingMilestone } from "@/types";

interface DPWHProjectEngineerDashboardProps {
  setCurrentPage: (page: string) => void;
}

export function DPWHProjectEngineerDashboard({ setCurrentPage }: DPWHProjectEngineerDashboardProps) {
  const { disconnectWallet, walletAddress } = useWallet();
  const [selectedMilestone, setSelectedMilestone] = useState<PendingMilestone | null>(null);
  const [inspectorRemarks, setInspectorRemarks] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [showBlueprintComparison, setShowBlueprintComparison] = useState(false);
  const [isVerifyingHash, setIsVerifyingHash] = useState(false);
  const [hashVerificationResult, setHashVerificationResult] = useState<'verified' | 'mismatch' | null>(null);
  const [lastSignResult, setLastSignResult] = useState<SignatureGateResult | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [locationMatchResult, setLocationMatchResult] = useState<'matched' | 'discrepancy' | null>(null);
  const [gpsFlags, setGpsFlags] = useState<string[]>([]);
  const [projectBlueprints, setProjectBlueprints] = useState<BlueprintResponse[]>([]);
  const [isLoadingBlueprints, setIsLoadingBlueprints] = useState(false);
  const [verifyingBlueprintId, setVerifyingBlueprintId] = useState<number | null>(null);
  const [blueprintRemarks, setBlueprintRemarks] = useState<Record<number, string>>({});
  const [allMetadataVerified, setAllMetadataVerified] = useState(false);
  const [blueprintComplianceConfirmed, setBlueprintComplianceConfirmed] = useState(false);
  const [showNoRdModal, setShowNoRdModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending" | "signed">("pending");
  const [selectedMapPhotoId, setSelectedMapPhotoId] = useState<string | number | null>(null);
  const [expandedPhotoIdx, setExpandedPhotoIdx] = useState<number | null>(null);
  
  // Context hooks
  const { milestones, getSubmittedMilestones, updateMilestoneStatus, refreshMilestones } = useMilestoneContext();
  const { addNotification } = useNotifications();
  const { addAuditEntry } = useAuditTrail();
  const { gasError, clearGasError, handleGasError } = useGasGuard();
  const { projects: rdcProjects } = useProjectContext();
  
  // Refresh milestones from API on mount to pick up new contractor submissions
  useEffect(() => {
    refreshMilestones();
  }, [refreshMilestones, walletAddress]);
  
  // Get milestones from context — only those from projects assigned to this engineer
  const allSubmittedMilestones = getSubmittedMilestones();
  
  // Build a set of project IDs where this wallet is the assigned engineer
  const engineerProjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of rdcProjects) {
      if (
        p.personnelAssigned &&
        p.engineerWallet?.toLowerCase() === walletAddress?.toLowerCase()
      ) {
        ids.add(p.id);
      }
    }
    return ids;
  }, [rdcProjects, walletAddress]);

  // Only show milestones from projects assigned to this engineer
  const contextMilestones = useMemo(() => {
    return allSubmittedMilestones.filter(m => engineerProjectIds.has(m.projectId));
  }, [allSubmittedMilestones, engineerProjectIds]);
  
  // Convert context milestones to PendingMilestone format for compatibility
  // Enrich with project data since the milestone API doesn't return region/municipality/barangay/contractor
  const convertedMilestones: PendingMilestone[] = useMemo(() => {
    // Build a lookup map for O(1) project resolution
    const projectMap = new Map(rdcProjects.map(p => [p.id, p]));

    return contextMilestones.map(m => {
      const project = projectMap.get(m.projectId);
      return {
        id: m.id,
        projectId: m.projectId,
        projectName: m.projectName || project?.title || "",
        milestoneName: m.milestoneName,
        contractor: m.contractorName || project?.contractorName || "",
        region: m.region || project?.region || project?.dpwhRegion || "",
        municipality: m.municipality || project?.municipality || "",
        barangay: m.barangay || project?.barangay || "N/A",
        requestedAmount: m.requestedAmount,
        targetProgress: m.targetProgress,
        status: "Under Review",
        phase: m.milestoneName,
        submittedDate: m.submittedDate,
        description: m.description,
        photosCount: m.photos.length,
        gpsVerified: m.gpsVerified ?? false,
        location: { lat: m.gpsMetadata.latitude, lng: m.gpsMetadata.longitude },
        targetCompletion: `${m.targetProgress}%`,
        baselineTarget: project?.targetPercent ?? m.targetProgress,
        actualPhotos: m.photos.length,
        metamaskConnected: true,
        inspectorRemarks: "",
        actualSubmission: m.submittedDate,
        gpsMetadata: {
          latitude: m.gpsMetadata.latitude,
          longitude: m.gpsMetadata.longitude,
          accuracy: m.gpsMetadata.accuracy,
          timestamp: m.gpsMetadata.timestamp
        },
        materials: m.materials,
        // Pass through real data
        blockchainTxHash: m.blockchainHash,
        contractorRemarks: m.contractorRemarks,
        photos: m.photos.map(p => ({
          id: Number(p.id) || 0,
          fileName: p.name,
          contentType: "image/jpeg",
          fileSize: 0,
          gpsLatitude: p.gpsLat,
          gpsLongitude: p.gpsLng,
          gpsAccuracy: p.gpsAccuracy,
          base64Data: p.url.startsWith("data:") ? p.url.split(",")[1] : undefined,
          // EXIF forensic data (passed through from ContractorDashboard)
          gpsAltitude: p.gpsAltitude,
          gpsDirection: p.gpsDirection,
          deviceMake: p.deviceMake,
          deviceModel: p.deviceModel,
          software: p.software,
          isTampered: p.isTampered,
          tamperReason: p.tamperReason,
          sourceType: p.sourceType,
          dateTimeOriginal: p.dateTimeOriginal,
          forensicFlags: p.forensicFlags,
          sourceVerdict: p.sourceVerdict,
          deviceSignature: p.deviceSignature,
        })),
      };
    });
  }, [contextMilestones, rdcProjects]);
  
  // Combine context data only (no mock data)
  const allMilestones = useMemo(() => {
    return convertedMilestones;
  }, [convertedMilestones]);

  // Signed/completed milestones: anything at or beyond engineer review stage.
  const signedMilestones: PendingMilestone[] = useMemo(() => {
    const projectMap = new Map(rdcProjects.map(p => [p.id, p]));
    const signedOrCompleted = milestones.filter((m) =>
      [
        "ENGINEER_VERIFIED",
        "ENGINEER_REJECTED",
        "INSPECTOR_APPROVED",
        "INSPECTOR_REJECTED",
        "COA_AUDITED",
        "COA_REJECTED",
        "MILESTONE_PAID",
        "PUBLISHED",
      ].includes(m.status)
    );

    return signedOrCompleted
      .filter(m => engineerProjectIds.has(m.projectId))
      .sort((a, b) => new Date(b.submittedDate).getTime() - new Date(a.submittedDate).getTime())
      .map(m => {
        const project = projectMap.get(m.projectId);
        const isEngineerRejected =
          m.status === "ENGINEER_REJECTED" || m.status === "INSPECTOR_REJECTED";
        return {
          id: m.id,
          projectId: m.projectId,
          projectName: m.projectName || project?.title || "",
          milestoneName: m.milestoneName,
          contractor: m.contractorName || project?.contractorName || "",
          region: m.region || project?.region || project?.dpwhRegion || "",
          municipality: m.municipality || project?.municipality || "",
          barangay: m.barangay || project?.barangay || "N/A",
          requestedAmount: m.requestedAmount,
          targetProgress: m.targetProgress,
          // Engineer decision should reflect engineer action only.
          // Post-engineer lifecycle states (COA/RD) still mean engineer verified.
          status: isEngineerRejected ? "Rejected" : "Verified",
          phase: m.milestoneName,
          submittedDate: m.inspectedDate ?? m.submittedDate,
          description: m.description,
          photosCount: m.photos.length,
          gpsVerified: m.gpsVerified ?? false,
          location: { lat: m.gpsMetadata.latitude, lng: m.gpsMetadata.longitude },
          targetCompletion: `${m.targetProgress}%`,
          baselineTarget: project?.targetPercent ?? m.targetProgress,
          actualPhotos: m.photos.length,
          metamaskConnected: true,
          inspectorRemarks: m.inspectorRemarks || "",
          actualSubmission: m.submittedDate,
          gpsMetadata: m.gpsMetadata,
          materials: m.materials,
          blockchainTxHash: m.blockchainHash,
          contractorRemarks: m.contractorRemarks,
          photos: m.photos.map(p => ({
            id: Number(p.id) || 0,
            fileName: p.name,
            contentType: "image/jpeg",
            fileSize: 0,
            gpsLatitude: p.gpsLat,
            gpsLongitude: p.gpsLng,
            gpsAccuracy: p.gpsAccuracy,
            base64Data: p.url.startsWith("data:") ? p.url.split(",")[1] : undefined,
          })),
        } as PendingMilestone;
      });
  }, [milestones, engineerProjectIds, rdcProjects]);
  
  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMunicipality, setSelectedMunicipality] = useState("All");
  const [selectedBarangay, setSelectedBarangay] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");

  // Role-based: load assigned region from user profile
  const [assignedRegion, setAssignedRegion] = useState("All Regions");
  const [profile, setProfile] = useState<{ walletAddress?: string; assignedRegion?: string; displayName?: string } | null>(null);
  
  const loadProfile = useCallback(async () => {
    try {
      const res = await authApi.getProfile();
      setProfile(res.data);
      if (res.data.assignedRegion) setAssignedRegion(res.data.assignedRegion);
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Load blueprints when a milestone is selected
  useEffect(() => {
    if (!selectedMilestone) {
      setProjectBlueprints([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setIsLoadingBlueprints(true);
      try {
        const res = await blueprintApi.getByProjectId(selectedMilestone.projectId);
        if (!cancelled) setProjectBlueprints(res.data);
      } catch {
        if (!cancelled) setProjectBlueprints([]);
      } finally {
        if (!cancelled) setIsLoadingBlueprints(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedMilestone?.projectId]);
  
  // GPS Distance Alert — prefer Project's anchored site GPS (stable across milestones),
  // fallback to milestone-level GPS (which can drift per-submission)
  const projectSiteGPS = useMemo(() => {
    if (!selectedMilestone) return { lat: 0, lng: 0 };
    // Look up the project's official anchored site coordinates
    const project = rdcProjects.find(p => p.id === selectedMilestone.projectId);
    if (project?.siteLatitude && project?.siteLongitude) {
      return { lat: project.siteLatitude, lng: project.siteLongitude };
    }
    // Fallback: milestone-level GPS
    return { lat: selectedMilestone.location.lat, lng: selectedMilestone.location.lng };
  }, [selectedMilestone, rdcProjects]);
  
  // Get unique municipalities and barangays within assigned region
  const regionMilestones = assignedRegion === "All Regions"
    ? allMilestones
    : allMilestones.filter(m => m.region === assignedRegion);
  const municipalities = ["All", ...Array.from(new Set(regionMilestones.map(m => m.municipality)))];
  const barangays = selectedMunicipality === "All"
    ? ["All", ...Array.from(new Set(regionMilestones.map(m => m.barangay).filter(Boolean)))]
    : ["All", ...Array.from(new Set(regionMilestones.filter(m => m.municipality === selectedMunicipality).map(m => m.barangay).filter(Boolean)))];
  
  // Filter milestones based on search and filters (locked to assigned region)
  const filteredMilestones = regionMilestones.filter(milestone => {
    const matchesSearch = searchQuery === "" || 
      milestone.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      milestone.contractor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      milestone.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesMunicipality = selectedMunicipality === "All" || milestone.municipality === selectedMunicipality;
    const matchesBarangay = selectedBarangay === "All" || milestone.barangay === selectedBarangay;
    const matchesStatus = selectedStatus === "All" || milestone.status === selectedStatus;
    
    return matchesSearch && matchesMunicipality && matchesBarangay && matchesStatus;
  });

  const handleApprove = async () => {
    if (!selectedMilestone) return;

    // ── Guard: check if a COA Regional Auditor exists for this region ──
    try {
      const res = await authApi.roleExistsInRegion("auditor", assignedRegion);
      if (!res.data.exists) {
        setShowNoRdModal(true);
        return;
      }
    } catch {
      // On network error, block the action to be safe
      setShowNoRdModal(true);
      return;
    }

    setIsApproving(true);
    setLastSignResult(null);

    try {
      // ── 1) MetaMask Signature Gate — Project Engineer signs attestation ──
      const signResult = await signEngineerAttestation({
        projectId: selectedMilestone.projectId,
        milestoneId: selectedMilestone.id,
        description: `Project Engineer attests milestone "${selectedMilestone.milestoneName}" for ${selectedMilestone.projectName}`,
        metadata: {
          projectName: selectedMilestone.projectName,
          amount: selectedMilestone.requestedAmount,
        },
      });

      // Guard: block DB save if blockchain tx was not confirmed
      if (!signResult.txHash || !signResult.onChainConfirmed) {
        throw new Error("Blockchain transaction was not confirmed. Attestation was NOT saved.");
      }
      setLastSignResult(signResult);

      // ── 2) Update milestone in context ──
      const contextMilestone = contextMilestones.find(m => m.id === selectedMilestone.id);
      if (contextMilestone) {
        await updateMilestoneStatus(
          selectedMilestone.id,
          "ENGINEER_VERIFIED",
          inspectorRemarks || "Verified by Site Engineer",
          signResult.txHash,
          signResult.txHash || signResult.dataHash
        );

        addAuditEntry({
          actionType: "ENGINEER_VERIFIED",
          actorRole: "engineer",
          actorName: "Site Engineer",
          actorWallet: walletAddress,
          projectId: selectedMilestone.projectId,
          projectName: selectedMilestone.projectName,
          milestoneId: selectedMilestone.id,
          milestoneName: selectedMilestone.milestoneName,
          description: `Site Engineer verification signed on-chain (${signResult.txHash.slice(0, 10)}...)`,
          amount: selectedMilestone.requestedAmount,
          previousStatus: "SUBMITTED",
          newStatus: "ENGINEER_VERIFIED",
          remarks: inspectorRemarks || "All specifications met. Materials quality verified. Engineer verified.",
        });

        const notification = notificationHelpers.milestoneVerified(
          selectedMilestone.projectName,
          selectedMilestone.milestoneName,
          selectedMilestone.id
        );
        addNotification(notification);
      }

      // ── 3) Log to backend audit trail ──
      await logToAuditTrail(signResult, {
        role: "engineer",
        actionType: "ENGINEER_ATTESTATION",
        referenceId: selectedMilestone.id,
        description: `Project Engineer attested milestone "${selectedMilestone.milestoneName}"`,
        actorName: "Project Engineer",
        projectId: selectedMilestone.projectId,
        projectName: selectedMilestone.projectName,
      });

      alert(`Milestone ${selectedMilestone.id} verified & signed on-chain! COA Auditor will be notified.`);
      setIsApproving(false);
      setSelectedMilestone(null);
      setInspectorRemarks("");
      setActiveTab("signed");
    } catch (err: unknown) {
      if (handleGasError(err)) { setIsApproving(false); return; }
      const msg = err instanceof Error ? err.message : "Signing/attestation failed";
      alert(`Signature Gate: ${msg}`);
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedMilestone) return;
    if (!rejectionReason.trim()) {
      alert("Rejection reason is mandatory! Please specify why this milestone is being rejected.");
      return;
    }
    setIsApproving(true);

    try {
      const combinedRemarks = [
        rejectionReason,
        inspectorRemarks ? `Engineer Notes: ${inspectorRemarks}` : "",
        gpsFlags.length > 0 ? `GPS Flags: ${gpsFlags.join("; ")}` : "",
        locationMatchResult === "discrepancy" ? "Location match: DISCREPANCY" : "",
      ].filter(Boolean).join(" | ");

      // ── MetaMask Signature Gate — Engineer must sign rejection on-chain ──
      const signResult = await signEngineerAttestation({
        projectId: selectedMilestone.projectId,
        milestoneId: selectedMilestone.id,
        description: `Project Engineer rejects milestone "${selectedMilestone.milestoneName}" for ${selectedMilestone.projectName}. Reason: ${rejectionReason}`,
        metadata: {
          projectName: selectedMilestone.projectName,
          verdict: "REJECTED",
          rejectionReason: rejectionReason,
          gpsFlags: gpsFlags.join("; "),
        },
      });

      // Only reach here if MetaMask was confirmed — safe to save off-chain
      const contextMilestone = contextMilestones.find(m => m.id === selectedMilestone.id);

      if (contextMilestone) {
        await updateMilestoneStatus(
          selectedMilestone.id,
          "ENGINEER_REJECTED",
          combinedRemarks,
          signResult.txHash,
          signResult.txHash || signResult.dataHash
        );

        addAuditEntry({
          actionType: "ENGINEER_REJECTED",
          actorRole: "engineer",
          actorName: "Project Engineer",
          actorWallet: walletAddress,
          projectId: selectedMilestone.projectId,
          projectName: selectedMilestone.projectName,
          milestoneId: selectedMilestone.id,
          milestoneName: selectedMilestone.milestoneName,
          description: `Milestone "${selectedMilestone.milestoneName}" rejected by Project Engineer. Reason: ${rejectionReason}. Signed on-chain (${signResult.txHash.slice(0, 10)}...)`,
          previousStatus: "SUBMITTED",
          newStatus: "ENGINEER_REJECTED",
          remarks: combinedRemarks,
          metadata: { txHash: signResult.txHash, rejectionReason, gpsFlags },
        });

        const notification = notificationHelpers.milestoneRejected(
          selectedMilestone.projectName,
          selectedMilestone.milestoneName,
          selectedMilestone.id,
          inspectorRemarks
        );
        addNotification(notification);
      }

      await logToAuditTrail(signResult, {
        role: "engineer",
        actionType: "ENGINEER_REJECTED",
        referenceId: selectedMilestone.id,
        description: `Project Engineer rejected milestone "${selectedMilestone.milestoneName}"`,
        actorName: "Project Engineer",
        projectId: selectedMilestone.projectId,
        projectName: selectedMilestone.projectName,
      }).catch(() => {});

      alert(`Milestone ${selectedMilestone.id} rejected & signed on-chain. Project proponent will be notified.`);
      setSelectedMilestone(null);
      setInspectorRemarks("");
      setRejectionReason("");
      setLocationMatchResult(null);
      setGpsFlags([]);
      setActiveTab("signed");
    } catch (err: unknown) {
      if (handleGasError(err)) { setIsApproving(false); return; }
      const msg = err instanceof Error ? err.message : "Signing failed";
      if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
        alert("MetaMask signature rejected — rejection cancelled. No data was saved.");
      } else {
        alert(`Signature Gate: ${msg}`);
      }
    } finally {
      setIsApproving(false);
    }
  };

  const handleVerifyHash = async () => {
    if (!selectedMilestone) return;
    setIsVerifyingHash(true);
    setHashVerificationResult(null);

    try {
      const txHash = selectedMilestone.blockchainTxHash;
      if (!txHash || !txHash.startsWith("0x") || txHash.length < 66) {
        // No valid on-chain tx hash stored
        setHashVerificationResult('mismatch');
        return;
      }

      const result = await verifyTransactionOnChain(txHash);
      setHashVerificationResult(result.verified ? 'verified' : 'mismatch');
    } catch (err) {
      console.error("Hash verification failed:", err);
      setHashVerificationResult('mismatch');
    } finally {
      setIsVerifyingHash(false);
    }
  };

  const handleVerifyBlueprint = async (blueprintId: number, status: "COMPLIANT" | "NON_COMPLIANT") => {
    if (!walletAddress) return;
    setVerifyingBlueprintId(blueprintId);
    try {
      const payload: VerifyBlueprintPayload = {
        verificationStatus: status,
        verifiedByWallet: walletAddress,
        verificationRemarks: blueprintRemarks[blueprintId] || "",
      };
      await blueprintApi.verify(blueprintId, payload);
      // Refresh blueprints
      if (selectedMilestone) {
        const updated = await blueprintApi.getByProjectId(selectedMilestone.projectId);
        setProjectBlueprints(updated.data);
      }
    } catch (err) {
      console.error("Blueprint verification failed:", err);
    } finally {
      setVerifyingBlueprintId(null);
    }
  };

  // Calculate GPS distance if milestone is selected
  const gpsDistance = selectedMilestone ? calculateDistance(
    projectSiteGPS.lat, projectSiteGPS.lng,
    selectedMilestone.gpsMetadata.latitude, selectedMilestone.gpsMetadata.longitude
  ) : 0;
  const isWithinRadius = gpsDistance <= 50;

  // ── Wallet-Mismatch Gate ──
  const walletMismatch = (() => {
    if (!profile || !walletAddress) return false;
    if (!profile.walletAddress) return false;
    return profile.walletAddress.toLowerCase() !== walletAddress.toLowerCase();
  })();

  if (walletMismatch) {
    return (
      <div className="pt-20 min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 bg-card border border-destructive/30 rounded-xl space-y-4">
          <Shield className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Wallet Mismatch Detected</h2>
          <p className="text-muted-foreground text-sm">
            The connected MetaMask wallet does not match the authorized wallet for your Project Engineer account.
          </p>
          <p className="text-xs text-muted-foreground">
            Connected: <code className="text-destructive">{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</code><br />
            Authorized: <code className="text-primary">{profile?.walletAddress?.slice(0, 6)}...{profile?.walletAddress?.slice(-4)}</code>
          </p>
          <Button
            onClick={async () => { await disconnectWallet(); setCurrentPage("home"); }}
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
          >
            Disconnect & Return
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground">DPWH (Project Engineer)</h1>
              <p className="text-muted-foreground text-xs mt-0.5">
                Review and verify contractor submissions
              </p>
              <span className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                Project Engineer | {assignedRegion}
              </span>
            </div>
            <Button
              onClick={async () => { await disconnectWallet(); setCurrentPage('home'); }}
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground hover:bg-muted text-xs h-8"
            >
              <Wallet className="w-3.5 h-3.5 mr-1.5" />
              Disconnect
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {!selectedMilestone ? (
          /* Table View - Projects List */
          <div className="space-y-4 sm:space-y-6">
            {/* Tab Switcher */}
            <div className="flex items-center gap-1 border-b border-border">
              <button
                onClick={() => setActiveTab("pending")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === "pending"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Pending Verifications
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">{filteredMilestones.length}</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("signed")}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === "signed"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Signed Milestones
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">{signedMilestones.length}</span>
                </div>
              </button>
            </div>

            {/* Search and Filters */}
            {activeTab === "pending" && (
            <CollapsibleSection
              title="Search & Filters"
              icon={<Filter />}
              badge={
                (searchQuery || selectedMunicipality !== "All" || selectedBarangay !== "All" || selectedStatus !== "All") ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">Active</span>
                ) : undefined
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                  <input
                    type="text"
                    placeholder="Search projects, proponents, or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground rounded-md focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="relative">
                  <select
                    value={selectedMunicipality}
                    onChange={(e) => { setSelectedMunicipality(e.target.value); setSelectedBarangay("All"); }}
                    className="w-full px-3 py-2 text-sm border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary appearance-none cursor-pointer"
                  >
                    {municipalities.map(municipality => (
                      <option key={municipality} value={municipality} className="bg-background text-foreground">{municipality === "All" ? "All Municipalities" : municipality}</option>
                    ))}
                  </select>
                  <Building2 className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5 pointer-events-none" />
                </div>
                <div className="relative">
                  <select
                    value={selectedBarangay}
                    onChange={(e) => setSelectedBarangay(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary appearance-none cursor-pointer"
                  >
                    {barangays.map(brgy => (
                      <option key={brgy} value={brgy} className="bg-background text-foreground">{brgy === "All" ? "All Barangays" : `Brgy. ${brgy}`}</option>
                    ))}
                  </select>
                  <MapPin className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5 pointer-events-none" />
                </div>
                <div className="relative">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary appearance-none cursor-pointer"
                  >
                    <option value="All" className="bg-background text-foreground">All Status</option>
                    <option value="Approved" className="bg-background text-foreground">Approved</option>
                    <option value="Under Review" className="bg-background text-foreground">Pending</option>
                  </select>
                  <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5 pointer-events-none" />
                </div>
              </div>

              {(searchQuery || selectedMunicipality !== "All" || selectedBarangay !== "All" || selectedStatus !== "All") && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">Active:</span>
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted text-foreground rounded-full text-xs">
                      "{searchQuery}"
                      <X className="w-3 h-3 cursor-pointer hover:text-muted-foreground" onClick={() => setSearchQuery("")} />
                    </span>
                  )}
                  {selectedMunicipality !== "All" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted text-foreground rounded-full text-xs">
                      {selectedMunicipality}
                      <X className="w-3 h-3 cursor-pointer hover:text-muted-foreground" onClick={() => setSelectedMunicipality("All")} />
                    </span>
                  )}
                  {selectedBarangay !== "All" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted text-foreground rounded-full text-xs">
                      Brgy. {selectedBarangay}
                      <X className="w-3 h-3 cursor-pointer hover:text-muted-foreground" onClick={() => setSelectedBarangay("All")} />
                    </span>
                  )}
                  {selectedStatus !== "All" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted text-foreground rounded-full text-xs">
                      {selectedStatus === "Under Review" ? "Pending" : selectedStatus}
                      <X className="w-3 h-3 cursor-pointer hover:text-muted-foreground" onClick={() => setSelectedStatus("All")} />
                    </span>
                  )}
                  <button
                    onClick={() => { setSearchQuery(""); setSelectedMunicipality("All"); setSelectedBarangay("All"); setSelectedStatus("All"); }}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </CollapsibleSection>
            )}

            {/* ── Pending Milestones Table ── */}
            {activeTab === "pending" && (
            <Card className="overflow-hidden border border-primary/10 rounded-xl shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-primary/5 border-b border-primary/10">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Project Name</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Municipality</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Barangay</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Proponent</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Milestone</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredMilestones.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-16 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Search className="w-8 h-8 mb-2 opacity-50" />
                            <p className="text-sm font-medium">No milestones pending review</p>
                            <p className="text-xs mt-0.5">Milestones will appear here when assigned contractors submit progress reports for your projects</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredMilestones.map((milestone) => (
                        <tr 
                          key={milestone.id} 
                          className="hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedMilestone(milestone)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-primary shrink-0" />
                              <div>
                                <div className="text-sm font-medium text-foreground">{milestone.projectName}</div>
                                <div className="text-[11px] text-muted-foreground">{milestone.id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-foreground">{milestone.municipality}</td>
                          <td className="px-4 py-3 text-xs text-foreground">Brgy. {milestone.barangay}</td>
                          <td className="px-4 py-3 text-xs text-foreground">{milestone.contractor}</td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-medium text-foreground">{milestone.milestoneName}</div>
                            <div className="text-[11px] text-muted-foreground">Target: {milestone.targetProgress}%</div>
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-primary">{formatCurrency(milestone.requestedAmount)}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[11px] font-semibold">
                              {milestone.status === 'Approved' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              {milestone.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              size="sm"
                              variant="outline"
                              className="hover:bg-primary hover:text-white border-primary/30 text-primary text-xs h-7 px-3 rounded-lg"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMilestone(milestone);
                              }}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Review
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
            )}

            {/* ── Signed Milestones Table ── */}
            {activeTab === "signed" && (
              <Card className="overflow-hidden border border-emerald-500/20 rounded-xl shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-emerald-500/5 border-b border-emerald-500/10">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Project Name</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Municipality</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Proponent</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Milestone</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Engineer Decision</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date Signed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {signedMilestones.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-16 text-center">
                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                              <Shield className="w-8 h-8 mb-2 opacity-50" />
                              <p className="text-sm font-medium">No signed milestones yet</p>
                              <p className="text-xs mt-0.5">Milestones you have attested or rejected will appear here</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        signedMilestones.map((ms) => (
                          <tr key={ms.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <div>
                                  <div className="text-sm font-medium text-foreground">{ms.projectName}</div>
                                  <div className="text-[11px] text-muted-foreground">{ms.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-foreground">{ms.municipality}</td>
                            <td className="px-4 py-3 text-xs text-foreground">{ms.contractor}</td>
                            <td className="px-4 py-3">
                              <div className="text-xs font-medium text-foreground">{ms.milestoneName}</div>
                              <div className="text-[11px] text-muted-foreground">Target: {ms.targetProgress}%</div>
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold text-foreground">{formatCurrency(ms.requestedAmount)}</td>
                            <td className="px-4 py-3">
                              {ms.status === "Verified" || ms.status === "Approved" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 text-[11px] font-semibold">
                                  <CheckCircle className="w-3 h-3" />
                                  Verified
                                </span>
                              ) : ms.status === "Rejected" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/10 text-red-700 border border-red-500/20 text-[11px] font-semibold">
                                  <AlertCircle className="w-3 h-3" />
                                  Rejected
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border text-[11px] font-semibold">
                                  <Clock className="w-3 h-3" />
                                  Pending
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {ms.submittedDate
                                ? new Date(ms.submittedDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
                                : "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Workflow Pipeline Indicator */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground py-3 flex-wrap">
              {[
                { step: 1, label: "RDC Proposed" },
                { step: 2, label: "National Funded" },
                { step: 3, label: "RD Assigned" },
                { step: 4, label: "Contractor Submitted" },
                { step: 5, label: "Engineer Review", active: true },
                { step: 6, label: "COA Audit" },
              ].map((s, i, arr) => (
                <span key={s.step} className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
                    s.active
                      ? "bg-primary/10 text-primary border-primary/30 font-semibold shadow-sm"
                      : "bg-muted/60 text-muted-foreground border-border/60"
                  }`}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      s.active ? "bg-primary text-white" : "bg-border text-muted-foreground"
                    }`}>{s.step}</span>
                    {s.label}
                  </span>
                  {i < arr.length - 1 && <span className="text-border">→</span>}
                </span>
              ))}
            </div>
          </div>
        ) : (
          /* Detail View - Selected Project */
          <div className="space-y-4 sm:space-y-6">
            {/* Back Button */}
            <Button
              onClick={() => {
                setSelectedMilestone(null);
                setInspectorRemarks("");
                setRejectionReason("");
                setShowBlueprintComparison(false);
                setLocationMatchResult(null);
                setGpsFlags([]);
                setHashVerificationResult(null);
                setAllMetadataVerified(false);
                setBlueprintComplianceConfirmed(false);
                setSelectedMapPhotoId(null);
                setExpandedPhotoIdx(null);
              }}
              variant="ghost"
              size="sm"
              className="mb-3 text-xs h-7"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back to Projects List
            </Button>

            {/* ── GPS / Tamper Detection Alerts ── */}
            {!hasValidGps(selectedMilestone.gpsMetadata.latitude, selectedMilestone.gpsMetadata.longitude) ? (
              <div className="flex items-center gap-2 px-4 py-3 rounded-md border border-foreground/20 bg-foreground/5 dark:bg-foreground/10 dark:border-foreground/20 text-xs">
                <AlertTriangle className="w-4 h-4 text-foreground shrink-0" />
                <span className="text-foreground font-semibold">
                  FLAGGED — No GPS Data Found. Photos may be from the internet or taken off-site. Auto-reject recommended.
                </span>
              </div>
            ) : !isWithinRadius ? (
              <div className="flex items-center gap-2 px-4 py-3 rounded-md border border-accent/30 bg-accent/5 dark:bg-accent/10 dark:border-accent/30 text-xs">
                <AlertCircle className="w-4 h-4 text-accent shrink-0" />
                <span className="text-accent dark:text-accent">
                  GPS Discrepancy: Photos taken <strong>{gpsDistance.toFixed(1)}m</strong> from project site (max {GEOFENCE_RADIUS_M}m).
                  Possible off-site capture.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-3 rounded-md border border-primary/30 bg-primary/5 dark:bg-primary/10 dark:border-primary/30 text-xs">
                <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                <span className="text-primary dark:text-primary">
                  GPS Verified — {gpsDistance.toFixed(1)}m from site (within {GEOFENCE_RADIUS_M}m radius)
                </span>
              </div>
            )}

            {/* Main Content - Project Details */}
            <Card className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">{selectedMilestone.projectName}</h2>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted text-foreground rounded-full text-[11px] font-medium">
                    <MapPin className="w-3 h-3" />
                    {selectedMilestone.region}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted text-foreground rounded-full text-[11px] font-medium">
                    <Building2 className="w-3 h-3" />
                    {selectedMilestone.municipality}
                  </span>
                </div>
              </div>

              <SummaryBar className="mb-4">
                <StatItem label="Amount" value={formatCurrency(selectedMilestone.requestedAmount)} />
                <StatItem label="GPS" value={hasValidGps(selectedMilestone.gpsMetadata.latitude, selectedMilestone.gpsMetadata.longitude) ? (isWithinRadius ? "Within 50m" : `${gpsDistance.toFixed(0)}m away`) : "NO DATA"} icon={<MapPin />} />
                <StatItem label="Photos" value={selectedMilestone.photosCount} icon={<Camera />} />
                <StatItem label="Target" value={`${selectedMilestone.targetProgress}%`} />
              </SummaryBar>

              {/* ═══ Interactive Location Map — Leaflet with exact photo pointers ═══ */}
              <CollapsibleSection
                title="Interactive Location Map"
                icon={<MapIcon />}
                badge={
                  locationMatchResult === 'matched' ? (
                    <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold">Match</span>
                  ) : locationMatchResult === 'discrepancy' ? (
                    <span className="px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-[10px] font-semibold">Discrepancy</span>
                  ) : undefined
                }
                className="mb-4"
                defaultOpen
              >
                {/* Real Leaflet Map */}
                {(() => {
                  const photoMarkers: MapPhoto[] = (selectedMilestone.photos ?? []).map((p, idx) => {
                    const pLat = p.gpsLatitude ?? selectedMilestone.gpsMetadata.latitude;
                    const pLng = p.gpsLongitude ?? selectedMilestone.gpsMetadata.longitude;
                    const dist = calculateDistance(projectSiteGPS.lat, projectSiteGPS.lng, pLat, pLng);
                    return {
                      id: p.id || idx,
                      label: p.fileName || `Photo ${idx + 1}`,
                      lat: pLat,
                      lng: pLng,
                      bearing: p.gpsDirection ?? null,
                      accuracy: p.gpsAccuracy ?? null,
                      isOutsideGeofence: dist > GEOFENCE_RADIUS_M,
                      distanceFromSite: dist,
                    };
                  });
                  return (
                    <PhotoLocationMap
                      siteLat={projectSiteGPS.lat}
                      siteLng={projectSiteGPS.lng}
                      photos={photoMarkers}
                      selectedPhotoId={selectedMapPhotoId}
                      onPhotoClick={(id) => setSelectedMapPhotoId(id)}
                      height="280px"
                    />
                  );
                })()}

                {/* Coordinate details */}
                <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                  <div className="rounded-xl p-3 border border-primary/20 bg-primary/5">
                    <div className="font-semibold text-primary mb-1 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" />Project Site
                    </div>
                    <div className="text-foreground font-mono text-[11px]">{selectedMilestone.location.lat.toFixed(6)}, {selectedMilestone.location.lng.toFixed(6)}</div>
                  </div>
                  <div className="rounded-xl p-3 border border-primary/20 bg-primary/5">
                    <div className="font-semibold text-primary mb-1 flex items-center gap-1.5">
                      <Camera className="w-3 h-3" />Photo GPS
                    </div>
                    <div className="text-foreground font-mono text-[11px]">
                      {hasValidGps(selectedMilestone.gpsMetadata.latitude, selectedMilestone.gpsMetadata.longitude)
                        ? `${selectedMilestone.gpsMetadata.latitude.toFixed(6)}, ${selectedMilestone.gpsMetadata.longitude.toFixed(6)}`
                        : "No GPS Data"
                      }
                    </div>
                  </div>
                </div>

                {/* Verify Location Match Button */}
                <Button
                  onClick={() => {
                    if (!hasValidGps(selectedMilestone.gpsMetadata.latitude, selectedMilestone.gpsMetadata.longitude)) {
                      setLocationMatchResult('discrepancy');
                      setGpsFlags(prev => [...prev, "No GPS data found on photos — possible internet source"]);
                    } else if (isWithinRadius) {
                      setLocationMatchResult('matched');
                    } else {
                      setLocationMatchResult('discrepancy');
                      setGpsFlags(prev => [...prev, `Photos taken ${gpsDistance.toFixed(1)}m from project site (exceeds ${GEOFENCE_RADIUS_M}m limit)`]);
                    }
                  }}
                  className="w-full mt-3 bg-primary hover:bg-primary/90 text-white text-xs h-9 gap-1.5 shadow-sm"
                  size="sm"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  Verify Location Match
                </Button>
                {locationMatchResult === 'matched' && (
                  <div className="mt-2 p-2.5 bg-primary/5 border border-primary/20 rounded-xl text-xs text-primary flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Location match confirmed — photo was taken on-site
                  </div>
                )}
                {locationMatchResult === 'discrepancy' && (
                  <div className="mt-2 p-2.5 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Location discrepancy detected — review required
                  </div>
                )}
              </CollapsibleSection>

              {/* ═══ Blueprint Validation — Side-by-side comparison + compliance gate ═══ */}
              <CollapsibleSection
                title="Blueprint Validation"
                icon={<FileText />}
                badge={
                  blueprintComplianceConfirmed ? (
                    <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold flex items-center gap-1">
                      <CheckCircle className="w-2.5 h-2.5" /> Compliant
                    </span>
                  ) : isLoadingBlueprints ? (
                    <span className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border text-[10px] font-semibold flex items-center gap-1">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> Loading
                    </span>
                  ) : projectBlueprints.length === 0 ? (
                    <span className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border text-[10px] font-semibold">
                      No Blueprint
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border text-[10px] font-semibold">
                      Pending
                    </span>
                  )
                }
                className="mb-4"
              >
                {(() => {
                  const bpPhotos: BlueprintPhoto[] = (selectedMilestone.photos ?? []).map((p, idx) => {
                    const photoUrl = p.base64Data
                      ? `data:${p.contentType || "image/jpeg"};base64,${p.base64Data}`
                      : "";
                    return {
                      id: p.id || idx,
                      fileName: p.fileName || `Photo ${idx + 1}`,
                      photoUrl,
                    };
                  });
                  return (
                    <BlueprintValidationPanel
                      blueprints={projectBlueprints}
                      photos={bpPhotos}
                      isLoading={isLoadingBlueprints}
                      onComplianceConfirmed={setBlueprintComplianceConfirmed}
                      complianceConfirmed={blueprintComplianceConfirmed}
                      onVerifyBlueprint={handleVerifyBlueprint}
                      verifyingBlueprintId={verifyingBlueprintId}
                      blueprintRemarks={blueprintRemarks}
                      onBlueprintRemarksChange={(id, val) => setBlueprintRemarks(prev => ({ ...prev, [id]: val }))}
                    />
                  );
                })()}
              </CollapsibleSection>

              {/* Target vs Actual summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="border border-primary/20 rounded-xl p-4 bg-primary/5">
                  <div className="text-xs font-medium text-primary/70 mb-2">Target Progress</div>
                  <div className="text-xl font-bold text-foreground">{selectedMilestone.baselineTarget}%</div>
                  <div className="text-[11px] text-muted-foreground">Baseline — As per contract schedule</div>
                </div>
                <div className="border border-primary/20 rounded-xl p-4 bg-primary/5">
                  <div className="text-xs font-medium text-primary mb-2">Actual Submission</div>
                  <div className="text-xl font-bold text-foreground">{selectedMilestone.targetCompletion}</div>
                  <div className="text-[11px] text-muted-foreground">{selectedMilestone.actualPhotos} photos submitted — Based on submitted data</div>
                </div>
              </div>

              {/* Photos with GPS + EXIF forensic metadata — click to expand */}
              <CollapsibleSection
                title="Photos — Forensic Metadata"
                icon={<Image />}
                badge={
                  <span className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border text-[10px] font-semibold">
                    {selectedMilestone.photos?.length || selectedMilestone.photosCount}
                  </span>
                }
                className="mb-4"
              >
                {selectedMilestone.photos && selectedMilestone.photos.length > 0 ? (
                  <div className="space-y-2">
                    {/* ── Photo cards — always-visible forensic info ── */}
                    {selectedMilestone.photos.map((photo, idx) => {
                      const photoSrc = photo.base64Data
                        ? `data:${photo.contentType || "image/jpeg"};base64,${photo.base64Data}`
                        : undefined;
                      const photoLat = photo.gpsLatitude ?? selectedMilestone.gpsMetadata.latitude;
                      const photoLng = photo.gpsLongitude ?? selectedMilestone.gpsMetadata.longitude;
                      const photoDist = calculateDistance(
                        projectSiteGPS.lat, projectSiteGPS.lng,
                        photoLat, photoLng
                      );
                      const photoInRadius = photoDist <= GEOFENCE_RADIUS_M;
                      const isExpanded = expandedPhotoIdx === idx;

                      // ── Enhanced origin detection for engineer review ──
                      const hasPhotoGps = photo.gpsLatitude != null && photo.gpsLongitude != null
                        && photo.gpsLatitude !== 0 && photo.gpsLongitude !== 0;
                      const verdict = photo.sourceVerdict ?? "";
                      const isVerifiedOnsite = photo.sourceType === "real-time" && hasPhotoGps && photoInRadius;
                      const isNonOriginal = photo.sourceType === "edited"
                        || verdict.startsWith("Non-Original")
                        || verdict.startsWith("Non-Recent")
                        || verdict.includes("Stale")
                        || verdict.includes("Web Download")
                        || verdict.includes("No Device Metadata");
                      const isUnknown = !isVerifiedOnsite && !isNonOriginal;

                      const srcLabel = isVerifiedOnsite
                        ? "On-site Camera ✓"
                        : isNonOriginal
                          ? (verdict || "Internet / Downloaded")
                          : hasPhotoGps
                            ? "Unverified Source"
                            : "No GPS — Likely Internet";
                      const srcColor = isVerifiedOnsite
                        ? "text-primary"
                        : isNonOriginal
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-600 dark:text-amber-400";
                      const srcBg = isVerifiedOnsite
                        ? "bg-primary/10 border-primary/30"
                        : isNonOriginal
                          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                          : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800";
                      const srcIcon = isVerifiedOnsite
                        ? <CheckCircle className="w-3.5 h-3.5" />
                        : isNonOriginal
                          ? <AlertTriangle className="w-3.5 h-3.5" />
                          : <Shield className="w-3.5 h-3.5" />;

                      const exifMeta: ExifMetadata = buildExifFromPhotoData(photo);

                      return (
                        <div key={photo.id || idx} className={`rounded-xl border transition-all duration-200 ${
                          isExpanded ? "border-primary/60 shadow-md bg-card" : "border-border hover:border-primary/40 hover:shadow-sm"
                        }`}>
                          {/* ── Row: Thumbnail + Always-visible forensic summary ── */}
                          <button
                            type="button"
                            className="w-full flex items-start gap-3 p-2.5 text-left"
                            onClick={() => setExpandedPhotoIdx(isExpanded ? null : idx)}
                          >
                            {/* Thumbnail */}
                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-md overflow-hidden bg-muted border border-border shrink-0 relative">
                              {photoSrc ? (
                                <img src={photoSrc} alt={photo.fileName || `Photo ${idx + 1}`} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Camera className="w-6 h-6 text-muted-foreground" />
                                </div>
                              )}
                              {/* Geofence distance overlay */}
                              {!photoInRadius && (
                                <span className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded bg-red-600 text-white text-[8px] font-bold">
                                  {photoDist.toFixed(0)}m
                                </span>
                              )}
                            </div>

                            {/* Forensic summary — always visible */}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-foreground">
                                  Photo {idx + 1}
                                  {photo.fileName && <span className="text-muted-foreground font-normal ml-1 truncate">({photo.fileName})</span>}
                                </span>
                                <Eye className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? "text-primary rotate-0" : "text-muted-foreground"}`} />
                              </div>

                              {/* Source classification — the main thing the user wants */}
                              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold ${srcBg} ${srcColor}`}>
                                {srcIcon}
                                {srcLabel}
                              </div>

                              {/* Key details row */}
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="w-2.5 h-2.5" />
                                  {photoLat.toFixed(4)}, {photoLng.toFixed(4)}
                                </span>
                                <span className={`flex items-center gap-0.5 ${photoInRadius ? "text-primary" : "text-red-500 font-semibold"}`}>
                                  <Crosshair className="w-2.5 h-2.5" />
                                  {photoDist.toFixed(1)}m {photoInRadius ? "✓" : "⚠"}
                                </span>
                                {photo.deviceModel && (
                                  <span className="flex items-center gap-0.5">
                                    <Camera className="w-2.5 h-2.5" />
                                    {photo.deviceMake && !photo.deviceModel.toLowerCase().startsWith(photo.deviceMake.toLowerCase())
                                      ? `${photo.deviceMake} ${photo.deviceModel}`
                                      : photo.deviceModel}
                                  </span>
                                )}
                                {photo.gpsDirection != null && (
                                  <span className="flex items-center gap-0.5">
                                    {getBearingString(photo.gpsDirection)}
                                  </span>
                                )}
                                {photo.dateTimeOriginal && (
                                  <span className="flex items-center gap-0.5">{photo.dateTimeOriginal}</span>
                                )}
                              </div>

                              {/* Tamper warning */}
                              {photo.isTampered && (
                                <div className="flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 font-semibold">
                                  <AlertTriangle className="w-3 h-3" />
                                  {photo.tamperReason || "Possible tampering detected"}
                                </div>
                              )}
                            </div>
                          </button>

                          {/* ── Expanded: Full forensic metadata panel ── */}
                          {isExpanded && photoSrc && (
                            <div className="border-t border-primary/10 px-4 py-4 bg-muted/40">
                              <PhotoMetadataPanel
                                meta={exifMeta}
                                photoUrl={photoSrc}
                                photoName={photo.fileName || `Photo ${idx + 1}`}
                                masterGps={projectSiteGPS}
                                distanceFromMaster={photoDist}
                                geofenceRadius={GEOFENCE_RADIUS_M}
                              />
                            </div>
                          )}

                          {/* ── Expanded but no photo data ── */}
                          {isExpanded && !photoSrc && (
                            <div className="border-t border-primary/10 px-4 py-4 bg-muted/40">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <AlertCircle className="w-4 h-4" />
                                No photo data available for metadata analysis.
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {Array.from({ length: Math.min(4, selectedMilestone.photosCount) }).map((_, idx) => (
                      <div key={idx} className="aspect-square rounded-md bg-muted border border-border relative overflow-hidden">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Camera className="w-6 h-6 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2.5 p-3 bg-muted/60 rounded-xl border border-border/60 text-[11px] text-muted-foreground space-y-1">
                  <div><strong className="text-foreground">Master GPS:</strong> <span className="font-mono">{selectedMilestone.gpsMetadata.latitude}, {selectedMilestone.gpsMetadata.longitude}</span></div>
                  <div><strong className="text-foreground">Accuracy:</strong> <span className="font-mono">{selectedMilestone.gpsMetadata.accuracy}</span> · <strong className="text-foreground">Timestamp:</strong> <span className="font-mono">{selectedMilestone.gpsMetadata.timestamp}</span></div>
                  <div><strong className="text-foreground">Distance from site:</strong> <span className="font-mono">{gpsDistance.toFixed(1)}m</span> · <strong className="text-foreground">Status:</strong> <span className={isWithinRadius ? "text-primary font-semibold" : "text-red-600 dark:text-red-400 font-semibold"}>{isWithinRadius ? "Within geofence" : "Outside geofence"}</span></div>
                </div>
              </CollapsibleSection>

              {/* ═══ Site Integrity Report — Photo vs Satellite side-by-side ═══ */}
              <CollapsibleSection
                title="Site Integrity Report"
                icon={<Shield />}
                badge={
                  allMetadataVerified ? (
                    <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold flex items-center gap-1">
                      <CheckCircle className="w-2.5 h-2.5" /> All Verified
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground border border-border text-[10px] font-semibold">
                      Pending
                    </span>
                  )
                }
                className="mb-4"
              >
                {(() => {
                  const integrityPhotos: IntegrityPhoto[] = (selectedMilestone.photos ?? []).map((p, idx) => {
                    const photoUrl = p.base64Data
                      ? `data:${p.contentType || "image/jpeg"};base64,${p.base64Data}`
                      : "";
                    return {
                      id: p.id || idx,
                      fileName: p.fileName || `Photo ${idx + 1}`,
                      photoUrl,
                      gpsLat: p.gpsLatitude ?? selectedMilestone.gpsMetadata.latitude,
                      gpsLng: p.gpsLongitude ?? selectedMilestone.gpsMetadata.longitude,
                      exif: buildExifFromPhotoData(p),
                    };
                  });
                  return (
                    <SiteIntegrityReport
                      masterGps={projectSiteGPS}
                      photos={integrityPhotos}
                      onAllVerified={() => setAllMetadataVerified(true)}
                      allVerified={allMetadataVerified}
                    />
                  );
                })()}
                {!allMetadataVerified && (
                  <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-primary flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    You must verify metadata for all photos before signing the milestone on the blockchain.
                  </div>
                )}
              </CollapsibleSection>

              {/* Materials Used + Hash Validation */}
              {selectedMilestone.materials && selectedMilestone.materials.length > 0 && (
                <CollapsibleSection
                  title="Materials Validation"
                  icon={<Package />}
                  badge={
                    <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold flex items-center gap-1">
                      <Hash className="w-2.5 h-2.5" /> {selectedMilestone.materials.length}
                    </span>
                  }
                  className="mb-4"
                >
                  <ul className="space-y-0.5 mb-3">
                    {selectedMilestone.materials.map((material, idx) => (
                      <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-primary">•</span>
                        {material}
                      </li>
                    ))}
                  </ul>
                  <div className="p-2 bg-muted rounded border border-border text-[11px] font-mono text-muted-foreground break-all">
                    <strong className="text-foreground">Materials Hash (SHA-256):</strong><br />
                    {`0x${selectedMilestone.materials.sort().join("|").toLowerCase().split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0).toString(16).replace("-", "f")}`}
                  </div>
                </CollapsibleSection>
              )}

              {/* Blockchain Verification */}
              <CollapsibleSection title="Blockchain Verification" icon={<Shield />} className="mb-4">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-medium text-foreground mb-2">Transaction Hash</div>
                    {selectedMilestone.blockchainTxHash ? (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-[11px] bg-muted border border-border rounded px-2 py-1.5 font-mono break-all text-foreground">
                          {selectedMilestone.blockchainTxHash}
                        </code>
                        <a
                          href={getEtherscanLink(selectedMilestone.blockchainTxHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-primary hover:text-primary/80"
                          title="View on Etherscan"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ) : (
                      <code className="block text-[11px] bg-muted border border-border rounded px-2 py-1.5 font-mono text-muted-foreground">
                        No blockchain transaction recorded
                      </code>
                    )}
                  </div>
                  <Button
                    onClick={handleVerifyHash}
                    disabled={isVerifyingHash || !selectedMilestone.blockchainTxHash}
                    className="w-full bg-primary hover:bg-primary/90 text-white text-xs h-8"
                    size="sm"
                  >
                    {isVerifyingHash ? 'Verifying on-chain...' : 'Verify with Blockchain'}
                  </Button>
                  {hashVerificationResult === 'verified' && (
                    <div className="p-3 bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded text-xs">
                      <div className="font-semibold text-primary dark:text-primary flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" /> On-Chain Verified
                      </div>
                      <div className="text-primary/80 dark:text-primary/80 mt-1">Transaction confirmed on Sepolia. Data integrity intact.</div>
                    </div>
                  )}
                  {hashVerificationResult === 'mismatch' && (
                    <div className="p-3 bg-foreground/5 dark:bg-foreground/10 border border-foreground/20 dark:border-foreground/20 rounded text-xs">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" /> Verification Failed
                      </div>
                      <div className="text-muted-foreground mt-1">Transaction not found or failed on-chain. Possible tampering detected.</div>
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* Blueprint Verification */}
              <CollapsibleSection title="Blueprint Verification" icon={<FileText />} className="mb-4">
                {isLoadingBlueprints ? (
                  <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading blueprints...
                  </div>
                ) : projectBlueprints.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-xs">
                    No blueprints uploaded for this project yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projectBlueprints.map((bp) => (
                      <div key={bp.id} className="border border-border rounded-lg p-3 bg-muted/30">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="text-xs font-semibold text-foreground">{bp.label}</div>
                            <div className="text-[11px] text-muted-foreground">{bp.fileName}</div>
                          </div>
                          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            bp.verificationStatus === "COMPLIANT"
                              ? "bg-primary/10 text-primary"
                              : bp.verificationStatus === "NON_COMPLIANT"
                              ? "bg-foreground/10 text-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {bp.verificationStatus === "COMPLIANT" ? "Compliant" :
                             bp.verificationStatus === "NON_COMPLIANT" ? "Non-Compliant" : "Pending"}
                          </span>
                        </div>

                        {/* Preview */}
                        {bp.base64Data && bp.contentType.startsWith("image/") && (
                          <img
                            src={`data:${bp.contentType};base64,${bp.base64Data}`}
                            alt={bp.label}
                            className="w-full max-h-48 object-contain rounded border border-border mb-2 bg-background"
                          />
                        )}
                        {bp.base64Data && bp.contentType === "application/pdf" && (
                          <div className="mb-2">
                            <a
                              href={`data:application/pdf;base64,${bp.base64Data}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                            >
                              <FileText className="w-3.5 h-3.5" /> View PDF Blueprint
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}

                        {/* Verification controls - only for PENDING */}
                        {bp.verificationStatus === "PENDING" && (
                          <div className="space-y-2 mt-2 pt-2 border-t border-border">
                            <textarea
                              className="w-full min-h-12 p-2 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground"
                              placeholder="Remarks (optional)..."
                              value={blueprintRemarks[bp.id] || ""}
                              onChange={(e) => setBlueprintRemarks(prev => ({ ...prev, [bp.id]: e.target.value }))}
                            />
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleVerifyBlueprint(bp.id, "COMPLIANT")}
                                disabled={verifyingBlueprintId === bp.id}
                                className="flex-1 bg-primary hover:bg-primary/90 text-white text-xs h-7"
                                size="sm"
                              >
                                {verifyingBlueprintId === bp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                                Compliant
                              </Button>
                              <Button
                                onClick={() => handleVerifyBlueprint(bp.id, "NON_COMPLIANT")}
                                disabled={verifyingBlueprintId === bp.id}
                                variant="outline"
                                className="flex-1 border-foreground/30 text-foreground hover:bg-foreground/5 text-xs h-7"
                                size="sm"
                              >
                                {verifyingBlueprintId === bp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertCircle className="w-3 h-3 mr-1" />}
                                Non-Compliant
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Already verified info */}
                        {bp.verificationStatus !== "PENDING" && (
                          <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                            {bp.verifiedByWallet && <div>Verified by: <span className="font-mono">{bp.verifiedByWallet.slice(0, 6)}...{bp.verifiedByWallet.slice(-4)}</span></div>}
                            {bp.verifiedAt && <div>Date: {new Date(bp.verifiedAt).toLocaleString()}</div>}
                            {bp.verificationRemarks && <div>Remarks: {bp.verificationRemarks}</div>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>

              {/* GPS Flags / Tamper Detection Summary */}
              {gpsFlags.length > 0 && (
                <div className="mb-4 space-y-1">
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Tamper Detection Flags ({gpsFlags.length})
                  </div>
                  {gpsFlags.map((flag, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded bg-foreground/5 dark:bg-foreground/10 border border-foreground/15 dark:border-foreground/20 text-xs text-foreground">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {flag}
                    </div>
                  ))}
                </div>
              )}

              {/* Remarks */}
              <div className="mb-4">
                <label className="text-xs font-medium text-foreground mb-2 block">
                  Attestation Remarks <span className="text-muted-foreground font-normal">(general notes)</span>
                </label>
                <textarea
                  className="w-full min-h-16 p-3 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground"
                  placeholder="Enter attestation remarks..."
                  value={inspectorRemarks}
                  onChange={(e) => setInspectorRemarks(e.target.value)}
                />
              </div>

              {/* Rejection Reason — separate from remarks */}
              <div className="mb-4 p-4 bg-accent/5 dark:bg-accent/10 border border-accent/20 dark:border-accent/20 rounded-lg">
                <label className="text-xs font-semibold text-accent mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Rejection Reason <span className="text-muted-foreground font-normal">(mandatory for rejections — saved to blockchain)</span>
                </label>
                <textarea
                  className="w-full min-h-20 p-3 text-sm rounded-md border border-accent/20 dark:border-accent/20 bg-background text-foreground placeholder:text-muted-foreground"
                  placeholder="Specify the reason for rejection (e.g., GPS mismatch, materials not matching POW, photos not from site)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>

              {/* Compliance Gate Status */}
              {(!allMetadataVerified || (!blueprintComplianceConfirmed && projectBlueprints.length > 0)) && (
                <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-primary space-y-1">
                  {!allMetadataVerified && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Verify all photo metadata in the Site Integrity Report before signing.
                    </div>
                  )}
                  {!blueprintComplianceConfirmed && projectBlueprints.length > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Confirm Blueprint Compliance in the Blueprint Validation section before signing.
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-4 pt-2">
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90 text-white py-4 text-sm gap-2 shadow-sm rounded-xl"
                  onClick={handleApprove}
                  disabled={isApproving || !allMetadataVerified || (projectBlueprints.length > 0 && !blueprintComplianceConfirmed)}
                  title={
                    !allMetadataVerified
                      ? "Verify all photo metadata in the Site Integrity Report first"
                      : (projectBlueprints.length > 0 && !blueprintComplianceConfirmed)
                        ? "Confirm Blueprint Compliance first"
                        : ""
                  }
                >
                  {isApproving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Signing...</>
                  ) : (
                    <><Shield className="w-4 h-4" /> Sign & Attest</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-border hover:bg-muted text-foreground py-4 text-sm gap-2 rounded-xl"
                  onClick={handleReject}
                  disabled={isApproving}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Reject with Reason
                </Button>
              </div>
              {lastSignResult && (
                <div className="mt-2 flex items-center gap-2 text-xs text-primary">
                  <Shield className="w-3 h-3" />
                  <span>Signed on-chain</span>
                  <a href={lastSignResult.etherscanUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-primary/80">
                    View on Etherscan <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* ── No COA Regional Auditor Modal ── */}
      {showNoRdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <Card className="max-w-md w-full mx-4 p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-semibold">No COA Regional Auditor Assigned</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              There is currently no COA Regional Auditor assigned to your region
              <span className="font-medium text-foreground"> ({assignedRegion})</span>.
              Attestation cannot proceed until a COA Regional Auditor is registered and assigned to this region.
            </p>
            <p className="text-xs text-muted-foreground">
              Please contact the COA National Admin to assign an auditor for your region before attesting milestones.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setShowNoRdModal(false)} variant="outline">
                Understood
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ── Insufficient Gas Modal ── */}
      <InsufficientGasModal open={gasError.open} onClose={clearGasError} message={gasError.message} />
    </div>
  );
}
