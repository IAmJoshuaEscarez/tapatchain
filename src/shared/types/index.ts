// ============================================
// SHARED DOMAIN TYPES
// Single source of truth — no duplication
// ============================================

// ── User / Auth ──

export interface UserProfile { isActive?: boolean; txHash?: string; registeredBy?: string;
  id: string;
  email?: string;
  walletAddress?: string;
  displayName?: string;
  assignedRole?: string;
  assignedRegion?: string;
  regionCode: number;
  profilePhoto?: string;
  isWhitelisted: boolean;
  whitelistTransactionHash?: string;
  noaReference?: string;
  prcLicenseNumber?: string;
  documentHash?: string;
  registryStatus: string;
  identityHash?: string;
  endorsedByUserId?: string;
  registeredByWallet?: string;  // Wallet of the authority who registered this user
  roles: string[];
  createdAt: string;
  lastLoginAt: string;
}

// ── Project ──

export interface Project {
  id: string;
  name: string;
  location: string;
  province: string;
  municipality: string;
  barangay: string;
  type: string;
  progress: number;
  currentPhase: string;
  budget: number;
  /** Original budget requested by RDC during proposal stage. */
  rdcProposedBudget?: number;
  /** Final amount funded/approved by DPWH National. */
  nationalFundedBudget?: number;
  spent: number;
  contractor: string;
  status: string;
  /** Existing transaction hash field kept for compatibility with current flows. */
  blockchainHash: string;
  /** Canonical on-chain data hash anchor used for integrity comparison. */
  blockchainDataHash?: string;
  /** Latest on-chain transaction hash related to this record. */
  blockchainTxHash?: string;
  offchainHash: string;
  offchainDataHash?: string;
  lastVerified: string;
  verificationStatus: string;
  integrityStatus?: string;
  isTampered?: boolean;
  tamperedAt?: string;
  integrityCheckedAt?: string;
  startDate: string;
  expectedCompletion: string;
  contractorLicense: string;
  dpwhRegion: string;
  lguApproval: string;
  siteEngineer?: string;
  siteEngineerLicense?: string;
  coaAuditor?: string;
  coaAssignmentNo?: string;
  region?: string;
  // Geographic IDs for on-chain mapping(uint256 => ProjectDetails)
  regionId?: number;
  provinceId?: number;
  municipalityId?: number;
  numericProjectId?: number;
  // Personnel wallets
  contractorWallet?: string;
  engineerWallet?: string;
  personnelAssigned?: boolean;
  personnelTxHash?: string;
  // RDC Approval Fields
  isRdcApproved?: boolean;
  rdcStatus?: "PENDING_RDC" | "RDC_ENDORSED" | "RDC_REJECTED";
  rdcEndorsedBy?: string;
  rdcEndorsedDate?: string;
  rdcSignature?: string;
  rdcRemarks?: string;
  // Proposer & Accountability — visible on Public Ledger
  proposedBy?: string;
  proposerRegion?: string;
  proposerWallet?: string;
  endorsedBy?: string;
  approvedBy?: string;
  saaReference?: string;
  rdcSignatureHash?: string;
  nationalFundingHash?: string;
  /** Raw enum from RDCProject for ledger matching */
  rawStatus?: string;
  /** Infrastructure type from seeded dropdown (Roads, Bridges, etc.) */
  infrastructureType?: string;
  /** GAA Reference Number assigned during National funding */
  gaaReference?: string;
  // ── Target-based Progress & Geolocation ──
  targetPercent?: number;
  currentProgress?: number;
  siteLatitude?: number;
  siteLongitude?: number;
  isLocationAnchored?: boolean;
  trackingSlug?: string;
  isPublic?: boolean;
  isQrActive?: boolean;
  qrCodeUrl?: string;
}

// ── Milestone ──

export interface PendingMilestone {
  id: string;
  projectId: string;
  projectName: string;
  contractor: string;
  region: string;
  municipality: string;
  barangay: string;
  phase: string;
  requestedAmount: number;
  submittedDate: string;
  description: string;
  photosCount: number;
  gpsVerified: boolean;
  location: { lat: number; lng: number };
  materials: string[];
  status: string;
  metamaskConnected: boolean;
  targetCompletion: string;
  targetProgress: number;
  /** Baseline target from the project — set once by contractor */
  baselineTarget: number;
  actualPhotos: number;
  inspectorRemarks: string;
  gpsMetadata: {
    latitude: number;
    longitude: number;
    accuracy: string;
    timestamp: string;
  };
  milestoneName: string;
  actualSubmission: string;
  // Blockchain hash for on-chain verification
  blockchainTxHash?: string;
  materialsHash?: string;
  contractorRemarks?: string;
  // Real photos from backend
  photos?: {
    id: number;
    fileName: string;
    contentType: string;
    fileSize: number;
    gpsLatitude?: number;
    gpsLongitude?: number;
    gpsAccuracy?: number;
    gpsTimestamp?: string;
    distanceFromSite?: number;
    base64Data?: string;
    // ── EXIF Forensic Layer ──
    gpsAltitude?: number;
    gpsDirection?: number;
    deviceMake?: string;
    deviceModel?: string;
    software?: string;
    isTampered?: boolean;
    tamperReason?: string;
    sourceType?: "real-time" | "edited" | "unknown";
    dateTimeOriginal?: string;
    exifRaw?: Record<string, unknown>;
    forensicFlags?: string[];
    sourceVerdict?: string;
    deviceSignature?: string;
  }[];
}

// ── Transaction ──

export interface Transaction {
  hash: string;
  projectId: string;
  projectName: string;
  contractor: string;
  amount: number;
  type: string;
  date: string;
  status: string;
  smartContractTriggered: boolean;
  rdcApproval?: {
    approved: boolean;
    endorsedBy?: string;
    signature?: string;
    timestamp?: string;
  };
}

// ── Contractor ──

export interface Contractor {
  id: string;
  companyName: string;
  prcLicense: string;
  secRegistration: string;
  contactPerson: string;
  email: string;
  phone: string;
  kycStatus: string;
  integrityScore: number;
  completedProjects: number;
  totalValue: number;
}

// ── Reports ──

export interface PublicReport {
  id: string;
  projectId: string;
  projectName: string;
  reportType: string;
  description: string;
  location: { lat: number; lng: number };
  photosCount: number;
  photo?: string;
  reportedBy: string;
  reportedDate: string;
  status: string;
}

export interface InspectionHistory {
  id: string;
  milestoneId: string;
  projectName: string;
  inspectedBy: string;
  inspectionDate: string;
  result: string;
  remarks: string;
  digitalSeal: string;
  photosVerified: number;
}

// ── Community ──

export interface CommunityFeedback {
  id: string;
  projectId: string;
  projectName: string;
  location: string;
  photo: string;
  caption: string;
  timestamp: string;
  likes: number;
  verified: boolean;
}

// ── Misc ──

export interface Expense {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  category: string;
}

export interface UploadedPhoto {
  id: string;
  name: string;
  url: string;
  file: File;
  // GPS metadata captured at upload time
  gpsLat?: number;
  gpsLng?: number;
  gpsAccuracy?: number;
  gpsTimestamp?: string;
  distanceFromSite?: number; // meters from project anchor

  // ── EXIF Forensic Layer ──
  gpsAltitude?: number;
  gpsDirection?: number; // bearing / image direction
  deviceMake?: string;
  deviceModel?: string;
  software?: string;
  isTampered?: boolean;
  tamperReason?: string;
  sourceType?: "real-time" | "edited" | "unknown";
  dateTimeOriginal?: string;
  exifRaw?: Record<string, unknown>;
  forensicFlags?: string[];
  sourceVerdict?: string;
  deviceSignature?: string;
}

export interface DashboardConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  textColor: string;
}

export interface RegionData {
  region: string;
  name: string;
  projects: number;
  budget: number;
  completion: number;
}

export interface RegionRanking {
  region: string;
  integrityScore: number;
  projectsCompleted: number;
  onTime: number;
}

// ── Endorsement ──

export interface EndorsementRequest {
  candidateFullName: string;
  candidateWalletAddress: string;
  candidateRole: string;
  candidateEmail?: string;
  noaReference?: string;
  prcLicenseNumber?: string;
  documentHash?: string;
}

export interface EndorsementReview {
  status: "APPROVED" | "REJECTED";
  remarks?: string;
}

export interface EndorsementWhitelist {
  transactionHash: string;
}

export interface EndorsementResponse {
  id: string;
  candidateFullName: string;
  candidateWalletAddress: string;
  candidateRole: string;
  candidateEmail?: string;
  noaReference?: string;
  prcLicenseNumber?: string;
  documentHash?: string;
  regionCode: number;
  regionName: string;
  endorsedByUserId: string;
  endorsedByName: string;
  endorsedByWallet?: string;
  endorsedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WHITELISTED";
  reviewedByName?: string;
  reviewedAt?: string;
  reviewRemarks?: string;
  whitelistTransactionHash?: string;
  createdUserId?: string;
}

// ── Constants ──

/** Philippine Region Codes — all 18 regions */
export const REGION_MAP: Record<number, string> = {
  0: "National",
  1: "Region I - Ilocos",
  2: "Region II - Cagayan Valley",
  3: "Region III - Central Luzon",
  4: "Region IV-A - CALABARZON",
  5: "Region V - Bicol",
  6: "Region VI - Western Visayas",
  7: "Region VII - Central Visayas",
  8: "Region VIII - Eastern Visayas",
  9: "Region IX - Zamboanga Peninsula",
  10: "Region X - Northern Mindanao",
  11: "Region XI - Davao",
  12: "Region XII - SOCCSKSARGEN",
  13: "Region XIII - Caraga",
  14: "BARMM",
  15: "CAR - Cordillera",
  16: "NCR - National Capital Region",
  17: "NIR - Negros Island Region",
  18: "Region IV-B - MIMAROPA",
};

/**
 * Seeded infrastructure types — must match backend InfrastructureType seed.
 * Dropdown enforcement: RDC proposals MUST pick from this list.
 */
export const INFRA_TYPES = [
  "Roads",
  "Bridges",
  "School Buildings",
  "Health Centers",
  "Irrigation",
  "Flood Control",
  "Water Systems",
] as const;

/**
 * Sequential State Machine — strict ordering of project lifecycle.
 * Each stage has allowed transitions and the role that can trigger them.
 */
export const SEQUENTIAL_STAGES = {
  // ── New 3-Stage Sequential Flow ──
  PROPOSED:              { order: 1, label: "Proposed (RDC)",          next: "FUNDED",               actor: "rdc" },
  FUNDED:                { order: 2, label: "Funded (National)",       next: "ONGOING",              actor: "admin" },
  ONGOING:               { order: 3, label: "Ongoing (RD)",           next: null,                   actor: "rd" },
  REJECTED:              { order: -1, label: "Rejected",               next: null,                   actor: "admin" },
  // ── Legacy stages (backward compat) ──
  PROPOSAL_DRAFT:        { order: 0, label: "Draft",                    next: "PROPOSED",             actor: "rdc" },
  PROPOSAL_SUBMITTED:    { order: 1, label: "Proposal Submitted",      next: "FUNDED",               actor: "rdc" },
  PROPOSAL_APPROVED:     { order: 2, label: "Proposal Approved",       next: "DRAFT",                actor: "admin" },
  PROPOSAL_REJECTED:     { order: -1, label: "Proposal Rejected",      next: null,                   actor: "admin" },
  DRAFT:                 { order: 3, label: "Project Created",         next: "SUBMITTED_TO_NATIONAL",actor: "rdc" },
  SUBMITTED_TO_NATIONAL: { order: 4, label: "Endorsed by RDC",        next: "FUNDED_AND_ACTIVE",    actor: "rdc" },
  FUNDED_AND_ACTIVE:     { order: 5, label: "Funded (National)",       next: "PERSONNEL_ASSIGNED",   actor: "admin" },
  PERSONNEL_ASSIGNED:    { order: 6, label: "Personnel Assigned (RD)", next: null,                   actor: "rd" },
} as const;
