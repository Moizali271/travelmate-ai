import { createContext, useContext, useEffect, useState } from "react";
import { API_BASE, authFetch } from "../services/authFetch";

const AuthContext = createContext(null);

async function postAuth(path, payload, fallbackMsg) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = fallbackMsg;
    try {
      const err = await res.json();
      if (typeof err.detail === "string") msg = err.detail;
    } catch {
      // json nahi mila
    }
    throw new Error(msg);
  }
  return res.json();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function restore() {
      if (!localStorage.getItem("token")) {
        setLoading(false);
        return;
      }
      try {
        const res = await authFetch("/api/auth/me");
        if (res.ok) setUser(await res.json());
      } catch {
        // backend band hai, login screen dikhegi
      } finally {
        setLoading(false);
      }
    }
    restore();
  }, []);

  function saveSession(data) {
    localStorage.setItem("token", data.token);
    setUser(data.user);
  }

  async function loginWithGoogle(credential) {
    saveSession(
      await postAuth("/api/auth/google", { credential }, "Google login nahi ho saka")
    );
  }

  async function login(email, password) {
    saveSession(
      await postAuth("/api/auth/login", { email, password }, "Login nahi ho saka")
    );
  }

  async function register(name, email, password) {
    saveSession(
      await postAuth(
        "/api/auth/register",
        { name, email, password },
        "Register nahi ho saka"
      )
    );
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, loginWithGoogle, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}