// Legacy re-export shim — implementations in @/features/blockchain/services/signatureGate
export {
  signAndLog,
  computeActionHash,
  signProposal,
  signFunding,
  signPersonnelWhitelist,
  signMultiProjectPersonnel,
  signRegisterProfessional,
  signCommitFunds,
  signEndorsement,
  signFinalWhitelist,
  signAccomplishmentReport,
  signEngineerAttestation,
  signAuditAttestation,
  signMilestonePayment,
  finalizeProject,
  logToAuditTrail,
  fetchSignedActionEvents,
  isAddressAuthorizedOnChain,
} from "@/features/blockchain/services/signatureGate";
export type {
  SignatureRole,
  SignatureActionType,
  SignatureGateResult,
  SignatureGateParams,
  OnChainSignedAction,
} from "@/features/blockchain/services/signatureGate";
