import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AdvancedFilterBar } from "@/components/features/coa";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaginationControls } from "@/components/ui";
import { ExternalLink, FileSearch } from "lucide-react";
import { getEtherscanLink, isRealTxHash } from "@/features/blockchain/services/blockchain";
import type {
  NationalBlockchainStatus,
  NationalRegistryRow,
} from "./types";

interface AuditReportsProps {
  registryRows: NationalRegistryRow[];
  regions: string[];
  contractors: string[];
  statuses: NationalBlockchainStatus[];
}

const STATUS_LABELS: Record<NationalBlockchainStatus, string> = {
  RDC_PROPOSED: "RDC Proposed",
  RD_ASSIGNED: "RD Assigned",
  CONTRACTOR_SUBMITTED: "Contractor Submitted",
  ENGINEER_VERIFIED: "Engineer Verified",
  COA_REGIONAL_APPROVED: "COA Regional Approved",
  FINAL_SEAL: "Final Seal",
  FLAGGED: "Flagged",
  UNKNOWN: "Unknown",
};

const STATUS_TABLE_LABELS: Record<NationalBlockchainStatus, string> = {
  RDC_PROPOSED: "RDC Proposed",
  RD_ASSIGNED: "RD Assigned",
  CONTRACTOR_SUBMITTED: "Contractor Submitted",
  ENGINEER_VERIFIED: "Engineer Verified",
  COA_REGIONAL_APPROVED: "COA Approved",
  FINAL_SEAL: "Final Seal",
  FLAGGED: "Flagged",
  UNKNOWN: "Unknown",
};

const TABLE_COLUMNS = [
  { key: "timestamp", label: "Timestamp", width: "12%" },
  { key: "projectId", label: "Project ID", width: "10%" },
  { key: "project", label: "Project", width: "17%" },
  { key: "region", label: "Region", width: "9%" },
  { key: "municipality", label: "Municipality", width: "12%" },
  { key: "contractor", label: "Contractor", width: "14%" },
  { key: "status", label: "Status", width: "8%" },
  { key: "action", label: "Action", width: "10%" },
  { key: "transaction", label: "Transaction", width: "8%" },
] as const;

const AUDIT_REPORTS_PAGE_SIZE = 10;

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
}

function displayValue(value: string): string {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : "-";
}

function maskMiddleHalf(value: string, minLengthToMask: number): string {
  const normalized = displayValue(value);
  if (normalized === "-" || normalized.length <= minLengthToMask) return normalized;

  // Keep first/last portions visible while masking the middle half for readability.
  const visibleChars = Math.max(8, Math.ceil(normalized.length / 2));
  const startChars = Math.ceil(visibleChars / 2);
  const endChars = Math.floor(visibleChars / 2);

  return `${normalized.slice(0, startChars)}...${normalized.slice(-endChars)}`;
}

function shouldEnableViewMore(value: string, threshold: number): boolean {
  const normalized = String(value ?? "").trim();
  return normalized.length > threshold;
}

export function AuditReports({ registryRows, regions, contractors, statuses }: AuditReportsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedContractor, setSelectedContractor] = useState("All");
  const [expandedCell, setExpandedCell] = useState<{ title: string; value: string } | null>(null);
  const [reportPage, setReportPage] = useState(1);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return registryRows.filter((row) => {
      const matchSearch = !q || row.searchIndex.includes(q);
      const matchRegion = selectedRegion === "All" || row.region === selectedRegion;
      const matchStatus = selectedStatus === "All" || STATUS_LABELS[row.status] === selectedStatus;
      const matchContractor = selectedContractor === "All" || row.contractor === selectedContractor;
      return matchSearch && matchRegion && matchStatus && matchContractor;
    });
  }, [registryRows, searchQuery, selectedRegion, selectedStatus, selectedContractor]);

  useEffect(() => {
    setReportPage(1);
  }, [searchQuery, selectedRegion, selectedStatus, selectedContractor]);

  const reportTotalPages = Math.max(1, Math.ceil(filteredRows.length / AUDIT_REPORTS_PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const safePage = Math.min(reportPage, reportTotalPages);
    const start = (safePage - 1) * AUDIT_REPORTS_PAGE_SIZE;
    return filteredRows.slice(start, start + AUDIT_REPORTS_PAGE_SIZE);
  }, [filteredRows, reportPage, reportTotalPages]);

  const renderMaskedCell = (
    value: string,
    title: string,
    threshold: number,
    options?: { mono?: boolean; href?: string }
  ) => {
    const normalized = displayValue(value);
    const masked = maskMiddleHalf(normalized, threshold);
    const canViewMore = normalized !== "-" && shouldEnableViewMore(normalized, threshold);

    return (
      <div className="min-w-0 flex items-center gap-1.5">
        {options?.href ? (
          <a
            href={options.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-primary hover:underline min-w-0 ${options.mono ? "font-mono" : ""}`}
            title={normalized}
          >
            <span className="truncate">{masked}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
          </a>
        ) : (
          <span
            className={`min-w-0 truncate ${options?.mono ? "font-mono" : ""}`}
            title={normalized}
          >
            {masked}
          </span>
        )}

        {canViewMore && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setExpandedCell({ title, value: normalized });
            }}
            className="text-[10px] text-primary hover:underline shrink-0"
          >
            View more
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <AdvancedFilterBar
        searchPlaceholder="Global search by Project ID or Transaction Hash..."
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        extraFilters={(
          <>
            <select
              value={selectedRegion}
              onChange={(event) => setSelectedRegion(event.target.value)}
              className="h-8 w-full sm:w-55 px-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
            >
              <option value="All">All Regions</option>
              {regions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value)}
              className="h-8 w-full sm:w-55 px-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
            >
              <option value="All">All Statuses</option>
              {statuses.map((status) => (
                <option key={status} value={STATUS_LABELS[status]}>{STATUS_LABELS[status]}</option>
              ))}
            </select>

            <select
              value={selectedContractor}
              onChange={(event) => setSelectedContractor(event.target.value)}
              className="h-8 w-full sm:w-55 px-3 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary"
            >
              <option value="All">All Contractors</option>
              {contractors.map((contractor) => (
                <option key={contractor} value={contractor}>{contractor}</option>
              ))}
            </select>
          </>
        )}
      />

      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
            <FileSearch className="w-4 h-4 text-primary" /> All-Access Audit Registry
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Cross-regional traceability with nationwide filtering by region, status, and contractor performance.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {filteredRows.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">No registry records matched the selected filters.</div>
          ) : (
            <div className="w-full overflow-hidden">
              <table className="w-full table-fixed text-left">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {TABLE_COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        style={{ width: column.width }}
                        className="px-2 sm:px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagedRows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="px-2 sm:px-3 py-2 text-[11px] text-muted-foreground whitespace-nowrap truncate" title={formatTimestamp(row.timestamp)}>
                        {formatTimestamp(row.timestamp)}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-[11px] text-foreground min-w-0">
                        {renderMaskedCell(row.projectId, "Project ID", 14, { mono: true })}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-[11px] text-foreground min-w-0">
                        {renderMaskedCell(row.projectName, "Project Name", 24)}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-[11px] text-muted-foreground min-w-0">
                        {renderMaskedCell(row.region, "Region", 16)}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-[11px] text-muted-foreground min-w-0">
                        {renderMaskedCell(row.municipality, "Municipality", 18)}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-[11px] text-foreground min-w-0">
                        {renderMaskedCell(row.contractor, "Contractor", 20)}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-[11px] min-w-0 overflow-hidden">
                        <span
                          title={STATUS_LABELS[row.status]}
                          className="inline-flex max-w-full px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary"
                        >
                          <span className="truncate">{STATUS_TABLE_LABELS[row.status]}</span>
                        </span>
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-[11px] text-muted-foreground min-w-0">
                        {renderMaskedCell(row.actionType, "Action", 18)}
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-[11px] font-mono text-muted-foreground min-w-0">
                        {renderMaskedCell(row.txHash, "Transaction Hash", 22, {
                          mono: true,
                          href: isRealTxHash(row.txHash) ? getEtherscanLink(row.txHash) : undefined,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredRows.length > 0 && (
            <div className="p-3">
              <PaginationControls
                page={Math.min(reportPage, reportTotalPages)}
                totalPages={reportTotalPages}
                onPageChange={setReportPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(expandedCell)}
        onOpenChange={(open) => {
          if (!open) setExpandedCell(null);
        }}
      >
        <DialogContent
          onClose={() => setExpandedCell(null)}
          className="max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>{expandedCell?.title ?? "Details"}</DialogTitle>
          </DialogHeader>
          <div className="p-6">
            <p className="text-sm text-foreground leading-relaxed wrap-break-word whitespace-pre-wrap">
              {expandedCell?.value}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
