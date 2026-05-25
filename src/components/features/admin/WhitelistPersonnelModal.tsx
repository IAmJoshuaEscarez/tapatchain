// ════════════════════════════════════════════════════════════════
// WhitelistPersonnelModal — Multi-Project Personnel Assignment
// Opens when RD clicks "Whitelist" on a funded project row.
// Binds ProjectID + ContractorWallet + EngineerWallet + MunicipalityID on-chain.
// Fetches registered professionals for dropdown selectors.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  X,
  Shield,
  Loader2,
  ExternalLink,
  AlertTriangle,
  MapPin,
  Wallet,
  ChevronDown,
  CheckCircle,
} from "lucide-react";
import {
  signMultiProjectPersonnel,
  logToAuditTrail,
  isAddressAuthorizedOnChain,
  type SignatureGateResult,
} from "@/services/signatureGate";
import { BrowserProvider } from "ethers";
import { ensureSepoliaNetwork } from "@/features/blockchain/services/blockchain";
import { useGasGuard } from "@/hooks/useGasGuard";
import { InsufficientGasModal } from "@/components/ui/InsufficientGasModal";
import { stakeholderApi, type StakeholderResponse } from "@/features/stakeholder/api/stakeholderApi";
import type { RDCProject } from "@/context/ProjectContext";

export interface WhitelistPersonnelModalProps {
  project: RDCProject;
  regionName: string;
  rdDisplayName: string;
  onClose: () => void;
  onSuccess: (projectId: string, updates: Partial<RDCProject>, signResult: SignatureGateResult) => void;
}

export function WhitelistPersonnelModal({
  project,
  regionName,
  rdDisplayName,
  onClose,
  onSuccess,
}: WhitelistPersonnelModalProps) {
  const [contractorWallet, setContractorWallet] = useState(project.contractorWallet ?? "");
  const [contractorName, setContractorName] = useState(project.contractorName ?? "");
  const [engineerWallet, setEngineerWallet] = useState(project.engineerWallet ?? "");
  const [engineerName, setEngineerName] = useState(project.engineerName ?? project.inspectorName ?? "");
  const [contractStartDate, setContractStartDate] = useState(project.contractStartDate ?? "");
  const [contractEndDate, setContractEndDate] = useState(project.contractEndDate ?? "");
  const [isSigning, setIsSigning] = useState(false);
  const [signResult, setSignResult] = useState<SignatureGateResult | null>(null);
  const { gasError, clearGasError, handleGasError } = useGasGuard();
  const [error, setError] = useState<string | null>(null);

  // ── On-chain authorization status for wallet pre-checks ──
  const [contractorAuthStatus, setContractorAuthStatus] = useState<"unknown" | "checking" | "authorized" | "not-authorized">("unknown");
  const [engineerAuthStatus, setEngineerAuthStatus] = useState<"unknown" | "checking" | "authorized" | "not-authorized">("unknown");

  const isValidWallet = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

  // Check on-chain authorization whenever a valid wallet address is entered
  const checkWalletAuth = useCallback(async (wallet: string, setStatus: (s: "unknown" | "checking" | "authorized" | "not-authorized") => void) => {
    if (!isValidWallet(wallet)) { setStatus("unknown"); return; }
    if (!window.ethereum) { setStatus("unknown"); return; }
    setStatus("checking");
    try {
      // Must be on Sepolia — otherwise the check hits the wrong network
      // and silently returns false, showing a wrong "not whitelisted" warning.
      const onSepolia = await ensureSepoliaNetwork();
      if (!onSepolia) { setStatus("unknown"); return; }

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const authorized = await isAddressAuthorizedOnChain(signer, wallet);
      setStatus(authorized ? "authorized" : "not-authorized");
    } catch (err) {
      // Any error (RPC issue, wrong chain, provider failure) → unknown,
      // NOT "not-authorized". This prevents false warnings.
      console.warn("[WhitelistPersonnelModal] Auth check failed:", err);
      setStatus("unknown");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => checkWalletAuth(contractorWallet, setContractorAuthStatus), 500);
    return () => clearTimeout(timer);
  }, [contractorWallet, checkWalletAuth]);

  useEffect(() => {
    const timer = setTimeout(() => checkWalletAuth(engineerWallet, setEngineerAuthStatus), 500);
    return () => clearTimeout(timer);
  }, [engineerWallet, checkWalletAuth]);

  // ── Registered professionals for dropdown selectors ──
  const [contractors, setContractors] = useState<StakeholderResponse[]>([]);
  const [engineers, setEngineers] = useState<StakeholderResponse[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [cRes, eRes] = await Promise.all([
          stakeholderApi.getByType("Contractor"),
          stakeholderApi.getByType("SiteEngineer"),
        ]);
        if (!cancelled) {
          // Filter to active professionals with wallets, scoped to this RD's region
          const filterByRegion = (s: StakeholderResponse) =>
            s.isActive && s.walletAddress &&
            (!regionName || !s.region || s.region === regionName);
          setContractors(cRes.data.filter(filterByRegion));
          setEngineers(eRes.data.filter(filterByRegion));
        }
      } catch {
        // silent — fallback to manual entry
      } finally {
        if (!cancelled) setLoadingRegistry(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // When a contractor is selected from dropdown, populate both fields
  const handleSelectContractor = (id: string) => {
    if (id === "__manual__") {
      setContractorWallet("");
      setContractorName("");
      return;
    }
    const found = contractors.find((c) => c.id === id);
    if (found) {
      setContractorWallet(found.walletAddress ?? "");
      setContractorName(found.name);
    }
  };

  const handleSelectEngineer = (id: string) => {
    if (id === "__manual__") {
      setEngineerWallet("");
      setEngineerName("");
      return;
    }
    const found = engineers.find((e) => e.id === id);
    if (found) {
      setEngineerWallet(found.walletAddress ?? "");
      setEngineerName(found.name);
    }
  };

  const handleSign = async () => {
    setError(null);

    // Validation
    if (!contractorWallet.trim() || !engineerWallet.trim()) {
      setError("Both Contractor and Engineer wallet addresses are required.");
      return;
    }
    if (!isValidWallet(contractorWallet)) {
      setError("Invalid Contractor wallet address (must be 0x + 40 hex chars).");
      return;
    }
    if (!isValidWallet(engineerWallet)) {
      setError("Invalid Engineer wallet address (must be 0x + 40 hex chars).");
      return;
    }
    if (contractorWallet.toLowerCase() === engineerWallet.toLowerCase()) {
      setError("Contractor and Engineer cannot be the same wallet.");
      return;
    }
    if (!contractStartDate && !contractEndDate) {
      setError("Contract Start Date and End Date are required.");
      return;
    }
    if (!contractStartDate) {
      setError("Contract Start Date is empty or invalid. Please pick a valid date (e.g. April only has 30 days).");
      return;
    }
    if (!contractEndDate) {
      setError("Contract End Date is empty or invalid. Please pick a valid date.");
      return;
    }
    if (new Date(contractEndDate) <= new Date(contractStartDate)) {
      setError("Contract End Date must be after Start Date.");
      return;
    }

    setIsSigning(true);
    try {
      const numericId = project.numericProjectId ?? (parseInt(project.id.replace(/\D/g, ""), 10) || Date.now());
      const munId = project.municipalityId ?? 0;

      const result = await signMultiProjectPersonnel({
        numericProjectId: numericId,
        projectId: project.id,
        contractorAddress: contractorWallet,
        engineerAddress: engineerWallet,
        municipalityId: munId,
        municipality: project.municipality,
        description: `RD assigns Contractor "${contractorName}" and Engineer "${engineerName}" for project "${project.title}" in ${project.municipality}. Contract: ${contractStartDate} to ${contractEndDate}`,
      });

      // signMultiProjectPersonnel now THROWS on any blockchain failure.
      // If we reach here, the on-chain transaction was confirmed and result.txHash is real.
      if (!result.txHash || !result.onChainConfirmed) {
        throw new Error(
          "Blockchain transaction was not confirmed. Personnel cannot be saved without a valid on-chain record."
        );
      }

      setSignResult(result);

      // Log to backend audit trail
      await logToAuditTrail(result, {
        role: "rd",
        actionType: "MULTI_PROJECT_PERSONNEL_BOUND",
        referenceId: project.id,
        description: `RD bound personnel: Contractor ${contractorName} (${contractorWallet.slice(0, 10)}...), Engineer ${engineerName} (${engineerWallet.slice(0, 10)}...) for ${project.title} in ${project.municipality}`,
        actorName: rdDisplayName,
        projectId: project.id,
        projectName: project.title,
        region: regionName,
      }).catch(() => {});

      // Notify parent to update project
      // txHash is a REAL confirmed on-chain tx hash (signMultiProjectPersonnel throws if not)
      onSuccess(project.id, {
        contractorWallet,
        contractorName,
        engineerWallet,
        engineerName,
        personnelAssigned: true,
        personnelTxHash: result.txHash,
        blockchainDataHash: result.txHash || result.dataHash,
        contractStartDate,
        contractEndDate,
        status: "ONGOING",
      }, result);
    } catch (err) {
      if (handleGasError(err)) { setIsSigning(false); return; }
      const msg = err instanceof Error ? err.message : "Signing failed";
      if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
        setError("MetaMask signature rejected — whitelisting cancelled.");
      } else {
        setError(`Failed: ${msg}`);
      }
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Whitelist Personnel</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Project info card */}
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
            <p className="text-sm font-semibold text-foreground">{project.title}</p>
            <div className="flex flex-wrap gap-3 mt-1.5">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" /> {project.municipality}, {project.province}
              </span>
              <span className="text-xs text-muted-foreground">ID: <span className="font-mono">{project.id}</span></span>
              <span className="text-xs text-muted-foreground">Budget: {project.approvedBudget}</span>
            </div>
          </div>

          {/* Critical action warning */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground leading-relaxed">
              By signing, you <span className="font-bold">cryptographically bind</span> yourself to the legitimacy of these personnel for this project.
              This MetaMask signature is <span className="font-bold">immutable</span> on the blockchain — no finger-pointing during audits.
            </p>
          </div>

          {/* Contractor Section — Dropdown from Registry + manual fallback */}
          <div className="p-4 rounded-lg border border-border space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-primary" /> Contractor
            </h3>
            {loadingRegistry ? (
              <p className="text-xs text-muted-foreground animate-pulse">Loading registered contractors...</p>
            ) : contractors.length > 0 ? (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Select Registered Contractor <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <select
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer pr-8 truncate"
                    value={contractors.find(c => c.walletAddress === contractorWallet)?.id ?? "__manual__"}
                    onChange={(e) => handleSelectContractor(e.target.value)}
                    disabled={isSigning || !!signResult}
                  >
                    <option value="__manual__">— Enter manually —</option>
                    {contractors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.licenseNo ?? "No license"} ({c.walletAddress?.slice(0, 8)}...)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5 pointer-events-none" />
                </div>
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Contractor Name <span className="text-destructive">*</span>
              </label>
              <input
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                placeholder="e.g. ABC Construction Corp."
                disabled={isSigning || !!signResult}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Contractor Wallet Address <span className="text-destructive">*</span>
              </label>
              <input
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono"
                value={contractorWallet}
                onChange={(e) => setContractorWallet(e.target.value)}
                placeholder="0x..."
                disabled={isSigning || !!signResult}
              />
              {/* Live on-chain auth status */}
              {contractorAuthStatus === "checking" && (
                <p className="text-[10px] text-muted-foreground animate-pulse mt-1">Checking on-chain authorization...</p>
              )}
              {contractorAuthStatus === "authorized" && (
                <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Authorized on Core contract — ready for milestone submissions
                </p>
              )}
              {contractorAuthStatus === "not-authorized" && (
                // If wallet is in the loaded stakeholder registry, the RD already registered
                // them on the Gate contract (visible on Etherscan). Show a positive indicator
                // instead of a scary warning. "Whitelist on Ledger" is a separate Admin step.
                contractors.some(c => c.walletAddress?.toLowerCase() === contractorWallet.toLowerCase()) ? (
                  <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Registered on blockchain by RD
                  </p>
                ) : (
                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Wallet not found in the professional registry — register this contractor first
                  </p>
                )
              )}
            </div>
          </div>

          {/* Engineer Section — Dropdown from Registry + manual fallback */}
          <div className="p-4 rounded-lg border border-border space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-primary" /> Project Engineer
            </h3>
            {loadingRegistry ? (
              <p className="text-xs text-muted-foreground animate-pulse">Loading registered engineers...</p>
            ) : engineers.length > 0 ? (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Select Registered Engineer <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <select
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer pr-8 truncate"
                    value={engineers.find(e => e.walletAddress === engineerWallet)?.id ?? "__manual__"}
                    onChange={(e) => handleSelectEngineer(e.target.value)}
                    disabled={isSigning || !!signResult}
                  >
                    <option value="__manual__">— Enter manually —</option>
                    {engineers.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} — {e.licenseNo ?? "No license"} ({e.walletAddress?.slice(0, 8)}...)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5 pointer-events-none" />
                </div>
              </div>
            ) : null}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Engineer Full Name <span className="text-destructive">*</span>
              </label>
              <input
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                value={engineerName}
                onChange={(e) => setEngineerName(e.target.value)}
                placeholder="Engr. Juan Dela Cruz"
                disabled={isSigning || !!signResult}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Engineer Wallet Address <span className="text-destructive">*</span>
              </label>
              <input
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono"
                value={engineerWallet}
                onChange={(e) => setEngineerWallet(e.target.value)}
                placeholder="0x..."
                disabled={isSigning || !!signResult}
              />
              {/* Live on-chain auth status */}
              {engineerAuthStatus === "checking" && (
                <p className="text-[10px] text-muted-foreground animate-pulse mt-1">Checking on-chain authorization...</p>
              )}
              {engineerAuthStatus === "authorized" && (
                <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Authorized on Core contract — ready for attestations
                </p>
              )}
              {engineerAuthStatus === "not-authorized" && (
                engineers.some(e => e.walletAddress?.toLowerCase() === engineerWallet.toLowerCase()) ? (
                  <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Registered on blockchain by RD
                  </p>
                ) : (
                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Wallet not found in the professional registry — register this engineer first
                  </p>
                )
              )}
            </div>
          </div>

          {/* Contract Dates Section */}
          <div className="p-4 rounded-lg border-2 border-primary/30 bg-primary/5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-primary" /> Contract Dates (Legally Binding)
            </h3>
            <p className="text-[10px] text-muted-foreground -mt-1">
              These dates define the binding contract period. They are recorded immutably on-chain.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Contract Start Date <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-primary/30 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  value={contractStartDate}
                  onChange={(e) => setContractStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Contract End Date <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-primary/30 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  value={contractEndDate}
                  onChange={(e) => setContractEndDate(e.target.value)}
                />
              </div>
            </div>
            {project.targetDuration && (
              <p className="text-[10px] text-muted-foreground">RDC proposed target duration: <span className="font-semibold text-foreground">{project.targetDuration}</span></p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 text-xs text-destructive whitespace-pre-wrap">
              {error}
            </div>
          )}

          {/* Success / Etherscan */}
          {signResult && (
            <>
              <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-center gap-3">
                <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    Personnel bound on-chain ✓
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    TX: {signResult.txHash}
                  </p>
                </div>
                {signResult.etherscanUrl ? (
                  <a
                    href={signResult.etherscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary font-medium hover:underline flex-shrink-0"
                  >
                    Etherscan <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </div>
            </>
          )}

          {/* GAA Flow indicator */}
          <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground py-1 flex-wrap">
            <span>1. RDC Proposed</span>
            <span>&rarr;</span>
            <span>2. National Funded</span>
            <span>&rarr;</span>
            <span className="font-bold text-primary">3. RD Contracts &amp; Whitelists &larr; You are here</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
          <p className="text-[10px] text-muted-foreground">This action is <span className="font-bold text-foreground">irreversible</span></p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSigning}>
              {signResult ? "Close" : "Cancel"}
            </Button>
            {!signResult && (
              <Button size="sm" onClick={handleSign} disabled={isSigning} className="gap-1.5">
                {isSigning ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Signing...</>
                ) : (
                  <><Shield className="w-3.5 h-3.5" /> Sign & Whitelist</>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Insufficient Gas Modal ── */}
      <InsufficientGasModal open={gasError.open} onClose={clearGasError} message={gasError.message} />
    </div>
  );
}
