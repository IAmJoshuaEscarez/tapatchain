import { ArrowLeft, Camera, CameraOff, ImagePlus, Loader2, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui";
import { Card } from "@/components/ui";
import { usePublicReportForm } from "@/hooks/public/usePublicReportForm";

interface PublicReportFormPageProps {
  setCurrentPage: (page: string) => void;
}

export function PublicReportFormPage({ setCurrentPage }: PublicReportFormPageProps) {
  const {
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
  } = usePublicReportForm({ setCurrentPage });

  const handleBack = () => {
    const safeProjectId = String(projectId ?? "").trim();
    if (!safeProjectId) {
      setCurrentPage("ledger");
      return;
    }

    const selectedProject = allProjects.find(
      (project) => String(project.id ?? "").trim() === safeProjectId
    );
    const trackingSlug = String(selectedProject?.trackingSlug ?? "").trim();

    try {
      sessionStorage.setItem("selectedProjectId", safeProjectId);
    } catch {
      // Ignore storage failures and keep navigation working.
    }

    if (trackingSlug) {
      setCurrentPage(`ledger:monitor:${encodeURIComponent(trackingSlug)}`);
      return;
    }

    setCurrentPage("ledger");
  };

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="mx-auto max-w-2xl px-4 py-7 sm:px-6 sm:py-8">
        <Card className="border border-border/70 bg-card/95 px-5 pb-5 pt-3 shadow-sm sm:px-6 sm:pb-6 sm:pt-4">
          <div className="mb-5 border-b border-border/60 pb-4">
            <button
              type="button"
              onClick={handleBack}
              className="mb-1.5 inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <h1 className="text-lg font-semibold text-foreground">Public Report Form</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              File a report with optional on-site photo evidence.
            </p>
          </div>

          {alert && (
            <div
              className={`mb-5 rounded-lg border px-3.5 py-2.5 text-xs ${
                alert.type === "success"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {alert.message}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Project</label>
              <select
                value={projectId}
                onChange={(event) => handleProjectChange(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                required
              >
                <option value="">Select project</option>
                {allProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Report Type</label>
              <select
                value={reportType}
                onChange={(event) => setReportType(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary"
                required
              >
                {reportTypeOptions.map((typeName) => (
                  <option key={typeName} value={typeName}>
                    {typeName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Description</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Share report details for this project..."
                className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div className="space-y-3 border-t border-border/60 pt-4">
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Photo (Optional)</label>
              <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                <ImagePlus className="h-3.5 w-3.5" /> Upload or take on-site photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoSelected}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={isCameraOpen ? stopCamera : () => void startCamera(cameraFacingMode)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {isCameraOpen ? <CameraOff className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
                  {isCameraOpen ? "Close Browser Camera" : "Open Browser Camera"}
                </button>

                {isCameraOpen && (
                  <button
                    type="button"
                    onClick={() => void flipCamera()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Flip to {cameraFacingMode === "environment" ? "Front" : "Back"} Cam
                  </button>
                )}

                {isCameraOpen && (
                  <button
                    type="button"
                    onClick={captureFromCamera}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:brightness-95"
                  >
                    <Camera className="h-3.5 w-3.5" /> Capture Photo
                  </button>
                )}
              </div>

              {isCameraOpen && (
                <div className="overflow-hidden rounded-lg border border-border">
                  <video ref={videoRef} autoPlay playsInline muted className="h-52 w-full bg-black object-cover" />
                  <div className="border-t border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
                    Live browser camera preview
                  </div>
                </div>
              )}

              <p className="text-[11px] leading-6 text-muted-foreground">
                {canUseBrowserCamera
                  ? `Use upload/gallery or capture directly from browser camera (${cameraFacingMode === "environment" ? "Back" : "Front"} Cam).`
                  : "Browser camera is unavailable here. Upload a photo instead."}
              </p>

              {photoDataUrl && (
                <div className="overflow-hidden rounded-lg border border-border">
                  <img src={photoDataUrl} alt="Selected report photo" className="h-52 w-full object-cover" />
                  <div className="flex items-center justify-between border-t border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{photoName || "Selected image"}</span>
                    <button
                      type="button"
                      onClick={clearPhoto}
                      className="rounded-md border border-border px-2 py-0.5 text-xs text-foreground hover:bg-muted"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" className="h-9 rounded-lg text-xs" onClick={() => setCurrentPage("ledger")}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="h-9 rounded-lg text-xs" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 h-3.5 w-3.5" /> Submit Report
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
