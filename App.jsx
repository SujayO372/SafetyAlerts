import React, { useState, useEffect, useRef } from "react";

/**
 * MapsCrimeAlerts.jsx
 * - Standalone React component (no NavBar)
 * - Allows location permission, renders a stylized map-like canvas,
 *   fetches anonymized crime/safety incidents via POST /api/crime (server proxy),
 *   falls back to demo data if unavailable.
 *
 * Important: For production, supply a secure server proxy for real crime data; do NOT put API keys client-side.
 */

export default function MapsCrimeAlerts() {
  const [currentStep, setCurrentStep] = useState("location"); // "location" | "map" | "results"
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [queryRadiusKm, setQueryRadiusKm] = useState(5);
  const [incidents, setIncidents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mapInitialized, setMapInitialized] = useState(false);

  const mapRef = useRef(null);
  const incidentsRef = useRef([]); // latest incidents for event handlers

  // initialize map when location/step changes
  useEffect(() => {
    if (location && (currentStep === "map" || currentStep === "results")) {
      initializeMap();
      fetchIncidents(location, queryRadiusKm).catch((e) => console.warn(e));
    } else {
      renderPlaceholder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, currentStep]);

  // re-render markers & attach listeners when incidents change
  useEffect(() => {
    if (!mapRef.current) return;
    renderMap(true);
    attachMarkerListeners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, queryRadiusKm]);

  const initializeMap = () => {
    if (mapRef.current && !mapInitialized) {
      renderMap(false);
      setMapInitialized(true);
    }
  };

  const renderPlaceholder = () => {
    const el = mapRef.current;
    if (!el) return;
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8">Map will render after you allow location</div>`;
  };

  const renderMap = (showIncidents = true) => {
    const el = mapRef.current;
    if (!el) return;

    if (!location) {
      el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8">Waiting for location...</div>`;
      return;
    }

    const markersHtml = showIncidents ? generateIncidentMarkersHtml() : "";

    el.innerHTML = `
      <div style="
        width:100%;height:100%;background:linear-gradient(180deg,#0b1226,#071127);
        position:relative;overflow:hidden;border-radius:10px;color:#e6eef8;font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial;
      ">
        <div style="position:absolute;top:12px;left:12px;background:rgba(255,255,255,0.95);color:#111827;padding:8px 10px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 6px 18px rgba(2,6,23,0.4)">
          Crime Alerts • Radius: ${queryRadiusKm} km
        </div>

        <div style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,0.06);color:#f8fafc;padding:8px 10px;border-radius:8px;font-size:12px;">
          ${new Date().toLocaleString()}
        </div>

        ${markersHtml}

        <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:900;text-align:center;">
          <div style="width:48px;height:48px;border-radius:50%;background:#ef4444;border:4px solid rgba(255,255,255,0.95);display:inline-flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(239,68,68,0.25);font-weight:700;color:white">YOU</div>
          <div style="margin-top:10px;color:#f8fafc;font-size:12px;opacity:0.95">Approx. location</div>
        </div>

        <div style="position:absolute;bottom:12px;left:12px;background:rgba(255,255,255,0.06);color:#fff;padding:8px 10px;border-radius:8px;font-size:12px;">
          <strong style="color:#ffe4e6">Safety:</strong> Do NOT approach suspects. Call authorities for immediate threats.
        </div>
      </div>

      <style>
        .crime-marker { transition: transform 150ms ease, box-shadow 150ms ease; cursor: pointer; }
        .crime-marker:hover { transform: translateY(-6px); box-shadow: 0 10px 30px rgba(2,6,23,0.45); }
      </style>
    `;
  };

  // compute percent positions for markers relative to center (approximate)
  const latLngToPercent = (lat, lng) => {
    if (!location) return { left: 50, top: 50 };

    const dLat = lat - location.lat;
    const dLng = lng - location.lng;

    const kmPerLat = 111;
    const kmPerLng = 111 * Math.cos((location.lat * Math.PI) / 180);

    const kmX = dLng * kmPerLng;
    const kmY = dLat * kmPerLat;

    // map: queryRadiusKm corresponds to ~40% of canvas radius
    const scaleFactor = 40 / Math.max(1, queryRadiusKm); // km -> percent
    const leftPercent = 50 + kmX * scaleFactor;
    const topPercent = 50 - kmY * scaleFactor; // north is up

    const clamp = (v) => Math.max(6, Math.min(94, v));
    return { left: clamp(leftPercent), top: clamp(topPercent) };
  };

  const generateIncidentMarkersHtml = () => {
    if (!incidents || incidents.length === 0) return "";
    return incidents
      .map((inc) => {
        const pos = latLngToPercent(inc.lat, inc.lng);
        const color = severityColor(inc.severity || "low");
        const timeAgo = timeSince(new Date(inc.time));
        const safeType = escapeHtml(inc.type || "incident");
        return `
          <div class="crime-marker" data-incident-id="${inc.id}" style="position:absolute;left:${pos.left}%;top:${pos.top}%;transform:translate(-50%,-50%);z-index:800;">
            <div style="width:42px;height:42px;border-radius:50%;background:${color};border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;box-shadow:0 6px 18px rgba(2,6,23,0.4)">
              ${safeType.charAt(0).toUpperCase()}
            </div>
            <div style="margin-top:6px;background:rgba(2,6,23,0.75);color:#e6eef8;padding:6px 8px;border-radius:8px;font-size:12px;white-space:nowrap;">
              ${safeType} • ${timeAgo}
            </div>
          </div>
        `;
      })
      .join("");
  };

  // attach click listeners to markers after DOM insertion
  const attachMarkerListeners = () => {
    const el = mapRef.current;
    if (!el) return;
    const markers = el.querySelectorAll("[data-incident-id]");
    markers.forEach((node) => {
      const id = node.getAttribute("data-incident-id");
      node.onclick = null;
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        const inc = incidentsRef.current.find((x) => String(x.id) === String(id));
        if (inc) showIncidentModal(inc);
      });
    });
  };

  // fetch incidents via proxy; fallback to demo data
  const fetchIncidents = async (loc, radiusKm = 5) => {
    if (!loc) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/crime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: loc.lat, lng: loc.lng, radius_km: radiusKm }),
      });

      let data;
      if (res.ok) {
        data = await res.json();
      } else {
        console.warn("Proxy returned non-OK:", res.status);
        data = generateDemoIncidents(loc, radiusKm);
      }

      const normalized = Array.isArray(data) ? data : [];
      incidentsRef.current = normalized;
      setIncidents(normalized);
      setCurrentStep("results");
      setTimeout(() => {
        renderMap(true);
        attachMarkerListeners();
      }, 60);
    } catch (err) {
      console.error("fetchIncidents error:", err);
      const demo = generateDemoIncidents(loc, radiusKm);
      incidentsRef.current = demo;
      setIncidents(demo);
      setCurrentStep("results");
      setTimeout(() => {
        renderMap(true);
        attachMarkerListeners();
      }, 60);
    } finally {
      setIsLoading(false);
    }
  };

  const generateDemoIncidents = (loc, radiusKm) => {
    const types = ["theft", "assault", "burglary", "vandalism", "robbery", "suspicious"];
    const severities = ["low", "medium", "high"];
    const arr = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distKm = Math.random() * Math.min(radiusKm, 8);
      const dLat = (distKm / 111) * Math.cos(angle);
      const dLng = (distKm / (111 * Math.cos((loc.lat * Math.PI) / 180))) * Math.sin(angle);
      arr.push({
        id: `demo-${Date.now()}-${i}`,
        type: types[Math.floor(Math.random() * types.length)],
        description: "Public, anonymized report.",
        lat: loc.lat + dLat,
        lng: loc.lng + dLng,
        time: new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24).toISOString(),
        severity: severities[Math.floor(Math.random() * severities.length)],
        source: "demo",
      });
    }
    return arr;
  };

  const requestLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCurrentStep("map");
        console.log("Location obtained:", pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        console.error("Geolocation error:", err);
        let msg = "An unknown error occurred while retrieving your location.";
        if (err.code === err.PERMISSION_DENIED) msg = "Location access was denied. Please enable location services and refresh.";
        if (err.code === err.POSITION_UNAVAILABLE) msg = "Location information is unavailable. Please try again.";
        if (err.code === err.TIMEOUT) msg = "Location request timed out. Please try again.";
        setLocationError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 600000 }
    );
  };

  const handleRadiusChange = (e) => {
    const v = Number(e.target.value || 1);
    setQueryRadiusKm(v);
  };

  const runRefresh = () => {
    if (!location) return;
    fetchIncidents(location, queryRadiusKm);
  };

  const showIncidentModal = (inc) => {
    const txt = `${capitalize(inc.type)} (${inc.severity.toUpperCase()})
Time: ${new Date(inc.time).toLocaleString()}
Source: ${inc.source || "Public report"}

NOTE: This is an aggregated, anonymized report. Do NOT approach suspects. If you are in immediate danger call emergency services (${getEmergencyNumber()}).

Details: ${inc.description || "No additional details."}`;
    alert(txt);
  };

  const resetSearch = () => {
    incidentsRef.current = [];
    setIncidents([]);
    setCurrentStep("map");
    setTimeout(() => renderMap(false), 80);
  };

  // ----- UI screens -----
  if (currentStep === "location") {
    return (
      <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(135deg,#0b1226,#071127)" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
          <div style={{ width: 560, background: "linear-gradient(180deg,#0b1226,#071127)", color: "white", padding: "2.2rem", borderRadius: 14, boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 8 }}>🚨 Community Safety Alerts</div>
            <p style={{ color: "#cbd5e1" }}>
              Allow location to display recent anonymized public reports near you.
            </p>

            {locationError && <div style={{ background: "#3f0d0d", color: "#fee2e2", padding: "0.9rem", borderRadius: 8, marginBottom: "1rem" }}>{locationError}</div>}

            <button type="button" onClick={requestLocation} style={{ width: "100%", padding: "0.9rem", fontSize: 16, borderRadius: 10, border: "none", background: "#ef4444", color: "white", fontWeight: 700 }}>
              Allow Location Access & Show Alerts
            </button>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="button" onClick={() => window.open("tel:" + getEmergencyNumber())} style={{ flex: 1, padding: "0.6rem", borderRadius: 8, border: "none", background: "#111827", color: "#fff" }}>
                Call Emergency: {getEmergencyNumber()}
              </button>
              <button type="button" onClick={() => window.open("https://www.ncjrs.gov/")} style={{ flex: 1, padding: "0.6rem", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "#fff" }}>
                Safety Resources
              </button>
            </div>

            <p style={{ color: "#94a3b8", marginTop: 14, fontSize: 13 }}>
              NOTE: If you are in immediate danger call your local emergency services. Do not attempt to approach suspects or share private personal data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === "map") {
    return (
      <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#071127,#041026)" }}>
        <div style={{ padding: "1rem", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 10, background: "#0b1226", color: "#fff", fontWeight: 700 }}>Nearby Alerts</div>
          <div style={{ color: "#cbd5e1" }}>Radius (km):</div>
          <input type="number" min="1" max="30" value={queryRadiusKm} onChange={handleRadiusChange} style={{ width: 84, padding: 8, borderRadius: 8, border: "1px solid #1f2937", background: "#020617", color: "white" }} />
          <button type="button" onClick={runRefresh} disabled={isLoading} style={{ marginLeft: "auto", padding: "8px 12px", borderRadius: 8, border: "none", background: isLoading ? "#374151" : "#ef4444", color: "white", fontWeight: 700 }}>
            {isLoading ? "Refreshing..." : "Refresh Incidents"}
          </button>
          <button type="button" onClick={() => { setCurrentStep("location"); setLocation(null); }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "#cbd5e1" }}>
            Reset Location
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", gap: 12, padding: "1.5rem" }}>
          <div style={{ flex: 2, borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 40px rgba(2,6,23,0.6)" }}>
            <div ref={mapRef} style={{ width: "100%", height: "100%", minHeight: 360, background: "#020617", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
              {!mapInitialized && "Rendering Map..."}
            </div>
          </div>

          <aside style={{ width: 360, borderRadius: 12, background: "#051025", color: "#cbd5e1", padding: 12, overflowY: "auto" }}>
            <h3 style={{ marginTop: 0, color: "#fff" }}>Recent Alerts</h3>
            <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>Tap any marker on the map (or list item) to view details and safety recommendations.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {incidents.length === 0 && <div style={{ color: "#94a3b8" }}>No recent public reports in this area.</div>}
              {incidents.map((inc) => (
                <div key={inc.id} onClick={() => showIncidentModal(inc)} style={{ background: "#071127", padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.03)", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>{capitalize(inc.type)}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{timeSince(new Date(inc.time))}</div>
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ padding: "6px 8px", borderRadius: 8, background: severityColor(inc.severity), color: "white", fontWeight: 700, fontSize: 12 }}>{inc.severity.toUpperCase()}</div>
                    <div style={{ color: "#9aa4b2", fontSize: 13 }}>{inc.source || "Public report"}</div>
                  </div>
                  <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 13 }}>{inc.description || "No additional details."}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, fontSize: 13, color: "#9aa4b2" }}>
              If you need immediate help: <strong style={{ color: "#fff" }}>{getEmergencyNumber()}</strong>. To report a non-emergency incident, contact your local police department.
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // results listing view (similar to map)
  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#071127,#041026)" }}>
      <div style={{ padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, color: "#fff" }}>Alerts in your area</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={runRefresh} style={{ padding: "8px 12px", borderRadius: 8, background: "#ef4444", color: "white", border: "none" }}>Refresh</button>
          <button type="button" onClick={resetSearch} style={{ padding: "8px 12px", borderRadius: 8, background: "#0b1226", color: "white", border: "1px solid rgba(255,255,255,0.04)" }}>Back</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", gap: 12, padding: 18 }}>
        <div style={{ flex: 1, borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 40px rgba(2,6,23,0.6)" }}>
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        </div>

        <aside style={{ width: 380, overflowY: "auto", background: "#051025", padding: 12, borderRadius: 12 }}>
          <h3 style={{ color: "#fff" }}>Incident List</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {incidents.map((inc) => (
              <div key={inc.id} style={{ background: "#071127", padding: 10, borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 800, color: "#fff" }}>{capitalize(inc.type)}</div>
                  <div style={{ color: "#9aa4b2" }}>{timeSince(new Date(inc.time))}</div>
                </div>
                <div style={{ marginTop: 6, color: "#9aa4b2" }}>{inc.description || "No additional details."}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function severityColor(sev) {
  if (sev === "high") return "#ef4444";
  if (sev === "medium") return "#f59e0b";
  return "#10b981";
}

function timeSince(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeHtml(unsafe) {
  return (unsafe || "").replace(/[&<>"'`=]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;", "=": "&#61;" }[c];
  });
}

function getEmergencyNumber() {
  return "911";
}
