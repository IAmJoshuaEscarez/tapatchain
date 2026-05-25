// ════════════════════════════════════════════════════════════════
// useSignatureGate — React hook for mandatory MetaMask signing
// Wraps signatureGate.ts with loading/error state and toast feedback
// Aligned with Philippines GAA Regional Budget Flow (4-Step Process)
// ════════════════════════════════════════════════════════════════

import { useState, useCallback } from "react";
import {
  signAndLog,
  signProposal,
  signFunding,
  signPersonnelWhitelist,
  signCommitFunds,
  signEndorsement,
  signFinalWhitelist,
  signAccomplishmentReport,
  signEngineerAttestation,
  signAuditAttestation,
  logToAuditTrail,
  type SignatureGateParams,
  type SignatureGateResult,
  type SignatureRole,
} from "@/features/blockchain/services/signatureGate";

export interface UseSignatureGateReturn {
  /** Whether a signing operation is in progress */
  signing: boolean;
  /** Last error message, or null */
  error: string | null;
  /** Last successful result */
  lastResult: SignatureGateResult | null;
  /** Last Etherscan URL (persists after signing completes) */
  lastEtherscanUrl: string | null;

  // ── Core ──
  /** Generic: sign any action with MetaMask + log on-chain */
  signAction: (params: SignatureGateParams & AuditContext) => Promise<SignatureGateResult | null>;

  // ── GAA Flow Steps ──
  /** Step 1: RDC → Sign Regional Proposal */
  signRdcProposal: (p: ProposalInput) => Promise<SignatureGateResult | null>;
  /** Step 2: National Admin → Fund Project (SAA) */
  signProjectFunding: (p: FundingInput) => Promise<SignatureGateResult | null>;
  /** Step 3: RD → Personnel Whitelisting (critical pindot) */
  signPersonnel: (p: PersonnelWhitelistInput) => Promise<SignatureGateResult | null>;
  /** Step 4a: Contractor → Accomplishment Report */
  signReport: (p: AccomplishmentInput) => Promise<SignatureGateResult | null>;
  /** Step 4b: Project Engineer → Attestation */
  signEngineerAttest: (p: EngineerAttestInput) => Promise<SignatureGateResult | null>;

  // ── Legacy / Other ──
  /** National Budget Authority → Commit Funds */
  signCommit: (p: CommitFundsInput) => Promise<SignatureGateResult | null>;
  /** Regional Director → Endorse Personnel */
  signEndorse: (p: EndorsementInput) => Promise<SignatureGateResult | null>;
  /** National Admin → Final Whitelist */
  signWhitelist: (p: WhitelistInput) => Promise<SignatureGateResult | null>;
  /** COA Overseer → Audit Attestation */
  signAudit: (p: AuditInput) => Promise<SignatureGateResult | null>;

  /** Clear error state */
  clearError: () => void;
}

interface AuditContext {
  actorName: string;
  projectId?: string;
  projectName?: string;
  region?: string;
}

// ── Step 1: RDC Proposal ──
interface ProposalInput extends AuditContext {
  projectId: string;
  projectName: string;
  location: string;
  estimatedBudget: number;
  regionCode: number;
  description: string;
}

// ── Step 2: National Funding ──
interface FundingInput extends AuditContext {
  referenceId: string;
  saaReference: string;
  regionCode: number;
  allocatedAmount: number;
  description: string;
}

// ── Step 3: RD Personnel Whitelisting ──
interface PersonnelWhitelistInput extends AuditContext {
  projectId: string;
  contractorAddress: string;
  engineerAddress: string;
  noaHash: string;
  engineerLicenseHash: string;
  description: string;
}

// ── Step 4b: Engineer Attestation ──
interface EngineerAttestInput extends AuditContext {
  projectId: string;
  milestoneId: string;
  description: string;
  metadata?: Record<string, string | number | boolean>;
}

interface CommitFundsInput extends AuditContext {
  referenceId: string;
  regionCode: number;
  amount: number;
  description: string;
}

interface EndorsementInput extends AuditContext {
  referenceId: string;
  candidateAddress: string;
  candidateRole: string;
  candidateName: string;
  description: string;
}

interface WhitelistInput extends AuditContext {
  referenceId: string;
  userAddress: string;
  userRole: string;
  description: string;
}

interface AccomplishmentInput extends AuditContext {
  projectId: string;
  milestoneId: string;
  role: "contractor" | "inspector";
  description: string;
  metadata?: Record<string, string | number | boolean>;
}

interface AuditInput extends AuditContext {
  projectId: string;
  milestoneId: string;
  verdict: "ATTESTED" | "FLAGGED" | "SUSPENDED" | "DISALLOWED";
  description: string;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Hook for mandatory MetaMask signing aligned with the GAA Regional Budget flow.
 *
 * 4-Step Flow:
 * 1. `signRdcProposal` — RDC signs Regional Development Plan
 * 2. `signProjectFunding` — National Admin funds project (SAA reference)
 * 3. `signPersonnel` — RD whitelists Contractor + Project Engineer (critical pindot)
 * 4a. `signReport` — Contractor submits progress
 * 4b. `signEngineerAttest` — Project Engineer signs attestation
 */
export function useSignatureGate(): UseSignatureGateReturn {
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SignatureGateResult | null>(null);
  const [lastEtherscanUrl, setLastEtherscanUrl] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /** Wrapper that handles loading/error/success state */
  const withSigningState = useCallback(
    async <T extends SignatureGateResult>(
      fn: () => Promise<T>,
      auditParams?: SignatureGateParams & AuditContext
    ): Promise<T | null> => {
      setSigning(true);
      setError(null);
      try {
        const result = await fn();
        setLastResult(result);
        setLastEtherscanUrl(result.etherscanUrl);

        // Also log to backend audit trail
        if (auditParams) {
          logToAuditTrail(result, auditParams).catch(() => {});
        }

        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Signing failed";
        if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
          setError("Signature rejected — action cancelled.");
        } else {
          setError(msg);
        }
        return null;
      } finally {
        setSigning(false);
      }
    },
    []
  );

  // ── Core ──
  const signAction = useCallback(
    (params: SignatureGateParams & AuditContext) =>
      withSigningState(() => signAndLog(params), params),
    [withSigningState]
  );

  // ── Step 1: RDC Proposal ──
  const signRdcProposal = useCallback(
    (p: ProposalInput) =>
      withSigningState(
        () => signProposal(p),
        { role: "rdc" as SignatureRole, actionType: "PROPOSAL_SIGNED", referenceId: p.projectId, description: p.description, actorName: p.actorName, projectId: p.projectId, projectName: p.projectName, region: p.region }
      ),
    [withSigningState]
  );

  // ── Step 2: National Funding ──
  const signProjectFunding = useCallback(
    (p: FundingInput) =>
      withSigningState(
        () => signFunding(p),
        { role: "national_budget" as SignatureRole, actionType: "PROJECT_FUNDED", referenceId: p.referenceId, description: p.description, actorName: p.actorName, projectId: p.projectId, projectName: p.projectName, region: p.region }
      ),
    [withSigningState]
  );

  // ── Step 3: RD Personnel Whitelisting ──
  const signPersonnel = useCallback(
    (p: PersonnelWhitelistInput) =>
      withSigningState(
        () => signPersonnelWhitelist(p),
        { role: "rd" as SignatureRole, actionType: "PERSONNEL_WHITELISTED", referenceId: p.projectId, description: p.description, actorName: p.actorName, projectId: p.projectId, projectName: p.projectName, region: p.region }
      ),
    [withSigningState]
  );

  // ── Step 4b: Engineer Attestation ──
  const signEngineerAttest = useCallback(
    (p: EngineerAttestInput) =>
      withSigningState(
        () => signEngineerAttestation(p),
        { role: "engineer" as SignatureRole, actionType: "ENGINEER_ATTESTATION", referenceId: p.milestoneId, description: p.description, actorName: p.actorName, projectId: p.projectId, projectName: p.projectName, region: p.region }
      ),
    [withSigningState]
  );

  // ── Legacy / Other ──
  const signCommit = useCallback(
    (p: CommitFundsInput) =>
      withSigningState(
        () => signCommitFunds(p),
        { role: "national_budget" as SignatureRole, actionType: "COMMIT_FUNDS", referenceId: p.referenceId, description: p.description, actorName: p.actorName, projectId: p.projectId, projectName: p.projectName, region: p.region }
      ),
    [withSigningState]
  );

  const signEndorse = useCallback(
    (p: EndorsementInput) =>
      withSigningState(
        () => signEndorsement(p),
        { role: "rd" as SignatureRole, actionType: "ENDORSE_PERSONNEL", referenceId: p.referenceId, description: p.description, actorName: p.actorName, projectId: p.projectId, projectName: p.projectName, region: p.region }
      ),
    [withSigningState]
  );

  const signWhitelistFn = useCallback(
    (p: WhitelistInput) =>
      withSigningState(
        () => signFinalWhitelist(p),
        { role: "admin" as SignatureRole, actionType: "FINAL_WHITELIST", referenceId: p.referenceId, description: p.description, actorName: p.actorName, projectId: p.projectId, projectName: p.projectName, region: p.region }
      ),
    [withSigningState]
  );

  const signReport = useCallback(
    (p: AccomplishmentInput) =>
      withSigningState(
        () => signAccomplishmentReport(p),
        { role: p.role as SignatureRole, actionType: "ACCOMPLISHMENT_REPORT", referenceId: p.milestoneId, description: p.description, actorName: p.actorName, projectId: p.projectId, projectName: p.projectName, region: p.region }
      ),
    [withSigningState]
  );

  const signAuditFn = useCallback(
    (p: AuditInput) =>
      withSigningState(
        () => signAuditAttestation(p),
        { role: "coa_overseer" as SignatureRole, actionType: "AUDIT_ATTESTATION", referenceId: p.milestoneId, description: p.description, actorName: p.actorName, projectId: p.projectId, projectName: p.projectName, region: p.region }
      ),
    [withSigningState]
  );

  return {
    signing,
    error,
    lastResult,
    lastEtherscanUrl,
    signAction,
    // GAA Flow Steps
    signRdcProposal,
    signProjectFunding,
    signPersonnel,
    signReport,
    signEngineerAttest,
    // Legacy
    signCommit,
    signEndorse,
    signWhitelist: signWhitelistFn,
    signAudit: signAuditFn,
    clearError,
  };
}
