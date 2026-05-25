import { Search, ChevronDown, ChevronUp } from "lucide-react";
import {
  useAuditTrail,
  getActionLabel,
  getActionColor,
  getRoleColor,
  getRoleDisplayName,
  type AuditActorRole,
  type AuditEntry,
} from "@/context/AuditTrailContext";
import { getEtherscanLink } from "@/services/blockchain";
import { useLookups } from "@/hooks";

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(ts: string): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    "  " +
    d.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  );
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function resolveBlockchainHash(entry: AuditEntry): string {
  const directHash = String(entry.blockchainHash ?? "").trim();
  if (directHash.length > 0) return directHash;

  const metadata = entry.metadata;
  if (!metadata) return "";

  const txKeys = ["txHash", "transactionHash", "blockchainTxHash", "hash"] as const;
  for (const key of txKeys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function shortHash(hash: string): string {
  if (hash.length <= 24) return hash;
  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface AdminMonitorTabProps {
  monitorSearch: string;
  setMonitorSearch: (s: string) => void;
  monitorRoleFilter: AuditActorRole | "all";
  setMonitorRoleFilter: (r: AuditActorRole | "all") => void;
  monitorActionFilter: "all" | "approved" | "rejected" | "submitted" | "created" | "disbursed";
  setMonitorActionFilter: (
    a: "all" | "approved" | "rejected" | "submitted" | "created" | "disbursed"
  ) => void;
  expandedAuditId: string | null;
  setExpandedAuditId: (id: string | null) => void;
}

// ── Main Component ─────────────────────────────────────────────────────────
export function AdminMonitorTab({
  monitorSearch,
  setMonitorSearch,
  monitorRoleFilter,
  setMonitorRoleFilter,
  monitorActionFilter,
  setMonitorActionFilter,
  expandedAuditId,
  setExpandedAuditId,
}: AdminMonitorTabProps) {
  const { auditEntries } = useAuditTrail();
  const { data: lookups } = useLookups(["SystemRole", "ActionType"]);
  const systemRoles = lookups.SystemRole ?? [];
  const actionTypesLookup = lookups.ActionType ?? [];

  const sortedEntries = [...auditEntries].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  );

  const roleValues = uniqueSorted([
    ...systemRoles.map((role) => role.name),
    ...sortedEntries.map((entry) => entry.actorRole),
  ]);

  const roleLabelMap = new Map(
    systemRoles.map((role) => [role.name, role.description || getRoleDisplayName(role.name)])
  );

  const actionValues = uniqueSorted([
    ...actionTypesLookup.map((action) => action.name),
    ...sortedEntries.map((entry) => entry.actionType),
  ]);

  const normalizedActionFilter = monitorActionFilter.toLowerCase();
  const isCategoryActionFilter = [
    "all",
    "approved",
    "rejected",
    "submitted",
    "created",
    "disbursed",
  ].includes(normalizedActionFilter);

  // Audit log filtering
  const filteredEntries = sortedEntries.filter((e) => {
    if (monitorRoleFilter !== "all" && e.actorRole !== monitorRoleFilter) return false;

    if (
      normalizedActionFilter === "approved" &&
      !e.actionType.includes("APPROVED") &&
      e.actionType !== "FUND_DISBURSED" &&
      e.actionType !== "PUBLISHED_TO_LEDGER"
    )
      return false;
    if (normalizedActionFilter === "rejected" && !e.actionType.includes("REJECTED")) return false;

    if (
      normalizedActionFilter === "submitted" &&
      !e.actionType.includes("SUBMITTED") &&
      !e.actionType.includes("ENDORSED")
    )
      return false;

    if (
      normalizedActionFilter === "created" &&
      e.actionType !== "PROJECT_CREATED" &&
      e.actionType !== "PROJECT_DRAFT_SAVED"
    )
      return false;

    if (
      normalizedActionFilter === "disbursed" &&
      e.actionType !== "FUND_DISBURSED" &&
      e.actionType !== "BUDGET_RELEASED"
    )
      return false;

    if (!isCategoryActionFilter && normalizedActionFilter !== "all") {
      if (e.actionType.toLowerCase() !== normalizedActionFilter) return false;
    }

    if (monitorSearch.trim()) {
      const q = monitorSearch.toLowerCase().trim();
      const txHash = resolveBlockchainHash(e).toLowerCase();
      if (
        !e.projectName.toLowerCase().includes(q) &&
        !e.actorName.toLowerCase().includes(q) &&
        !e.description.toLowerCase().includes(q) &&
        !e.actorRole.toLowerCase().includes(q) &&
        !getRoleDisplayName(e.actorRole).toLowerCase().includes(q) &&
        !e.actionType.toLowerCase().includes(q) &&
        !txHash.includes(q)
      )
        return false;
    }
    return true;
  });

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">Audit Log</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every transaction and action from every role — immutably recorded on the blockchain
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-lg bg-muted border border-border text-muted-foreground self-start">
          {sortedEntries.length} events
        </span>
      </div>

      {/* Search + Filters */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search project, actor, action, role, or tx hash…"
              value={monitorSearch}
              onChange={(e) => setMonitorSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="relative w-full sm:w-auto">
            <select
              value={monitorRoleFilter}
              onChange={(e) =>
                setMonitorRoleFilter(e.target.value as typeof monitorRoleFilter)
              }
              className="appearance-none w-full sm:min-w-40 h-full pl-3 pr-8 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer truncate"
            >
              <option value="all">All Roles</option>
              {roleValues.map((roleName) => (
                <option key={roleName} value={roleName}>
                  {(roleLabelMap.get(roleName) || getRoleDisplayName(roleName))} ({sortedEntries.filter((e) => e.actorRole === roleName).length})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
          <div className="relative w-full sm:w-auto">
            <select
              value={monitorActionFilter}
              onChange={(e) =>
                setMonitorActionFilter(e.target.value as typeof monitorActionFilter)
              }
              className="appearance-none w-full sm:min-w-40 h-full pl-3 pr-8 py-2 text-sm border border-border bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer truncate"
            >
              <option value="all">All Actions</option>
              <option value="approved">Approved / Verified</option>
              <option value="rejected">Rejected / Suspended</option>
              <option value="submitted">Submitted / Endorsed</option>
              <option value="created">Created / Draft Saved</option>
              <option value="disbursed">Disbursed / Released</option>
              {actionValues.map((actionName) => (
                <option key={actionName} value={actionName}>{getActionLabel(actionName)}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Audit log list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            {filteredEntries.length} of {sortedEntries.length} events
          </p>
          <p className="text-[11px] text-muted-foreground">Tap a row to expand</p>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              No events match your filters
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Try adjusting the role or action filters above.
            </p>
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const isExpanded = expandedAuditId === entry.id;
            const txHash = resolveBlockchainHash(entry);
            return (
              <div
                key={entry.id}
                onClick={() => setExpandedAuditId(isExpanded ? null : entry.id)}
                className="rounded-xl border border-border bg-card cursor-pointer transition-all hover:shadow-sm"
              >
                {/* Collapsed row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="shrink-0 w-5 flex justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/30 mt-0.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${getActionColor(entry.actionType)}`}
                      >
                        {getActionLabel(entry.actionType)}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${getRoleColor(entry.actorRole)}`}
                      >
                        {getRoleDisplayName(entry.actorRole)}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-foreground mt-1 truncate">
                      {entry.projectName}
                    </p>
                    {entry.milestoneName && (
                      <p className="text-[11px] text-muted-foreground">
                        Milestone: {entry.milestoneName}
                      </p>
                    )}
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      TX: {txHash ? shortHash(txHash) : "No hash"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right min-w-24">
                    {entry.amount != null && entry.amount > 0 && (
                      <p className="text-xs font-bold text-foreground">
                        ₱{(entry.amount / 1_000_000).toFixed(2)}M
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {fmtDate(entry.timestamp)}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pt-3 pb-4 border-t border-border space-y-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {entry.description}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-xs">
                      <div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                          Actor
                        </p>
                        <p className="text-foreground font-medium">{entry.actorName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                          Event ID
                        </p>
                        <p className="font-mono text-foreground text-[11px]">{entry.id}</p>
                      </div>
                      {entry.projectId && (
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                            Project ID
                          </p>
                          <p className="font-mono text-foreground text-[11px]">
                            {entry.projectId}
                          </p>
                        </div>
                      )}
                      {entry.municipality && (
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                            Location
                          </p>
                          <p className="text-foreground">
                            {entry.municipality}
                            {entry.region ? `, ${entry.region}` : ""}
                          </p>
                        </div>
                      )}
                      {(entry.previousStatus || entry.newStatus) && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                            Status Change
                          </p>
                          <p className="text-foreground flex items-center gap-2">
                            {entry.previousStatus && (
                              <span className="line-through text-muted-foreground">
                                {entry.previousStatus}
                              </span>
                            )}
                            {entry.previousStatus && entry.newStatus && (
                              <span className="text-muted-foreground text-[11px]">→</span>
                            )}
                            {entry.newStatus && (
                              <span className="font-semibold">{entry.newStatus}</span>
                            )}
                          </p>
                        </div>
                      )}
                      {entry.actorWallet && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                            Wallet Address
                          </p>
                          <p className="font-mono text-foreground text-[11px] break-all">
                            {entry.actorWallet}
                          </p>
                        </div>
                      )}
                    </div>
                    {entry.remarks && (
                      <div className="px-3 py-2.5 rounded-lg bg-muted border border-border text-xs text-muted-foreground italic leading-relaxed">
                        &ldquo;{entry.remarks}&rdquo;
                      </div>
                    )}
                    {txHash ? (
                      <div className="flex items-center gap-2.5 px-3 py-2 bg-muted rounded-lg justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            Hash
                          </span>
                          <span className="font-mono text-[10px] text-foreground truncate">
                            {txHash.substring(0, 52)}…
                          </span>
                        </div>
                        <a
                          href={getEtherscanLink(txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] font-semibold text-primary hover:underline shrink-0"
                        >
                          View TX →
                        </a>
                      </div>
                    ) : (
                      <div className="px-3 py-2 rounded-lg border border-border bg-muted/50 text-[11px] text-muted-foreground">
                        No blockchain hash recorded for this entry.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
