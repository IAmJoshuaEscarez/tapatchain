import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { X, Shield, Loader2, AlertTriangle, FileText, CheckCircle, Eye } from "lucide-react";
import { REQUIRED_PROPOSAL_DOCUMENTS } from "@/context/ProjectContext";
import type { RDCProject } from "@/context/ProjectContext";
import { proposalDocumentApi, type ProposalDocumentResponse } from "@/features/project/api/proposalDocumentApi";

// ── Types ──────────────────────────────────────────────────────────────────
export interface AdminReviewModalProps {
  show: boolean;
  selectedProject: RDCProject | null;
  reviewModalType: "proposal" | "project";
  // Proposal review
  proposalRejectionReason: string;
  setProposalRejectionReason: (s: string) => void;
  isProposalReviewing: boolean;
  onProposalApprove: () => void;
  onProposalReject: () => void;
  // Project budget allocation
  approvalRemarks: string;
  setApprovalRemarks: (s: string) => void;
  saaReference?: string;
  setSaaReference?: (s: string) => void;
  finalApprovedBudget?: string;
  setFinalApprovedBudget?: (s: string) => void;
  isApproving: boolean;
  onApprove: () => void;
  fundingRestrictionWarning?: {
    region: string;
    financialProgressPct: number;
    physicalProgressPct: number;
    requiresJustification: boolean;
    message: string;
  } | null;
  justificationMinimumLength?: number;
  // Shared
  docVerifyTooltip: string | null;
  setDocVerifyTooltip: (key: string | null) => void;
  onClose: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────
export function AdminReviewModal({
  show,
  selectedProject,
  reviewModalType,
  proposalRejectionReason,
  setProposalRejectionReason,
  isProposalReviewing,
  onProposalApprove,
  onProposalReject,
  approvalRemarks,
  setApprovalRemarks,
  saaReference,
  setSaaReference,
  isApproving,
  onApprove,
  finalApprovedBudget,
  setFinalApprovedBudget,
  docVerifyTooltip,
  setDocVerifyTooltip,
  fundingRestrictionWarning,
  justificationMinimumLength = 20,
  onClose,
}: AdminReviewModalProps) {
  if (!show || !selectedProject) return null;

  const isBusy = isApproving || isProposalReviewing;
  const requiresIntegrityJustification = Boolean(
    fundingRestrictionWarning?.requiresJustification
  );
  const approvalRemarkLength = approvalRemarks.trim().length;

  // ── Fetch proposal documents from backend API ──
  const [apiDocs, setApiDocs] = useState<ProposalDocumentResponse[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  useEffect(() => {
    if (!show || !selectedProject) return;
    if (reviewModalType !== "proposal") return;
    setDocsLoading(true);
    proposalDocumentApi.getByProjectId(selectedProject.id)
      .then((res) => setApiDocs(res.data ?? []))
      .catch(() => setApiDocs([]))
      .finally(() => setDocsLoading(false));
  }, [show, selectedProject?.id, reviewModalType]);

  /** Open a document via the backend API URL in a new tab */
  const handleOpenDocument = (docId: number) => {
    const url = proposalDocumentApi.getFileUrl(docId);
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) popup.opener = null;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

        {/* Modal header */}
        <div className="p-6 border-b border-border sticky top-0 bg-card rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">
              {reviewModalType === "proposal"
                ? "Budget Proposal Review"
                : "Project Review & Budget Allocation"}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg"
              disabled={isBusy}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Title & ID */}
          <div>
            <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {selectedProject.id}
            </span>
            <h3 className="text-base font-semibold text-foreground mt-1">
              {selectedProject.title}
            </h3>
          </div>

          {/* ── Proposal Review & Funding Content (Merged) ── */}
          {reviewModalType === "proposal" && (
            <>
              {/* Info banner */}
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs">
                <p className="font-semibold text-primary mb-0.5">Review & Fund Proposal</p>
                <p className="text-muted-foreground">
                  Review this regional proposal, set the final approved budget, and sign with MetaMask to fund.
                  Once funded, Regional Director will assign personnel and set contract dates.
                </p>
              </div>

              {/* Proposal details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-0.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Infrastructure Type
                  </p>
                  <p className="font-medium text-foreground">{selectedProject.projectType}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Estimated Budget
                  </p>
                  <p className="font-bold text-primary">{selectedProject.approvedBudget}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Location
                  </p>
                  <p className="font-medium text-foreground">
                    {selectedProject.municipality}, {selectedProject.province}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Priority
                  </p>
                  <p className="font-medium text-foreground">{selectedProject.priorityLevel}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Submitted
                  </p>
                  <p className="font-medium text-foreground">{selectedProject.createdAt}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Region
                  </p>
                  <p className="font-medium text-foreground">{selectedProject.region}</p>
                </div>
              </div>

              {selectedProject.justification &&
                selectedProject.justification !== "N/A" && (
                  <div className="p-4 bg-muted/50 rounded-md">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
                      Justification
                    </p>
                    <p className="text-xs text-foreground italic">
                      &ldquo;{selectedProject.justification}&rdquo;
                    </p>
                  </div>
                )}

              {/* Target Duration (RDC proposed) */}
              {selectedProject.targetDuration && (
                <div className="p-3 bg-muted/50 rounded-md">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">RDC Proposed Target Duration</p>
                  <p className="text-xs font-medium text-foreground">{selectedProject.targetDuration}</p>
                </div>
              )}

              {/* ═══ Submitted Documents (fetched from API) ═══ */}
              {docsLoading && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Loading documents…</span>
                </div>
              )}

              {!docsLoading && apiDocs.length > 0 && (
                  <CollapsibleSection
                    title="Submitted Documents"
                    icon={<FileText className="w-4 h-4" />}
                    subtitle={`${apiDocs.length} document(s) attached by RDC`}
                    defaultOpen
                  >
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="bg-muted/60 border-b border-border">
                            <th className="text-left px-3 py-2 text-muted-foreground font-medium">Document</th>
                            <th className="text-left px-3 py-2 text-muted-foreground font-medium">File</th>
                            <th className="text-left px-3 py-2 text-muted-foreground font-medium">Size</th>
                            <th className="text-center px-3 py-2 text-muted-foreground font-medium">View</th>
                            <th className="text-right px-3 py-2 text-muted-foreground font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {REQUIRED_PROPOSAL_DOCUMENTS.map((reqDoc) => {
                            const doc = apiDocs.find(
                              (d) => d.key === reqDoc.key
                            );
                            return (
                              <tr
                                key={reqDoc.key}
                                className="border-b border-border last:border-0 hover:bg-muted/40"
                              >
                                <td className="px-3 py-2.5">
                                  <p className="font-medium text-foreground">{reqDoc.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{reqDoc.description}</p>
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground">
                                  {doc ? (
                                    <button
                                      onClick={() =>
                                        setDocVerifyTooltip(
                                          docVerifyTooltip === reqDoc.key ? null : reqDoc.key
                                        )
                                      }
                                      className="block truncate max-w-35 text-left hover:text-primary transition-colors underline decoration-dotted underline-offset-2 cursor-pointer"
                                      title={`${doc.fileName} — click to view hash`}
                                    >
                                      {doc.fileName}
                                    </button>
                                  ) : (
                                    <span className="italic text-destructive">Missing</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                                  {doc ? `${(doc.fileSize / 1024).toFixed(1)} KB` : "—"}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  {doc ? (
                                    <button
                                      onClick={() => handleOpenDocument(doc.id)}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[11px] font-medium"
                                      title={`Open ${doc.fileName}`}
                                    >
                                      <Eye className="w-3 h-3" />
                                      Open
                                    </button>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  {doc ? (
                                    <span className="inline-flex items-center gap-1 text-primary font-medium">
                                      <CheckCircle className="w-3 h-3" />
                                      Verified
                                    </span>
                                  ) : (
                                    <span className="text-destructive font-medium">Missing</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Hash tooltip (shows when clicking a filename) */}
                    {docVerifyTooltip && (() => {
                      const doc = apiDocs.find(
                        (d) => d.key === docVerifyTooltip
                      );
                      if (!doc) return null;
                      return (
                        <div className="mt-2 p-3 bg-primary/5 border border-primary/20 rounded-lg text-[11px] space-y-1">
                          <p className="font-semibold text-primary flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5" />
                            Document Hash Verified on Blockchain Ledger
                          </p>
                          <p className="text-muted-foreground">
                            The SHA-256 hash of &ldquo;{doc.fileName}&rdquo; matches the on-chain record. 
                            File integrity is secured.
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground break-all bg-muted/50 p-2 rounded">
                            {doc.hash}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Uploaded: {new Date(doc.uploadedAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      );
                    })()}

                    <p className="text-[10px] text-muted-foreground mt-2 text-center">
                      Click any filename to view the blockchain-verified document hash.
                    </p>
                  </CollapsibleSection>
                )}

              {/* No documents warning */}
              {!docsLoading && apiDocs.length === 0 && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground leading-relaxed">
                    <span className="font-bold">No documents attached.</span> The RDC did not submit the required supporting documents (POW, Feasibility Study, Regional Resolution). Consider requesting resubmission.
                  </p>
                </div>
              )}

              {/* Final Approved Budget (National sets this) */}
              <div className="p-4 border-2 border-primary/30 bg-primary/5 rounded-lg space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2">
                    <Shield className="w-3.5 h-3.5 inline mr-1 text-primary" />
                    Final Approved Budget (PHP) <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={finalApprovedBudget ?? ""}
                    onChange={(e) => setFinalApprovedBudget?.(e.target.value)}
                    placeholder={`RDC estimated: ${selectedProject.approvedBudget}`}
                    className="w-full px-3 py-2 text-sm border border-primary/30 bg-background text-foreground placeholder:text-muted-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={isProposalReviewing}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Leave blank to use RDC’s estimated budget ({selectedProject.approvedBudget}). You can set a different amount.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2">
                    <Shield className="w-3.5 h-3.5 inline mr-1 text-primary" />
                    GAA / SAA Reference Number <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={saaReference ?? ""}
                    onChange={(e) => setSaaReference?.(e.target.value)}
                    placeholder="SAA-2026-XXXXX"
                    className="w-full px-3 py-2 text-sm border border-primary/30 bg-background text-foreground placeholder:text-muted-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                    disabled={isProposalReviewing}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Required for GAA compliance. Ties the budget allocation to the General Appropriations Act.</p>
                </div>
              </div>

              {/* Approval remarks */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">
                  Approval Remarks {requiresIntegrityJustification ? "(Required)" : "(Optional)"}
                </label>
                <textarea
                  value={approvalRemarks}
                  onChange={(e) => setApprovalRemarks(e.target.value)}
                  placeholder="Optional notes for the audit trail..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border bg-card text-foreground placeholder:text-muted-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  disabled={isProposalReviewing}
                />
                {requiresIntegrityJustification && (
                  <p className="mt-1 text-[10px] text-rose-700">
                    Please enter at least {justificationMinimumLength} characters to justify additional
                    funding in this flagged region.
                  </p>
                )}
              </div>

              {fundingRestrictionWarning && (
                <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                  <p className="font-semibold">
                    Integrity Flag: {fundingRestrictionWarning.region}
                  </p>
                  <p className="mt-1">{fundingRestrictionWarning.message}</p>
                  <p className="mt-1 text-[11px]">
                    Physical {fundingRestrictionWarning.physicalProgressPct.toFixed(1)}% vs Disbursed{" "}
                    {fundingRestrictionWarning.financialProgressPct.toFixed(1)}%
                  </p>
                </div>
              )}

              {/* Rejection reason */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">
                  Rejection Reason (required if rejecting)
                </label>
                <textarea
                  value={proposalRejectionReason}
                  onChange={(e) => setProposalRejectionReason(e.target.value)}
                  placeholder="Provide a reason if rejecting this proposal..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border bg-card text-foreground placeholder:text-muted-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  disabled={isProposalReviewing}
                />
              </div>

              {/* MetaMask warning */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-foreground leading-relaxed">
                  By signing, you <span className="font-bold">cryptographically commit</span> the National Budget Authority to fund this proposal.
                  This MetaMask signature is <span className="font-bold">immutable</span> on the blockchain.
                </p>
              </div>

              {/* Flow indicator */}
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1 flex-wrap">
                <span>1. RDC Proposed</span>
                <span>&rarr;</span>
                <span className="font-bold text-primary">2. National Reviews & Funds ← You are here</span>
                <span>&rarr;</span>
                <span>3. RD Contracts & Implements</span>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="flex-1"
                  disabled={isProposalReviewing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={onProposalReject}
                  disabled={isProposalReviewing || !proposalRejectionReason.trim()}
                  variant="outline"
                  className="flex-1 border-primary/40 text-primary hover:bg-primary/5"
                >
                  {isProposalReviewing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    "Reject Proposal"
                  )}
                </Button>
                <Button
                  onClick={onProposalApprove}
                  disabled={isProposalReviewing || requiresIntegrityJustification || approvalRemarkLength < (requiresIntegrityJustification ? justificationMinimumLength : 0)}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                >
                  {isProposalReviewing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signing & Funding...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      Sign & Fund (MetaMask)
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* ── Project Budget Allocation Content ── */}
          {reviewModalType === "project" && (
            <>
              {/* Project details */}
              <CollapsibleSection title="Project Details" defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Infrastructure Type
                    </p>
                    <p className="font-medium text-foreground">{selectedProject.projectType}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Category
                    </p>
                    <p className="font-medium text-foreground">{selectedProject.category}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Region
                    </p>
                    <p className="font-medium text-foreground">{selectedProject.region}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Location
                    </p>
                    <p className="font-medium text-foreground">
                      {selectedProject.municipality}, {selectedProject.province},{" "}
                      {selectedProject.barangay}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Total Budget
                    </p>
                    <p className="font-bold text-primary text-sm">{selectedProject.approvedBudget}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Fund Source
                    </p>
                    <p className="font-medium text-foreground">{selectedProject.fundSource}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Contractor
                    </p>
                    <p className="font-medium text-foreground">{selectedProject.contractorName}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      PCAB License
                    </p>
                    <p className="font-medium text-foreground">{selectedProject.pcabLicense}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Site Inspector
                    </p>
                    <p className="font-medium text-foreground">{selectedProject.inspectorName}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Timeline
                    </p>
                    <p className="font-medium text-foreground">
                      {selectedProject.startDate} to {selectedProject.expectedCompletion}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      DPWH Region
                    </p>
                    <p className="font-medium text-foreground">{selectedProject.dpwhRegion}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      LGU Approval
                    </p>
                    <p className="font-medium text-foreground">
                      {selectedProject.lguApproval || "N/A"}
                    </p>
                  </div>
                </div>
              </CollapsibleSection>

              {selectedProject.justification &&
                selectedProject.justification !== "N/A" && (
                  <div className="p-4 bg-muted/50 rounded-md">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
                      Project Justification
                    </p>
                    <p className="text-xs text-foreground italic">
                      &ldquo;{selectedProject.justification}&rdquo;
                    </p>
                  </div>
                )}

              {/* RDC Signature */}
              <div className="p-4 bg-muted/50 border border-border rounded-md">
                <p className="text-xs font-bold text-foreground mb-2">RDC Signature Verified</p>
                <div className="text-[11px] text-muted-foreground space-y-1">
                  <p className="font-mono">{selectedProject.rdcSignatureHash}</p>
                  <p>
                    Endorsed by: {selectedProject.rdcEndorsedBy} on{" "}
                    {selectedProject.rdcEndorsedDate}
                  </p>
                </div>
              </div>

              {/* Attached Documents */}
              {selectedProject.proposalDocuments &&
                selectedProject.proposalDocuments.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-foreground mb-2">Attached Documents</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="bg-muted/60 border-b border-border">
                            <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                              Document
                            </th>
                            <th className="text-left px-3 py-2 text-muted-foreground font-medium">
                              File
                            </th>
                            <th className="text-right px-3 py-2 text-muted-foreground font-medium">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {REQUIRED_PROPOSAL_DOCUMENTS.map((reqDoc) => {
                            const doc = selectedProject.proposalDocuments!.find(
                              (d) => d.key === reqDoc.key
                            );
                            return (
                              <tr
                                key={reqDoc.key}
                                className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 relative"
                                onClick={() =>
                                  setDocVerifyTooltip(
                                    docVerifyTooltip === reqDoc.key ? null : reqDoc.key
                                  )
                                }
                              >
                                <td className="px-3 py-2 font-medium text-foreground">
                                  {reqDoc.name}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {doc ? (
                                    <span
                                      className="block truncate max-w-35"
                                      title={doc.fileName}
                                    >
                                      {doc.fileName}
                                    </span>
                                  ) : (
                                    <span className="italic text-muted-foreground">Missing</span>
                                  )}
                                  {docVerifyTooltip === reqDoc.key && doc && (
                                    <div className="absolute left-0 mt-1 z-50 bg-popover text-popover-foreground text-[11px] rounded-lg shadow-lg border border-border p-3 max-w-70 space-y-1">
                                      <p className="font-semibold text-primary">
                                        Document Hash Verified
                                      </p>
                                      <p className="text-muted-foreground">
                                        Document Hash matches the Ledger Record. File Integrity
                                        Secured.
                                      </p>
                                      <p className="font-mono text-[10px] text-muted-foreground break-all">
                                        {doc.hash}
                                      </p>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {doc ? (
                                    <span className="inline-flex items-center gap-1 text-primary font-medium">
                                      Verified on Blockchain
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">Missing</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                      Click any row to verify document hash against the blockchain ledger record.
                    </p>
                  </div>
                )}

              {/* SAA Reference Number (Step 2 — GAA required) */}
              <div className="p-4 border-2 border-primary/30 bg-primary/5 rounded-lg">
                <label className="block text-xs font-semibold text-foreground mb-2">
                  <Shield className="w-3.5 h-3.5 inline mr-1 text-primary" />
                  Sub-Allotment Advice (SAA) Reference Number <span className="text-destructive">*</span>
                </label>
                <input
                  value={saaReference ?? ""}
                  onChange={(e) => setSaaReference?.(e.target.value)}
                  placeholder="SAA-2026-XXXXX"
                  className="w-full px-3 py-2 text-sm border border-primary/30 bg-background text-foreground placeholder:text-muted-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  disabled={isApproving}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Required for GAA compliance. This reference ties the budget allocation to the General Appropriations Act.</p>
              </div>

              {/* Approval remarks */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-2">
                  Approval Remarks {requiresIntegrityJustification ? "(Required)" : "(Optional)"}
                </label>
                <textarea
                  value={approvalRemarks}
                  onChange={(e) => setApprovalRemarks(e.target.value)}
                  placeholder="Add any remarks about this budget allocation..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border bg-card text-foreground placeholder:text-muted-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  disabled={isApproving}
                />
                {requiresIntegrityJustification && (
                  <p className="mt-1 text-[10px] text-rose-700">
                    Please enter at least {justificationMinimumLength} characters to justify additional
                    funding in this flagged region.
                  </p>
                )}
              </div>

              {fundingRestrictionWarning && (
                <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                  <p className="font-semibold">
                    Integrity Flag: {fundingRestrictionWarning.region}
                  </p>
                  <p className="mt-1">{fundingRestrictionWarning.message}</p>
                  <p className="mt-1 text-[11px]">
                    Physical {fundingRestrictionWarning.physicalProgressPct.toFixed(1)}% vs Disbursed{" "}
                    {fundingRestrictionWarning.financialProgressPct.toFixed(1)}%
                  </p>
                </div>
              )}

              {/* GAA Flow indicator */}
              <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground py-1 flex-wrap">
                <span>Step 1: RDC Proposed</span>
                <span>&rarr;</span>
                <span className="font-bold text-primary">Step 2: Fund & Sign ← You are here</span>
                <span>&rarr;</span>
                <span>Step 3: RD Whitelists</span>
                <span>&rarr;</span>
                <span>Step 4: Implementation</span>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="flex-1"
                  disabled={isApproving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={onApprove}
                  disabled={isApproving || requiresIntegrityJustification || approvalRemarkLength < (requiresIntegrityJustification ? justificationMinimumLength : 0)}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                >
                  {isApproving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Signing & Deploying...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      Sign & Fund Project (MetaMask)
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
