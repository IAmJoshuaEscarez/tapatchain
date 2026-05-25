// ════════════════════════════════════════════════════════════════════════════
// BlueprintValidationPanel — Side-by-side Blueprint vs Milestone Photo
// Comparison + Validation Checklist for Project Engineer (Inspector)
// ════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import {
  CheckCircle,
  AlertCircle,
  FileText,
  Camera,
  ArrowLeft,
  ArrowRight,
  Shield,
  Loader2,
  Eye,
  ClipboardCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui";
import type { BlueprintResponse } from "@/features/milestone/api/milestoneApi";
import { resolveApiBaseUrl } from "@/shared/config/apiBaseUrl";

// ── Props ──

export interface BlueprintPhoto {
  id: string | number;
  fileName: string;
  photoUrl: string;
}

interface BlueprintValidationPanelProps {
  blueprints: BlueprintResponse[];
  photos: BlueprintPhoto[];
  isLoading: boolean;
  /** Called when engineer confirms compliance — passes true/false */
  onComplianceConfirmed: (confirmed: boolean) => void;
  complianceConfirmed: boolean;
  /** Blueprint verify handler */
  onVerifyBlueprint?: (blueprintId: number, status: "COMPLIANT" | "NON_COMPLIANT") => void;
  verifyingBlueprintId?: number | null;
  blueprintRemarks?: Record<number, string>;
  onBlueprintRemarksChange?: (id: number, value: string) => void;
}

// ── Component ──

export function BlueprintValidationPanel({
  blueprints,
  photos,
  isLoading,
  onComplianceConfirmed,
  complianceConfirmed,
  onVerifyBlueprint,
  verifyingBlueprintId,
  blueprintRemarks = {},
  onBlueprintRemarksChange,
}: BlueprintValidationPanelProps) {
  const [selectedBlueprintIdx, setSelectedBlueprintIdx] = useState(0);
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);
  const [checkSpecMatch, setCheckSpecMatch] = useState(false);
  const [checkDesignCompliance, setCheckDesignCompliance] = useState(false);
  const [hasViewedBlueprint, setHasViewedBlueprint] = useState(false);

  const currentBlueprint = blueprints[selectedBlueprintIdx] ?? null;
  const currentPhoto = photos[selectedPhotoIdx] ?? null;

  const blueprintSrc = useMemo(() => {
    if (!currentBlueprint) return null;
    if (currentBlueprint.base64Data) {
      return `data:${currentBlueprint.contentType};base64,${currentBlueprint.base64Data}`;
    }
    // Fallback to API file URL
    return `${resolveApiBaseUrl()}/api/Blueprint/${currentBlueprint.id}/file`;
  }, [currentBlueprint]);

  const canConfirm = hasViewedBlueprint && checkSpecMatch && checkDesignCompliance;

  // Reset checklist when blueprint changes
  const handleBlueprintNav = (dir: 1 | -1) => {
    const next = selectedBlueprintIdx + dir;
    if (next >= 0 && next < blueprints.length) {
      setSelectedBlueprintIdx(next);
    }
  };

  const handlePhotoNav = (dir: 1 | -1) => {
    const next = selectedPhotoIdx + dir;
    if (next >= 0 && next < photos.length) {
      setSelectedPhotoIdx(next);
    }
  };

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading blueprints…
      </div>
    );
  }

  // ── No blueprints ──
  if (blueprints.length === 0) {
    return (
      <div className="border border-primary/20 rounded-xl p-6 bg-primary/5 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto text-primary/60 mb-2" />
        <p className="text-sm font-semibold text-foreground">Pending Blueprint Submission</p>
        <p className="text-xs text-muted-foreground mt-1">
          The contractor has not yet uploaded a blueprint for this project.
          Blueprint validation cannot proceed until a blueprint is submitted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Side-by-side comparison ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Left: Blueprint */}
        <div className="border border-primary/30 rounded-xl overflow-hidden bg-card">
          <div className="bg-primary/10 border-b border-primary/20 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <FileText className="w-3.5 h-3.5" />
              Blueprint / Plan
            </div>
            {blueprints.length > 1 && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  disabled={selectedBlueprintIdx === 0}
                  onClick={() => handleBlueprintNav(-1)}
                >
                  <ArrowLeft className="w-3 h-3" />
                </Button>
                <span>{selectedBlueprintIdx + 1}/{blueprints.length}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  disabled={selectedBlueprintIdx === blueprints.length - 1}
                  onClick={() => handleBlueprintNav(1)}
                >
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
          <div className="aspect-video bg-muted/40 flex items-center justify-center relative">
            {blueprintSrc ? (
              currentBlueprint?.contentType?.includes("pdf") ? (
                <div className="text-center p-4">
                  <FileText className="w-10 h-10 mx-auto mb-2 text-primary/50" />
                  <p className="text-xs text-muted-foreground mb-2">{currentBlueprint.fileName}</p>
                  <a
                    href={blueprintSrc}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                    onClick={() => setHasViewedBlueprint(true)}
                  >
                    <Eye className="w-3 h-3" /> Open PDF
                  </a>
                </div>
              ) : (
                <img
                  src={blueprintSrc}
                  alt={currentBlueprint?.label || "Blueprint"}
                  className="w-full h-full object-contain cursor-pointer"
                  onClick={() => {
                    setHasViewedBlueprint(true);
                    const popup = window.open(blueprintSrc!, "_blank", "noopener,noreferrer");
                    if (popup) popup.opener = null;
                  }}
                  onLoad={() => setHasViewedBlueprint(true)}
                />
              )
            ) : (
              <div className="text-center text-xs text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-1 text-muted-foreground/50" />
                No preview available
              </div>
            )}
          </div>
          {currentBlueprint && (
            <div className="px-3 py-2 border-t border-primary/10 text-[10px] text-muted-foreground space-y-0.5">
              <div className="font-medium text-foreground text-xs">{currentBlueprint.label}</div>
              <div>{currentBlueprint.fileName} · {(currentBlueprint.fileSize / 1024).toFixed(0)} KB</div>
              <div>
                Status:{" "}
                <span className={
                  currentBlueprint.verificationStatus === "COMPLIANT"
                    ? "text-primary font-semibold"
                    : currentBlueprint.verificationStatus === "NON_COMPLIANT"
                      ? "text-red-500 font-semibold"
                      : "text-muted-foreground"
                }>
                  {currentBlueprint.verificationStatus === "PENDING"
                    ? "Pending Verification"
                    : currentBlueprint.verificationStatus}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Current Milestone Photo */}
        <div className="border border-primary/30 rounded-xl overflow-hidden bg-card">
          <div className="bg-primary/10 border-b border-primary/20 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Camera className="w-3.5 h-3.5" />
              Milestone Photo
            </div>
            {photos.length > 1 && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  disabled={selectedPhotoIdx === 0}
                  onClick={() => handlePhotoNav(-1)}
                >
                  <ArrowLeft className="w-3 h-3" />
                </Button>
                <span>{selectedPhotoIdx + 1}/{photos.length}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  disabled={selectedPhotoIdx === photos.length - 1}
                  onClick={() => handlePhotoNav(1)}
                >
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
          <div className="aspect-video bg-muted/40 flex items-center justify-center">
            {currentPhoto?.photoUrl ? (
              <img
                src={currentPhoto.photoUrl}
                alt={currentPhoto.fileName}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center text-xs text-muted-foreground">
                <Camera className="w-8 h-8 mx-auto mb-1 text-muted-foreground/50" />
                No photos submitted
              </div>
            )}
          </div>
          {currentPhoto && (
            <div className="px-3 py-2 border-t border-primary/10 text-[10px] text-muted-foreground">
              <div className="font-medium text-foreground text-xs">{currentPhoto.fileName}</div>
              <div>Photo {selectedPhotoIdx + 1} of {photos.length}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Validation Checklist ── */}
      <div className="border border-primary/20 rounded-xl p-4 bg-card space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardCheck className="w-4 h-4 text-primary" />
          Blueprint Validation Checklist
        </div>

        <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/30 bg-muted/30 cursor-pointer transition-colors">
          <input
            type="checkbox"
            checked={checkSpecMatch}
            onChange={(e) => {
              setCheckSpecMatch(e.target.checked);
              if (!e.target.checked) onComplianceConfirmed(false);
            }}
            className="mt-0.5 accent-[#2A7E8F]"
          />
          <div>
            <div className="text-xs font-medium text-foreground">Match with Blueprint Specifications</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Submitted milestone photos match the construction specifications in the uploaded blueprint/plan.
            </div>
          </div>
        </label>

        <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/30 bg-muted/30 cursor-pointer transition-colors">
          <input
            type="checkbox"
            checked={checkDesignCompliance}
            onChange={(e) => {
              setCheckDesignCompliance(e.target.checked);
              if (!e.target.checked) onComplianceConfirmed(false);
            }}
            className="mt-0.5 accent-[#2A7E8F]"
          />
          <div>
            <div className="text-xs font-medium text-foreground">Design Compliance Verified</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              The actual work shown in milestone photos complies with the approved project design and engineering standards.
            </div>
          </div>
        </label>

        {/* Confirm Compliance Button */}
        {!complianceConfirmed ? (
          <Button
            onClick={() => onComplianceConfirmed(true)}
            disabled={!canConfirm}
            className="w-full bg-primary hover:bg-primary/90 text-white text-sm h-9 gap-2 rounded-xl"
          >
            <Shield className="w-4 h-4" />
            Confirm Blueprint Compliance
          </Button>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-primary font-medium">
            <CheckCircle className="w-4 h-4" />
            Blueprint compliance confirmed — you may now sign the milestone.
          </div>
        )}
        {!canConfirm && !complianceConfirmed && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {!hasViewedBlueprint
              ? "View the blueprint first, then complete the checklist to confirm compliance."
              : "Complete all checklist items to confirm compliance."}
          </p>
        )}
      </div>

      {/* ── Per-Blueprint Verification (API-backed) ── */}
      {onVerifyBlueprint && currentBlueprint && currentBlueprint.verificationStatus === "PENDING" && (
        <div className="border border-border rounded-xl p-4 bg-card space-y-3">
          <div className="text-xs font-semibold text-foreground">
            Verify Blueprint: {currentBlueprint.label}
          </div>
          <textarea
            className="w-full min-h-14 p-2.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground"
            placeholder="Verification remarks (optional)..."
            value={blueprintRemarks[currentBlueprint.id] ?? ""}
            onChange={(e) => onBlueprintRemarksChange?.(currentBlueprint.id, e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-primary hover:bg-primary/90 text-white text-xs h-8 gap-1.5"
              onClick={() => onVerifyBlueprint(currentBlueprint.id, "COMPLIANT")}
              disabled={verifyingBlueprintId === currentBlueprint.id}
            >
              {verifyingBlueprintId === currentBlueprint.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle className="w-3 h-3" />
              )}
              Compliant
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs h-8 gap-1.5"
              onClick={() => onVerifyBlueprint(currentBlueprint.id, "NON_COMPLIANT")}
              disabled={verifyingBlueprintId === currentBlueprint.id}
            >
              <AlertCircle className="w-3 h-3" />
              Non-Compliant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
