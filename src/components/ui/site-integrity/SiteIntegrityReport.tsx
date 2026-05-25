// ════════════════════════════════════════════════════════════════════════════
// SiteIntegrityReport — Full-width Photo + Metadata Verify
// Engineer must click "Verify Metadata" for each photo before signing
// ════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { Button } from "@/components/ui";
import {
  CheckCircle,
  AlertTriangle,
  MapPin,
  Camera,
  Eye,
  ArrowLeft,
  ArrowRight,
  Shield,
  Compass,
  Smartphone,
  Mountain,
  Calendar,
  X,
  AlertCircle,
  Download,
} from "lucide-react";
import { calculateDistance } from "@/lib/utils";
import { GEOFENCE_RADIUS_M } from "@/lib/geolocation";
import { getBearingString, getDeviceString, checkCrossPhotoConsistency, type ExifMetadata } from "@/lib/exifExtractor";

export interface IntegrityPhoto {
  id: string | number;
  fileName: string;
  photoUrl: string;
  gpsLat: number;
  gpsLng: number;
  exif: ExifMetadata | null;
}

interface SiteIntegrityReportProps {
  /** Master GPS — project site anchor from first upload */
  masterGps: { lat: number; lng: number };
  /** All photos for the milestone */
  photos: IntegrityPhoto[];
  /** Callback: all photos verified. Returns map of verified photo IDs */
  onAllVerified: (verifiedIds: Set<string | number>) => void;
  /** Whether the engineer can proceed to sign (all verified) */
  allVerified: boolean;
}

export function SiteIntegrityReport({
  masterGps,
  photos,
  onAllVerified,
  allVerified,
}: SiteIntegrityReportProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [verifiedPhotos, setVerifiedPhotos] = useState<Set<string | number>>(new Set());
  const [showFullImage, setShowFullImage] = useState(false);

  const currentPhoto = photos[currentIndex] ?? null;

  // Compute distances for all photos
  const photoDistances = useMemo(() => {
    return photos.map((p) => ({
      id: p.id,
      distance: calculateDistance(masterGps.lat, masterGps.lng, p.gpsLat, p.gpsLng),
    }));
  }, [photos, masterGps]);

  // Cross-photo GPS consistency — compare each photo to the first photo
  const crossPhotoResults = useMemo(() => {
    return checkCrossPhotoConsistency(
      photos.map((p) => ({ id: p.id, lat: p.gpsLat, lng: p.gpsLng })),
      100
    );
  }, [photos]);

  const currentDistance = photoDistances.find((d) => d.id === currentPhoto?.id)?.distance ?? 0;
  const isOutside = currentDistance > GEOFENCE_RADIUS_M;
  const isVerified = currentPhoto ? verifiedPhotos.has(currentPhoto.id) : false;

  const handleVerify = () => {
    if (!currentPhoto) return;
    const next = new Set(verifiedPhotos);
    next.add(currentPhoto.id);
    setVerifiedPhotos(next);
    // Check if all verified
    if (next.size === photos.length) {
      onAllVerified(next);
    }
  };

  const handleUnverify = () => {
    if (!currentPhoto) return;
    const next = new Set(verifiedPhotos);
    next.delete(currentPhoto.id);
    setVerifiedPhotos(next);
  };

  const goPrev = () => setCurrentIndex((i) => Math.max(0, i - 1));
  const goNext = () => setCurrentIndex((i) => Math.min(photos.length - 1, i + 1));

  if (photos.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        No photos to review.
      </div>
    );
  }

  const meta = currentPhoto?.exif;

  // ── Internet-download / not-onsite detection ──
  // Any photo not confirmed as real-time from the GPS camera is flagged.
  const notOnsiteAlert: { title: string; detail: string } | null = (() => {
    if (!meta) return null;
    const verdict = meta.sourceVerdict ?? "";
    const flags = meta.forensicFlags ?? [];
    const hasNoExifFlag = flags.some((f) => f.toLowerCase().includes("no exif data found"));

    if (verdict.includes("Social Media") || meta.isSocialMedia) {
      return {
        title: "⚠ This photo is NOT an on-site capture",
        detail:
          "Social media origin detected in metadata. This photo was likely downloaded from a social platform (Facebook, Instagram, WhatsApp, etc.) and was not captured at the project site.",
      };
    }
    if (verdict.includes("Screenshot") || meta.isScreenshot) {
      return {
        title: "⚠ This photo is NOT an on-site capture",
        detail:
          "Screenshot software signature detected. This image is a screen capture, not a real camera photo taken on-site.",
      };
    }
    if (verdict.includes("Non-Original") || (meta.sourceType === "edited" && meta.isTampered)) {
      return {
        title: "⚠ This photo is NOT an on-site capture",
        detail:
          meta.tamperReason
            ? `Photo tampering detected — ${meta.tamperReason}. This image was likely edited or sourced externally, not captured in real-time at the project site.`
            : "Photo metadata indicates it was not captured in real-time at the project site. It may have been downloaded or edited externally.",
      };
    }
    if (hasNoExifFlag || (!meta.deviceMake && !meta.deviceModel && meta.sourceType !== "real-time")) {
      return {
        title: "⚠ This photo may NOT be an on-site capture",
        detail:
          "No camera EXIF metadata was found. Photos downloaded from the internet or picked from a gallery typically have their metadata stripped. This photo cannot be confirmed as an on-site capture.",
      };
    }
    // Catch-all: any unconfirmed non-real-time source
    if (meta.sourceType !== "real-time") {
      return {
        title: "⚠ This photo cannot be confirmed as on-site",
        detail:
          `Source integrity is unverified (${verdict || "Unknown source"}). Only photos taken directly with the in-app GPS camera are accepted as on-site captures. This photo may have been uploaded from a device gallery or sourced externally.`,
      };
    }
    return null;
  })();

  return (
    <div className="space-y-5">
      {/* ── Progress Header ── */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Reviewing <span className="font-semibold text-foreground">Photo {currentIndex + 1}</span> of {photos.length}
          <span className="mx-2 text-border">|</span>
          <span className="text-primary font-semibold">{verifiedPhotos.size}/{photos.length}</span> verified
        </div>
        {allVerified && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[10px] font-semibold">
            <CheckCircle className="w-3 h-3" /> All Metadata Verified
          </span>
        )}
      </div>

      {/* ── Progress Dots ── */}
      <div className="flex gap-1.5">
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setCurrentIndex(i)}
            className={`h-2 flex-1 rounded-full transition-all duration-300 ${
              verifiedPhotos.has(p.id)
                ? "bg-primary shadow-sm"
                : i === currentIndex
                ? "bg-primary/40 ring-1 ring-primary/30"
                : "bg-muted hover:bg-muted-foreground/20"
            }`}
            title={`Photo ${i + 1}${verifiedPhotos.has(p.id) ? " — Verified" : ""}`}
          />
        ))}
      </div>

      {/* ── Submitted Photo — Full Width ── */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-primary" />
          Submitted Photo
        </div>
        <div className="relative rounded-xl overflow-hidden border border-primary/20 bg-muted shadow-sm">
          <img
            src={currentPhoto.photoUrl}
            alt={currentPhoto.fileName}
            className="w-full max-h-[420px] object-contain bg-black cursor-pointer hover:scale-[1.01] transition-transform duration-300"
            onClick={() => setShowFullImage(true)}
          />
          {/* Source badge */}
          {meta && (
            <div className="absolute top-2.5 left-2.5">
              {meta.sourceType === "real-time" ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/90 text-white text-[10px] font-semibold backdrop-blur-sm shadow-sm">
                  <CheckCircle className="w-3 h-3" /> Real-Time
                </span>
              ) : meta.sourceType === "edited" ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/80 text-white text-[10px] font-semibold backdrop-blur-sm shadow-sm">
                  <AlertTriangle className="w-3 h-3" /> Tampered
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/60 text-white text-[10px] font-semibold backdrop-blur-sm shadow-sm">
                  <Shield className="w-3 h-3" /> Unknown
                </span>
              )}
            </div>
          )}
          {/* Verified overlay */}
          {isVerified && (
            <div className="absolute top-2.5 right-2.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/90 text-white text-[10px] font-semibold backdrop-blur-sm shadow-sm">
                <CheckCircle className="w-3 h-3" /> Verified
              </span>
            </div>
          )}
          {/* Navigation arrows */}
          <div className="absolute bottom-3 left-3 right-3 flex justify-between">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 hover:bg-black/60 backdrop-blur-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goNext}
              disabled={currentIndex === photos.length - 1}
              className="w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-20 hover:bg-black/60 backdrop-blur-sm transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {/* Click to zoom hint */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <span className="px-2 py-0.5 rounded-md bg-black/40 text-white text-[9px] backdrop-blur-sm">
              <Eye className="w-2.5 h-2.5 inline mr-1" />Click to expand
            </span>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground truncate font-medium">{currentPhoto.fileName}</div>
      </div>

      {/* ── Not-Onsite / External Source Warning Banner ── */}
      {notOnsiteAlert && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-primary/10 border border-primary/40 shadow-sm">
          <Download className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-xs font-bold text-primary">
              {notOnsiteAlert.title}
            </div>
            <div className="text-[11px] text-primary/75 leading-relaxed">
              {notOnsiteAlert.detail}
            </div>
          </div>
        </div>
      )}

      {/* ── GPS Comparison Table ── */}
      {meta && (
        <div className={`rounded-xl border overflow-hidden shadow-sm ${
          isOutside ? "border-primary/30" : "border-primary/20"
        }`}>
          <div className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-2 ${
            isOutside
              ? "bg-primary/10 text-primary"
              : "bg-primary/5 text-primary"
          }`}>
            <MapPin className="w-3 h-3" />
            GPS Comparison — Master vs Photo
          </div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-border/60">
              <tr className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 text-muted-foreground font-medium w-[35%]">Master GPS</td>
                <td className="px-4 py-2.5 font-mono text-foreground text-[11px]">{masterGps.lat.toFixed(6)}, {masterGps.lng.toFixed(6)}</td>
              </tr>
              <tr className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 text-muted-foreground font-medium">Photo GPS</td>
                <td className="px-4 py-2.5 font-mono text-foreground text-[11px]">
                  {meta.gpsLatitude !== null ? `${meta.gpsLatitude.toFixed(6)}, ${meta.gpsLongitude?.toFixed(6)}` : "No Metadata Found — ⚠ High Risk"}
                </td>
              </tr>
              <tr className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 text-muted-foreground font-medium">Distance</td>
                <td className={`px-4 py-2.5 font-mono font-semibold text-[11px] ${isOutside ? "text-primary font-bold" : "text-primary"}`}>
                  {currentDistance.toFixed(1)}m {isOutside ? `— Exceeds ${GEOFENCE_RADIUS_M}m limit` : `— Within ${GEOFENCE_RADIUS_M}m`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Metadata Detail Card ── */}
      {meta && (
        <div className="rounded-xl border border-primary/20 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-primary/5 border-b border-primary/10 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">EXIF Metadata — {currentPhoto.fileName}</span>
          </div>

          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <MiniMeta
              icon={<Smartphone className="w-3 h-3" />}
              label="Device"
              value={getDeviceString(meta)}
            />
            <MiniMeta
              icon={<Mountain className="w-3 h-3" />}
              label="Altitude"
              value={meta.gpsAltitude !== null ? `${meta.gpsAltitude.toFixed(1)}m ASL` : "No Metadata Found — ⚠ High Risk"}
            />
            <MiniMeta
              icon={<Compass className="w-3 h-3" />}
              label="Bearing"
              value={getBearingString(meta.gpsDirection)}
            />
            <MiniMeta
              icon={<Calendar className="w-3 h-3" />}
              label="Date / Time"
              value={meta.dateTimeOriginal ?? "No Metadata Found — ⚠ High Risk"}
            />
            <MiniMeta
              icon={<Camera className="w-3 h-3" />}
              label="Software"
              value={meta.software ?? "None detected"}
              highlight={meta.isTampered ? "red" : undefined}
            />
            <MiniMeta
              icon={<Shield className="w-3 h-3" />}
              label="Source Integrity"
              value={meta.sourceVerdict}
              highlight={meta.sourceType === "real-time" ? "green" : meta.sourceType === "edited" ? "red" : undefined}
            />
          </div>

          {/* Forensic flags */}
          {meta.forensicFlags && meta.forensicFlags.length > 0 && (
            <div className="mx-3 mb-2 space-y-1">
              {meta.forensicFlags.map((flag, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                  <AlertCircle className="w-3 h-3 text-primary/50 shrink-0 mt-0.5" />
                  {flag}
                </div>
              ))}
            </div>
          )}

          {/* Cross-photo consistency for current photo */}
          {(() => {
            const consistency = crossPhotoResults.find((r) => r.photoId === currentPhoto.id);
            if (!consistency) return null;
            const isFirst = consistency.distanceFromFirst === 0 && crossPhotoResults[0]?.photoId === currentPhoto.id;
            return (
              <div className={`mx-3 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                isFirst
                  ? "bg-primary/5 border border-primary/20 text-primary"
                  : consistency.isConsistent
                    ? "bg-primary/5 border border-primary/20 text-primary"
                    : "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
              }`}>
                {isFirst ? (
                  <><MapPin className="w-3.5 h-3.5" /> Reference photo (anchor point)</>
                ) : consistency.isConsistent ? (
                  <><CheckCircle className="w-3.5 h-3.5" /> {consistency.distanceFromFirst.toFixed(1)}m from Photo 1 — Location consistent</>
                ) : (
                  <><AlertTriangle className="w-3.5 h-3.5" /> {consistency.flag}</>
                )}
              </div>
            );
          })()}

          {meta.isTampered && (
            <div className="mx-3 mb-3 flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary/80">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium">{meta.tamperReason}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Verify Button — full-width ── */}
      <div className="flex">
        {!isVerified ? (
          <Button
            onClick={handleVerify}
            className="w-full bg-primary hover:bg-primary/90 text-white text-xs h-9 gap-1.5 shadow-sm"
          >
            <CheckCircle className="w-4 h-4" />
            Verify Metadata — Photo {currentIndex + 1}
          </Button>
        ) : (
          <Button
            onClick={handleUnverify}
            variant="outline"
            className="w-full border-primary text-primary hover:bg-primary/5 text-xs h-9 gap-1.5"
          >
            <CheckCircle className="w-4 h-4" />
            Verified ✓ (click to undo)
          </Button>
        )}
      </div>

      {/* ── Fullscreen Modal ── */}
      {showFullImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowFullImage(false)}
        >
          <button
            onClick={() => setShowFullImage(false)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={currentPhoto.photoUrl}
            alt={currentPhoto.fileName}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}

function MiniMeta({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: "red" | "green";
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/60 hover:border-primary/20 transition-colors">
      <div className="text-primary shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">{label}</div>
        <div className={`text-[11px] font-medium font-mono truncate ${
          highlight === "green" ? "text-primary" :
          highlight === "red" ? "text-red-500 dark:text-red-400" :
          "text-foreground"
        }`}>
          {value}
        </div>
      </div>
    </div>
  );
}
