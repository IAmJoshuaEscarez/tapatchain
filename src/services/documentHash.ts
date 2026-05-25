// Legacy re-export shim — implementations in @/features/blockchain/services/documentHash
export {
  hashFile,
  hashString,
  storeDocumentHashOnChain,
  verifyDocumentIntegrity,
  getStoredDocumentHash,
} from "@/features/blockchain/services/documentHash";
export type {
  StoreDocumentHashResult,
  IntegrityCheckResult,
} from "@/features/blockchain/services/documentHash";
