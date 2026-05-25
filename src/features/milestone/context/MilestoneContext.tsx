import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { milestoneApi, milestonePhotoApi } from "@/features/milestone/api/milestoneApi";
import type { PhotoGpsInput } from "@/features/milestone/api/milestoneApi";
import { extractExifFromBase64 } from "@/lib/exifExtractor";
import { useWallet } from "@/context/WalletContext";
import {
  fetchSignedActionEvents,
  type OnChainSignedAction,
} from "@/services/signatureGate";

// ============================================
// MILESTONE CONTEXT
// Connects Contractor → Inspector → Auditor flow
// ============================================

export interface MilestonePhoto {
  id: string;
  name: string;
  url: string;
  gpsLat: number;
  gpsLng: number;
  gpsAccuracy?: number;
  timestamp: string;
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
  forensicFlags?: string[];
  sourceVerdict?: string;
  deviceSignature?: string;
}

export interface MilestoneExpense {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  category: "Materials" | "Labor" | "Equipment" | "Other";
}

export interface Milestone {
  id: string;
  projectId: string;
  projectName: string;
  contractorId: string;
  contractorName: string;
  region: string;
  municipality: string;
  barangay: string;
  milestoneName: string;
  description: string;
  targetProgress: number;
  requestedAmount: number;
  photos: MilestonePhoto[];
  expenses: MilestoneExpense[];
  materials: string[];
  gpsMetadata: {
    latitude: number;
    longitude: number;
    accuracy: string;
    timestamp: string;
  };
  status:
    | "DRAFT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "ENGINEER_VERIFIED"
    | "ENGINEER_REJECTED"
    | "INSPECTOR_APPROVED"
    | "INSPECTOR_REJECTED"
    | "COA_AUDITED"
    | "COA_REJECTED"
    | "MILESTONE_PAID"
    | "PUBLISHED";
  submittedDate: string;
  contractorRemarks?: string;
  // Inspector fields
  inspectorId?: string;
  inspectorName?: string;
  inspectorRemarks?: string;
  inspectorSignature?: string;
  inspectedDate?: string;
  gpsVerified?: boolean;
  gpsDistance?: number;
  photosVerified?: number;
  // COA fields
  coaAuditorId?: string;
  coaAuditorName?: string;
  coaRemarks?: string;
  coaSignature?: string;
  coaApprovedDate?: string;
  // RD Payment Authorization fields
  rdPaymentAuthorizedBy?: string;
  rdPaymentTxHash?: string;
  rdPaymentDate?: string;
  rdPaymentRemarks?: string;
  // Blockchain
  blockchainHash?: string;
  blockchainDataHash?: string;
  offchainDataHash?: string;
  integrityStatus?: string;
  isTampered?: boolean;
  tamperedAt?: string;
  integrityCheckedAt?: string;
  publishedToLedger?: boolean;
  publishedDate?: string;
}

interface MilestoneContextType {
  milestones: Milestone[];
  loading: boolean;
  addMilestone: (milestone: Milestone) => Promise<string>;
  updateMilestone: (id: string, updates: Partial<Milestone>) => void;
  updateMilestoneStatus: (
    id: string,
    status: Milestone["status"],
    remarks?: string,
    signature?: string,
    blockchainDataHash?: string
  ) => Promise<void>;
  getMilestonesByStatus: (status: Milestone["status"]) => Milestone[];
  getMilestonesByProject: (projectId: string) => Milestone[];
  getSubmittedMilestones: () => Milestone[];
  getInspectorApprovedMilestones: () => Milestone[];
  getCoaAuditedMilestones: () => Milestone[];
  getPublishedMilestones: () => Milestone[];
  refreshMilestones: () => Promise<void>;
}

const MilestoneContext = createContext<MilestoneContextType | undefined>(
  undefined
);

// ── Status normalization ──
// The DB stores legacy names; normalize to the current frontend names on read.
function normalizeStatus(raw: string): Milestone["status"] {
  if (raw === "ENGINEER_ATTESTED") return "ENGINEER_VERIFIED";
  if (raw === "COA_APPROVED")      return "COA_AUDITED";
  return raw as Milestone["status"];
}

// When writing back to the DB we store the legacy name so old rows stay consistent.
function toDbStatus(status: Milestone["status"]): string {
  if (status === "ENGINEER_VERIFIED") return "ENGINEER_ATTESTED";
  if (status === "COA_AUDITED")       return "COA_APPROVED";
  return status;
}

type StatusCacheEntry = {
  status: Milestone["status"];
  txHash?: string;
  remarks?: string;
  updatedAt: string;
  source: "local" | "chain";
};

const STATUS_CACHE_KEY = "tapatchain_milestone_status_cache_v1";

const STATUS_RANK: Record<Milestone["status"], number> = {
  DRAFT: 0,
  SUBMITTED: 1,
  UNDER_REVIEW: 1,
  ENGINEER_VERIFIED: 2,
  ENGINEER_REJECTED: 2,
  INSPECTOR_APPROVED: 2,
  INSPECTOR_REJECTED: 2,
  COA_AUDITED: 3,
  COA_REJECTED: 3,
  MILESTONE_PAID: 4,
  PUBLISHED: 5,
};

function loadStatusCache(): Record<string, StatusCacheEntry> {
  try {
    const raw = localStorage.getItem(STATUS_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, StatusCacheEntry>;
  } catch {
    return {};
  }
}

function saveStatusCache(cache: Record<string, StatusCacheEntry>) {
  try {
    localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota/parsing errors for non-critical cache
  }
}

function writeStatusCacheEntry(id: string, entry: StatusCacheEntry) {
  const cache = loadStatusCache();
  const existing = cache[id];
  if (!existing || STATUS_RANK[entry.status] >= STATUS_RANK[existing.status]) {
    cache[id] = entry;
    saveStatusCache(cache);
  }
}

function statusFromOnChainAction(actionType: string): Milestone["status"] | null {
  switch (actionType) {
    case "ACCOMPLISHMENT_REPORT":
      return "SUBMITTED";
    case "ENGINEER_ATTESTATION":
      // Gate event does not include verdict; treat as at least engineer-reviewed.
      return "ENGINEER_VERIFIED";
    case "AUDIT_ATTESTATION":
      // Gate SignedAction event does not include verdict; treat as at least COA-reviewed.
      return "COA_AUDITED";
    case "MILESTONE_PAYMENT_AUTHORIZED":
      return "MILESTONE_PAID";
    default:
      return null;
  }
}

function buildOnChainStatusMap(actions: OnChainSignedAction[]): Record<string, StatusCacheEntry> {
  const byMilestone: Record<string, StatusCacheEntry> = {};

  const sorted = [...actions].sort((a, b) => a.timestamp - b.timestamp);
  for (const ev of sorted) {
    const mapped = statusFromOnChainAction(ev.actionType);
    if (!mapped) continue;

    const milestoneId = ev.referenceId;
    const existing = byMilestone[milestoneId];
    if (!existing || STATUS_RANK[mapped] > STATUS_RANK[existing.status]) {
      byMilestone[milestoneId] = {
        status: mapped,
        txHash: ev.txHash,
        updatedAt: new Date(ev.timestamp * 1000).toISOString(),
        source: "chain",
      };
    }
  }

  return byMilestone;
}

function resolveStatus(
  apiStatus: Milestone["status"],
  cached?: StatusCacheEntry,
  onChain?: StatusCacheEntry
): Milestone["status"] {
  let resolved = apiStatus;
  if (cached && STATUS_RANK[cached.status] > STATUS_RANK[resolved]) {
    resolved = cached.status;
  }
  if (onChain && STATUS_RANK[onChain.status] > STATUS_RANK[resolved]) {
    resolved = onChain.status;
  }
  return resolved;
}

function applyLocalAndOnChainStatus(
  base: Milestone,
  cached?: StatusCacheEntry,
  onChain?: StatusCacheEntry
): Milestone {
  const resolved = resolveStatus(base.status, cached, onChain);
  const remarks = cached?.remarks;
  const hash = base.blockchainHash ?? cached?.txHash ?? onChain?.txHash;
  const updatedAt = cached?.updatedAt ?? onChain?.updatedAt;

  const patch: Partial<Milestone> = {
    status: resolved,
    blockchainHash: hash,
  };

  // Preserve read-only visibility of signed/audited data if API lags.
  if ((resolved === "ENGINEER_VERIFIED" || resolved === "ENGINEER_REJECTED") && remarks) {
    patch.inspectorRemarks = base.inspectorRemarks ?? remarks;
    patch.inspectedDate = base.inspectedDate ?? updatedAt;
  }
  if ((resolved === "COA_AUDITED" || resolved === "COA_REJECTED") && remarks) {
    patch.coaRemarks = base.coaRemarks ?? remarks;
    patch.coaApprovedDate = base.coaApprovedDate
      ?? (updatedAt ? new Date(updatedAt).toLocaleDateString("en-PH") : undefined);
  }
  if (resolved === "MILESTONE_PAID") {
    patch.rdPaymentTxHash = base.rdPaymentTxHash ?? hash;
    patch.rdPaymentDate = base.rdPaymentDate ?? updatedAt;
  }

  return { ...base, ...patch };
}

export function MilestoneProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const { walletAddress } = useWallet();

  const addMilestone = async (milestone: Milestone & { _files?: File[] }): Promise<string> => {
    // Persist to API first — this is the source of truth
    const response = await milestoneApi.create({
      projectId: milestone.projectId,
      phase: milestone.milestoneName,
      milestoneName: milestone.milestoneName,
      description: milestone.description,
      requestedAmount: milestone.requestedAmount,
      targetProgress: milestone.targetProgress,
      photosCount: milestone.photos?.length ?? 0,
      gpsVerified: milestone.gpsVerified ?? (milestone.gpsMetadata?.latitude !== 0),
      gpsLatitude: milestone.gpsMetadata?.latitude,
      gpsLongitude: milestone.gpsMetadata?.longitude,
      gpsAccuracy: milestone.gpsMetadata?.accuracy,
      contractorWallet: milestone.contractorId,
      blockchainTxHash: milestone.blockchainHash,
      blockchainDataHash: milestone.blockchainDataHash,
      materialsHash: (milestone as unknown as Record<string, unknown>).materialsHash as string | undefined,
      contractorRemarks: milestone.contractorRemarks,
    });

    // Use the backend-generated ID
    const serverId = response.data?.id ?? milestone.id;

    // Upload photos to backend if files are attached
    if (milestone._files && milestone._files.length > 0) {
      try {
        const gpsInputs: PhotoGpsInput[] = milestone.photos.map((p) => ({
          gpsLatitude: p.gpsLat,
          gpsLongitude: p.gpsLng,
          gpsAccuracy: p.gpsAccuracy,
          gpsTimestamp: p.timestamp,
          distanceFromSite: undefined,
          // Forensic metadata
          gpsAltitude: p.gpsAltitude,
          gpsDirection: p.gpsDirection,
          deviceMake: p.deviceMake,
          deviceModel: p.deviceModel,
          deviceSignature: p.deviceSignature,
          software: p.software,
          sourceType: p.sourceType,
          sourceVerdict: p.sourceVerdict,
          isTampered: p.isTampered ?? false,
          tamperReason: p.tamperReason,
          dateTimeOriginal: p.dateTimeOriginal,
          forensicFlags: p.forensicFlags ? JSON.stringify(p.forensicFlags) : undefined,
        }));
        console.log("[MilestoneContext] UPLOAD gpsInputs forensic →", gpsInputs.map(g => ({
          alt: g.gpsAltitude, dir: g.gpsDirection, make: g.deviceMake, model: g.deviceModel,
          src: g.sourceType, verdict: g.sourceVerdict,
        })));
        await milestonePhotoApi.upload(serverId, milestone._files, gpsInputs);
      } catch (err) {
        console.warn("Photo upload failed (milestone was still saved):", err);
      }
    }

    const savedMilestone = { ...milestone, id: serverId };
    setMilestones((prev) => [...prev, savedMilestone]);
    return serverId;
  };

  const updateMilestone = (id: string, updates: Partial<Milestone>) => {
    setMilestones((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  const updateMilestoneStatus = useCallback(
    async (
      id: string,
      status: Milestone["status"],
      remarks?: string,
      signature?: string,
      blockchainDataHash?: string
    ) => {
      const nowIso = new Date().toISOString();
      // Update locally first
      setMilestones((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;

          const patch: Partial<Milestone> = {
            status,
            blockchainHash: signature ?? m.blockchainHash,
          };

          if (status === "ENGINEER_VERIFIED" || status === "ENGINEER_REJECTED") {
            patch.inspectedDate = nowIso;
            if (remarks) patch.inspectorRemarks = remarks;
          }

          if (status === "COA_AUDITED" || status === "COA_REJECTED") {
            patch.coaApprovedDate = new Date(nowIso).toLocaleDateString("en-PH");
            if (remarks) patch.coaRemarks = remarks;
          }

          if (status === "MILESTONE_PAID") {
            patch.rdPaymentDate = nowIso;
            patch.rdPaymentTxHash = signature ?? m.rdPaymentTxHash;
          }

          return { ...m, ...patch };
        })
      );

      // Off-chain redundancy cache: keep signed/completed status across refresh/disconnect.
      writeStatusCacheEntry(id, {
        status,
        txHash: signature,
        remarks,
        updatedAt: nowIso,
        source: "local",
      });

      // Persist to API — send DB-compatible status name
      try {
        await milestoneApi.updateStatus(id, {
          status: toDbStatus(status),
          inspectorRemarks: remarks,
          blockchainTxHash: signature,
          blockchainDataHash,
        });
      } catch (err) {
        console.warn("Failed to update milestone status on API:", err);
      }
    },
    []
  );

  const refreshMilestones = useCallback(async () => {
    setLoading(true);
    try {
      const [response, onChainActions] = await Promise.all([
        milestoneApi.getAll(),
        fetchSignedActionEvents(0),
      ]);

      const cachedStatuses = loadStatusCache();
      const onChainStatusMap = buildOnChainStatusMap(onChainActions);

      const apiMilestones: Milestone[] = await Promise.all(
        (response.data ?? []).map(
          async (m: Record<string, unknown>) => {
            const milestoneId = String(m.id ?? "");
            const apiStatusRaw = (m.status as string) ?? "DRAFT";
            const apiStatus = normalizeStatus(apiStatusRaw);
            const cached = cachedStatuses[milestoneId];
            const onChain = onChainStatusMap[milestoneId];

            // Map photos from API response and re-extract EXIF from stored image bytes
            const apiPhotos = (m.photos as Array<Record<string, unknown>>) ?? [];
            const mappedPhotos: MilestonePhoto[] = await Promise.all(
              apiPhotos.map(async (p) => {
                // ── Diagnostic: log what the backend sent for forensic fields ──
                console.log(`[MilestoneContext] API photo ${p.id} forensic →`, {
                  gpsAltitude: p.gpsAltitude, gpsDirection: p.gpsDirection,
                  deviceMake: p.deviceMake, deviceModel: p.deviceModel,
                  sourceType: p.sourceType, sourceVerdict: p.sourceVerdict,
                  forensicFlags: p.forensicFlags,
                });
                const base: MilestonePhoto = {
                  id: String(p.id ?? ""),
                  name: (p.fileName as string) ?? "",
                  url: p.base64Data
                    ? `data:${p.contentType ?? "image/jpeg"};base64,${p.base64Data}`
                    : "",
                  gpsLat: (p.gpsLatitude as number) ?? 0,
                  gpsLng: (p.gpsLongitude as number) ?? 0,
                  gpsAccuracy: (p.gpsAccuracy as number) ?? undefined,
                  timestamp: (p.gpsTimestamp as string) ?? "",
                };

                // Re-extract EXIF forensic metadata from raw image bytes
                if (p.base64Data) {
                  try {
                    const exif = await extractExifFromBase64(
                      p.base64Data as string,
                      (p.contentType as string) ?? "image/jpeg"
                    );

                    // If EXIF is empty but DB has GPS → in-app GPS camera capture
                    const hasDbGps = typeof p.gpsLatitude === "number"
                      && (p.gpsLatitude as number) !== 0;
                    const exifIsEmpty = !exif.deviceMake && !exif.software
                      && exif.gpsLatitude === null;

                    if (exifIsEmpty && hasDbGps) {
                      // Parse DB forensic flags (stored as JSON string)
                      let dbFlags: string[] = ["Captured via in-app GPS Camera — browser geolocation verified, no embedded EXIF"];
                      if (p.forensicFlags) {
                        try {
                          dbFlags = typeof p.forensicFlags === "string"
                            ? JSON.parse(p.forensicFlags as string)
                            : (p.forensicFlags as string[]);
                        } catch { /* keep default */ }
                      }
                      return {
                        ...base,
                        gpsAltitude: (p.gpsAltitude as number) ?? undefined,
                        gpsDirection: (p.gpsDirection as number) ?? undefined,
                        deviceMake: (p.deviceMake as string) ?? undefined,
                        deviceModel: (p.deviceModel as string) ?? undefined,
                        software: (p.software as string) ?? undefined,
                        dateTimeOriginal: (p.dateTimeOriginal as string) ?? (base.timestamp || new Date().toISOString()),
                        sourceType: "real-time" as const,
                        forensicFlags: dbFlags,
                        sourceVerdict: (p.sourceVerdict as string) ?? "GPS-Verified App Capture",
                        deviceSignature: (p.deviceSignature as string) ?? undefined,
                      };
                    }

                    return {
                      ...base,
                      gpsAltitude: exif.gpsAltitude ?? undefined,
                      gpsDirection: exif.gpsDirection ?? undefined,
                      deviceMake: exif.deviceMake ?? undefined,
                      deviceModel: exif.deviceModel ?? undefined,
                      software: exif.software ?? undefined,
                      isTampered: exif.isTampered,
                      tamperReason: exif.tamperReason ?? undefined,
                      sourceType: exif.sourceType,
                      dateTimeOriginal: exif.dateTimeOriginal ?? undefined,
                      forensicFlags: exif.forensicFlags,
                      sourceVerdict: exif.sourceVerdict,
                      deviceSignature: exif.deviceSignature ?? undefined,
                    };
                  } catch (exifErr) {
                    console.warn("[MilestoneContext] EXIF re-extraction failed:", exifErr);
                    // Fall back to DB-stored forensic fields
                    return {
                      ...base,
                      gpsAltitude: (p.gpsAltitude as number) ?? undefined,
                      gpsDirection: (p.gpsDirection as number) ?? undefined,
                      deviceMake: (p.deviceMake as string) ?? undefined,
                      deviceModel: (p.deviceModel as string) ?? undefined,
                      software: (p.software as string) ?? undefined,
                      isTampered: (p.isTampered as boolean) ?? false,
                      tamperReason: (p.tamperReason as string) ?? undefined,
                      sourceType: ((p.sourceType as string) ?? "unknown") as "real-time" | "edited" | "unknown",
                      dateTimeOriginal: (p.dateTimeOriginal as string) ?? undefined,
                      forensicFlags: p.forensicFlags
                        ? (typeof p.forensicFlags === "string" ? JSON.parse(p.forensicFlags as string) : p.forensicFlags as string[])
                        : undefined,
                      sourceVerdict: (p.sourceVerdict as string) ?? undefined,
                      deviceSignature: (p.deviceSignature as string) ?? undefined,
                    };
                  }
                }
                // No base64Data available — use DB-stored forensic fields directly
                return {
                  ...base,
                  gpsAltitude: (p.gpsAltitude as number) ?? undefined,
                  gpsDirection: (p.gpsDirection as number) ?? undefined,
                  deviceMake: (p.deviceMake as string) ?? undefined,
                  deviceModel: (p.deviceModel as string) ?? undefined,
                  software: (p.software as string) ?? undefined,
                  isTampered: (p.isTampered as boolean) ?? false,
                  tamperReason: (p.tamperReason as string) ?? undefined,
                  sourceType: ((p.sourceType as string) ?? "unknown") as "real-time" | "edited" | "unknown",
                  dateTimeOriginal: (p.dateTimeOriginal as string) ?? undefined,
                  forensicFlags: p.forensicFlags
                    ? (typeof p.forensicFlags === "string" ? JSON.parse(p.forensicFlags as string) : p.forensicFlags as string[])
                    : undefined,
                  sourceVerdict: (p.sourceVerdict as string) ?? undefined,
                  deviceSignature: (p.deviceSignature as string) ?? undefined,
                };
              })
            );

          const mapped: Milestone = {
            id: m.id as string,
            projectId: m.projectId as string,
            projectName: (m.projectName as string) ?? "",
            contractorId: (m.contractorWallet as string) ?? "",
            contractorName: "",
            region: "",
            municipality: "",
            barangay: "",
            milestoneName: m.milestoneName as string,
            description: (m.description as string) ?? "",
            targetProgress: (m.targetProgress as number) ?? 0,
            requestedAmount: (m.requestedAmount as number) ?? 0,
            photos: mappedPhotos,
            expenses: [],
            materials: [],
            gpsMetadata: {
              latitude: (m.gpsLatitude as number) ?? 0,
              longitude: (m.gpsLongitude as number) ?? 0,
              accuracy: (m.gpsAccuracy as string) ?? "N/A",
              timestamp: (m.submittedDate as string) ?? "",
            },
            gpsVerified: (m.gpsVerified as boolean) ?? false,
            status: apiStatus,
            submittedDate: (m.submittedDate as string) ?? "",
            blockchainHash: (m.blockchainTxHash as string)
              ?? cached?.txHash
              ?? onChain?.txHash
              ?? undefined,
            blockchainDataHash: (m.blockchainDataHash as string) ?? undefined,
            offchainDataHash: (m.offchainDataHash as string) ?? undefined,
            integrityStatus: (m.integrityStatus as string) ?? undefined,
            isTampered: (m.isTampered as boolean) ?? false,
            tamperedAt: (m.tamperedAt as string) ?? undefined,
            integrityCheckedAt: (m.integrityCheckedAt as string) ?? undefined,
            contractorRemarks: (m.contractorRemarks as string) ?? undefined,
            // Inspector / Engineer remarks (stored as InspectorRemarks in DB regardless of role)
            inspectorRemarks: (m.inspectorRemarks as string) ?? undefined,
            // COA remarks: when milestone is at COA_AUDITED or beyond, InspectorRemarks holds COA remarks
            coaRemarks: (() => {
              const raw = apiStatusRaw;
              const isPostCoa = raw === "COA_APPROVED" || raw === "COA_AUDITED"
                || raw === "MILESTONE_PAID" || raw === "PUBLISHED";
              return isPostCoa ? ((m.inspectorRemarks as string) ?? undefined) : undefined;
            })(),
            coaApprovedDate: (m.approvedDate as string)
              ? new Date(m.approvedDate as string).toLocaleDateString("en-PH")
              : undefined,
          };

          const reconciled = applyLocalAndOnChainStatus(mapped, cached, onChain);

          // Persist reconciled "signed and beyond" statuses for read-only resilience.
          if (STATUS_RANK[reconciled.status] >= STATUS_RANK["ENGINEER_VERIFIED"]) {
            writeStatusCacheEntry(reconciled.id, {
              status: reconciled.status,
              txHash: reconciled.blockchainHash,
              remarks: reconciled.coaRemarks ?? reconciled.inspectorRemarks,
              updatedAt: new Date().toISOString(),
              source: onChain ? "chain" : "local",
            });
          }

          return reconciled;
        })
      );

      setMilestones(apiMilestones);
    } catch (err) {
      console.warn("API unavailable:", err);

      // Fallback hydration: keep current items but reconcile status from local cache + chain.
      try {
        const [onChainActions] = await Promise.all([fetchSignedActionEvents(0)]);
        const cachedStatuses = loadStatusCache();
        const onChainStatusMap = buildOnChainStatusMap(onChainActions);

        setMilestones((prev) =>
          prev.map((m) =>
            applyLocalAndOnChainStatus(m, cachedStatuses[m.id], onChainStatusMap[m.id])
          )
        );
      } catch {
        // Keep previous in-memory state if reconciliation fails.
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Hydrate on mount + wallet/account changes to prevent stale UI after reconnect.
  useEffect(() => {
    refreshMilestones();
  }, [refreshMilestones, walletAddress]);

  const getMilestonesByStatus = (status: Milestone["status"]) => {
    return milestones.filter((m) => m.status === status);
  };

  const getMilestonesByProject = (projectId: string) => {
    return milestones.filter((m) => m.projectId === projectId);
  };

  const getSubmittedMilestones = () => {
    return milestones.filter((m) => m.status === "SUBMITTED");
  };

  const getInspectorApprovedMilestones = () => {
    return milestones.filter((m) => m.status === "INSPECTOR_APPROVED");
  };

  const getCoaAuditedMilestones = () => {
    return milestones.filter((m) => m.status === "COA_AUDITED");
  };

  const getPublishedMilestones = () => {
    return milestones.filter((m) => m.status === "PUBLISHED");
  };

  return (
    <MilestoneContext.Provider
      value={{
        milestones,
        loading,
        addMilestone,
        updateMilestone,
        updateMilestoneStatus,
        getMilestonesByStatus,
        getMilestonesByProject,
        getSubmittedMilestones,
        getInspectorApprovedMilestones,
        getCoaAuditedMilestones,
        getPublishedMilestones,
        refreshMilestones,
      }}
    >
      {children}
    </MilestoneContext.Provider>
  );
}

export function useMilestoneContext() {
  const context = useContext(MilestoneContext);
  if (!context) {
    throw new Error(
      "useMilestoneContext must be used within a MilestoneProvider"
    );
  }
  return context;
}
