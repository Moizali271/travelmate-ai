import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

const API_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const CATEGORIES = [
  { label: "All Places", value: "all" },
  { label: "Attractions", value: "attractions" },
  { label: "Museums", value: "museums" },
  { label: "Parks", value: "parks" },
  { label: "Beaches", value: "beaches" },
  { label: "Historic Sites", value: "historic" },
  { label: "Food", value: "food" },
];

const MODES = [
  { label: "🚗 Driving", value: "driving" },
  { label: "🚶 Walking", value: "walking" },
  { label: "🚴 Cycling", value: "cycling" },
];

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token")
  );
}

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

// Backend UTC time bina "Z" ke deta hai, isliye "Z" laga kar local date banate hain
function formatSavedDate(value) {
  const text = String(value);
  const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(text);
  return new Date(hasZone ? text : text + "Z").toLocaleDateString();
}

function modeLabel(value) {
  return MODES.find((item) => item.value === value)?.label || value;
}

function getMyLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Your browser does not support location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          name: "My Location",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      () =>
        reject(
          new Error(
            "Location access denied. Allow location or choose a start place from the list."
          )
        ),
      { timeout: 10000 }
    );
  });
}

function errorText(body, fallback) {
  if (body && typeof body.detail === "string") return body.detail;
  return fallback;
}

function MapCenter({ place }) {
  const map = useMap();

  useEffect(() => {
    if (place) {
      map.flyTo(
        [Number(place.lat), Number(place.lon)],
        13,
        { duration: 1 }
      );
    }
  }, [place, map]);

  return null;
}

function FitRoute({ route }) {
  const map = useMap();

  useEffect(() => {
    if (route && route.geometry.length > 1) {
      map.fitBounds(route.geometry, { padding: [40, 40] });
    }
  }, [route, map]);

  return null;
}

export default function MapPage() {
  const navigate = useNavigate();
  const mapRef = useRef(null);

  const [query, setQuery] = useState("Karachi");
  const [category, setCategory] = useState("all");
  const [places, setPlaces] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Route planner state
  const [startId, setStartId] = useState("my");
  const [mode, setMode] = useState("driving");
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Trip link + saved routes state
  const [trips, setTrips] = useState([]);
  const [tripId, setTripId] = useState("");
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState("");

  const startOptions = places.filter(
    (place) => place.id !== selected?.id
  );

  // Destination badalne par purana route hata do
  useEffect(() => {
    setRoute(null);
    setRouteError("");
    setSaveMsg("");
    setStartId("my");
  }, [selected]);

  // Mode ya start badalne par purana route hata do
  useEffect(() => {
    setRoute(null);
    setRouteError("");
    setSaveMsg("");
  }, [mode, startId]);

  // Page khulte hi trips aur saved routes load karo
  useEffect(() => {
    loadTrips();
    loadSavedRoutes();
  }, []);

  async function loadTrips() {
    try {
      const response = await fetch(`${API_URL}/api/trips`, {
        headers: authHeaders(),
      });
      if (!response.ok) return;
      const data = await response.json();
      setTrips(Array.isArray(data) ? data : []);
    } catch {
      setTrips([]);
    }
  }

  async function loadSavedRoutes() {
    setSavedLoading(true);
    setSavedError("");

    try {
      const response = await fetch(`${API_URL}/api/routes/saved`, {
        headers: authHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Please log in to see saved routes.");
        }
        const body = await response.json().catch(() => ({}));
        throw new Error(errorText(body, "Saved routes could not be loaded."));
      }

      const data = await response.json();
      setSavedRoutes(Array.isArray(data) ? data : []);
    } catch (err) {
      setSavedRoutes([]);
      setSavedError(err.message || "Saved routes could not be loaded.");
    } finally {
      setSavedLoading(false);
    }
  }

  async function searchPlaces(event) {
    event.preventDefault();

    if (query.trim().length < 2) {
      setError("Please enter at least 2 characters.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        category,
      });

      const token = getToken();

      const headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `${API_URL}/api/destinations/search?${params}`,
        { headers }
      );

      if (!response.ok) {
        if (
          response.status === 401 ||
          response.status === 403
        ) {
          throw new Error("Please log in again.");
        }

        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.detail || "Destination search failed."
        );
      }

      const data = await response.json();

      const results = (data.results || []).filter(
        (place) =>
          Number.isFinite(Number(place.lat)) &&
          Number.isFinite(Number(place.lon))
      );

      setPlaces(results);
      setSelected(results[0] || null);

      if (results.length === 0) {
        setError("No places found. Try another search.");
      }
    } catch (err) {
      setPlaces([]);
      setSelected(null);
      setError(
        err.message ||
          "Cannot connect to the backend. Check that FastAPI is running."
      );
    } finally {
      setLoading(false);
    }
  }

  function planTrip() {
    if (!selected) return;

    navigate("/planner", {
      state: {
        destination: selected.name,
      },
    });
  }

  async function calculateRoute() {
    if (!selected) return;

    setRouteLoading(true);
    setRouteError("");
    setSaveMsg("");

    try {
      let start;
      if (startId === "my") {
        start = await getMyLocation();
      } else {
        const place = places.find(
          (item) => String(item.id) === startId
        );
        if (!place) throw new Error("Start place not found.");
        start = {
          name: place.name,
          lat: Number(place.lat),
          lon: Number(place.lon),
        };
      }

      const end = {
        name: selected.name,
        lat: Number(selected.lat),
        lon: Number(selected.lon),
      };

      const payload = {
        start: { ...start, name: start.name.slice(0, 200) },
        end: { ...end, name: end.name.slice(0, 200) },
        mode,
      };

      const response = await fetch(
        `${API_URL}/api/routes/calculate`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Please log in again.");
        }
        const body = await response.json().catch(() => ({}));
        throw new Error(errorText(body, "Route could not be calculated."));
      }

      const data = await response.json();
      setRoute({
        ...data,
        start: payload.start,
        end: payload.end,
        saved: false,
      });
    } catch (err) {
      setRoute(null);
      setRouteError(err.message || "Route could not be calculated.");
    } finally {
      setRouteLoading(false);
    }
  }

  async function saveRoute() {
    if (!route || route.saved) return;

    setSaving(true);
    setSaveMsg("");

    try {
      const response = await fetch(`${API_URL}/api/routes/save`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          tripId: tripId || null,
          start: route.start,
          end: route.end,
          mode: route.mode,
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
          geometry: route.geometry,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Please log in again.");
        }
        const body = await response.json().catch(() => ({}));
        throw new Error(errorText(body, "Route could not be saved."));
      }

      setRoute((prev) => (prev ? { ...prev, saved: true } : prev));
      setSaveMsg("Route saved ✅");
      loadSavedRoutes();
    } catch (err) {
      setSaveMsg(err.message || "Route could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function showSavedRoute(item) {
    setRouteError("");
    setSaveMsg("");
    setRoute({
      id: item.id,
      mode: item.mode,
      distanceMeters: item.distanceMeters,
      durationSeconds: item.durationSeconds,
      geometry: item.geometry,
      start: item.start,
      end: item.end,
      saved: true,
    });
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteSavedRoute(item) {
    if (!window.confirm("Delete this saved route?")) return;

    try {
      const response = await fetch(
        `${API_URL}/api/routes/${item.id}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Please log in again.");
        }
        const body = await response.json().catch(() => ({}));
        throw new Error(errorText(body, "Route could not be deleted."));
      }

      setSavedRoutes((prev) => prev.filter((r) => r.id !== item.id));
      setRoute((prev) => (prev && prev.id === item.id ? null : prev));
    } catch (err) {
      setSavedError(err.message || "Route could not be deleted.");
    }
  }

  function tripTitle(id) {
    if (!id) return "";
    return trips.find((trip) => trip.id === id)?.title || "";
  }

  return (
    <div className="min-h-screen bg-white p-4 sm:p-6">
      <header className="rounded-2xl border border-[#D4AF37] bg-[#3B0718] p-6 text-white shadow-lg sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4AF37]">
          TravelMate AI
        </p>

        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
          Explore the World
        </h1>

        <p className="mt-3 leading-7 text-gray-200">
          Search destinations, explore map markers, and
          discover your next adventure.
        </p>
      </header>

      <section className="mt-6 rounded-2xl border border-[#D4AF37]/60 bg-[#FFFDF8] p-4 shadow-sm sm:p-6">
        <form
          onSubmit={searchPlaces}
          className="grid gap-3 sm:grid-cols-[1fr_190px_auto]"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a city, e.g. Karachi"
            className="min-w-0 rounded-xl border border-gray-300 bg-white px-4 py-3 text-[#3B0718] outline-none focus:border-[#D4AF37]"
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-[#3B0718]"
          >
            {CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-[#3B0718] px-6 py-3 font-bold text-[#D4AF37] hover:bg-[#701C35] disabled:opacity-60"
          >
            {loading ? "Searching..." : "Search Places"}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm text-gray-600">
          <span>{places.length} places found</span>
          <span>Map data © OpenStreetMap contributors</span>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <section
          ref={mapRef}
          className="overflow-hidden rounded-2xl border border-[#D4AF37] shadow-md"
        >
          <div className="bg-[#3B0718] px-5 py-4">
            <h2 className="font-bold text-white">
              Interactive Map
            </h2>
            <p className="mt-1 text-sm text-gray-200">
              Click a marker to view destination details.
            </p>
          </div>

          <MapContainer
            center={[24.8607, 67.0011]}
            zoom={11}
            scrollWheelZoom
            className="h-[420px] w-full sm:h-[520px]"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapCenter place={selected} />
            <FitRoute route={route} />

            {places.map((place) => (
              <Marker
                key={place.id}
                position={[
                  Number(place.lat),
                  Number(place.lon),
                ]}
                eventHandlers={{
                  click: () => setSelected(place),
                }}
              >
                <Popup>
                  <strong>{place.name}</strong>
                  <br />
                  {place.category || place.type || "Destination"}
                </Popup>
              </Marker>
            ))}

            {route && (
              <>
                <Polyline
                  positions={route.geometry}
                  pathOptions={{ color: "#701C35", weight: 5 }}
                />
                <CircleMarker
                  center={[route.start.lat, route.start.lon]}
                  radius={9}
                  pathOptions={{
                    color: "#FFFFFF",
                    weight: 3,
                    fillColor: "#16A34A",
                    fillOpacity: 1,
                  }}
                >
                  <Popup>Start: {route.start.name}</Popup>
                </CircleMarker>
                <CircleMarker
                  center={[route.end.lat, route.end.lon]}
                  radius={9}
                  pathOptions={{
                    color: "#FFFFFF",
                    weight: 3,
                    fillColor: "#D4AF37",
                    fillOpacity: 1,
                  }}
                >
                  <Popup>Destination: {route.end.name}</Popup>
                </CircleMarker>
              </>
            )}
          </MapContainer>
        </section>

        <aside className="overflow-hidden rounded-2xl border border-[#D4AF37]/60 bg-[#FFFDF8] shadow-sm">
          <div className="bg-[#3B0718] px-5 py-4">
            <h2 className="font-bold text-white">
              Destination Details
            </h2>
          </div>

          {selected ? (
            <div className="p-5">
              {selected.photo_url ? (
                <img
                  src={selected.photo_url}
                  alt={selected.name}
                  className="h-52 w-full rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl bg-[#F7EAC0] text-5xl">
                  🗺️
                </div>
              )}

              <span className="mt-4 inline-block rounded-full border border-[#D4AF37] bg-[#F7EAC0] px-3 py-1 text-xs font-bold text-[#3B0718]">
                {selected.category || selected.type || "Destination"}
              </span>

              <h3 className="mt-3 text-2xl font-bold text-[#3B0718]">
                {selected.name}
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-600">
                {selected.description ||
                  selected.display_name ||
                  "No description available."}
              </p>

              <div className="mt-4 rounded-xl border border-[#D4AF37]/50 bg-white p-4">
                <p className="font-bold text-[#3B0718]">
                  Coordinates
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Latitude: {Number(selected.lat).toFixed(5)}
                </p>
                <p className="text-sm text-gray-600">
                  Longitude: {Number(selected.lon).toFixed(5)}
                </p>
              </div>

              {selected.wiki_url && (
                <a
                  href={selected.wiki_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block font-semibold text-[#701C35] underline"
                >
                  Read more
                </a>
              )}

              <div className="mt-5 rounded-xl border border-[#D4AF37]/50 bg-white p-4">
                <p className="font-bold text-[#3B0718]">
                  Route Planner
                </p>

                <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Start from
                </label>
                <select
                  value={startId}
                  onChange={(e) => setStartId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-[#3B0718]"
                >
                  <option value="my">📍 My current location</option>
                  {startOptions.map((place) => (
                    <option key={place.id} value={String(place.id)}>
                      {place.name}
                    </option>
                  ))}
                </select>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {MODES.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      onClick={() => setMode(item.value)}
                      className={`rounded-lg border px-2 py-2 text-xs font-bold ${
                        mode === item.value
                          ? "border-[#D4AF37] bg-[#3B0718] text-[#D4AF37]"
                          : "border-gray-300 bg-white text-[#3B0718] hover:bg-[#F7EAC0]"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={calculateRoute}
                  disabled={routeLoading}
                  className="mt-3 block w-full rounded-xl bg-[#3B0718] px-4 py-3 text-center font-bold text-[#D4AF37] hover:bg-[#701C35] disabled:opacity-60"
                >
                  {routeLoading ? "Calculating..." : "Get Route"}
                </button>

                {routeError && (
                  <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {routeError}
                  </p>
                )}

                {route && (
                  <div className="mt-3 rounded-lg border border-[#D4AF37] bg-[#FFF8E5] p-3">
                    <p className="text-lg font-bold text-[#3B0718]">
                      {formatDistance(route.distanceMeters)} ·{" "}
                      {formatDuration(route.durationSeconds)}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      {route.start.name} → {route.end.name} (
                      {route.mode})
                    </p>

                    {!route.saved && (
                      <div className="mt-3">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Link to trip (optional)
                        </label>
                        <select
                          value={tripId}
                          onChange={(e) => setTripId(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#3B0718]"
                        >
                          <option value="">No trip (standalone)</option>
                          {trips.map((trip) => (
                            <option key={trip.id} value={trip.id}>
                              {trip.title}
                            </option>
                          ))}
                        </select>
                        {trips.length === 0 && (
                          <p className="mt-1 text-xs text-gray-500">
                            No trips yet. Create one in Trip Planner.
                          </p>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={saveRoute}
                      disabled={saving || route.saved}
                      className="mt-3 block w-full rounded-lg border border-[#D4AF37] bg-[#F7EAC0] px-3 py-2 text-sm font-bold text-[#3B0718] hover:bg-[#D4AF37] disabled:opacity-60"
                    >
                      {saving
                        ? "Saving..."
                        : route.saved
                        ? "Saved ✅"
                        : "Save Route"}
                    </button>

                    {saveMsg && (
                      <p className="mt-2 text-sm font-semibold text-[#701C35]">
                        {saveMsg}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={planTrip}
                className="mt-5 block w-full rounded-xl border border-[#D4AF37] bg-[#F7EAC0] px-4 py-3 text-center font-bold text-[#3B0718] hover:bg-[#D4AF37]"
              >
                ✦ Plan a Trip to This Place
              </button>

              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lon}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block rounded-xl bg-[#3B0718] px-4 py-3 text-center font-bold text-[#D4AF37] hover:bg-[#701C35]"
              >
                Open Directions
              </a>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="text-5xl">📍</div>
              <h3 className="mt-4 font-bold text-[#3B0718]">
                Discover a Place
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Search for a destination to see its details here.
              </p>
            </div>
          )}
        </aside>
      </div>

      {places.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl font-bold text-[#3B0718]">
            Search Results
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {places.map((place) => (
              <button
                type="button"
                key={place.id}
                onClick={() => setSelected(place)}
                className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                  selected?.id === place.id
                    ? "border-[#D4AF37] bg-[#FFF8E5]"
                    : "border-gray-200 bg-white"
                }`}
              >
                <h3 className="font-bold text-[#3B0718]">
                  {place.name}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                  {place.display_name ||
                    place.description ||
                    "Destination"}
                </p>
                <p className="mt-3 text-xs font-semibold text-[#701C35]">
                  View on map →
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-bold text-[#3B0718]">
            Saved Routes
          </h2>
          <button
            type="button"
            onClick={loadSavedRoutes}
            disabled={savedLoading}
            className="rounded-lg border border-[#D4AF37] bg-[#F7EAC0] px-3 py-1 text-sm font-bold text-[#3B0718] hover:bg-[#D4AF37] disabled:opacity-60"
          >
            {savedLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {savedError && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {savedError}
          </p>
        )}

        {!savedError && !savedLoading && savedRoutes.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed border-[#D4AF37]/60 bg-[#FFFDF8] p-6 text-center text-sm text-gray-600">
            No saved routes yet. Get a route and press Save Route.
          </p>
        )}

        {savedRoutes.length > 0 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {savedRoutes.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-[#B38B16]">
                  {modeLabel(item.mode)}
                </p>

                <h3 className="mt-2 font-bold text-[#3B0718]">
                  {item.start.name} → {item.end.name}
                </h3>

                <p className="mt-2 text-lg font-bold text-[#701C35]">
                  {formatDistance(item.distanceMeters)} ·{" "}
                  {formatDuration(item.durationSeconds)}
                </p>

                {tripTitle(item.tripId) && (
                  <span className="mt-2 inline-block rounded-full border border-[#D4AF37] bg-[#F7EAC0] px-3 py-1 text-xs font-bold text-[#3B0718]">
                    Trip: {tripTitle(item.tripId)}
                  </span>
                )}

                {item.createdAt && (
                  <p className="mt-2 text-xs text-gray-500">
                    Saved on {formatSavedDate(item.createdAt)}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => showSavedRoute(item)}
                    className="rounded-lg bg-[#3B0718] px-3 py-2 text-sm font-bold text-[#D4AF37] hover:bg-[#701C35]"
                  >
                    Show on map
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSavedRoute(item)}
                    className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-10 border-t-2 border-[#D4AF37] py-6 text-center">
        <p className="font-bold text-[#3B0718]">
          TravelMate <span className="text-[#B38B16]">AI</span>
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Discover places. Plan smarter. Travel better.
        </p>
        <p className="mt-3 text-sm font-semibold text-[#701C35]">
          Design by Mohammad Shoaib Khan
        </p>
      </footer>
    </div>
  );
}