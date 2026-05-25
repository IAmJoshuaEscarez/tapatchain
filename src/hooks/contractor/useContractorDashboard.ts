import { useState, useEffect, useCallback, useMemo } from "react";
import { buildProjectSpentByMilestones, mapRDCToProject } from "@/lib/utils";
import { useMilestoneContext } from "@/context/MilestoneContext";
import { useNotifications, notificationHelpers } from "@/context/NotificationContext";
import { useWallet } from "@/context/WalletContext";
import { useAuditTrail } from "@/context/AuditTrailContext";
import { useProjectContext } from "@/context/ProjectContext";
import { signAccomplishmentReport, logToAuditTrail, type SignatureGateResult } from "@/services/signatureGate";
import { useGasGuard } from "@/hooks/useGasGuard";
import { checkGeofence, hashMaterials, hasValidGps, GEOFENCE_RADIUS_M } from "@/lib/geolocation";
import { extractExifMetadata } from "@/lib/exifExtractor";
import { authApi } from "@/services/api";
import { blueprintApi } from "@/features/milestone/api/milestoneApi";
import { useLookup } from "@/hooks";
import type { Expense, UploadedPhoto, Project } from "@/types";
import type { GeoCaptureResult } from "@/components/ui";

function deriveDeviceMake(model: string | null): string | undefined {
  if (!model) return undefined;
  const m = model.toLowerCase();
  if (m.startsWith("sm-") || m.startsWith("galaxy")) return "Samsung";
  if (m.startsWith("pixel")) return "Google";
  if (m.startsWith("iphone") || m.startsWith("ipad")) return "Apple";
  if (m.startsWith("redmi") || m.startsWith("mi ") || m.startsWith("poco")) return "Xiaomi";
  if (m.startsWith("cph") || m.startsWith("reno") || m.startsWith("a5") || m.startsWith("a9")) return "OPPO";
  if (m.startsWith("rmx")) return "realme";
  if (m.startsWith("v20") || m.startsWith("v21") || m.startsWith("v23") || m.startsWith("v25") || m.startsWith("v27") || m.startsWith("v29") || m.startsWith("y")) return "vivo";
  if (m.startsWith("lm-") || m.startsWith("lg-")) return "LG";
  if (m.startsWith("moto") || m.startsWith("xt")) return "Motorola";
  if (m.startsWith("nokia")) return "Nokia";
  if (m.startsWith("huawei") || m.startsWith("mate") || m.startsWith("p30") || m.startsWith("p40") || m.startsWith("p50") || m.startsWith("nova")) return "Huawei";
  if (m.startsWith("oneplus") || m.startsWith("in20") || m.startsWith("kb20")) return "OnePlus";
  if (m.startsWith("asus") || m.startsWith("zenfone") || m.startsWith("rog")) return "ASUS";
  if (m.startsWith("sony") || m.startsWith("xperia")) return "Sony";
  if (m.includes("windows")) return "Microsoft";
  if (m.startsWith("macos") || m.startsWith("mac os")) return "Apple";
  if (m.includes("linux")) return "Linux";
  return undefined;
}

export function useContractorDashboard() {
  const { disconnectWallet } = useWallet();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [milestoneProgress, setMilestoneProgress] = useState(45);
  const [milestoneName, setMilestoneName] = useState("Foundation Work");
  const [profile, setProfile] = useState<{ walletAddress?: string; assignedRegion?: string; displayName?: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [materialSpecs, setMaterialSpecs] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState<string>("Draft");
  const [signingStep, setSigningStep] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMunicipality, setSelectedMunicipality] = useState("All");
  const [selectedBarangay, setSelectedBarangay] = useState("All");
  const [targetPercent, setTargetPercent] = useState(100);
  const [targetLocked, setTargetLocked] = useState(false);
  const [showGeoCamera, setShowGeoCamera] = useState(false);
  const [siteAnchor, setSiteAnchor] = useState<{ lat: number; lng: number } | null>(null);
  const [geofenceWarnings, setGeofenceWarnings] = useState<string[]>([]);
  const [blueprintFile, setBlueprintFile] = useState<File | null>(null);
  const [blueprintLabel, setBlueprintLabel] = useState("Foundation Plan");
  const [isUploadingBlueprint, setIsUploadingBlueprint] = useState(false);
  const [blueprintUploaded, setBlueprintUploaded] = useState(false);
  const [existingBlueprints, setExistingBlueprints] = useState<{ id: number; label: string; fileName: string }[]>([]);
  const [isCheckingBlueprint, setIsCheckingBlueprint] = useState(false);
  const billingReady = milestoneProgress >= targetPercent && targetPercent > 0;
  const [assignedRegion, setAssignedRegion] = useState("All Regions");

  const loadProfile = useCallback(async () => {
    try {
      const res = await authApi.getProfile();
      setProfile(res.data);
      if (res.data.assignedRegion) setAssignedRegion(res.data.assignedRegion);
    } catch {
      // Keep UI usable with default profile fallback state.
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const { milestones, addMilestone, getMilestonesByProject } = useMilestoneContext();
  const { addNotification } = useNotifications();
  const { isConnected, walletAddress } = useWallet();
  const { addAuditEntry } = useAuditTrail();
  const { projects: rdcProjects, loading: projectsLoading, updateProject } = useProjectContext();
  const { gasError, clearGasError, handleGasError } = useGasGuard();
  const { items: expenseCategories } = useLookup("ExpenseCategory");

  const assignedRdcProjects = rdcProjects.filter((p) =>
    p.personnelAssigned === true &&
    (p.status === "ONGOING" || p.status === "FUNDED_AND_ACTIVE" || p.status === "PERSONNEL_ASSIGNED") &&
    p.contractorWallet &&
    walletAddress &&
    p.contractorWallet.toLowerCase() === walletAddress.toLowerCase()
  );

  const spentByProjectId = useMemo(() => buildProjectSpentByMilestones(milestones), [milestones]);
  const allProjects = useMemo(
    () =>
      assignedRdcProjects.map((project) => ({
        ...mapRDCToProject(project),
        spent: spentByProjectId[project.id] ?? 0,
      })),
    [assignedRdcProjects, spentByProjectId]
  );

  useEffect(() => {
    if (!selectedProject) return;
    const latest = allProjects.find((project) => project.id === selectedProject.id);
    if (!latest) return;

    if (
      latest.spent === selectedProject.spent &&
      latest.progress === selectedProject.progress &&
      latest.status === selectedProject.status
    ) {
      return;
    }

    setSelectedProject(latest);
  }, [allProjects, selectedProject]);

  const totalPersonnelAssigned = rdcProjects.filter((p) => p.personnelAssigned).length;

  useEffect(() => {
    if (projectsLoading) return;
    const statusMatch = rdcProjects.filter(
      (p) => p.status === "ONGOING" || p.status === "FUNDED_AND_ACTIVE" || p.status === "PERSONNEL_ASSIGNED"
    );
    const personnelMatch = statusMatch.filter((p) => p.personnelAssigned === true);
    const walletMatch = personnelMatch.filter(
      (p) => p.contractorWallet && walletAddress && p.contractorWallet.toLowerCase() === walletAddress.toLowerCase()
    );
    console.log("[ContractorDashboard] Filter breakdown:", {
      myWallet: walletAddress,
      totalFromAPI: rdcProjects.length,
      withMatchingStatus: statusMatch.length,
      withPersonnelAssigned: personnelMatch.length,
      withWalletMatch: walletMatch.length,
      sampleProjectWallets: personnelMatch.slice(0, 3).map((p) => ({
        id: p.id?.slice(0, 8),
        status: p.status,
        contractorWallet: p.contractorWallet,
        personnelAssigned: p.personnelAssigned,
      })),
    });
  }, [rdcProjects, walletAddress, projectsLoading]);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [newExpense, setNewExpense] = useState({
    itemName: "",
    quantity: "",
    unitPrice: "",
    category: "",
  });
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [lastSignResult, setLastSignResult] = useState<SignatureGateResult | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number; accuracy: string }>({ lat: 0, lng: 0, accuracy: "N/A" });

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setGpsCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: `${pos.coords.accuracy.toFixed(0)}m`,
          }),
        () => {},
        { enableHighAccuracy: true }
      );
    }
  }, []);

  useEffect(() => {
    if (!selectedProject) return;

    if (selectedProject.siteLatitude && selectedProject.siteLongitude) {
      setSiteAnchor({ lat: selectedProject.siteLatitude, lng: selectedProject.siteLongitude });
    } else {
      setSiteAnchor(null);
    }

    setTargetPercent(selectedProject.targetPercent ?? 100);
    const existingMilestones = getMilestonesByProject(selectedProject.id);
    if (existingMilestones.length > 0 && selectedProject.targetPercent != null) {
      setTargetLocked(true);
    } else {
      setTargetLocked(false);
    }
    if (selectedProject.currentProgress && selectedProject.currentProgress > 0) {
      setMilestoneProgress(selectedProject.currentProgress);
    }
    setGeofenceWarnings([]);

    setIsCheckingBlueprint(true);
    setBlueprintUploaded(false);
    setExistingBlueprints([]);
    setBlueprintFile(null);
    blueprintApi
      .getByProjectId(selectedProject.id)
      .then((res) => {
        if (res.data && res.data.length > 0) {
          setExistingBlueprints(res.data.map((b) => ({ id: b.id, label: b.label, fileName: b.fileName })));
          setBlueprintUploaded(true);
        }
      })
      .catch(() => {})
      .finally(() => setIsCheckingBlueprint(false));
  }, [selectedProject, getMilestonesByProject]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handlePhotoFiles = async (files: File[]) => {
    const remainingSlots = 5 - uploadedPhotos.length;

    if (remainingSlots === 0) {
      alert("Maximum of 5 photos allowed. Please delete some photos to upload more.");
      return;
    }

    const filesToAdd = files.slice(0, remainingSlots);

    if (files.length > remainingSlots) {
      alert(`Only ${remainingSlots} photo(s) can be added. Maximum limit is 5 photos.`);
    }

    const newPhotos: UploadedPhoto[] = [];
    for (const file of filesToAdd) {
      const exif = await extractExifMetadata(file);

      const hasExifGps = exif.gpsLatitude !== null && exif.gpsLongitude !== null;
      if (hasExifGps) {
        exif.forensicFlags.push("EXIF GPS found in uploaded file — ignored for on-site verification (use GPS Camera)");
      }

      if (exif.dateTimeOriginal) {
        const created = new Date(exif.dateTimeOriginal).getTime();
        const ageMs = Date.now() - created;
        if (!isNaN(created) && ageMs > 24 * 60 * 60 * 1000) {
          const ageHours = Math.round(ageMs / (60 * 60 * 1000));
          exif.forensicFlags.push(`Photo is ${ageHours}h old — not a recent capture`);
          if (exif.sourceType === "real-time") {
            exif.sourceType = "edited";
            exif.sourceVerdict = "Non-Recent / Stale Photo";
          }
        }
      }

      if (!exif.deviceMake && !exif.deviceModel && !exif.dateTimeOriginal) {
        exif.sourceVerdict = "Non-Original / No Device Metadata";
        exif.sourceType = "edited";
        exif.forensicFlags.push("No camera Make/Model and no creation timestamp — likely AI-generated or downloaded");
      }

      newPhotos.push({
        id: `${Date.now()}-${Math.random()}`,
        name: file.name,
        url: URL.createObjectURL(file),
        file,
        gpsLat: undefined,
        gpsLng: undefined,
        gpsTimestamp: undefined,
        gpsAltitude: exif.gpsAltitude ?? undefined,
        gpsDirection: exif.gpsDirection ?? undefined,
        deviceMake: exif.deviceMake ?? undefined,
        deviceModel: exif.deviceModel ?? undefined,
        software: exif.software ?? undefined,
        isTampered: exif.isTampered,
        tamperReason: exif.tamperReason ?? undefined,
        sourceType: exif.sourceType,
        dateTimeOriginal: exif.dateTimeOriginal ?? undefined,
        exifRaw: exif.raw,
        forensicFlags: exif.forensicFlags,
        sourceVerdict: exif.sourceVerdict,
        deviceSignature: exif.deviceSignature ?? undefined,
      });
    }

    const tampered = newPhotos.filter((p) => p.isTampered);
    if (tampered.length > 0) {
      alert(
        `⚠ ${tampered.length} photo(s) flagged as POTENTIALLY TAMPERED:\n${tampered
          .map((p) => `• ${p.name}: ${p.tamperReason}`)
          .join("\n")}\n\nThese photos will be flagged for the Site Engineer.`
      );
    }

    setUploadedPhotos([...uploadedPhotos, ...newPhotos]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith("image/"));

    void handlePhotoFiles(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter((file) => file.type.startsWith("image/"));
      void handlePhotoFiles(files);
    }
  };

  const handleDeletePhoto = (id: string) => {
    const photo = uploadedPhotos.find((p) => p.id === id);
    if (photo) {
      URL.revokeObjectURL(photo.url);
    }
    setUploadedPhotos(uploadedPhotos.filter((p) => p.id !== id));
  };

  const handleGeoCapture = useCallback(
    (result: GeoCaptureResult) => {
      if (uploadedPhotos.length >= 5) {
        alert("Maximum of 5 photos allowed.");
        return;
      }

      if (!siteAnchor) {
        setSiteAnchor({ lat: result.gpsLat, lng: result.gpsLng });
      }

      if (siteAnchor) {
        const { withinRadius, distance } = checkGeofence(siteAnchor.lat, siteAnchor.lng, result.gpsLat, result.gpsLng);
        if (!withinRadius) {
          setGeofenceWarnings((prev) => [
            ...prev,
            `Photo rejected: ${distance.toFixed(1)}m from site (max ${GEOFENCE_RADIUS_M}m)`,
          ]);
          return;
        }
      }

      const blobUrl = URL.createObjectURL(result.blob);
      const newPhoto: UploadedPhoto = {
        id: `geo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `GPS_${result.gpsLat.toFixed(4)}_${result.gpsLng.toFixed(4)}.jpg`,
        url: blobUrl,
        file: new File([result.blob], `geo-capture-${Date.now()}.jpg`, { type: "image/jpeg" }),
        gpsLat: result.gpsLat,
        gpsLng: result.gpsLng,
        gpsAccuracy: result.gpsAccuracy,
        gpsTimestamp: result.gpsTimestamp,
        distanceFromSite: result.distanceFromSite ?? undefined,
        gpsAltitude: result.gpsAltitude ?? undefined,
        gpsDirection: result.gpsHeading ?? undefined,
        deviceMake: deriveDeviceMake(result.deviceModelUA),
        deviceModel: result.deviceModelUA ?? result.deviceLabel ?? undefined,
        sourceType: "real-time",
        dateTimeOriginal: result.gpsTimestamp,
        isTampered: false,
        forensicFlags: ["Captured via TapatChain In-App GPS Camera — browser geolocation verified"],
        sourceVerdict: "GPS-Verified App Capture",
        deviceSignature: result.deviceModelUA ?? result.deviceLabel ?? undefined,
      };

      setUploadedPhotos((prev) => [...prev, newPhoto]);

      if (uploadedPhotos.length + 1 >= 5) {
        setShowGeoCamera(false);
      }
    },
    [uploadedPhotos, siteAnchor]
  );

  const handleAddExpense = () => {
    if (!newExpense.itemName.trim() || !newExpense.quantity || !newExpense.unitPrice) {
      alert("Please fill in all expense fields!");
      return;
    }

    const quantity = parseFloat(newExpense.quantity);
    const unitPrice = parseFloat(newExpense.unitPrice);
    const total = quantity * unitPrice;

    const expense: Expense = {
      id: Date.now().toString(),
      itemName: newExpense.itemName.trim(),
      quantity,
      unitPrice,
      total,
      category: newExpense.category,
    };

    setExpenses([...expenses, expense]);
    setNewExpense({ itemName: "", quantity: "", unitPrice: "", category: "Materials" });
    setShowAddExpense(false);
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses(expenses.filter((exp) => exp.id !== id));
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.total, 0);

  const submitMilestone = async () => {
    if (!selectedProject) return;

    const existingMilestones = getMilestonesByProject(selectedProject.id);
    const unpaid = existingMilestones.find((m) => m.status !== "MILESTONE_PAID" && m.status !== "DRAFT");
    if (unpaid) {
      alert(
        `Cannot submit a new milestone yet.\n\n` +
          `Milestone "${unpaid.milestoneName}" is currently "${unpaid.status}".\n\n` +
          `The full approval cycle must complete (Contractor → Engineer Verification → COA Audit → RD Disbursement) before you can submit the next milestone.`
      );
      return;
    }

    if (uploadedPhotos.length < 4) {
      alert(`Minimum of 4 photos required. You have uploaded ${uploadedPhotos.length} photo(s).`);
      return;
    }

    const photosWithoutGps = uploadedPhotos.filter((p) => !hasValidGps(p.gpsLat, p.gpsLng));
    if (photosWithoutGps.length > 0) {
      const proceed = confirm(
        `${photosWithoutGps.length} photo(s) have no GPS data. Photos without GPS may be flagged by the Site Engineer.\n\nTip: Use the GPS Camera for automatic location tagging.\n\nContinue submitting anyway?`
      );
      if (!proceed) return;
    }

    if (expenses.length === 0) {
      alert("Please add at least one expense item before submitting.");
      return;
    }

    if (milestoneProgress < targetPercent) {
      const proceed = confirm(
        `Progress (${milestoneProgress}%) hasn't reached the target (${targetPercent}%). You can still submit a partial milestone.\n\nContinue submitting?`
      );
      if (!proceed) return;
    }

    setIsSigning(true);
    setLastSignResult(null);
    setSigningStep("Preparing materials hash...");

    try {
      const materialsList = expenses.filter((e) => e.category === "Materials").map((e) => `${e.quantity} ${e.itemName}`);
      const matHash = materialsList.length > 0 ? await hashMaterials(materialsList) : "0x0";

      const anchorPhoto = uploadedPhotos[0];
      const primaryLat = anchorPhoto.gpsLat ?? gpsCoords.lat;
      const primaryLng = anchorPhoto.gpsLng ?? gpsCoords.lng;

      const submitterAddress = walletAddress || "0x" + Math.random().toString(16).slice(2, 42);

      setSigningStep("Awaiting MetaMask signature...");
      const tempMilestoneId = `MS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const signResult = await signAccomplishmentReport({
        projectId: selectedProject.id,
        milestoneId: tempMilestoneId,
        role: "contractor",
        description: `Contractor submits milestone "${milestoneName}" (${milestoneProgress}% progress) for ${selectedProject.name}`,
        metadata: {
          projectName: selectedProject.name,
          progress: milestoneProgress,
          photos: uploadedPhotos.length,
          expenses: expenses.length,
          totalAmount: totalExpenses,
        },
      });

      if (!signResult.txHash || !signResult.onChainConfirmed) {
        throw new Error(
          "Blockchain transaction was not confirmed. The milestone cannot be saved without a valid on-chain record."
        );
      }

      setLastSignResult(signResult);

      setSigningStep("Saving to database...");
      const newMilestone = {
        id: tempMilestoneId,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        contractorId: submitterAddress,
        contractorName: selectedProject.contractor || "Project Proponent",
        region: selectedProject.dpwhRegion,
        municipality: selectedProject.municipality,
        barangay: selectedProject.barangay || "N/A",
        milestoneName,
        description: materialSpecs || "Milestone submission",
        targetProgress: milestoneProgress,
        requestedAmount: totalExpenses,
        photos: uploadedPhotos.map((p) => ({
          id: p.id,
          name: p.name,
          url: p.url,
          gpsLat: p.gpsLat ?? primaryLat,
          gpsLng: p.gpsLng ?? primaryLng,
          gpsAccuracy: p.gpsAccuracy,
          timestamp: p.gpsTimestamp ?? new Date().toISOString(),
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
        expenses: expenses.map((e) => ({
          id: e.id,
          itemName: e.itemName,
          quantity: e.quantity,
          unitPrice: e.unitPrice,
          total: e.total,
          category: e.category as "Materials" | "Labor" | "Equipment" | "Other",
        })),
        materials: materialsList,
        gpsMetadata: {
          latitude: primaryLat,
          longitude: primaryLng,
          accuracy: anchorPhoto.gpsAccuracy ? `${anchorPhoto.gpsAccuracy.toFixed(0)}m` : gpsCoords.accuracy,
          timestamp: new Date().toISOString(),
        },
        gpsVerified: uploadedPhotos.every((p) => hasValidGps(p.gpsLat, p.gpsLng)),
        status: "SUBMITTED" as const,
        submittedDate: new Date().toISOString().split("T")[0],
        contractorRemarks: materialSpecs,
        blockchainHash: signResult.txHash,
        blockchainDataHash: signResult.txHash || signResult.dataHash,
        materialsHash: matHash,
        isLocationAnchored: !!siteAnchor,
        siteAnchorLat: siteAnchor?.lat ?? primaryLat,
        siteAnchorLng: siteAnchor?.lng ?? primaryLng,
        _files: uploadedPhotos.map((p) => p.file).filter(Boolean) as File[],
      };

      setSigningStep("Uploading photos & saving...");
      const serverId = await addMilestone(newMilestone);

      setSigningStep("Recording audit trail...");
      addAuditEntry({
        actionType: "MILESTONE_SUBMITTED",
        actorRole: "contractor",
        actorName: selectedProject.contractor || "Project Contractor",
        actorWallet: submitterAddress,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        milestoneId: serverId,
        milestoneName,
        description: `Milestone "${milestoneName}" signed on-chain & submitted with ${uploadedPhotos.length} photos and ${expenses.length} expense items`,
        amount: totalExpenses,
        newStatus: "SUBMITTED",
        remarks: `${milestoneProgress}% progress achieved. GPS-verified photos uploaded. On-chain tx: ${signResult.txHash.slice(0, 10)}...`,
      });

      await logToAuditTrail(signResult, {
        role: "contractor",
        actionType: "ACCOMPLISHMENT_REPORT",
        referenceId: serverId,
        description: `Contractor submitted milestone "${milestoneName}" for ${selectedProject.name}`,
        actorName: selectedProject.contractor || "Project Contractor",
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        region: selectedProject.dpwhRegion,
      });

      try {
        await updateProject(selectedProject.id, {
          currentProgress: milestoneProgress,
          targetPercent,
        });
      } catch {
        // Keep success flow even if progress patch fails.
      }

      setSigningStep("Finalizing...");
      const milestoneNotification = notificationHelpers.milestoneSubmitted(selectedProject.name, milestoneName, serverId);
      addNotification(milestoneNotification);

      setSubmissionStatus("Submitted");
      setTargetLocked(true);

      setTimeout(() => {
        setSubmissionStatus("Under Review");
        setUploadedPhotos([]);
        setExpenses([]);
        setMaterialSpecs("");
        setMilestoneProgress(45);
        alert(
          `Milestone "${milestoneName}" confirmed on blockchain & saved to database!\n\nBlockchain Tx: ${signResult.txHash.slice(0, 16)}...\nEtherscan: ${signResult.etherscanUrl}\nMilestone ID: ${serverId}`
        );
      }, 1500);
    } catch (err: unknown) {
      setLastSignResult(null);
      if (handleGasError(err)) {
        setIsSigning(false);
        return;
      }
      const msg = err instanceof Error ? err.message : "Signing/submission failed";
      alert(`Submission failed: ${msg}\n\nPlease try again.`);
    } finally {
      setIsSigning(false);
      setSigningStep("");
    }
  };

  const regionProjects = allProjects;
  const municipalities = ["All", ...Array.from(new Set(regionProjects.map((p) => p.municipality)))];
  const barangays =
    selectedMunicipality === "All"
      ? ["All", ...Array.from(new Set(regionProjects.map((p) => p.barangay)))]
      : [
          "All",
          ...Array.from(
            new Set(regionProjects.filter((p) => p.municipality === selectedMunicipality).map((p) => p.barangay))
          ),
        ];

  const filteredProjects = regionProjects.filter((project) => {
    const matchesSearch =
      searchQuery === "" ||
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesMunicipality = selectedMunicipality === "All" || project.municipality === selectedMunicipality;
    const matchesBarangay = selectedBarangay === "All" || project.barangay === selectedBarangay;

    return matchesSearch && matchesMunicipality && matchesBarangay;
  });

  const walletMismatch = (() => {
    if (!profile || !walletAddress) return false;
    if (!profile.walletAddress) return false;
    return profile.walletAddress.toLowerCase() !== walletAddress.toLowerCase();
  })();

  return {
    disconnectWallet,
    selectedProject,
    setSelectedProject,
    milestoneProgress,
    setMilestoneProgress,
    milestoneName,
    setMilestoneName,
    profile,
    isDragging,
    setIsDragging,
    uploadedPhotos,
    setUploadedPhotos,
    materialSpecs,
    setMaterialSpecs,
    submissionStatus,
    setSubmissionStatus,
    signingStep,
    setSigningStep,
    searchQuery,
    setSearchQuery,
    selectedMunicipality,
    setSelectedMunicipality,
    selectedBarangay,
    setSelectedBarangay,
    targetPercent,
    setTargetPercent,
    targetLocked,
    setTargetLocked,
    showGeoCamera,
    setShowGeoCamera,
    siteAnchor,
    setSiteAnchor,
    geofenceWarnings,
    setGeofenceWarnings,
    blueprintFile,
    setBlueprintFile,
    blueprintLabel,
    setBlueprintLabel,
    isUploadingBlueprint,
    setIsUploadingBlueprint,
    blueprintUploaded,
    setBlueprintUploaded,
    existingBlueprints,
    setExistingBlueprints,
    isCheckingBlueprint,
    setIsCheckingBlueprint,
    billingReady,
    assignedRegion,
    milestones,
    addMilestone,
    getMilestonesByProject,
    addNotification,
    isConnected,
    walletAddress,
    addAuditEntry,
    rdcProjects,
    projectsLoading,
    updateProject,
    gasError,
    clearGasError,
    handleGasError,
    expenseCategories,
    allProjects,
    totalPersonnelAssigned,
    expenses,
    setExpenses,
    newExpense,
    setNewExpense,
    showAddExpense,
    setShowAddExpense,
    isSigning,
    setIsSigning,
    lastSignResult,
    setLastSignResult,
    gpsCoords,
    setGpsCoords,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInput,
    handleDeletePhoto,
    handleGeoCapture,
    submitMilestone,
    municipalities,
    barangays,
    filteredProjects,
    handleAddExpense,
    handleDeleteExpense,
    totalExpenses,
    walletMismatch,
    hasValidGps,
    GEOFENCE_RADIUS_M,
  };
}
