// ════════════════════════════════════════════════════════════════════════════
// PhotoMetadataPanel — Displays EXIF forensic metadata for a photo
// Shows GPS, device signature, tampering detection, bearing/direction
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import {
  MapPin,
  Camera,
  AlertTriangle,
  CheckCircle,
  Compass,
  Smartphone,
  Calendar,
  Mountain,
  Eye,
  X,
  Shield,
  AlertCircle,
} from "lucide-react";
import type { ExifMetadata } from "@/lib/exifExtractor";
import { getDeviceString, getBearingString } from "@/lib/exifExtractor";

interface PhotoMetadataPanelProps {
  meta: ExifMetadata;
  photoUrl: string;
  photoName: string;
  masterGps?: { lat: number; lng: number } | null;
  distanceFromMaster?: number | null;
  geofenceRadius?: number;
  /** Show the raw JSON dump */
  showRawByDefault?: boolean;
}

export function PhotoMetadataPanel({
  meta,
  photoUrl,
  photoName,
  masterGps,
  distanceFromMaster,
  geofenceRadius = 50,
  showRawByDefault = false,
}: PhotoMetadataPanelProps) {
  const [showRaw, setShowRaw] = useState(showRawByDefault);
  const [showFullImage, setShowFullImage] = useState(false);

  const isOutsideGeofence = distanceFromMaster !== null && distanceFromMaster !== undefined && distanceFromMaster > geofenceRadius;

  return (
    <div className="space-y-4">
      {/* ── Split View: Photo (left) + Metadata Reader (right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT — Photo Preview */}
        <div className="relative rounded-xl overflow-hidden border border-primary/20 bg-muted shadow-sm">
          <img
            src={photoUrl}
            alt={photoName}
            className="w-full h-56 object-cover cursor-pointer hover:scale-[1.02] transition-transform duration-300"
            onClick={() => setShowFullImage(true)}
          />
          {/* Source badge */}
          <div className="absolute top-2.5 left-2.5">
            {meta.sourceType === "real-time" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/90 text-white text-[10px] font-semibold backdrop-blur-sm shadow-sm">
                <CheckCircle className="w-3 h-3" /> Real-Time Capture
              </span>
            ) : meta.sourceType === "edited" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/80 text-white text-[10px] font-semibold backdrop-blur-sm shadow-sm">
                <AlertTriangle className="w-3 h-3" /> Potentially Tampered
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/60 text-white text-[10px] font-semibold backdrop-blur-sm shadow-sm">
                <Shield className="w-3 h-3" /> Unknown Source
              </span>
            )}
          </div>
          {/* Geofence badge */}
          {distanceFromMaster !== null && distanceFromMaster !== undefined && (
            <div className="absolute top-2.5 right-2.5">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-white text-[10px] font-semibold backdrop-blur-sm shadow-sm ${
                isOutsideGeofence ? "bg-primary/80" : "bg-primary/90"
              }`}>
                <MapPin className="w-3 h-3" /> {distanceFromMaster.toFixed(1)}m
              </span>
            </div>
          )}
          {/* Expand hint */}
          <div className="absolute bottom-2.5 right-2.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/50 text-white text-[9px] backdrop-blur-sm">
              <Eye className="w-2.5 h-2.5" /> Click to expand
            </span>
          </div>
        </div>

        {/* RIGHT — Forensic Metadata Reader */}
        <div className="rounded-xl border border-primary/20 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-primary/5 border-b border-primary/10">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-primary" />
              Forensic Metadata Reader
            </h4>
          </div>
          <div className="p-3 space-y-2">
            <MetaRow
              icon={<MapPin className="w-3.5 h-3.5 text-primary" />}
              label="GPS Coordinates"
              value={
                meta.gpsLatitude !== null && meta.gpsLongitude !== null
                  ? `${meta.gpsLatitude.toFixed(6)}, ${meta.gpsLongitude.toFixed(6)}`
                  : "No GPS Data — ⚠ High Risk"
              }
              mono
              status={meta.gpsLatitude !== null ? "ok" : "warn"}
            />
            <MetaRow
              icon={<Mountain className="w-3.5 h-3.5 text-primary" />}
              label="Altitude"
              value={meta.gpsAltitude !== null ? `${meta.gpsAltitude.toFixed(1)}m ASL` : "No Metadata Found — ⚠ High Risk"}
              mono
            />
            <MetaRow
              icon={<Compass className="w-3.5 h-3.5 text-primary" />}
              label="Camera Bearing"
              value={getBearingString(meta.gpsDirection)}
              mono
            />
            <MetaRow
              icon={<Smartphone className="w-3.5 h-3.5 text-primary" />}
              label="Device Model"
              value={getDeviceString(meta)}
              mono
            />
            <MetaRow
              icon={<Calendar className="w-3.5 h-3.5 text-primary" />}
              label="Date / Time"
              value={meta.dateTimeOriginal ?? "No Metadata Found — ⚠ High Risk"}
              mono
            />
            <MetaRow
              icon={<Camera className="w-3.5 h-3.5 text-primary" />}
              label="Software"
              value={meta.software ?? "None detected"}
              mono
              status={meta.isTampered ? "error" : "ok"}
            />
            {/* Source Integrity — verdict + forensic flags */}
            <div className="pt-1 space-y-2">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5">Source Integrity</div>
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold ${
                meta.sourceType === "real-time"
                  ? "bg-primary/10 border border-primary/20 text-primary"
                  : meta.sourceType === "edited"
                    ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400"
                    : "bg-muted border border-primary/10 text-primary/60"
              }`}>
                {meta.sourceType === "real-time" ? <CheckCircle className="w-3.5 h-3.5" /> :
                 meta.sourceType === "edited" ? <AlertTriangle className="w-3.5 h-3.5" /> :
                 <Shield className="w-3.5 h-3.5" />}
                {meta.sourceVerdict}
              </div>
              {meta.forensicFlags && meta.forensicFlags.length > 0 && (
                <div className="space-y-1">
                  {meta.forensicFlags.map((flag, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                      <AlertCircle className="w-3 h-3 text-primary/50 shrink-0 mt-0.5" />
                      {flag}
                    </div>
                  ))}
                </div>
              )}
              {meta.timestampConsistent !== null && (
                <div className={`flex items-center gap-1.5 text-[10px] font-medium ${
                  meta.timestampConsistent ? "text-primary" : "text-red-500 dark:text-red-400"
                }`}>
                  {meta.timestampConsistent
                    ? <><CheckCircle className="w-3 h-3" /> Creation & modification timestamps consistent</>
                    : <><AlertTriangle className="w-3 h-3" /> Timestamp mismatch — file may have been re-saved</>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tampering Alert ── */}
      {meta.isTampered && meta.tamperReason && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20 text-xs shadow-sm">
          <AlertTriangle className="w-4 h-4 text-primary shrink-0" />
          <span className="text-primary/80 font-medium">{meta.tamperReason}</span>
        </div>
      )}

      {/* ── GPS Comparison Table ── */}
      {masterGps && (
        <div className={`rounded-xl border overflow-hidden shadow-sm ${
          isOutsideGeofence
            ? "border-primary/30"
            : "border-primary/20"
        }`}>
          <div className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-wider ${
            isOutsideGeofence
              ? "bg-primary/10 text-primary"
              : "bg-primary/5 text-primary"
          }`}>
            GPS Comparison — Site vs Photo
          </div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-4 py-2 text-muted-foreground font-medium w-1/3">Master GPS (Project Site)</td>
                <td className="px-4 py-2 font-mono text-foreground">{masterGps.lat.toFixed(6)}, {masterGps.lng.toFixed(6)}</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-muted-foreground font-medium">Photo GPS</td>
                <td className="px-4 py-2 font-mono text-foreground">
                  {meta.gpsLatitude !== null ? `${meta.gpsLatitude.toFixed(6)}, ${meta.gpsLongitude?.toFixed(6)}` : "No Metadata Found — ⚠ High Risk"}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-muted-foreground font-medium">Distance</td>
                <td className={`px-4 py-2 font-mono font-semibold ${isOutsideGeofence ? "text-primary font-bold" : "text-primary"}`}>
                  {distanceFromMaster !== null && distanceFromMaster !== undefined
                    ? `${distanceFromMaster.toFixed(1)}m ${isOutsideGeofence ? `— EXCEEDS ${geofenceRadius}m limit` : `— within ${geofenceRadius}m`}`
                    : "No Metadata Found — ⚠ High Risk"}
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-muted-foreground font-medium">Status</td>
                <td className="px-4 py-2">
                  {isOutsideGeofence ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold">
                      <AlertTriangle className="w-3 h-3" /> Location Mismatch
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold">
                      <CheckCircle className="w-3 h-3" /> Verified
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── View Raw Metadata ── */}
      <button
        onClick={() => setShowRaw(!showRaw)}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
      >
        <Eye className="w-3.5 h-3.5" />
        {showRaw ? "Hide" : "View"} Raw EXIF Data
      </button>

      {showRaw && (
        <pre className="p-4 rounded-xl bg-muted border border-border text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-48 overflow-y-auto shadow-inner">
          {JSON.stringify(meta.raw, null, 2)}
        </pre>
      )}

      {/* ── Fullscreen Image Modal ── */}
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
          <img src={photoUrl} alt={photoName} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}

// ── Helper sub-component — single metadata row ──
function MetaRow({
  icon,
  label,
  value,
  status,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  status?: "ok" | "warn" | "error";
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/40 border border-border/60 hover:border-primary/20 transition-colors">
      <div className="shrink-0 text-primary">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">{label}</div>
        <div className={`text-[11px] font-medium truncate ${
          mono ? "font-mono" : ""
        } ${
          status === "error" ? "text-primary font-bold" :
          status === "warn" ? "text-primary/70" :
          "text-foreground"
        }`}>
          {value}
        </div>
      </div>
    </div>
  );
}
