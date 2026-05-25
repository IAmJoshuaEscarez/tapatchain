import { useMemo } from "react";
import { AlertTriangle, FileText, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AuditLogTable } from "@/components/features/coa";
import type { AuditEntry } from "@/context/AuditTrailContext";
import type { Project } from "@/types";

const BLOCK_TIMESTAMP_PATTERN = /Block Timestamp:\s*([^|]+)/i;

function extractBlockTimestampFromDescription(description?: string): string | undefined {
  if (!description) return undefined;
  const match = description.match(BLOCK_TIMESTAMP_PATTERN);
  return match?.[1]?.trim();
}

interface AuditLogPageProps {
  assignedRegion: string;
  regionScopedProjects: Project[];
  auditEntries: AuditEntry[];
}

export function AuditLogPage({ assignedRegion, regionScopedProjects, auditEntries }: AuditLogPageProps) {
  const regionProjectIdSet = useMemo(
    () => new Set(regionScopedProjects.map((project) => String(project.id))),
    [regionScopedProjects]
  );

  const regionAuditEntries = useMemo(
    () =>
      auditEntries
        .filter((entry) => regionProjectIdSet.has(String(entry.projectId)))
        .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()),
    [auditEntries, regionProjectIdSet]
  );

  const auditLogs = useMemo(
    () =>
      regionAuditEntries.map((entry) => ({
        id: entry.id,
        event: entry.actionType,
        actor: entry.actorName,
        date: extractBlockTimestampFromDescription(entry.description) ?? entry.timestamp,
        hash: entry.blockchainHash ?? "—",
        amount: entry.amount ?? 0,
        source: entry.blockchainHash ? ("blockchain" as const) : ("audit" as const),
      })),
    [regionAuditEntries]
  );

  const auditedActionsCount = useMemo(
    () =>
      regionAuditEntries.filter((entry) => {
        const actionType = String(entry.actionType ?? "");
        return actionType === "COA_AUDITED" || actionType === "COA_FORENSIC_VERIFIED";
      }).length,
    [regionAuditEntries]
  );

  const aomActionsCount = useMemo(
    () =>
      regionAuditEntries.filter(
        (entry) => entry.actionType === "PROJECT_SUSPENDED" || entry.actionType === "COA_REJECTED"
      ).length,
    [regionAuditEntries]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Regional Audit Records</p>
              <p className="text-xl font-bold text-foreground">{regionAuditEntries.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">COA Verified Actions</p>
              <p className="text-xl font-bold text-foreground">{auditedActionsCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">AOM / Rejection Actions</p>
              <p className="text-xl font-bold text-foreground">{aomActionsCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="px-1">
        <p className="text-[11px] text-muted-foreground">
          Region scope: <span className="font-semibold text-foreground">{assignedRegion}</span>
        </p>
      </div>

      <AuditLogTable logs={auditLogs} />
    </div>
  );
}
