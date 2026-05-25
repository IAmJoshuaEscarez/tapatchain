// Legacy re-export shim — implementations in @/features/blockchain/services/blockchain
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
} from "@/features/blockchain/services/blockchain";
