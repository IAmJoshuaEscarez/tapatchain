import { useState, useMemo } from "react";
import {
  verifyTransactionOnChain,
  getEtherscanLink,
  type TransactionVerificationState,
} from "@/features/blockchain/services/blockchain";
import { Shield, ShieldCheck, FileText, ChevronDown, ChevronUp, ExternalLink, Link2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { AdvancedFilterBar } from "./AdvancedFilterBar";

interface AuditLogEntry {
  id: string;
  event: string;
  actor: string;
  actorRole?: string;
  date: string;
  hash: string;
  amount: number;
  description?: string;
  projectName?: string;
  municipality?: string;
  barangay?: string;
  source: "blockchain" | "audit";
}

interface AuditLogTableProps {
  logs: AuditLogEntry[];
}

interface VerificationResult {
  isLoading: boolean;
  checked: boolean;
  state?: TransactionVerificationState;
  onChain: boolean;
  hashMatch: boolean;
  verified: boolean;
  message: string;
  receiptHash?: string;
  blockNumber?: string;
  gasUsed?: string;
  status?: string;
  from?: string;
  to?: string;
  etherscanUrl?: string;
}

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

const isRealTxHash = (hash: string) => TX_HASH_REGEX.test(hash);

const extractTxHash = (value: string): string => {
  if (!value) return "";
  const match = value.match(/0x[a-fA-F0-9]{64}/);
  return match?.[0] ?? "";
};

const shortWallet = (value: string): string => {
  if (!WALLET_REGEX.test(value)) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const shortTraceValue = (value: string): string => {
  if (!value) return "—";
  if (isRealTxHash(value)) return `${value.slice(0, 14)}...`;
  if (WALLET_REGEX.test(value)) return `${value.slice(0, 12)}...`;
  return value.length > 18 ? `${value.slice(0, 15)}...` : value;
};

const ROLE_LABELS: Record<string, string> = {
  contractor: "Contractor",
  inspector: "Site Engineer",
  engineer: "Regional Director / Engineer",
  rdc: "RDC",
  admin: "National Admin",
  auditor: "COA Regional Auditor",
  overseer: "COA National Oversight",
  system: "System",
  public: "Public",
};

const toTitleCase = (value: string): string =>
  value
    .split("_")
    .map((part) => (part.length <= 3 ? part.toUpperCase() : `${part[0]}${part.slice(1).toLowerCase()}`))
    .join(" ");

const getRoleLabel = (role?: string) => {
  if (!role) return "Unknown Role";
  return ROLE_LABELS[role] ?? toTitleCase(role);
};

const getActionLabel = (event: string) => {
  if (!event) return "Unknown Action";
  return toTitleCase(event);
};

const getLocationLabel = (entry: AuditLogEntry) => {
  const municipality = (entry.municipality ?? "").trim();
  const barangay = (entry.barangay ?? "").trim();

  if (municipality && barangay) return `${municipality}, Brgy. ${barangay}`;
  if (municipality) return municipality;
  if (barangay) return `Brgy. ${barangay}`;
  return "Location not specified";
};

const getNarrative = (entry: AuditLogEntry) => {
  const raw = (entry.description ?? "").trim();
  if (raw.length > 0) return raw;

  const action = getActionLabel(entry.event);
  const role = getRoleLabel(entry.actorRole);
  return `${action} recorded by ${entry.actor || "Unknown Actor"} (${role}).`;
};

const getAuditRecordStatus = (
  verification: VerificationResult | undefined,
  hasOnChainHash: boolean
): { label: string; tone: string } => {
  if (!hasOnChainHash) {
    return { label: "Off-chain", tone: "bg-muted text-muted-foreground" };
  }

  if (verification?.isLoading) {
    return { label: "Verifying", tone: "bg-primary/10 text-primary" };
  }

  if (!verification?.checked) {
    return { label: "Pending", tone: "bg-muted text-muted-foreground" };
  }

  if (verification.state === "OFF_CHAIN_REFERENCE") {
    return { label: "Off-chain", tone: "bg-muted text-muted-foreground" };
  }

  if (verification.state === "PENDING") {
    return { label: "Pending", tone: "bg-amber-500/10 text-amber-700" };
  }

  if (verification.state === "CONFIRMED_FAILED") {
    return { label: "Failed", tone: "bg-destructive/10 text-destructive" };
  }

  if (verification.state === "ERROR") {
    return { label: "Error", tone: "bg-destructive/10 text-destructive" };
  }

  if (verification.state === "NOT_FOUND") {
    return { label: "Not Found", tone: "bg-muted text-muted-foreground" };
  }

  if (verification.onChain && verification.hashMatch) {
    return { label: "Matched", tone: "bg-emerald-500/10 text-emerald-600" };
  }

  if (verification.onChain && !verification.hashMatch) {
    return { label: "Mismatch", tone: "bg-destructive/10 text-destructive" };
  }

  return { label: "Not Found", tone: "bg-muted text-muted-foreground" };
};

export function AuditLogTable({ logs }: AuditLogTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const [verificationById, setVerificationById] = useState<Record<string, VerificationResult>>({});

  const filteredLogs = useMemo(() => {
    let filtered = logs;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.event.toLowerCase().includes(q) ||
          l.actor.toLowerCase().includes(q) ||
          l.hash.toLowerCase().includes(q) ||
          (l.description ?? "").toLowerCase().includes(q) ||
          (l.projectName ?? "").toLowerCase().includes(q) ||
          (l.actorRole ?? "").toLowerCase().includes(q) ||
          (l.municipality ?? "").toLowerCase().includes(q) ||
          (l.barangay ?? "").toLowerCase().includes(q)
      );
    }

    if (dateFilter !== "all") {
      const now = new Date().getTime();
      const cutoff = now - parseInt(dateFilter) * 24 * 60 * 60 * 1000;
      filtered = filtered.filter((l) => new Date(l.date).getTime() >= cutoff);
    }

    return filtered;
  }, [logs, searchQuery, dateFilter]);

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const handleVerifyHashMatch = async (tx: AuditLogEntry) => {
    const txHash = extractTxHash(tx.hash ?? "");

    if (!isRealTxHash(txHash)) {
      setVerificationById((prev) => ({
        ...prev,
        [tx.id]: {
          isLoading: false,
          checked: true,
          state: "OFF_CHAIN_REFERENCE",
          onChain: false,
          hashMatch: false,
          verified: false,
          message: "This entry has no valid on-chain transaction hash.",
        },
      }));
      return;
    }

    setVerificationById((prev) => ({
      ...prev,
      [tx.id]: {
        isLoading: true,
        checked: false,
        onChain: false,
        hashMatch: false,
        verified: false,
        message: "Verifying transaction on-chain...",
      },
    }));

    const result = await verifyTransactionOnChain(txHash);
    const receiptHash = (
      result.receipt?.transactionHash ?? (result.onChain ? txHash : undefined)
    )?.trim();

    const isConfirmedState =
      result.state === "CONFIRMED_SUCCESS" || result.state === "CONFIRMED_FAILED";

    const hashMatch = isConfirmedState && !!receiptHash
      ? receiptHash.toLowerCase() === txHash.toLowerCase()
      : false;

    setVerificationById((prev) => ({
      ...prev,
      [tx.id]: {
        isLoading: false,
        checked: true,
        state: result.state,
        onChain: result.onChain,
        hashMatch,
        verified: result.verified,
        message: result.message,
        receiptHash,
        blockNumber: result.receipt?.blockNumber,
        gasUsed: result.receipt?.gasUsed,
        status: result.receipt?.status,
        from: result.receipt?.from,
        to: result.receipt?.to,
        etherscanUrl: result.etherscanUrl,
      },
    }));
  };

  return (
    <div className="space-y-4">
      <AdvancedFilterBar
        searchPlaceholder="Search event, actor, or hash..."
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
      />

      <div className="border border-border rounded-md overflow-hidden bg-card">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-foreground font-medium">No Audit Logs Found</p>
            <p className="text-xs text-muted-foreground mt-0.5">Try adjusting your filters to see more results.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-215 grid grid-cols-[2.5rem_2.3fr_1.4fr_1.2fr_1.5fr_2rem] border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              <div></div>
              <div>What Happened</div>
              <div>Actor &amp; Role</div>
              <div className="text-center">View on Etherscan</div>
              <div className="text-right">Timestamp</div>
              <div></div>
            </div>

            <div className="divide-y divide-border">
              {filteredLogs.map((tx) => {
                const txHash = extractTxHash(tx.hash ?? "");
                const hasOnChainHash = isRealTxHash(txHash);
                const verification = verificationById[tx.id];
                const actorLabel = shortWallet(tx.actor);
                const auditStatus = getAuditRecordStatus(verification, hasOnChainHash);
                const actionLabel = getActionLabel(tx.event);
                const roleLabel = getRoleLabel(tx.actorRole);
                const locationLabel = getLocationLabel(tx);
                const narrative = getNarrative(tx);
                const projectName = tx.projectName ?? "Unknown Project";

                return (
                <div key={tx.id} className="flex flex-col">
                  {/* Row */}
                  <div
                    onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}
                    className="min-w-215 grid grid-cols-[2.5rem_2.3fr_1.4fr_1.2fr_1.5fr_2rem] px-3 py-2 items-center hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <div className="shrink-0">
                      {tx.source === "blockchain" ? (
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                          <Shield className="w-3 h-3 text-primary" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate pl-1" title={actionLabel}>{actionLabel}</p>
                      <p className="text-[10px] text-muted-foreground truncate pl-1" title={projectName}>{projectName}</p>
                      <p className="text-[10px] text-muted-foreground/90 truncate pl-1" title={narrative}>{narrative}</p>
                      <div className="text-[10px] text-muted-foreground/80 font-mono mt-0.5 pl-1 flex items-center gap-1.5 min-w-0">
                        <span className="truncate" title={tx.hash}>{shortTraceValue(tx.hash)}</span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-foreground font-medium truncate" title={tx.actor}>{actorLabel}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{roleLabel}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={locationLabel}>{locationLabel}</p>
                    </div>

                    <div className="flex justify-center">
                      {hasOnChainHash ? (
                        <a
                          href={getEtherscanLink(txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded text-primary hover:bg-primary/5"
                          title="Open transaction on Etherscan"
                        >
                          View <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-muted-foreground">{fmtDate(tx.date)}</span>
                    </div>
                    <div className="flex justify-end pr-1">
                      {expandedTx === tx.id ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {expandedTx === tx.id && (
                    <div className="bg-muted/20 border-t border-border/50 p-4">
                      <div className="mb-3 rounded border border-border/50 bg-background p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Detailed Activity Narrative</p>
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{narrative}</p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div className="bg-background rounded border border-border/50 p-3 shadow-sm">
                          <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide block mb-1">Source</span>
                          <span className="text-primary font-medium capitalize text-xs">{tx.source} Network</span>
                        </div>
                        <div className="bg-background rounded border border-border/50 p-3 shadow-sm">
                          <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide block mb-1">Action Initiator</span>
                          <span className="text-foreground text-xs font-mono break-all">{tx.actor}</span>
                        </div>
                        <div className="bg-background rounded border border-border/50 p-3 shadow-sm md:col-span-2">
                          <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide block mb-1">Project &amp; Location</span>
                          <span className="text-foreground text-xs block">{projectName}</span>
                          <span className="text-muted-foreground text-[11px]">{locationLabel}</span>
                        </div>
                      </div>

                      <div className="bg-background rounded border border-border/50 p-3 shadow-sm mb-3">
                        <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide block mb-1">Trace Identifier</span>
                        <span className="text-muted-foreground text-[11px] font-mono break-all">{tx.hash}</span>
                      </div>

                      <div className="rounded border border-border/50 bg-background p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 justify-between">
                          <span className="text-[11px] font-semibold text-foreground inline-flex items-center gap-1.5">
                            <Link2 className="w-3.5 h-3.5 text-primary" /> Off-chain vs On-chain Match Check
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${auditStatus.tone}`}>
                              {auditStatus.label}
                            </span>
                            {hasOnChainHash && (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleVerifyHashMatch(tx);
                                }}
                                disabled={verification?.isLoading}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] border border-primary rounded text-primary hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {verification?.isLoading ? (
                                  <><Loader2 className="w-2.5 h-2.5 animate-spin" />...</>
                                ) : (
                                  "Verify"
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="text-[10px] text-muted-foreground">Off-chain hash: <span className="font-mono">{tx.hash}</span></div>
                        <div className="text-[10px] text-muted-foreground">On-chain hash: <span className="font-mono">{verification?.receiptHash ?? "—"}</span></div>

                        {verification?.checked && (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {verification.onChain ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
                                  <CheckCircle2 className="w-3 h-3" /> On-chain Located
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">
                                  <XCircle className="w-3 h-3" /> On-chain Not Found
                                </span>
                              )}

                              {(verification.state === "CONFIRMED_SUCCESS" || verification.state === "CONFIRMED_FAILED") && (
                                verification.hashMatch ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
                                    <CheckCircle2 className="w-3 h-3" /> Match
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
                                    <XCircle className="w-3 h-3" /> Mismatch
                                  </span>
                                )
                              )}
                            </div>

                            <p className="text-[10px] text-muted-foreground">{verification.message}</p>

                            {verification.onChain && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                                <div>Block Number: <span className="font-mono text-foreground">{verification.blockNumber ?? "—"}</span></div>
                                <div>Receipt Status: <span className="font-mono text-foreground">{verification.status ?? "—"}</span></div>
                                <div>Gas Used: <span className="font-mono text-foreground">{verification.gasUsed ?? "—"}</span></div>
                                <div>From: <span className="font-mono text-foreground">{verification.from ?? "—"}</span></div>
                                <div className="md:col-span-2">To: <span className="font-mono text-foreground">{verification.to ?? "—"}</span></div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );})}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
