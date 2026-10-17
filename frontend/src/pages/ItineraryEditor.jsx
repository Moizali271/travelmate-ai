import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { authFetch } from "../services/authFetch";

const API_URL = "/api/trips";

const COST_TYPES = [
  { value: "activities", label: "Activities" },
  { value: "accommodation", label: "Accommodation" },
  { value: "transport", label: "Transport" },
  { value: "food", label: "Food" },
  { value: "shopping", label: "Shopping" },
  { value: "other", label: "Other" },
];

function fmtMinutes(value) {
  const total = Math.round(value || 0);
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

async function readError(res, fallback) {
  const data = await res.json().catch(() => null);
  const detail = Array.isArray(data?.detail)
    ? data.detail.map((d) => d.msg).join(", ")
    : data?.detail;
  return detail || fallback;
}

function friendly(err) {
  if (err instanceof TypeError) {
    return "Backend se rabta nahi ho raha. Check karein ke uvicorn chal raha hai.";
  }
  return err.message;
}

export default function ItineraryEditor() {
  const { id } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState({});
  const [newName, setNewName] = useState("");
  const [newDay, setNewDay] = useState("1");

  async function send(path, options = {}) {
    const res = await authFetch(`${API_URL}/${id}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      throw new Error(await readError(res, `Server ne ${res.status} diya`));
    }
    return res.status === 204 ? null : res.json();
  }

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/${id}/itinerary`);
      if (!res.ok) {
        throw new Error(await readError(res, `Server ne ${res.status} diya`));
      }
      setData(await res.json());
    } catch (err) {
      setError(friendly(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action, successMessage) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      if (successMessage) setMessage(successMessage);
      await load();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  function valueOf(stop, key) {
    const draft = drafts[stop.id];
    return draft && key in draft ? draft[key] : stop[key];
  }

  function setField(stop, key, value) {
    setDrafts((prev) => ({
      ...prev,
      [stop.id]: { ...(prev[stop.id] || {}), [key]: value },
    }));
  }

  function addStop(e) {
    e.preventDefault();
    if (newName.trim().length < 2) {
      setError("Jagah ka naam likhein (kam az kam 2 characters).");
      return;
    }
    run(async () => {
      await send("/stops/by-name", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          dayNumber: Number(newDay),
        }),
      });
      setNewName("");
    }, "Stop add ho gaya!");
  }

  function saveStop(stop) {
    const draft = drafts[stop.id];
    if (!draft) return;

    const body = {};
    if ("startTime" in draft) body.startTime = draft.startTime;
    if ("visitMinutes" in draft) body.visitMinutes = Number(draft.visitMinutes || 0);
    if ("cost" in draft) body.cost = Number(draft.cost || 0);
    if ("costType" in draft) body.costType = draft.costType;
    if ("notes" in draft) body.notes = draft.notes;

    run(async () => {
      await send(`/stops/${stop.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[stop.id];
        return next;
      });
    }, "Stop save ho gaya!");
  }

  function toggleVisited(stop) {
    run(() =>
      send(`/stops/${stop.id}`, {
        method: "PATCH",
        body: JSON.stringify({ visited: !stop.visited }),
      })
    );
  }

  function deleteStop(stop) {
    if (!window.confirm(`"${stop.name}" ko is trip se hata dein?`)) return;
    run(() => send(`/stops/${stop.id}`, { method: "DELETE" }), "Stop hat gaya.");
  }

  function commit(arrays) {
    const items = [];
    let order = 1;
    arrays.forEach((list, dayIndex) => {
      list.forEach((s) => {
        items.push({ id: s.id, dayNumber: dayIndex + 1, stopOrder: order++ });
      });
    });
    return run(() =>
      send("/stops/reorder", {
        method: "PUT",
        body: JSON.stringify({ items }),
      })
    );
  }

  function moveStop(dayIndex, index, delta) {
    const arrays = data.days.map((d) => [...d.stops]);
    const target = index + delta;
    if (target < 0 || target >= arrays[dayIndex].length) return;
    [arrays[dayIndex][index], arrays[dayIndex][target]] = [
      arrays[dayIndex][target],
      arrays[dayIndex][index],
    ];
    commit(arrays);
  }

  function moveToDay(dayIndex, index, targetDay) {
    if (!targetDay || targetDay === dayIndex + 1) return;
    const arrays = data.days.map((d) => [...d.stops]);
    const [stop] = arrays[dayIndex].splice(index, 1);
    arrays[targetDay - 1].push(stop);
    commit(arrays);
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-[#D4AF37] focus:outline-none";

  if (loading) {
    return (
      <p className="rounded-xl bg-[#FFFDF8] p-6 text-[#746B70]">
        Itinerary load ho rahi hai...
      </p>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        {error && (
          <p className="rounded-xl border border-red-300 bg-red-50 p-4 font-medium text-red-700">
            {error}
          </p>
        )}
        <Link to="/planner" className="font-semibold text-[#701C35] underline">
          ← Trips par wapas jayein
        </Link>
      </div>
    );
  }

  const { trip, days, summary } = data;
  const overBudget = summary.budget > 0 && summary.remaining < 0;

  return (
    <div className="space-y-6 pb-10">
      <div className="border-b-2 border-[#D4AF37] pb-4">
        <Link to="/planner" className="text-sm font-semibold text-[#701C35] underline">
          ← Meri Trips
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold text-[#3B0718]">
          {trip.title}
        </h1>
        <p className="mt-2 text-[#746B70]">
          📍 {trip.destination} · 📅 {trip.startDate} se {trip.endDate} · 👥{" "}
          {trip.travelerCount} musafir
        </p>
      </div>

      {message && (
        <p className="rounded-xl border border-green-300 bg-green-50 p-3 font-medium text-green-800">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 p-3 font-medium text-red-700">
          {error}
        </p>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#D4AF37]/60 p-4">
          <p className="text-sm text-gray-500">Din aur stops</p>
          <p className="mt-1 text-2xl font-extrabold text-[#3B0718]">
            {summary.totalDays} din · {summary.totalStops} stops
          </p>
        </div>
        <div className="rounded-2xl border border-[#D4AF37]/60 p-4">
          <p className="text-sm text-gray-500">Safar (andaza)</p>
          <p className="mt-1 text-2xl font-extrabold text-[#3B0718]">
            {summary.totalDistanceKm} km
          </p>
          <p className="text-sm text-gray-500">
            ~{fmtMinutes(summary.totalTravelMinutes)} drive
          </p>
        </div>
        <div className="rounded-2xl border border-[#D4AF37]/60 p-4">
          <p className="text-sm text-gray-500">Kul kharcha (andaza)</p>
          <p className="mt-1 text-2xl font-extrabold text-[#3B0718]">
            {trip.currency} {money(summary.totalCost)}
          </p>
          <p className="text-sm text-gray-500">
            Stops {money(summary.stopsCost)} + Bookings{" "}
            {money(summary.bookingsCost)}
          </p>
        </div>
        <div
          className={`rounded-2xl border p-4 ${
            overBudget ? "border-red-300 bg-red-50" : "border-[#D4AF37]/60"
          }`}
        >
          <p className="text-sm text-gray-500">Budget bacha hua</p>
          <p
            className={`mt-1 text-2xl font-extrabold ${
              overBudget ? "text-red-700" : "text-[#3B0718]"
            }`}
          >
            {trip.currency} {money(summary.remaining)}
          </p>
          <p className="text-sm text-gray-500">
            Budget {money(summary.budget)}
          </p>
        </div>
      </div>

      {Object.keys(summary.byCategory).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.byCategory).map(([kind, total]) => (
            <span
              key={kind}
              className="rounded-full bg-[#F7EAC0] px-3 py-1 text-sm font-semibold capitalize text-[#3B0718]"
            >
              {kind}: {money(total)}
            </span>
          ))}
        </div>
      )}

      {/* Add stop */}
      <form
        onSubmit={addStop}
        className="rounded-2xl border border-[#D4AF37]/60 bg-[#FFFDF8] p-4"
      >
        <h2 className="text-lg font-bold text-[#3B0718]">Stop add karein</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px_auto]">
          <input
            className={inputCls}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Jagah ka naam (jaise Attabad Lake, Hunza)"
          />
          <select
            className={inputCls}
            value={newDay}
            onChange={(e) => setNewDay(e.target.value)}
          >
            {days.map((d) => (
              <option key={d.dayNumber} value={String(d.dayNumber)}>
                Day {d.dayNumber}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-[#D4AF37] bg-[#3B0718] px-4 py-2 font-semibold text-white hover:text-[#D4AF37] disabled:opacity-60"
          >
            {busy ? "Wait..." : "+ Add Stop"}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Map ya Explore page se add kiye hue stops Day 1 mein aate hain,
          unhe yahan se doosre din mein bhej sakte hain.
        </p>
      </form>

      {/* Days */}
      <div className="space-y-5">
        {days.map((day, dayIndex) => (
          <section
            key={day.dayNumber}
            className="rounded-2xl border border-[#D4AF37]/50 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex flex-col justify-between gap-2 border-b border-[#D4AF37]/40 pb-3 sm:flex-row sm:items-center">
              <h2 className="text-xl font-extrabold text-[#3B0718]">
                Day {day.dayNumber}{" "}
                <span className="text-sm font-medium text-gray-500">
                  · {day.date}
                </span>
              </h2>
              <p className="text-sm text-gray-600">
                {day.stops.length} stops · {day.distanceKm} km · ~
                {fmtMinutes(day.travelMinutes)} drive ·{" "}
                {fmtMinutes(day.visitMinutes)} visit · {trip.currency}{" "}
                {money(day.cost)}
              </p>
            </div>

            {day.stops.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-[#D4AF37]/60 p-4 text-center text-sm text-gray-500">
                Is din ke liye abhi koi stop nahi.
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {day.stops.map((stop, index) => (
                  <li
                    key={stop.id}
                    className="rounded-xl border border-gray-200 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3B0718] text-sm font-bold text-[#D4AF37]">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-bold text-[#3B0718]">{stop.name}</p>
                          {stop.category && (
                            <p className="text-xs capitalize text-gray-500">
                              {stop.category}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={!!stop.visited}
                            disabled={busy}
                            onChange={() => toggleVisited(stop)}
                          />
                          Visited
                        </label>
                        <button
                          type="button"
                          disabled={busy || index === 0}
                          onClick={() => moveStop(dayIndex, index, -1)}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:opacity-40"
                          title="Upar"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={busy || index === day.stops.length - 1}
                          onClick={() => moveStop(dayIndex, index, 1)}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:opacity-40"
                          title="Neeche"
                        >
                          ↓
                        </button>
                        <select
                          value=""
                          disabled={busy || days.length < 2}
                          onChange={(e) =>
                            moveToDay(dayIndex, index, Number(e.target.value))
                          }
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="">Din badlein</option>
                          {days
                            .filter((d) => d.dayNumber !== day.dayNumber)
                            .map((d) => (
                              <option key={d.dayNumber} value={d.dayNumber}>
                                Day {d.dayNumber}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deleteStop(stop)}
                          className="rounded-lg border border-red-200 px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className="text-xs text-gray-500">Time</label>
                        <input
                          type="time"
                          className={inputCls}
                          value={valueOf(stop, "startTime")}
                          onChange={(e) =>
                            setField(stop, "startTime", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">
                          Visit duration (minutes)
                        </label>
                        <input
                          type="number"
                          min="0"
                          className={inputCls}
                          value={valueOf(stop, "visitMinutes")}
                          onChange={(e) =>
                            setField(stop, "visitMinutes", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">
                          Kharcha ({trip.currency})
                        </label>
                        <input
                          type="number"
                          min="0"
                          className={inputCls}
                          value={valueOf(stop, "cost")}
                          onChange={(e) =>
                            setField(stop, "cost", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">
                          Kharche ki qisam
                        </label>
                        <select
                          className={inputCls}
                          value={valueOf(stop, "costType")}
                          onChange={(e) =>
                            setField(stop, "costType", e.target.value)
                          }
                        >
                          {COST_TYPES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-4">
                        <label className="text-xs text-gray-500">Notes</label>
                        <input
                          type="text"
                          className={inputCls}
                          maxLength={500}
                          placeholder="Koi note (jaise ticket pehle book karein)"
                          value={valueOf(stop, "notes")}
                          onChange={(e) =>
                            setField(stop, "notes", e.target.value)
                          }
                        />
                      </div>
                    </div>

                    {drafts[stop.id] && (
                      <div className="mt-3">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => saveStop(stop)}
                          className="rounded-lg border border-[#D4AF37] bg-[#3B0718] px-4 py-1.5 text-sm font-semibold text-white hover:text-[#D4AF37] disabled:opacity-60"
                        >
                          Save changes
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p className="text-xs text-gray-500">
        Doori aur drive time sirf andaza hain (seedhi doori × 1.3, 40 km/h ki
        rafter). Asal rasta aur waqt road aur traffic ke hisaab se alag ho
        sakta hai.
      </p>
    </div>
  );
}