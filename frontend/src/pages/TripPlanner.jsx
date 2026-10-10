import { useEffect, useState } from "react";
import api from "../services/api";

const emptyForm = {
  title: "",
  destination: "",
  startDate: "",
  endDate: "",
  budget: "",
  travelerCount: 1,
};

const inputClass = "w-full rounded border border-gray-300 p-2";

export default function TripPlanner() {
  const [form, setForm] = useState(emptyForm);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTrips = async () => {
    try {
      const res = await api.get("/trips");
      setTrips(res.data);
    } catch {
      setError("Trips nahi aa saki. Kya backend chal raha hai?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/trips", {
        ...form,
        budget: Number(form.budget),
        travelerCount: Number(form.travelerCount),
      });
      setForm(emptyForm);
      loadTrips();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        Array.isArray(detail) ? detail[0].msg : "Trip save nahi ho saki."
      );
    }
  };

  const handleDelete = async (id) => {
    await api.delete(`/trips/${id}`);
    loadTrips();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">Trip Planner</h1>

      <form
        onSubmit={handleSubmit}
        className="mt-4 grid gap-3 rounded-lg bg-white p-4 shadow sm:grid-cols-2"
      >
        <input
          className={inputClass}
          name="title"
          placeholder="Trip ka naam (jaise Hunza Trip)"
          value={form.title}
          onChange={handleChange}
          required
        />
        <input
          className={inputClass}
          name="destination"
          placeholder="Destination (jaise Hunza)"
          value={form.destination}
          onChange={handleChange}
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
          placeholder="Budget (PKR)"
          value={form.budget}
          onChange={handleChange}
          required
        />
        <input
          className={inputClass}
          type="number"
          min="1"
          name="travelerCount"
          placeholder="Kitne log"
          value={form.travelerCount}
          onChange={handleChange}
          required
        />
        <button
          type="submit"
          className="rounded bg-blue-600 p-2 font-semibold text-white hover:bg-blue-700 sm:col-span-2"
        >
          Trip Save Karein
        </button>
      </form>

      {error && <p className="mt-3 text-red-600">{error}</p>}

      <h2 className="mt-6 text-xl font-semibold">Meri Trips</h2>
      {loading && <p className="mt-2 text-gray-500">Loading...</p>}
      {!loading && trips.length === 0 && (
        <p className="mt-2 text-gray-500">Abhi koi trip nahi hai.</p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {trips.map((trip) => (
          <div key={trip.id} className="rounded-lg bg-white p-4 shadow">
            <h3 className="text-lg font-bold">{trip.title}</h3>
            <p className="text-gray-600">{trip.destination}</p>
            <p className="mt-1 text-sm">
              {trip.startDate} se {trip.endDate}
            </p>
            <p className="text-sm">
              Budget: {trip.budget} {trip.currency} | Log: {trip.travelerCount}
            </p>
            <button
              onClick={() => handleDelete(trip.id)}
              className="mt-3 text-sm text-red-600 hover:underline"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}