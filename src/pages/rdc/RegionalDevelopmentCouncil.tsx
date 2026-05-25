// ════════════════════════════════════════════════════════════════
// RDCDashboard — "Submit Regional Proposal"
// RDC only proposes needs. They do NOT create active projects.
// Stage 1 of the Planning→Execution separation.
// Sign via MetaMask → Status = PROPOSED
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { MobileCollapse } from "@/components/ui";
import { Button } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { SummaryBar, StatItem } from "@/components/ui";
import { PaginationControls } from "@/components/ui";
import {
  CheckCircle, X, Search, AlertCircle, FileText, MapPin, Wallet,
  Upload, Shield, Trash2, Building2, ExternalLink, Loader2, Clock,
} from "lucide-react";
import { REQUIRED_PROPOSAL_DOCUMENTS } from "@/context/ProjectContext";
import { InsufficientGasModal } from "@/components/ui";
import { useRdcDashboard } from "@/hooks/rdc/useRdcDashboard";

interface RDCDashboardProps {
  setCurrentPage: (page: string) => void;
}

const RDC_PROPOSAL_PAGE_SIZE = 6;

export function RDCDashboard({ setCurrentPage }: RDCDashboardProps) {
  const {
    walletAddress,
    gasError,
    clearGasError,
    profile,
    activeTab,
    setActiveTab,
    notification,
    clearNotification,
    isSigning,
    lastSignResult,
    proposalForm,
    proposalDocs,
    priorityLevels,
    infrastructureTypes,
    myRegionName,
    walletMismatch,
    myProposals,
    searchQuery,
    setSearchQuery,
    municipalityFilter,
    setMunicipalityFilter,
    municipalities,
    filteredProposals,
    formatFileSize,
    handleDocumentUpload,
    handleRemoveDocument,
    areAllDocsUploaded,
    handleProposalInputChange,
    isProposalFormValid,
    handleSubmitProposal,
    handleDisconnect,
  } = useRdcDashboard({ setCurrentPage });

  const [proposalPage, setProposalPage] = useState(1);
  const proposalTotalPages = Math.max(1, Math.ceil(filteredProposals.length / RDC_PROPOSAL_PAGE_SIZE));

  useEffect(() => {
    setProposalPage(1);
  }, [searchQuery, municipalityFilter, filteredProposals.length]);

  const pagedProposals = useMemo(() => {
    const safePage = Math.min(proposalPage, proposalTotalPages);
    const start = (safePage - 1) * RDC_PROPOSAL_PAGE_SIZE;
    return filteredProposals.slice(start, start + RDC_PROPOSAL_PAGE_SIZE);
  }, [filteredProposals, proposalPage, proposalTotalPages]);

  // ── Status display helpers ──
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PROPOSED":
      case "PROPOSAL_SUBMITTED":
        return { label: "Proposed — Awaiting National", cls: "bg-primary/10 text-primary ring-1 ring-primary/20", icon: <Clock className="w-3 h-3" /> };
      case "FUNDED":
      case "FUNDED_AND_ACTIVE":
        return { label: "Funded by National", cls: "bg-primary/10 text-primary ring-1 ring-primary/20", icon: <CheckCircle className="w-3 h-3" /> };
      case "ONGOING":
      case "PERSONNEL_ASSIGNED":
        return { label: "Ongoing — RD Implementing", cls: "bg-primary/10 text-primary ring-1 ring-primary/20", icon: <CheckCircle className="w-3 h-3" /> };
      case "REJECTED":
      case "PROPOSAL_REJECTED":
        return { label: "Rejected", cls: "bg-muted text-muted-foreground ring-1 ring-border", icon: <X className="w-3 h-3" /> };
      default:
        return { label: status, cls: "bg-muted text-muted-foreground ring-1 ring-border", icon: null };
    }
  };

  // ── Wallet-Region Gate ──
  if (walletMismatch) {
    return (
      <div className="pt-20 min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 bg-card border border-destructive/30 rounded-xl space-y-4">
          <Shield className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Wallet Mismatch Detected</h2>
          <p className="text-muted-foreground text-sm">
            The connected MetaMask wallet does not match the authorized wallet for <span className="font-semibold text-foreground">{myRegionName}</span>.
          </p>
          <p className="text-xs text-muted-foreground">
            Connected: <code className="text-destructive">{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</code><br />
            Authorized: <code className="text-primary">{profile?.walletAddress?.slice(0, 6)}...{profile?.walletAddress?.slice(-4)}</code>
          </p>
          <Button
            onClick={handleDisconnect}
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
    <>
    <div className="pt-20 min-h-screen bg-background">
      {/* Floating Notification */}
      {notification.show && (
        <div className="fixed top-24 right-6 z-50 animate-in slide-in-from-right fade-in duration-300">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-lg border ${
            notification.type === "success"
              ? "bg-card border-primary/30 text-foreground"
              : notification.type === "warning"
              ? "bg-card border-primary/30 text-foreground"
              : "bg-card border-border text-foreground"
          }`}>
            {notification.type === "success" ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-sm font-medium">{notification.message}</span>
            <button onClick={clearNotification} className="ml-2 opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header — Region Locked */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground">Regional Development Council</h1>
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="w-3 h-3 text-primary" />
                  <span className="font-semibold text-foreground">{myRegionName || "Loading..."}</span>
                </span>
                {walletAddress && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Wallet className="w-3 h-3" />
                    <code className="font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</code>
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary border border-primary/20">
                  <Shield className="w-2.5 h-2.5" /> Region Locked
                </span>
              </div>
            </div>
            <Button
              onClick={handleDisconnect}
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground text-xs h-8"
            >
              Disconnect
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {/* Stats Summary Bar */}
        <SummaryBar>
          <StatItem label="My Proposals" value={myProposals.length} />
          <StatItem label="Proposed" value={myProposals.filter(p => p.status === "PROPOSED" || p.status === "PROPOSAL_SUBMITTED").length} />
          <StatItem label="Funded" value={myProposals.filter(p => p.status === "FUNDED" || p.status === "FUNDED_AND_ACTIVE").length} />
          <StatItem label="Ongoing" value={myProposals.filter(p => p.status === "ONGOING" || p.status === "PERSONNEL_ASSIGNED").length} />
        </SummaryBar>

        {/* Tab Navigation */}
        <div className="flex gap-3 border-b border-border pb-1 overflow-x-auto">
          {[
            { id: "submit", label: "Submit Proposal" },
            { id: "proposals", label: `My Proposals (${myProposals.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "submit" | "proposals")}
              className={`px-4 py-2 text-sm font-medium transition-all rounded-t-lg whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ Submit Proposal Tab ═══ */}
        {activeTab === "submit" && (
          <Card>
            <CardHeader className="border-b border-border py-5 px-6">
              <CardTitle className="text-foreground text-base">New Regional Infrastructure Proposal</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Propose regional infrastructure needs. National will review, set the final budget, and fund if approved.
              </p>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                {/* Workflow Steps */}
                <div className="flex flex-wrap items-center gap-1.5 p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs">
                  <span className="font-semibold text-primary">Workflow:</span>
                  <span className="px-2 py-0.5 bg-primary text-primary-foreground rounded font-medium">1. RDC Proposes</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded">2. National Funds</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded">3. RD Contracts</span>
                </div>

                {/* Proposal Title */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Proposal Title *</label>
                  <input
                    type="text"
                    name="title"
                    value={proposalForm.title}
                    onChange={handleProposalInputChange}
                    placeholder="e.g., Davao City Coastal Road Widening Project"
                    className="w-full px-4 py-3 border border-border bg-card text-foreground placeholder:text-muted-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>

                {/* Infrastructure Type & Priority */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Infrastructure Type *</label>
                    <select
                      name="projectType"
                      value={proposalForm.projectType}
                      onChange={handleProposalInputChange}
                      className="w-full px-4 py-3 pr-10 border border-border bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3e%3cpolyline points=%276 9 12 15 18 9%27%3e%3c/polyline%3e%3c/svg%3e')] bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat"
                    >
                      <option value="">Select type...</option>
                      {infrastructureTypes.map((type) => (
                        <option key={type.id} value={type.name}>{type.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Priority Level *</label>
                    <select
                      name="priorityLevel"
                      value={proposalForm.priorityLevel}
                      onChange={handleProposalInputChange}
                      className="w-full px-4 py-3 pr-10 border border-border bg-card text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2371717a%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3e%3cpolyline points=%276 9 12 15 18 9%27%3e%3c/polyline%3e%3c/svg%3e')] bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat"
                    >
                      {priorityLevels.map((lvl) => (
                        <option key={lvl} value={lvl}>{lvl}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Location */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Province</label>
                    <input
                      type="text"
                      name="province"
                      value={proposalForm.province}
                      onChange={handleProposalInputChange}
                      placeholder="e.g., Davao del Sur"
                      className="w-full px-4 py-3 border border-border bg-card text-foreground placeholder:text-muted-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Municipality / City *</label>
                    <input
                      type="text"
                      name="municipality"
                      value={proposalForm.municipality}
                      onChange={handleProposalInputChange}
                      placeholder="e.g., Davao City"
                      className="w-full px-4 py-3 border border-border bg-card text-foreground placeholder:text-muted-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Must be within {myRegionName || "your region"}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Barangay</label>
                    <input
                      type="text"
                      name="barangay"
                      value={proposalForm.barangay}
                      onChange={handleProposalInputChange}
                      placeholder="e.g., Sasa"
                      className="w-full px-4 py-3 border border-border bg-card text-foreground placeholder:text-muted-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>
                </div>

                {/* Estimated Cost & Target Duration */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Estimated Cost (PHP) *</label>
                    <input
                      type="text"
                      name="estimatedBudget"
                      value={proposalForm.estimatedBudget}
                      onChange={handleProposalInputChange}
                      placeholder="e.g., 250,000,000.00"
                      className="w-full px-4 py-3 border border-border bg-card text-foreground placeholder:text-muted-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">This is an estimate. National will set the final approved budget.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">Target Duration *</label>
                    <input
                      type="text"
                      name="targetDuration"
                      value={proposalForm.targetDuration}
                      onChange={handleProposalInputChange}
                      placeholder="e.g., 6 months or 180 days"
                      className="w-full px-4 py-3 border border-border bg-card text-foreground placeholder:text-muted-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">RDC proposes the timeline. RD will set the binding contract dates later.</p>
                  </div>
                </div>

                {/* Description & Justification */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Project Description & Justification *</label>
                  <textarea
                    name="justification"
                    value={proposalForm.justification}
                    onChange={handleProposalInputChange}
                    placeholder="Describe the infrastructure need, expected impact, beneficiaries, and why this project is a regional priority..."
                    rows={4}
                    className="w-full px-4 py-3 border border-border bg-card text-foreground placeholder:text-muted-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                  />
                </div>

                {/* Required Documents */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-0.5">Required Documents *</label>
                    <p className="text-xs text-muted-foreground">
                      All three documents must be uploaded. SHA-256 hash fingerprints will be stored on-chain.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {REQUIRED_PROPOSAL_DOCUMENTS.map((reqDoc) => {
                      const uploaded = proposalDocs[reqDoc.key];
                      return (
                        <div
                          key={reqDoc.key}
                          className={`rounded-lg border p-3 transition-colors ${
                            uploaded ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                {uploaded ? <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/40 shrink-0" />}
                                <span className="text-xs font-semibold text-foreground">{reqDoc.name}</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground pl-5">{reqDoc.description}</p>
                              {uploaded && (
                                <div className="mt-2 pl-5 space-y-1">
                                  <div className="flex items-center gap-2 text-[11px] text-foreground">
                                    <FileText className="w-3 h-3 text-primary shrink-0" />
                                    <span className="font-medium truncate">{uploaded.fileName}</span>
                                    <span className="text-muted-foreground shrink-0">({formatFileSize(uploaded.fileSize)})</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <Shield className="w-3 h-3 text-primary shrink-0" />
                                    <span className="font-mono text-[10px] truncate">{uploaded.hash.substring(0, 40)}...</span>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {uploaded && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDocument(reqDoc.key)}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <label className="cursor-pointer">
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".pdf,.doc,.docx,.xlsx,.png,.jpg"
                                  onChange={(e) => handleDocumentUpload(reqDoc.key, reqDoc.name, e)}
                                />
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
                                  uploaded
                                    ? "border-primary/40 text-primary bg-primary/5 hover:bg-primary/10"
                                    : "border-border text-foreground bg-card hover:bg-muted"
                                }`}>
                                  <Upload className="w-3 h-3" />
                                  {uploaded ? "Re-upload" : "Upload"}
                                </span>
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {!areAllDocsUploaded && (
                    <p className="text-xs text-primary flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Upload all 3 required documents to submit this proposal.
                    </p>
                  )}
                </div>

                {/* Last sign result */}
                {lastSignResult && (
                  <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-center gap-3">
                    <Shield className="w-4 h-4 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">Proposal signed on-chain</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">TX: {lastSignResult.txHash}</p>
                    </div>
                    <a href={lastSignResult.etherscanUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary font-medium hover:underline flex-shrink-0">
                      Etherscan <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Submit Button */}
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={handleSubmitProposal}
                    disabled={!isProposalFormValid || isSigning}
                    className="w-full py-5 text-sm font-semibold bg-primary hover:bg-accent disabled:bg-muted disabled:text-muted-foreground text-primary-foreground gap-2"
                  >
                    {isSigning ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Signing on MetaMask...</>
                    ) : (
                      <><Shield className="w-4 h-4" /> Sign &amp; Submit Proposal to National</>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ═══ My Proposals Tab ═══ */}
        {activeTab === "proposals" && (
          <div className="space-y-4">
            {myProposals.length === 0 ? (
              <Card className="p-8 sm:p-16 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">No Proposals Yet</h3>
                <p className="text-sm text-muted-foreground mb-6">Submit your first regional infrastructure proposal to get started.</p>
                <Button onClick={() => setActiveTab("submit")} className="bg-primary hover:bg-accent text-primary-foreground">
                  Submit Proposal
                </Button>
              </Card>
            ) : (
              <>
                {/* Search & Filter */}
                <MobileCollapse title="Search & Filters">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search title, municipality, type..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-border bg-background text-foreground placeholder:text-muted-foreground rounded-md focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div className="relative">
                      <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <select
                        value={municipalityFilter}
                        onChange={e => setMunicipalityFilter(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
                      >
                        {municipalities.map(m => <option key={m} value={m} className="bg-background text-foreground">{m === "All" ? "All Municipalities" : m}</option>)}
                      </select>
                    </div>
                  </div>
                </MobileCollapse>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {filteredProposals.length} of {myProposals.length} proposal{myProposals.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {pagedProposals.map((proposal) => {
                  const badge = getStatusBadge(proposal.status);
                  return (
                    <Card key={proposal.id} className="border border-border hover:shadow-sm transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {proposal.id}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                              {badge.icon} {badge.label}
                            </span>
                          </div>
                        </div>

                        <h3 className="text-sm font-bold text-foreground mb-2">{proposal.title}</h3>
                        <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
                          <div><span className="font-medium text-foreground">Type:</span> {proposal.projectType}</div>
                          <div><span className="font-medium text-foreground">Est. Budget:</span> {proposal.approvedBudget}</div>
                          <div><span className="font-medium text-foreground">Location:</span> {proposal.municipality}{proposal.province ? `, ${proposal.province}` : ""}</div>
                          <div><span className="font-medium text-foreground">Priority:</span> {proposal.priorityLevel}</div>
                          {proposal.targetDuration && (
                            <div><span className="font-medium text-foreground">Target Duration:</span> {proposal.targetDuration}</div>
                          )}
                          <div><span className="font-medium text-foreground">Submitted:</span> {proposal.createdAt}</div>
                        </div>

                        {/* Funded info */}
                        {(proposal.status === "FUNDED" || proposal.status === "FUNDED_AND_ACTIVE") && (
                          <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs">
                            <p className="font-semibold text-primary mb-0.5">✓ Funded by National</p>
                            {proposal.finalApprovedBudget && (
                              <p className="text-foreground">Final Budget: <span className="font-bold">{proposal.finalApprovedBudget}</span></p>
                            )}
                            {proposal.gaaReference && (
                              <p className="text-muted-foreground">GAA Ref: {proposal.gaaReference}</p>
                            )}
                            {proposal.nationalApprovedBy && (
                              <p className="text-muted-foreground">By: {proposal.nationalApprovedBy} on {proposal.nationalApprovedDate}</p>
                            )}
                          </div>
                        )}

                        {/* Ongoing info */}
                        {(proposal.status === "ONGOING" || proposal.status === "PERSONNEL_ASSIGNED") && (
                          <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs">
                            <p className="font-semibold text-primary mb-0.5">✓ Implementation Ongoing</p>
                            {proposal.contractorName && <p className="text-muted-foreground">Contractor: {proposal.contractorName}</p>}
                            {proposal.contractStartDate && proposal.contractEndDate && (
                              <p className="text-muted-foreground">Contract: {proposal.contractStartDate} to {proposal.contractEndDate}</p>
                            )}
                          </div>
                        )}

                        {/* Rejected info */}
                        {(proposal.status === "REJECTED" || proposal.status === "PROPOSAL_REJECTED") && (
                          <div className="mt-3 p-3 bg-muted border border-border rounded-lg text-xs">
                            <p className="font-semibold text-foreground mb-0.5">Rejected</p>
                            {proposal.proposalRejectedReason && (
                              <p className="text-muted-foreground">Reason: {proposal.proposalRejectedReason}</p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {filteredProposals.length > 0 && (
                  <PaginationControls
                    page={Math.min(proposalPage, proposalTotalPages)}
                    totalPages={proposalTotalPages}
                    onPageChange={setProposalPage}
                    className="pt-1"
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>

    {/* ── Insufficient Gas Modal ── */}
    <InsufficientGasModal open={gasError.open} onClose={clearGasError} message={gasError.message} />
  </>
  );
}
