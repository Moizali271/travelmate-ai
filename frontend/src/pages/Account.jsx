import { useEffect, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token")
  );
}

export default function Account() {
  const [profile, setProfile] = useState(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Naam aur email dikhane ke liye
  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (active) setProfile(data);
      } catch {
        if (active) setProfile(null);
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, []);

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
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
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
    <div className="min-h-screen bg-white p-6">
      <div className="rounded-2xl border border-[#D4AF37] bg-[#3B0718] p-8 text-white">
        <h1 className="text-3xl font-bold text-[#D4AF37]">My Account</h1>
        <p className="mt-3 text-gray-200">
          {profile ? `${profile.name} · ${profile.email}` : "Loading..."}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-lg rounded-2xl border border-[#D4AF37]/60 p-6"
      >
        <h2 className="text-lg font-bold text-[#3B0718]">Change Password</h2>

        <div className="mt-4 space-y-3">
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
      </form>
    </div>
  );
}