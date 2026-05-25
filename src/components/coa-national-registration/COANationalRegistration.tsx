import { useState, useEffect } from "react";
import { BrowserProvider, Contract, isAddress, getAddress } from "ethers";
import { ensureSepoliaNetwork } from "@/services/blockchain";
import { useWallet } from "@/context/WalletContext";
import { authApi } from "@/features/auth/api/authApi";
import { useLookup } from "@/hooks";

// ============================================
// COA NATIONAL AUDITOR REGISTRATION
// Commission on Audit - Supreme Authority
// ============================================

const TAPATCHAIN_ABI = [
  "function COA_NATIONAL_ADDR() external view returns (address)",
  "function registerRegionalCOA(address _auditor, uint8 _regionCode) external",
  "function users(address) external view returns (bool isAuthorized, string role, uint8 regionCode)",
  "event UserAuthorized(address indexed userAddress, string role, uint8 regionCode, uint256 timestamp)",
];

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

interface COANationalRegistrationProps {
  onRegistered?: () => void;
}

export function COANationalRegistration({ onRegistered }: COANationalRegistrationProps) {
  const { walletAddress } = useWallet();
  const { items: regions, loading: regionsLoading } = useLookup("Region");
  const [auditorAddress, setAuditorAddress] = useState("");
  const [regionCode, setRegionCode] = useState<number>(-1); // -1 = no selection yet
  const [registering, setRegistering] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coaNationalAddr, setCoaNationalAddr] = useState<string>("");
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

  // Check if current wallet is COA National
  const checkCOANational = async () => {
    if (!window.ethereum || !CONTRACT_ADDRESS || !walletAddress) return;

    try {
      const provider = new BrowserProvider(window.ethereum);
      const contract = new Contract(CONTRACT_ADDRESS, TAPATCHAIN_ABI, provider);
      
      const coaAddr = await contract.COA_NATIONAL_ADDR();
      setCoaNationalAddr(coaAddr);
      
      const authorized = coaAddr.toLowerCase() === walletAddress.toLowerCase();
      setIsAuthorized(authorized);
      
      if (!authorized) {
        setError(`You are not COA National. COA National address: ${coaAddr}`);
      }
    } catch (err: any) {
      console.error("[COA] Failed to check COA National:", err);
      setError("Failed to verify COA National status. Check contract deployment.");
    }
  };

  // Register regional COA auditor
  const handleRegisterAuditor = async () => {
    setError(null);
    setSuccess(null);

    if (!walletAddress) {
      setError("Please connect your COA National wallet");
      return;
    }

    if (!isAuthorized) {
      setError("Only COA National can register auditors");
      return;
    }

    if (!auditorAddress.trim()) {
      setError("Please enter auditor wallet address");
      return;
    }

    if (!isAddress(auditorAddress.trim())) {
      setError("Invalid wallet address format");
      return;
    }

    if (!window.ethereum) {
      setError("MetaMask is not installed");
      return;
    }

    setRegistering(true);

    try {
      // Ensure Sepolia network
      const onSepolia = await ensureSepoliaNetwork();
      if (!onSepolia) {
        setError("Please switch MetaMask to Sepolia testnet");
        setRegistering(false);
        return;
      }

      const normalizedAddr = getAddress(auditorAddress.trim());
      const regionName = regions.find(r => r.code === regionCode)?.name || String(regionCode);

      const syncAuditorToDatabase = async (transactionHash: string) => {
        try {
          await authApi.coaRegisterAuditor({
            walletAddress: normalizedAddr,
            region: regionName,
            regionCode,
            transactionHash,
          });
          return "synced" as const;
        } catch (dbErr: any) {
          const msg: string = dbErr?.response?.data?.message ?? dbErr?.message ?? "";
          if (msg.toLowerCase().includes("already registered")) {
            return "already-registered" as const;
          }
          throw new Error(msg || "Unknown database sync error");
        }
      };

      // Check if already authorized on-chain
      const provider = new BrowserProvider(window.ethereum);
      const readContract = new Contract(CONTRACT_ADDRESS, TAPATCHAIN_ABI, provider);
      const [alreadyAuthorized] = await readContract.users(normalizedAddr);

      if (alreadyAuthorized) {
        // Already on-chain — skip blockchain tx, just sync to database
        setSuccess(`On-chain authorization found. Syncing to database...`);
        try {
          const syncState = await syncAuditorToDatabase("ALREADY_ON_CHAIN");
          setSuccess(
            `✅ Auditor synced to database!\n` +
            `Address: ${normalizedAddr}\n` +
            `Region: ${regionName}\n` +
            `${syncState === "already-registered" ? "(Already registered in database)" : "(Already authorized on-chain)"}`
          );
          setAuditorAddress("");
          setRegionCode(-1);
          onRegistered?.();
        } catch (syncErr: any) {
          const msg = syncErr?.message || "Unknown error";
          setError(`On-chain: authorized. Database sync failed: ${msg}`);
        } finally {
          setRegistering(false);
        }
        return;
      }

      // Not yet on-chain — do the full blockchain tx + DB registration
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, TAPATCHAIN_ABI, signer);

      const tx = await contract.registerRegionalCOA(normalizedAddr, regionCode);
      const txHash = tx.hash;

      setSuccess(`Transaction sent: ${txHash}. Waiting for confirmation...`);

      await tx.wait();

      // Register auditor in the backend database so they can log in.
      // This must succeed to complete the full on-chain + off-chain flow.
      const syncState = await syncAuditorToDatabase(txHash);

      setSuccess(
        `✅ Auditor successfully registered on-chain and synced off-chain!\n` +
        `Address: ${normalizedAddr}\n` +
        `Region: ${regionName}\n` +
        `${syncState === "already-registered" ? "Database record already existed and was reconciled.\n" : "Database registry updated successfully.\n"}` +
        `Tx: ${txHash.slice(0, 10)}...`
      );

      // Reset form
      setAuditorAddress("");
      setRegionCode(-1);
      onRegistered?.();

    } catch (err: any) {
      console.error("[COA] Registration failed:", err);
      
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        setError("Transaction rejected in MetaMask");
      } else if (err.message?.includes("Unauthorized")) {
        setError("Access denied. Only COA National can call this function.");
      } else if (err.message?.includes("AlreadyAuthorized")) {
        setError("This address is already authorized");
      } else if (err.message?.includes("InvalidRegion")) {
        setError("Invalid region code (must be 0-17)");
      } else {
        setError(err.reason || err.message || "Registration failed");
      }
    } finally {
      setRegistering(false);
    }
  };

  // Auto-check on mount
  useEffect(() => {
    checkCOANational();
  }, [walletAddress]);

  if (!walletAddress) {
    return (
      <div className="p-6 bg-card border border-border rounded-lg">
        <p className="text-muted-foreground">Please connect your wallet to access COA National functions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Not authorized notice */}
      {!isAuthorized && (
        <div className="border border-destructive/30 rounded-md px-4 py-3 bg-destructive/5">
          <p className="text-xs text-destructive">Not authorized — connect COA National wallet to access this function.</p>
        </div>
      )}

      {/* Registration form */}
      {isAuthorized && (
        <div className="border border-border rounded-md bg-card overflow-hidden w-full">
          <div className="px-4 py-2.5 bg-muted border-b border-border">
            <span className="text-xs font-semibold text-foreground">Register Regional COA Auditor</span>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Auditor Wallet Address
              </label>
              <input
                type="text"
                value={auditorAddress}
                onChange={(e) => setAuditorAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-2.5 py-1.5 text-xs border border-border bg-background text-foreground placeholder:text-muted-foreground rounded-md focus:outline-none focus:border-primary font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={registering}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">
                Assigned Region
              </label>
              <select
                value={regionCode}
                onChange={(e) => setRegionCode(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 text-xs border border-border bg-background text-foreground rounded-md focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={registering || regionsLoading}
              >
                <option value={-1} disabled>
                  {regionsLoading ? "Loading regions..." : "— Select Region —"}
                </option>
                {regions.map(r => (
                  <option key={r.id} value={r.code ?? 0}>
                    {r.code != null ? `${r.code} - ${r.name}` : r.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleRegisterAuditor}
              disabled={registering || !auditorAddress.trim() || regionCode < 0}
              className="w-full py-2 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {registering ? "Registering on Blockchain..." : "Register Auditor"}
            </button>
          </div>
        </div>
      )}

      {/* Feedback */}
      {success && (
        <div className="border border-border rounded-md px-4 py-3 bg-primary/5">
          <pre className="text-xs text-primary whitespace-pre-wrap font-mono">{success}</pre>
        </div>
      )}
      {error && (
        <div className="border border-destructive/30 rounded-md px-4 py-3 bg-destructive/5">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
