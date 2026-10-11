import { useEffect, useState } from "react";
import { authFetch } from "../services/authFetch";

const API_URL = "/api/trips";

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
  const [form, setForm] = useState(emptyForm);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadTrips() {
    setLoading(true);
    try {
      const res = await authFetch(API_URL);
      if (!res.ok) throw new Error(`Server ne ${res.status} diya`);
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
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (form.endDate < form.startDate) {
      setError("Wapsi ki tareekh shuru ki tareekh se pehle nahi ho sakti.");
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        throw new Error(detail || `Server ne ${res.status} diya`);
      }

      setMessage("Trip save ho gayi!");
      setForm(emptyForm);
      await loadTrips();
    } catch (err) {
      setError("Trip save nahi ho saki: " + friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setError("");
    try {
      const res = await authFetch(`${API_URL}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Server ne ${res.status} diya`);
      await loadTrips();
    } catch (err) {
      setError("Trip delete nahi ho saki: " + friendlyError(err));
    }
  }

  const inputClass = "w-full rounded border border-gray-300 p-3";

  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">Trip Planner</h1>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 rounded-lg bg-white p-6 shadow md:grid-cols-2"
      >
        <input
          className={inputClass}
          name="from"
          value={form.from}
          onChange={handleChange}
          placeholder="Kahan se (jaise Karachi)"
          required
        />
        <input
          className={inputClass}
          name="destination"
          value={form.destination}
          onChange={handleChange}
          placeholder="Kahan tak (jaise Hunza)"
          required
        />
        <input
          className={inputClass}
          type="date"
          name="startDate"
          value={form.startDate}
          onChange={handleChange}
          required
        />
        <input
          className={inputClass}
          type="date"
          name="endDate"
          value={form.endDate}
          onChange={handleChange}
          required
        />
        <input
          className={inputClass}
          type="number"
          min="0"
          name="budget"
          value={form.budget}
          onChange={handleChange}
          placeholder="Budget (PKR)"
          required
        />
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
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-600 p-3 font-semibold text-white md:col-span-2 disabled:opacity-60"
        >
          {saving ? "Save ho rahi hai..." : "Trip Save Karein"}
        </button>
      </form>

      {message && <p className="mt-4 text-green-600">{message}</p>}
      {error && <p className="mt-4 text-red-600">{error}</p>}

      <h2 className="mt-8 mb-3 text-2xl font-bold">Meri Trips</h2>
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : trips.length === 0 ? (
        <p className="text-gray-500">Abhi koi trip nahi hai.</p>
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => (
            <li
              key={trip.id}
              className="flex items-center justify-between rounded-lg bg-white p-4 shadow"
            >
              <div>
                <p className="text-lg font-semibold">{trip.title}</p>
                <p className="text-gray-600">
                  {trip.destination} | {trip.startDate} se {trip.endDate}
                </p>
                <p className="text-gray-600">
                  Budget: {Number(trip.budget).toLocaleString()} {trip.currency} |{" "}
                  {trip.travelerCount} musafir | {trip.status}
                </p>
              </div>
              <button
                onClick={() => handleDelete(trip.id)}
                className="rounded bg-red-500 px-3 py-2 text-white"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}