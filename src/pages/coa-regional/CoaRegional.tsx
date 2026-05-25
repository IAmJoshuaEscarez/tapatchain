import { Button } from "@/components/ui/button";
import { AlertCircle, ShieldCheck, Wallet, Shield, PauseCircle, Link2 } from "lucide-react";
import { InsufficientGasModal } from "@/components/ui";
import { useCoaRegionalAuditorDashboard } from "@/hooks/coa/useCoaRegionalAuditorDashboard";
import { AuditWorkspace } from "./AuditWorkspace";

interface COARegionalAuditorDashboardProps {
  setCurrentPage: (page: string) => void;
}

export function COARegionalAuditorDashboard({ setCurrentPage }: COARegionalAuditorDashboardProps) {
  const {
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
    handleDisconnect,
  } = useCoaRegionalAuditorDashboard({ setCurrentPage });

  if (walletMismatch) {
    return (
      <div className="pt-20 min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 bg-card border border-destructive/30 rounded-xl space-y-4">
          <Shield className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Wallet Mismatch Detected</h2>
          <p className="text-muted-foreground text-sm">The connected MetaMask wallet does not match your COA account.</p>
          <Button onClick={handleDisconnect} variant="outline" className="border-destructive text-destructive hover:bg-destructive/10">Disconnect & Return</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 min-h-screen bg-background flex flex-col">
      <div className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-semibold text-foreground">COA Regional</h1>
              <p className="text-xs text-muted-foreground">Commission on Audit Regional Gatekeeper</p>
              <span className="mt-1.5 inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">COA | {assignedRegion}</span>
            </div>
            <button onClick={handleDisconnect} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:bg-muted transition-colors shadow-sm"><Wallet className="w-3.5 h-3.5" />Disconnect</button>
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-card overflow-x-auto shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1">
          <button onClick={() => { setMainTab("pending"); setSelectedProject(null); }} className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${mainTab === "pending" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}><AlertCircle className="w-3.5 h-3.5 inline mr-1.5" /> Pending Audits</button>
          <button onClick={() => { setMainTab("history"); setSelectedProject(null); }} className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${mainTab === "history" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}><ShieldCheck className="w-3.5 h-3.5 inline mr-1.5" /> Audit History</button>
          <button onClick={() => { setMainTab("audit-log"); setSelectedProject(null); }} className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${mainTab === "audit-log" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}><Link2 className="w-3.5 h-3.5 inline mr-1.5" /> Audit Log</button>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full">
        <AuditWorkspace 
          mainTab={mainTab} assignedRegion={assignedRegion} regionScopedProjects={regionScopedProjects}
          pendingAuditProjectIds={pendingAuditProjectIds} auditedProjectIds={auditedProjectIds}
          pendingPriorityByProjectId={pendingPriorityByProjectId}
          registryTraceByProjectId={registryTraceByProjectId}
          regionalAuditLogs={regionalAuditLogs}
          milestones={milestones}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          selectedMunicipality={selectedMunicipality} setSelectedMunicipality={setSelectedMunicipality}
          selectedBarangay={selectedBarangay} setSelectedBarangay={setSelectedBarangay}
          municipalities={municipalities} barangays={barangays}
          selectedProject={selectedProject} setSelectedProject={setSelectedProject}
          auditEntries={auditEntries}
          projectMilestones={projectMilestones} forensicVerifiedMilestones={forensicVerifiedMilestones}
          forensicChecks={forensicChecks}
          suspendedMilestones={suspendedMilestones}
          coaRemarks={coaRemarks} setCoaRemarks={setCoaRemarks} isProcessing={isProcessing}
          handleRunForensicValidation={handleRunForensicValidation}
          handleConfirmForensicIntegrity={handleConfirmForensicIntegrity}
          onSuspendClick={handleOpenSuspendModal}
          lastSignResult={lastSignResult}
        />
      </div>

      {showAomModal && aomTargetMilestone && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-md p-5 space-y-4">
            <div className="flex items-center gap-2"><PauseCircle className="w-4 h-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">Audit Observation Memorandum (AOM)</h3></div>
            <p className="text-[11px] text-muted-foreground">Suspending milestone <strong>"{aomTargetMilestone.milestoneName}"</strong>. This will freeze the milestone state on-chain and block further progress until resolved.</p>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Reason for Suspension (AOM) <span className="text-primary">*</span></label>
              <textarea className="w-full min-h-16 px-2.5 py-2 text-xs border border-border bg-background text-foreground placeholder:text-muted-foreground rounded focus:outline-none focus:border-primary" placeholder="State the audit observation and basis for suspension..." value={aomRemarks} onChange={(e) => setAomRemarks(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <button onClick={handleSuspendMilestone} disabled={!aomRemarks.trim() || isProcessing} className="flex-1 py-2 text-xs font-medium bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{isProcessing ? "Signing..." : "Confirm AOM"}</button>
              <button onClick={handleCloseSuspendModal} className="flex-1 py-2 text-xs border border-border rounded text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <InsufficientGasModal open={gasError.open} onClose={clearGasError} message={gasError.message} />
    </div>
  );
}
