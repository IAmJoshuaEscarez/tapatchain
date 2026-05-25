import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { authApi } from "@/features/auth/api/authApi";
import {
  clearStoredAccessToken,
  getStoredAccessToken,
  setStoredAccessToken,
} from "@/shared/auth/tokenStorage";
import type { UserProfile } from "@/shared/types";

// ============================================
// WALLET CONTEXT
// Real MetaMask integration for authentication
// ============================================

interface WalletContextType {
  walletAddress: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isAuthenticated: boolean;
  isInitializing: boolean;
  accessToken: string | null;
  userProfile: UserProfile | null;
  chainId: string | null;
  balance: string | null;
  error: string | null;
  walletRejected: boolean;
  connectWallet: (captchaToken: string, role?: string) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  signMessage: (message: string) => Promise<string | null>;
  switchNetwork: (chainId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Sepolia Testnet Chain ID
const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111 in hex

function openExternalInNewTab(url: string): void {
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup) popup.opener = null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    getStoredAccessToken()
  );
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletRejected, setWalletRejected] = useState(false);

  type WalletAuthErrorData = {
    message?: string;
    reason?: string;
    error?: string;
    detail?: string;
    title?: string;
  };

  // Detect wallet rejection from backend — checks status code AND message string
  const isWalletRejectedError = (err: unknown): boolean => {
    const axiosErr = err as {
      response?: { status?: number; data?: { message?: string } };
    };
    const message = String(axiosErr?.response?.data?.message ?? "").toUpperCase();
    if (axiosErr?.response?.status === 403) return true;
    if (message.includes("WALLET_NOT_WHITELISTED")) return true;
    return false;
  };

  // Pull the best available backend/network message so auth failures are diagnosable.
  const getWalletAuthErrorMessage = (err: unknown): string | null => {
    const axiosErr = err as {
      message?: string;
      response?: { status?: number; data?: WalletAuthErrorData | string };
    };

    const status = axiosErr?.response?.status;
    const payload = axiosErr?.response?.data;

    const payloadMessage =
      typeof payload === "string"
        ? payload
        : payload?.message ?? payload?.error ?? payload?.detail ?? payload?.title;
    const payloadReason = typeof payload === "object" ? payload?.reason : undefined;

    if (status === 429) {
      if (payloadReason) return `Security verification failed: ${payloadReason}`;
      if (payloadMessage) return payloadMessage;
      return "Security verification failed. Please retry the challenge.";
    }

    if (status === 400 && payloadMessage) {
      if (payloadMessage.toLowerCase().includes("invalid wallet signature")) {
        return "Digital signature verification failed. Please sign using the same connected MetaMask wallet.";
      }
      return payloadMessage;
    }

    if (payloadMessage) return payloadMessage;
    if (!axiosErr?.response) {
      return "Cannot reach backend authentication service. Check API URL and backend server status.";
    }

    return axiosErr?.message ?? null;
  };

  // Reject wallet — clear all state, set walletRejected flag.
  // NOTE: Do NOT call wallet_revokePermissions here — it fires accountsChanged
  // which triggers disconnectWallet() and clobbers walletRejected before React renders.
  const rejectWallet = () => {
    setWalletRejected(true);
    setIsConnected(false);
    setWalletAddress(null);
    setIsAuthenticated(false);
    setAccessToken(null);
    setUserProfile(null);
    clearStoredAccessToken();
    localStorage.removeItem("walletConnected");
    localStorage.removeItem("walletAddress");
  };

  // Check if MetaMask is installed
  const isMetaMaskInstalled = () => {
    return (
      typeof window !== "undefined" && typeof window.ethereum !== "undefined"
    );
  };

  // Get balance
  const getBalance = async (address: string) => {
    if (!isMetaMaskInstalled()) return;
    try {
      const balance = await window.ethereum!.request({
        method: "eth_getBalance",
        params: [address, "latest"],
      });
      // Convert from wei to ETH
      const ethBalance = parseInt(balance as string, 16) / 1e18;
      setBalance(ethBalance.toFixed(4));
    } catch (err) {
      console.error("Error getting balance:", err);
    }
  };

  // Connect wallet
  const connectWallet = async (captchaToken: string, _role?: string) => {
    if (!isMetaMaskInstalled()) {
      setError(
        "MetaMask is not installed. Please install MetaMask to continue."
      );
      // Open MetaMask download page
      openExternalInNewTab("https://metamask.io/download/");
      return;
    }

    setIsConnecting(true);
    setError(null);
    setWalletRejected(false);

    try {
      // Request account access
      const accounts = await window.ethereum!.request({
        method: "eth_requestAccounts",
      });

      if (accounts && (accounts as string[]).length > 0) {
        const address = (accounts as string[])[0];
        setWalletAddress(address);
        setIsConnected(true);

        // Get chain ID
        const currentChainId = await window.ethereum!.request({
          method: "eth_chainId",
        });
        setChainId(currentChainId as string);

        // Get balance
        await getBalance(address);

        // --- Authenticate with backend (challenge -> sign -> login) ---
        const challengeRes = await authApi.walletChallenge(address);
        const message = challengeRes.data?.message;
        const nonce = challengeRes.data?.nonce;

        if (!message || !nonce) {
          throw new Error("Wallet challenge could not be generated.");
        }

        const signature = await window.ethereum!.request({
          method: "personal_sign",
          params: [message, address],
        });

        if (signature) {
          try {
            const res = await authApi.walletLogin({
              walletAddress: address,
              signature: signature as string,
              message,
              nonce,
              turnstileToken: captchaToken,
              // Keep backward compatibility for environments still expecting this field.
              recaptchaToken: captchaToken,
            });

            const token =
              (res.data as { accessToken?: string; AccessToken?: string })
                .accessToken ??
              (res.data as { accessToken?: string; AccessToken?: string })
                .AccessToken;

            if (!token) {
              throw new Error(
                "Authentication response did not include an access token."
              );
            }

            setAccessToken(token);
            setStoredAccessToken(token);

            // Fetch user profile
            const profileRes = await authApi.getProfile();
            setUserProfile(profileRes.data);
            setIsAuthenticated(true);

            // Only persist wallet if login succeeded
            localStorage.setItem("walletConnected", "true");
            localStorage.setItem("walletAddress", address);
          } catch (apiErr: unknown) {
            if (isWalletRejectedError(apiErr)) {
              console.warn("Wallet not whitelisted — rejected.");
              rejectWallet();
              return;
            }
            console.error("Backend auth error:", apiErr);
            const authErrorMessage = getWalletAuthErrorMessage(apiErr);
            setIsAuthenticated(false);
            setUserProfile(null);
            setAccessToken(null);
            setIsConnected(false);
            setWalletAddress(null);
            clearStoredAccessToken();
            localStorage.removeItem("walletConnected");
            localStorage.removeItem("walletAddress");
            setError(
              authErrorMessage ??
                "Wallet connected but backend authentication failed."
            );
          }
        }
      }
    } catch (err: unknown) {
      console.error("Error connecting wallet:", err);
      if ((err as { code?: number }).code === 4001) {
        setError(
          "Connection rejected. Please approve the connection in MetaMask."
        );
      } else {
        setError(
          getWalletAuthErrorMessage(err) ??
            "Failed to connect wallet. Please try again."
        );
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect wallet — full logout (backend session + MetaMask + local state)
  const disconnectWallet = async () => {
    // 1. Revoke backend session (invalidate refresh token)
    try {
      await authApi.logout();
    } catch {
      // Ignore — token may already be expired
    }

    // 2. Revoke MetaMask permission so user must re-approve on next connect
    if (isMetaMaskInstalled() && walletAddress) {
      try {
        await window.ethereum!.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // Not all wallets support revokePermissions — that's fine
      }
    }

    // 3. Clear all local state
    setWalletAddress(null);
    setIsConnected(false);
    setIsAuthenticated(false);
    setAccessToken(null);
    setUserProfile(null);
    setChainId(null);
    setBalance(null);
    setError(null);
    clearStoredAccessToken();
    localStorage.removeItem("walletConnected");
    localStorage.removeItem("walletAddress");
  };

  // Refresh user profile from backend
  const refreshProfile = async () => {
    if (!accessToken) return;
    try {
      const res = await authApi.getProfile();
      setUserProfile(res.data);
    } catch (err) {
      console.error("Error refreshing profile:", err);
    }
  };

  // Sign message
  const signMessage = async (message: string): Promise<string | null> => {
    if (!isMetaMaskInstalled() || !walletAddress) {
      setError("Wallet not connected");
      return null;
    }

    try {
      const signature = await window.ethereum!.request({
        method: "personal_sign",
        params: [message, walletAddress],
      });
      return signature as string;
    } catch (err: unknown) {
      console.error("Error signing message:", err);
      if ((err as { code?: number }).code === 4001) {
        setError("Signature rejected by user");
      } else {
        setError("Failed to sign message");
      }
      return null;
    }
  };

  // Switch network
  const switchNetwork = async (targetChainId: string) => {
    if (!isMetaMaskInstalled()) return;

    try {
      await window.ethereum!.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainId }],
      });
    } catch (err: unknown) {
      // If the chain hasn't been added to MetaMask
      if ((err as { code?: number }).code === 4902) {
        try {
          await window.ethereum!.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_ID,
                chainName: "Sepolia Testnet",
                nativeCurrency: {
                  name: "SepoliaETH",
                  symbol: "SEP",
                  decimals: 18,
                },
                rpcUrls: ["https://sepolia.infura.io/v3/"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        } catch (addError) {
          console.error("Error adding network:", addError);
        }
      }
      console.error("Error switching network:", err);
    }
  };

  // Listen for account changes
  useEffect(() => {
    if (!isMetaMaskInstalled()) {
      setIsInitializing(false);
      return;
    }

    const handleAccountsChanged = async (accounts: unknown) => {
      const accountsList = accounts as string[];
      if (accountsList.length === 0) {
        disconnectWallet();
      } else {
        const newAddress = accountsList[0];
        // If address actually changed, require explicit reconnect so security challenge can be completed.
        if (newAddress.toLowerCase() !== walletAddress?.toLowerCase()) {
          setWalletAddress(null);
          setIsConnected(false);
          setIsAuthenticated(false);
          setUserProfile(null);
          setBalance(null);
          clearStoredAccessToken();
          setAccessToken(null);
          localStorage.removeItem("walletConnected");
          localStorage.removeItem("walletAddress");

          try {
            await authApi.logout();
          } catch {
            // Old token may already be invalid
          }

          setError("Account switched. Please reconnect and complete security verification.");
        } else {
          setWalletAddress(newAddress);
          getBalance(newAddress);
        }
      }
    };

    const handleChainChanged = (chainId: unknown) => {
      setChainId(chainId as string);
      // Refresh balance on chain change
      if (walletAddress) {
        getBalance(walletAddress);
      }
    };

    // Listen for session expiry from API interceptor
    const handleSessionExpired = () => {
      setIsAuthenticated(false);
      setAccessToken(null);
      setUserProfile(null);
      setIsConnected(false);
      setWalletAddress(null);
      setError("Session expired. Please reconnect your wallet.");
    };

    window.addEventListener("auth:session-expired", handleSessionExpired);
    window.ethereum!.on("accountsChanged", handleAccountsChanged);
    window.ethereum!.on("chainChanged", handleChainChanged);

    // Check if already connected on mount
    const checkConnection = async () => {
      const wasConnected = localStorage.getItem("walletConnected");
      const savedToken = getStoredAccessToken();
      if (wasConnected === "true") {
        try {
          const accounts = await window.ethereum!.request({
            method: "eth_accounts",
          });
          if (accounts && (accounts as string[]).length > 0) {
            const address = (accounts as string[])[0];
            setWalletAddress(address);
            setIsConnected(true);
            const currentChainId = await window.ethereum!.request({
              method: "eth_chainId",
            });
            setChainId(currentChainId as string);
            await getBalance(address);

            // Restore auth state if token exists
            if (savedToken) {
              setAccessToken(savedToken);
              setIsAuthenticated(true);
              try {
                const profileRes = await authApi.getProfile();
                setUserProfile(profileRes.data);
              } catch {
                try {
                  const retryToken = getStoredAccessToken();
                  if (retryToken && retryToken !== savedToken) {
                    setAccessToken(retryToken);
                    setIsAuthenticated(true);
                    const profileRes2 = await authApi.getProfile();
                    setUserProfile(profileRes2.data);
                  } else {
                    clearStoredAccessToken();
                    setAccessToken(null);
                    setIsAuthenticated(false);
                    setIsConnected(false);
                    localStorage.removeItem("walletConnected");
                    localStorage.removeItem("walletAddress");
                  }
                } catch {
                  clearStoredAccessToken();
                  setAccessToken(null);
                  setIsAuthenticated(false);
                  setIsConnected(false);
                  localStorage.removeItem("walletConnected");
                  localStorage.removeItem("walletAddress");
                }
              }
            } else {
              setIsConnected(false);
              localStorage.removeItem("walletConnected");
              localStorage.removeItem("walletAddress");
            }
          }
        } catch (err) {
          console.error("Error checking connection:", err);
        } finally {
          setIsInitializing(false);
        }
      } else {
        setIsInitializing(false);
      }
    };

    checkConnection();

    return () => {
      window.removeEventListener(
        "auth:session-expired",
        handleSessionExpired
      );
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener(
          "accountsChanged",
          handleAccountsChanged
        );
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, []);

  return (
    <WalletContext.Provider
      value={{
        walletAddress,
        isConnected,
        isConnecting,
        isAuthenticated,
        isInitializing,
        accessToken,
        userProfile,
        chainId,
        balance,
        error,
        walletRejected,
        connectWallet,
        disconnectWallet,
        signMessage,
        switchNetwork,
        refreshProfile,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}

// Utility function to shorten address
export function shortenAddress(address: string | null): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Utility function to get network name
export function getNetworkName(chainId: string | null): string {
  if (!chainId) return "Unknown";
  const networks: Record<string, string> = {
    "0x1": "Ethereum Mainnet",
    "0xaa36a7": "Sepolia Testnet",
    "0x5": "Goerli Testnet",
    "0x89": "Polygon Mainnet",
    "0x13881": "Mumbai Testnet",
  };
  return networks[chainId] || `Chain ${parseInt(chainId, 16)}`;
}
