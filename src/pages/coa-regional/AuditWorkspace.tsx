import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ShieldCheck, MapPin } from "lucide-react";
import { SummaryBar, StatItem, CollapsibleSection } from "@/components/ui/collapsible-section";
import { PaginationControls } from "@/components/ui";
import { AdvancedFilterBar } from "@/components/features/coa";
import { AuditLogTable } from "@/components/features/coa";
import { ProjectList } from "./ProjectList";
import { ProjectDetail } from "./ProjectDetail";
import { ProjectAuditSummary } from "./ProjectAuditSummary";

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

interface AuditLogRow {
  id: string;
  event: string;
  actor: string;
  actorRole: string;
  date: string;
  hash: string;
  amount: number;
  description: string;
  projectName: string;
  municipality?: string;
  barangay?: string;
  source: "blockchain" | "audit";
}

interface AuditInboxProps {
  mainTab: "pending" | "history" | "audit-log";
  assignedRegion: string;
  regionScopedProjects: Project[];
  pendingAuditProjectIds: Set<string>;
  auditedProjectIds: Set<string>;
  pendingPriorityByProjectId: Record<string, number>;
  registryTraceByProjectId: Record<string, ProjectRegistryTrace>;
  regionalAuditLogs: AuditLogRow[];
  pendingQuickViewByProjectId?: Record<string, unknown>;
  regionalIntegritySnapshot?: unknown;
  regionalDisbursementTrendData?: unknown[];
  auditDecisionFunnelData?: unknown[];
  recentRegionalAuditActivity?: unknown[];
  milestoneBudgetProjectionById?: Record<string, unknown>;
  technicalVerifiedMilestoneIds?: Set<string>;
  engineerSignedMilestoneIds?: Set<string>;
  milestones: Milestone[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedMunicipality: string;
  setSelectedMunicipality: (v: string) => void;
  selectedBarangay: string;
  setSelectedBarangay: (v: string) => void;
  municipalities: string[];
  barangays: string[];
  selectedProject: Project | null;
  setSelectedProject: (p: Project | null) => void;
  auditEntries?: any[]; // Allow undefined just in case
  // Detail props
  projectMilestones: Milestone[];
  forensicVerifiedMilestones: Set<string>;
  forensicChecks: Record<string, ForensicValidationResult>;
  suspendedMilestones: Record<string, { reason: string; issuedAt: string }>;
  coaRemarks: string;
  setCoaRemarks: (v: string) => void;
  isProcessing: boolean;
  handleRunForensicValidation: (ms: Milestone) => Promise<void> | void;
  handleConfirmForensicIntegrity: (ms: Milestone) => void;
  onSuspendClick: (ms: Milestone) => void;
  lastSignResult: SignatureGateResult | null;
}

const COA_PROJECT_PAGE_SIZE = 8;
const COA_AUDIT_LOG_PAGE_SIZE = 12;

export function AuditWorkspace({
  mainTab, assignedRegion, regionScopedProjects, pendingAuditProjectIds, auditedProjectIds, pendingPriorityByProjectId, registryTraceByProjectId, regionalAuditLogs, milestones,
  searchQuery, setSearchQuery, selectedMunicipality, setSelectedMunicipality, selectedBarangay, setSelectedBarangay,
  municipalities, barangays, selectedProject, setSelectedProject, auditEntries = [],
  projectMilestones, forensicVerifiedMilestones, forensicChecks, suspendedMilestones,
  coaRemarks, setCoaRemarks, isProcessing, handleRunForensicValidation, handleConfirmForensicIntegrity, onSuspendClick, lastSignResult
}: AuditInboxProps) {
  const [projectPage, setProjectPage] = useState(1);
  const [auditLogPage, setAuditLogPage] = useState(1);

  const filteredRegionalAuditLogs = useMemo(() => {
    return regionalAuditLogs.filter((log) => {
      const municipalityMatch =
        selectedMunicipality === "All" ||
        String(log.municipality ?? "") === selectedMunicipality;
      const barangayMatch =
        selectedBarangay === "All" ||
        String(log.barangay ?? "") === selectedBarangay;
      return municipalityMatch && barangayMatch;
    });
  }, [regionalAuditLogs, selectedMunicipality, selectedBarangay]);

  const pendingRegionalProjectCount = useMemo(
    () => regionScopedProjects.filter((project) => pendingAuditProjectIds.has(project.id)).length,
    [regionScopedProjects, pendingAuditProjectIds]
  );

  const auditedRegionalProjectCount = useMemo(
    () => regionScopedProjects.filter((project) => auditedProjectIds.has(project.id)).length,
    [regionScopedProjects, auditedProjectIds]
  );

  const regionProjectIdSet = useMemo(
    () => new Set(regionScopedProjects.map((project) => String(project.id))),
    [regionScopedProjects]
  );

  const pendingMilestoneCount = useMemo(
    () => milestones.filter((m) => regionProjectIdSet.has(String(m.projectId)) && m.status === "ENGINEER_VERIFIED").length,
    [milestones, regionProjectIdSet]
  );

  const reviewedMilestoneCount = useMemo(() => {
    const reviewedMilestoneIds = new Set<string>();

    for (const milestone of milestones) {
      if (!regionProjectIdSet.has(String(milestone.projectId))) continue;
      if (milestone.status === "COA_AUDITED" || milestone.status === "COA_REJECTED") {
        reviewedMilestoneIds.add(String(milestone.id));
      }
    }

    for (const entry of auditEntries) {
      const projectId = entry?.projectId;
      if (!projectId || !regionProjectIdSet.has(String(projectId))) continue;

      const actionType = String(entry?.actionType ?? "");
      if (actionType !== "COA_AUDITED" && actionType !== "COA_REJECTED" && actionType !== "PROJECT_SUSPENDED") continue;

      const milestoneId = entry?.milestoneId ?? entry?.referenceId ?? entry?.id;
      if (milestoneId) reviewedMilestoneIds.add(String(milestoneId));
    }

    return reviewedMilestoneIds.size;
  }, [milestones, auditEntries, regionProjectIdSet]);

  const coaAuditedMilestoneCount = useMemo(() => {
    const auditedMilestoneIds = new Set<string>();

    for (const milestone of milestones) {
      if (!regionProjectIdSet.has(String(milestone.projectId))) continue;
      if (milestone.status === "COA_AUDITED") {
        auditedMilestoneIds.add(String(milestone.id));
      }
    }

    for (const entry of auditEntries) {
      const projectId = entry?.projectId;
      if (!projectId || !regionProjectIdSet.has(String(projectId))) continue;

      const actionType = String(entry?.actionType ?? "");
      if (actionType !== "COA_AUDITED") continue;

      const milestoneId = entry?.milestoneId ?? entry?.referenceId ?? entry?.id;
      if (milestoneId) auditedMilestoneIds.add(String(milestoneId));
    }

    return auditedMilestoneIds.size;
  }, [milestones, auditEntries, regionProjectIdSet]);

  const filteredProjects = useMemo(() => {
    let base = regionScopedProjects;
    if (mainTab === "pending") {
      base = base.filter((p) => pendingAuditProjectIds.has(p.id));
    } else if (mainTab === "history") {
      base = base.filter((p) => auditedProjectIds.has(p.id));
    } else {
      base = [];
    }

    const filtered = base.filter((p) => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.location.toLowerCase().includes(q) || p.contractor.toLowerCase().includes(q);
      const matchMunicipality = selectedMunicipality === "All" || p.municipality === selectedMunicipality;
      const matchBarangay = selectedBarangay === "All" || p.barangay === selectedBarangay;
      return matchSearch && matchMunicipality && matchBarangay;
    });

    if (mainTab === "pending") {
      filtered.sort((left, right) => {
        const leftAge = pendingPriorityByProjectId[left.id] ?? Number.MAX_SAFE_INTEGER;
        const rightAge = pendingPriorityByProjectId[right.id] ?? Number.MAX_SAFE_INTEGER;
        if (leftAge !== rightAge) return leftAge - rightAge;
        return left.name.localeCompare(right.name);
      });
    } else {
      filtered.sort((left, right) => {
        const leftRegistryTime = new Date(registryTraceByProjectId[left.id]?.latestBlockTimestamp ?? 0).getTime();
        const rightRegistryTime = new Date(registryTraceByProjectId[right.id]?.latestBlockTimestamp ?? 0).getTime();
        return rightRegistryTime - leftRegistryTime;
      });
    }

    return filtered;
  }, [regionScopedProjects, searchQuery, selectedMunicipality, selectedBarangay, pendingAuditProjectIds, auditedProjectIds, mainTab, pendingPriorityByProjectId, registryTraceByProjectId]);

  const projectTotalPages = Math.max(1, Math.ceil(filteredProjects.length / COA_PROJECT_PAGE_SIZE));
  const auditLogTotalPages = Math.max(1, Math.ceil(filteredRegionalAuditLogs.length / COA_AUDIT_LOG_PAGE_SIZE));

  useEffect(() => {
    setProjectPage(1);
  }, [mainTab, searchQuery, selectedMunicipality, selectedBarangay, filteredProjects.length]);

  useEffect(() => {
    setAuditLogPage(1);
  }, [mainTab, selectedMunicipality, selectedBarangay, filteredRegionalAuditLogs.length]);

  const pagedProjects = useMemo(() => {
    const safePage = Math.min(projectPage, projectTotalPages);
    const start = (safePage - 1) * COA_PROJECT_PAGE_SIZE;
    return filteredProjects.slice(start, start + COA_PROJECT_PAGE_SIZE);
  }, [filteredProjects, projectPage, projectTotalPages]);

  const pagedRegionalAuditLogs = useMemo(() => {
    const safePage = Math.min(auditLogPage, auditLogTotalPages);
    const start = (safePage - 1) * COA_AUDIT_LOG_PAGE_SIZE;
    return filteredRegionalAuditLogs.slice(start, start + COA_AUDIT_LOG_PAGE_SIZE);
  }, [filteredRegionalAuditLogs, auditLogPage, auditLogTotalPages]);

  if (mainTab === "audit-log") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-md bg-muted/50">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] text-foreground font-medium">Region locked to: <strong>{assignedRegion}</strong></span>
          <span className="text-[11px] text-muted-foreground ml-1">— Regional audit logs only.</span>
        </div>

        <CollapsibleSection title="Audit Log Filters" defaultOpen icon={<MapPin className="w-4 h-4" />}>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={selectedMunicipality}
              onChange={(event) => {
                setSelectedMunicipality(event.target.value);
                setSelectedBarangay("All");
              }}
              className="h-8 w-full sm:w-55 px-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
            >
              {municipalities.map((municipality) => (
                <option key={municipality} value={municipality}>
                  {municipality === "All" ? "All Municipalities" : municipality}
                </option>
              ))}
            </select>

            <select
              value={selectedBarangay}
              onChange={(event) => setSelectedBarangay(event.target.value)}
              className="h-8 w-full sm:w-55 px-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
            >
              {barangays.map((barangay) => (
                <option key={barangay} value={barangay}>
                  {barangay === "All" ? "All Barangays" : `Brgy. ${barangay}`}
                </option>
              ))}
            </select>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Regional Audit Log Summary" defaultOpen icon={<ShieldCheck className="w-4 h-4" />}>
          <SummaryBar>
            <StatItem label="Regional Projects" value={regionScopedProjects.length} />
            <StatItem label="Total Log Entries" value={filteredRegionalAuditLogs.length} />
            <StatItem label="Audited Projects" value={auditedRegionalProjectCount} />
            <StatItem label="COA Audited Milestones" value={coaAuditedMilestoneCount} />
          </SummaryBar>
        </CollapsibleSection>

        <AuditLogTable logs={pagedRegionalAuditLogs} />
        <PaginationControls
          page={Math.min(auditLogPage, auditLogTotalPages)}
          totalPages={auditLogTotalPages}
          onPageChange={setAuditLogPage}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!selectedProject ? (
        <>
          <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-md bg-muted/50">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] text-foreground font-medium">Region locked to: <strong>{assignedRegion}</strong></span>
            <span className="text-[11px] text-muted-foreground ml-1">— Only projects in this region are auditable.</span>
          </div>

          <CollapsibleSection title={mainTab === "pending" ? "Pending Audits Overview" : "Audit History Overview"} defaultOpen icon={mainTab === "pending" ? <AlertCircle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}>
            <SummaryBar>
              <StatItem label="Total Regional Projects" value={regionScopedProjects.length} />
              <StatItem label={mainTab === "pending" ? "Pending Review Projects" : "Audited Projects"} value={mainTab === "pending" ? pendingRegionalProjectCount : auditedRegionalProjectCount} />
              <StatItem
                label={mainTab === "pending" ? "Milestones Awaiting" : "Milestones Reviewed by COA"}
                value={mainTab === "pending" ? pendingMilestoneCount : reviewedMilestoneCount}
              />
              <StatItem label="COA Audited Milestones" value={coaAuditedMilestoneCount} />
            </SummaryBar>
          </CollapsibleSection>

          <AdvancedFilterBar
            searchPlaceholder={mainTab === "pending" ? "Search pending projects..." : "Search audit history projects..."}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            extraFilters={(
              <>
                <select
                  value={selectedMunicipality}
                  onChange={(e) => {
                    setSelectedMunicipality(e.target.value);
                    setSelectedBarangay("All");
                  }}
                  className="h-8 w-full sm:w-55 px-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
                >
                  {municipalities.map((municipality) => (
                    <option key={municipality} value={municipality}>
                      {municipality === "All" ? "All Municipalities" : municipality}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedBarangay}
                  onChange={(e) => setSelectedBarangay(e.target.value)}
                  className="h-8 w-full sm:w-55 px-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
                >
                  {barangays.map((barangay) => (
                    <option key={barangay} value={barangay}>
                      {barangay === "All" ? "All Barangays" : `Brgy. ${barangay}`}
                    </option>
                  ))}
                </select>
              </>
            )}
          />

          <p className="text-[11px] text-muted-foreground">{filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""} for COA review</p>
          <ProjectList
            mainTab={mainTab}
            projects={pagedProjects}
            pendingAuditProjectIds={pendingAuditProjectIds}
            assignedRegion={assignedRegion}
            onSelectProject={setSelectedProject}
            traceabilityByProject={registryTraceByProjectId}
            isFiltered={!!searchQuery || selectedMunicipality !== "All" || selectedBarangay !== "All"}
            onClearFilters={() => { setSearchQuery(""); setSelectedMunicipality("All"); setSelectedBarangay("All"); }}
          />
          <PaginationControls
            page={Math.min(projectPage, projectTotalPages)}
            totalPages={projectTotalPages}
            onPageChange={setProjectPage}
          />
        </>
      ) : mainTab === "history" ? (
        <ProjectAuditSummary
          project={selectedProject}
          projectMilestones={projectMilestones}
          registryTrace={registryTraceByProjectId[selectedProject.id]}
          onGoBack={() => {
            setSelectedProject(null);
          }}
        />
      ) : (
        <ProjectDetail
           project={selectedProject}
           projectMilestones={projectMilestones}
           forensicVerifiedMilestones={forensicVerifiedMilestones}
           forensicChecks={forensicChecks}
           suspendedMilestones={suspendedMilestones}
           coaRemarks={coaRemarks}
           setCoaRemarks={setCoaRemarks}
           isProcessing={isProcessing}
           onGoBack={() => { setSelectedProject(null); setCoaRemarks(""); }}
           handleRunForensicValidation={handleRunForensicValidation}
           handleConfirmForensicIntegrity={handleConfirmForensicIntegrity}
           onSuspendClick={onSuspendClick}
           lastSignResult={lastSignResult}
        />
      )}
    </div>
  );
}
