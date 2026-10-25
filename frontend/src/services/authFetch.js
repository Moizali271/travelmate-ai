export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const SESSION_EXPIRED_KEY = "sessionExpiredMessage";
const SESSION_EXPIRED_TEXT = "Aapka session khatam ho gaya. Dobara login karein.";
const SERVER_DOWN_TEXT = "Server se rabta nahi ho saka. Internet ya backend check karein.";

let loggingOut = false;

// Backend ka "detail" string ho ya FastAPI validation ki list, dono ko saaf message banata hai
export function detailToMessage(detail, fallback = "Kuch ghalat ho gaya, dobara try karein") {
  if (typeof detail === "string" && detail.trim()) return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const text = detail
      .map((item) => String(item?.msg || "").replace(/^Value error,\s*/i, ""))
      .filter(Boolean)
      .join(". ");
    if (text) return text;
  }

  return fallback;
}

// Istemal: if (!res.ok) throw new Error(await readErrorMessage(res, "Save nahi ho saka"));
export async function readErrorMessage(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return detailToMessage(body?.detail, fallback);
}

export async function authFetch(path, options = {}) {
  const token = localStorage.getItem("token");
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    // abort (user ne khud rok diya) ko waise hi aage jaane do
    if (err?.name === "AbortError") throw err;
    throw new Error(SERVER_DOWN_TEXT);
  }

  // token tha aur server ne reject kiya, to session khatam hua
  if (res.status === 401 && token && !loggingOut) {
    loggingOut = true;
    localStorage.removeItem("token");
    try {
      sessionStorage.setItem(SESSION_EXPIRED_KEY, SESSION_EXPIRED_TEXT);
    } catch {
      // storage band ho to bhi logout chalega
    }
    window.location.reload();
  }
  return res;
}