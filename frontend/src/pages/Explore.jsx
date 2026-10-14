
import { useState } from "react";
import { authFetch } from "../services/authFetch";

const CATEGORIES = [
  { id: "all", label: "Sab" },
  { id: "attractions", label: "Attractions" },
  { id: "museums", label: "Museums" },
  { id: "parks", label: "Parks" },
  { id: "beaches", label: "Beaches" },
  { id: "historic", label: "Historic" },
  { id: "food", label: "Khana" },
];

async function readError(res, fallback) {
  try {
    const data = await res.json();
    if (typeof data.detail === "string") return data.detail;
  } catch {
    // JSON response nahi mila
  }
  return fallback;
}

function friendlyError(err) {
  if (err instanceof TypeError) {
    return "Backend se rabta nahi ho raha. Check karein ke uvicorn chal raha hai.";
  }
  return err.message;
}

function DestinationCard({ place, onVideos }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = place.photo_url && !imgFailed;

  return (
    <article className="overflow-hidden rounded-2xl border border-[#D4AF37]/40 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      {showPhoto ? (
        <img
          src={place.photo_url}
          alt={place.name}
          onError={() => setImgFailed(true)}
          className="h-48 w-full object-cover"
        />
      ) : (
        <div className="flex h-48 w-full items-center justify-center bg-gradient-to-br from-[#F7EAC0] to-[#D4AF37]/50 text-5xl">
          🌍
        </div>
      )}

      <div className="flex flex-col gap-3 p-5">
        <h3 className="text-xl font-bold text-[#3B0718]">
          {place.name}
        </h3>

        <p className="text-sm text-[#746B70]">
          {place.display_name}
        </p>

        {place.type && (
          <span className="w-fit rounded-full border border-[#D4AF37]/50 bg-[#FFF8E5] px-3 py-1 text-xs font-semibold capitalize text-[#701C35]">
            {place.type.replace(/_/g, " ")}
          </span>
        )}

        <p className="line-clamp-4 text-sm leading-6 text-[#51454A]">
          {place.description ||
            "Is jagah ki tafseel abhi maujood nahi."}
        </p>

        <p className="text-xs text-[#746B70]">
          📍 {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => onVideos(place.name)}
            className="rounded-lg border border-[#D4AF37] bg-[#3B0718] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#24040E] hover:text-[#D4AF37]"
          >
            Videos Dekhein
          </button>

          {place.wiki_url && (
            <a
              href={place.wiki_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[#D4AF37]/60 bg-[#FFFDF8] px-4 py-2 text-sm font-semibold text-[#701C35] transition hover:bg-[#F7EAC0]"
            >
              Wikipedia ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Explore() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [videoFor, setVideoFor] = useState("");
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosMsg, setVideosMsg] = useState("");

  async function runSearch(cat) {
    const q = query.trim();

    if (q.length < 2) {
      setError("Kam az kam 2 harf likhein.");
      return;
    }

    setLoading(true);
    setError("");
    setVideoFor("");
    setVideos([]);

    try {
      const res = await authFetch(
        `/api/destinations/search?q=${encodeURIComponent(q)}&category=${cat}`
      );

      if (!res.ok) {
        throw new Error(
          await readError(res, "Search nahi ho saka.")
        );
      }

      const data = await res.json();
      setResults(data.results);
      setSearched(true);
    } catch (err) {
      setError(friendlyError(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runSearch(category);
  }

  function pickCategory(id) {
    setCategory(id);

    if (query.trim().length >= 2) {
      runSearch(id);
    }
  }

  async function loadVideos(name) {
    setVideoFor(name);
    setVideos([]);
    setVideosMsg("");
    setVideosLoading(true);

    try {
      const res = await authFetch(
        `/api/destinations/videos?q=${encodeURIComponent(name)}`
      );

      if (!res.ok) {
        throw new Error(
          await readError(res, "Videos nahi mil sakin.")
        );
      }

      const data = await res.json();
      setVideos(data.videos);
      setVideosMsg(data.message || "");
    } catch (err) {
      setVideosMsg(friendlyError(err));
    } finally {
      setVideosLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">

      {/* Page Heading */}
      <section className="rounded-2xl border border-[#D4AF37]/40 bg-[#3B0718] px-6 py-8 text-white shadow-md sm:px-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#D4AF37]">
          Discover Pakistan
        </p>

        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
          Explore Destinations
        </h1>

        <p className="mt-3 max-w-2xl leading-7 text-gray-200">
          Apni pasand ki jagah search karein, photos dekhein,
          videos explore karein aur apni next trip ke liye
          inspiration hasil karein.
        </p>
      </section>

      {/* Search */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-[#D4AF37]/40 bg-white p-4 shadow-sm sm:flex-row sm:p-5"
      >
        <input
          className="min-w-0 flex-1 rounded-xl border border-[#D4AF37]/50 bg-white px-4 py-3 text-[#24040E] outline-none placeholder:text-gray-400 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/30"
          placeholder="Jagah likhein (jaise Hunza, Lahore, Murree)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl border border-[#D4AF37] bg-[#3B0718] px-7 py-3 font-bold text-white transition hover:bg-[#24040E] hover:text-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Dhoond rahe hain..." : "⌕ Search"}
        </button>
      </form>

      {/* Category Filters */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#701C35]">
          Categories
        </h2>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pickCategory(c.id)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                category === c.id
                  ? "border-[#3B0718] bg-[#3B0718] text-[#D4AF37]"
                  : "border-[#D4AF37]/50 bg-white text-[#701C35] hover:bg-[#FFF8E5]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* Errors */}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}

      {/* Videos Panel */}
      {videoFor && (
        <section className="rounded-2xl border border-[#D4AF37]/50 bg-[#FFFDF8] p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#701C35]">
                Watch and Discover
              </p>

              <h2 className="mt-1 text-xl font-bold text-[#3B0718]">
                Videos: {videoFor}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setVideoFor("")}
              className="rounded-lg border border-[#D4AF37]/60 px-3 py-2 text-sm font-semibold text-[#701C35] hover:bg-[#F7EAC0]"
            >
              Band Karein ✕
            </button>
          </div>

          {videosLoading && (
            <p className="py-4 text-[#746B70]">
              Videos load ho rahi hain...
            </p>
          )}

          {!videosLoading && videosMsg && (
            <p className="mb-4 text-sm text-[#746B70]">
              {videosMsg}
            </p>
          )}

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-xl border border-[#D4AF37]/40 bg-white shadow-sm transition hover:shadow-lg"
              >
                {v.thumbnail && (
                  <img
                    src={v.thumbnail}
                    alt={v.title}
                    className="aspect-video w-full object-cover"
                    loading="lazy"
                  />
                )}

                <div className="p-4">
                  <p className="font-semibold text-[#3B0718]">
                    {v.title}
                  </p>

                  <p className="mt-2 text-xs text-[#746B70]">
                    {v.channel}
                  </p>

                  <p className="mt-3 text-sm font-bold text-[#701C35]">
                    Watch Video ↗
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Search Results */}
      {loading && (
        <p className="py-6 text-center font-medium text-[#701C35]">
          Destinations search ho rahi hain...
        </p>
      )}

      {!loading && searched && results.length === 0 && !error && (
        <div className="rounded-2xl border border-[#D4AF37]/50 bg-[#FFFDF8] p-8 text-center">
          <p className="text-4xl">🔎</p>

          <h2 className="mt-3 text-xl font-bold text-[#3B0718]">
            Koi nateeja nahi mila
          </h2>

          <p className="mt-2 text-[#746B70]">
            Doosra naam ya category try karein.
          </p>
        </div>
      )}

      {!searched && !loading && (
        <div className="rounded-2xl border border-dashed border-[#D4AF37] bg-[#FFFDF8] px-5 py-8 text-center">
          <p className="text-4xl">🧭</p>

          <h2 className="mt-3 text-xl font-bold text-[#3B0718]">
            Aap kahan jana chahte hain?
          </h2>

          <p className="mt-2 text-[#746B70]">
            Search box mein destination ka naam likh kar Explore karein.
          </p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((p) => (
          <DestinationCard
            key={p.id}
            place={p}
            onVideos={loadVideos}
          />
        ))}
      </div>
    </div>
  );
}
