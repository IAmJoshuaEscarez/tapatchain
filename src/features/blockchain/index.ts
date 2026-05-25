// ── Blockchain Feature — Public API ──

// API layer
export { blockchainApi } from "./api/blockchainApi";
export type {
  VerifySignaturePayload,
  RecordOnChainPayload,
  CreateTransactionPayload,
} from "./api/blockchainApi";

// Blockchain service
export {
  getProvider,
  ensureSepoliaNetwork,
  signAndVerify,
  recordProjectAction,
  signAndRecordAction,
  getBlockchainStatus,
  verifyTransactionOnChain,
  computeDataHash,
  verifyDataIntegrity,
  getEtherscanLink,
  getEtherscanAddressLink,
  formatEth,
  isRealTxHash,
  InsufficientGasError,
} from "./services/blockchain";

// Signature Gate service
export {
  signAndLog,
  computeActionHash,
  signProposal,
  signFunding,
  signPersonnelWhitelist,
  signMultiProjectPersonnel,
  signCommitFunds,
  signEndorsement,
  signFinalWhitelist,
  signAccomplishmentReport,
  signEngineerAttestation,
  signAuditAttestation,
  logToAuditTrail,
  fetchSignedActionEvents,
  isAddressAuthorizedOnChain,
} from "./services/signatureGate";
export type {
  SignatureRole,
  SignatureActionType,
  SignatureGateResult,
  SignatureGateParams,
  OnChainSignedAction,
} from "./services/signatureGate";

// Document Hash service
export {
  hashFile,
  hashString,
  storeDocumentHashOnChain,
  verifyDocumentIntegrity,
  getStoredDocumentHash,
} from "./services/documentHash";
export type {
  StoreDocumentHashResult,
  IntegrityCheckResult,
} from "./services/documentHash";

// Hook
export { useSignatureGate } from "./hooks/useSignatureGate";
export type { UseSignatureGateReturn } from "./hooks/useSignatureGate";
