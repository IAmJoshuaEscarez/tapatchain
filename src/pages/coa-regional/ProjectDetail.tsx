import React, { useState } from "react";
import { ArrowLeft, FileText, Camera, CheckCircle, AlertTriangle, ShieldCheck, PauseCircle, ShieldAlert, Smartphone, Mountain, Compass, Calendar, ExternalLink, Loader2, Shield, AlertCircle, MapPin, Eye, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { buildExifFromPhotoData, getDeviceString, getBearingString } from "@/lib/exifExtractor";

import type { Project } from "@/types";
import type { Milestone } from "@/context/MilestoneContext";
import type { SignatureGateResult } from "@/services/signatureGate";

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

// ── Forensic metadata cell ──
function MetaCell({ icon, label, value, alert: isAlert }: { icon: React.ReactNode; label: string; value: string; alert?: boolean; }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded bg-muted/40 border border-border/60 hover:border-primary/20 transition-colors">
      <div className="text-primary shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">{label}</div>
        <div className={`text-[11px] font-medium font-mono truncate ${isAlert ? "text-primary" : "text-foreground"}`}>{value}</div>
      </div>
    </div>
  );
}

const fmt = formatCurrency;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });

interface ProjectDetailProps {
  project: Project;
  projectMilestones: Milestone[];
  forensicVerifiedMilestones: Set<string>;
  forensicChecks: Record<string, ForensicValidationResult>;
  suspendedMilestones: Record<string, { reason: string; issuedAt: string }>;
  coaRemarks: string;
  setCoaRemarks: (v: string) => void;
  isProcessing: boolean;
  onGoBack: () => void;
  handleRunForensicValidation: (ms: Milestone) => Promise<void> | void;
  handleConfirmForensicIntegrity: (ms: Milestone) => void;
  onSuspendClick: (ms: Milestone) => void;
  lastSignResult: SignatureGateResult | null;
}

export function ProjectDetail({
  project, projectMilestones, forensicVerifiedMilestones, forensicChecks, suspendedMilestones, coaRemarks, setCoaRemarks, isProcessing, onGoBack, handleRunForensicValidation, handleConfirmForensicIntegrity, onSuspendClick, lastSignResult
}: ProjectDetailProps) {
  const [detailTab, setDetailTab] = useState<"overview" | "forensic">("overview");
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; name: string } | null>(null);

  const allMilestonesForensicVerified = projectMilestones.length > 0 && projectMilestones.every(m => forensicVerifiedMilestones.has(m.id) || m.status === "COA_AUDITED");
  const selectedForensicCheck = selectedMilestone ? forensicChecks[selectedMilestone.id] : undefined;
  const tripleLockReady = Boolean(selectedForensicCheck?.metadataMatch && coaRemarks.trim());

  return (
    <div className="space-y-4">
      <button onClick={onGoBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to project list
      </button>

      {/* Project Header + Tabs */}
      <div className="border border-border rounded-md bg-card overflow-hidden">
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{project.name}</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">{project.municipality}, {project.barangay} · {project.dpwhRegion} · {project.type}</p>
              <p className="text-[11px] text-muted-foreground">Contractor: {project.contractor} · {project.contractorLicense}</p>
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary">
              {allMilestonesForensicVerified ? "COA Forensic Verified" : "Pending COA Review"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-border pt-3">
            {[
              { label: "ABC (Approved Budget)", value: fmt(project.budget) },
              { label: "Spent to Date", value: fmt(project.spent) },
              { label: "Remaining", value: fmt(project.budget - project.spent) },
              { label: "Completion", value: `${project.progress}%` },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
                <div className="text-xs font-semibold text-foreground mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-t border-border flex overflow-x-auto">
          {(
            [
              { key: "overview", label: "Overview", icon: <FileText className="w-3.5 h-3.5" /> },
              { key: "forensic", label: "Forensic Validator", icon: <Camera className="w-3.5 h-3.5" />, alert: projectMilestones.some(m => !forensicVerifiedMilestones.has(m.id) && m.status !== "COA_AUDITED") },
            ] as Array<{ key: "overview"|"forensic"; label: string; icon: React.JSX.Element; alert?: boolean }>
          ).map((tab) => (
            <button key={tab.key} onClick={() => setDetailTab(tab.key)} className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${detailTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}`}>
              {tab.icon} {tab.label}
              {tab.alert && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </div>

      {detailTab === "overview" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="bg-muted px-4 py-3 border-b border-border"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project Details</CardTitle></CardHeader>
            <CardContent className="p-0 divide-y divide-border">
              {[
                { label: "Project ID", value: project.id },
                { label: "Name", value: project.name },
                { label: "Municipality", value: project.municipality },
                { label: "Barangay", value: project.barangay },
                { label: "DPWH Region", value: project.dpwhRegion },
                { label: "Type", value: project.type },
                { label: "Contractor", value: project.contractor },
                { label: "License No.", value: project.contractorLicense },
              ].map(r => (
                <div key={r.label} className="grid grid-cols-2 px-4 py-2">
                  <div className="text-[11px] text-muted-foreground">{r.label}</div>
                  <div className="text-[11px] text-foreground font-medium">{r.value}</div>
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader className="bg-muted px-4 py-3 border-b border-border"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Milestone Audit Status</CardTitle></CardHeader>
              <CardContent className="p-4 space-y-2">
                {projectMilestones.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No engineer-verified milestones yet.</p>
                ) : projectMilestones.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded border border-border hover:bg-muted/30 transition-colors">
                    <div>
                      <div className="text-xs font-medium text-foreground">{m.milestoneName}</div>
                      <div className="text-[11px] text-muted-foreground">{m.photos?.length ?? 0} photos · {fmt(m.requestedAmount)}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${forensicVerifiedMilestones.has(m.id) || m.status === "COA_AUDITED" ? "bg-primary/10 text-primary" : suspendedMilestones[m.id] ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {forensicVerifiedMilestones.has(m.id) || m.status === "COA_AUDITED" ? <><ShieldCheck className="w-3 h-3" /> Verified</> : suspendedMilestones[m.id] ? <><PauseCircle className="w-3 h-3" /> Suspended</> : <><AlertCircle className="w-3 h-3" /> Pending</>}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="bg-muted px-4 py-3 border-b border-border"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">COA Assignment</CardTitle></CardHeader>
              <CardContent className="p-0 divide-y divide-border">
                {[
                  { label: "Assignment No.", value: project.coaAssignmentNo ?? "—" },
                  { label: "Auditor", value: project.coaAuditor ?? "—" },
                  { label: "ABC", value: fmt(project.budget) },
                  { label: "Spent to Date", value: fmt(project.spent) },
                ].map((r) => (
                  <div key={r.label} className="grid grid-cols-2 px-4 py-2">
                    <div className="text-[11px] text-muted-foreground">{r.label}</div>
                    <div className="text-[11px] text-foreground font-medium">{r.value}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {detailTab === "forensic" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="bg-muted px-4 py-3 border-b border-border flex flex-row items-center gap-2 space-y-0">
              <Camera className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Select Milestone for Forensic Review</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              {projectMilestones.length === 0 ? (
                <p className="text-[11px] text-muted-foreground py-4 text-center">No engineer-verified milestones available for forensic review.</p>
              ) : projectMilestones.map((ms) => (
                <button
                  key={ms.id}
                  onClick={() => setSelectedMilestone(ms)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded border transition-colors ${selectedMilestone?.id === ms.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}
                >
                  <div className="text-left">
                    <div className="text-xs font-medium text-foreground">{ms.milestoneName}</div>
                    <div className="text-[11px] text-muted-foreground">{ms.photos?.length ?? 0} photos · Submitted {ms.submittedDate ? fmtDate(ms.submittedDate) : "—"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {suspendedMilestones[ms.id] && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary">AOM SUSPENDED</span>}
                    {(forensicVerifiedMilestones.has(ms.id) || ms.status === "COA_AUDITED") && <ShieldCheck className="w-4 h-4 text-primary" />}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {selectedMilestone && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="bg-muted px-4 py-3 border-b border-border flex flex-row items-center gap-2 space-y-0">
                  <MapPin className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">GPS Comparison — Lock Alignment Check</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground">Source</th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground">Latitude</th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground">Longitude</th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium text-foreground">Master Project GPS</td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{project.siteLatitude?.toFixed(6) ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{project.siteLongitude?.toFixed(6) ?? "—"}</td>
                        <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"><Shield className="w-3 h-3" /> Anchor</span></td>
                      </tr>
                      <tr className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium text-foreground">Contractor Upload GPS</td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{selectedMilestone.gpsMetadata.latitude.toFixed(6)}</td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{selectedMilestone.gpsMetadata.longitude.toFixed(6)}</td>
                        <td className="px-4 py-2.5">
                          {selectedMilestone.gpsVerified ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"><CheckCircle className="w-3 h-3" /> Verified</span> : <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><AlertCircle className="w-3 h-3" /> Unverified</span>}
                        </td>
                      </tr>
                      {selectedMilestone.inspectorName && (
                        <tr className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-medium text-foreground">Site Engineer ({selectedMilestone.inspectorName})</td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">{selectedMilestone.gpsMetadata.latitude.toFixed(6)}</td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">{selectedMilestone.gpsMetadata.longitude.toFixed(6)}</td>
                          <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"><ShieldCheck className="w-3 h-3" /> Engineer Attested</span></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="bg-muted px-4 py-3 border-b border-border flex flex-row items-center gap-2 space-y-0">
                  <div className="w-4 h-4 text-muted-foreground flex justify-center items-center"><Camera className="w-3.5 h-3.5"/></div>
                  <div className="flex-1">
                    <CardTitle className="text-sm font-semibold text-foreground">Forensic Metadata Scan — Official Audit Tool</CardTitle>
                    <p className="text-[11px] text-muted-foreground">Device Signature & Software Tamper Detection</p>
                  </div>
                  <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary">{selectedMilestone.photos?.length ?? 0} evidence records</span>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-border">
                  {(selectedMilestone.photos ?? []).map((photo, idx) => {
                    const exif = buildExifFromPhotoData({
                      gpsLatitude: photo.gpsLat, gpsLongitude: photo.gpsLng, gpsAltitude: photo.gpsAltitude, gpsDirection: photo.gpsDirection, gpsTimestamp: photo.timestamp,
                      deviceMake: photo.deviceMake, deviceModel: photo.deviceModel, software: photo.software, isTampered: photo.isTampered, tamperReason: photo.tamperReason,
                      sourceType: photo.sourceType as any, sourceVerdict: photo.sourceVerdict, deviceSignature: photo.deviceSignature, dateTimeOriginal: photo.dateTimeOriginal, forensicFlags: photo.forensicFlags,
                    });
                    const isSoftwareFlagged = exif.isTampered || (exif.software && /photoshop|canva|lightroom|gimp|snapseed|picsart/i.test(exif.software));
                    const isNotOnsite = exif.sourceType !== "real-time";
                    return (
                      <div key={photo.id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">Photo {idx + 1}</span>
                            <span className="text-[11px] text-muted-foreground">{photo.name}</span>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${exif.sourceType === "real-time" ? "bg-primary/10 text-primary" : exif.sourceType === "edited" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {exif.sourceType === "real-time" ? <><CheckCircle className="w-3 h-3" /> Real-Time</> : exif.sourceType === "edited" ? <><AlertTriangle className="w-3 h-3" /> Tampered</> : <><Shield className="w-3 h-3" /> Unknown</>}
                          </span>
                        </div>
                        {photo.url ? (
                          <div className="rounded border border-border overflow-hidden bg-muted/20">
                            <button
                              type="button"
                              onClick={() => setPreviewPhoto({ url: photo.url, name: photo.name || `Photo ${idx + 1}` })}
                              className="block w-full text-left"
                            >
                              <img
                                src={photo.url}
                                alt={`Forensic evidence ${idx + 1} for ${selectedMilestone.milestoneName}`}
                                className="w-full h-44 object-cover"
                                loading="lazy"
                              />
                            </button>
                            <div className="px-3 py-2 border-t border-border flex items-center justify-between gap-2 bg-card">
                              <span className="text-[10px] text-muted-foreground">Evidence Preview</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPreviewPhoto({ url: photo.url, name: photo.name || `Photo ${idx + 1}` })}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                                >
                                  <Eye className="w-3 h-3" /> View
                                </button>
                                <a
                                  href={photo.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                                >
                                  <ExternalLink className="w-3 h-3" /> Open
                                </a>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded border border-border bg-muted/30 h-24 flex items-center justify-center text-[10px] text-muted-foreground">
                            Image unavailable
                          </div>
                        )}
                        {isNotOnsite && (
                          <div className="flex items-start gap-2 px-3 py-2 rounded bg-primary/5 border border-primary/30">
                            <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            <div className="text-[11px] text-primary"><span className="font-semibold">This photo may not be an on-site capture.</span> {exif.sourceVerdict}</div>
                          </div>
                        )}
                        {isSoftwareFlagged && (
                          <div className="flex items-start gap-2 px-3 py-2 rounded bg-primary/5 border border-primary/30">
                            <ShieldAlert className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            <div className="text-[11px] text-primary"><span className="font-semibold">Editing software detected:</span> {exif.software ?? exif.tamperReason ?? "Unknown editor"}</div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <MetaCell icon={<Smartphone className="w-3 h-3" />} label="Device" value={getDeviceString(exif)} />
                          <MetaCell icon={<Mountain className="w-3 h-3" />} label="Altitude" value={exif.gpsAltitude !== null ? `${exif.gpsAltitude.toFixed(1)}m ASL` : "No data"} />
                          <MetaCell icon={<Compass className="w-3 h-3" />} label="Bearing" value={getBearingString(exif.gpsDirection)} />
                          <MetaCell icon={<Calendar className="w-3 h-3" />} label="Date/Time" value={exif.dateTimeOriginal ?? "No data"} />
                          <MetaCell icon={<Camera className="w-3 h-3" />} label="Software" value={exif.software ?? "None detected"} alert={!!isSoftwareFlagged} />
                          <MetaCell icon={<Shield className="w-3 h-3" />} label="Source Integrity" value={exif.sourceVerdict} alert={exif.sourceType !== "real-time"} />
                        </div>
                        {exif.forensicFlags.length > 0 && (
                          <div className="space-y-1">
                            {exif.forensicFlags.map((flag, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground"><AlertCircle className="w-3 h-3 text-primary/50 shrink-0 mt-0.5" />{flag}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="bg-muted px-4 py-3 border-b border-border">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">COA Action — {selectedMilestone.milestoneName}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {(forensicVerifiedMilestones.has(selectedMilestone.id) || selectedMilestone.status === "COA_AUDITED") && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded bg-primary/5 border border-primary/30">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      <span className="text-xs font-semibold text-primary">Forensic integrity confirmed — Milestone audited on-chain</span>
                    </div>
                  )}

                  {suspendedMilestones[selectedMilestone.id] && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded bg-primary/5 border border-primary/30">
                      <PauseCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-primary">AOM — Milestone Suspended</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">Reason: {suspendedMilestones[selectedMilestone.id].reason}</div>
                      </div>
                    </div>
                  )}

                  {!forensicVerifiedMilestones.has(selectedMilestone.id) && selectedMilestone.status !== "COA_AUDITED" && !suspendedMilestones[selectedMilestone.id] && (
                    <>
                      <div className="rounded border border-border bg-muted/20 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground">Forensic First Gate</span>
                          {selectedForensicCheck ? (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${selectedForensicCheck.metadataMatch ? "bg-primary/10 text-primary" : "bg-primary/10 text-primary"}`}>
                              {selectedForensicCheck.metadataMatch ? "MATCHED" : "FLAGGED"}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">NOT RUN</span>
                          )}
                        </div>

                        {selectedForensicCheck ? (
                          <div className="space-y-1 text-[11px] text-muted-foreground">
                            <div>Forensic Integrity Score: <span className="font-semibold text-foreground">{selectedForensicCheck.integrityScore}/100</span></div>
                            <div>GPS Variance: <span className="font-mono text-foreground">{selectedForensicCheck.gpsVarianceMeters !== null ? `${selectedForensicCheck.gpsVarianceMeters.toFixed(2)}m` : "N/A"}</span> (threshold ≤ 50m)</div>
                            <div>Timestamp Match: <span className="font-semibold text-foreground">{selectedForensicCheck.timestampMatch ? "PASS" : "FAIL"}</span></div>
                            <div>On-Chain Requirement Check (Advisory): <span className="font-semibold text-foreground">{selectedForensicCheck.chainMatch ? "PASS" : "WARN"}</span> ({selectedForensicCheck.chainReference})</div>
                            {selectedForensicCheck.notes.length > 0 && (
                              <div className="pt-1 text-[10px] text-muted-foreground">{selectedForensicCheck.notes.join(" • ")}</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-[11px] text-muted-foreground">Run forensic validation first before approval or AOM issuance.</div>
                        )}

                        <button
                          onClick={() => void handleRunForensicValidation(selectedMilestone)}
                          disabled={isProcessing}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-border rounded text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {isProcessing ? <><Loader2 className="w-3 h-3 animate-spin"/> Validating...</> : <><Shield className="w-3 h-3" /> Run Forensic Validation</>}
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5">COA Remarks <span className="text-primary">*</span></label>
                        <textarea className="w-full min-h-[64px] px-2.5 py-2 text-xs border border-border bg-background text-foreground placeholder:text-muted-foreground rounded focus:outline-none focus:border-primary" placeholder="Document forensic findings, GPS alignment, device consistency..." value={coaRemarks} onChange={(e) => setCoaRemarks(e.target.value)} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {!selectedForensicCheck
                          ? "Approval gate locked: forensic validation not yet triggered."
                          : !selectedForensicCheck.metadataMatch
                            ? "Approval gate locked: metadata mismatch detected. Issue AOM with findings."
                            : !coaRemarks.trim()
                              ? "Approval gate locked: auditor remark is required."
                              : "Triple-lock ready: metadata match + remark complete. MetaMask signature will finalize approval."}
                      </p>
                      <div className="flex gap-3">
                        <button onClick={() => handleConfirmForensicIntegrity(selectedMilestone)} disabled={isProcessing || !tripleLockReady} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                          {isProcessing ? <><Loader2 className="w-3 h-3 animate-spin"/> Signing...</> : <><ShieldCheck className="w-3 h-3"/> Approve (Triple-Lock)</>}
                        </button>
                        <button onClick={() => onSuspendClick(selectedMilestone)} disabled={isProcessing || !selectedForensicCheck} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border border-primary text-primary rounded hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                          <PauseCircle className="w-3 h-3" /> Suspend Milestone (AOM)
                        </button>
                      </div>
                    </>
                  )}
                  {lastSignResult && (
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-primary">
                      <Shield className="w-3 h-3" /><span className="font-semibold">Signed on-chain</span>
                      <a href={lastSignResult.etherscanUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-primary/80">Etherscan <ExternalLink className="w-2.5 h-2.5" /></a>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

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
              <p className="text-xs font-semibold text-foreground truncate">{previewPhoto.name}</p>
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
                alt={previewPhoto.name}
                className="max-w-full max-h-[76vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}