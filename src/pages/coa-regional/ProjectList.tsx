import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Eye, ShieldCheck, FolderOpen, ChevronDown, ChevronUp, Link2, Calendar } from "lucide-react";
import type { Project } from "@/types";

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

interface ProjectListProps {
  mainTab: "pending" | "history";
  projects: Project[];
  pendingAuditProjectIds: Set<string>;
  assignedRegion: string;
  onSelectProject: (p: Project) => void;
  traceabilityByProject: Record<string, ProjectRegistryTrace>;
  onClearFilters: () => void;
  isFiltered: boolean;
}

const fmt = formatCurrency;

const fmtTimestamp = (value?: string) => {
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

export function ProjectList({ mainTab, projects, pendingAuditProjectIds, assignedRegion, onSelectProject, traceabilityByProject, onClearFilters, isFiltered }: ProjectListProps) {
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  if (projects.length === 0) {
    return (
      <div className="border border-border rounded-md bg-card px-4 py-16 text-center">
        <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-semibold text-foreground">
          {mainTab === "pending" ? "No Projects for Review" : "No Audit History"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {mainTab === "pending" 
            ? `No pending audits in ${assignedRegion} at this time.`
            : `No audited projects in ${assignedRegion} yet.`}
        </p>
        {isFiltered && (
          <button onClick={onClearFilters} className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:bg-muted transition-colors">
            Clear Filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="border border-border rounded-md overflow-x-auto">
      <div className="min-w-[720px] grid grid-cols-[2fr_6rem_6rem_5rem_5rem_5rem_5.5rem] bg-muted border-b border-border">
        {["Project / Location", "Barangay", "Contractor", "Budget", "Spent", "Progress", "Action"].map((h) => (
          <div key={h} className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">{h}</div>
        ))}
      </div>
      {projects.map((p) => {
        const trace = traceabilityByProject[p.id];
        const isExpanded = expandedProjectId === p.id;

        return (
          <div key={p.id} className="flex flex-col border-b border-border last:border-b-0">
            <div
              onClick={() => {
                if (mainTab !== "history") return;
                setExpandedProjectId((prev) => (prev === p.id ? null : p.id));
              }}
              className={`min-w-[720px] grid grid-cols-[2fr_6rem_6rem_5rem_5rem_5rem_5.5rem] hover:bg-muted/40 transition-colors items-center ${mainTab === "history" ? "cursor-pointer" : ""}`}
            >
              <div className="px-3 py-2.5">
                <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  {p.name}
                  {mainTab === "pending" && pendingAuditProjectIds.has(p.id) && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary">
                      <ShieldCheck className="w-2.5 h-2.5" /> Ready
                    </span>
                  )}
                  {mainTab === "history" && (
                    <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                      <Link2 className="w-2.5 h-2.5" /> Traceable
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">{p.municipality} · {p.barangay}</div>
              </div>
              <div className="px-3 py-2.5 text-[11px] text-muted-foreground">{`Brgy. ${p.barangay}`}</div>
              <div className="px-3 py-2.5 text-[11px] text-foreground">{p.contractor}</div>
              <div className="px-3 py-2.5 text-[11px] text-foreground">{fmt(p.budget)}</div>
              <div className="px-3 py-2.5 text-[11px] text-foreground">{fmt(p.spent)}</div>
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 bg-muted rounded h-1">
                    <div className="bg-primary h-1 rounded" style={{ width: `${p.progress}%` }} />
                  </div>
                  <span className="text-[11px] font-medium text-foreground w-6 text-right">{p.progress}%</span>
                </div>
              </div>
              <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectProject(p);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-border rounded text-foreground hover:bg-primary hover:text-white hover:border-primary transition-colors"
                >
                  <Eye className="w-3 h-3" /> Review
                </button>
                {mainTab === "history" && (
                  <span className="text-muted-foreground">
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </span>
                )}
              </div>
            </div>

            {mainTab === "history" && isExpanded && (
              <div className="bg-muted/20 border-t border-border px-4 py-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded border border-border bg-card">
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">Latest Transaction Hash</div>
                    <div className="text-[11px] font-mono text-foreground mt-1 break-all">{trace?.latestTransactionHash ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">Short: {shortHash(trace?.latestTransactionHash)}</div>
                  </div>
                  <div className="p-3 rounded border border-border bg-card">
                    <div className="text-[10px] font-semibold uppercase text-muted-foreground">Block Timestamp</div>
                    <div className="text-[11px] text-foreground mt-1 inline-flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {fmtTimestamp(trace?.latestBlockTimestamp)}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">Action: {trace?.latestActionType ?? "—"}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground">Chain Of Custody (Before COA Action)</div>
                  {trace?.chainOfCustody?.length ? (
                    trace.chainOfCustody.map((step) => (
                      <div key={step.id} className="flex flex-wrap items-center gap-2 text-[11px] px-2.5 py-1.5 rounded border border-border bg-card">
                        <span className="font-medium text-foreground">{step.actorName}</span>
                        <span className="text-muted-foreground uppercase">{step.actorRole}</span>
                        <span className="text-primary">{step.actionType.replaceAll("_", " ")}</span>
                        <span className="text-muted-foreground">{fmtTimestamp(step.timestamp)}</span>
                        <span className="font-mono text-muted-foreground">{shortHash(step.blockchainHash)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-muted-foreground px-2 py-1.5 rounded border border-border bg-card">
                      No pre-auditor custody records were found for this registry entry.
                    </div>
                  )}
                </div>

                {trace?.latestRemarks && (
                  <div className="text-[11px] text-muted-foreground rounded border border-border bg-card px-3 py-2">
                    <span className="font-semibold text-foreground">Latest COA Remark:</span> {trace.latestRemarks}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}