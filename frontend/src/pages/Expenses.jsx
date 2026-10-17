import { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from "recharts";

const API_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const CATEGORIES = [
  { value: "accommodation", label: "Accommodation", icon: "🏨", color: "#7C3AED" },
  { value: "food", label: "Food", icon: "🍽️", color: "#F97316" },
  { value: "transport", label: "Transport", icon: "🚗", color: "#2563EB" },
  { value: "activities", label: "Activities", icon: "🎟️", color: "#16A34A" },
  { value: "shopping", label: "Shopping", icon: "🛍️", color: "#DB2777" },
  { value: "other", label: "Other", icon: "📌", color: "#6B7280" },
];

const CURRENCIES = ["PKR", "USD", "EUR", "GBP", "AED", "SAR"];

function categoryInfo(value) {
  return (
    CATEGORIES.find((c) => c.value === value) || {
      value,
      label: value,
      icon: "📌",
      color: "#6B7280",
    }
  );
}

function categoryLabel(value) {
  return categoryInfo(value).label;
}

function categoryColor(value) {
  return categoryInfo(value).color;
}

function shortDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function compactNumber(value) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(
    Number(value || 0)
  );
}

function todayString() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function money(currency, value) {
  return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token")
  );
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Please log in again.");
    }
    const body = await res.json().catch(() => ({}));
    const detail = Array.isArray(body.detail)
      ? body.detail.map((d) => d.msg).join(", ")
      : body.detail;
    throw new Error(detail || "Kuch ghalat ho gaya, dobara try karein.");
  }

  if (res.status === 204) return null;
  return res.json();
}

export default function Expenses() {
  const [trips, setTrips] = useState([]);
  const [tripId, setTripId] = useState("general");
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Set Budget form
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("PKR");
  const [savingBudget, setSavingBudget] = useState(false);

  // Add Expense form
  const [category, setCategory] = useState("food");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayString());
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const isGeneral = tripId === "general";

  async function loadData(currentTripId) {
    setLoading(true);
    setError("");

    try {
      const [summaryData, expenseData, tripData, bookingData] =
        await Promise.all([
          api(`/api/expenses/summary?tripId=${currentTripId}`),
          api(`/api/expenses?tripId=${currentTripId}`),
          api("/api/trips"),
          api("/api/bookings").catch(() => []),
        ]);

      setSummary(summaryData);
      setExpenses(expenseData);
      setTrips(Array.isArray(tripData) ? tripData : []);
      setBookings(Array.isArray(bookingData) ? bookingData : []);
      setBudgetAmount(summaryData.budget ? String(summaryData.budget) : "");
      setBudgetCurrency(summaryData.currency);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Trip badalne par (aur page khulte hi) data dobara aata hai,
  // is liye Trip Planner mein badla hua budget yahan khud nazar aata hai
  useEffect(() => {
    loadData(tripId);
  }, [tripId]);

  async function saveBudget(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    const value = Number(budgetAmount);
    if (!Number.isFinite(value) || value < 0) {
      setError("Budget sahi number mein likhein.");
      return;
    }

    setSavingBudget(true);
    try {
      if (isGeneral) {
        await api("/api/expenses/budget/general", {
          method: "PUT",
          body: JSON.stringify({ amount: value, currency: budgetCurrency }),
        });
      } else {
        await api(`/api/trips/${tripId}`, {
          method: "PATCH",
          body: JSON.stringify({ budget: value, currency: budgetCurrency }),
        });
      }
      setMessage("Budget save ho gaya ✅");
      await loadData(tripId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingBudget(false);
    }
  }

  async function addExpense(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Amount 0 se zyada hona chahiye.");
      return;
    }
    if (!title.trim()) {
      setError("Kharche ka naam ya detail likhein.");
      return;
    }

    setAdding(true);
    try {
      await api("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          tripId: isGeneral ? null : tripId,
          title: title.trim(),
          category,
          amount: value,
          expenseDate,
        }),
      });
      setAmount("");
      setTitle("");
      setMessage("Expense add ho gaya ✅");
      await loadData(tripId);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function deleteExpense(item) {
    if (!window.confirm("Ye expense delete karein?")) return;

    setError("");
    setMessage("");
    try {
      await api(`/api/expenses/${item.id}`, { method: "DELETE" });
      await loadData(tripId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function addFromBooking(booking) {
    setError("");
    setMessage("");
    try {
      await api(`/api/expenses/from-booking/${booking.id}`, {
        method: "POST",
      });
      setMessage("Hotel ka kharcha add ho gaya ✅");
      await loadData(tripId);
    } catch (err) {
      setError(err.message);
    }
  }

  // Is trip ki wo bookings jinka kharcha abhi add nahi hua
  const pendingBookings = useMemo(() => {
    if (isGeneral) return [];
    const added = new Set(
      expenses.filter((x) => x.bookingId).map((x) => x.bookingId)
    );
    return bookings.filter(
      (b) =>
        b.tripId === tripId &&
        b.status !== "cancelled" &&
        b.totalPrice !== null &&
        b.totalPrice !== undefined &&
        !added.has(b.id)
    );
  }, [bookings, expenses, tripId, isGeneral]);

  const currency = summary?.currency || "PKR";
  const totalSpent = summary?.totalSpent || 0;

  const categoryData = (summary?.byCategory || []).map((row) => ({
    key: row.category,
    name: categoryLabel(row.category),
    value: row.total,
  }));
  const dayData = summary?.byDay || [];

  const inputCls =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-[#3B0718] outline-none focus:border-[#D4AF37]";

  return (
    <div className="min-h-screen bg-white p-4 sm:p-6">
      {/* Header */}
      <header className="rounded-2xl border border-[#D4AF37] bg-[#3B0718] p-6 text-white shadow-lg sm:p-8">
        <h1 className="text-3xl font-bold text-[#D4AF37] sm:text-4xl">
          Expense Tracker
        </h1>
        <p className="mt-3 text-gray-200">
          Manage your travel expenses with TravelMate AI.
        </p>

        <label className="mt-6 block text-sm font-semibold text-white">
          Trip
        </label>
        <select
          value={tripId}
          onChange={(e) => {
            setMessage("");
            setError("");
            setTripId(e.target.value);
          }}
          className="mt-2 w-full max-w-md rounded-xl border border-[#D4AF37] bg-[#3B0718] px-4 py-3 text-white outline-none"
        >
          <option value="general">General (no trip)</option>
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.title} · {trip.destination}
            </option>
          ))}
        </select>
      </header>

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-700">
          {message}
        </p>
      )}

      {/* Summary cards */}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#D4AF37]/60 bg-[#FFFDF8] p-5">
          <p className="text-sm text-gray-600">Budget</p>
          <p className="mt-2 text-3xl font-extrabold text-[#3B0718]">
            {money(currency, summary?.budget)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#D4AF37]/60 bg-[#FFFDF8] p-5">
          <p className="text-sm text-gray-600">Total spent</p>
          <p className="mt-2 text-3xl font-extrabold text-[#3B0718]">
            {money(currency, totalSpent)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {summary?.expenseCount || 0} expense
            {summary?.expenseCount === 1 ? "" : "s"}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-5 ${
            summary?.overBudget
              ? "border-red-300 bg-red-50"
              : "border-[#D4AF37]/60 bg-[#FFFDF8]"
          }`}
        >
          <p className="text-sm text-gray-600">
            {summary?.overBudget ? "Over budget by" : "Remaining"}
          </p>
          <p
            className={`mt-2 text-3xl font-extrabold ${
              summary?.overBudget ? "text-red-700" : "text-[#3B0718]"
            }`}
          >
            {money(currency, Math.abs(summary?.remaining || 0))}
          </p>
        </div>
      </section>

      {summary?.percentUsed !== null && summary?.percentUsed !== undefined && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Budget used</span>
            <span>{summary.percentUsed}%</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full ${
                summary.overBudget ? "bg-red-600" : "bg-[#D4AF37]"
              }`}
              style={{ width: `${Math.min(summary.percentUsed, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Forms */}
      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={saveBudget}
          className="rounded-2xl border border-[#D4AF37]/60 bg-[#FFFDF8] p-5 sm:p-6"
        >
          <h2 className="text-2xl font-extrabold text-[#3B0718]">
            Set Budget
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {isGeneral
              ? "Ye General (trip ke baghair) ka apna budget hai."
              : "Ye is trip ka budget hai. Trip Planner mein bhi yahi dikhega."}
          </p>

          <div className="mt-4 grid grid-cols-[1fr_120px] gap-3">
            <input
              className={inputCls}
              type="number"
              min="0"
              step="any"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              placeholder="Budget"
              required
            />
            <select
              className={inputCls}
              value={budgetCurrency}
              onChange={(e) => setBudgetCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={savingBudget}
            className="mt-4 rounded-xl border border-[#D4AF37] bg-[#3B0718] px-6 py-3 font-bold text-white hover:text-[#D4AF37] disabled:opacity-60"
          >
            {savingBudget ? "Saving..." : "Save Budget"}
          </button>
        </form>

        <form
          onSubmit={addExpense}
          className="rounded-2xl border border-[#D4AF37]/60 bg-[#FFFDF8] p-5 sm:p-6"
        >
          <h2 className="text-2xl font-extrabold text-[#3B0718]">
            Add Expense
          </h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select
              className={inputCls}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>

            <input
              className={inputCls}
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount (${currency})`}
              required
            />

            <input
              className={inputCls}
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />

            <input
              className={inputCls}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kis cheez par kharcha?"
              maxLength={100}
              required
            />
          </div>

          <button
            type="submit"
            disabled={adding}
            className="mt-4 rounded-xl border border-[#D4AF37] bg-[#3B0718] px-6 py-3 font-bold text-white hover:text-[#D4AF37] disabled:opacity-60"
          >
            {adding ? "Adding..." : "Add Expense"}
          </button>
        </form>
      </section>

      {/* Hotel bookings jinka kharcha add nahi hua */}
      {pendingBookings.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[#D4AF37] bg-[#FFF8E5] p-5 sm:p-6">
          <h2 className="text-xl font-extrabold text-[#3B0718]">
            Hotel bookings se kharcha add karein
          </h2>
          <div className="mt-4 grid gap-3">
            {pendingBookings.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/50 bg-white p-4"
              >
                <div>
                  <p className="font-bold text-[#3B0718]">{b.hotelName}</p>
                  <p className="text-sm text-gray-600">
                    {b.checkIn} → {b.checkOut} · {b.nights} night
                    {b.nights > 1 ? "s" : ""} · {b.reference}
                  </p>
                  <p className="text-sm font-semibold text-[#701C35]">
                    {money(b.currency, b.totalPrice)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addFromBooking(b)}
                  className="rounded-lg bg-[#3B0718] px-4 py-2 text-sm font-bold text-[#D4AF37] hover:bg-[#701C35]"
                >
                  Add as expense
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Charts */}
      {expenses.length > 0 && (
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#D4AF37]/60 bg-white p-5">
            <h2 className="text-xl font-extrabold text-[#3B0718]">
              Spending by category
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Har rang ek category hai, % kul kharche ka hissa hai.
            </p>

            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={95}
                    innerRadius={45}
                    paddingAngle={2}
                    label={({ percent }) => `${Math.round(percent * 100)}%`}
                  >
                    {categoryData.map((row) => (
                      <Cell key={row.key} fill={categoryColor(row.key)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [money(currency, value), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <ul className="mt-4 grid gap-2">
              {categoryData.map((row) => {
                const share =
                  totalSpent > 0 ? Math.round((row.value / totalSpent) * 100) : 0;
                return (
                  <li
                    key={row.key}
                    className="flex items-center justify-between gap-3 rounded-lg bg-[#FFFDF8] px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2 text-gray-800">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: categoryColor(row.key) }}
                      />
                      {categoryInfo(row.key).icon} {row.name}
                    </span>
                    <span className="font-semibold text-[#3B0718]">
                      {money(currency, row.value)} · {share}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#D4AF37]/60 bg-white p-5">
            <h2 className="text-xl font-extrabold text-[#3B0718]">
              Daily spending
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Har din kitna kharcha hua ({currency}).
            </p>

            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dayData}
                  margin={{ top: 24, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tickFormatter={compactNumber} tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={shortDate}
                    formatter={(value) => [money(currency, value), "Spent"]}
                  />
                  <Bar
                    dataKey="total"
                    fill="#D4AF37"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={70}
                  >
                    <LabelList
                      dataKey="total"
                      position="top"
                      formatter={compactNumber}
                      style={{ fontSize: 12, fill: "#3B0718", fontWeight: 700 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* All expenses */}
      <section className="mt-6 rounded-2xl border border-[#D4AF37]/60 bg-[#FFFDF8] p-5 sm:p-6">
        <h2 className="text-2xl font-extrabold text-[#3B0718]">
          All expenses
        </h2>

        {loading && (
          <p className="mt-4 text-sm text-gray-600">Loading...</p>
        )}

        {!loading && expenses.length === 0 && (
          <p className="mt-4 text-gray-600">
            Abhi koi expense nahi. Upar form se pehla expense add karein.
          </p>
        )}

        {expenses.length > 0 && (
          <div className="mt-4 grid gap-3">
            {expenses.map((item) => {
              const info = categoryInfo(item.category);
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 border-l-4 bg-white p-4"
                  style={{ borderLeftColor: info.color }}
                >
                  <div>
                    <p className="font-bold text-[#3B0718]">{item.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                      <span>{item.expenseDate}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{
                          backgroundColor: `${info.color}1A`,
                          color: info.color,
                          border: `1px solid ${info.color}`,
                        }}
                      >
                        {info.icon} {info.label}
                      </span>
                      {item.bookingId && (
                        <span className="text-xs text-[#701C35]">
                          (hotel booking)
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <p className="text-lg font-extrabold text-[#701C35]">
                      {money(currency, item.amount)}
                    </p>
                    <button
                      type="button"
                      onClick={() => deleteExpense(item)}
                      className="rounded-lg border border-red-300 bg-white px-3 py-1 text-sm font-bold text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}