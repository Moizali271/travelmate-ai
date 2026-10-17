import { useState } from "react";

const API_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function ChangePasswordForm({ defaultEmail = "", onBack }) {
  const [email, setEmail] = useState(defaultEmail);
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
      const res = await fetch(`${API_URL}/api/auth/change-password-public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          currentPassword: current,
          newPassword: next,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const detail = Array.isArray(body.detail)
          ? body.detail.map((d) => d.msg).join(", ")
          : body.detail;
        throw new Error(detail || "Password change nahi ho saka.");
      }

      setSuccess(body.message || "Password change ho gaya!");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err.message || "Server se rabta nahi ho saka.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-600";

  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl bg-white p-8 shadow-sm">
      <h2 className="text-center text-xl font-bold text-gray-900">
        Password badlein
      </h2>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={inputCls}
          required
        />
        <input
          type={show ? "text" : "password"}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Purana password"
          className={inputCls}
          required
        />
        <input
          type={show ? "text" : "password"}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Naya password (kam az kam 6 characters)"
          className={inputCls}
          required
        />
        <input
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Naya password dobara likhein"
          className={inputCls}
          required
        />

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
          />
          Password dikhayein
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-blue-600 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Saving..." : "Password change karein"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-gray-500">
        Purana password bhool gaye? Iske liye email service chahiye, wo
        abhi available nahi hai.
      </p>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onBack}
          className="text-blue-600 underline"
        >
          ← Login par wapas jayein
        </button>
      </div>
    </div>
  );
}