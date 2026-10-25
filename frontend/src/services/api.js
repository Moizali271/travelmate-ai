import axios from "axios";

// Baaqi saare pages ki tarah wahi variable: VITE_API_BASE_URL (bina /api ke)
export const API_ORIGIN =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
});

// Backend ke har tarah ke error (string, 422 ki list, network error) ko
// ek saaf message mein badalta hai. Istemal: setError(getErrorMessage(err))
export function getErrorMessage(error, fallback = "Kuch ghalat ho gaya, dobara try karein") {
  if (!error) return fallback;

  if (error.request && !error.response) {
    return "Server se rabta nahi ho saka. Internet ya backend check karein.";
  }

  const status = error.response?.status;
  const detail = error.response?.data?.detail;

  if (status === 401) return "Aapka session khatam ho gaya, dobara login karein.";
  if (status === 429) return typeof detail === "string" ? detail : "Bohat zyada requests, thori der baad try karein.";
  if (status >= 500 && !detail) return "Server mein masla aa gaya, thori der baad try karein.";

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => String(item?.msg || "").replace(/^Value error,\s*/i, ""))
      .filter(Boolean)
      .join(". ");
  }

  return error.message || fallback;
}

export default api;