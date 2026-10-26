import { useState } from "react";
import { authFetch } from "../services/authFetch";
import { useAuth } from "../context/AuthContext";

export default function Account() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (next.length < 6) {
      setError("Naya password kam az kam 6 characters ka ho.");
      return;
    }
    if (next !== confirm) {
      setError("Naya password aur confirm password mel nahi khate.");
      return;
    }

    setBusy(true);
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = Array.isArray(body.detail)
          ? body.detail.map((d) => d.msg).join(", ")
          : body.detail;
        throw new Error(detail || "Password change nahi ho saka.");
      }

      setSuccess("Password change ho gaya!");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#D4AF37] focus:outline-none";

  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-[#D4AF37] bg-[#3B0718] p-6 text-white sm:p-8">
        <h1 className="text-3xl font-bold text-[#D4AF37]">My Account</h1>
        <p className="mt-3 text-gray-200">
          {user?.name} · {user?.email}
        </p>
        {user?.role === "admin" && (
          <span className="mt-3 inline-block rounded-full bg-[#D4AF37] px-3 py-1 text-xs font-bold text-[#3B0718]">
            ADMIN
          </span>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="max-w-lg rounded-2xl border border-[#D4AF37]/60 p-5 sm:p-6"
      >
        <h2 className="text-lg font-bold text-[#3B0718]">Password badlein</h2>

        <div className="mt-4 space-y-3">
          <input
            type={show ? "text" : "password"}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Purana password"
            className={inputCls}
            autoComplete="current-password"
            required
          />
          <input
            type={show ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="Naya password (kam az kam 6 characters)"
            className={inputCls}
            autoComplete="new-password"
            required
          />
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Naya password dobara likhein"
            className={inputCls}
            autoComplete="new-password"
            required
          />
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
          />
          Password dikhayein
        </label>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-lg border border-[#D4AF37] bg-[#3B0718] px-4 py-2 font-semibold text-white hover:text-[#D4AF37] disabled:opacity-60"
        >
          {busy ? "Saving..." : "Change Password"}
        </button>

        <p className="mt-3 text-xs text-gray-500">
          Google se login karne walon ka password yahan change nahi hota.
          Password badalne ke baad purane tokens band ho jate hain, isliye
          doosri jagah dobara login karna pad sakta hai.
        </p>
      </form>
    </div>
  );
}