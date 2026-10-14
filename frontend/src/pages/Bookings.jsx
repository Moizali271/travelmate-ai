
import { useCallback, useEffect, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token")
  );
}

function formatDate(value) {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState("");

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = getToken();

      if (!token) {
        setError("Login session nahi mili. Please log in again.");
        return;
      }

      const response = await fetch(`${API_URL}/api/bookings`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Login session expire ho gayi. Dobara login karein.");
        }
        throw new Error("Bookings load nahi ho sakin.");
      }

      const data = await response.json();
      setBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Backend se connection nahi ho saka.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  async function cancelBooking(id) {
    const confirmed = window.confirm(
      "Kya aap is booking ko cancel karna chahte hain?"
    );

    if (!confirmed) return;

    setActionId(id);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/bookings/${id}/cancel`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Booking cancel nahi ho saki.");
      }

      await loadBookings();
    } catch (err) {
      setError(err.message || "Booking cancel nahi ho saki.");
    } finally {
      setActionId("");
    }
  }

  if (loading) {
    return (
      <section className="py-10">
        <h1 className="text-3xl font-extrabold text-[#3B0718]">
          My Bookings
        </h1>
        <p className="mt-4 text-gray-600">Bookings load ho rahi hain...</p>
      </section>
    );
  }

  return (
    <section className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-[#3B0718]">
            My Bookings
          </h1>
          <p className="mt-2 text-gray-600">
            Apni saved hotel reservation requests dekhein.
          </p>
        </div>

        <button
          onClick={loadBookings}
          className="rounded-lg border border-[#D4AF37] bg-[#3B0718] px-4 py-2 font-semibold text-white hover:text-[#D4AF37]"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {!error && bookings.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-[#D4AF37] bg-[#FFFDF8] p-8 text-center">
          <p className="text-4xl">🏨</p>
          <h2 className="mt-3 text-xl font-bold text-[#3B0718]">
            No bookings yet
          </h2>
          <p className="mt-2 text-gray-600">
            Hotels page par ja kar hotel select karein aur Reserve Stay karein.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {bookings.map((booking) => (
          <article
            key={booking.id}
            className="rounded-2xl border border-[#D4AF37]/60 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-[#3B0718]">
                  {booking.hotelName || "Hotel"}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {booking.destination || booking.address || ""}
                </p>
              </div>

              <span className="rounded-full bg-[#FFF3CD] px-3 py-1 text-sm font-bold capitalize text-[#701C35]">
                {booking.status || "requested"}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <p>
                <strong>Reference:</strong> {booking.reference || booking.id}
              </p>
              <p>
                <strong>Check-in:</strong> {formatDate(booking.checkIn)}
              </p>
              <p>
                <strong>Check-out:</strong> {formatDate(booking.checkOut)}
              </p>
              <p>
                <strong>Guests:</strong> {booking.guests ?? "—"} ·{" "}
                <strong>Rooms:</strong> {booking.rooms ?? "—"}
              </p>
              <p>
                <strong>Guest name:</strong> {booking.guestName || "—"}
              </p>
              <p>
                <strong>Phone:</strong> {booking.phone || "—"}
              </p>

              {booking.totalPrice != null && (
                <p>
                  <strong>Estimated total:</strong>{" "}
                  {booking.currency || "PKR"} {booking.totalPrice}
                </p>
              )}

              {booking.confirmationNumber && (
                <p>
                  <strong>Confirmation number:</strong>{" "}
                  {booking.confirmationNumber}
                </p>
              )}

              {booking.notes && (
                <p>
                  <strong>Notes:</strong> {booking.notes}
                </p>
              )}
            </div>

            {booking.status !== "cancelled" && (
              <button
                onClick={() => cancelBooking(booking.id)}
                disabled={actionId === booking.id}
                className="mt-5 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {actionId === booking.id ? "Cancelling..." : "Cancel Booking"}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
