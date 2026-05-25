import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { NationalLedgerProject } from "./types";

interface NationalActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRecords: NationalLedgerProject[];
  remarks: string;
  onRemarksChange: (value: string) => void;
  isProcessing: boolean;
  onConfirm: () => Promise<void>;
  errorMessage: string | null;
  successMessage: string | null;
}

export function NationalActionModal({
  open,
  onOpenChange,
  selectedRecords,
  remarks,
  onRemarksChange,
  isProcessing,
  onConfirm,
  errorMessage,
  successMessage,
}: NationalActionModalProps) {
  const summary = useMemo(() => {
    const totalBudget = selectedRecords.reduce(
      (sum, record) => sum + Number(record.project.budget ?? 0),
      0
    );
    const totalPaid = selectedRecords.reduce(
      (sum, record) => sum + Number(record.totalMilestonePaid ?? 0),
      0
    );

    return {
      projectCount: selectedRecords.length,
      totalBudget,
      totalPaid,
    };
  }, [selectedRecords]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Batch Final Seal Transaction Preview</DialogTitle>
        </DialogHeader>

        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded border border-border px-3 py-2 bg-card">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Projects to Close</div>
              <div className="text-lg font-bold text-foreground mt-0.5">{summary.projectCount}</div>
            </div>
            <div className="rounded border border-border px-3 py-2 bg-card">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Budget to Archive</div>
              <div className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(summary.totalBudget)}</div>
            </div>
            <div className="rounded border border-border px-3 py-2 bg-card">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Milestone Paid</div>
              <div className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(summary.totalPaid)}</div>
            </div>
          </div>

          <div className="rounded border border-border overflow-hidden">
            <div className="bg-muted/50 border-b border-border px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Transaction Preview
            </div>
            {selectedRecords.length === 0 ? (
              <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                No eligible projects selected.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {selectedRecords.map((record) => (
                  <div key={record.projectId} className="grid grid-cols-1 sm:grid-cols-[8rem_1fr_8rem_8rem] gap-2 px-3 py-2 items-center">
                    <div className="text-[11px] font-mono text-foreground">{record.projectId}</div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-foreground truncate" title={record.projectName}>{record.projectName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{record.region} | {record.municipality}</p>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{Math.max(Number(record.project.progress ?? 0), Number(record.project.currentProgress ?? 0)).toFixed(0)}%</div>
                    <div className="text-[11px] text-foreground font-medium">{formatCurrency(record.project.budget)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] text-muted-foreground font-medium">
              National Remarks for Batch Final Seal
            </label>
            <textarea
              value={remarks}
              onChange={(event) => onRemarksChange(event.target.value)}
              placeholder="Provide a common closure remark for all selected projects..."
              className="w-full min-h-20 px-2.5 py-2 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {errorMessage && (
            <p className="text-[11px] text-destructive">{errorMessage}</p>
          )}
          {successMessage && (
            <p className="text-[11px] text-primary">{successMessage}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void onConfirm()}
              disabled={isProcessing || selectedRecords.length === 0 || !remarks.trim()}
            >
              {isProcessing ? "Processing Batch Final Seal..." : "Confirm Batch Final Seal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
