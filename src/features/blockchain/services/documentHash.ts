// ════════════════════════════════════════════════════════════════
// DOCUMENT HASH — SHA-256 hashing for anti-tampering
// Hash files client-side, store on-chain, verify integrity later
// ════════════════════════════════════════════════════════════════

import { BrowserProvider, Contract } from "ethers";
import {
  ensureSepoliaNetwork,
  getEtherscanLink,
} from "@/features/blockchain/services/blockchain";

const DOCUMENT_ABI = [
  "function storeDocumentHash(string _referenceId, bytes32 _documentHash, string _documentName) external",
  "function verifyDocumentIntegrity(string _referenceId, bytes32 _providedHash) external returns (bool matched)",
  "function getDocumentHash(string _referenceId) external view returns (bytes32 hash, address uploader, uint256 uploadedAt)",
  "event DocumentHashStored(string indexed referenceId, bytes32 documentHash, address indexed uploader, string documentName, uint256 timestamp)",
  "event IntegrityVerified(string indexed referenceId, bytes32 storedHash, bytes32 providedHash, bool matched, address indexed verifier, uint256 timestamp)",
];

const GATE_CONTRACT_ADDRESS = import.meta.env.VITE_GATE_CONTRACT_ADDRESS || "";

// ── 1. Hash a File (SHA-256) ──

/**
 * Compute the SHA-256 hash of a File object using the Web Crypto API.
 * Returns a `0x`-prefixed hex string (bytes32-compatible).
 */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute SHA-256 hash of a raw string (for text-based documents or JSON payloads).
 */
export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── 2. Store Document Hash On-Chain ──

export interface StoreDocumentHashResult {
  txHash: string;
  etherscanUrl: string;
  documentHash: string;
  referenceId: string;
}

/**
 * Store the SHA-256 hash of a document on the blockchain.
 *
 * Flow:
 *   1. Hash the file locally (SHA-256)
 *   2. Call `storeDocumentHash()` on the smart contract
 *   3. Return the txHash → user can verify on Etherscan
 */
export async function storeDocumentHashOnChain(params: {
  file: File;
  referenceId: string;
  documentName?: string;
}): Promise<StoreDocumentHashResult> {
  if (!GATE_CONTRACT_ADDRESS) throw new Error("Gate contract address not configured");

  const onSepolia = await ensureSepoliaNetwork();
  if (!onSepolia) throw new Error("Please switch to Sepolia Testnet");

  // Hash the file
  const docHash = await hashFile(params.file);

  // Send to blockchain
  const provider = new BrowserProvider(window.ethereum!);
  const signer = await provider.getSigner();
  const contract = new Contract(GATE_CONTRACT_ADDRESS, DOCUMENT_ABI, signer);

  const tx = await contract.storeDocumentHash(
    params.referenceId,
    docHash,
    params.documentName ?? params.file.name
  );
  const txHash = tx.hash;
  await tx.wait();

  return {
    txHash,
    etherscanUrl: getEtherscanLink(txHash),
    documentHash: docHash,
    referenceId: params.referenceId,
  };
}

// ── 3. Verify Document Integrity ──

export interface IntegrityCheckResult {
  matched: boolean;
  storedHash: string;
  computedHash: string;
  uploader: string;
  uploadedAt: Date;
  /** If verification was done on-chain, this is the txHash */
  verificationTxHash?: string;
  etherscanUrl?: string;
}

/**
 * Public integrity check:
 *   1. Re-hash the provided file (SHA-256)
 *   2. Fetch the stored hash from the smart contract
 *   3. Compare them
 *   4. Optionally call `verifyDocumentIntegrity()` on-chain to log the check
 *
 * @param onChainVerify - if true, calls the contract (costs gas, but the check itself is on-chain)
 */
export async function verifyDocumentIntegrity(params: {
  file: File;
  referenceId: string;
  onChainVerify?: boolean;
}): Promise<IntegrityCheckResult> {
  if (!GATE_CONTRACT_ADDRESS) throw new Error("Gate contract address not configured");

  // Re-hash the file
  const computedHash = await hashFile(params.file);

  // Read stored hash (view call, no gas)
  const provider = new BrowserProvider(window.ethereum!);
  const contract = new Contract(GATE_CONTRACT_ADDRESS, DOCUMENT_ABI, provider);

  const [storedHash, uploader, uploadedAt] = await contract.getDocumentHash(params.referenceId);

  if (storedHash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    throw new Error("No document hash stored for this reference ID");
  }

  const matched = storedHash.toLowerCase() === computedHash.toLowerCase();

  const result: IntegrityCheckResult = {
    matched,
    storedHash,
    computedHash,
    uploader,
    uploadedAt: new Date(Number(uploadedAt) * 1000),
  };

  // Optionally log the verification on-chain
  if (params.onChainVerify) {
    try {
      const onSepolia = await ensureSepoliaNetwork();
      if (onSepolia) {
        const signer = await provider.getSigner();
        const contractWithSigner = new Contract(GATE_CONTRACT_ADDRESS, DOCUMENT_ABI, signer);
        const tx = await contractWithSigner.verifyDocumentIntegrity(
          params.referenceId,
          computedHash
        );
        result.verificationTxHash = tx.hash;
        result.etherscanUrl = getEtherscanLink(tx.hash);
        await tx.wait();
      }
    } catch (err) {
      console.warn("[DocumentHash] On-chain verify failed:", err);
    }
  }

  return result;
}

// ── 4. Read-only: Get stored hash without re-hashing ──

export async function getStoredDocumentHash(referenceId: string): Promise<{
  hash: string;
  uploader: string;
  uploadedAt: Date;
} | null> {
  if (!GATE_CONTRACT_ADDRESS) return null;

  try {
    const provider = new BrowserProvider(window.ethereum!);
    const contract = new Contract(GATE_CONTRACT_ADDRESS, DOCUMENT_ABI, provider);
    const [hash, uploader, uploadedAt] = await contract.getDocumentHash(referenceId);

    if (hash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      return null;
    }

    return {
      hash,
      uploader,
      uploadedAt: new Date(Number(uploadedAt) * 1000),
    };
  } catch {
    return null;
  }
}
