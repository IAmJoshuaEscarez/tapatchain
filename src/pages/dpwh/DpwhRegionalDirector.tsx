import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button, PaginationControls } from "@/components/ui";
import { authApi, adminApi, type UserProfile } from "@/services/api";
import { stakeholderApi, type CreateStakeholderPayload, type StakeholderResponse } from "@/features/stakeholder/api/stakeholderApi";
import { useLookup } from "@/hooks";
import { useWallet } from "@/context/WalletContext";
import { useProjectContext, type RDCProject } from "@/context/ProjectContext";
import {
  signRegisterProfessional,
  signMilestonePayment,
  logToAuditTrail,
} from "@/services/signatureGate";
import { useMilestoneContext, type Milestone } from "@/context/MilestoneContext";
import { useGasGuard } from "@/hooks/useGasGuard";
import { InsufficientGasModal } from "@/components/ui";
import { CheckCircle, Clock, X, MapPin, Shield, ExternalLink, Search, Building2, Filter, Wallet, XCircle, Briefcase, UserPlus, Users, Banknote, FileCheck } from "lucide-react";
import { WhitelistPersonnelModal } from "@/components/features/admin";
import { getAddress, isAddress } from "ethers";

interface DPWHRegionalDirectorDashboardProps {
  setCurrentPage: (page: string) => void;
}

type TabId = "funded" | "assigned" | "payments" | "register";

const TABS: { id: TabId; label: string }[] = [
  { id: "funded", label: "Funded Projects" },
  { id: "assigned", label: "Assigned Projects" },
  { id: "payments", label: "Pending Payments" },
  { id: "register", label: "Register Professional" },
];

const FUNDED_PROJECT_PAGE_SIZE = 8;

export function DPWHRegionalDirectorDashboard({ setCurrentPage }: DPWHRegionalDirectorDashboardProps) {
  const { walletAddress, disconnectWallet } = useWallet();
  const { projects: allProjects, updateProject } = useProjectContext();
  const { getCoaAuditedMilestones, updateMilestoneStatus, updateMilestone } = useMilestoneContext();
  const { gasError, clearGasError, handleGasError } = useGasGuard();
  const { items: regionLookup } = useLookup("Region");
  const regionMap = Object.fromEntries(regionLookup.map(r => [r.code ?? 0, r.name]));
  const [activeTab, setActiveTab] = useState<TabId>("funded");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ show: false, message: "", type: "success" });

  const [projectSearch, setProjectSearch] = useState("");
  const [municipalityFilter, setMunicipalityFilter] = useState("All");
  const [assignmentFilter, setAssignmentFilter] = useState<"All" | "Assigned" | "Unassigned">("All");
  const [whitelistModalProject, setWhitelistModalProject] = useState<RDCProject | null>(null);


  const [assignedSearch, setAssignedSearch] = useState("");


  const [registeredProfessionals, setRegisteredProfessionals] = useState<StakeholderResponse[]>([]);
  const [regForm, setRegForm] = useState({
    name: "",
    licenseId: "",
    role: "Contractor" as "Contractor" | "SiteEngineer",
    walletAddress: "",
  });
  const [isRegistering, setIsRegistering] = useState(false);

  const [walletValidation, setWalletValidation] = useState<{
    checking: boolean;
    valid: boolean | null;
    exists: boolean | null;
    upgradeable: boolean | null;
    message: string;
  }>({ checking: false, valid: null, exists: null, upgradeable: null, message: "" });
  const walletCheckTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [verifyChecked, setVerifyChecked] = useState(false);


  const loadProfile = useCallback(async () => {
    try {
      const res = await authApi.getProfile();
      setProfile(res.data);
    } catch {

    }
  }, []);

  const loadRegisteredProfessionals = useCallback(async () => {
    try {
      const contractors = await stakeholderApi.getByType("Contractor");
      const engineers = await stakeholderApi.getByType("SiteEngineer");
      const all = [...contractors.data, ...engineers.data].filter(s => s.isActive);
      setRegisteredProfessionals(all);
    } catch {
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadRegisteredProfessionals();
  }, [loadProfile, loadRegisteredProfessionals]);

  const validateWallet = useCallback(async (address: string) => {
    if (!address) {
      setWalletValidation({ checking: false, valid: null, exists: null, upgradeable: null, message: "" });
      return;
    }

    const isValidFormat = /^0x[a-fA-F0-9]{40}$/.test(address);
    if (!isValidFormat) {
      setWalletValidation({
        checking: false, valid: false, exists: null, upgradeable: null,
        message: "Invalid Ethereum address format (must be 0x + 40 hex chars)",
      });
      return;
    }


    const localDup = registeredProfessionals.find(
      (s) => s.walletAddress?.toLowerCase() === address.toLowerCase()
    );

    // If wallet is already in the stakeholder list, check auth DB too.
    // If it's missing from auth DB (broken state from pre-fix registrations),
    // allow re-registration so the auth user record gets created.
    if (localDup) {
      setWalletValidation({ checking: true, valid: true, exists: true, upgradeable: null, message: "Checking authentication registry..." });
      try {
        const res = await adminApi.checkWalletExists(address);
        if (res.data.exists && !res.data.upgradeable) {
          // Already fully registered in both stakeholder AND auth DB — hard block
          setWalletValidation({
            checking: false, valid: true, exists: true, upgradeable: false,
            message: `Already registered as ${localDup.type}: "${localDup.name}"`,
          });
        } else {
          // In stakeholder list but NOT in auth DB — repair mode allowed
          setWalletValidation({
            checking: false, valid: true, exists: true, upgradeable: null,
            message: `Wallet found in stakeholder list as "${localDup.name}" but missing from authentication database — re-registration will sync it.`,
          });
        }
      } catch {
        // Auth check failed — conservatively block to avoid duplicates
        setWalletValidation({
          checking: false, valid: true, exists: true, upgradeable: false,
          message: `Already registered as ${localDup.type}: "${localDup.name}"`,
        });
      }
      return;
    }

    setWalletValidation({ checking: true, valid: true, exists: null, upgradeable: null, message: "Checking national registry..." });

    try {
      const res = await adminApi.checkWalletExists(address);
      if (res.data.exists && !res.data.upgradeable) {
        setWalletValidation({
          checking: false, valid: true, exists: true, upgradeable: false,
          message: `Wallet is already registered as ${res.data.currentRole || "an official"} in the national registry.`,
        });
      } else if (res.data.exists && res.data.upgradeable) {
        setWalletValidation({
          checking: false, valid: true, exists: true, upgradeable: true,
          message: "Wallet found as public user — will be upgraded to the selected role.",
        });
      } else {
        setWalletValidation({
          checking: false, valid: true, exists: false, upgradeable: null,
          message: "Wallet address is valid and available.",
        });
      }
    } catch {
      setWalletValidation({
        checking: false, valid: true, exists: null, upgradeable: null,
        message: "Wallet format valid. (Could not verify national registry — offline mode)",
      });
    }
  }, [registeredProfessionals]);

  const handleRegWalletChange = (value: string) => {
    setRegForm((prev) => ({ ...prev, walletAddress: value }));
    clearTimeout(walletCheckTimeout.current);
    walletCheckTimeout.current = setTimeout(() => validateWallet(value), 500);
  };


  const isRegFormValid = () => {
    if (!regForm.name.trim()) return false;
    if (!regForm.licenseId.trim()) return false;
    if (!regForm.walletAddress.trim()) return false;
    if (walletValidation.valid === false) return false;
    if (walletValidation.exists === true && walletValidation.upgradeable === false) return false;
    if (!verifyChecked) return false;
    return true;
  };

  const regionName = profile ? (regionMap[profile.regionCode] ?? profile.assignedRegion ?? "—") : "—";

  const regionProfessionals = useMemo(() => {
    if (!regionName || regionName === "—") return registeredProfessionals;
    return registeredProfessionals.filter(
      (s) => s.region === regionName
    );
  }, [registeredProfessionals, regionName]);

  const fundedProjects = useMemo(() => {
    return allProjects.filter((p) => {
      const isFundedStatus = p.status === "FUNDED" || p.status === "FUNDED_AND_ACTIVE" || p.status === "PERSONNEL_ASSIGNED" || p.status === "ONGOING";
      if (!isFundedStatus) return false;
      if (!profile) return false;
      const matchesRegion =
        p.region === regionName ||
        p.region === profile.assignedRegion ||
        (p.regionId !== undefined && p.regionId === profile.regionCode);
      return matchesRegion;
    });
  }, [allProjects, profile, regionName]);

  const fundedMunicipalities = useMemo(() => {
    const set = new Set(fundedProjects.map((p) => p.municipality).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [fundedProjects]);

  const filteredFundedProjects = useMemo(() => {
    let list = fundedProjects;

    if (municipalityFilter !== "All") {
      list = list.filter((p) => p.municipality === municipalityFilter);
    }
    if (assignmentFilter === "Assigned") {
      list = list.filter((p) => p.personnelAssigned);
    } else if (assignmentFilter === "Unassigned") {
      list = list.filter((p) => !p.personnelAssigned);
    }
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.municipality.toLowerCase().includes(q) ||
          p.province.toLowerCase().includes(q) ||
          (p.contractorName ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [fundedProjects, municipalityFilter, assignmentFilter, projectSearch]);

  const [fundedPage, setFundedPage] = useState(1);
  const fundedTotalPages = Math.max(1, Math.ceil(filteredFundedProjects.length / FUNDED_PROJECT_PAGE_SIZE));

  useEffect(() => {
    setFundedPage(1);
  }, [activeTab, municipalityFilter, assignmentFilter, projectSearch, filteredFundedProjects.length]);

  const pagedFundedProjects = useMemo(() => {
    const safePage = Math.min(fundedPage, fundedTotalPages);
    const start = (safePage - 1) * FUNDED_PROJECT_PAGE_SIZE;
    return filteredFundedProjects.slice(start, start + FUNDED_PROJECT_PAGE_SIZE);
  }, [filteredFundedProjects, fundedPage, fundedTotalPages]);

  const fundedStats = useMemo(() => ({
    total: fundedProjects.length,
    assigned: fundedProjects.filter((p) => p.personnelAssigned).length,
    unassigned: fundedProjects.filter((p) => !p.personnelAssigned).length,
  }), [fundedProjects]);

  // ── Pending Payments: COA_AUDITED milestones in this RD's region ──
  const [authorizingPaymentId, setAuthorizingPaymentId] = useState<string | null>(null);

  const pendingPayments = useMemo(() => {
    const coaAudited = getCoaAuditedMilestones();
    if (!regionName || regionName === "—") return coaAudited;
    // m.region is not returned by the API, so join via projectId instead
    const fundedProjectIds = new Set(fundedProjects.map((p) => p.id));
    return coaAudited.filter((m) => fundedProjectIds.has(m.projectId));
  }, [getCoaAuditedMilestones, fundedProjects, regionName]);

  const assignedProjects = useMemo(() => {
    let list = fundedProjects.filter((p) => p.personnelAssigned);
    if (assignedSearch.trim()) {
      const q = assignedSearch.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.municipality.toLowerCase().includes(q) ||
          (p.contractorName ?? "").toLowerCase().includes(q) ||
          (p.engineerName ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [fundedProjects, assignedSearch]);

  const isRealTxHash = (hash?: string) => {
    if (!hash || hash.length === 0) return false;
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  };

  const showNotification = (message: string, type: "success" | "error" | "info") => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification((prev) => ({ ...prev, show: false })), 4000);
  };

  const handleRegisterProfessional = async () => {

    if (!isRegFormValid()) {
      if (!regForm.name.trim()) { showNotification("Name is required.", "error"); return; }
      if (!regForm.licenseId.trim()) { showNotification("License ID is required.", "error"); return; }
      if (!regForm.walletAddress.trim() || walletValidation.valid === false) {
        showNotification("Valid Ethereum wallet address is required (0x + 40 hex chars).", "error"); return;
      }
      if (walletValidation.exists === true && walletValidation.upgradeable === false) {
        showNotification("This wallet is already registered. Cannot proceed.", "error"); return;
      }
      if (!verifyChecked) { showNotification("Please confirm the verification checkbox.", "error"); return; }
      return;
    }

    setIsRegistering(true);
    try {
      const checksumAddress = getAddress(regForm.walletAddress);

      const result = await signRegisterProfessional({
        professionalAddress: checksumAddress,
        role: regForm.role,
        region: regionName,
        licenseId: regForm.licenseId,
        name: regForm.name,
        description: `RD ${profile?.displayName ?? "—"} registered ${regForm.role} "${regForm.name}" (License: ${regForm.licenseId}) in ${regionName}`,
        regionCode: profile?.regionCode ?? 0,
      });

      if (!result.txHash || !result.onChainConfirmed) {
        throw new Error("Blockchain transaction was not confirmed. Professional was NOT saved to database.");
      }

      // Repair mode: wallet already in stakeholder list but missing auth user record
      const isRepairMode = registeredProfessionals.some(
        (s) => s.walletAddress?.toLowerCase() === checksumAddress.toLowerCase()
      );

      if (!isRepairMode) {
        const payload: CreateStakeholderPayload = {
          name: regForm.name,
          type: regForm.role,
          walletAddress: checksumAddress,
          licenseNo: regForm.licenseId,
          region: regionName,
          description: `Registered by RD — ${profile?.displayName ?? "—"}`,
          registeredByWallet: result.signer,
          registrationTxHash: result.txHash,
          registrationDataHash: result.dataHash,
          blockchainDataHash: result.txHash || result.dataHash,
          onChainConfirmed: result.onChainConfirmed ?? false,
        };
        await stakeholderApi.create(payload);
      }

      // Also register the user in the auth database so login + auto-whitelist work
      const backendRole = regForm.role === "SiteEngineer" ? "inspector" : "contractor";
      await adminApi.registerUser({
        fullName: regForm.name,
        walletAddress: checksumAddress,
        role: backendRole,
        region: regionName,
        regionCode: profile?.regionCode ?? 0,
        noaReference: backendRole === "contractor" ? regForm.licenseId : undefined,
        prcLicenseNumber: backendRole === "inspector" ? regForm.licenseId : undefined,
        documentHash: result.dataHash,
      }).catch((err) => {
        // Non-fatal: user may already exist (e.g. previously logged in as public)
        console.warn("[RD Register] Auth user creation failed (may already exist):", err);
      });

      await logToAuditTrail(result, {
        role: "rd",
        actionType: "PROFESSIONAL_REGISTERED",
        referenceId: regForm.licenseId,
        description: `Registered ${regForm.role}: ${regForm.name} (${checksumAddress.slice(0, 10)}...)`,
        actorName: profile?.displayName ?? "RD",
        region: regionName,
      }).catch(() => {});


      await loadRegisteredProfessionals();
      setRegForm({ name: "", licenseId: "", role: "Contractor", walletAddress: "" });
      setVerifyChecked(false);
      setWalletValidation({ checking: false, valid: null, exists: null, upgradeable: null, message: "" });

      showNotification(
        result.onChainConfirmed
          ? `${regForm.role} "${regForm.name}" registered on-chain! Tx: ${result.txHash.slice(0, 14)}...`
          : `${regForm.role} "${regForm.name}" registered with MetaMask signature proof.`,
        "success"
      );
    } catch (err) {
      if (handleGasError(err)) { setIsRegistering(false); return; }
      const msg = err instanceof Error ? err.message : "Registration failed";
      if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
        showNotification("MetaMask signature rejected — registration cancelled.", "error");
      } else {
        showNotification(`Registration failed: ${msg}`, "error");
      }
    } finally {
      setIsRegistering(false);
    }
  };

  // ── Authorize Milestone Payment ──
  const handleAuthorizePayment = async (milestone: Milestone) => {
    setAuthorizingPaymentId(milestone.id);
    try {
      const result = await signMilestonePayment({
        projectId: milestone.projectId,
        milestoneId: milestone.id,
        amount: milestone.requestedAmount,
        description: `RD ${profile?.displayName ?? "—"} authorized payment of ₱${milestone.requestedAmount.toLocaleString()} for milestone "${milestone.milestoneName}" on project ${milestone.projectName}`,
        metadata: {
          projectName: milestone.projectName,
          milestoneName: milestone.milestoneName,
          region: regionName,
        },
      });

      if (!result.txHash || !result.onChainConfirmed) {
        throw new Error("Blockchain transaction was not confirmed. Payment authorization was NOT saved.");
      }

      await updateMilestoneStatus(milestone.id, "MILESTONE_PAID", undefined, result.txHash, result.dataHash);
      updateMilestone(milestone.id, {
        rdPaymentAuthorizedBy: walletAddress ?? undefined,
        rdPaymentTxHash: result.txHash,
        rdPaymentDate: new Date().toISOString(),
        rdPaymentRemarks: `Authorized by RD ${profile?.displayName ?? "—"} in ${regionName}`,
      });

      await logToAuditTrail(result, {
        role: "rd",
        actionType: "MILESTONE_PAYMENT_AUTHORIZED",
        referenceId: milestone.id,
        description: `RD authorized milestone payment: ₱${milestone.requestedAmount.toLocaleString()} for "${milestone.milestoneName}"`,
        actorName: profile?.displayName ?? "RD",
        projectId: milestone.projectId,
        projectName: milestone.projectName,
        region: regionName,
      }).catch(() => {});

      showNotification(
        `Payment of ₱${milestone.requestedAmount.toLocaleString()} authorized on-chain! Tx: ${result.txHash.slice(0, 14)}...`,
        "success"
      );
    } catch (err) {
      if (handleGasError(err)) { setAuthorizingPaymentId(null); return; }
      const msg = err instanceof Error ? err.message : "Payment authorization failed";
      if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
        showNotification("MetaMask signature rejected — payment authorization cancelled.", "error");
      } else {
        showNotification(`Payment authorization failed: ${msg}`, "error");
      }
    } finally {
      setAuthorizingPaymentId(null);
    }
  };

  const walletMismatch = (() => {
    if (!profile || !walletAddress) return false;
    if (!profile.walletAddress) return false;
    return profile.walletAddress.toLowerCase() !== walletAddress.toLowerCase();
  })();


  if (walletMismatch) {
    return (
      <div className="pt-20 min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 bg-card border border-destructive/30 rounded-xl space-y-4">
          <Shield className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Wallet Mismatch Detected</h2>
          <p className="text-muted-foreground text-sm">
            The connected MetaMask wallet does not match the authorized wallet for <span className="font-semibold text-foreground">{regionName}</span>.
          </p>
          <p className="text-xs text-muted-foreground">
            Connected: <code className="text-destructive">{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</code><br />
            Authorized: <code className="text-primary">{profile?.walletAddress?.slice(0, 6)}...{profile?.walletAddress?.slice(-4)}</code>
          </p>
          <Button
            onClick={async () => { await disconnectWallet(); setCurrentPage("home"); }}
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
          >
            Disconnect & Return
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 min-h-screen bg-background">
      {notification.show && (
        <div className="fixed top-24 right-6 z-50 animate-in slide-in-from-right fade-in duration-300">
          <div
            className={`flex items-center gap-3 px-5 py-3 rounded-lg border ${
              notification.type === "success"
                ? "bg-card border-primary/30 text-foreground"
                : notification.type === "error"
                ? "bg-card border-destructive/30 text-foreground"
                : "bg-card border-border text-foreground"
            }`}
          >
            {notification.type === "success" ? (
              <CheckCircle className="w-5 h-5 text-primary" />
            ) : (
              <XCircle className="w-5 h-5 text-destructive" />
            )}
            <span className="text-sm font-medium">{notification.message}</span>
            <button
              onClick={() => setNotification({ show: false, message: "", type: "success" })}
              className="ml-2 opacity-60 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground">DPWH Regional</h1>
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">{profile?.displayName ?? "—"}</span>
                {regionName !== "—" && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 text-primary" />
                    <span className="font-semibold text-foreground">{regionName}</span>
                  </span>
                )}
                {walletAddress && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Wallet className="w-3 h-3" />
                    <code className="font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</code>
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary border border-primary/20">
                  <Shield className="w-2.5 h-2.5" /> Region Locked
                </span>
              </div>
            </div>
            <Button
              onClick={async () => { await disconnectWallet(); setCurrentPage("home"); }}
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground text-xs h-8"
            >
              Disconnect
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
        <div className="flex gap-3 border-b border-border pb-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-all rounded-t-lg whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
              {tab.id === "funded" && fundedStats.unassigned > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500/10 text-amber-600 font-semibold">
                  {fundedStats.unassigned}
                </span>
              )}
              {tab.id === "assigned" && fundedStats.assigned > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-primary/10 text-primary font-semibold">
                  {fundedStats.assigned}
                </span>
              )}
              {tab.id === "register" && regionProfessionals.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">
                  {regionProfessionals.length}
                </span>
              )}
              {tab.id === "payments" && pendingPayments.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-orange-500/10 text-orange-600 font-semibold">
                  {pendingPayments.length}
                </span>
              )}
            </button>
          ))}
        </div>

      <main className="space-y-5">

        {activeTab === "funded" && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Funded Projects", value: fundedStats.total, active: true },
                { label: "Personnel Assigned", value: fundedStats.assigned, active: false },
                { label: "Awaiting Assignment", value: fundedStats.unassigned, active: fundedStats.unassigned > 0 },
              ].map(({ label, value, active }) => (
                <div key={label} className="rounded-xl border border-border bg-card px-5 py-4">
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className={`text-3xl font-bold tracking-tight ${active ? "text-primary" : "text-foreground"}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  placeholder="Search by project ID, name, municipality, contractor..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                />
              </div>
              <div className="relative">
                <select
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer pr-8"
                  value={municipalityFilter}
                  onChange={(e) => setMunicipalityFilter(e.target.value)}
                >
                  {fundedMunicipalities.map((m) => (
                    <option key={m} value={m} className="bg-background text-foreground">
                      {m === "All" ? "All Municipalities" : m}
                    </option>
                  ))}
                </select>
                <Building2 className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5 pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer pr-8"
                  value={assignmentFilter}
                  onChange={(e) => setAssignmentFilter(e.target.value as typeof assignmentFilter)}
                >
                  <option value="All">All Status</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Unassigned">Unassigned</option>
                </select>
                <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5 pointer-events-none" />
              </div>
            </div>

        
            {filteredFundedProjects.length === 0 ? (
              <div className="rounded-xl border border-border bg-card flex flex-col items-center justify-center py-16 text-center">
                <Building2 className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  {fundedProjects.length === 0 ? "No funded projects in your region" : "No projects match your filters"}
                </p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  {fundedProjects.length === 0
                    ? "Projects will appear here after the National Admin funds them (Step 2 of GAA flow)."
                    : "Try adjusting the search or filter criteria."}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider">Project</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider">Municipality</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider">Province</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider">Budget</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider">Contractor</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider">Engineer</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-center font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pagedFundedProjects.map((project) => (
                        <tr key={project.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-foreground truncate max-w-[200px]" title={project.title}>{project.title}</p>
                            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{project.id}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 text-sm text-foreground">
                              <MapPin className="w-3 h-3 text-primary" /> {project.municipality || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{project.province || "—"}</td>
                          <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">{project.approvedBudget}</td>
                          <td className="px-4 py-3">
                            {project.contractorWallet ? (
                              <div>
                                <p className="text-sm text-foreground truncate max-w-[120px]">{project.contractorName || "—"}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">{project.contractorWallet.slice(0, 6)}...{project.contractorWallet.slice(-4)}</p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">Not assigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {project.engineerWallet ? (
                              <div>
                                <p className="text-sm text-foreground truncate max-w-[120px]">{project.engineerName || project.inspectorName || "—"}</p>
                                <p className="font-mono text-[10px] text-muted-foreground">{project.engineerWallet.slice(0, 6)}...{project.engineerWallet.slice(-4)}</p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">Not assigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {project.personnelAssigned ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                                <CheckCircle className="w-3 h-3" /> Assigned
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                <Clock className="w-3 h-3" /> Awaiting
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {project.personnelAssigned && project.personnelTxHash ? (
                              <div className="inline-flex items-center gap-1.5">
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 cursor-default"
                                  title={`Proof: ${project.personnelTxHash}`}
                                >
                                  <CheckCircle className="w-3 h-3" /> Signed
                                </span>
                                
                                <a
                                  href={`https://sepolia.etherscan.io/tx/${project.personnelTxHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                                  title="View on Etherscan"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            ) : project.personnelAssigned ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-3 text-xs gap-1.5 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                                onClick={() => setWhitelistModalProject(project)}
                              >
                                <XCircle className="w-3 h-3" /> Re-sign
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="h-7 px-3 text-xs gap-1.5"
                                onClick={() => setWhitelistModalProject(project)}
                              >
                                <Shield className="w-3 h-3" /> Whitelist
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              
                <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    Showing {filteredFundedProjects.length} of {fundedProjects.length} funded projects in {regionName}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Shield className="w-3 h-3" />
                    <span>Each "Whitelist" action requires MetaMask signature</span>
                  </div>
                </div>

                <PaginationControls
                  page={Math.min(fundedPage, fundedTotalPages)}
                  totalPages={fundedTotalPages}
                  onPageChange={setFundedPage}
                  className="px-4 pb-4"
                />
              </div>
            )}

        
            <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground py-2 flex-wrap">
              <span>Step 1: RDC Proposed</span>
              <span>&rarr;</span>
              <span>Step 2: National Funded</span>
              <span>&rarr;</span>
              <span className="font-bold text-primary">Step 3: RD Assigns Personnel &larr; You are here</span>
              <span>&rarr;</span>
              <span>Step 4: Contractor Progress</span>
              <span>&rarr;</span>
              <span>Step 5: Site Engineer Review</span>
              <span>&rarr;</span>
              <span>Step 6: COA Regional Audit</span>
              <span>&rarr;</span>
              <span>Step 7: RD Payment Release</span>
            </div>
          </div>
        )}

        
        {activeTab === "assigned" && (
          <div className="space-y-5">
        
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: "Total Assigned", value: fundedStats.assigned, active: true },
                { label: "Total Funded", value: fundedStats.total, active: false },
                { label: "Awaiting Assignment", value: fundedStats.unassigned, active: fundedStats.unassigned > 0 },
              ].map(({ label, value, active }) => (
                <div key={label} className="rounded-xl border border-border bg-card px-5 py-4">
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className={`text-3xl font-bold tracking-tight ${active ? "text-primary" : "text-foreground"}`}>{value}</p>
                </div>
              ))}
            </div>

      
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <input
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  placeholder="Search by project, municipality, contractor, engineer..."
                  value={assignedSearch}
                  onChange={(e) => setAssignedSearch(e.target.value)}
                />
              </div>
            </div>

  
            {assignedProjects.length === 0 ? (
              <div className="rounded-xl border border-border bg-card flex flex-col items-center justify-center py-16 text-center">
                <Briefcase className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  {fundedStats.assigned === 0 ? "No assigned projects yet" : "No projects match your search"}
                </p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  {fundedStats.assigned === 0
                    ? "Assign personnel to funded projects using the Whitelist button on the Funded Projects tab."
                    : "Try adjusting the search criteria."}
                </p>
                {fundedStats.assigned === 0 && fundedStats.unassigned > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 text-xs"
                    onClick={() => setActiveTab("funded")}
                  >
                    Go to Funded Projects ({fundedStats.unassigned} awaiting)
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {assignedProjects.map((project) => (
                  <div key={project.id} className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors">
                    {/* Project header */}
                    <div className="px-5 py-4 border-b border-border bg-muted/20">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-foreground truncate">{project.title}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3" /> {project.municipality}, {project.province}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">{project.id}</span>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
                          <CheckCircle className="w-3 h-3" /> Assigned
                        </span>
                      </div>
                      {project.approvedBudget && (
                        <p className="text-xs text-muted-foreground mt-1.5">Budget: <span className="font-semibold text-foreground">{project.approvedBudget}</span></p>
                      )}
                    </div>

                    {/* Personnel info */}
                    <div className="px-5 py-4 space-y-3">
                      {/* Contractor */}
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Briefcase className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contractor</p>
                          <p className="text-sm font-medium text-foreground truncate">{project.contractorName || "—"}</p>
                          {project.contractorWallet && (
                            <p className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
                              <Wallet className="w-3 h-3 inline mr-1" />
                              {project.contractorWallet}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Engineer */}
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Shield className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Site Engineer</p>
                          <p className="text-sm font-medium text-foreground truncate">{project.engineerName || project.inspectorName || "—"}</p>
                          {project.engineerWallet && (
                            <p className="font-mono text-[10px] text-muted-foreground truncate mt-0.5">
                              <Wallet className="w-3 h-3 inline mr-1" />
                              {project.engineerWallet}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Contract dates */}
                      {(project.contractStartDate || project.contractEndDate) && (
                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            Contract: {project.contractStartDate || "—"} → {project.contractEndDate || "—"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Blockchain proof footer */}
                    <div className="px-5 py-3 border-t border-border bg-muted/10 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {isRealTxHash(project.personnelTxHash)
                          ? <span className="font-mono">TX: {project.personnelTxHash?.slice(0, 10)}...{project.personnelTxHash?.slice(-6)}</span>
                          : "Signed via MetaMask"
                        }
                      </span>
                      {isRealTxHash(project.personnelTxHash) ? (
                        <a
                          href={`https://sepolia.etherscan.io/tx/${project.personnelTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                        >
                          View on Etherscan <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-primary font-medium">
                          <CheckCircle className="w-3 h-3" /> Verified
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ Pending Payments Tab ═══ */}
        {activeTab === "payments" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: "Awaiting Final Release", value: pendingPayments.length, active: pendingPayments.length > 0 },
                { label: "Total Requested", value: `₱${pendingPayments.reduce((sum, m) => sum + m.requestedAmount, 0).toLocaleString()}`, active: false },
                { label: "Region", value: regionName, active: false },
              ].map(({ label, value, active }) => (
                <div key={label} className="rounded-xl border border-border bg-card px-5 py-4">
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-bold tracking-tight ${active ? "text-orange-600" : "text-foreground"}`}>{value}</p>
                </div>
              ))}
            </div>

            {pendingPayments.length === 0 ? (
              <div className="rounded-xl border border-border bg-card flex flex-col items-center justify-center py-16 text-center">
                <Banknote className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">No milestones awaiting disbursement</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Milestones will appear here after they pass COA Regional forensic audit (COA_AUDITED status).
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingPayments.map((milestone) => {
                  // Compute forensic score from milestone photos
                  const totalPhotos = milestone.photos?.length ?? 0;
                  const verifiedPhotos = milestone.photos?.filter(p => !p.isTampered).length ?? 0;
                  const forensicScore = totalPhotos > 0 ? Math.round((verifiedPhotos / totalPhotos) * 100) : 0;
                  const hasTamperedPhotos = milestone.photos?.some(p => p.isTampered) ?? false;

                  return (
                  <div key={milestone.id} className="rounded-xl border border-border bg-card overflow-hidden hover:border-orange-500/30 transition-colors">
                    <div className="px-5 py-4 border-b border-border bg-muted/20">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-foreground">{milestone.milestoneName}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">{milestone.projectName}</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{milestone.projectId}</span>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-green-500/10 text-green-600 border border-green-500/20 flex-shrink-0">
                          <FileCheck className="w-3 h-3" /> COA Audited
                        </span>
                      </div>
                    </div>

                    <div className="px-5 py-4 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <p className="text-muted-foreground">Requested Amount</p>
                          <p className="font-semibold text-foreground">₱{milestone.requestedAmount.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Progress</p>
                          <p className="font-semibold text-foreground">{milestone.targetProgress}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Contractor</p>
                          <p className="font-semibold text-foreground truncate">{milestone.contractorName}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Location</p>
                          <p className="font-semibold text-foreground truncate">{milestone.municipality}, {milestone.region}</p>
                        </div>
                      </div>

                      {/* ── Proof of Integrity: Forensic Score ── */}
                      <div className="p-3 rounded-lg border border-border bg-muted/30">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Proof of Integrity — Forensic Audit Summary</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div>
                            <p className="text-muted-foreground">Forensic Score</p>
                            <p className={`font-bold ${forensicScore === 100 ? "text-green-600" : forensicScore >= 80 ? "text-yellow-600" : "text-red-600"}`}>
                              {forensicScore}%
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Photos Verified</p>
                            <p className="font-semibold text-foreground">{verifiedPhotos} / {totalPhotos}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">GPS Verified</p>
                            <p className="font-semibold text-foreground">{milestone.gpsVerified ? "Yes" : "No"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Integrity</p>
                            <p className={`font-semibold ${hasTamperedPhotos ? "text-red-600" : "text-green-600"}`}>
                              {hasTamperedPhotos ? "⚠ Issues Detected" : "✓ Clean"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* ── COA Auditor Remarks ── */}
                      {milestone.coaRemarks && (
                        <div className="p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">COA Audit Remarks</p>
                          <p className="text-xs text-foreground">{milestone.coaRemarks}</p>
                          {milestone.coaAuditorName && (
                            <p className="text-[10px] text-muted-foreground mt-1">— {milestone.coaAuditorName}, {milestone.coaApprovedDate}</p>
                          )}
                        </div>
                      )}

                      {/* ── Site Engineer Remarks ── */}
                      {milestone.inspectorRemarks && (
                        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Site Engineer Verification Remarks</p>
                          <p className="text-xs text-foreground">{milestone.inspectorRemarks}</p>
                          {milestone.inspectorName && (
                            <p className="text-[10px] text-muted-foreground mt-1">— {milestone.inspectorName}, {milestone.inspectedDate}</p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="px-5 py-3 border-t border-border bg-muted/10 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        Submitted: {milestone.submittedDate}
                      </span>
                      <Button
                        size="sm"
                        className="h-8 px-4 text-xs gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
                        disabled={authorizingPaymentId === milestone.id}
                        onClick={() => handleAuthorizePayment(milestone)}
                      >
                        {authorizingPaymentId === milestone.id ? (
                          <><Clock className="w-3 h-3 animate-spin" /> Signing...</>
                        ) : (
                          <><Banknote className="w-3 h-3" /> Final Release: Authorize Payment for {milestone.milestoneName}</>
                        )}
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground py-2 flex-wrap">
              <span>Step 1: Contractor Submits</span>
              <span>&rarr;</span>
              <span>Step 2: Engineer Verifies</span>
              <span>&rarr;</span>
              <span>Step 3: COA Audits</span>
              <span>&rarr;</span>
              <span className="font-bold text-orange-600">Step 4: RD Authorizes Disbursement &larr; You are here</span>
              <span>&rarr;</span>
              <span>Next Milestone</span>
            </div>
          </div>
        )}

        {/* ═══ Register Professional Tab ═══ */}
        {activeTab === "register" && (
          <div className="space-y-6">
            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: "Contractors", value: regionProfessionals.filter(s => s.type === "Contractor").length, active: true },
                { label: "Site Engineers", value: regionProfessionals.filter(s => s.type === "SiteEngineer").length, active: true },
                { label: "Total Registered", value: regionProfessionals.length, active: false },
              ].map(({ label, value, active }) => (
                <div key={label} className="rounded-xl border border-border bg-card px-5 py-4">
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className={`text-3xl font-bold tracking-tight ${active ? "text-primary" : "text-foreground"}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-6">
              {/* ── Registration Form ── */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/20">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-primary" /> Register New Professional
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Registration is signed with MetaMask and recorded on the blockchain.
                  </p>
                </div>

                <div className="p-6 space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Full Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      value={regForm.name}
                      onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                      placeholder="e.g. Juan Dela Cruz"
                      disabled={isRegistering}
                    />
                  </div>

                  {/* License ID */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      License ID <span className="text-destructive">*</span>
                      <span className="ml-2 text-[10px] text-muted-foreground font-normal">PCAB (Contractor) or PRC (Engineer)</span>
                    </label>
                    <input
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      value={regForm.licenseId}
                      onChange={(e) => setRegForm({ ...regForm, licenseId: e.target.value })}
                      placeholder="e.g. PCAB-12345 or PRC-67890"
                      disabled={isRegistering}
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Role <span className="text-destructive">*</span>
                    </label>
                    <select
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer"
                      value={regForm.role}
                      onChange={(e) => setRegForm({ ...regForm, role: e.target.value as "Contractor" | "SiteEngineer" })}
                      disabled={isRegistering}
                    >
                      <option value="Contractor">Contractor</option>
                      <option value="SiteEngineer">Site Engineer</option>
                    </select>
                  </div>

                  {/* Wallet Address — with real-time validation (mirrors Admin Portal) */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">
                      Wallet Address <span className="text-destructive">*</span>
                      <span className="ml-2 text-[10px] text-muted-foreground font-normal">Ethereum (MetaMask)</span>
                    </label>
                    <input
                      className={`w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono ${
                        walletValidation.valid === false ||
                        (walletValidation.exists === true && walletValidation.upgradeable === false)
                          ? "border-destructive focus:border-destructive"
                          : walletValidation.valid === true && walletValidation.exists === false
                            ? "border-primary focus:border-primary"
                            : "border-border focus:border-primary"
                      }`}
                      value={regForm.walletAddress}
                      onChange={(e) => handleRegWalletChange(e.target.value)}
                      placeholder="0x..."
                      disabled={isRegistering}
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

                  {/* Automated metadata display */}
                  <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Auto-captured Metadata</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-foreground">
                      <span>RD: <span className="font-medium">{profile?.displayName ?? "—"}</span></span>
                      <span>Region: <span className="font-medium">{regionName}</span></span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Not connected"}
                      </span>
                    </div>
                  </div>

                  {/* Verification Checkbox (same as Admin Portal) */}
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors">
                    <input
                      type="checkbox"
                      checked={verifyChecked}
                      onChange={(e) => setVerifyChecked(e.target.checked)}
                      disabled={isRegistering}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      I verify that the wallet address, license ID, and identity of this professional have been confirmed 
                      through official DPWH procedures before registration.
                    </span>
                  </label>

                  {/* Register Button */}
                  <Button
                    onClick={handleRegisterProfessional}
                    disabled={isRegistering || !isRegFormValid()}
                    className="w-full gap-2"
                  >
                    {isRegistering ? (
                      <><Clock className="w-4 h-4 animate-spin" /> Signing & Registering...</>
                    ) : (
                      <><Shield className="w-4 h-4" /> Sign & Register on Blockchain</>
                    )}
                  </Button>

                  {/* View Registry Link */}
                  <button
                    onClick={() => setCurrentPage("professional-registry")}
                    className="w-full py-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 text-sm font-medium text-foreground flex items-center justify-center gap-2 transition-colors"
                  >
                    <Users className="w-4 h-4" />
                    View Professional Registry ({regionProfessionals.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      </div>

      {/* ═══ Whitelist Personnel Modal (Multi-Project) ═══ */}
      {whitelistModalProject && (
        <WhitelistPersonnelModal
          project={whitelistModalProject}
          regionName={regionName}
          rdDisplayName={profile?.displayName ?? "DPWH Regional"}
          onClose={() => setWhitelistModalProject(null)}
          onSuccess={async (projectId, updates, signResult) => {
            setWhitelistModalProject(null);
            try {
              await updateProject(projectId, updates);
              showNotification(
                signResult.onChainConfirmed
                  ? `Personnel assigned for "${updates.contractorName}" + "${updates.engineerName}" — saved on-chain + database!`
                  : `Personnel assigned for "${updates.contractorName}" + "${updates.engineerName}" — saved to database!`,
                "success"
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Unknown error";
              console.error("[DPWHRegionalDirectorDashboard] Personnel assignment failed to save:", err);
              showNotification(
                `MetaMask signed OK, but DATABASE SAVE FAILED: ${msg}. Please try "Whitelist" again.`,
                "error"
              );
            }
          }}
        />
      )}

      {/* ── Insufficient Gas Modal ── */}
      <InsufficientGasModal open={gasError.open} onClose={clearGasError} message={gasError.message} />
    </div>
  );
}
