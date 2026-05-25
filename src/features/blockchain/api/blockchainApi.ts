import apiClient from "@/shared/api/client";


export interface VerifySignaturePayload {
  message: string;
  signature: string;
  expectedAddress: string;
}

export interface RecordOnChainPayload {
  projectId: string;
  actionType: string;
  dataHash: string;
  actorWallet?: string;
  signature?: string;
}

export interface CreateTransactionPayload {
  projectId: string;
  projectName: string;
  contractor?: string;
  amount: number;
  type: string;
  blockchainTxHash?: string;
  blockchainDataHash?: string;
  fromWallet?: string;
  toWallet?: string;
}

// ── Blockchain API ──

export const blockchainApi = {
  getStatus: () => apiClient.get("/Blockchain/status"),

  verifySignature: (data: VerifySignaturePayload) =>
    apiClient.post("/Blockchain/verify-signature", data),

  recordOnChain: (data: RecordOnChainPayload) =>
    apiClient.post("/Blockchain/record", data),

  getReceipt: (txHash: string) =>
    apiClient.get(`/Blockchain/receipt/${txHash}`),

  verifyTransaction: (txHash: string) =>
    apiClient.get(`/Blockchain/verify-transaction/${txHash}`),

  getTransactions: () => apiClient.get("/Blockchain/transactions"),

  getTransactionsByProject: (projectId: string) =>
    apiClient.get(`/Blockchain/transactions/project/${projectId}`),

  createTransaction: (data: CreateTransactionPayload) =>
    apiClient.post("/Blockchain/transactions", data),
};
