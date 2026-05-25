import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { mapRDCToProject } from "@/lib/utils";
import { useProjectContext } from "@/context/ProjectContext";
import { useWallet } from "@/context/WalletContext";
import { useLookup } from "@/hooks";
import { publicReportApi } from "@/services/api";

type ComposerMode = "feedback" | "reports";
type CameraFacingMode = "environment" | "user";

interface CommunityComposerPrefill {
  mode?: ComposerMode;
  projectId?: string;
  projectName?: string;
  reportType?: string;
  location?: string;
}

const COMPOSER_PREFILL_KEY = "communityComposerPrefill";
const MAX_PHOTO_MB = 5;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read selected image."));
    };
    reader.onerror = () => reject(new Error("Unable to read selected image."));
    reader.readAsDataURL(file);
  });
}

interface UsePublicReportFormParams {
  setCurrentPage: (page: string) => void;
}

export function usePublicReportForm({ setCurrentPage }: UsePublicReportFormParams) {
  const { projects: rdcProjects } = useProjectContext();
  const { userProfile, walletAddress } = useWallet();
  const { items: reportTypeLookup } = useLookup("ReportType");
  const allProjects = useMemo(() => rdcProjects.map(mapRDCToProject), [rdcProjects]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const reportTypeOptions = useMemo(() => {
    const options = reportTypeLookup
      .map((item) => String(item.name ?? "").trim())
      .filter(Boolean);

    if (options.length > 0) return options;
    return ["Quality Concern", "Safety Concern", "Delay Concern", "Positive Feedback"];
  }, [reportTypeLookup]);

  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [reportType, setReportType] = useState("");
  const [description, setDescription] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>("environment");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const canUseBrowserCamera =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  const reporterDisplayName =
    String(userProfile?.displayName ?? "").trim() ||
    String(userProfile?.email ?? "").trim() ||
    "Citizen Reporter";
  const reporterWallet = walletAddress || userProfile?.walletAddress || undefined;

  useEffect(() => {
    if (!reportType && reportTypeOptions.length > 0) {
      setReportType(reportTypeOptions[0]);
    }
  }, [reportType, reportTypeOptions]);

  const resolveProjectName = useCallback(
    (nextProjectId: string) => {
      const selectedProject = allProjects.find((project) => String(project.id) === String(nextProjectId));
      return String(selectedProject?.name ?? "").trim();
    },
    [allProjects]
  );

  useEffect(() => {
    const rawPrefill = sessionStorage.getItem(COMPOSER_PREFILL_KEY);
    if (!rawPrefill) return;

    try {
      const parsed = JSON.parse(rawPrefill) as CommunityComposerPrefill;
      if (parsed.mode && parsed.mode !== "reports") return;

      const prefillProjectId = String(parsed.projectId ?? "").trim();
      const resolvedProjectName = resolveProjectName(prefillProjectId);
      const prefillProjectName = String(parsed.projectName ?? resolvedProjectName).trim();
      const prefillType = String(parsed.reportType ?? "").trim();

      if (prefillProjectId) setProjectId(prefillProjectId);
      if (prefillProjectName) setProjectName(prefillProjectName);
      if (prefillType) {
        setReportType(prefillType);
      }
      if (prefillProjectName) {
        setDescription((prev) => prev || `Report for ${prefillProjectName}: `);
      }
    } catch {
      // Ignore malformed prefill payload and keep the form usable.
    } finally {
      sessionStorage.removeItem(COMPOSER_PREFILL_KEY);
    }
  }, [resolveProjectName]);

  const handleProjectChange = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    setProjectName(resolveProjectName(nextProjectId));
  };

  const handlePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAlert({ type: "error", message: "Please select a valid image file." });
      return;
    }

    const fileSizeMb = file.size / (1024 * 1024);
    if (fileSizeMb > MAX_PHOTO_MB) {
      setAlert({
        type: "error",
        message: `Image is too large. Please choose a file under ${MAX_PHOTO_MB}MB.`,
      });
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPhotoDataUrl(dataUrl);
      setPhotoName(file.name);
      setAlert(null);
    } catch {
      setAlert({ type: "error", message: "Failed to process selected image." });
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraOpen(false);
  }, []);

  const startCamera = useCallback(
    async (preferredFacingMode: CameraFacingMode) => {
      if (!canUseBrowserCamera) {
        setAlert({ type: "error", message: "Browser camera is not available on this device/browser." });
        return;
      }

      try {
        stopCamera();

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: preferredFacingMode } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: preferredFacingMode } },
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setCameraFacingMode(preferredFacingMode);
        setIsCameraOpen(true);
        setAlert(null);
      } catch {
        setAlert({ type: "error", message: "Unable to open browser camera. Please allow camera permission." });
      }
    },
    [canUseBrowserCamera, stopCamera]
  );

  const flipCamera = useCallback(async () => {
    const nextFacingMode: CameraFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
    await startCamera(nextFacingMode);
  }, [cameraFacingMode, startCamera]);

  const captureFromCamera = useCallback(() => {
    const videoElement = videoRef.current;
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      setAlert({ type: "error", message: "Camera is not ready yet. Please wait and try again." });
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      setAlert({ type: "error", message: "Unable to capture image from camera." });
      return;
    }

    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPhotoDataUrl(dataUrl);
    setPhotoName(`camera-${Date.now()}.jpg`);
    setAlert(null);
    stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (!canUseBrowserCamera) return;
    void startCamera("environment");
  }, [canUseBrowserCamera, startCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const clearPhoto = () => {
    setPhotoDataUrl("");
    setPhotoName("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const safeProjectId = String(projectId ?? "").trim();
    const safeProjectName = String(projectName ?? "").trim();
    const safeReportType = String(reportType ?? "").trim() || reportTypeOptions[0] || "Quality Concern";
    const safeDescription = String(description ?? "").trim();

    if (!safeProjectId || !safeProjectName) {
      setAlert({ type: "error", message: "Please select a project." });
      return;
    }

    if (!safeDescription) {
      setAlert({ type: "error", message: "Please provide report details." });
      return;
    }

    setIsSubmitting(true);
    setAlert(null);

    try {
      stopCamera();
      const createResponse = await publicReportApi.create({
        projectId: safeProjectId,
        projectName: safeProjectName,
        reportType: safeReportType,
        description: safeDescription,
        photosCount: photoDataUrl ? 1 : 0,
        photo: photoDataUrl || undefined,
        reportedBy: reporterDisplayName,
        walletAddress: reporterWallet,
      });

      const createdId = String((createResponse.data as { id?: string } | undefined)?.id ?? "").trim();
      let persistedToDatabase = false;

      try {
        const verifyResponse = await publicReportApi.getByProject(safeProjectId);
        const rows = verifyResponse.data ?? [];
        persistedToDatabase = createdId
          ? rows.some((row) => String(row.id ?? "").trim() === createdId)
          : rows.some((row) => {
              return (
                String(row.projectId ?? "").trim() === safeProjectId &&
                String(row.reportType ?? "").trim() === safeReportType &&
                String(row.description ?? "").trim() === safeDescription
              );
            });
      } catch {
        // Keep success path based on create API response even when verification fetch fails.
      }

      setAlert({
        type: "success",
        message: persistedToDatabase
          ? "Report submitted and saved to database successfully."
          : "Report submitted successfully.",
      });
      setDescription("");
      clearPhoto();
      setTimeout(() => setCurrentPage("ledger"), 650);
    } catch (error) {
      const apiMessage =
        (error as { response?: { data?: { message?: string; errors?: string[] } } })?.response?.data
          ?.message ??
        (error as { response?: { data?: { reason?: string } } })?.response?.data?.reason ??
        (error as { response?: { data?: { errors?: string[] } } })?.response?.data?.errors?.[0];

      const directErrorMessage = error instanceof Error ? error.message : undefined;

      setAlert({
        type: "error",
        message:
          apiMessage ||
          directErrorMessage ||
          "Failed to submit report. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    allProjects,
    reportTypeOptions,
    videoRef,
    reporterDisplayName,
    reporterWallet,
    projectId,
    reportType,
    description,
    photoDataUrl,
    photoName,
    isCameraOpen,
    cameraFacingMode,
    isSubmitting,
    alert,
    canUseBrowserCamera,
    setReportType,
    setDescription,
    setAlert,
    handleProjectChange,
    handlePhotoSelected,
    startCamera,
    stopCamera,
    flipCamera,
    captureFromCamera,
    clearPhoto,
    handleSubmit,
  };
}
