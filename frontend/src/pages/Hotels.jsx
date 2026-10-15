import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

const API_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const TYPE_LABELS = {
  hotel: "Hotel",
  guest_house: "Guest House",
  hostel: "Hostel",
  motel: "Motel",
  apartment: "Apartment",
};

const TYPE_ICONS = {
  hotel: "🏨",
  guest_house: "🏡",
  hostel: "🛏️",
  motel: "🚗",
  apartment: "🏢",
};

const AMENITY_LABELS = {
  wifi: "📶 WiFi",
  pool: "🏊 Pool",
  ac: "❄️ AC",
  parking: "🅿️ Parking",
  wheelchair: "♿ Accessible",
};

const TYPE_FILTERS = [
  { label: "All types", value: "all" },
  { label: "Hotels", value: "hotel" },
  { label: "Guest Houses", value: "guest_house" },
  { label: "Hostels", value: "hostel" },
  { label: "Motels", value: "motel" },
  { label: "Apartments", value: "apartment" },
];

const STAR_FILTERS = [
  { label: "Any rating", value: "0" },
  { label: "3+ stars", value: "3" },
  { label: "4+ stars", value: "4" },
  { label: "5 stars", value: "5" },
];

const AMENITY_FILTERS = [
  { label: "Any amenities", value: "all" },
  { label: "WiFi", value: "wifi" },
  { label: "Pool", value: "pool" },
  { label: "AC", value: "ac" },
  { label: "Parking", value: "parking" },
  { label: "Accessible", value: "wheelchair" },
];

const SORTS = [
  { label: "Nearest first", value: "distance" },
  { label: "Highest stars", value: "stars" },
  { label: "Name (A-Z)", value: "name" },
];

const CURRENCIES = ["PKR", "USD", "EUR", "GBP", "AED", "SAR"];

function todayString() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function nightsBetween(checkIn, checkOut) {
  return Math.round(
    (new Date(checkOut) - new Date(checkIn)) / 86400000
  );
}

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token")
  );
}

function authHeaders() {
  const headers = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function errorText(body, fallback) {
  if (body && typeof body.detail === "string") return body.detail;
  return fallback;
}

function FitHotels({ hotels, center }) {
  const map = useMap();

  useEffect(() => {
    if (hotels.length > 0) {
      map.fitBounds(
        hotels.map((h) => [h.lat, h.lon]),
        { padding: [40, 40], maxZoom: 15 }
      );
    } else if (center) {
      map.setView([center.lat, center.lon], 12);
    }
  }, [hotels, center, map]);

  return null;
}

function FocusHotel({ hotel }) {
  const map = useMap();

  useEffect(() => {
    if (hotel) {
      map.flyTo([hotel.lat, hotel.lon], 16, { duration: 1 });
    }
  }, [hotel, map]);

  return null;
}

function HotelPhoto({ hotel }) {
  const [failed, setFailed] = useState(false);
  const showImage = hotel.image && !failed;

  return (
    <div className="relative h-40 w-full overflow-hidden rounded-xl bg-gradient-to-br from-[#3B0718] via-[#701C35] to-[#D4AF37]">
      {showImage ? (
        <img
          src={hotel.image}
          alt={hotel.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-5xl opacity-80">
          {TYPE_ICONS[hotel.type] || "🏨"}
        </div>
      )}

      {showImage && hotel.imageSource === "stock" && (
        <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
          Stock photo · Pexels
        </span>
      )}
    </div>
  );
}

export default function Hotels() {
  const navigate = useNavigate();
  const today = todayString();

  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("2");
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hotelError, setHotelError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [minStars, setMinStars] = useState("0");
  const [amenityFilter, setAmenityFilter] = useState("all");
  const [sort, setSort] = useState("distance");
  const [focused, setFocused] = useState(null);

  const [trips, setTrips] = useState([]);
  const [reserveHotel, setReserveHotel] = useState(null);
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [rooms, setRooms] = useState("1");
  const [pricePerNight, setPricePerNight] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [notes, setNotes] = useState("");
  const [tripId, setTripId] = useState("");
  const [saving, setSaving] = useState(false);
  const [reserveError, setReserveError] = useState("");
  const [booking, setBooking] = useState(null);

  useEffect(() => {
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
    loadTrips();
  }, []);

  useEffect(() => {
    if (!reserveHotel) return undefined;

    function onKey(event) {
      if (event.key === "Escape") closeReserve();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reserveHotel]);

  async function handleSearch(e) {
    e.preventDefault();
    setError("");
    setHotelError("");
    setSearched(false);
    setResult(null);
    setFocused(null);
    setReserveHotel(null);

    if (!destination.trim()) {
      setError("Please destination enter karein.");
      return;
    }

    if (!checkIn || !checkOut) {
      setError("Check-in aur check-out dono dates select karein.");
      return;
    }

    if (checkIn < today) {
      setError("Check-in date aaj ya future mein honi chahiye.");
      return;
    }

    if (checkOut <= checkIn) {
      setError("Check-out date, check-in date ke baad honi chahiye.");
      return;
    }

    setSearched(true);
    setLoading(true);

    try {
      const params = new URLSearchParams({
        q: destination.trim(),
        checkIn,
        checkOut,
        guests,
      });

      const response = await fetch(
        `${API_URL}/api/hotels/search?${params}`,
        { headers: authHeaders() }
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Please log in again.");
        }
        const body = await response.json().catch(() => ({}));
        throw new Error(
          errorText(body, "Please check the destination, dates and guests.")
        );
      }

      const data = await response.json();
      setResult(data);

      if (data.hotels.length === 0) {
        setHotelError(
          "OpenStreetMap data mein is area ke hotels nahi mile. Kisi bade shehar ko try karein ya neeche booking websites use karein."
        );
      }
    } catch (err) {
      setHotelError(
        err.message ||
          "Backend se rabta nahi ho saka. Check karein ke FastAPI chal raha hai."
      );
    } finally {
      setLoading(false);
    }
  }

  function openReserve(hotel) {
    setReserveHotel(hotel);
    setBooking(null);
    setReserveError("");
    setNotes("");
    setPricePerNight("");
    setRooms("1");
  }

  function closeReserve() {
    setReserveHotel(null);
    setBooking(null);
    setReserveError("");
  }

  async function submitReservation(e) {
    e.preventDefault();
    if (!reserveHotel || !result) return;

    setReserveError("");

    const name = guestName.trim();
    if (name.length < 2) {
      setReserveError("Guest ka naam likhein (kam az kam 2 characters).");
      return;
    }

    if (!/^[0-9+\-\s()]{7,20}$/.test(phone.trim())) {
      setReserveError("Phone number sahi likhein (7 se 20 digits).");
      return;
    }

    let price = null;
    if (pricePerNight !== "") {
      price = Number(pricePerNight);
      if (!Number.isFinite(price) || price < 0) {
        setReserveError("Price sahi number mein likhein.");
        return;
      }
    }

    setSaving(true);

    try {
      const response = await fetch(`${API_URL}/api/bookings`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: tripId || null,
          hotelId: reserveHotel.id,
          hotelName: reserveHotel.name,
          hotelType: reserveHotel.type,
          stars: reserveHotel.stars || null,
          lat: reserveHotel.lat,
          lon: reserveHotel.lon,
          address: reserveHotel.address || "",
          destination: result.destination.name,
          checkIn: result.checkIn,
          checkOut: result.checkOut,
          guests: Number(result.guests),
          rooms: Number(rooms),
          guestName: name,
          phone: phone.trim(),
          notes: notes.trim(),
          pricePerNight: price,
          currency,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Please log in again.");
        }
        const body = await response.json().catch(() => ({}));
        throw new Error(
          errorText(body, "Details check karein (naam, phone, price).")
        );
      }

      setBooking(await response.json());
    } catch (err) {
      setReserveError(
        err.message ||
          "Backend se rabta nahi ho saka. Check karein ke FastAPI chal raha hai."
      );
    } finally {
      setSaving(false);
    }
  }

  const visibleHotels = useMemo(() => {
    if (!result) return [];

    let list = result.hotels.filter((h) => {
      if (typeFilter !== "all" && h.type !== typeFilter) return false;
      if (Number(minStars) > 0 && (h.stars || 0) < Number(minStars)) {
        return false;
      }
      if (
        amenityFilter !== "all" &&
        !(h.amenities || []).includes(amenityFilter)
      ) {
        return false;
      }
      return true;
    });

    list = [...list];
    if (sort === "stars") {
      list.sort(
        (a, b) =>
          (b.stars || 0) - (a.stars || 0) || a.distanceKm - b.distanceKm
      );
    } else if (sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => a.distanceKm - b.distanceKm);
    }
    return list;
  }, [result, typeFilter, minStars, amenityFilter, sort]);

  const hasStockPhotos = useMemo(
    () =>
      !!result &&
      result.hotels.some((h) => h.imageSource === "stock" && h.image),
    [result]
  );

  const bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(
    destination.trim()
  )}${checkIn ? `&checkin=${checkIn}` : ""}${
    checkOut ? `&checkout=${checkOut}` : ""
  }&group_adults=${guests}&no_rooms=1`;

  const googleHotelsUrl = `https://www.google.com/travel/hotels?q=${encodeURIComponent(
    `hotels in ${destination.trim()}`
  )}`;

  const inputClass =
    "w-full rounded-xl border border-[#D4AF37]/50 bg-white p-3 text-[#24040E] outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/30";

  const selectSmallClass =
    "rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-[#3B0718]";

  const stayNights = result ? nightsBetween(result.checkIn, result.checkOut) : 0;
  const previewTotal =
    pricePerNight !== "" && Number(pricePerNight) >= 0
      ? Number(pricePerNight) * stayNights * Number(rooms)
      : null;

  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-[#D4AF37]/40 bg-[#3B0718] px-6 py-10 text-white shadow-lg sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full border border-[#D4AF37]/30" />

        <p className="mb-3 text-sm font-bold uppercase tracking-widest text-[#D4AF37]">
          TravelMate AI
        </p>

        <h1 className="text-3xl font-extrabold sm:text-5xl">
          Find Your Perfect Stay
        </h1>

        <p className="mt-4 max-w-2xl leading-7 text-gray-200">
          Apni destination choose karein, travel dates select karein
          aur available accommodation options explore karein.
        </p>

        <div className="mt-6 flex flex-wrap gap-3 text-sm text-[#F7EAC0]">
          <span>🏨 Hotels</span>
          <span>•</span>
          <span>📍 Destinations</span>
          <span>•</span>
          <span>🔎 Easy Search</span>
        </div>
      </section>

      {/* Search Form */}
      <section className="mt-8 rounded-2xl border border-[#D4AF37]/50 bg-[#FFFDF8] p-5 shadow-sm sm:p-8">
        <h2 className="text-2xl font-extrabold text-[#3B0718]">
          Search Hotels
        </h2>

        <p className="mt-2 text-sm text-gray-600">
          Destination aur apni stay details enter karein.
        </p>

        <form
          onSubmit={handleSearch}
          className="mt-6 grid gap-5 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="mb-2 block font-semibold text-[#3B0718]">
              Destination
            </label>

            <input
              className={inputClass}
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="City ya destination, jaise Karachi"
              required
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold text-[#3B0718]">
              Check-in
            </label>

            <input
              className={inputClass}
              type="date"
              min={today}
              value={checkIn}
              required
              onChange={(e) => {
                setCheckIn(e.target.value);

                if (checkOut && checkOut <= e.target.value) {
                  setCheckOut("");
                }
              }}
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold text-[#3B0718]">
              Check-out
            </label>

            <input
              className={inputClass}
              type="date"
              min={checkIn || today}
              value={checkOut}
              required
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold text-[#3B0718]">
              Guests
            </label>

            <select
              className={inputClass}
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
            >
              <option value="1">1 guest</option>
              <option value="2">2 guests</option>
              <option value="3">3 guests</option>
              <option value="4">4 guests</option>
              <option value="5">5 guests</option>
              <option value="6">6 guests</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl border border-[#D4AF37] bg-[#3B0718] p-3 font-bold text-white transition hover:bg-[#24040E] hover:text-[#D4AF37] disabled:opacity-60"
            >
              {loading ? "Searching..." : "🔎 Search Hotels"}
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      {/* Search Results */}
      {searched && (
        <section className="mt-8">
          <div className="mb-5">
            <p className="text-sm font-bold uppercase tracking-widest text-[#701C35]">
              Your Search
            </p>

            <h2 className="mt-1 text-2xl font-extrabold text-[#3B0718]">
              Hotels in {destination.trim()}
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              {checkIn} to {checkOut} · {guests} guests
            </p>
          </div>

          {loading && (
            <p className="rounded-xl border border-[#D4AF37]/50 bg-[#FFFDF8] p-4 text-sm text-gray-600">
              Hotels dhoond rahe hain... Pehli search 10 se 25 second
              le sakti hai.
            </p>
          )}

          {hotelError && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {hotelError}
            </p>
          )}

          {result && result.hotels.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className={selectSmallClass}
                >
                  {TYPE_FILTERS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>

                <select
                  value={minStars}
                  onChange={(e) => setMinStars(e.target.value)}
                  className={selectSmallClass}
                >
                  {STAR_FILTERS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>

                <select
                  value={amenityFilter}
                  onChange={(e) => setAmenityFilter(e.target.value)}
                  className={selectSmallClass}
                >
                  {AMENITY_FILTERS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>

                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className={selectSmallClass}
                >
                  {SORTS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm text-gray-600">
                <span>
                  {visibleHotels.length} of {result.hotels.length} places
                  shown
                </span>
                <span>Hotel data © OpenStreetMap contributors</span>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-[#D4AF37] shadow-md">
                <div className="bg-[#3B0718] px-5 py-4">
                  <h3 className="font-bold text-white">Hotels Map</h3>
                </div>

                <MapContainer
                  center={[result.destination.lat, result.destination.lon]}
                  zoom={12}
                  scrollWheelZoom
                  className="h-[360px] w-full sm:h-[440px]"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  <FitHotels
                    hotels={visibleHotels}
                    center={result.destination}
                  />
                  <FocusHotel hotel={focused} />

                  {visibleHotels.map((hotel) => (
                    <Marker
                      key={hotel.id}
                      position={[hotel.lat, hotel.lon]}
                    >
                      <Popup>
                        <strong>{hotel.name}</strong>
                        <br />
                        {TYPE_LABELS[hotel.type] || hotel.type}
                        {hotel.stars ? ` · ${hotel.stars}★` : ""}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>

              {visibleHotels.length === 0 && (
                <p className="mt-4 rounded-xl border border-dashed border-[#D4AF37]/60 bg-[#FFFDF8] p-6 text-center text-sm text-gray-600">
                  In filters ke saath koi hotel nahi mila. Filters badal
                  kar dekhein.
                </p>
              )}

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleHotels.map((hotel) => (
                  <div
                    key={hotel.id}
                    className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <HotelPhoto hotel={hotel} />

                    <div className="mt-3 flex items-start justify-between gap-2">
                      <span className="rounded-full border border-[#D4AF37] bg-[#F7EAC0] px-3 py-1 text-xs font-bold text-[#3B0718]">
                        {TYPE_LABELS[hotel.type] || hotel.type}
                      </span>
                      {hotel.stars ? (
                        <span className="text-sm font-bold text-[#B38B16]">
                          {"★".repeat(hotel.stars)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">
                          Not rated
                        </span>
                      )}
                    </div>

                    <h3 className="mt-3 font-bold text-[#3B0718]">
                      {hotel.name}
                    </h3>

                    <p className="mt-1 text-sm text-gray-600">
                      {hotel.distanceKm} km from {result.destination.name}{" "}
                      center
                    </p>

                    {hotel.address && (
                      <p className="mt-1 text-sm text-gray-600">
                        {hotel.address}
                      </p>
                    )}

                    {hotel.phone && (
                      <p className="mt-1 text-sm text-gray-600">
                        📞 {hotel.phone}
                      </p>
                    )}

                    {hotel.amenities && hotel.amenities.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {hotel.amenities.map((a) => (
                          <span
                            key={a}
                            className="rounded-full bg-[#FFFDF8] px-2.5 py-1 text-xs font-semibold text-[#3B0718] ring-1 ring-[#D4AF37]/50"
                          >
                            {AMENITY_LABELS[a] || a}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-gray-400">
                        Amenities: data available nahi
                      </p>
                    )}

                    <p className="mt-3 text-sm font-semibold text-[#701C35]">
                      Price: check on Booking.com
                    </p>

                    <div className="mt-4 grid gap-2">
                      <button
                        type="button"
                        onClick={() => openReserve(hotel)}
                        className="rounded-lg bg-[#3B0718] px-3 py-2 text-center text-sm font-bold text-[#D4AF37] hover:bg-[#701C35]"
                      >
                        ✦ Reserve Stay
                      </button>

                      <a
                        href={hotel.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-[#D4AF37] bg-white px-3 py-2 text-center text-sm font-bold text-[#3B0718] hover:bg-[#F7EAC0]"
                      >
                        Check price on Booking.com ↗
                      </a>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFocused(hotel)}
                          className="rounded-lg border border-[#D4AF37] bg-[#F7EAC0] px-3 py-2 text-sm font-bold text-[#3B0718] hover:bg-[#D4AF37]"
                        >
                          Show on map
                        </button>
                        <a
                          href={hotel.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-sm font-bold text-[#3B0718] hover:bg-gray-50"
                        >
                          Google Maps
                        </a>
                      </div>

                      {hotel.website && (
                        <a
                          href={
                            /^https?:\/\//.test(hotel.website)
                              ? hotel.website
                              : `https://${hotel.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-center text-sm font-semibold text-[#701C35] underline"
                        >
                          Hotel website
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {hasStockPhotos && (
                <p className="mt-4 text-xs text-gray-500">
                  "Stock photo" wali tasveerein illustration ke liye hain,
                  asal hotel ki nahi. Photos provided by{" "}
                  <a
                    href="https://www.pexels.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Pexels
                  </a>
                  .
                </p>
              )}
            </>
          )}

          {/* Compare prices on booking websites */}
          <h3 className="mt-10 text-xl font-extrabold text-[#3B0718]">
            Compare Prices
          </h3>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <article className="rounded-2xl border border-[#D4AF37]/50 bg-white p-6 shadow-sm transition hover:shadow-lg">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F7EAC0] text-3xl">
                🏨
              </div>

              <h3 className="mt-4 text-xl font-extrabold text-[#3B0718]">
                Booking.com
              </h3>

              <p className="mt-2 leading-6 text-gray-600">
                Destination ke accommodation options, guest reviews
                aur available rates check karein.
              </p>

              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 block rounded-xl border border-[#D4AF37] bg-[#3B0718] px-4 py-3 text-center font-bold text-white transition hover:bg-[#24040E] hover:text-[#D4AF37]"
              >
                Explore Hotels ↗
              </a>
            </article>

            <article className="rounded-2xl border border-[#D4AF37]/50 bg-white p-6 shadow-sm transition hover:shadow-lg">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F7EAC0] text-3xl">
                🌍
              </div>

              <h3 className="mt-4 text-xl font-extrabold text-[#3B0718]">
                Google Hotels
              </h3>

              <p className="mt-2 leading-6 text-gray-600">
                Different accommodation options aur available
                hotel prices ko compare karne ke liye search karein.
              </p>

              <a
                href={googleHotelsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 block rounded-xl border border-[#D4AF37] bg-[#F7EAC0] px-4 py-3 text-center font-bold text-[#3B0718] transition hover:bg-[#D4AF37]"
              >
                Compare Hotels ↗
              </a>
            </article>
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Note: Hotels ki list OpenStreetMap se aati hai, isliye kuch
            hotels, stars ya amenities missing ho sakte hain. Live prices,
            availability, taxes aur ratings booking websites par check
            karein.
          </p>
        </section>
      )}

      {/* Quick Destinations */}
      <section className="mt-10">
        <h2 className="text-2xl font-extrabold text-[#3B0718]">
          Popular Destinations
        </h2>

        <p className="mt-2 text-gray-600">
          Kisi destination ko select karke hotel search shuru karein.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { name: "Karachi", emoji: "🌊" },
            { name: "Lahore", emoji: "🏛️" },
            { name: "Islamabad", emoji: "⛰️" },
            { name: "Hunza", emoji: "🏔️" },
            { name: "Skardu", emoji: "🏞️" },
          ].map((place) => (
            <button
              key={place.name}
              type="button"
              onClick={() => {
                setDestination(place.name);
                setSearched(false);
                setResult(null);
                setHotelError("");
                setError("");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="rounded-2xl border border-[#D4AF37]/40 bg-[#FFFDF8] p-5 text-left transition hover:-translate-y-1 hover:border-[#D4AF37] hover:shadow-md"
            >
              <span className="text-3xl">{place.emoji}</span>

              <p className="mt-3 font-bold text-[#3B0718]">
                {place.name}
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Search stays →
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-12 border-t-2 border-[#D4AF37] py-6 text-center">
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

      {/* Reserve Stay popup */}
      {reserveHotel && result && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          onClick={closeReserve}
        >
          <div
            className="my-auto w-full max-w-lg rounded-2xl border border-[#D4AF37] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3 rounded-t-2xl bg-[#3B0718] px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]">
                  {booking ? "Reservation request sent" : "Reserve Stay"}
                </p>
                <h3 className="mt-1 font-bold text-white">
                  {reserveHotel.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeReserve}
                className="rounded-lg px-2 text-2xl leading-none text-white hover:text-[#D4AF37]"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {booking ? (
              <div className="p-5">
                <div className="rounded-xl border border-[#D4AF37] bg-[#FFF8E5] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    Reference
                  </p>
                  <p className="text-2xl font-extrabold text-[#3B0718]">
                    {booking.reference}
                  </p>
                  <p className="mt-2 text-sm text-gray-700">
                    {booking.checkIn} → {booking.checkOut} ·{" "}
                    {booking.nights} night{booking.nights > 1 ? "s" : ""} ·{" "}
                    {booking.rooms} room{booking.rooms > 1 ? "s" : ""} ·{" "}
                    {booking.guests} guest{booking.guests > 1 ? "s" : ""}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    Status:{" "}
                    <span className="font-bold text-[#701C35]">
                      Requested
                    </span>
                  </p>
                  {booking.totalPrice !== null &&
                    booking.totalPrice !== undefined && (
                      <p className="mt-1 text-sm text-gray-700">
                        Estimated total:{" "}
                        <span className="font-bold">
                          {booking.currency} {booking.totalPrice}
                        </span>
                      </p>
                    )}
                </div>

                <p className="mt-4 rounded-lg bg-[#FFFDF8] p-3 text-sm leading-6 text-gray-600">
                  Ye ek <strong>reservation request</strong> hai aur app
                  mein koi payment nahi hoti. Asal booking confirm karne
                  ke liye Booking.com par complete karein, phir My
                  Bookings mein confirmation number daal dein.
                </p>

                <div className="mt-4 grid gap-2">
                  <a
                    href={reserveHotel.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-[#3B0718] px-4 py-3 text-center font-bold text-[#D4AF37] hover:bg-[#701C35]"
                  >
                    Complete on Booking.com ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => navigate("/bookings")}
                    className="rounded-xl border border-[#D4AF37] bg-[#F7EAC0] px-4 py-3 font-bold text-[#3B0718] hover:bg-[#D4AF37]"
                  >
                    View My Bookings
                  </button>
                  <button
                    type="button"
                    onClick={closeReserve}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-[#3B0718] hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitReservation} className="p-5">
                <div className="rounded-xl border border-[#D4AF37]/50 bg-[#FFFDF8] p-3 text-sm text-gray-700">
                  <p>
                    📅 {result.checkIn} → {result.checkOut} ·{" "}
                    {stayNights} night{stayNights > 1 ? "s" : ""}
                  </p>
                  <p className="mt-1">
                    👥 {result.guests} guest{result.guests > 1 ? "s" : ""}{" "}
                    · 📍 {result.destination.name}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Dates badalni hon to search dobara karein.
                  </p>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-[#3B0718]">
                      Guest name
                    </label>
                    <input
                      className={inputClass}
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Poora naam"
                      maxLength={100}
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-[#3B0718]">
                      Phone
                    </label>
                    <input
                      className={inputClass}
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+92 300 1234567"
                      maxLength={20}
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-[#3B0718]">
                      Rooms
                    </label>
                    <select
                      className={inputClass}
                      value={rooms}
                      onChange={(e) => setRooms(e.target.value)}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={String(n)}>
                          {n} room{n > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-[#3B0718]">
                      Link to trip (optional)
                    </label>
                    <select
                      className={inputClass}
                      value={tripId}
                      onChange={(e) => setTripId(e.target.value)}
                    >
                      <option value="">No trip</option>
                      {trips.map((trip) => (
                        <option key={trip.id} value={trip.id}>
                          {trip.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-semibold text-[#3B0718]">
                      Price per night (optional)
                    </label>
                    <div className="grid grid-cols-[1fr_110px] gap-2">
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="any"
                        value={pricePerNight}
                        onChange={(e) => setPricePerNight(e.target.value)}
                        placeholder="Jo Booking.com par dekhi"
                      />
                      <select
                        className={inputClass}
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    {previewTotal !== null && (
                      <p className="mt-1 text-xs text-gray-600">
                        Estimated total: {currency} {previewTotal} (
                        {stayNights} night{stayNights > 1 ? "s" : ""} ×{" "}
                        {rooms} room{Number(rooms) > 1 ? "s" : ""})
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-semibold text-[#3B0718]">
                      Notes (optional)
                    </label>
                    <textarea
                      className={inputClass}
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Jaise late check-in, ground floor..."
                      maxLength={500}
                    />
                  </div>
                </div>

                {reserveError && (
                  <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {reserveError}
                  </p>
                )}

                <p className="mt-4 text-xs text-gray-500">
                  Ye reservation request hai. App mein koi payment nahi
                  hoti.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={closeReserve}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-[#3B0718] hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-[#3B0718] px-4 py-3 font-bold text-[#D4AF37] hover:bg-[#701C35] disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Reserve Stay"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}