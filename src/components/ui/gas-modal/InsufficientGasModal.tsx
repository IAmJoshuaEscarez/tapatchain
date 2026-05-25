import { AlertTriangle, ExternalLink, Fuel, X } from "lucide-react";

interface InsufficientGasModalProps {
  open: boolean;
  onClose: () => void;
  message?: string;
}

/**
 * Modal that appears when a blockchain transaction fails due to insufficient gas.
 * Prevents data from being saved to the database when there's no gas to record on-chain.
 */
export function InsufficientGasModal({
  open,
  onClose,
  message,
}: InsufficientGasModalProps) {
  if (!open) return null;

  // Parse wallet address and balance info from the message if available
  const walletMatch = message?.match(/\(0x[a-fA-F0-9]+\)/);
  const walletAddress = walletMatch?.[0]?.replace(/[()]/g, "") || "";
  const balanceMatch = message?.match(/Balance:\s*([\d.]+)\s*ETH/);
  const requiredMatch = message?.match(/Required:\s*~?([\d.]+)\s*ETH/);
  const currentBalance = balanceMatch?.[1] || "0";
  const requiredAmount = requiredMatch?.[1] || "Unknown";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-50 w-full max-w-md mx-4 bg-background border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header - Warning banner */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-4 flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Fuel className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">
              Insufficient Gas (ETH)
            </h3>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Transaction cannot be recorded on-chain
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-full p-1 hover:bg-amber-500/20 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Warning message */}
          <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              The admin wallet does not have enough Sepolia ETH to pay for gas
              fees.{" "}
              <strong>
                No data has been saved to the database to maintain blockchain
                integrity.
              </strong>
            </p>
          </div>

          {/* Balance info */}
          {(balanceMatch || requiredMatch) && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current Balance:</span>
                <span className="font-mono font-medium text-destructive">
                  {currentBalance} ETH
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Required (est.):</span>
                <span className="font-mono font-medium text-foreground">
                  ~{requiredAmount} ETH
                </span>
              </div>
              {walletAddress && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">
                    Admin Wallet:
                  </p>
                  <p className="text-xs font-mono text-foreground break-all">
                    {walletAddress}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* How to fix */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              How to fix this:
            </p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>
                Get free Sepolia ETH from a{" "}
                <a
                  href="https://sepoliafaucet.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline inline-flex items-center gap-1"
                >
                  faucet <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>Send the ETH to the admin wallet address above</li>
              <li>Retry the transaction</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/30 flex justify-end gap-3">
          <a
            href="https://sepoliafaucet.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Fuel className="w-4 h-4" />
            Get Sepolia ETH
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
