import { BrowserProvider, hashMessage, getBytes } from "ethers";
import { blockchainApi } from "@/features/blockchain/api/blockchainApi";
import {
  auditTrailApi,
  type CreateAuditEntryPayload,
} from "@/features/audit-trail/api/auditTrailApi";

// ============================================
// BLOCKCHAIN SERVICE
// Frontend Ethereum integration via MetaMask
// Connects to Sepolia Testnet (free)
// ============================================

const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

/**
 * Custom error class for insufficient gas errors.
 * When thrown, data must NOT be saved to the database.
 */
export class InsufficientGasError extends Error {
  public readonly details: string;
  constructor(message: string) {
    super(message);
    this.name = "InsufficientGasError";
    this.details = message;
  }
}

/**
 * Check if a blockchain API response indicates insufficient gas
 */
function checkGasError(response: { data: { success: boolean; message?: string } }) {
  if (!response.data.success && response.data.message?.includes("INSUFFICIENT_GAS")) {
    throw new InsufficientGasError(response.data.message);
  }
}

/**
 * Get ethers.js BrowserProvider from MetaMask
 */
export function getProvider(): BrowserProvider | null {
  if (typeof window === "undefined" || !window.ethereum) return null;
  return new BrowserProvider(window.ethereum);
}

/**
 * Ensure user is on Sepolia testnet
 */
export async function ensureSepoliaNetwork(): Promise<boolean> {
  if (!window.ethereum) return false;

  try {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId === SEPOLIA_CHAIN_ID_HEX) return true;

    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
    return true;
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_CHAIN_ID_HEX,
              chainName: "Sepolia Testnet",
              nativeCurrency: {
                name: "SepoliaETH",
                symbol: "SEP",
                decimals: 18,
              },
              rpcUrls: ["https://rpc.sepolia.org"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Sign a message using MetaMask and verify it on the backend
 */
export async function signAndVerify(
  message: string,
  walletAddress: string
): Promise<{ isValid: boolean; signature: string; txHash?: string }> {
  const provider = getProvider();
  if (!provider) throw new Error("MetaMask not available");

  const signer = await provider.getSigner();
  const signature = await signer.signMessage(message);

  const result = await blockchainApi.verifySignature({
    message,
    signature,
    expectedAddress: walletAddress,
  });

  return {
    isValid: result.data.isValid,
    signature,
    txHash: result.data.recoveredAddress,
  };
}

/**
 * Record a project action on the blockchain (via backend)
 * and create an audit trail entry
 */
export async function recordProjectAction(params: {
  projectId: string;
  projectName: string;
  actionType: string;
  actorRole: string;
  actorName: string;
  actorWallet?: string;
  description: string;
  amount?: number;
  region?: string;
  municipality?: string;
  barangay?: string;
  milestoneId?: string;
  milestoneName?: string;
  previousStatus?: string;
  newStatus?: string;
  remarks?: string;
}): Promise<{ blockchainTxHash: string; auditEntryId: string }> {
  const dataString = JSON.stringify({
    projectId: params.projectId,
    actionType: params.actionType,
    timestamp: new Date().toISOString(),
    actor: params.actorWallet || params.actorName,
  });

  const dataHash = hashMessage(dataString);
  const dataHashHex = Array.from(getBytes(dataHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const blockchainResult = await blockchainApi.recordOnChain({
    projectId: params.projectId,
    actionType: params.actionType,
    dataHash: dataHashHex,
    actorWallet: params.actorWallet,
  });

  // ── GAS GUARD: If insufficient gas, throw and do NOT save to database ──
  checkGasError(blockchainResult);

  const blockchainTxHash =
    blockchainResult.data.transactionHash || `0x${dataHashHex}`;

  const auditPayload: CreateAuditEntryPayload = {
    actionType: params.actionType,
    actorRole: params.actorRole,
    actorName: params.actorName,
    actorWallet: params.actorWallet,
    projectId: params.projectId,
    projectName: params.projectName,
    region: params.region,
    municipality: params.municipality,
    barangay: params.barangay,
    milestoneId: params.milestoneId,
    milestoneName: params.milestoneName,
    description: params.description,
    amount: params.amount,
    previousStatus: params.previousStatus,
    newStatus: params.newStatus,
    remarks: params.remarks,
    blockchainTxHash: blockchainTxHash,
  };

  const auditResult = await auditTrailApi.create(auditPayload);

  return {
    blockchainTxHash,
    auditEntryId: auditResult.data.id,
  };
}

/**
 * Sign a project action with MetaMask and record it
 */
export async function signAndRecordAction(params: {
  projectId: string;
  projectName: string;
  actionType: string;
  actorRole: string;
  actorName: string;
  walletAddress: string;
  description: string;
  amount?: number;
  region?: string;
  municipality?: string;
  barangay?: string;
  previousStatus?: string;
  newStatus?: string;
}): Promise<{
  blockchainTxHash: string;
  signature: string;
  auditEntryId: string;
}> {
  const provider = getProvider();
  if (!provider) throw new Error("MetaMask not available");

  const message = [
    `TapatChain Action: ${params.actionType}`,
    `Project: ${params.projectId}`,
    `Actor: ${params.actorName}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Description: ${params.description}`,
  ].join("\n");

  const signer = await provider.getSigner();
  const signature = await signer.signMessage(message);

  const result = await recordProjectAction({
    ...params,
    actorWallet: params.walletAddress,
  });

  return {
    ...result,
    signature,
  };
}

/**
 * Get blockchain network status from backend
 */
export async function getBlockchainStatus() {
  const result = await blockchainApi.getStatus();
  return result.data;
}

export type TransactionVerificationState =
  | "OFF_CHAIN_REFERENCE"
  | "CONFIRMED_SUCCESS"
  | "CONFIRMED_FAILED"
  | "PENDING"
  | "NOT_FOUND"
  | "ERROR";

type VerificationResponseRecord = Record<string, unknown>;

const isObjectRecord = (value: unknown): value is VerificationResponseRecord =>
  typeof value === "object" && value !== null;

const parsePossiblySerializedJson = (value: unknown): unknown => {
  let parsed: unknown = value;
  for (let i = 0; i < 2; i += 1) {
    if (typeof parsed !== "string") break;
    const trimmed = parsed.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) break;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      break;
    }
  }
  return parsed;
};

const readStringField = (record: VerificationResponseRecord, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const readBooleanField = (record: VerificationResponseRecord, keys: string[]): boolean | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
};

const normalizeReceiptStatus = (status?: string): string | undefined => {
  if (!status) return undefined;
  const lowered = status.toLowerCase();
  if (lowered === "0x1") return "1";
  if (lowered === "0x0") return "0";
  return status;
};

const normalizeVerificationState = (state?: string): TransactionVerificationState => {
  const upper = (state ?? "").toUpperCase();
  switch (upper) {
    case "OFF_CHAIN_REFERENCE":
    case "CONFIRMED_SUCCESS":
    case "CONFIRMED_FAILED":
    case "PENDING":
    case "NOT_FOUND":
    case "ERROR":
      return upper;
    default:
      return "ERROR";
  }
};

const defaultMessageForState = (state: TransactionVerificationState): string => {
  switch (state) {
    case "OFF_CHAIN_REFERENCE":
      return "Hash is an off-chain reference (not an on-chain transaction).";
    case "CONFIRMED_SUCCESS":
      return "Transaction confirmed on Sepolia blockchain.";
    case "CONFIRMED_FAILED":
      return "Transaction was mined but failed on-chain.";
    case "PENDING":
      return "Transaction exists on Sepolia but is still pending confirmation.";
    case "NOT_FOUND":
      return "Transaction hash was not found on Sepolia.";
    case "ERROR":
    default:
      return "Unable to verify transaction at the moment.";
  }
};

/**
 * Verify a transaction on-chain by its hash
 */
export async function verifyTransactionOnChain(txHash: string): Promise<{
  state: TransactionVerificationState;
  verified: boolean;
  onChain: boolean;
  receipt: {
    transactionHash?: string;
    blockNumber?: string;
    gasUsed?: string;
    status?: string;
    from?: string;
    to?: string;
  } | null;
  etherscanUrl: string;
  message: string;
}> {
  if (!txHash || !txHash.startsWith("0x") || txHash.length < 66) {
    return {
      state: "OFF_CHAIN_REFERENCE",
      verified: false,
      onChain: false,
      receipt: null,
      etherscanUrl: getEtherscanLink(txHash),
      message: "Hash is an off-chain reference (not an on-chain transaction)",
    };
  }

  try {
    const result = await blockchainApi.verifyTransaction(txHash);
    const normalized = parsePossiblySerializedJson(result.data);

    if (!isObjectRecord(normalized)) {
      return {
        state: "ERROR",
        verified: false,
        onChain: false,
        receipt: null,
        etherscanUrl: getEtherscanLink(txHash),
        message: "Unexpected verification response format.",
      };
    }

    const state = normalizeVerificationState(
      readStringField(normalized, ["verificationState", "VerificationState", "state", "State"])
    );
    const transactionHash =
      readStringField(normalized, ["transactionHash", "TransactionHash"]) ?? txHash;
    const receiptStatus = normalizeReceiptStatus(
      readStringField(normalized, ["receiptStatus", "ReceiptStatus", "status", "Status"])
    );
    const onChainFromPayload = readBooleanField(normalized, ["onChain", "OnChain"]);
    const onChain = onChainFromPayload ?? (
      state === "CONFIRMED_SUCCESS" ||
      state === "CONFIRMED_FAILED" ||
      state === "PENDING"
    );
    const verified = state === "CONFIRMED_SUCCESS";
    const blockNumber = readStringField(normalized, ["blockNumber", "BlockNumber"]);
    const gasUsed = readStringField(normalized, ["gasUsed", "GasUsed"]);
    const from = readStringField(normalized, ["from", "From"]);
    const to = readStringField(normalized, ["to", "To"]);
    const message =
      readStringField(normalized, ["message", "Message"]) ?? defaultMessageForState(state);

    return {
      state,
      verified,
      onChain,
      receipt: onChain
        ? {
            transactionHash,
            blockNumber,
            gasUsed,
            status: receiptStatus,
            from,
            to,
          }
        : null,
      etherscanUrl: getEtherscanLink(txHash),
      message,
    };
  } catch {
    try {
      // Fallback for older backend versions that only expose receipt lookup.
      const legacy = await blockchainApi.getReceipt(txHash);
      const normalized = parsePossiblySerializedJson(legacy.data);

      if (!isObjectRecord(normalized)) {
        throw new Error("Legacy receipt payload is not an object");
      }

      const status = normalizeReceiptStatus(
        readStringField(normalized, ["status", "Status"])
      );
      const verified = status === "1";
      const state: TransactionVerificationState = verified
        ? "CONFIRMED_SUCCESS"
        : "CONFIRMED_FAILED";

      return {
        state,
        verified,
        onChain: true,
        receipt: {
          transactionHash:
            readStringField(normalized, ["transactionHash", "TransactionHash"]) ?? txHash,
          blockNumber: readStringField(normalized, ["blockNumber", "BlockNumber"]),
          gasUsed: readStringField(normalized, ["gasUsed", "GasUsed"]),
          status,
          from: readStringField(normalized, ["from", "From"]),
          to: readStringField(normalized, ["to", "To"]),
        },
        etherscanUrl: getEtherscanLink(txHash),
        message: defaultMessageForState(state),
      };
    } catch {
      return {
        state: "NOT_FOUND",
        verified: false,
        onChain: false,
        receipt: null,
        etherscanUrl: getEtherscanLink(txHash),
        message: "Transaction hash was not found on Sepolia.",
      };
    }
  }
}

/**
 * Compute a deterministic data hash for off-chain data verification
 */
export function computeDataHash(data: {
  projectId: string;
  actionType: string;
  actor?: string;
  timestamp?: string;
}): string {
  const dataString = JSON.stringify({
    projectId: data.projectId,
    actionType: data.actionType,
    actor: data.actor || "",
    timestamp: data.timestamp || "",
  });
  return hashMessage(dataString);
}

/**
 * Verify off-chain data integrity against its stored hash
 */
export function verifyDataIntegrity(
  offchainData: {
    projectId: string;
    actionType: string;
    actor?: string;
    timestamp?: string;
  },
  storedHash: string
): { match: boolean; computedHash: string; storedHash: string } {
  const computedHash = computeDataHash(offchainData);
  return {
    match: computedHash.toLowerCase() === storedHash.toLowerCase(),
    computedHash,
    storedHash,
  };
}

/**
 * Get Sepolia Etherscan link for a transaction
 */
export function getEtherscanLink(txHash: string): string {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

/**
 * Get Sepolia Etherscan link for an address
 */
export function getEtherscanAddressLink(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}

/**
 * Format wei to ETH
 */
export function formatEth(wei: string | number): string {
  const weiNum = typeof wei === "string" ? parseInt(wei, 16) : wei;
  return (weiNum / 1e18).toFixed(4);
}

/**
 * Check if a hash looks like a real on-chain transaction hash
 */
export function isRealTxHash(hash: string): boolean {
  return !!hash && hash.startsWith("0x") && hash.length === 66;
}
