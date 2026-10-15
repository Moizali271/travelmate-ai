import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const CATEGORIES = [
  { value: "accommodation", label: "Accommodation", color: "#3B0718" },
  { value: "transport", label: "Transport & Fuel", color: "#D4AF37" },
  { value: "food", label: "Food", color: "#C0392B" },
  { value: "tickets", label: "Attraction Tickets", color: "#2E86AB" },
  { value: "shopping", label: "Shopping", color: "#8E44AD" },
  { value: "other", label: "Other", color: "#7F8C8D" },
];

const labelOf = (value) =>
  CATEGORIES.find((c) => c.value === value)?.label || value;
const colorOf = (value) =>
  CATEGORIES.find((c) => c.value === value)?.color || "#7F8C8D";

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  category: "food",
  amount: "",
  description: "",
  expenseDate: today(),
});

function getToken() {
  return localStorage.getItem("token") || localStorage.getItem("access_token");
}

async function api(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error("Login session nahi mili. Please log in again.");

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Login session expire ho gayi. Dobara login karein.");
    }
    const body = await response.json().catch(() => ({}));
    const detail = Array.isArray(body.detail)
      ? body.detail
          .map((d) => `${(d.loc || []).join(".")}: ${d.msg}`)
          .join(", ")
      : body.detail;
    throw new Error(detail || "Request fail ho gayi.");
  }
  return response.json();
}

const money = (n) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function Expenses() {
  const [trips, setTrips] = useState([]);
  const [tripId, setTripId] = useState("");
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [currency, setCurrency] = useState("PKR");
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const query = tripId ? `?tripId=${encodeURIComponent(tripId)}` : "";

  useEffect(() => {
    api("/api/trips")
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.trips || [];
        setTrips(list);
      })
      .catch(() => setTrips([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, sum] = await Promise.all([
        api(`/api/expenses${query}`),
        api(`/api/expenses/summary${query}`),
      ]);
      setExpenses(Array.isArray(list) ? list : []);
      setSummary(sum);
      setCurrency(sum.currency || "PKR");
      setBudgetInput(sum.budget ? String(sum.budget) : "");
    } catch (err) {
      setError(err.message || "Backend se connection nahi ho saka.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveBudget(e) {
    e.preventDefault();
    setError("");
    try {
      await api(`/api/expenses/set-budget${query}`, {
        method: "POST",
        body: JSON.stringify({
          budget: Number(budgetInput || 0),
          currency,
        }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveExpense(e) {
    e.preventDefault();
    setError("");

    if (!form.amount || Number(form.amount) <= 0) {
      setError("Amount 0 se zyada hona chahiye.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tripId: tripId || null,
        category: form.category,
        amount: Number(form.amount),
        description: form.description,
        expenseDate: form.expenseDate,
      };

      if (editingId) {
        await api(`/api/expenses/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/expenses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setForm(emptyForm());
      setEditingId("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      category: item.category,
      amount: String(item.amount),
      description: item.description || "",
      expenseDate: item.expenseDate || today(),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId("");
    setForm(emptyForm());
  }

  async function removeExpense(id) {
    if (!window.confirm("Kya aap ye expense delete karna chahte hain?")) return;
    setError("");
    try {
      await api(`/api/expenses/${id}`, { method: "DELETE" });
      if (editingId === id) cancelEdit();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const spent = summary?.totalSpent || 0;
  const budget = summary?.budget || 0;
  const remaining = summary?.remaining || 0;
  const percent = Math.min(summary?.percentUsed || 0, 100);
  const overBudget = budget > 0 && remaining < 0;

  const pieData = (summary?.byCategory || []).map((c) => ({
    name: labelOf(c.category),
    value: c.total,
    color: colorOf(c.category),
  }));
  const dayData = summary?.byDay || [];

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#D4AF37] focus:outline-none";

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="rounded-2xl border border-[#D4AF37] bg-[#3B0718] p-8 text-white">
        <h1 className="text-3xl font-bold text-[#D4AF37]">Expense Tracker</h1>
        <p className="mt-3 text-gray-200">
          Manage your travel expenses with TravelMate AI.
        </p>

        <div className="mt-5 max-w-sm">
          <label className="mb-1 block text-sm text-gray-200">Trip</label>
          <select
            value={tripId}
            onChange={(e) => {
              setTripId(e.target.value);
              cancelEdit();
            }}
            className="w-full rounded-lg border border-[#D4AF37] bg-[#3B0718] px-3 py-2 text-white"
          >
            <option value="" className="bg-[#3B0718] text-white">
              General (no trip)
            </option>
            {trips.map((t) => {
              const id = t.id || t._id;
              return (
                <option
                  key={id}
                  value={id}
                  className="bg-[#3B0718] text-white"
                >
                  {t.title || t.destination || "Trip"}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {loading && !summary ? (
        <p className="mt-6 text-gray-600">Loading...</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[#D4AF37]/60 p-5">
              <p className="text-sm text-gray-500">Budget</p>
              <p className="mt-1 text-2xl font-extrabold text-[#3B0718]">
                {currency} {money(budget)}
              </p>
            </div>
            <div className="rounded-2xl border border-[#D4AF37]/60 p-5">
              <p className="text-sm text-gray-500">Total spent</p>
              <p className="mt-1 text-2xl font-extrabold text-[#3B0718]">
                {currency} {money(spent)}
              </p>
            </div>
            <div
              className={`rounded-2xl border p-5 ${
                overBudget
                  ? "border-red-300 bg-red-50"
                  : "border-[#D4AF37]/60"
              }`}
            >
              <p className="text-sm text-gray-500">Remaining</p>
              <p
                className={`mt-1 text-2xl font-extrabold ${
                  overBudget ? "text-red-700" : "text-[#3B0718]"
                }`}
              >
                {currency} {money(remaining)}
              </p>
            </div>
          </div>

          {budget > 0 && (
            <div className="mt-4">
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full ${
                    overBudget ? "bg-red-600" : "bg-[#D4AF37]"
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-1 text-sm text-gray-600">
                {summary?.percentUsed || 0}% budget used
                {overBudget && " — budget se zyada kharcha ho gaya!"}
              </p>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <form
              onSubmit={saveBudget}
              className="rounded-2xl border border-[#D4AF37]/60 p-5"
            >
              <h2 className="text-lg font-bold text-[#3B0718]">Set Budget</h2>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder="Budget"
                  className={`${inputCls} col-span-2`}
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={inputCls}
                >
                  {["PKR", "USD", "EUR", "GBP", "AED", "SAR"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="mt-3 rounded-lg border border-[#D4AF37] bg-[#3B0718] px-4 py-2 font-semibold text-white hover:text-[#D4AF37]"
              >
                Save Budget
              </button>
            </form>

            <form
              onSubmit={saveExpense}
              className="rounded-2xl border border-[#D4AF37]/60 p-5"
            >
              <h2 className="text-lg font-bold text-[#3B0718]">
                {editingId ? "Edit Expense" : "Add Expense"}
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className={inputCls}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder={`Amount (${currency})`}
                  className={inputCls}
                />
                <input
                  type="date"
                  value={form.expenseDate}
                  onChange={(e) =>
                    setForm({ ...form, expenseDate: e.target.value })
                  }
                  className={inputCls}
                />
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Description"
                  className={inputCls}
                />
              </div>
              <div className="mt-3 flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg border border-[#D4AF37] bg-[#3B0718] px-4 py-2 font-semibold text-white hover:text-[#D4AF37] disabled:opacity-60"
                >
                  {saving ? "Saving..." : editingId ? "Update" : "Add Expense"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {expenses.length > 0 && (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-[#D4AF37]/60 p-5">
                <h2 className="text-lg font-bold text-[#3B0718]">
                  Spending by category
                </h2>
                <div className="mt-3 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={95}
                        label
                      >
                        {pieData.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => `${currency} ${money(v)}`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-[#D4AF37]/60 p-5">
                <h2 className="text-lg font-bold text-[#3B0718]">
                  Daily spending
                </h2>
                <div className="mt-3 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dayData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(v) => `${currency} ${money(v)}`} />
                      <Bar dataKey="total" fill="#D4AF37" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-[#D4AF37]/60 p-5">
            <h2 className="text-lg font-bold text-[#3B0718]">All expenses</h2>

            {expenses.length === 0 ? (
              <p className="mt-3 text-gray-600">
                Abhi koi expense nahi. Upar form se pehla expense add karein.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Category</th>
                      <th className="py-2 pr-3">Description</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{item.expenseDate}</td>
                        <td className="py-2 pr-3">
                          <span
                            className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: colorOf(item.category) }}
                          />
                          {labelOf(item.category)}
                        </td>
                        <td className="py-2 pr-3">{item.description || "—"}</td>
                        <td className="py-2 pr-3 text-right font-semibold">
                          {item.currency} {money(item.amount)}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => startEdit(item)}
                            className="mr-3 font-semibold text-[#701C35] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => removeExpense(item.id)}
                            className="font-semibold text-red-700 hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}