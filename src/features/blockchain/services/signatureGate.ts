// ════════════════════════════════════════════════════════════════
// SIGNATURE GATE — Mandatory MetaMask signing for every critical action
// Every button press → MetaMask popup → on-chain log → Etherscan link
// ════════════════════════════════════════════════════════════════

import { BrowserProvider, Contract, keccak256, toUtf8Bytes, getAddress } from "ethers";
import {
  ensureSepoliaNetwork,
  getEtherscanLink,
  InsufficientGasError,
} from "@/features/blockchain/services/blockchain";
import {
  auditTrailApi,
  type CreateAuditEntryPayload,
} from "@/features/audit-trail/api/auditTrailApi";

// ── Contract ABI (Signature Gate functions only) ──
const SIGNATURE_GATE_ABI = [
  "function logSignedAction(string _role, string _actionType, bytes32 _dataHash, string _referenceId) external",
  "function signProposal(string _projectId, string _location, uint256 _estimatedBudget, bytes32 _dataHash) external",
  "function commitFunds(string _referenceId, uint8 _regionCode, uint256 _amount, bytes32 _dataHash) external",
  "function signPersonnelWhitelist(string _projectId, address _contractor, address _engineer, bytes32 _noaHash, bytes32 _dataHash) external",
  "function signMultiProjectPersonnel(uint256 _numericProjectId, string _projectId, address _contractor, address _engineer, uint16 _municipalityId, bytes32 _dataHash) external",
  "function signEndorsement(string _referenceId, address _candidate, string _candidateRole, bytes32 _dataHash) external",
  "function registerProfessional(address _professionalAddress, string _role, string _region, string _licenseId, bytes32 _dataHash) external",
  "function signWhitelist(string _referenceId, address _user, string _role, bytes32 _dataHash) external",
  "function signAccomplishmentReport(string _projectId, string _milestoneId, bytes32 _dataHash) external",
  "function signEngineerAttestation(string _projectId, string _milestoneId, bytes32 _dataHash) external",
  "function signAuditAttestation(string _projectId, string _milestoneId, bytes32 _dataHash, string _verdict) external",
  "function signMilestonePayment(string _projectId, string _milestoneId, uint256 _amount, bytes32 _dataHash) external",
  "function core() external view returns (address)",
  "function storeDocumentHash(string _referenceId, bytes32 _documentHash, string _documentName) external",
  "function verifyDocumentIntegrity(string _referenceId, bytes32 _providedHash) external returns (bool matched)",
  "function getDocumentHash(string _referenceId) external view returns (bytes32 hash, address uploader, uint256 uploadedAt)",
  "function getSignedAction(uint256 _index) external view returns (address signer, string role, string actionType, bytes32 dataHash, string referenceId, uint256 timestamp)",
  "function getSignedActionCount() external view returns (uint256)",
  "event SignedAction(address indexed signer, string role, string actionType, bytes32 dataHash, string referenceId, uint256 timestamp)",
  "event DocumentHashStored(string indexed referenceId, bytes32 documentHash, address indexed uploader, string documentName, uint256 timestamp)",
  "event ProposalSigned(string indexed projectId, string location, uint256 estimatedBudget, address indexed proposer, uint256 timestamp)",
  "event FundsCommitted(string indexed referenceId, uint8 regionCode, uint256 amount, address indexed authority, uint256 timestamp)",
  "event PersonnelWhitelisted(string indexed projectId, address indexed rd, address contractor, address engineer, bytes32 noaHash, uint256 timestamp)",
  "event MultiProjectPersonnelBound(uint256 indexed numericProjectId, string projectId, address indexed contractor, address indexed engineer, uint16 municipalityId, bytes32 dataHash, uint256 timestamp)",
  "event EndorsementSigned(string indexed referenceId, address indexed endorser, address indexed candidate, string candidateRole, uint256 timestamp)",
  "event WhitelistFinalized(string indexed referenceId, address indexed admin, address indexed user, string role, uint256 timestamp)",
  "event AccomplishmentReportSigned(string indexed projectId, string indexed milestoneId, address indexed reporter, bytes32 dataHash, uint256 timestamp)",
  "event EngineerAttestationSigned(string indexed projectId, string indexed milestoneId, address indexed engineer, bytes32 dataHash, uint256 timestamp)",
  "event AuditAttested(string indexed projectId, string indexed milestoneId, address indexed auditor, bytes32 dataHash, string verdict, uint256 timestamp)",
  "event MilestonePaymentAuthorized(string indexed projectId, string indexed milestoneId, address indexed rd, uint256 amount, bytes32 dataHash, uint256 timestamp)",
  "event ProfessionalRegistered(address indexed professionalAddress, string role, string region, string licenseId, address indexed registeredBy, bytes32 dataHash, uint256 timestamp)",
  "event IntegrityVerified(string indexed referenceId, bytes32 storedHash, bytes32 providedHash, bool matched, address indexed verifier, uint256 timestamp)",
];

const GATE_CONTRACT_ADDRESS =
  import.meta.env.VITE_GATE_CONTRACT_ADDRESS || "";

// ── Types ──

export type SignatureRole =
  | "admin"
  | "rd"
  | "national_budget"
  | "contractor"
  | "inspector"
  | "engineer"
  | "coa_overseer"
  | "auditor"
  | "rdc";

export type SignatureActionType =
  | "COMMIT_FUNDS"
  | "ENDORSE_PERSONNEL"
  | "FINAL_WHITELIST"
  | "PROPOSAL_SIGNED"
  | "PROJECT_FUNDED"
  | "PERSONNEL_WHITELISTED"
  | "MULTI_PROJECT_PERSONNEL_BOUND"
  | "ACCOMPLISHMENT_REPORT"
  | "ENGINEER_ATTESTATION"
  | "AUDIT_ATTESTATION"
  | "PROJECT_PROPOSED"
  | "PROGRESS_SUBMITTED"
  | "MILESTONE_APPROVED"
  | "MILESTONE_REJECTED"
  | "DOCUMENT_UPLOADED"
  | "BUDGET_ALLOCATED"
  | "PROJECT_ENDORSED"
  | "FUND_RELEASED"
  | "PROFESSIONAL_REGISTERED"
  | "MILESTONE_PAYMENT_AUTHORIZED"
  | string;

export interface SignatureGateResult {
  signature: string;
  txHash: string;
  etherscanUrl: string;
  dataHash: string;
  signer: string;
  timestamp: string;
  /** true when the on-chain contract call was mined; false/undefined = off-chain only */
  onChainConfirmed?: boolean;
}

export interface SignatureGateParams {
  role: SignatureRole;
  actionType: SignatureActionType;
  referenceId: string;
  description: string;
  metadata?: Record<string, string | number | boolean>;
}

// ── Helpers ──

function getProvider(): BrowserProvider {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is not installed");
  }
  return new BrowserProvider(window.ethereum);
}

function getContract(signer: import("ethers").Signer): Contract {
  if (!GATE_CONTRACT_ADDRESS)
    throw new Error(
      "Gate contract address not configured (VITE_GATE_CONTRACT_ADDRESS)"
    );
  return new Contract(GATE_CONTRACT_ADDRESS, SIGNATURE_GATE_ABI, signer);
}

/**
 * Check if an error from ethers.js/MetaMask is a gas-related error.
 * If so, throw InsufficientGasError so the UI can show the modal.
 */
function throwIfGasError(err: unknown): void {
  const msg = (err as { message?: string })?.message?.toLowerCase() || "";
  const reason = (err as { reason?: string })?.reason?.toLowerCase() || "";
  const code = (err as { code?: string })?.code || "";
  if (
    msg.includes("insufficient funds") ||
    msg.includes("insufficient funds for intrinsic transaction cost") ||
    reason.includes("insufficient funds") ||
    code === "INSUFFICIENT_FUNDS"
  ) {
    throw new InsufficientGasError(
      `INSUFFICIENT_GAS: Your MetaMask wallet does not have enough Sepolia ETH for gas fees. ${(err as Error)?.message || ""}`
    );
  }
}

/**
 * Extract a human-readable revert reason from a Solidity custom error.
 * Works with ethers.js v6 error shapes and MetaMask error wrappers.
 */

// Solidity custom error selectors (first 4 bytes of keccak256 of the error signature)
const CUSTOM_ERROR_MAP: Record<string, string> = {
  "0x82b42900": "Unauthorized",
  "0xfb87e3d2": "NotWhitelisted",
  "0x84b5e255": "InvalidRegion",
  "0x2c5211c6": "ProjectNotFound",
  "0xb1060e59": "WrongRegion",
  "0x82fc7ee5": "EmptyHash",
  "0x18e5f16d": "AlreadyStored",
  "0xf50f3e55": "NotStored",
  "0x8dbae0a8": "OutOfBounds",
  "0xcc3e2c83": "WrongRole",
};

function extractRevertReason(err: unknown): string {
  const raw = (err as { reason?: string })?.reason || "";
  const msg = (err as { message?: string })?.message || "";
  const data = (err as { data?: { message?: string; data?: string } })?.data?.message || "";
  const hexData = (err as { data?: string })?.data                    // ethers v6 shape
    || (err as { error?: { data?: string } })?.error?.data            // nested error
    || (err as { data?: { data?: string } })?.data?.data              // MetaMask shape
    || "";

  // Decode custom error selectors from hex revert data
  if (typeof hexData === "string" && hexData.startsWith("0x") && hexData.length >= 10) {
    const selector = hexData.slice(0, 10).toLowerCase();
    const errorName = CUSTOM_ERROR_MAP[selector];
    if (errorName) {
      switch (errorName) {
        case "NotWhitelisted":
          return "NotWhitelisted — Your wallet is not whitelisted on the blockchain. Ask the Admin to whitelist your wallet first.";
        case "WrongRole":
          return "WrongRole — Your wallet is registered but does not have the correct role for this action.";
        case "WrongRegion":
          return "WrongRegion — Your wallet's region does not match the project's region on the blockchain.";
        case "ProjectNotFound":
          return "ProjectNotFound — Project not found on the blockchain. The project must be proposed and registered on-chain first.";
        case "Unauthorized":
          return "Unauthorized — Only the contract owner can perform this action.";
        default:
          return `Contract error: ${errorName}`;
      }
    }
  }

  // Also scan the full error message in case the selector appears in a hex dump
  const fullText = `${raw} ${msg} ${data} ${hexData}`.toLowerCase();

  // Check for the function selector being returned as the "error" (node quirk)
  // 0x89cf0a84 = signMilestonePayment selector — if we see this, the real revert is buried
  if (fullText.includes("0x89cf0a84") || (typeof hexData === "string" && hexData.length > 100 && hexData.startsWith("0x89cf0a84"))) {
    return "NotWhitelisted — The Gate contract rejected the transaction. Your wallet may not be whitelisted on the Core contract that the Gate references. Ask the Admin to re-deploy the Gate with the correct Core address, or re-whitelist your wallet.";
  }

  const combined = fullText;

  if (combined.includes("projectnotfound")) {
    return "Project not found on the blockchain. The project must be proposed and registered on-chain before milestones can be submitted.";
  }
  if (combined.includes("notwhitelisted")) {
    return "Your wallet is not whitelisted on the blockchain. Ask the Admin to whitelist your wallet first.";
  }
  if (combined.includes("wrongregion")) {
    return "Region mismatch — your wallet's region does not match the project's region on the blockchain.";
  }
  if (combined.includes("wrongrole")) {
    return "Your wallet is registered but does not have the correct role for this action.";
  }
  if (combined.includes("user denied") || combined.includes("user rejected")) {
    return "Transaction was rejected in MetaMask.";
  }
  if (combined.includes("execution reverted")) {
    return `Smart contract reverted the transaction. ${raw || msg}`.trim();
  }
  return raw || msg || "Unknown blockchain error";
}

// ── Core contract authorization check ──
// We query the TapatChain CORE contract to see if the wallet is authorized
// BEFORE attempting any Gate contract transaction. This prevents MetaMask from
// showing the "Review alert" warning for a transaction that would revert.
const CORE_CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
const CORE_CHECK_ABI = [
  "function checkAuthorization(address _user) external view returns (bool isAuthorized, string memory role, uint8 regionCode)",
  "function getProjectInfo(string memory _pid) external view returns (uint8 regionCode, address contractor, address siteEngineer, address coaAuditor, string memory status, bool exists)",
];

// ABI for Core project lifecycle functions called alongside Gate transactions
const CORE_PROJECT_LIFECYCLE_ABI = [
  "function createProject(string memory _pid, uint8 _regionCode, bytes32 _dataHash) external",
  "function fundProject(string memory _pid, bytes32 _saaHash, uint256 _allocatedAmount) external",
  "function assignProjectPersonnel(string memory _pid, address _contractor, address _siteEngineer, address _coaAuditor) external",
  "function finalizeProject(string memory _projectId) external",
  "function checkAuthorization(address _user) external view returns (bool isAuthorized, string memory role, uint8 regionCode)",
  "function getProjectInfo(string memory _pid) external view returns (uint8 regionCode, address contractor, address siteEngineer, address coaAuditor, string memory status, bool exists)",
];

async function isWalletAuthorizedOnChain(
  signer: import("ethers").Signer
): Promise<boolean> {
  try {
    if (!CORE_CONTRACT_ADDRESS) return true; // no contract configured — let actual tx decide
    const address = await signer.getAddress();
    const coreContract = new Contract(CORE_CONTRACT_ADDRESS, CORE_CHECK_ABI, signer);
    const [isAuthorized] = await coreContract.checkAuthorization(address);
    return Boolean(isAuthorized);
  } catch {
    // If the read-only check itself fails (RPC error, network glitch, wrong node)
    // do NOT falsely block the user — let the actual contract call enforce authorization.
    // The Gate contract independently verifies authorization on every write, so
    // a failed pre-check here should never silently deny a legitimate user.
    return true;
  }
}

/**
 * Check if a SPECIFIC wallet address is authorized on the core TapatChain contract.
 * Unlike isWalletAuthorizedOnChain (which checks the signer), this accepts any address.
 * Used by signMultiProjectPersonnel to pre-validate contractor & engineer wallets.
 */
export async function isAddressAuthorizedOnChain(
  signer: import("ethers").Signer,
  address: string
): Promise<boolean> {
  if (!CORE_CONTRACT_ADDRESS) {
    throw new Error("VITE_CONTRACT_ADDRESS is not configured — cannot check on-chain authorization.");
  }
  const coreContract = new Contract(CORE_CONTRACT_ADDRESS, CORE_CHECK_ABI, signer);
  const [isAuthorized] = await coreContract.checkAuthorization(address);
  return Boolean(isAuthorized);
}

/**
 * Pre-check whether a project exists on the core TapatChain blockchain contract.
 * Returns true if the project is registered, false otherwise.
 */
async function isProjectOnChain(
  signer: import("ethers").Signer,
  projectId: string
): Promise<boolean> {
  try {
    if (!CORE_CONTRACT_ADDRESS) return false;
    const coreContract = new Contract(CORE_CONTRACT_ADDRESS, CORE_CHECK_ABI, signer);
    const [, , , , , exists] = await coreContract.getProjectInfo(projectId);
    return Boolean(exists);
  } catch {
    return false;
  }
}

function buildSignMessage(params: SignatureGateParams): string {
  const lines = [
    "═══ TapatChain Signature Gate ═══",
    "",
    `Action: ${params.actionType}`,
    `Role: ${params.role}`,
    `Reference: ${params.referenceId}`,
    `Description: ${params.description}`,
    `Timestamp: ${new Date().toISOString()}`,
  ];
  if (params.metadata) {
    lines.push("", "── Additional Data ──");
    for (const [key, value] of Object.entries(params.metadata)) {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push(
    "",
    "By signing, you confirm this action is authentic and verifiable on the blockchain."
  );
  return lines.join("\n");
}

export function computeActionHash(params: SignatureGateParams): string {
  const raw = JSON.stringify({
    role: params.role,
    actionType: params.actionType,
    referenceId: params.referenceId,
    description: params.description,
    metadata: params.metadata,
  });
  return keccak256(toUtf8Bytes(raw));
}

// ── CORE: signAndLog ──
// Used ONLY for generic actions that don't have a dedicated contract method.

export async function signAndLog(
  params: SignatureGateParams
): Promise<SignatureGateResult> {
  const onSepolia = await ensureSepoliaNetwork();
  if (!onSepolia)
    throw new Error("Please switch MetaMask to Sepolia Testnet");

  const provider = getProvider();
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  const timestamp = new Date().toISOString();

  const message = buildSignMessage(params);
  const signature = await signer.signMessage(message);
  const dataHash = computeActionHash(params);

  // Pre-check: only attempt the on-chain transaction if the wallet is
  // already authorized on the core contract. This prevents MetaMask from
  // showing a "Review alert" for a transaction that would revert.
  const authorized = await isWalletAuthorizedOnChain(signer);

  if (!authorized) {
    throw new Error(
      "Your wallet is not whitelisted on the blockchain.\n\n" +
      "The National Admin must click 'Whitelist on Ledger' for your wallet in User Management before this action can be performed."
    );
  }

  let txHash: string;
  try {
    const contract = getContract(signer);
    const tx = await contract.logSignedAction(
      params.role,
      params.actionType,
      dataHash,
      params.referenceId
    );
    txHash = tx.hash;
    await tx.wait();
  } catch (err: unknown) {
    throwIfGasError(err);
    const reason = extractRevertReason(err);
    throw new Error(
      `Blockchain transaction failed: ${reason}\n\n` +
      "No data was saved. Please check your wallet authorization and try again."
    );
  }

  return {
    signature,
    txHash,
    etherscanUrl: getEtherscanLink(txHash),
    dataHash,
    signer: signerAddress,
    timestamp,
    onChainConfirmed: true,
  };
}

// ── signMessageOnly — for functions that already call _logAction on-chain ──
// Signs only the personal MetaMask message (1 popup) and returns the signer
// instance for the caller to use with its specific contract method (1 more popup).
// This avoids the duplicate logSignedAction transaction that every specific
// Solidity function already does internally via _logAction.

async function signMessageOnly(
  params: SignatureGateParams
): Promise<SignatureGateResult & { _signer: import("ethers").Signer }> {
  const onSepolia = await ensureSepoliaNetwork();
  if (!onSepolia)
    throw new Error("Please switch MetaMask to Sepolia Testnet");

  const provider = getProvider();
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  const timestamp = new Date().toISOString();

  const message = buildSignMessage(params);
  const signature = await signer.signMessage(message);
  const dataHash = computeActionHash(params);

  return {
    signature,
    txHash: "",
    etherscanUrl: "",
    dataHash,
    signer: signerAddress,
    timestamp,
    _signer: signer,
  };
}

// ── STEP 1: RDC Proposal ──

export async function signProposal(params: {
  projectId: string;
  projectName: string;
  location: string;
  estimatedBudget: number;
  regionCode: number;
  description: string;
}): Promise<SignatureGateResult> {
  const base = await signMessageOnly({
    role: "rdc",
    actionType: "PROPOSAL_SIGNED",
    referenceId: params.projectId,
    description: params.description,
    metadata: {
      projectName: params.projectName,
      location: params.location,
      estimatedBudget: params.estimatedBudget,
    },
  });

  // ── Step A: Register project on Core contract FIRST ──
  // Core.createProject must succeed so that downstream milestone submissions
  // (Gate.signAccomplishmentReport → Core.getProjectInfo) can find the project.
  if (CORE_CONTRACT_ADDRESS) {
    const effectiveRegion = params.regionCode > 0 ? params.regionCode : 11; // fallback to region 11 if not set
    try {
      const coreContract = new Contract(CORE_CONTRACT_ADDRESS, CORE_PROJECT_LIFECYCLE_ABI, base._signer);
      const coreTx = await coreContract.createProject(
        params.projectId,
        effectiveRegion,
        base.dataHash
      );
      await coreTx.wait();
      console.log(`[SignatureGate] Project registered on Core contract (region ${effectiveRegion})`);
    } catch (coreErr: unknown) {
      throwIfGasError(coreErr);
      // If project already exists on Core, that's fine — continue to Gate
      const reason = extractRevertReason(coreErr);
      if (reason.toLowerCase().includes("already") || reason.toLowerCase().includes("exists")) {
        console.log("[SignatureGate] Project already exists on Core — proceeding to Gate");
      } else {
        // Non-fatal: log and continue — Gate proposal can still proceed
        console.warn("[SignatureGate] Core.createProject failed (continuing to Gate):", reason);
      }
    }
  }

  // ── Step B: Log proposal on Gate contract ──
  try {
    const contract = getContract(base._signer);
    const tx = await contract.signProposal(
      params.projectId,
      params.location,
      BigInt(Math.round(params.estimatedBudget * 100)),
      base.dataHash
    );
    base.txHash = tx.hash;
    base.etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
  } catch (err) {
    throwIfGasError(err);
    const reason = extractRevertReason(err);
    throw new Error(
      `Blockchain transaction failed: ${reason}\n\n` +
      "Proposal was NOT saved. Please ensure your wallet is whitelisted on-chain and try again."
    );
  }

  base.onChainConfirmed = true;
  return base;
}

// ── STEP 2: National Funding ──

export async function signFunding(params: {
  referenceId: string;
  saaReference: string;
  regionCode: number;
  allocatedAmount: number;
  description: string;
}): Promise<SignatureGateResult> {
  const base = await signMessageOnly({
    role: "national_budget",
    actionType: "PROJECT_FUNDED",
    referenceId: params.referenceId,
    description: params.description,
    metadata: {
      saaReference: params.saaReference,
      regionCode: params.regionCode,
      allocatedAmount: params.allocatedAmount,
    },
  });

  // ── Best-effort: Advance project to FUNDED on Core contract ──
  // This keeps Core state in sync but is NOT required for milestone submission
  // (Gate.signAccomplishmentReport only checks core.getProjectInfo().exists, not status).
  // Non-fatal — if it fails, Gate funding still proceeds.
  if (CORE_CONTRACT_ADDRESS) {
    try {
      const coreContract = new Contract(CORE_CONTRACT_ADDRESS, CORE_PROJECT_LIFECYCLE_ABI, base._signer);
      const saaHash = keccak256(toUtf8Bytes(params.saaReference || params.referenceId));
      const coreTx = await coreContract.fundProject(
        params.referenceId,
        saaHash,
        BigInt(Math.round(params.allocatedAmount * 100))
      );
      await coreTx.wait();
      console.log("[SignatureGate] Project funded on Core contract");
    } catch (coreErr: unknown) {
      // Non-fatal — log and continue to Gate
      console.warn("[SignatureGate] Core.fundProject best-effort failed (continuing to Gate):", coreErr);
    }
  }

  // ── Log funding on Gate contract (mandatory) ──
  try {
    const contract = getContract(base._signer);
    const tx = await contract.commitFunds(
      params.referenceId,
      params.regionCode,
      BigInt(Math.round(params.allocatedAmount * 100)),
      base.dataHash
    );
    base.txHash = tx.hash;
    base.etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
  } catch (err) {
    throwIfGasError(err);
    const reason = extractRevertReason(err);
    throw new Error(
      `Blockchain transaction failed: ${reason}\n\n` +
      "Funding was NOT saved. Please ensure your admin wallet is whitelisted on-chain and try again."
    );
  }

  base.onChainConfirmed = true;
  return base;
}

// ── STEP 3: RD Personnel Whitelisting ──
// The RD signs a MetaMask personal message binding them to the personnel assignment.
// We attempt an on-chain log via the Gate contract. If the RD's wallet is not yet
// authorized on the core TapatChain contract (admin must "Whitelist on Ledger" first),
// the call falls back to signature-only mode. The MetaMask signature + dataHash is
// cryptographic proof regardless of on-chain status.
// NOTE: No batch splitting needed — the single combined event is the correct approach.

export async function signPersonnelWhitelist(params: {
  projectId: string;
  contractorAddress: string;
  engineerAddress: string;
  noaHash: string;
  engineerLicenseHash: string;
  description: string;
}): Promise<SignatureGateResult> {
  const contractor = getAddress(params.contractorAddress);
  const engineer = getAddress(params.engineerAddress);

  return signAndLog({
    role: "rd",
    actionType: "PERSONNEL_WHITELISTED",
    referenceId: params.projectId,
    description: params.description,
    metadata: {
      contractor,
      engineer,
      noaHash: params.noaHash,
      engineerLicenseHash: params.engineerLicenseHash,
    },
  });
}

// ── STEP 3b: Multi-Project Personnel Binding ──
// Same principle — one combined MetaMask signature covers both contractor + engineer.
// This is correct; no need to split into two separate transactions.
// On-chain: tries Gate contract first, falls back to logSignedAction.
// THROWS on failure — the RD must see a clear error if personnel binding fails on-chain.

export async function signMultiProjectPersonnel(params: {
  numericProjectId: number;
  projectId: string;
  contractorAddress: string;
  engineerAddress: string;
  municipalityId: number;
  municipality: string;
  description: string;
}): Promise<SignatureGateResult> {
  const contractor = getAddress(params.contractorAddress);
  const engineer = getAddress(params.engineerAddress);

  // Try the specialized Gate contract function first (emits richer event with both addresses)
  const onSepolia = await ensureSepoliaNetwork();
  if (!onSepolia) throw new Error("Please switch MetaMask to Sepolia Testnet");

  const provider = getProvider();
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  const timestamp = new Date().toISOString();

  const message = buildSignMessage({
    role: "rd",
    actionType: "MULTI_PROJECT_PERSONNEL_BOUND",
    referenceId: params.projectId,
    description: params.description,
    metadata: {
      numericProjectId: params.numericProjectId,
      contractor,
      engineer,
      municipalityId: params.municipalityId,
      municipality: params.municipality,
    },
  });

  const signature = await signer.signMessage(message);
  const dataHash = computeActionHash({
    role: "rd",
    actionType: "MULTI_PROJECT_PERSONNEL_BOUND",
    referenceId: params.projectId,
    description: params.description,
    metadata: {
      numericProjectId: params.numericProjectId,
      contractor,
      engineer,
      municipalityId: params.municipalityId,
      municipality: params.municipality,
    },
  });

  // Pre-check: query the core contract BEFORE sending any transaction.
  // If the RD wallet is not yet on-chain authorized, throw immediately
  // with a clear error message instead of silently falling back.
  const authorized = await isWalletAuthorizedOnChain(signer);
  if (!authorized) {
    throw new Error(
      "Your RD wallet is not whitelisted on the blockchain.\n\n" +
      "The National Admin must click 'Whitelist on Ledger' for your RD wallet in User Management before you can assign personnel."
    );
  }

  // NOTE: We intentionally do NOT pre-check contractor/engineer wallet authorization here.
  // The Gate contract's signMultiProjectPersonnel only requires the CALLER (RD) to be whitelisted.
  // The contractor/engineer wallets can be authorized by the Admin AFTER the RD binds them.
  // The contractor only needs Core authorization when they attempt to submit milestones.

  // ── Log personnel binding on Gate contract (mandatory) ──
  let txHash = "";
  let etherscanUrl = "";

  // Attempt 1: specialized function (richer on-chain event with both addresses)
  try {
    const contract = getContract(signer);
    const tx = await contract.signMultiProjectPersonnel(
      BigInt(params.numericProjectId),
      params.projectId,
      contractor,
      engineer,
      params.municipalityId,
      dataHash
    );
    txHash = tx.hash;
    etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
  } catch (outerErr) {
    throwIfGasError(outerErr);
    console.warn("[SignatureGate] signMultiProjectPersonnel attempt 1 failed, trying logSignedAction:", outerErr);

    // Attempt 2: generic logSignedAction (same onlyWhitelisted guard, but simpler)
    try {
      const contract = getContract(signer);
      const tx = await contract.logSignedAction(
        "rd",
        "MULTI_PROJECT_PERSONNEL_BOUND",
        dataHash,
        params.projectId
      );
      txHash = tx.hash;
      etherscanUrl = getEtherscanLink(tx.hash);
      await tx.wait();
    } catch (innerErr) {
      throwIfGasError(innerErr);
      const reason = extractRevertReason(innerErr);
      console.error("[SignatureGate] Both on-chain attempts for personnel binding failed:", innerErr);
      throw new Error(
        `Blockchain transaction failed: ${reason}\n\n` +
        "Personnel were NOT saved on-chain. Please ensure your RD wallet is properly whitelisted and try again."
      );
    }
  }

  // ── Best-effort: Assign personnel on Core contract ──
  // Keeps Core state in sync but NOT required for milestone submission
  // (Gate.signAccomplishmentReport only checks project exists, not status).
  if (CORE_CONTRACT_ADDRESS) {
    try {
      const coreContract = new Contract(CORE_CONTRACT_ADDRESS, CORE_PROJECT_LIFECYCLE_ABI, signer);
      const coreTx = await coreContract.assignProjectPersonnel(
        params.projectId,
        contractor,
        engineer,
        "0x0000000000000000000000000000000000000000"
      );
      await coreTx.wait();
      console.log("[SignatureGate] Personnel assigned on Core contract");
    } catch (coreErr) {
      console.warn("[SignatureGate] Core.assignProjectPersonnel best-effort failed:", coreErr);
    }
  }

  return {
    signature,
    txHash,
    etherscanUrl,
    dataHash,
    signer: signerAddress,
    timestamp,
    onChainConfirmed: true,
  };
}

// ── STEP 2.5: RD Professional Registration ──
// The RD registers a Contractor or Site Engineer on-chain.
// This creates an immutable record that the RD vouched for the professional.
// ALSO authorizes the professional on the Core contract so they can
// immediately submit milestones / sign attestations without Admin intervention.
// THROWS on failure — professional registration MUST be on-chain.

// ABI for the new Core function that lets RDs authorize contractors/engineers
const CORE_AUTHORIZE_PERSONNEL_ABI = [
  "function authorizePersonnelByRD(address _user, string memory _role, uint8 _regionCode) external",
  "function checkAuthorization(address _user) external view returns (bool isAuthorized, string memory role, uint8 regionCode)",
];

export async function signRegisterProfessional(params: {
  professionalAddress: string;
  role: "Contractor" | "SiteEngineer";
  region: string;
  licenseId: string;
  name: string;
  description: string;
  /** RD's numeric region code — passed to Core contract for authorization */
  regionCode?: number;
}): Promise<SignatureGateResult> {
  const professional = getAddress(params.professionalAddress);

  const onSepolia = await ensureSepoliaNetwork();
  if (!onSepolia) throw new Error("Please switch MetaMask to Sepolia Testnet");

  const provider = getProvider();
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  const timestamp = new Date().toISOString();

  const gateParams: SignatureGateParams = {
    role: "rd",
    actionType: "PROFESSIONAL_REGISTERED",
    referenceId: params.licenseId,
    description: params.description,
    metadata: {
      professionalAddress: professional,
      professionalRole: params.role,
      professionalName: params.name,
      region: params.region,
      licenseId: params.licenseId,
    },
  };

  const message = buildSignMessage(gateParams);
  const signature = await signer.signMessage(message);
  const dataHash = computeActionHash(gateParams);

  let txHash = "";
  let etherscanUrl = "";

  const authorized = await isWalletAuthorizedOnChain(signer);
  if (!authorized) {
    throw new Error(
      "Your RD wallet is not whitelisted on the blockchain.\n\n" +
      "The National Admin must click 'Whitelist on Ledger' for your RD wallet in User Management before you can register professionals."
    );
  }

  // Try the specific registerProfessional function first
  try {
    const contract = getContract(signer);
    const tx = await contract.registerProfessional(
      professional,
      params.role,
      params.region,
      params.licenseId,
      dataHash
    );
    txHash = tx.hash;
    etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
  } catch (outerErr) {
    throwIfGasError(outerErr);
    console.warn("[SignatureGate] registerProfessional attempt 1 failed, trying logSignedAction:", outerErr);

    // Fallback to generic logSignedAction
    try {
      const contract = getContract(signer);
      const tx = await contract.logSignedAction(
        "rd",
        "PROFESSIONAL_REGISTERED",
        dataHash,
        params.licenseId
      );
      txHash = tx.hash;
      etherscanUrl = getEtherscanLink(tx.hash);
      await tx.wait();
    } catch (innerErr) {
      throwIfGasError(innerErr);
      const reason = extractRevertReason(innerErr);
      console.error("[SignatureGate] Professional registration failed on-chain:", innerErr);
      throw new Error(
        `Blockchain transaction failed: ${reason}\n\n` +
        "Professional was NOT registered on-chain. Please ensure your RD wallet is properly whitelisted and try again."
      );
    }
  }

  // ── Authorize on Core contract ──
  // The Gate registration above only LOGS the professional. The Core contract's
  // checkAuthorization still returns false. We need to call authorizePersonnelByRD
  // on Core so the professional can actually submit milestones / sign attestations.
  if (CORE_CONTRACT_ADDRESS) {
    try {
      // Check if already authorized (e.g. Admin whitelisted them separately)
      const alreadyAuthorized = await isAddressAuthorizedOnChain(signer, professional);
      if (!alreadyAuthorized) {
        // Map frontend role to the on-chain role string that the Gate contract expects
        const coreRole = params.role === "Contractor" ? "contractor" : "inspector";
        const regionCode = params.regionCode ?? 0;

        const coreContract = new Contract(CORE_CONTRACT_ADDRESS, CORE_AUTHORIZE_PERSONNEL_ABI, signer);
        const coreTx = await coreContract.authorizePersonnelByRD(professional, coreRole, regionCode);
        await coreTx.wait();
        console.log("[SignatureGate] Professional authorized on Core contract:", coreTx.hash);
      } else {
        console.log("[SignatureGate] Professional already authorized on Core — skipping.");
      }
    } catch (coreErr: any) {
      // Don't fail the whole registration — the Gate log already succeeded.
      // But warn so the user knows the professional may need Admin whitelisting.
      const reason = extractRevertReason(coreErr);
      console.warn("[SignatureGate] Core authorizePersonnelByRD failed (Gate registration still succeeded):", reason, coreErr);
      // If it's AlreadyAuthorized, that's fine — no action needed.
      if (!reason.toLowerCase().includes("already")) {
        console.warn(
          "Professional was logged on Gate but NOT authorized on Core. " +
          "Admin may need to 'Whitelist on Ledger' for them to submit milestones."
        );
      }
    }
  }

  return {
    signature,
    txHash,
    etherscanUrl,
    dataHash,
    signer: signerAddress,
    timestamp,
    onChainConfirmed: true,
  };
}

// ── signCommitFunds ──

export async function signCommitFunds(params: {
  referenceId: string;
  regionCode: number;
  amount: number;
  description: string;
}): Promise<SignatureGateResult> {
  const base = await signMessageOnly({
    role: "national_budget",
    actionType: "COMMIT_FUNDS",
    referenceId: params.referenceId,
    description: params.description,
    metadata: { regionCode: params.regionCode, amount: params.amount },
  });

  try {
    const contract = getContract(base._signer);
    const tx = await contract.commitFunds(
      params.referenceId,
      params.regionCode,
      BigInt(Math.round(params.amount * 100)),
      base.dataHash
    );
    base.txHash = tx.hash;
    base.etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
  } catch (err) {
    throwIfGasError(err);
    const reason = extractRevertReason(err);
    throw new Error(
      `Blockchain transaction failed: ${reason}\n\n` +
      "Funds were NOT committed. Please ensure your wallet is whitelisted on-chain and try again."
    );
  }

  base.onChainConfirmed = true;
  return base;
}

// ── signEndorsement ──

export async function signEndorsement(params: {
  referenceId: string;
  candidateAddress: string;
  candidateRole: string;
  candidateName: string;
  description: string;
}): Promise<SignatureGateResult> {
  const candidate = getAddress(params.candidateAddress);

  const base = await signMessageOnly({
    role: "rd",
    actionType: "ENDORSE_PERSONNEL",
    referenceId: params.referenceId,
    description: params.description,
    metadata: {
      candidate,
      candidateRole: params.candidateRole,
      candidateName: params.candidateName,
    },
  });

  try {
    const contract = getContract(base._signer);
    const tx = await contract.signEndorsement(
      params.referenceId,
      candidate,
      params.candidateRole,
      base.dataHash
    );
    base.txHash = tx.hash;
    base.etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
  } catch (err) {
    throwIfGasError(err);
    const reason = extractRevertReason(err);
    throw new Error(
      `Blockchain transaction failed: ${reason}\n\n` +
      "Endorsement was NOT saved. Please ensure your wallet is whitelisted on-chain and try again."
    );
  }

  base.onChainConfirmed = true;
  return base;
}

// ── signFinalWhitelist ──

export async function signFinalWhitelist(params: {
  referenceId: string;
  userAddress: string;
  userRole: string;
  description: string;
}): Promise<SignatureGateResult> {
  const user = getAddress(params.userAddress);

  const base = await signMessageOnly({
    role: "admin",
    actionType: "FINAL_WHITELIST",
    referenceId: params.referenceId,
    description: params.description,
    metadata: { user, role: params.userRole },
  });

  try {
    const contract = getContract(base._signer);
    const tx = await contract.signWhitelist(
      params.referenceId,
      user,
      params.userRole,
      base.dataHash
    );
    base.txHash = tx.hash;
    base.etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
  } catch (err) {
    throwIfGasError(err);
    const reason = extractRevertReason(err);
    throw new Error(
      `Blockchain transaction failed: ${reason}\n\n` +
      "Whitelist action was NOT saved on-chain. Please check your admin wallet authorization and try again."
    );
  }

  base.onChainConfirmed = true;
  return base;
}

// ── signAccomplishmentReport ──

export async function signAccomplishmentReport(params: {
  projectId: string;
  milestoneId: string;
  role: "contractor" | "inspector";
  description: string;
  metadata?: Record<string, string | number | boolean>;
}): Promise<SignatureGateResult> {
  const base = await signMessageOnly({
    role: params.role,
    actionType: "ACCOMPLISHMENT_REPORT",
    referenceId: params.milestoneId,
    description: params.description,
    metadata: { projectId: params.projectId, ...params.metadata },
  });

  // ── Pre-check: Verify wallet authorization ──
  // Required by the Solidity contract. Checking upfront gives a clear error.
  const authorized = await isWalletAuthorizedOnChain(base._signer);
  if (!authorized) {
    throw new Error(
      "Your wallet is not whitelisted on the blockchain.\n\n" +
      "The Admin must click 'Whitelist on Ledger' for your contractor wallet before you can submit milestones."
    );
  }

  // ── Ensure project exists on Core ──
  // The Gate contract's signAccomplishmentReport calls core.getProjectInfo and
  // reverts with ProjectNotFound if the project isn't registered on Core.
  // RDC's signProposal tries to register, but may fail if RDC isn't authorized on Core.
  // As a safety net, the contractor (who IS authorized) registers it now if missing.
  const projectExists = await isProjectOnChain(base._signer, params.projectId);
  if (!projectExists && CORE_CONTRACT_ADDRESS) {
    console.log("[SignatureGate] Project not on Core — contractor will register it now");
    try {
      // Get contractor's regionCode from Core to use for project creation
      const coreContract = new Contract(CORE_CONTRACT_ADDRESS, CORE_PROJECT_LIFECYCLE_ABI, base._signer);
      const signerAddr = await base._signer.getAddress();
      const [, , contractorRegion] = await new Contract(CORE_CONTRACT_ADDRESS, CORE_CHECK_ABI, base._signer).checkAuthorization(signerAddr);
      const region = Number(contractorRegion) || 11;
      const dataHash = keccak256(toUtf8Bytes(params.projectId));
      const coreTx = await coreContract.createProject(params.projectId, region, dataHash);
      await coreTx.wait();
      console.log(`[SignatureGate] Contractor registered project on Core (region ${region})`);
    } catch (regErr) {
      // If it fails (already exists, etc.), log and let the Gate tx attempt anyway
      console.warn("[SignatureGate] Auto-register project on Core failed:", regErr);
    }
  }

  // ── Execute the on-chain transaction ──
  try {
    const contract = getContract(base._signer);
    const tx = await contract.signAccomplishmentReport(
      params.projectId,
      params.milestoneId,
      base.dataHash
    );
    base.txHash = tx.hash;
    base.etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
    base.onChainConfirmed = true;
  } catch (err) {
    throwIfGasError(err);
    // Extract the Solidity revert reason and throw — milestone submission
    // REQUIRES a confirmed on-chain transaction; silent fallback is not acceptable.
    const reason = extractRevertReason(err);
    console.error("[SignatureGate] signAccomplishmentReport failed:", err);
    throw new Error(`Blockchain transaction failed: ${reason}`);
  }

  return base;
}

// ── signEngineerAttestation ──

export async function signEngineerAttestation(params: {
  projectId: string;
  milestoneId: string;
  description: string;
  metadata?: Record<string, string | number | boolean>;
}): Promise<SignatureGateResult> {
  const base = await signMessageOnly({
    role: "engineer",
    actionType: "ENGINEER_ATTESTATION",
    referenceId: params.milestoneId,
    description: params.description,
    metadata: { projectId: params.projectId, ...params.metadata },
  });

  const authorized = await isWalletAuthorizedOnChain(base._signer);
  if (!authorized) {
    throw new Error(
      "Your wallet is not whitelisted on the blockchain.\n\n" +
      "The Admin must whitelist your engineer wallet on the ledger first."
    );
  }

  try {
    const contract = getContract(base._signer);
    const tx = await contract.signEngineerAttestation(
      params.projectId,
      params.milestoneId,
      base.dataHash
    );
    base.txHash = tx.hash;
    base.etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
    base.onChainConfirmed = true;
  } catch (err) {
    throwIfGasError(err);
    const reason = extractRevertReason(err);
    console.error("[SignatureGate] signEngineerAttestation failed:", err);
    throw new Error(`Blockchain transaction failed: ${reason}`);
  }

  return base;
}

// ── signAuditAttestation ──

export async function signAuditAttestation(params: {
  projectId: string;
  milestoneId: string;
  verdict: "ATTESTED" | "FLAGGED" | "SUSPENDED" | "DISALLOWED";
  description: string;
  metadata?: Record<string, string | number | boolean>;
}): Promise<SignatureGateResult> {
  const base = await signMessageOnly({
    role: "coa_overseer",
    actionType: "AUDIT_ATTESTATION",
    referenceId: params.milestoneId,
    description: params.description,
    metadata: {
      projectId: params.projectId,
      verdict: params.verdict,
      ...params.metadata,
    },
  });

  const authorized = await isWalletAuthorizedOnChain(base._signer);
  if (!authorized) {
    throw new Error(
      "Your wallet is not whitelisted on the blockchain.\n\n" +
      "The Admin must whitelist your auditor wallet on the ledger first."
    );
  }

  try {
    const contract = getContract(base._signer);
    const tx = await contract.signAuditAttestation(
      params.projectId,
      params.milestoneId,
      base.dataHash,
      params.verdict
    );
    base.txHash = tx.hash;
    base.etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
    base.onChainConfirmed = true;
  } catch (err) {
    throwIfGasError(err);
    const reason = extractRevertReason(err);
    console.error("[SignatureGate] signAuditAttestation failed:", err);
    throw new Error(`Blockchain transaction failed: ${reason}`);
  }

  return base;
}

// ── signMilestonePayment ──
// RD authorizes milestone payment release after COA audit (COA_AUDITED)

export async function signMilestonePayment(params: {
  projectId: string;
  milestoneId: string;
  amount: number;
  description: string;
  metadata?: Record<string, string | number | boolean>;
}): Promise<SignatureGateResult> {
  const base = await signMessageOnly({
    role: "rd",
    actionType: "MILESTONE_PAYMENT_AUTHORIZED",
    referenceId: params.milestoneId,
    description: params.description,
    metadata: {
      projectId: params.projectId,
      amount: params.amount,
      ...params.metadata,
    },
  });

  // Skip pre-check: the Gate contract's signMilestonePayment() already enforces
  // core.checkAuthorization(msg.sender) on-chain.  The frontend pre-check queries
  // VITE_CONTRACT_ADDRESS which can be a different Core instance than the one the
  // deployed Gate contract references, causing false-negative "not whitelisted".

  try {
    const contract = getContract(base._signer);
    const tx = await contract.signMilestonePayment(
      params.projectId,
      params.milestoneId,
      BigInt(Math.round(params.amount * 100)), // store centavos for precision
      base.dataHash
    );
    base.txHash = tx.hash;
    base.etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
    base.onChainConfirmed = true;
  } catch (err) {
    throwIfGasError(err);
    const reason = extractRevertReason(err);
    console.error("[SignatureGate] signMilestonePayment failed:", reason, err);

    // ── Diagnostic: if the error is whitelist/role/region related,
    //    query the Gate's core address and compare with VITE_CONTRACT_ADDRESS
    //    to give a clear, actionable message ──
    const lower = reason.toLowerCase();
    if (lower.includes("notwhitelisted") || lower.includes("not whitelisted")
        || lower.includes("wrongrole") || lower.includes("wrong role")
        || lower.includes("0x89cf0a84")) {
      let diagnostic = "";
      try {
        const gateContract = getContract(base._signer);
        const gateCoreAddr: string = await gateContract.core();
        const expectedCore = CORE_CONTRACT_ADDRESS.toLowerCase();
        const gateCoreNorm = gateCoreAddr.toLowerCase();
        if (expectedCore && gateCoreNorm !== expectedCore) {
          diagnostic = `\n\nDiagnostic: The Gate contract references Core at ${gateCoreAddr}, ` +
            `but admin whitelists on ${CORE_CONTRACT_ADDRESS}. ` +
            `These must match. Re-deploy the Gate contract in Remix using Core address ${CORE_CONTRACT_ADDRESS} as the constructor argument, ` +
            `then update VITE_GATE_CONTRACT_ADDRESS in .env with the new Gate address.`;
        } else {
          // Same Core — check if the wallet is actually authorized on that Core
          const coreContract = new Contract(gateCoreAddr, CORE_CHECK_ABI, base._signer);
          const signerAddr = await base._signer.getAddress();
          const [isAuth, role, region] = await coreContract.checkAuthorization(signerAddr);
          diagnostic = `\n\nDiagnostic: Gate Core = ${gateCoreAddr} (matches .env). ` +
            `Your wallet ${signerAddr} authorization: isAuthorized=${isAuth}, role="${role}", region=${region}. ` +
            (isAuth
              ? `Wallet IS authorized as "${role}" — the error may be WrongRole (need "rd") or WrongRegion.`
              : `Wallet is NOT authorized on this contract. Admin must whitelist it.`);
        }
      } catch (diagErr) {
        diagnostic = `\n\n(Could not run diagnostic: ${(diagErr as Error).message})`;
      }
      throw new Error(
        `Payment authorization failed: ${reason}${diagnostic}`
      );
    }
    throw new Error(`Blockchain transaction failed: ${reason}`);
  }

  return base;
}

// ── finalizeProject ──
// COA National finalizes a project on Core contract when conditions are met.

export async function finalizeProject(params: {
  projectId: string;
  description: string;
  metadata?: Record<string, string | number | boolean>;
}): Promise<SignatureGateResult> {
  const base = await signMessageOnly({
    role: "coa_overseer",
    actionType: "PROJECT_FINALIZED",
    referenceId: params.projectId,
    description: params.description,
    metadata: {
      projectId: params.projectId,
      ...params.metadata,
    },
  });

  const authorized = await isWalletAuthorizedOnChain(base._signer);
  if (!authorized) {
    throw new Error(
      "Your wallet is not whitelisted on the blockchain.\n\n" +
      "The Admin must whitelist your COA National wallet on the ledger first."
    );
  }

  if (!CORE_CONTRACT_ADDRESS) {
    throw new Error("VITE_CONTRACT_ADDRESS is not configured — cannot finalize project on-chain.");
  }

  try {
    const coreContract = new Contract(CORE_CONTRACT_ADDRESS, CORE_PROJECT_LIFECYCLE_ABI, base._signer);
    const tx = await coreContract.finalizeProject(params.projectId);
    base.txHash = tx.hash;
    base.etherscanUrl = getEtherscanLink(tx.hash);
    await tx.wait();
    base.onChainConfirmed = true;
  } catch (err) {
    throwIfGasError(err);
    const reason = extractRevertReason(err);
    console.error("[SignatureGate] finalizeProject failed:", err);
    throw new Error(`Blockchain transaction failed: ${reason}`);
  }

  return base;
}

// ── Audit Trail Logger ──

export async function logToAuditTrail(
  result: SignatureGateResult,
  params: SignatureGateParams & {
    actorName: string;
    projectId?: string;
    projectName?: string;
    region?: string;
  }
): Promise<void> {
  try {
    const payload: CreateAuditEntryPayload = {
      actionType: params.actionType,
      actorRole: params.role,
      actorName: params.actorName,
      actorWallet: result.signer,
      projectId: params.projectId ?? params.referenceId,
      projectName: params.projectName ?? params.referenceId,
      description: params.description,
      region: params.region,
      blockchainTxHash: result.txHash,
      blockchainDataHash: result.txHash || result.dataHash,
    };
    await auditTrailApi.create(payload);
  } catch (err) {
    console.warn("[SignatureGate] Audit trail backend log failed:", err);
  }
}

// ── Public Audit: Fetch on-chain events ──

export interface OnChainSignedAction {
  signer: string;
  role: string;
  actionType: string;
  dataHash: string;
  referenceId: string;
  timestamp: number;
  txHash: string;
  etherscanUrl: string;
}

export async function fetchSignedActionEvents(
  fromBlock = 0
): Promise<OnChainSignedAction[]> {
  if (!GATE_CONTRACT_ADDRESS) return [];

  try {
    const provider = getProvider();
    const contract = new Contract(
      GATE_CONTRACT_ADDRESS,
      SIGNATURE_GATE_ABI,
      provider
    );
    const filter = contract.filters.SignedAction();
    const events = await contract.queryFilter(filter, fromBlock, "latest");

    return events.map((ev) => {
      const args = (ev as import("ethers").EventLog).args;
      return {
        signer: args[0] as string,
        role: args[1] as string,
        actionType: args[2] as string,
        dataHash: args[3] as string,
        referenceId: args[4] as string,
        timestamp: Number(args[5]),
        txHash: ev.transactionHash,
        etherscanUrl: getEtherscanLink(ev.transactionHash),
      };
    });
  } catch (err) {
    console.warn(
      "[SignatureGate] Failed to fetch SignedAction events:",
      err
    );
    return [];
  }
}
