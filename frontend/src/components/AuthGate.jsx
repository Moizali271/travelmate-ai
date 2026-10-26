import { useEffect, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";
import ChangePasswordForm from "./ChangePasswordForm";

const EXPIRED_KEY = "sessionExpiredMessage";

function readExpiredMessage() {
  try {
    return sessionStorage.getItem(EXPIRED_KEY) || "";
  } catch {
    return "";
  }
}

export default function AuthGate({ children }) {
  const { user, loading, loginWithGoogle, login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice] = useState(readExpiredMessage);

  // Message ek baar dikhane ke baad hata do
  useEffect(() => {
    try {
      sessionStorage.removeItem(EXPIRED_KEY);
    } catch {
      // storage band ho to koi baat nahi
    }
  }, []);

  if (loading) return <p className="p-10 text-gray-500">Loading...</p>;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!user && mode === "change") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-4xl font-bold text-blue-600">TravelMate AI</h1>
        <p className="text-gray-600">Apna password badlein</p>

        <div className="w-full max-w-sm">
          <ChangePasswordForm
            defaultEmail={email}
            onBack={() => {
              setError("");
              setPassword("");
              setMode("login");
            }}
          />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-4xl font-bold text-blue-600">TravelMate AI</h1>
        <p className="text-gray-600">
          {mode === "login" ? "Apne account mein login karein" : "Naya account banayein"}
        </p>

        {notice && (
          <p className="w-full max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            {notice}
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-white p-6 shadow"
        >
          {mode === "register" && (
            <input
              className="rounded border border-gray-300 px-3 py-2"
              placeholder="Poora naam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              autoComplete="name"
            />
          )}
          <input
            type="email"
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            className="rounded border border-gray-300 px-3 py-2"
            placeholder="Password (kam az kam 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-blue-600 px-3 py-2 font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Intezar karein..." : mode === "login" ? "Login" : "Register"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            className="text-sm text-blue-600 underline"
            onClick={() => {
              setError("");
              setMode(mode === "login" ? "register" : "login");
            }}
          >
            {mode === "login"
              ? "Account nahi hai? Register karein"
              : "Pehle se account hai? Login karein"}
          </button>
          {mode === "login" && (
            <button
              type="button"
              className="text-sm text-blue-600 underline"
              onClick={() => {
                setError("");
                setMode("change");
              }}
            >
              Password badalna hai?
            </button>
          )}
        </form>

        <p className="text-sm text-gray-500">ya</p>
        <GoogleLogin
          onSuccess={async (res) => {
            try {
              setError("");
              await loginWithGoogle(res.credential);
            } catch (e) {
              setError(e.message);
            }
          }}
          onError={() => setError("Google login fail ho gaya")}
        />
      </div>
    );
  }

  return <>{children}</>;
}