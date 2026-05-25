import { useState } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  PauseCircle,
  Link2,
  Calendar,
  ExternalLink,
  Camera,
  Eye,
  X,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { getEtherscanLink, isRealTxHash } from "@/services/blockchain";
import type { Project } from "@/types";
import type { Milestone } from "@/context/MilestoneContext";

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

interface ProjectAuditSummaryProps {
  project: Project;
  projectMilestones: Milestone[];
  registryTrace?: ProjectRegistryTrace;
  onGoBack: () => void;
}

const fmtDateTime = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const shortHash = (value?: string) => {
  if (!value) return "—";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
};

const getActionLabel = (value?: string) => {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => (part.length <= 3 ? part.toUpperCase() : `${part[0]}${part.slice(1).toLowerCase()}`))
    .join(" ");
};

const getTxLink = (hash?: string) => {
  if (!hash || !isRealTxHash(hash)) return null;
  return getEtherscanLink(hash);
};

const toEpoch = (value?: string) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const reviewActionFromMilestoneStatus = (status?: Milestone["status"]) => {
  if (status === "COA_AUDITED") return "COA_AUDITED";
  if (status === "COA_REJECTED") return "COA_REJECTED";
  return undefined;
};

function ReceiptField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xs mt-0.5 ${mono ? "font-mono break-all" : "font-medium"}`}>{value}</div>
    </div>
  );
}

function ReceiptRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-2 items-start">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-[11px] text-foreground leading-relaxed ${mono ? "font-mono break-all" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}

function MilestoneStatusBadge({ status }: { status: Milestone["status"] }) {
  if (status === "COA_AUDITED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
        <ShieldCheck className="w-3 h-3" /> Approved by COA
      </span>
    );
  }

  if (status === "COA_REJECTED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
        <PauseCircle className="w-3 h-3" /> Rejected / Suspended by COA
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
      <AlertCircle className="w-3 h-3" /> Recorded in Audit History
    </span>
  );
}

const isReviewedStatus = (status: Milestone["status"]) =>
  status === "COA_AUDITED" || status === "COA_REJECTED";

type AuditPhoto = Milestone["photos"][number];

const isOnSitePhoto = (photo: AuditPhoto) =>
  photo.sourceType === "real-time" && !photo.isTampered;

const getPhotoSiteNote = (photo: AuditPhoto) => {
  if (isOnSitePhoto(photo)) return "Captured on-site with real-time source validation.";
  if (photo.isTampered) return "Not on-site record: metadata indicates edited or tampered evidence.";
  if (photo.sourceType === "edited") return "Not on-site record: evidence source is marked as edited.";
  return "Not on-site record: source is not verified as a real-time on-site capture.";
};

const getPhotoGpsLabel = (photo: AuditPhoto) => {
  const hasGps = photo.gpsLat !== 0 || photo.gpsLng !== 0;
  if (!hasGps) return "No GPS coordinates";
  return `${photo.gpsLat.toFixed(5)}, ${photo.gpsLng.toFixed(5)}`;
};

export function ProjectAuditSummary({
  project,
  projectMilestones,
  registryTrace,
  onGoBack,
}: ProjectAuditSummaryProps) {
  const [previewPhoto, setPreviewPhoto] = useState<{
    url: string;
    label: string;
    milestoneName: string;
  } | null>(null);

  const reviewedMilestones = projectMilestones.filter((milestone) =>
    isReviewedStatus(milestone.status)
  );
  const receiptMilestones = reviewedMilestones.length > 0 ? reviewedMilestones : projectMilestones;

  const latestReviewedMilestone = [...receiptMilestones].sort((left, right) => {
    const leftEpoch = toEpoch(left.coaApprovedDate || left.submittedDate);
    const rightEpoch = toEpoch(right.coaApprovedDate || right.submittedDate);
    return rightEpoch - leftEpoch;
  })[0];

  const totalRequestedAmount = receiptMilestones.reduce((sum, m) => sum + (m.requestedAmount || 0), 0);
  const totalEvidencePhotos = receiptMilestones.reduce((sum, m) => sum + (m.photos?.length ?? 0), 0);

  const latestTxHash = registryTrace?.latestTransactionHash ?? latestReviewedMilestone?.blockchainHash;
  const latestTxUrl = getTxLink(latestTxHash);
  const receiptNumber = project.coaAssignmentNo || `${project.id}-COA`;
  const latestActionLabel = getActionLabel(
    registryTrace?.latestActionType ?? reviewActionFromMilestoneStatus(latestReviewedMilestone?.status)
  );
  const latestTimestamp = registryTrace?.latestBlockTimestamp
    ?? latestReviewedMilestone?.coaApprovedDate
    ?? latestReviewedMilestone?.submittedDate;
  const latestRemarks = registryTrace?.latestRemarks ?? latestReviewedMilestone?.coaRemarks;
  const contractorWallet = project.contractorWallet || "Not available";
  const siteEngineerName = project.siteEngineer || "Not assigned";
  const siteEngineerWallet = project.engineerWallet || "Not available";

  return (
    <div className="space-y-4">
      <button
        onClick={onGoBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to audit history
      </button>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3 border-b border-dashed border-border bg-muted/20">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">COA Regional Audit Receipt</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">{project.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {project.municipality}, {project.barangay} · {project.dpwhRegion}
              </p>
            </div>
            <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary">
              Audit History Record
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 xl:grid-cols-12 items-stretch">
            <div className="p-4 border-b xl:border-b-0 xl:border-r border-dashed border-border xl:col-span-7">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <section className="rounded border border-border bg-card px-3 py-2.5 space-y-2 h-full">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Project Details</p>
                  <div className="space-y-1.5">
                    <ReceiptRow label="Receipt No." value={receiptNumber} mono />
                    <ReceiptRow label="Project ID" value={project.id} mono />
                    <ReceiptRow label="Project Type" value={project.type || "—"} />
                    <ReceiptRow
                      label="Contractor"
                      value={`${project.contractor || "—"} (${project.contractorLicense || "—"})`}
                    />
                  </div>
                </section>

                <section className="rounded border border-border bg-card px-3 py-2.5 space-y-2 h-full">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assigned Personnel</p>
                  <div className="space-y-1.5">
                    <ReceiptRow
                      label="Contractor"
                      value={contractorWallet}
                      mono
                    />
                    <ReceiptRow
                      label="Engineer"
                      value={siteEngineerName}
                    />
                    <ReceiptRow
                      label="Engineer Wallet"
                      value={siteEngineerWallet}
                      mono
                    />
                  </div>
                </section>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                <ReceiptField label="ABC" value={formatCurrency(project.budget)} />
                <ReceiptField label="Spent to Date" value={formatCurrency(project.spent)} />
              </div>
            </div>

            <div className="p-4 xl:col-span-5">
              <section className="rounded border border-border bg-card px-3 py-2.5 space-y-2 h-full">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Blockchain Verification</p>
                <div className="space-y-1.5">
                  <ReceiptRow label="COA Action" value={latestActionLabel} />
                  <ReceiptRow
                    label="Timestamp"
                    value={fmtDateTime(latestTimestamp)}
                  />
                  <ReceiptRow
                    label="TX Hash"
                    value={latestTxHash ?? "—"}
                    mono
                  />
                </div>

                <div className="pt-2 border-t border-dashed border-border">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Verify on Etherscan</div>
                  {latestTxUrl ? (
                    <a
                      href={latestTxUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      View on Sepolia Etherscan <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <div className="text-xs mt-1 text-muted-foreground">No valid transaction hash</div>
                  )}
                </div>
              </section>
            </div>
          </div>

          <div className="border-t border-dashed border-border p-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
              <div className="lg:col-span-8 rounded border border-border bg-card px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">COA Remarks</div>
                <div className="text-xs text-foreground mt-1 leading-relaxed">
                  {latestRemarks || "No remarks available."}
                </div>
              </div>

              <div className="lg:col-span-4 rounded border border-border bg-card px-3 py-2.5 flex flex-col justify-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Reviewed Amount</div>
                <div className="text-sm font-semibold text-foreground mt-1">{formatCurrency(totalRequestedAmount)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> Milestone Audit Details
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Important audit data and evidence only.
          </p>
        </CardHeader>
        <CardContent className="pt-3 space-y-2">
          <div className="rounded border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            <Camera className="w-3.5 h-3.5 inline mr-1.5 align-[-1px]" />
            Total photo evidence attached to reviewed milestones: <span className="font-semibold text-foreground">{totalEvidencePhotos}</span>
          </div>

          {receiptMilestones.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No audit milestones found for this project.</p>
          ) : (
            receiptMilestones.map((milestone) => {
              const milestoneTxUrl = getTxLink(milestone.blockchainHash);
              return (
                <div key={milestone.id} className="rounded border border-border bg-card overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-dashed border-border flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-foreground">{milestone.milestoneName}</div>
                      <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5 mt-0.5">
                        <Calendar className="w-3 h-3" /> Submitted: {fmtDateTime(milestone.submittedDate)}
                      </div>
                    </div>
                    <MilestoneStatusBadge status={milestone.status} />
                  </div>

                  <div className="px-3 py-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <ReceiptField label="Requested Amount" value={formatCurrency(milestone.requestedAmount)} />
                    <ReceiptField label="COA Date" value={fmtDateTime(milestone.coaApprovedDate)} />
                    <ReceiptField
                      label="Blockchain Hash"
                      value={milestone.blockchainHash ? shortHash(milestone.blockchainHash) : "—"}
                      mono
                    />
                    <div className="rounded border border-border bg-card px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Etherscan</div>
                      {milestoneTxUrl ? (
                        <a
                          href={milestoneTxUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Verify TX <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <div className="text-xs mt-0.5 text-muted-foreground">No valid tx hash</div>
                      )}
                    </div>
                  </div>

                  <div className="px-3 pb-2.5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">COA Remarks:</span>{" "}
                    {milestone.coaRemarks || registryTrace?.latestRemarks || "No remarks available."}
                  </div>

                  <div className="border-t border-dashed border-border px-3 py-2.5">
                    <div className="text-[11px] font-medium text-foreground inline-flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5" /> Audited Photo Evidence ({milestone.photos?.length ?? 0})
                    </div>

                    {(milestone.photos?.length ?? 0) === 0 ? (
                      <p className="text-[11px] text-muted-foreground mt-1.5">No photo evidence saved for this milestone.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-2">
                        {(milestone.photos ?? []).map((photo, index) => (
                          <figure
                            key={photo.id || `${milestone.id}-${index}`}
                            className="rounded border border-border bg-card overflow-hidden h-full flex flex-col"
                          >
                            <div className="relative">
                              {photo.url ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewPhoto({
                                      url: photo.url,
                                      label: photo.name || `Photo ${index + 1}`,
                                      milestoneName: milestone.milestoneName,
                                    })
                                  }
                                  className="block w-full text-left"
                                >
                                  <img
                                    src={photo.url}
                                    alt={`Audited evidence ${index + 1} for ${milestone.milestoneName}`}
                                    className="w-full h-32 object-cover"
                                    loading="lazy"
                                  />
                                </button>
                              ) : (
                                <div className="w-full h-32 flex items-center justify-center text-[10px] text-muted-foreground bg-muted/30">
                                  Image unavailable
                                </div>
                              )}

                              <span
                                className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  isOnSitePhoto(photo)
                                    ? "bg-primary/10 text-primary border-primary/20"
                                    : "bg-muted text-muted-foreground border-border"
                                }`}
                              >
                                {isOnSitePhoto(photo) ? "ON-SITE" : "NOT ON-SITE"}
                              </span>
                            </div>

                            <figcaption className="px-2.5 py-2 space-y-1.5 flex-1">
                              <div className="text-[10px] font-semibold text-foreground">Evidence Photo {index + 1}</div>

                              <div className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-[10px] items-start">
                                <span className="text-muted-foreground uppercase tracking-wide">File</span>
                                <span className="text-foreground truncate" title={photo.name || `Photo ${index + 1}`}>
                                  {photo.name || `Photo ${index + 1}`}
                                </span>

                                <span className="text-muted-foreground uppercase tracking-wide">Captured</span>
                                <span className="text-foreground">{fmtDateTime(photo.timestamp)}</span>

                                <span className="text-muted-foreground uppercase tracking-wide">Location</span>
                                <span className="font-mono text-foreground truncate">{getPhotoGpsLabel(photo)}</span>
                              </div>

                              <div className="pt-1 border-t border-dashed border-border text-[10px] text-muted-foreground leading-relaxed">
                                {getPhotoSiteNote(photo)}
                              </div>

                              {photo.url && (
                                <div className="pt-1 border-t border-dashed border-border flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewPhoto({
                                        url: photo.url,
                                        label: photo.name || `Photo ${index + 1}`,
                                        milestoneName: milestone.milestoneName,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                                  >
                                    <Eye className="w-3 h-3" /> View Full Image
                                  </button>

                                  <a
                                    href={photo.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                                  >
                                    <ExternalLink className="w-3 h-3" /> Open in Tab
                                  </a>
                                </div>
                              )}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/70 p-4 flex items-center justify-center"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] bg-card border border-border rounded-lg overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{previewPhoto.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{previewPhoto.milestoneName}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="inline-flex items-center justify-center w-7 h-7 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-3 bg-black/20 max-h-[80vh] overflow-auto flex items-center justify-center">
              <img
                src={previewPhoto.url}
                alt={previewPhoto.label}
                className="max-w-full max-h-[76vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
