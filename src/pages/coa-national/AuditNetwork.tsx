import { useEffect, useMemo, useState } from "react";
import { Users, UserPlus, RefreshCw, MapPin, Loader2 } from "lucide-react";
import { COANationalRegistration } from "@/components/features";
import { PaginationControls } from "@/components/ui";
import type { UserProfile } from "@/shared/types";
import { getEtherscanLink, isRealTxHash } from "@/features/blockchain/services/blockchain";

interface AuditNetworkProps {
  pageView: "register" | "auditors";
  setPageView: (v: "register" | "auditors") => void;
  registeredAuditors: UserProfile[];
  auditorsLoading: boolean;
  loadRegisteredAuditors: () => void;
}

const AUDIT_NETWORK_PAGE_SIZE = 10;

function formatRegistrar(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "—";
  if (/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    return `${normalized.slice(0, 10)}...${normalized.slice(-8)}`;
  }
  return normalized;
}

export function AuditNetwork({
  pageView,
  setPageView,
  registeredAuditors,
  auditorsLoading,
  loadRegisteredAuditors,
}: AuditNetworkProps) {
  const [auditorRegionFilter, setAuditorRegionFilter] = useState("");
  const [auditorPage, setAuditorPage] = useState(1);

  if (pageView === "register") {
    return (
      <div className="py-2">
        <COANationalRegistration onRegistered={loadRegisteredAuditors} />
      </div>
    );
  }

  const auditorRegions = Array.from(new Set(registeredAuditors.map((a) => a.assignedRegion ?? "—"))).filter(Boolean);
  const filtered = auditorRegionFilter
    ? registeredAuditors.filter((a) => a.assignedRegion === auditorRegionFilter)
    : registeredAuditors;
  const auditorTotalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_NETWORK_PAGE_SIZE));
  const pagedAuditors = useMemo(() => {
    const safePage = Math.min(auditorPage, auditorTotalPages);
    const start = (safePage - 1) * AUDIT_NETWORK_PAGE_SIZE;
    return filtered.slice(start, start + AUDIT_NETWORK_PAGE_SIZE);
  }, [filtered, auditorPage, auditorTotalPages]);

  useEffect(() => {
    setAuditorPage(1);
  }, [auditorRegionFilter]);

  return (
    <div className="space-y-4 pt-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Registered COA Regional Auditors</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {registeredAuditors.length} auditor{registeredAuditors.length !== 1 ? "s" : ""} registered nationwide
          </p>
        </div>
        <button
          onClick={loadRegisteredAuditors}
          disabled={auditorsLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${auditorsLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Region filter dropdown */}
      {auditorRegions.length > 0 && (
        <div className="rounded-md border border-border bg-card p-2.5">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <p className="text-[11px] font-semibold text-foreground">Region Filter</p>
          </div>
          <select
            value={auditorRegionFilter}
            onChange={(event) => setAuditorRegionFilter(event.target.value)}
            className="mt-2 h-8 w-full rounded border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="">All Regions</option>
            {auditorRegions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Auditors table */}
      {auditorsLoading ? (
        <div className="border border-border rounded-md bg-card px-4 py-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin mb-2" />
          <p className="text-xs text-muted-foreground">Loading auditors...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-border rounded-md bg-card px-4 py-16 text-center">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-semibold text-foreground">
            {registeredAuditors.length === 0 ? "No Auditors Registered Yet" : `No Auditors in ${auditorRegionFilter}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {registeredAuditors.length === 0
              ? 'Use the "Register Auditor" tab to add a new COA Regional Auditor.'
              : "Try selecting a different region or clear the filter."}
          </p>
          {auditorRegionFilter && (
            <button
              onClick={() => setAuditorRegionFilter("")}
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:bg-muted transition-colors"
            >
              Clear Filter
            </button>
          )}
          {registeredAuditors.length === 0 && (
            <button
              onClick={() => setPageView("register")}
              className="mt-3 ml-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-primary rounded-md text-primary hover:bg-primary/5 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Register Auditor
            </button>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-x-auto bg-card">
          <div className="min-w-225 grid grid-cols-[2rem_2fr_9rem_7rem_7rem_6rem_8rem_9rem] bg-muted/50 border-b border-border">
            {["#", "Name / Wallet", "Region", "Status", "Registered", "Whitelisted", "Tx Hash", "Registered By"].map(
              (h) => (
                <div key={h} className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {h}
                </div>
              )
            )}
          </div>
          <div className="divide-y divide-border">
            {pagedAuditors.map((a, idx) => (
              (() => {
                const txHash = String(a.whitelistTransactionHash || a.txHash || "").trim();
                const registeredBy = String(a.registeredByWallet || a.registeredBy || "").trim();
                const isAlreadyOnChain = txHash === "ALREADY_ON_CHAIN";
                const hasVerifiedTx = !isAlreadyOnChain && isRealTxHash(txHash);
                const rowNumber = (Math.min(auditorPage, auditorTotalPages) - 1) * AUDIT_NETWORK_PAGE_SIZE + idx + 1;

                return (
                  <div
                    key={a.id}
                    className="min-w-225 grid grid-cols-[2rem_2fr_9rem_7rem_7rem_6rem_8rem_9rem] hover:bg-muted/30 transition-colors items-center"
                  >
                    <div className="px-3 py-3 text-[11px] text-muted-foreground">{rowNumber}</div>
                    <div className="px-3 py-3">
                      <p className="text-[11px] font-semibold text-foreground truncate">{a.displayName || "—"}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{a.walletAddress}</p>
                    </div>
                    <div className="px-3 py-3">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] bg-primary/10 text-primary font-medium border border-primary/20">
                        {a.assignedRegion || "National"}
                      </span>
                    </div>
                    <div className="px-3 py-3">
                      {a.isActive ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] bg-emerald-500/10 text-emerald-600 font-medium border border-emerald-500/20">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] bg-destructive/10 text-destructive font-medium border border-destructive/20">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="px-3 py-3 text-[10px] text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </div>
                    <div className="px-3 py-3">
                      {a.isWhitelisted ? (
                        <span className="text-[10px] text-emerald-600 font-medium tracking-wide">Yes</span>
                      ) : (
                        <span className="text-[10px] text-destructive font-medium tracking-wide">No</span>
                      )}
                    </div>
                    <div className="px-3 py-3">
                      {txHash ? (
                        isAlreadyOnChain ? (
                          <span className="text-[10px] font-medium text-primary/70">Already On-chain</span>
                        ) : hasVerifiedTx ? (
                          <a
                            href={getEtherscanLink(txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary font-mono truncate max-w-20 block hover:underline"
                            title={`View on Etherscan: ${txHash}`}
                          >
                            {txHash.slice(0, 8)}...
                          </a>
                        ) : (
                          <span className="text-[10px] text-primary/60 font-mono truncate max-w-20 block" title={txHash}>
                            {txHash.slice(0, 8)}...
                          </span>
                        )
                      ) : a.isWhitelisted ? (
                        <span className="text-[10px] text-muted-foreground">Whitelisted (legacy)</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="px-3 py-3 text-[10px] text-muted-foreground truncate" title={registeredBy || "COA National"}>
                      {registeredBy ? formatRegistrar(registeredBy) : "COA National"}
                    </div>
                  </div>
                );
              })()
            ))}
          </div>

          <div className="p-3">
            <PaginationControls
              page={Math.min(auditorPage, auditorTotalPages)}
              totalPages={auditorTotalPages}
              onPageChange={setAuditorPage}
            />
          </div>
        </div>
      )}
    </div>
  );
}
