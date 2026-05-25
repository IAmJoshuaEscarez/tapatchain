import exifr from "exifr";
import { calculateDistance } from "@/shared/lib/utils";

/** Extracted EXIF metadata for a single photo */
export interface ExifMetadata {
  // GPS
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsAltitude: number | null;
  gpsDirection: number | null;
  gpsTimestamp: string | null;

  // Device signature
  deviceMake: string | null;
  deviceModel: string | null;

  // Tampering detection
  software: string | null;
  isTampered: boolean;
  tamperReason: string | null;
  sourceType: "real-time" | "edited" | "unknown";

  // DateTime from EXIF
  dateTimeOriginal: string | null;
  /** File modification timestamp — differs from creation if post-processed */
  modifyDate: string | null;

  // ── Enhanced Forensic Fields ──
  /** Screenshot detected via resolution / DPI / software heuristics */
  isScreenshot: boolean;
  /** Social-media artifact detected in metadata strings */
  isSocialMedia: boolean;
  /** Every forensic flag raised during analysis */
  forensicFlags: string[];
  /** Human-readable source verdict for the inspector panel */
  sourceVerdict: string;
  /** Hardware identifier: "Internal Camera", device fingerprint, or null */
  deviceSignature: string | null;
  /** Whether creation & modification timestamps are consistent (within 2 min) */
  timestampConsistent: boolean | null;

  // Raw dump for "View Metadata" panel
  raw: Record<string, unknown>;
}

/** Result of per-photo cross-consistency check against the first photo */
export interface PhotoConsistencyResult {
  photoId: string | number;
  distanceFromFirst: number; // meters
  isConsistent: boolean;
  flag: string | null;
}

// ── GPS DMS → Decimal Helper ──

/**
 * Convert DMS (degrees-minutes-seconds) array to decimal degrees.
 * Handles exifr's raw GPSLatitude / GPSLongitude arrays when
 * `translateValues` doesn't auto-convert them.
 */
function dmsToDecimal(
  dms: unknown,
  ref?: string | null
): number | null {
  if (typeof dms === "number") return dms;
  if (!Array.isArray(dms) || dms.length < 3) return null;
  const [deg, min, sec] = dms.map(Number);
  if (isNaN(deg) || isNaN(min) || isNaN(sec)) return null;
  let decimal = deg + min / 60 + sec / 3600;
  // Apply hemisphere sign: S and W are negative
  if (ref && (ref === "S" || ref === "W")) {
    decimal = -Math.abs(decimal);
  }
  return decimal;
}

// ── Detection Patterns ──

const EDITOR_PATTERNS = [
  /photoshop/i,
  /lightroom/i,
  /gimp/i,
  /snapseed/i,
  /canva/i,
  /picsart/i,
  /pixlr/i,
  /affinity/i,
  /corel/i,
  /paint\.net/i,
  /capture one/i,
  /darktable/i,
  /rawtherapee/i,
  /luminar/i,
  /fotor/i,
  /befunky/i,
  /inshot/i,
  /picmonkey/i,
  /polarr/i,
  /vsco/i,
  /photoscape/i,
  /acdsee/i,
  /adobe/i,
];

const SOCIAL_MEDIA_PATTERNS = [
  /facebook/i, /instagram/i, /twitter/i, /whatsapp/i,
  /telegram/i, /tiktok/i, /snapchat/i, /viber/i,
  /messenger/i, /line\s/i, /wechat/i, /discord/i,
  /pinterest/i, /tumblr/i, /reddit/i, /imgur/i,
];

const SCREENSHOT_PATTERNS = [
  /screenshot/i, /screen.?capture/i, /snipping/i,
  /greenshot/i, /lightshot/i, /sharex/i, /gyazo/i,
  /monosnap/i, /cleanshot/i, /flameshot/i, /spectacle/i,
];

/** Common screen resolutions (WxH) used as a screenshot heuristic */
const SCREEN_RESOLUTIONS = new Set([
  "1920x1080", "2560x1440", "3840x2160", "1366x768",
  "1536x864", "1440x900", "1280x720", "1600x900",
  "2560x1600", "3440x1440", "2880x1800", "1280x800",
  "1170x2532", "1284x2778", "1080x2400", "1080x2340",
  "1440x3200", "1080x1920", "750x1334", "1125x2436",
]);

/**
 * Extract full EXIF metadata from an image File.
 * Zero-loss: parses ALL available segments (TIFF, EXIF, GPS, ICC, IPTC, XMP).
 * Returns a structured ExifMetadata or a "no data" result if parsing fails.
 */
export async function extractExifMetadata(file: File): Promise<ExifMetadata> {
  const empty: ExifMetadata = {
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAltitude: null,
    gpsDirection: null,
    gpsTimestamp: null,
    deviceMake: null,
    deviceModel: null,
    software: null,
    isTampered: false,
    tamperReason: null,
    sourceType: "unknown",
    dateTimeOriginal: null,
    modifyDate: null,
    isScreenshot: false,
    isSocialMedia: false,
    forensicFlags: [],
    sourceVerdict: "Insufficient Metadata",
    deviceSignature: null,
    timestampConsistent: null,
    raw: {},
  };

  try {
    // Parse ALL EXIF segments — no `pick` filter so we retain every header
    const data = await exifr.parse(file, {
      gps: true,
      tiff: true,
      exif: true,
      icc: true,
      iptc: true,
      xmp: true,
      interop: true,
      translateValues: true,
      translateKeys: true,
      mergeOutput: true,
    });

    if (!data) {
      empty.forensicFlags = ["No EXIF data found — file may have been scrubbed or is not a camera capture"];
      empty.sourceVerdict = "Non-Original / External Source";
      return empty;
    }

    const flags: string[] = [];

    // ── GPS (with DMS → Decimal fallback) ──
    const lat =
      data.latitude ??
      dmsToDecimal(data.GPSLatitude, data.GPSLatitudeRef) ??
      null;
    const lng =
      data.longitude ??
      dmsToDecimal(data.GPSLongitude, data.GPSLongitudeRef) ??
      null;
    const alt = data.GPSAltitude ?? null;
    const dir = data.GPSImgDirection ?? null;

    let gpsTs: string | null = null;
    if (data.GPSDateStamp && data.GPSTimeStamp) {
      gpsTs = `${data.GPSDateStamp} ${data.GPSTimeStamp}`;
    } else if (data.DateTimeOriginal) {
      gpsTs = safeISOString(data.DateTimeOriginal);
    }

    if (lat === null || lng === null) {
      flags.push("GPS missing — Incomplete Documentation");
    }

    // ── Device Signature (hardware traceability) ──
    const make = data.Make ? String(data.Make).trim() : null;
    const model = data.Model ? String(data.Model).trim() : null;
    // Secondary fields for thin EXIF (laptop cameras, webcams)
    const lensModel = data.LensModel ? String(data.LensModel).trim() : null;
    const hostComputer = data.HostComputer ? String(data.HostComputer).trim() : null;
    const uniqueCameraModel = data.UniqueCameraModel ? String(data.UniqueCameraModel).trim() : null;

    let deviceSignature: string | null = null;
    if (make && model) {
      deviceSignature = model.toLowerCase().startsWith(make.toLowerCase())
        ? model
        : `${make} ${model}`;
    } else if (model) {
      deviceSignature = model;
    } else if (uniqueCameraModel) {
      deviceSignature = uniqueCameraModel;
    } else if (hostComputer) {
      deviceSignature = `${hostComputer} (built-in camera)`;
    } else if (lensModel) {
      deviceSignature = lensModel;
    }

    if (!make && !model) {
      flags.push("No device Make/Model — cannot verify hardware origin");
    }

    // ── Software / Tampering ──
    const sw = data.Software ? String(data.Software).trim() : null;
    const xmpCreator = data.CreatorTool ? String(data.CreatorTool).trim() : null;
    const imgDesc = data.ImageDescription ? String(data.ImageDescription).trim() : null;
    const userComment = data.UserComment ? String(data.UserComment).trim() : null;
    const allSoftwareStrings = [sw, xmpCreator, imgDesc, userComment].filter(Boolean) as string[];

    let isTampered = false;
    let tamperReason: string | null = null;
    let isSocialMedia = false;
    let isScreenshot = false;

    // Check editor patterns
    for (const s of allSoftwareStrings) {
      for (const pattern of EDITOR_PATTERNS) {
        if (pattern.test(s)) {
          isTampered = true;
          tamperReason = `Editing software detected: "${s}"`;
          flags.push(`Editor signature: "${s}"`);
          break;
        }
      }
      if (isTampered) break;
    }

    // Check social media patterns
    for (const s of allSoftwareStrings) {
      for (const pattern of SOCIAL_MEDIA_PATTERNS) {
        if (pattern.test(s)) {
          isSocialMedia = true;
          isTampered = true;
          tamperReason = tamperReason
            ? `${tamperReason}; Social media origin: "${s}"`
            : `Social media origin detected: "${s}"`;
          flags.push(`Social media artifact: "${s}"`);
          break;
        }
      }
      if (isSocialMedia) break;
    }

    // Check screenshot patterns
    for (const s of allSoftwareStrings) {
      for (const pattern of SCREENSHOT_PATTERNS) {
        if (pattern.test(s)) {
          isScreenshot = true;
          isTampered = true;
          tamperReason = tamperReason
            ? `${tamperReason}; Screenshot tool: "${s}"`
            : `Screenshot tool detected: "${s}"`;
          flags.push(`Screenshot software: "${s}"`);
          break;
        }
      }
      if (isScreenshot) break;
    }

    // Screenshot heuristic: no camera info + screen resolution + 72/96 DPI
    if (!isScreenshot && !make && !model) {
      const w = data.ImageWidth ?? data.ExifImageWidth ?? null;
      const h = data.ImageHeight ?? data.ExifImageHeight ?? null;
      const xRes = data.XResolution ?? null;
      if (w && h) {
        const res = `${w}x${h}`;
        const isScreenRes = SCREEN_RESOLUTIONS.has(res);
        const isScreenDpi = xRes && (xRes === 72 || xRes === 96);
        if (isScreenRes && isScreenDpi) {
          isScreenshot = true;
          flags.push(`Screenshot heuristic: ${res} @ ${xRes}DPI, no camera Make/Model`);
        }
      }
    }

    // ── DateTime Analysis ──
    const dtOriginal =
      safeISOString(data.DateTimeOriginal) ??
      safeISOString(data.CreateDate) ??
      safeISOString(data.DateTimeDigitized) ??
      null;
    const dtModify = safeISOString(data.ModifyDate) ?? null;

    let timestampConsistent: boolean | null = null;
    if (dtOriginal && dtModify) {
      const diff = Math.abs(
        new Date(dtOriginal).getTime() - new Date(dtModify).getTime()
      );
      timestampConsistent = diff < 120_000; // 2-minute tolerance
      if (!timestampConsistent) {
        flags.push(
          `Timestamp mismatch: Created ${dtOriginal}, Modified ${dtModify} (Δ${Math.round(diff / 1000)}s)`
        );
      }
    }

    // ── Source Classification — Enhanced Forensic Detection ──
    let sourceType: ExifMetadata["sourceType"] = "unknown";
    let sourceVerdict = "Insufficient Metadata";

    // ── Staleness: photo older than 1 hour is suspicious for "real-time" claim ──
    let isStale = false;
    if (dtOriginal) {
      const createdMs = new Date(dtOriginal).getTime();
      const ageMs = Date.now() - createdMs;
      if (!isNaN(createdMs) && ageMs > 60 * 60 * 1000) {
        isStale = true;
        const ageHours = Math.round(ageMs / (60 * 60 * 1000));
        if (ageHours >= 24) {
          flags.push(`Photo taken ${Math.round(ageHours / 24)}d ago — not a recent capture`);
        } else {
          flags.push(`Photo taken ${ageHours}h ago — not a recent capture`);
        }
      }
    }

    // ── Web download heuristics: detect indicators of non-camera origin ──
    let isWebDownload = false;

    // 1) Check for stripped EXIF (common on web platforms)
    //    Real cameras always set ExifVersion, Flash, Orientation, SubSecTime
    const hasExifVersion = !!data.ExifVersion;
    const hasFlash = data.Flash !== undefined;
    const hasOrientation = data.Orientation !== undefined;
    const hasSubSecTime = !!data.SubSecTimeOriginal || !!data.SubSecTime || !!data.SubSecTimeDigitized;
    const hasFocalLength = data.FocalLength !== undefined || data.FocalLengthIn35mmFormat !== undefined;
    const hasExposure = data.ExposureTime !== undefined || data.FNumber !== undefined || data.ISOSpeedRatings !== undefined || data.ISO !== undefined;

    // Real phone/camera photos have most of these; web downloads often lose them
    const cameraIndicatorCount = [hasExifVersion, hasFlash, hasOrientation, hasSubSecTime, hasFocalLength, hasExposure]
      .filter(Boolean).length;

    if (make && model && cameraIndicatorCount < 2) {
      // Has Make/Model but missing most camera-specific EXIF fields
      // This happens when a web service re-encodes the image but preserves basic TIFF tags
      isWebDownload = true;
      flags.push("Device Make/Model present but camera fields (Flash, FocalLength, Exposure, SubSecTime) missing — likely web-processed");
    }

    // 2) JFIF/ICC-only images with no camera EXIF (common for web-optimized JPEGs)
    if (!make && !model && !hasExifVersion && !hasFocalLength && !hasExposure && (data.JFIFVersion || data.ProfileDescription)) {
      isWebDownload = true;
      flags.push("JFIF/ICC profile only, no camera EXIF — web-optimized image");
    }

    // ── Final classification ──
    if (isTampered || isSocialMedia || isScreenshot) {
      sourceType = "edited";
      sourceVerdict = isScreenshot
        ? "Non-Original / Screenshot"
        : isSocialMedia
          ? "Non-Original / Social Media Download"
          : "Non-Original / External Source";
    } else if (isWebDownload) {
      sourceType = "edited";
      sourceVerdict = "Non-Original / Web Download";
    } else if (isStale && !make) {
      // Old photo with no camera info — almost certainly from the internet
      sourceType = "edited";
      sourceVerdict = "Non-Original / Stale + No Device";
    } else if (make && model && dtOriginal && !isStale && !isWebDownload) {
      // Has hardware signature + recent creation timestamp + full camera EXIF
      if (lat !== null && lng !== null) {
        sourceType = "real-time";
        sourceVerdict = "Verified Authentic";
      } else {
        sourceType = "real-time";
        sourceVerdict = "Verified Device — GPS Missing (Incomplete)";
        flags.push("Device verified but GPS absent — location cannot be confirmed");
      }
    } else if (make && model && dtOriginal && isStale) {
      // Has full camera info but photo is old — not captured just now
      sourceType = "unknown";
      sourceVerdict = "Valid Device — Stale Capture (Not Recent)";
      flags.push("Photo has valid camera data but is not a recent capture");
    } else if (lat !== null && lng !== null && dtOriginal) {
      sourceType = "unknown";
      sourceVerdict = "Unverified Device — GPS Present";
      flags.push("GPS data found but no device hardware signature");
    } else {
      sourceVerdict = "Insufficient Metadata";
      if (!dtOriginal) flags.push("No creation timestamp");
    }

    return {
      gpsLatitude: typeof lat === "number" ? lat : null,
      gpsLongitude: typeof lng === "number" ? lng : null,
      gpsAltitude: typeof alt === "number" ? alt : null,
      gpsDirection: typeof dir === "number" ? dir : null,
      gpsTimestamp: gpsTs,
      deviceMake: make,
      deviceModel: model,
      software: sw ?? xmpCreator,
      isTampered,
      tamperReason,
      sourceType,
      dateTimeOriginal: dtOriginal,
      modifyDate: dtModify,
      isScreenshot,
      isSocialMedia,
      forensicFlags: flags,
      sourceVerdict,
      deviceSignature,
      timestampConsistent,
      raw: data,
    };
  } catch (err) {
    console.warn("[ExifExtractor] Failed to parse EXIF:", err);
    empty.forensicFlags = ["EXIF parsing error — raw data may be corrupted"];
    return empty;
  }
}

/** Safely convert a Date-or-string EXIF value to ISO string */
function safeISOString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return String(value);
}

/**
 * Extract EXIF metadata from a base64-encoded image string.
 * Used to re-extract forensic data from images stored in the backend
 * (the backend stores raw file bytes so EXIF headers are preserved).
 */
export async function extractExifFromBase64(
  base64: string,
  contentType = "image/jpeg"
): Promise<ExifMetadata> {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: contentType });
  const file = new File([blob], "photo.jpg", { type: contentType });
  return extractExifMetadata(file);
}

/**
 * Get a human-readable device string from EXIF data.
 */
export function getDeviceString(meta: ExifMetadata): string {
  if (meta.deviceMake && meta.deviceModel) {
    // Avoid duplicates like "Apple Apple iPhone 15"
    if (meta.deviceModel.toLowerCase().startsWith(meta.deviceMake.toLowerCase())) {
      return meta.deviceModel;
    }
    return `${meta.deviceMake} ${meta.deviceModel}`;
  }
  if (meta.deviceModel) return meta.deviceModel;
  if (meta.deviceMake) return meta.deviceMake;
  return "Unknown Device — ⚠ High Risk";
}

/**
 * Get a compass direction string from a bearing angle.
 */
export function getBearingString(degrees: number | null): string {
  if (degrees === null || degrees === undefined) return "No Bearing — ⚠ High Risk";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(degrees / 22.5) % 16;
  return `${dirs[idx]} (${degrees.toFixed(1)}°)`;
}

/**
 * Build an ExifMetadata from partial photo data (stored fields).
 * Used in DPWHProjectEngineerDashboard and other views that reconstruct EXIF from stored fields
 * so metadata is ALWAYS available — never null.
 */
export function buildExifFromPhotoData(photo: {
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  gpsAltitude?: number | null;
  gpsDirection?: number | null;
  gpsTimestamp?: string | null;
  deviceMake?: string | null;
  deviceModel?: string | null;
  software?: string | null;
  isTampered?: boolean;
  tamperReason?: string | null;
  sourceType?: "real-time" | "edited" | "unknown";
  dateTimeOriginal?: string | null;
  forensicFlags?: string[];
  sourceVerdict?: string;
  deviceSignature?: string | null;
  exifRaw?: Record<string, unknown>;
}): ExifMetadata {
  const st = photo.sourceType ?? "unknown";
  const hasGps = photo.gpsLatitude != null && photo.gpsLongitude != null
    && photo.gpsLatitude !== 0 && photo.gpsLongitude !== 0;

  // Derive flags if not provided
  const flags: string[] = photo.forensicFlags?.length
    ? [...photo.forensicFlags]
    : [];
  if (!hasGps && flags.length === 0) {
    flags.push("GPS missing — Incomplete Documentation");
  }
  if (!photo.deviceMake && !photo.deviceModel && flags.length === 0) {
    flags.push("No device Make/Model — cannot verify hardware origin");
  }

  return {
    gpsLatitude: photo.gpsLatitude ?? null,
    gpsLongitude: photo.gpsLongitude ?? null,
    gpsAltitude: photo.gpsAltitude ?? null,
    gpsDirection: photo.gpsDirection ?? null,
    gpsTimestamp: photo.gpsTimestamp ?? null,
    deviceMake: photo.deviceMake ?? null,
    deviceModel: photo.deviceModel ?? null,
    software: photo.software ?? null,
    isTampered: photo.isTampered ?? false,
    tamperReason: photo.tamperReason ?? null,
    sourceType: st,
    dateTimeOriginal: photo.dateTimeOriginal ?? null,
    modifyDate: null,
    isScreenshot: false,
    isSocialMedia: false,
    forensicFlags: flags,
    sourceVerdict: photo.sourceVerdict
      ?? (st === "real-time" ? "Verified Authentic"
        : st === "edited" ? "Non-Original / External Source"
        : "Insufficient Metadata"),
    deviceSignature: photo.deviceSignature
      ?? (photo.deviceMake && photo.deviceModel
        ? `${photo.deviceMake} ${photo.deviceModel}` : null),
    timestampConsistent: null,
    raw: photo.exifRaw ?? {},
  };
}

/**
 * Check GPS consistency across multiple photos against the first photo.
 * The first photo acts as the anchor — all subsequent photos are compared to it.
 */
export function checkCrossPhotoConsistency(
  photos: { id: string | number; lat: number; lng: number }[],
  toleranceMeters = 100
): PhotoConsistencyResult[] {
  if (photos.length === 0) return [];
  const anchor = photos[0];
  return photos.map((p) => {
    const dist = calculateDistance(anchor.lat, anchor.lng, p.lat, p.lng);
    const consistent = dist <= toleranceMeters;
    return {
      photoId: p.id,
      distanceFromFirst: dist,
      isConsistent: consistent,
      flag: consistent
        ? null
        : `${dist.toFixed(1)}m from Photo 1 (exceeds ${toleranceMeters}m tolerance)`,
    };
  });
}
