import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { adminApi, type UserProfile, type AdminRegisterUserPayload } from "@/services/api";
import { useWallet } from "@/context/WalletContext";
import { BrowserProvider, Contract, isAddress, getAddress } from "ethers";
import { ensureSepoliaNetwork } from "@/services/blockchain";
import { signFinalWhitelist, logToAuditTrail } from "@/services/signatureGate";
import { useGasGuard } from "@/hooks/useGasGuard";
import { InsufficientGasModal } from "@/components/ui";
import { useLookup } from "@/hooks";

// ============================================
// NATIONAL REGISTRY OF AUTHORIZED
// INFRASTRUCTURE OFFICIALS
// Defense-Ready Registration & Onboarding
// ============================================

const WHITELIST_ABI = [
  "function authorizeUser(address _user, string memory _role) external",
  "function authorizeUser(address _user, string memory _role, uint8 _regionCode) external",
  "function revokeUser(address _user) external",
  "function checkAuthorization(address _user) external view returns (bool isAuthorized, string memory role, uint8 regionCode)",
  "function authorizedUsers(address) external view returns (bool)",
  "event UserAuthorized(address indexed userAddress, string role, uint8 regionCode, uint256 timestamp)",
];

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";

const ROLE_OPTIONS = [
  { value: "rd", label: "Regional Director" },
  { value: "rdc", label: "Regional Development Council" },
];

const REGIONAL_ROLES = new Set(["rd", "rdc", "contractor", "inspector", "auditor", "overseer"]);
const requiresRegion = (role?: string) => (role ? REGIONAL_ROLES.has(role) : false);

// All role badges use the same primary color scheme
const getRoleBadgeClass = () =>
  "bg-primary/10 text-primary border border-primary/20";

const getRoleLabel = (role?: string) => {
  const labels: Record<string, string> = {
    admin: "Budget Authority",
    rd: "Regional Director",
    auditor: "COA Regional",
    inspector: "Project Engineer",
    contractor: "Project Proponent",
    overseer: "COA Overseer",
    rdc: "RDC",
    coa_admin: "COA National",
    public: "Public",
  };
  return labels[role || ""] || role || "Unknown";
};

// Registry status — single primary color spectrum
const getRegistryStatusConfig = (status?: string) => {
  const configs: Record<string, { label: string; className: string }> = {
    PENDING_REGISTRATION: {
      label: "Pending Registration",
      className: "text-muted-foreground bg-muted border border-border",
    },
    REGISTERED: {
      label: "Registered",
      className: "text-primary bg-primary/5 border border-primary/20",
    },
    PENDING_BLOCKCHAIN_CONFIRMATION: {
      label: "Pending Blockchain",
      className: "text-primary bg-primary/10 border border-primary/30",
    },
    SUCCESSFULLY_WHITELISTED: {
      label: "Whitelisted ✓",
      className: "text-primary bg-primary/5 border border-primary/20",
    },
    REJECTED: {
      label: "Rejected",
      className: "text-destructive bg-destructive/5 border border-destructive/20",
    },
  };
  return configs[status || ""] || configs.PENDING_REGISTRATION;
};

export function AdminUserManagement() {
  const { walletAddress } = useWallet();
  const { gasError, clearGasError, handleGasError } = useGasGuard();
  // Load regions from API
  const { items: regionLookup } = useLookup("Region");
  const REGION_OPTIONS = useMemo(() =>
    regionLookup
      .filter((r) => r.name !== "National")
      .map((r) => ({ code: r.code ?? 0, name: r.name })),
    [regionLookup]
  );
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [whitelistingUserId, setWhitelistingUserId] = useState<string | null>(null);
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  const [resyncingUserId, setResyncingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Registration form state
  const [formData, setFormData] = useState<AdminRegisterUserPayload>({
    fullName: "",
    walletAddress: "",
    role: "",
    region: "",
    regionCode: 0,
    email: "",
    noaReference: "",
    prcLicenseNumber: "",
    documentHash: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Multi-step verification
  const [verifyChecked, setVerifyChecked] = useState(false);

  // Wallet validation
  const [walletValidation, setWalletValidation] = useState<{
    checking: boolean;
    valid: boolean | null;
    exists: boolean | null;
    upgradeable: boolean | null;
    message: string;
  }>({ checking: false, valid: null, exists: null, upgradeable: null, message: "" });
  const walletCheckTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminApi.getAllUsers();
      setUsers(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Real-time wallet validation
  const validateWallet = useCallback(async (address: string) => {
    if (!address) {
      setWalletValidation({ checking: false, valid: null, exists: null, upgradeable: null, message: "" });
      return;
    }

    const isValidFormat = /^0x[a-fA-F0-9]{40}$/.test(address);
    if (!isValidFormat) {
      setWalletValidation({
        checking: false,
        valid: false,
        exists: null,
        upgradeable: null,
        message: "Invalid Ethereum address format (must be 0x + 40 hex chars)",
      });
      return;
    }

    setWalletValidation({ checking: true, valid: true, exists: null, upgradeable: null, message: "Checking registry..." });

    try {
      const res = await adminApi.checkWalletExists(address);
      if (res.data.exists && !res.data.upgradeable) {
        // Already registered with a real role — block
        setWalletValidation({
          checking: false,
          valid: true,
          exists: true,
          upgradeable: false,
          message: `This wallet is already registered as ${res.data.currentRole || "an official"}.`,
        });
      } else if (res.data.exists && res.data.upgradeable) {
        // Exists as public user — can be upgraded
        setWalletValidation({
          checking: false,
          valid: true,
          exists: true,
          upgradeable: true,
          message: "Wallet found as public user — will be upgraded to the selected role.",
        });
      } else {
        // Brand new wallet
        setWalletValidation({
          checking: false,
          valid: true,
          exists: false,
          upgradeable: null,
          message: "Wallet address is valid and available.",
        });
      }
    } catch {
      setWalletValidation({
        checking: false,
        valid: true,
        exists: null,
        upgradeable: null,
        message: "Wallet format valid. (Could not verify registry — offline mode)",
      });
    }
  }, []);

  const handleWalletChange = (value: string) => {
    setFormData((prev) => ({ ...prev, walletAddress: value }));
    clearTimeout(walletCheckTimeout.current);
    walletCheckTimeout.current = setTimeout(() => validateWallet(value), 500);
  };

  // Check if form is valid for submission
  const isFormValid = () => {
    if (!formData.fullName || !formData.walletAddress || !formData.role) return false;
    if (requiresRegion(formData.role) && (!formData.region || formData.regionCode < 1 || formData.regionCode > 18)) return false;
    if (!verifyChecked) return false;
    if (walletValidation.valid === false) return false;
    if (walletValidation.exists === true && walletValidation.upgradeable === false) return false;

    return true;
  };

  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await adminApi.registerUser(formData);
      setSuccess(`Official "${formData.fullName}" has been registered in the National Registry. You may now whitelist them on the blockchain ledger.`);
      setShowRegisterModal(false);
      setFormData({
        fullName: "", walletAddress: "", role: "", region: "", email: "",
        noaReference: "", prcLicenseNumber: "", documentHash: "",
        regionCode: 0,
      });
      setVerifyChecked(false);
      setWalletValidation({ checking: false, valid: null, exists: null, upgradeable: null, message: "" });
      await fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to register user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectUser = async (user: UserProfile) => {
    setRejectingUserId(user.id);
    setError(null);
    try {
      await adminApi.rejectUser(user.id);
      setSuccess(`${user.displayName}'s registration has been rejected and removed from the active registry.`);
      await fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to reject user");
    } finally {
      setRejectingUserId(null);
    }
  };

  // Helper: update a single user in local state (optimistic UI)
  const patchLocalUser = (userId: string, patch: Partial<UserProfile>) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...patch } : u));
  };

  // Helper: query UserAuthorized events to find the real tx hash.
  // Strategy: try full-range first, then chunked scan as fallback.
  const findAuthorizationTxHash = async (
    contract: Contract,
    provider: BrowserProvider,
    userAddress: string,
  ): Promise<string | null> => {
    try {
      const currentBlock = await provider.getBlockNumber();
      const filter = contract.filters.UserAuthorized(userAddress);

      // Attempt 1: full-range query (fastest if the RPC allows it)
      try {
        const events = await contract.queryFilter(filter, 0, currentBlock);
        if (events.length > 0) {
          return events[events.length - 1].transactionHash;
        }
      } catch {
        // RPC rejected full range — fall through to chunked scan
      }

      // Attempt 2: chunked scan (newest → oldest, 2 000 blocks per chunk)
      const CHUNK = 2_000;
      for (let to = currentBlock; to >= 0; to -= CHUNK) {
        const from = Math.max(0, to - CHUNK + 1);
        try {
          const events = await contract.queryFilter(filter, from, to);
          if (events.length > 0) {
            return events[events.length - 1].transactionHash;
          }
        } catch {
          // Chunk failed — continue to next
        }
      }
    } catch {
      // provider.getBlockNumber() failed
    }
    return null;
  };

  // Resync: find the real tx hash for users stuck with placeholder hashes
  const handleResyncTx = async (user: UserProfile) => {
    if (!window.ethereum || !CONTRACT_ADDRESS || !user.walletAddress) return;
    setResyncingUserId(user.id);
    setError(null);
    try {
      // Must be on Sepolia — otherwise we'd scan the wrong network
      const onSepolia = await ensureSepoliaNetwork();
      if (!onSepolia) {
        setError("Please switch MetaMask to Sepolia before resyncing.");
        setResyncingUserId(null);
        return;
      }

      const addr = getAddress(user.walletAddress.trim().replace(/\s+/g, ""));
      const provider = new BrowserProvider(window.ethereum);
      const contract = new Contract(CONTRACT_ADDRESS, WHITELIST_ABI, provider);
      const realHash = await findAuthorizationTxHash(contract, provider, addr);
      if (realHash) {
        await adminApi.whitelistUser(user.id, realHash);
        patchLocalUser(user.id, { whitelistTransactionHash: realHash });
        setSuccess(`Transaction synced for ${user.displayName}. Tx: ${realHash.slice(0, 10)}…`);
      } else {
        setError(`Could not locate the on-chain transaction for ${user.displayName}. Please verify the contract address and try again.`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to resync transaction.");
    } finally {
      setResyncingUserId(null);
    }
  };

  const handleWhitelistOnLedger = async (user: UserProfile) => {
    if (!walletAddress) { setError("Connect your admin wallet first."); return; }
    if (!CONTRACT_ADDRESS) { setError("Smart contract address not configured."); return; }
    if (!window.ethereum) { setError("MetaMask is not installed."); return; }
    if (!user.walletAddress || user.walletAddress.trim() === "") {
      setError(`Cannot whitelist ${user.displayName}: no wallet address on record.`);
      return;
    }

    // Sanitize: strip hidden whitespace/newlines from copy-paste
    const rawAddress = user.walletAddress.trim().replace(/\s+/g, "");

    // Validate: must be a proper Ethereum address
    if (!isAddress(rawAddress)) {
      setError(
        `Invalid Ethereum address for ${user.displayName}: "${rawAddress}". ` +
        `Make sure it starts with 0x and is 42 characters long.`
      );
      return;
    }

    // Normalize to EIP-55 checksum format (prevents toLowerCase crash in MetaMask)
    const normalizedAddress = getAddress(rawAddress);

    setWhitelistingUserId(user.id);
    setError(null);

    // Track sent tx hash so we can recover even if tx.wait() or backend call fails
    let capturedTxHash: string | null = null;

    try {
      // Ensure MetaMask is on Sepolia before sending — otherwise tx lands on wrong chain
      // and the Etherscan link becomes invalid
      const onSepolia = await ensureSepoliaNetwork();
      if (!onSepolia) {
        setError("Please switch MetaMask to the Sepolia testnet before whitelisting.");
        setWhitelistingUserId(null);
        return;
      }

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, WHITELIST_ABI, signer);

      // Pre-check on-chain (read-only, no gas, no MetaMask popup)
      // If already authorized on-chain, look up the original tx hash from contract events
      const [isAlreadyAuthorized] = await contract.checkAuthorization(normalizedAddress);
      if (isAlreadyAuthorized) {
        const resolvedTxHash = await findAuthorizationTxHash(contract, provider, normalizedAddress);
        if (!resolvedTxHash) {
          setError(
            `${user.displayName} is already authorized on-chain but the original transaction could not be found. ` +
            `This may be due to RPC limitations. The database was NOT updated.`
          );
          setWhitelistingUserId(null);
          return;
        }
        await adminApi.whitelistUser(user.id, resolvedTxHash);
        patchLocalUser(user.id, {
          isWhitelisted: true,
          whitelistTransactionHash: resolvedTxHash,
          registryStatus: "SUCCESSFULLY_WHITELISTED",
        });
        setSuccess(
          `${user.displayName} was already whitelisted on-chain. Tx: ${resolvedTxHash.slice(0, 10)}…`
        );
        setWhitelistingUserId(null);
        await fetchUsers();
        return;
      }

      const tx = await (user.regionCode
        ? contract["authorizeUser(address,string,uint8)"](normalizedAddress, user.assignedRole || "public", user.regionCode)
        : contract["authorizeUser(address,string)"](normalizedAddress, user.assignedRole || "public"));
      // Capture tx hash IMMEDIATELY — available right after MetaMask signs,
      // before waiting for on-chain confirmation. This is the key fix:
      // tx.wait() can return null in ethers v6 if the tx is dropped/replaced,
      // so we must NOT depend on receipt.hash.
      capturedTxHash = tx.hash;

      // Wait for on-chain confirmation
      await tx.wait();

      // Sync with backend
      await adminApi.whitelistUser(user.id, capturedTxHash!);

      // Optimistic local update — user sees the change instantly
      patchLocalUser(user.id, {
        isWhitelisted: true,
        whitelistTransactionHash: capturedTxHash ?? undefined,
        registryStatus: "SUCCESSFULLY_WHITELISTED",
      });

      setSuccess(`${user.displayName} has been successfully whitelisted on the National Ledger. Tx: ${capturedTxHash!.slice(0, 10)}...`);

      // ── Signature Gate: Log the whitelist action with MetaMask signature ──
      try {
        const signResult = await signFinalWhitelist({
          referenceId: `WL-${user.id}`,
          userAddress: normalizedAddress,
          userRole: user.assignedRole || "public",
          description: `Admin whitelisted ${user.displayName} (${user.assignedRole}) on the National Ledger`,
        });
        await logToAuditTrail(signResult, {
          role: "admin",
          actionType: "FINAL_WHITELIST",
          referenceId: `WL-${user.id}`,
          description: `Admin whitelisted ${user.displayName} (${user.assignedRole})`,
          actorName: "National Admin",
          region: user.assignedRegion,
        });
      } catch (signErr) {
        console.warn("[Admin] Signature gate logging failed (whitelist still succeeded):", signErr);
      }

      await fetchUsers();
    } catch (err: any) {
      if (handleGasError(err)) { setWhitelistingUserId(null); return; }
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        setError("Transaction was rejected in MetaMask.");
      } else if (capturedTxHash) {
        // Transaction was already sent to the blockchain (MetaMask signed it)
        // but something failed afterwards (tx.wait timed out, receipt was null,
        // or the backend API call failed). Try to sync the backend anyway.
        try {
          await adminApi.whitelistUser(user.id, capturedTxHash);
          patchLocalUser(user.id, {
            isWhitelisted: true,
            whitelistTransactionHash: capturedTxHash,
            registryStatus: "SUCCESSFULLY_WHITELISTED",
          });
          setSuccess(`${user.displayName} whitelisted on-chain. Tx: ${capturedTxHash.slice(0, 10)}...`);
          await fetchUsers();
        } catch {
          setError(
            `Transaction was sent (${capturedTxHash.slice(0, 10)}…) but the database update failed. ` +
            `Please refresh the page — the system will sync automatically on the next whitelist attempt.`
          );
        }
      } else if (err.reason?.toLowerCase().includes("already authorized")) {
        // Fallback: contract reverted — try to recover the real tx hash from events
        try {
          const provider = new BrowserProvider(window.ethereum);
          const readContract = new Contract(CONTRACT_ADDRESS, WHITELIST_ABI, provider);
          const resolvedTxHash = await findAuthorizationTxHash(readContract, provider, normalizedAddress);
          if (resolvedTxHash) {
            await adminApi.whitelistUser(user.id, resolvedTxHash);
            patchLocalUser(user.id, {
              isWhitelisted: true,
              whitelistTransactionHash: resolvedTxHash,
              registryStatus: "SUCCESSFULLY_WHITELISTED",
            });
            setSuccess(`${user.displayName} was already whitelisted on-chain. Tx: ${resolvedTxHash.slice(0, 10)}…`);
            await fetchUsers();
          } else {
            setError("User is already on-chain but the original tx hash could not be found. Try refreshing.");
          }
        } catch {
          setError("User is already on-chain but failed to sync database. Try refreshing.");
        }
      } else if (err.reason) {
        setError(`Smart contract error: ${err.reason}`);
      } else {
        setError(err.response?.data?.message || err.message || "Failed to whitelist user");
      }
    } finally {
      setWhitelistingUserId(null);
    }
  };

  // Exclude admin/budget-authority wallet and seeded national-level roles (coa_admin, overseer)
  // These are seeded directly to the smart contract and should not appear in the user table
  const SEEDED_ROLES = new Set(["admin", "coa_admin", "overseer"]);
  const registrableUsers = users.filter((u) => !SEEDED_ROLES.has(u.assignedRole ?? ""));

  const filteredUsers = registrableUsers.filter((user) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      (user.displayName?.toLowerCase().includes(query) || false) ||
      (user.walletAddress?.toLowerCase().includes(query) || false) ||
      (user.assignedRole?.toLowerCase().includes(query) || false) ||
      (user.assignedRegion?.toLowerCase().includes(query) || false) ||
      (user.email?.toLowerCase().includes(query) || false);
    const matchesRegion = !regionFilter || user.assignedRegion === regionFilter;
    const matchesStatus = !statusFilter || user.registryStatus === statusFilter;
    return matchesSearch && matchesRegion && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Official Registry</h2>
          <p className="text-sm text-muted-foreground mt-1">National blockchain ledger of authorized infrastructure officials.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchUsers}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-border bg-background hover:bg-muted transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => {
              setShowRegisterModal(true);
              setVerifyChecked(false);
              setWalletValidation({ checking: false, valid: null, exists: null, upgradeable: null, message: "" });
              setFormData({ fullName: "", walletAddress: "", role: "", region: "", regionCode: 0, email: "", noaReference: "", prcLicenseNumber: "", documentHash: "" });
            }}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Register New Official
          </button>
        </div>
      </div>

      {/* Alerts */}
      {success && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
          <p className="text-sm text-primary">{success}</p>
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Search by name, wallet, role, region..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="w-full sm:w-auto sm:min-w-[140px] px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary truncate"
        >
          <option value="">All Regions</option>
          {REGION_OPTIONS.map((r) => (
            <option key={r.name} value={r.name}>{r.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-auto sm:min-w-[160px] px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary truncate"
        >
          <option value="">All Statuses</option>
          <option value="REGISTERED">Registered</option>
          <option value="PENDING_BLOCKCHAIN_CONFIRMATION">Pending Blockchain</option>
          <option value="SUCCESSFULLY_WHITELISTED">Whitelisted</option>
          <option value="REJECTED">Rejected</option>
          <option value="PENDING_REGISTRATION">Pending Registration</option>
        </select>
      </div>

      {/* ─── Registry List ─── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">Loading registry...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {searchQuery || regionFilter || statusFilter ? "No officials match your filters." : "No registered officials yet."}
            </p>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_160px] items-center px-6 py-3 border-b border-border bg-muted/40">
              {[
                "Official",
                "Wallet",
                "Role",
                "Region",
                "Status",
                "Transaction",
                "Action",
              ].map((h, i) => (
                <span
                  key={i}
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            {filteredUsers.map((user) => {
              const statusCfg = getRegistryStatusConfig(user.registryStatus);
              return (
                <div
                  key={user.id}
                  className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_160px] items-center px-6 py-4 border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                >
                  {/* Official */}
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-medium text-foreground truncate leading-snug">
                      {user.displayName || "—"}
                    </p>
                    {user.email && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                    )}
                  </div>

                  {/* Wallet */}
                  <div className="min-w-0 pr-3">
                    <span
                      className="font-mono text-xs text-muted-foreground tracking-tight"
                      title={user.walletAddress}
                    >
                      {user.walletAddress
                        ? `${user.walletAddress.slice(0, 7)}...${user.walletAddress.slice(-5)}`
                        : "—"}
                    </span>
                  </div>

                  {/* Role */}
                  <div className="min-w-0 pr-3">
                    <span className={`inline-block max-w-full px-2 py-1 rounded-md text-xs font-medium truncate ${getRoleBadgeClass()}`}>
                      {getRoleLabel(user.assignedRole)}
                    </span>
                  </div>

                  {/* Region */}
                  <div className="min-w-0 pr-3">
                    <span className="text-xs text-muted-foreground truncate block">
                      {user.assignedRegion || "—"}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="min-w-0 pr-3">
                    <span className={`inline-block max-w-full px-2 py-1 rounded-md text-xs font-medium border truncate ${statusCfg.className}`}>
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Transaction */}
                  <div>
                    {(() => {
                      const hash = user.whitelistTransactionHash;
                      const isRealTx = hash && /^0x([A-Fa-f0-9]{64})$/.test(hash);
                      if (isRealTx) {
                        return (
                          <a
                            href={`https://sepolia.etherscan.io/tx/${hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            View TX →
                          </a>
                        );
                      }
                      if (hash) {
                        // Hash is a placeholder (e.g. "already-authorized-on-chain") — offer resync
                        return (
                          <button
                            onClick={() => handleResyncTx(user)}
                            disabled={resyncingUserId === user.id}
                            className="text-xs text-primary hover:underline font-medium disabled:opacity-50"
                          >
                            {resyncingUserId === user.id ? "Syncing..." : "Resync TX"}
                          </button>
                        );
                      }
                      return <span className="text-xs text-muted-foreground/40">—</span>;
                    })()}
                  </div>

                  {/* Action */}
                  <div className="flex flex-row gap-2 items-center justify-end">
                    {!user.isWhitelisted && user.assignedRole && user.assignedRole !== "public" && user.registryStatus !== "REJECTED" ? (
                      /* ── Pending approval: full whitelist + reject ── */
                      <>
                        <button
                          onClick={() => handleWhitelistOnLedger(user)}
                          disabled={whitelistingUserId === user.id || rejectingUserId === user.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                        >
                          {whitelistingUserId === user.id ? "Listing..." : "Whitelist"}
                        </button>
                        <button
                          onClick={() => handleRejectUser(user)}
                          disabled={rejectingUserId === user.id || whitelistingUserId === user.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                        >
                          {rejectingUserId === user.id ? "..." : "Reject"}
                        </button>
                      </>
                    ) : user.isWhitelisted && !user.whitelistTransactionHash && user.registryStatus !== "REJECTED" ? (
                      /* ── DB-whitelisted (auto via project assignment) but NOT yet on-chain ── */
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={() => handleWhitelistOnLedger(user)}
                          disabled={whitelistingUserId === user.id}
                          title="This user was auto-whitelisted via project assignment. Authorize them on-chain so their blockchain calls work."
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                        >
                          {whitelistingUserId === user.id ? "Authorizing..." : "Whitelist on Ledger"}
                        </button>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight text-right">
                          Assigned via project — needs on-chain auth
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* REGISTER OFFICIAL MODAL — Multi-Step Verified  */}
      {/* ═══════════════════════════════════════════════ */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowRegisterModal(false)}
          />
          <div className="relative z-50 w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-card z-10 rounded-t-2xl">
              <h3 className="text-lg font-semibold text-foreground">Register Infrastructure Official</h3>
              <p className="text-xs text-muted-foreground mt-1">
                All entries are validated before binding to the National Blockchain Ledger.
              </p>
            </div>

            <form onSubmit={handleRegisterUser} className="p-6 space-y-4">
              {/* ── Full Name ── */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Full Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="e.g. Juan Dela Cruz"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  required
                />
              </div>

              {/* ── Wallet Address ── */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Wallet Address <span className="text-destructive">*</span>
                  <span className="ml-2 text-[10px] text-muted-foreground font-normal">Bound to National Ledger</span>
                </label>
                <input
                  type="text"
                  value={formData.walletAddress}
                  onChange={(e) => handleWalletChange(e.target.value)}
                  placeholder="0x..."
                  className={`w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono ${
                    walletValidation.valid === false ||
                    (walletValidation.exists === true && walletValidation.upgradeable === false)
                      ? "border-destructive focus:border-destructive"
                      : walletValidation.valid === true && walletValidation.exists === false
                        ? "border-primary focus:border-primary"
                        : "border-border focus:border-primary"
                  }`}
                  required
                />
                {walletValidation.message && (
                  <p className={`mt-1.5 text-xs ${
                    walletValidation.valid === false || (walletValidation.exists === true && !walletValidation.upgradeable)
                      ? "text-destructive"
                      : walletValidation.checking
                        ? "text-muted-foreground"
                        : "text-primary"
                  }`}>
                    {walletValidation.message}
                  </p>
                )}
              </div>

              {/* ── Role ── */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                    Designated Role <span className="text-destructive">*</span>
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value, noaReference: "", prcLicenseNumber: "" })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none cursor-pointer"
                  required
                >
                  <option value="">Select a role...</option>
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* ── Region ── */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Assigned Region {requiresRegion(formData.role) && <span className="text-destructive">*</span>}
                </label>
                <select
                  value={formData.region}
                  onChange={(e) => {
                    const selected = REGION_OPTIONS.find(r => r.name === e.target.value);
                    setFormData({ ...formData, region: e.target.value, regionCode: selected?.code ?? 0 });
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none cursor-pointer"
                >
                  <option value="">Select a region...</option>
                  {REGION_OPTIONS.map((r) => (
                    <option key={r.name} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* ── Email ── */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Email <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="official@gov.ph"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>

              {/* ════════════════════════════════════ */}
              {/* VERIFICATION REVIEW STEP            */}
              {/* ════════════════════════════════════ */}
              <div className="border-t border-border pt-4 mt-2">
                <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-3">
                  <p className="text-xs font-semibold text-foreground">Verification Review</p>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted-foreground">Name:</span>
                      <span className="ml-1 text-foreground font-medium">{formData.fullName || "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Role:</span>
                      <span className="ml-1 text-foreground font-medium">
                        {ROLE_OPTIONS.find((r) => r.value === formData.role)?.label || "—"}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Wallet:</span>
                      <span className="ml-1 text-foreground font-mono font-medium">
                        {formData.walletAddress || "—"}
                      </span>
                    </div>
                    {formData.noaReference && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">NOA Ref:</span>
                        <span className="ml-1 text-foreground font-mono font-medium">{formData.noaReference}</span>
                      </div>
                    )}
                    {formData.prcLicenseNumber && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">PRC License:</span>
                        <span className="ml-1 text-foreground font-mono font-medium">{formData.prcLicenseNumber}</span>
                      </div>
                    )}
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={verifyChecked}
                      onChange={(e) => setVerifyChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
                      I confirm that this Wallet Address matches the official records provided by the Endorsing Agency and all supporting documents have been verified.
                    </span>
                  </label>
                </div>
              </div>

              {/* ── Actions ── */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !isFormValid()}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? "Registering..." : "Register Official"}
                </button>
              </div>

              {!isFormValid() && (formData.fullName || formData.walletAddress || formData.role) && (
                <p className="text-[11px] text-muted-foreground text-center">
                  {!verifyChecked
                    ? "Complete the verification checkbox to enable registration."
                    : walletValidation.exists === true && walletValidation.upgradeable === false
                      ? "This wallet is already registered with an assigned role."
                      : walletValidation.valid === false
                        ? "Fix the wallet address format."
                        : requiresRegion(formData.role) && (!formData.region || formData.regionCode < 1 || formData.regionCode > 18)
                          ? "Select a valid region for this role."
                        : formData.role === "contractor" && !formData.noaReference
                          ? "NOA Reference is required for contractors."
                          : formData.role === "inspector" && !formData.prcLicenseNumber
                            ? "PRC License is required for inspectors."
                            : "Complete all required fields."}
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ── Insufficient Gas Modal ── */}
      <InsufficientGasModal open={gasError.open} onClose={clearGasError} message={gasError.message} />
    </div>
  );
}
