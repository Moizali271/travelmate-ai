import { createContext, useContext, useEffect, useState } from "react";
import { API_BASE, authFetch } from "../services/authFetch";

const AuthContext = createContext(null);

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

  async function loginWithGoogle(credential) {
    const res = await fetch(`${API_BASE}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    if (!res.ok) throw new Error("Login nahi ho saka");
    const data = await res.json();
    localStorage.setItem("token", data.token);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}