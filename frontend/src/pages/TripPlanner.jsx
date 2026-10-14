
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { authFetch } from "../services/authFetch";

const API_URL = "/api/trips";

function todayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const emptyForm = {
  from: "",
  destination: "",
  startDate: "",
  endDate: "",
  budget: "",
  travelerCount: 1,
};

function friendlyError(err) {
  if (err instanceof TypeError) {
    return "Backend se rabta nahi ho raha. Check karein ke uvicorn chal raha hai.";
  }

  return err.message;
}

export default function TripPlanner() {
  const location = useLocation();
  const incomingDestination = location.state?.destination;

  const [form, setForm] = useState(() => ({
    ...emptyForm,
    destination: incomingDestination || "",
  }));

  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const today = todayString();

  // Map page se aane wali destination form mein fill karein
  useEffect(() => {
    if (incomingDestination) {
      setForm((prev) => ({
        ...prev,
        destination: incomingDestination,
      }));
    }
  }, [incomingDestination]);

  async function loadTrips() {
    setLoading(true);

    try {
      const res = await authFetch(API_URL);

      if (!res.ok) {
        throw new Error(`Server ne ${res.status} diya`);
      }

      setTrips(await res.json());
    } catch (err) {
      setError("Trips load nahi ho saki: " + friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrips();
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => {
      const next = { ...prev, [name]: value };

      if (
        name === "startDate" &&
        next.endDate &&
        next.endDate < value
      ) {
        next.endDate = "";
      }

      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (form.startDate < today) {
      setError(
        "Departure date guzri hui nahi ho sakti. Aaj ya uske baad ki tareekh chunein."
      );
      return;
    }

    if (form.endDate < form.startDate) {
      setError(
        "Wapsi ki tareekh shuru ki tareekh se pehle nahi ho sakti."
      );
      return;
    }

    setSaving(true);

    try {
      const res = await authFetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `${form.from} se ${form.destination}`,
          destination: form.destination,
          startDate: form.startDate,
          endDate: form.endDate,
          budget: Number(form.budget),
          currency: "PKR",
          travelerCount: Number(form.travelerCount),
          status: "planned",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);

        const detail = Array.isArray(data?.detail)
          ? data.detail.map((d) => d.msg).join(", ")
          : data?.detail;

        throw new Error(
          detail || `Server ne ${res.status} diya`
        );
      }

      setMessage("Trip successfully save ho gayi!");

      setForm(emptyForm);

      await loadTrips();
    } catch (err) {
      setError(
        "Trip save nahi ho saki: " + friendlyError(err)
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setError("");
    setMessage("");

    try {
      const res = await authFetch(`${API_URL}/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error(`Server ne ${res.status} diya`);
      }

      setMessage("Trip delete ho gayi!");

      await loadTrips();
    } catch (err) {
      setError(
        "Trip delete nahi ho saki: " + friendlyError(err)
      );
    }
  }

  const inputClass =
    "w-full rounded-xl border border-[#D4AF37]/50 bg-white p-3 text-[#24040E] outline-none transition placeholder:text-gray-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/30";

  return (
    <div className="space-y-8 pb-10">
      {/* Page Heading */}
      <div className="border-b-2 border-[#D4AF37] pb-4">
        <p className="mb-2 text-sm font-bold uppercase tracking-widest text-[#701C35]">
          Your Next Adventure
        </p>

        <h1 className="text-3xl font-extrabold text-[#3B0718] sm:text-4xl">
          Trip Planner
        </h1>

        <p className="mt-2 text-[#746B70]">
          Apni trip plan karein aur apna travel budget manage karein.
        </p>
      </div>

      {/* Trip Form */}
      <form
        onSubmit={handleSubmit}
        className="grid gap-5 rounded-2xl border border-[#D4AF37]/40 bg-white p-5 shadow-md sm:p-8 md:grid-cols-2"
      >
        <div>
          <label className="mb-2 block font-semibold text-[#3B0718]">
            Starting Location
          </label>

          <input
            className={inputClass}
            name="from"
            value={form.from}
            onChange={handleChange}
            placeholder="Kahan se? (jaise Karachi)"
            required
          />
        </div>

        <div>
          <label className="mb-2 block font-semibold text-[#3B0718]">
            Destination
          </label>

          <input
            className={inputClass}
            name="destination"
            value={form.destination}
            onChange={handleChange}
            placeholder="Kahan tak? (jaise Hunza)"
            required
          />
        </div>

        <div>
          <label className="mb-2 block font-semibold text-[#3B0718]">
            Departure Date
          </label>

          <input
            className={inputClass}
            type="date"
            name="startDate"
            min={today}
            value={form.startDate}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label className="mb-2 block font-semibold text-[#3B0718]">
            Return Date
          </label>

          <input
            className={inputClass}
            type="date"
            name="endDate"
            min={form.startDate || today}
            value={form.endDate}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label className="mb-2 block font-semibold text-[#3B0718]">
            Budget (PKR)
          </label>

          <input
            className={inputClass}
            type="number"
            min="0"
            name="budget"
            value={form.budget}
            onChange={handleChange}
            placeholder="Apna budget enter karein"
            required
          />
        </div>

        <div>
          <label className="mb-2 block font-semibold text-[#3B0718]">
            Number of Travelers
          </label>

          <input
            className={inputClass}
            type="number"
            min="1"
            name="travelerCount"
            value={form.travelerCount}
            onChange={handleChange}
            placeholder="Musafiron ki tadaad"
            required
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl border border-[#D4AF37] bg-[#3B0718] p-4 font-bold text-white shadow-sm transition duration-200 hover:bg-[#24040E] hover:text-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
        >
          {saving ? "Saving Your Trip..." : "✦ Save My Trip"}
        </button>
      </form>

      {/* Success and Error Messages */}
      {message && (
        <p className="rounded-xl border border-green-300 bg-green-50 p-4 font-medium text-green-800">
          {message}
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 p-4 font-medium text-red-700">
          {error}
        </p>
      )}

      {/* Saved Trips */}
      <section>
        <div className="mb-5 flex items-center justify-between border-b border-[#D4AF37]/50 pb-3">
          <h2 className="text-2xl font-extrabold text-[#3B0718] sm:text-3xl">
            Meri Trips
          </h2>

          <span className="rounded-full bg-[#F7EAC0] px-4 py-2 text-sm font-bold text-[#3B0718]">
            {trips.length} Trips
          </span>
        </div>

        {loading ? (
          <p className="rounded-xl bg-[#FFFDF8] p-6 text-[#746B70]">
            Aapki trips load ho rahi hain...
          </p>
        ) : trips.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D4AF37] bg-[#FFFDF8] px-5 py-10 text-center">
            <p className="text-4xl">🧳</p>

            <h3 className="mt-3 text-xl font-bold text-[#3B0718]">
              Abhi koi trip nahi hai
            </h3>

            <p className="mt-2 text-[#746B70]">
              Apni pehli trip plan karne ke liye upar form fill karein.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {trips.map((trip) => (
              <li
                key={trip.id}
                className="rounded-2xl border border-[#D4AF37]/40 bg-white p-5 shadow-sm transition hover:shadow-lg sm:p-6"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <span className="inline-block rounded-full bg-[#F7EAC0] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#3B0718]">
                      {trip.status}
                    </span>

                    <h3 className="mt-3 text-xl font-extrabold text-[#3B0718]">
                      {trip.title}
                    </h3>

                    <p className="mt-2 text-sm text-[#746B70]">
                      📍 {trip.destination}
                    </p>

                    <p className="mt-2 text-sm text-[#746B70]">
                      📅 {trip.startDate} se {trip.endDate}
                    </p>

                    <p className="mt-2 text-sm text-[#746B70]">
                      💰 Budget:{" "}
                      {Number(trip.budget).toLocaleString()}{" "}
                      {trip.currency}
                    </p>

                    <p className="mt-2 text-sm text-[#746B70]">
                      👥 {trip.travelerCount} musafir
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(trip.id)}
                    className="rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-700 transition hover:bg-red-50"
                  >
                    Delete Trip
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
