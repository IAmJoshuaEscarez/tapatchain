// ════════════════════════════════════════════════════════════════════════════
// PhotoLocationMap — Interactive Leaflet map for GPS-tagged photo markers
// Shows project site + individual photo markers with geofence radius
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GEOFENCE_RADIUS_M } from "@/lib/geolocation";

export interface MapPhoto {
  id: string | number;
  label: string;
  lat: number;
  lng: number;
  bearing?: number | null;
  accuracy?: number | null;
  isOutsideGeofence: boolean;
  distanceFromSite: number;
}

interface PhotoLocationMapProps {
  /** Master GPS — project site anchor */
  siteLat: number;
  siteLng: number;
  /** Photos with GPS to plot on map */
  photos: MapPhoto[];
  /** Callback when user clicks a photo marker */
  onPhotoClick?: (id: string | number) => void;
  /** Height of the map container */
  height?: string;
  /** Selected photo to highlight */
  selectedPhotoId?: string | number | null;
}

export function PhotoLocationMap({
  siteLat,
  siteLng,
  photos,
  onPhotoClick,
  height = "320px",
  selectedPhotoId,
}: PhotoLocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const highlightColor = "#0DDDB0";

  // ── Initialize map ──
  // Depend on siteLat/siteLng so the map re-creates if the site coordinates change
  // (e.g. when a different milestone is selected)
  useEffect(() => {
    if (!mapRef.current) return;

    // Destroy previous instance if any (handles re-init on coordinate change)
    if (leafletMap.current) {
      leafletMap.current.remove();
      leafletMap.current = null;
      markersRef.current = null;
      setMapReady(false);
    }

    const map = L.map(mapRef.current, {
      center: [siteLat, siteLng],
      zoom: 18,
      zoomControl: true,
      attributionControl: false,
    });

    // Satellite tile layer (Esri World Imagery) — fallback to OSM street tiles below
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 22, attribution: "Tiles &copy; Esri" }
    ).addTo(map);
    // Light street label overlay so roads/names are readable on satellite
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 22, opacity: 0.65 }
    ).addTo(map);

    leafletMap.current = map;
    markersRef.current = L.layerGroup().addTo(map);
    setMapReady(true);

    // Leaflet needs invalidateSize when rendered inside collapsed/hidden containers
    const t1 = setTimeout(() => map.invalidateSize(), 200);
    const t2 = setTimeout(() => map.invalidateSize(), 600);
    const t3 = setTimeout(() => map.invalidateSize(), 1200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      map.remove();
      leafletMap.current = null;
      markersRef.current = null;
    };
    // Re-create when the site coordinates change (different milestone selected)
  }, [siteLat, siteLng]);

  // ── ResizeObserver: invalidate map when container becomes visible / resizes ──
  useEffect(() => {
    if (!mapRef.current || !leafletMap.current) return;
    const map = leafletMap.current;
    const container = mapRef.current;

    const ro = new ResizeObserver(() => {
      // Small delay to let layout settle before recalculating
      requestAnimationFrame(() => map.invalidateSize());
    });
    ro.observe(container);

    return () => ro.disconnect();
  }, [mapReady]);

  // ── Update markers when photos/site changes ──
  useEffect(() => {
    if (!leafletMap.current || !markersRef.current || !mapReady) return;
    const map = leafletMap.current;
    const group = markersRef.current;

    // Clear old markers
    group.clearLayers();

    // ── Site marker (teal primary — pulsing) ──
    const siteIcon = L.divIcon({
      className: "custom-site-marker",
      html: `<div style="
        width: 16px; height: 16px; background: ${highlightColor}; border: 3px solid white;
        border-radius: 50%; box-shadow: 0 0 8px rgba(13,221,176,0.6);
        animation: pulse 1.5s ease-in-out infinite;
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    L.marker([siteLat, siteLng], { icon: siteIcon })
      .bindPopup(`<b>Project Site</b><br/>${siteLat.toFixed(6)}, ${siteLng.toFixed(6)}`)
      .addTo(group);

    // ── Geofence circle ──
    L.circle([siteLat, siteLng], {
      radius: GEOFENCE_RADIUS_M,
      color: highlightColor,
      fillColor: highlightColor,
      fillOpacity: 0.08,
      weight: 2,
      dashArray: "6 4",
    }).addTo(group);

    // ── Photo markers ──
    const bounds = L.latLngBounds([[siteLat, siteLng]]);

    photos.forEach((photo) => {
      if (!photo.lat || !photo.lng) return;

      const isSelected = selectedPhotoId === photo.id;
      const markerColor = photo.isOutsideGeofence ? "#ef4444" : highlightColor;
      const size = isSelected ? 20 : 14;

      const photoIcon = L.divIcon({
        className: "custom-photo-marker",
        html: `<div style="
          width: ${size}px; height: ${size}px;
          background: ${markerColor};
          border: ${isSelected ? 4 : 2}px solid white;
          border-radius: 50%;
          box-shadow: 0 0 6px ${markerColor}80;
          cursor: pointer;
          ${isSelected ? "animation: pulse 1s ease-in-out infinite;" : ""}
        "></div>
        ${photo.bearing != null ? `<div style="
          position: absolute; top: -12px; left: 50%; transform: translateX(-50%) rotate(${photo.bearing}deg);
          width: 0; height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-bottom: 10px solid ${markerColor};
        "></div>` : ""}`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      // GPS accuracy circle — shows uncertainty radius
      if (photo.accuracy && photo.accuracy > 0) {
        L.circle([photo.lat, photo.lng], {
          radius: photo.accuracy,
          color: markerColor,
          fillColor: markerColor,
          fillOpacity: 0.06,
          weight: 1,
          dashArray: "3 3",
          interactive: false,
        }).addTo(group);
      }

      const marker = L.marker([photo.lat, photo.lng], { icon: photoIcon })
        .bindPopup(`
          <div style="font-size: 11px; line-height: 1.5;">
            <b>${photo.label}</b><br/>
            GPS: ${photo.lat.toFixed(6)}, ${photo.lng.toFixed(6)}<br/>
            ${photo.accuracy ? `Accuracy: ±${photo.accuracy.toFixed(0)}m<br/>` : ""}
            Distance: <span style="color: ${photo.isOutsideGeofence ? '#ef4444' : highlightColor}; font-weight: bold;">
              ${photo.distanceFromSite.toFixed(1)}m
            </span>
            ${photo.isOutsideGeofence ? " <b style='color:#ef4444'>⚠ OUTSIDE GEOFENCE</b>" : ""}
            ${photo.bearing != null ? `<br/>Bearing: ${photo.bearing.toFixed(1)}°` : ""}
          </div>
        `)
        .addTo(group);

      if (onPhotoClick) {
        marker.on("click", () => onPhotoClick(photo.id));
      }

      bounds.extend([photo.lat, photo.lng]);
    });

    // Fit map to show all markers
    if (photos.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    } else {
      map.setView([siteLat, siteLng], 18);
    }
  }, [siteLat, siteLng, photos, selectedPhotoId, onPhotoClick, mapReady]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-primary/20 shadow-sm bg-card">
      <div ref={mapRef} style={{ height, width: "100%", minHeight: "200px" }} className="z-0" />
      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-1000 flex items-center gap-4 bg-card/95 backdrop-blur-md rounded-lg px-4 py-2 border border-border shadow-sm text-[10px] font-medium text-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-white shadow" />
          <span>Project Site</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-primary/60 ring-2 ring-white shadow" />
          <span>Photo (OK)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] ring-2 ring-[#ef4444]/30 shadow" />
          <span>Outside {GEOFENCE_RADIUS_M}m</span>
        </div>
      </div>
      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
