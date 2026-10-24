
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { authFetch } from "../services/authFetch";

const INTEREST_OPTIONS = [
  "Nature",
  "History & Culture",
  "Food",
  "Adventure",
  "Photography",
  "Shopping",
  "Religious sites",
  "Relaxation",
  "Family friendly",
];

const TRANSPORT_OPTIONS = [
  { value: "", label: "Koi bhi" },
  { value: "Own car", label: "Apni gaari" },
  { value: "Rental car", label: "Rental car" },
  { value: "Public transport", label: "Public transport" },
  { value: "Bike", label: "Bike" },
];

function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) *
      Math.cos(rad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function fmtMinutes(value) {
  const total = Math.round(value || 0);

  if (total < 60) return `${total}m`;

  const h = Math.floor(total / 60);
  const m = total % 60;

  return m ? `${h}h ${m}m` : `${h}h`;
}

function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
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

  return err?.message || "Kuch ghalat ho gaya. Dobara koshish karein.";
}

export default function AiPlanner() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState(null);
  const [interests, setInterests] = useState([]);
  const [custom, setCustom] = useState("");
  const [style, setStyle] = useState("balanced");
  const [pace, setPace] = useState("balanced");
  const [transport, setTransport] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [applying, setApplying] = useState(false);
  const [replace, setReplace] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await authFetch("/api/ai/status");

        if (res.ok) {
          setStatus(await res.json());
        }
      } catch {
        setStatus(null);
      }
    }

    loadStatus();
  }, []);

  useEffect(() => {
    if (!loading) return undefined;

    const timer = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [loading]);

  function toggleInterest(name) {
    setInterests((prev) =>
      prev.includes(name)
        ? prev.filter((i) => i !== name)
        : prev.length >= 10
          ? prev
          : [...prev, name]
    );
  }

  function addCustomInterest() {
    const value = custom.trim();

    if (!value) return;

    if (!interests.includes(value) && interests.length < 10) {
      setInterests((prev) => [...prev, value]);
    }

    setCustom("");
  }

  async function generate(e) {
    e.preventDefault();

    setError("");
    setPlan(null);
    setElapsed(0);
    setLoading(true);

    try {
      const res = await authFetch("/api/ai/itinerary/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: id,
          interests,
          style,
          pace,
          transport,
          notes,
        }),
      });

      if (!res.ok) {
        throw new Error(
          await readError(res, `Server ne ${res.status} diya`)
        );
      }

      setPlan(await res.json());
    } catch (err) {
      setError(friendly(err));
    } finally {
      setLoading(false);
    }
  }

  function updateStop(dayIndex, stopIndex, patch) {
    setPlan((prev) => ({
      ...prev,
      days: prev.days.map((day, i) =>
        i !== dayIndex
          ? day
          : {
              ...day,
              stops: day.stops.map((stop, j) =>
                j === stopIndex ? { ...stop, ...patch } : stop
              ),
            }
      ),
    }));
  }

  function removeStop(dayIndex, stopIndex) {
    setPlan((prev) => ({
      ...prev,
      days: prev.days.map((day, i) =>
        i !== dayIndex
          ? day
          : {
              ...day,
              stops: day.stops.filter((_, j) => j !== stopIndex),
            }
      ),
    }));
  }

  const totals = useMemo(() => {
    if (!plan) return null;

    let stops = 0;
    let distance = 0;
    let travel = 0;
    let stopsCost = 0;
    let extrasCost = 0;

    const byCategory = {};

    const days = plan.days.map((day) => {
      let dayDistance = 0;

      for (let i = 1; i < day.stops.length; i += 1) {
        const a = day.stops[i - 1];
        const b = day.stops[i];

        if (
          Number.isFinite(Number(a.lat)) &&
          Number.isFinite(Number(a.lon)) &&
          Number.isFinite(Number(b.lat)) &&
          Number.isFinite(Number(b.lon))
        ) {
          dayDistance += haversineKm(
            Number(a.lat),
            Number(a.lon),
            Number(b.lat),
            Number(b.lon)
          );
        }
      }

      dayDistance = Math.round(dayDistance * 1.3 * 10) / 10;

      const dayTravel = Math.round((dayDistance / 40) * 60);

      let dayCost = 0;
      let dayVisit = 0;

      day.stops.forEach((stop) => {
        const cost = Number(stop.cost || 0);

        dayCost += cost;
        dayVisit += Number(stop.visitMinutes || 0);

        const category = stop.costType || "other";
        byCategory[category] = (byCategory[category] || 0) + cost;
      });

      Object.entries(day.extras || {}).forEach(([kind, value]) => {
        const amount = Number(value || 0);

        extrasCost += amount;
        byCategory[kind] = (byCategory[kind] || 0) + amount;
      });

      stops += day.stops.length;
      distance += dayDistance;
      travel += dayTravel;
      stopsCost += dayCost;

      return {
        distance: dayDistance,
        travel: dayTravel,
        visit: dayVisit,
        cost: dayCost,
      };
    });

    const total = stopsCost + extrasCost;
    const budget = Number(plan.trip?.budget || 0);

    return {
      days,
      stops,
      distance: Math.round(distance * 10) / 10,
      travel,
      stopsCost,
      extrasCost,
      total,
      budget,
      remaining: budget - total,
      over: budget > 0 && total > budget,
      byCategory,
    };
  }, [plan]);

  async function applyPlan() {
    if (!plan || !totals || totals.stops === 0) {
      setError("Apply karne ke liye kam az kam ek stop chahiye.");
      return;
    }

    setError("");
    setApplying(true);

    try {
      const res = await authFetch("/api/ai/itinerary/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: id,
          replace,
          days: plan.days.map((day) => ({
            dayNumber: day.dayNumber,
            stops: day.stops.map((stop) => ({
              placeId: stop.placeId,
              name: stop.name,
              lat: stop.lat,
              lon: stop.lon,
              category: stop.category || "",
              visitMinutes: Number(stop.visitMinutes || 0),
              startTime: stop.startTime || "",
              cost: Number(stop.cost || 0),
              costType: stop.costType || "other",
              notes: stop.notes || "",
            })),
          })),
        }),
      });

      if (!res.ok) {
        throw new Error(
          await readError(res, `Server ne ${res.status} diya`)
        );
      }

      navigate(`/trips/${id}/itinerary`);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setApplying(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#D4AF37] focus:outline-none";

  return (
    <div className="space-y-6 pb-10">
      <div className="border-b-2 border-[#D4AF37] pb-4">
        <Link
          to={`/trips/${id}/itinerary`}
          className="text-sm font-semibold text-[#701C35] underline"
        >
          ← Itinerary Editor
        </Link>

        <h1 className="mt-2 text-3xl font-extrabold text-[#3B0718]">
          ✨ AI Itinerary Planner
        </h1>

        <p className="mt-2 text-[#746B70]">
          Apni pasand batayein, Gemini AI din-ba-din plan banayega. Aap usay
          dekh kar badal sakte hain, phir trip mein lagayein.
        </p>
      </div>

      {status && !status.configured && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
          Gemini API key abhi set nahi hai. <code>backend/.env</code> mein{" "}
          <code>GEMINI_API_KEY</code> likhein aur backend restart karein.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-300 bg-red-50 p-4 font-medium text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={generate}
        className="space-y-5 rounded-2xl border border-[#D4AF37]/50 bg-white p-5 shadow-sm"
      >
        <div>
          <h2 className="font-bold text-[#3B0718]">
            Aap ki dilchaspiyan
          </h2>

          <div className="mt-2 flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((name) => {
              const active = interests.includes(name);

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleInterest(name)}
                  className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                    active
                      ? "border-[#3B0718] bg-[#3B0718] text-[#D4AF37]"
                      : "border-[#D4AF37]/60 bg-[#FFFDF8] text-[#3B0718]"
                  }`}
                >
                  {name}
                </button>
              );
            })}

            {interests
              .filter((name) => !INTEREST_OPTIONS.includes(name))
              .map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleInterest(name)}
                  className="rounded-full border border-[#3B0718] bg-[#3B0718] px-3 py-1 text-sm font-semibold text-[#D4AF37]"
                >
                  {name} ×
                </button>
              ))}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              className={inputCls}
              value={custom}
              maxLength={40}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomInterest();
                }
              }}
              placeholder="Apni koi aur dilchaspi likhein"
            />

            <button
              type="button"
              onClick={addCustomInterest}
              className="rounded-lg border border-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#3B0718]"
            >
              Add
            </button>
          </div>

          <p className="mt-1 text-xs text-gray-500">
            Zyada se zyada 10 dilchaspiyan select kar sakte hain.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-sm font-semibold text-[#3B0718]">
              Travel style
            </label>

            <select
              className={inputCls}
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              <option value="budget">Budget</option>
              <option value="balanced">Balanced</option>
              <option value="comfort">Comfort</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-[#3B0718]">
              Raftaar (pace)
            </label>

            <select
              className={inputCls}
              value={pace}
              onChange={(e) => setPace(e.target.value)}
            >
              <option value="relaxed">Aaram se (3 jagahen/din)</option>
              <option value="balanced">Darmiyani (4 jagahen/din)</option>
              <option value="packed">Tez (5 jagahen/din)</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-[#3B0718]">
              Transport
            </label>

            <select
              className={inputCls}
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
            >
              {TRANSPORT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-[#3B0718]">
            Koi khaas baat (optional)
          </label>

          <textarea
            className={inputCls}
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jaise: bachon ke saath, sirf halal khana, kam chalna"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl border border-[#D4AF37] bg-[#3B0718] p-3 font-bold text-white hover:text-[#D4AF37] disabled:opacity-60"
        >
          {loading
            ? `AI plan bana raha hai... ${elapsed}s`
            : "✨ Itinerary banayein"}
        </button>

        {loading && (
          <p className="text-sm text-gray-500">
            Isme kuch waqt lag sakta hai kyunki jagahon ko verify kiya jata
            hai. Page band na karein.
          </p>
        )}
      </form>

      {plan && totals && (
        <div className="space-y-5">
          <h2 className="text-2xl font-extrabold text-[#3B0718]">
            AI ka plan (preview)
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#D4AF37]/60 p-4">
              <p className="text-sm text-gray-500">Din aur stops</p>
              <p className="mt-1 text-xl font-extrabold text-[#3B0718]">
                {plan.days.length} din · {totals.stops} stops
              </p>
            </div>

            <div className="rounded-2xl border border-[#D4AF37]/60 p-4">
              <p className="text-sm text-gray-500">Safar (andaza)</p>
              <p className="mt-1 text-xl font-extrabold text-[#3B0718]">
                {totals.distance} km
              </p>
              <p className="text-sm text-gray-500">
                ~{fmtMinutes(totals.travel)} drive
              </p>
            </div>

            <div className="rounded-2xl border border-[#D4AF37]/60 p-4">
              <p className="text-sm text-gray-500">Kul kharcha (andaza)</p>
              <p className="mt-1 text-xl font-extrabold text-[#3B0718]">
                {plan.trip.currency} {money(totals.total)}
              </p>
              <p className="text-sm text-gray-500">
                Jagahen {money(totals.stopsCost)} + Rehna/khana/safar{" "}
                {money(totals.extrasCost)}
              </p>
            </div>

            <div
              className={`rounded-2xl border p-4 ${
                totals.over
                  ? "border-red-300 bg-red-50"
                  : "border-[#D4AF37]/60"
              }`}
            >
              <p className="text-sm text-gray-500">Budget bacha hua</p>
              <p
                className={`mt-1 text-xl font-extrabold ${
                  totals.over ? "text-red-700" : "text-[#3B0718]"
                }`}
              >
                {plan.trip.currency} {money(totals.remaining)}
              </p>
              <p className="text-sm text-gray-500">
                Budget {money(totals.budget)}
              </p>
            </div>
          </div>

          {totals.over && (
            <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-700">
              Ye plan aap ke budget se mehnga hai. Kuch jagahen hata dein,
              kharcha kam karein, ya style "Budget" chun kar dobara banayein.
            </p>
          )}

          {(plan.warnings || []).length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              {plan.warnings.map((warning, index) => (
                <p key={`${index}-${warning}`}>{warning}</p>
              ))}
            </div>
          )}

          {plan.days.map((day, dayIndex) => (
            <section
              key={day.dayNumber}
              className="rounded-2xl border border-[#D4AF37]/50 bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="flex flex-col justify-between gap-1 border-b border-[#D4AF37]/40 pb-3 sm:flex-row sm:items-center">
                <h3 className="text-lg font-extrabold text-[#3B0718]">
                  Day {day.dayNumber}: {day.title}{" "}
                  <span className="text-sm font-medium text-gray-500">
                    · {day.date}
                  </span>
                </h3>

                <p className="text-sm text-gray-600">
                  {day.stops.length} stops · {totals.days[dayIndex].distance} km
                  · ~{fmtMinutes(totals.days[dayIndex].travel)} drive ·{" "}
                  {fmtMinutes(totals.days[dayIndex].visit)} visit
                </p>
              </div>

              {day.stops.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">
                  Is din ke liye koi stop nahi bacha.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {day.stops.map((stop, stopIndex) => (
                    <li
                      key={stop.placeId || `${day.dayNumber}-${stopIndex}`}
                      className="rounded-xl border border-gray-200 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#3B0718] text-sm font-bold text-[#D4AF37]">
                            {stopIndex + 1}
                          </span>

                          <div>
                            <p className="font-bold text-[#3B0718]">
                              {stop.name}

                              {stop.startTime && (
                                <span className="ml-2 text-sm font-medium text-gray-500">
                                  {stop.startTime}
                                </span>
                              )}
                            </p>

                            {stop.notes && (
                              <p className="text-sm text-gray-600">
                                {stop.notes}
                              </p>
                            )}

                            <p className="text-xs text-gray-400">
                              ✓ Map par verify hui
                              {stop.address ? `: ${stop.address}` : ""}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeStop(dayIndex, stopIndex)}
                          className="rounded-lg border border-red-200 px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50"
                        >
                          Hatayein
                        </button>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="text-xs text-gray-500">
                            Visit duration (minutes)
                          </label>

                          <input
                            type="number"
                            min="0"
                            className={inputCls}
                            value={stop.visitMinutes ?? 0}
                            onChange={(e) =>
                              updateStop(dayIndex, stopIndex, {
                                visitMinutes: e.target.value,
                              })
                            }
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-500">
                            Kharcha ({plan.trip.currency})
                          </label>

                          <input
                            type="number"
                            min="0"
                            className={inputCls}
                            value={stop.cost ?? 0}
                            onChange={(e) =>
                              updateStop(dayIndex, stopIndex, {
                                cost: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-3 text-sm text-gray-600">
                Rozana andaza (poore group ka): rehna{" "}
                {money(day.extras?.accommodation)} · khana{" "}
                {money(day.extras?.food)} · safar{" "}
                {money(day.extras?.transport)}
              </p>
            </section>
          ))}

          {(plan.skipped || []).length > 0 && (
            <div className="rounded-xl border border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
              <p className="font-semibold">
                Ye jagahen verify nahi hui, isliye hata di gayin:
              </p>

              <ul className="mt-1 list-disc pl-5">
                {plan.skipped.map((item, index) => (
                  <li key={`${index}-${item.name}`}>
                    {item.name} — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(plan.tips || []).length > 0 && (
            <div className="rounded-xl border border-[#D4AF37]/50 bg-[#FFFDF8] p-4 text-sm">
              <p className="font-semibold text-[#3B0718]">Mashwaray</p>

              <ul className="mt-1 list-disc pl-5 text-gray-700">
                {plan.tips.map((tip, index) => (
                  <li key={`${index}-${tip}`}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          {(plan.alternatives || []).length > 0 && (
            <div className="rounded-xl border border-[#D4AF37]/50 bg-[#FFFDF8] p-4 text-sm">
              <p className="font-semibold text-[#3B0718]">
                Mutabadil jagahen aur activities
              </p>

              <ul className="mt-1 list-disc pl-5 text-gray-700">
                {plan.alternatives.map((alternative, index) => (
                  <li key={`${index}-${alternative}`}>{alternative}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-[#D4AF37] bg-[#FFFDF8] p-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Pehle se maujood stops hata kar sirf ye plan lagayein
            </label>

            <button
              type="button"
              disabled={applying || totals.stops === 0}
              onClick={applyPlan}
              className="mt-3 w-full rounded-xl border border-[#D4AF37] bg-[#3B0718] p-3 font-bold text-white hover:text-[#D4AF37] disabled:opacity-60"
            >
              {applying
                ? "Save ho raha hai..."
                : "✓ Ye plan meri trip mein lagayein"}
            </button>

            <p className="mt-2 text-xs text-gray-500">
              Lagane ke baad aap Itinerary Editor mein is plan ko kabhi bhi
              badal sakte hain. Doori aur kharcha sirf andaza hain.
            </p>
          </div>

          <p className="text-xs text-gray-400">
            AI model: {plan.model || "Gemini"}
          </p>
        </div>
      )}
    </div>
  );
}
