import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";

export default function AuthGate({ children }) {
  const { user, loading, loginWithGoogle, logout } = useAuth();
  const [error, setError] = useState("");

  if (loading) return <p className="p-10 text-gray-500">Loading...</p>;

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-4xl font-bold text-blue-600">TravelMate AI</h1>
        <p className="text-gray-600">Aage barhne ke liye Google se login karein</p>
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
        {error && <p className="text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end gap-3 bg-gray-100 px-4 py-2 text-sm">
        {user.picture && (
          <img
            src={user.picture}
            alt=""
            referrerPolicy="no-referrer"
            className="h-6 w-6 rounded-full"
          />
        )}
        <span>{user.name}</span>
        <button onClick={logout} className="rounded bg-gray-300 px-2 py-1">
          Logout
        </button>
      </div>
      {children}
    </>
  );
}