import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui";
import { Camera, MapPin, X, AlertCircle, CheckCircle, RotateCw } from "lucide-react";
import { calculateDistance } from "@/lib/utils";

export interface GeoCaptureResult {
  blob: Blob;
  dataUrl: string;
  gpsLat: number;
  gpsLng: number;
  gpsAccuracy: number;
  gpsTimestamp: string;
  gpsAltitude: number | null;
  gpsHeading: number | null;
  distanceFromSite: number | null; // null if no anchor set
  /** Camera sensor label from MediaStreamTrack (e.g. "camera2 0, facing back") */
  deviceLabel: string | null;
  /** Real device model parsed from navigator.userAgent (e.g. "SM-S926B", "iPhone 15 Pro") */
  deviceModelUA: string | null;
}

/**
 * Parse the real hardware device model using UA Client Hints (high-entropy)
 * with fallback to User-Agent string parsing.
 * Returns the real device model like "SM-S926B", "Pixel 7", "iPhone 15 Pro".
 */
async function parseDeviceModelAsync(): Promise<string | null> {
  // 1) Try UA Client Hints (Chrome/Edge on Android, Chromium-based browsers)
  try {
    const uaData = (navigator as unknown as { userAgentData?: { getHighEntropyValues: (hints: string[]) => Promise<{ model?: string; platform?: string; platformVersion?: string }> } }).userAgentData;
    if (uaData?.getHighEntropyValues) {
      const hints = await uaData.getHighEntropyValues(["model", "platform", "platformVersion"]);
      if (hints.model && hints.model.trim()) {
        return hints.model.trim();
      }
    }
  } catch { /* UA-CH not supported or denied */ }

  // 2) Fallback: parse User-Agent string
  return parseDeviceModelFromUA();
}

/** Synchronous UA-string fallback */
function parseDeviceModelFromUA(): string | null {
  const ua = navigator.userAgent;
  // Android: "Linux; Android 14; SM-S926B" or "Android 13; Pixel 7"
  const androidMatch = ua.match(/;\s*Android[^;]*;\s*([^)]+)/i);
  if (androidMatch) {
    return androidMatch[1].replace(/\s*Build\/.*$/i, "").trim() || null;
  }
  // iOS: "iPhone15,3" or "iPad14,6" in some WKWebView UAs
  const iosHwMatch = ua.match(/(iPhone|iPad)\d+,\d+/i);
  if (iosHwMatch) return iosHwMatch[0];
  // iOS generic: "iPhone" / "iPad" from Safari UA
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  // Desktop / fallback — derive a meaningful platform identifier
  // Windows
  if (/Windows NT/i.test(ua)) {
    const winMatch = ua.match(/Windows NT (\d+\.\d+)/);
    const ver = winMatch?.[1];
    const winName = ver === "10.0" ? "Windows 10/11" : ver ? `Windows NT ${ver}` : "Windows";
    // Try to get browser name for better identification
    const edgeMatch = ua.match(/Edg\/([\d.]+)/);
    const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
    const firefoxMatch = ua.match(/Firefox\/([\d.]+)/);
    const browser = edgeMatch ? `Edge ${edgeMatch[1].split('.')[0]}` :
      chromeMatch ? `Chrome ${chromeMatch[1].split('.')[0]}` :
      firefoxMatch ? `Firefox ${firefoxMatch[1].split('.')[0]}` : "Browser";
    return `${winName} (${browser})`;
  }
  // macOS
  if (/Macintosh/i.test(ua)) {
    const macMatch = ua.match(/Mac OS X (\d+[._]\d+)/);
    const macVer = macMatch?.[1]?.replace(/_/g, ".") ?? "";
    return macVer ? `macOS ${macVer}` : "macOS";
  }
  // Linux
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
    return "Linux Desktop";
  }
  // Other platforms
  if (navigator.platform) return navigator.platform;
  return null;
}

interface GeoCameraProps {
  /** Project site anchor (set by first upload). null = no anchor yet */
  siteAnchor: { lat: number; lng: number } | null;
  /** Max distance in meters from anchor (default 50) */
  maxRadius?: number;
  /** Called when a photo is captured with valid GPS */
  onCapture: (result: GeoCaptureResult) => void;
  /** Called when the camera is closed */
  onClose: () => void;
}

export function GeoCamera({
  siteAnchor,
  maxRadius = 50,
  onCapture,
  onClose,
}: GeoCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number; altitude: number | null; heading: number | null } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  /** Real compass bearing from DeviceOrientationEvent (0-360°) */
  const compassRef = useRef<number | null>(null);
  /** Pre-resolved device model (fetched once on mount) */
  const deviceModelRef = useRef<string | null>(null);

  // Distance from anchor
  const distanceFromSite =
    gps && siteAnchor
      ? calculateDistance(siteAnchor.lat, siteAnchor.lng, gps.lat, gps.lng)
      : null;

  const isWithinRadius = distanceFromSite === null || distanceFromSite <= maxRadius;

  // ── Start camera stream ──
  const startCamera = useCallback(async () => {
    try {
      // Stop previous stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraError(null);
    } catch {
      setCameraError("Camera access denied. Please allow camera permissions.");
    }
  }, [facingMode]);

  // ── Acquire GPS ──
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation not supported by browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          heading: pos.coords.heading, // compass heading (null if stationary)
        });
        setGpsError(null);
      },
      (err) => {
        setGpsError(`GPS Error: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ── Start camera on mount ──
  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCamera]);

  // ── Compass bearing via DeviceOrientation ──
  useEffect(() => {
    // Request permission on iOS 13+
    const orientEvt = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (orientEvt.requestPermission) {
      orientEvt.requestPermission().then((state: string) => {
        if (state === "granted") attachCompass();
      }).catch(() => {});
    } else {
      attachCompass();
    }

    function attachCompass() {
      window.addEventListener("deviceorientationabsolute", handleOrientation, true);
      window.addEventListener("deviceorientation", handleOrientation, true);
    }

    function handleOrientation(e: Event) {
      const evt = e as DeviceOrientationEvent;
      // iOS provides webkitCompassHeading (degrees from magnetic north)
      const iosHeading = (evt as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof iosHeading === "number" && !isNaN(iosHeading)) {
        compassRef.current = iosHeading;
        return;
      }
      // Android: absolute alpha is degrees from true north (360 - alpha)
      if (evt.absolute && typeof evt.alpha === "number") {
        compassRef.current = (360 - evt.alpha) % 360;
        return;
      }
      // Non-absolute fallback
      if (typeof evt.alpha === "number") {
        compassRef.current = (360 - evt.alpha) % 360;
      }
    }

    return () => {
      window.removeEventListener("deviceorientationabsolute", handleOrientation, true);
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, []);

  // ── Resolve device model once on mount ──
  useEffect(() => {
    parseDeviceModelAsync().then((model) => {
      deviceModelRef.current = model;
    });
  }, []);

  // ── Toggle front/back camera ──
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  // ── Capture photo ──
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !gps) return;

    setIsCapturing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    // Burn GPS watermark into the image
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
    ctx.fillStyle = "#00ff88";
    ctx.font = "bold 16px monospace";
    const ts = new Date().toISOString();
    ctx.fillText(`GPS: ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`, 12, canvas.height - 50);
    ctx.fillText(`Acc: ${gps.accuracy.toFixed(0)}m | ${ts}`, 12, canvas.height - 24);
    if (distanceFromSite !== null) {
      ctx.fillStyle = isWithinRadius ? "#00ff88" : "#ff4444";
      ctx.fillText(`Distance: ${distanceFromSite.toFixed(1)}m from site`, 12, canvas.height - 2);
    }

    // Get device label from video track for hardware traceability
    const tracks = streamRef.current?.getVideoTracks() ?? [];
    const deviceLabel = tracks.length > 0 ? (tracks[0].label || null) : null;

    // Use real compass bearing (DeviceOrientation) instead of GPS heading
    const realBearing = compassRef.current ?? gps.heading;
    const resolvedModel = deviceModelRef.current;

    // ── Diagnostic: log sensor data at capture time ──
    console.log("[GeoCamera] Capture sensors →", {
      altitude: gps.altitude,
      compassBearing: compassRef.current,
      gpsHeading: gps.heading,
      resolvedBearing: realBearing,
      deviceModelUA: resolvedModel,
      deviceLabel,
      lat: gps.lat,
      lng: gps.lng,
      accuracy: gps.accuracy,
    });

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setIsCapturing(false);
          return;
        }
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        onCapture({
          blob,
          dataUrl,
          gpsLat: gps.lat,
          gpsLng: gps.lng,
          gpsAccuracy: gps.accuracy,
          gpsTimestamp: ts,
          gpsAltitude: gps.altitude,
          gpsHeading: realBearing,
          distanceFromSite: distanceFromSite,
          deviceLabel,
          deviceModelUA: resolvedModel,
        });
        setIsCapturing(false);
      },
      "image/jpeg",
      0.95
    );
  }, [gps, distanceFromSite, isWithinRadius, onCapture]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-black/70 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-primary" />
          <span className="text-white text-sm font-semibold">GPS-Verified Camera</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20 h-8 w-8 p-0">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative">
        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-6 bg-card rounded-lg max-w-sm mx-4">
              <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
              <p className="text-sm text-foreground font-medium mb-2">Camera Unavailable</p>
              <p className="text-xs text-muted-foreground">{cameraError}</p>
              <Button onClick={startCamera} size="sm" className="mt-3">
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

        {/* GPS Status Overlay */}
        <div className="absolute bottom-28 left-4 right-4 space-y-2">
          {/* GPS Coordinates */}
          {gps ? (
            <div className="bg-black/70 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-white font-mono">
                  {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                </span>
                <span className="text-white/60 ml-auto">±{gps.accuracy.toFixed(0)}m</span>
              </div>
            </div>
          ) : gpsError ? (
            <div className="bg-red-900/70 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-red-200">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{gpsError}</span>
              </div>
            </div>
          ) : (
            <div className="bg-yellow-900/70 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-yellow-200">
                <MapPin className="w-3.5 h-3.5 animate-pulse shrink-0" />
                <span>Acquiring GPS signal...</span>
              </div>
            </div>
          )}

          {/* Distance from site */}
          {gps && siteAnchor && distanceFromSite !== null && (
            <div
              className={`rounded-lg px-3 py-2 ${
                isWithinRadius
                  ? "bg-teal-900/70 border border-teal-500/40"
                  : "bg-red-900/70 border border-red-500/40"
              }`}
            >
              <div className="flex items-center gap-2 text-xs">
                {isWithinRadius ? (
                  <CheckCircle className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                )}
                <span className={isWithinRadius ? "text-teal-200" : "text-red-200"}>
                  {distanceFromSite.toFixed(1)}m from project site
                  {!isWithinRadius && ` (max ${maxRadius}m)`}
                </span>
              </div>
            </div>
          )}

          {!siteAnchor && gps && (
            <div className="bg-teal-900/70 rounded-lg px-3 py-2 border border-teal-500/40">
              <div className="flex items-center gap-2 text-xs text-teal-200">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>First photo — this will anchor the project site location</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="bg-black/80 px-6 py-4 flex items-center justify-center gap-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCamera}
          className="text-white hover:bg-white/20 h-10 w-10 p-0 rounded-full"
          title="Switch Camera"
        >
          <RotateCw className="w-5 h-5" />
        </Button>

        <button
          onClick={capturePhoto}
          disabled={!gps || isCapturing || (!isWithinRadius && siteAnchor !== null)}
          className={`w-16 h-16 rounded-full border-4 transition-all ${
            !gps
              ? "border-gray-600 bg-gray-800 cursor-not-allowed"
              : !isWithinRadius && siteAnchor !== null
              ? "border-red-500 bg-red-900 cursor-not-allowed"
              : "border-white bg-white/20 hover:bg-white/30 active:scale-90"
          }`}
          title={
            !gps
              ? "Waiting for GPS..."
              : !isWithinRadius && siteAnchor !== null
              ? `Too far from site (${distanceFromSite?.toFixed(0)}m > ${maxRadius}m)`
              : "Capture Photo"
          }
        >
          <Camera className={`w-6 h-6 mx-auto ${!gps ? "text-gray-500" : "text-white"}`} />
        </button>

        <div className="w-10" /> {/* Spacer for symmetry */}
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
