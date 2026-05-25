import { calculateDistance } from "@/shared/lib/utils";

// ── GEOFENCE RADIUS (meters) ──
export const GEOFENCE_RADIUS_M = 50;

/**
 * Check whether a GPS coordinate is within the allowed radius of the project anchor.
 * Returns { withinRadius, distance }.
 */
export function checkGeofence(
  anchorLat: number,
  anchorLng: number,
  photoLat: number,
  photoLng: number,
  maxRadius: number = GEOFENCE_RADIUS_M
): { withinRadius: boolean; distance: number } {
  const distance = calculateDistance(anchorLat, anchorLng, photoLat, photoLng);
  return { withinRadius: distance <= maxRadius, distance };
}

/**
 * Extract GPS from a JPEG/image EXIF data (latitude, longitude).
 * Uses the browser's built-in capability via FileReader.
 * Falls back to null if no EXIF GPS available.
 */
export async function extractGpsFromExif(
  file: File
): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) { resolve(null); return; }

      try {
        const view = new DataView(buffer);
        // Check JPEG SOI marker
        if (view.getUint16(0) !== 0xffd8) { resolve(null); return; }

        let offset = 2;
        while (offset < view.byteLength - 1) {
          const marker = view.getUint16(offset);
          offset += 2;

          // APP1 marker = EXIF
          if (marker === 0xffe1) {
            const length = view.getUint16(offset);
            const exifData = parseExifGPS(view, offset + 2, length - 2);
            resolve(exifData);
            return;
          }

          // Skip other markers
          if ((marker & 0xff00) === 0xff00) {
            offset += view.getUint16(offset);
          } else {
            break;
          }
        }
        resolve(null);
      } catch {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file.slice(0, 128 * 1024)); // Read first 128KB for EXIF
  });
}

function parseExifGPS(
  _view: DataView,
  _offset: number,
  _length: number
): { lat: number; lng: number } | null {
  // Simplified — full EXIF parsing is complex.
  // In production, use a library like exif-js or piexifjs.
  // For this implementation, we rely on the GeoCamera component's live GPS.
  return null;
}

/**
 * Compute a SHA-256 hash of a materials list (for tamper detection).
 */
export async function hashMaterials(materials: string[]): Promise<string> {
  const text = materials.sort().join("|").toLowerCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate that a photo has GPS data.
 * Returns true if gpsLat/gpsLng are non-zero.
 */
export function hasValidGps(lat?: number, lng?: number): boolean {
  if (lat === undefined || lng === undefined) return false;
  return lat !== 0 || lng !== 0;
}

/**
 * Generate a location metadata string for blockchain storage.
 */
export function buildLocationMetadata(
  lat: number,
  lng: number,
  accuracy: number,
  timestamp: string,
  distanceFromSite?: number
): string {
  return JSON.stringify({
    latitude: lat,
    longitude: lng,
    accuracy: `${accuracy.toFixed(0)}m`,
    timestamp,
    distanceFromSite: distanceFromSite !== undefined ? `${distanceFromSite.toFixed(1)}m` : null,
    capturedAt: new Date().toISOString(),
  });
}
