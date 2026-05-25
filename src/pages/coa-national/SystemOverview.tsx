import { useMemo } from "react";
import { Activity, AlertTriangle, Globe2, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { NationalLedgerProject, NationalOversightKpis } from "./types";

interface SystemOverviewProps {
  kpis: NationalOversightKpis;
  records: NationalLedgerProject[];
}

export function SystemOverview({ kpis, records }: SystemOverviewProps) {
  const topRiskRegions = useMemo(() => {
    return kpis.anomalyHeatmap.slice(0, 6);
  }, [kpis.anomalyHeatmap]);

  const activeRegions = useMemo(() => {
    return Array.from(new Set(records.map((record) => record.region))).length;
  }, [records]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Globe2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Projects</div>
              <div className="text-xl font-bold text-foreground">{kpis.totalProjects}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total National Disbursement</div>
              <div className="text-xl font-bold text-foreground">{formatCurrency(kpis.totalNationalDisbursement)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Audit Completion Rate</div>
              <div className="text-xl font-bold text-foreground">{kpis.auditCompletionRate.toFixed(1)}%</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{kpis.finalSealCount} projects with final seal</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-destructive/10 text-destructive">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Active Regions</div>
              <div className="text-xl font-bold text-foreground">{activeRegions}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{kpis.anomalyHeatmap.length} regions with anomalies</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm font-semibold text-foreground">Anomaly Heatmap (By Region)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topRiskRegions.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No flagged anomalies detected nationwide.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-130 grid grid-cols-[1fr_8rem_1fr] bg-muted/50 border-b border-border">
                {[
                  "Region",
                  "Warning Count",
                  "Heat Index",
                ].map((header) => (
                  <div key={header} className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {header}
                  </div>
                ))}
              </div>
              <div className="divide-y divide-border">
                {topRiskRegions.map((row) => {
                  const width = Math.min(100, row.warningCount * 10);
                  return (
                    <div key={row.region} className="min-w-130 grid grid-cols-[1fr_8rem_1fr] items-center hover:bg-muted/30">
                      <div className="px-3 py-2 text-xs text-foreground font-medium">{row.region}</div>
                      <div className="px-3 py-2 text-xs text-foreground font-semibold">{row.warningCount}</div>
                      <div className="px-3 py-2">
                        <div className="h-2 bg-muted rounded">
                          <div className="h-2 bg-primary rounded" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm font-semibold text-foreground">National KPI Definitions</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-2 text-[11px] text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">Total National Disbursement:</span> Sum of all milestones where status is
            <span className="font-semibold text-foreground"> MILESTONE_PAID</span> across all regions.
          </p>
          <p>
            <span className="font-semibold text-foreground">Audit Completion Rate:</span> Percentage of nationwide projects with blockchain status
            <span className="font-semibold text-foreground"> FINAL_SEAL</span>.
          </p>
          <p>
            <span className="font-semibold text-foreground">Anomaly Heatmap:</span> Project-level warning aggregation per region based on forensic warnings and flagged audit actions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
