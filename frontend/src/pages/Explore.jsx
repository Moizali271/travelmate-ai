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
    // json nahi mila
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
    <div className="overflow-hidden rounded-xl bg-white shadow">
      {showPhoto ? (
        <img
          src={place.photo_url}
          alt={place.name}
          onError={() => setImgFailed(true)}
          className="h-44 w-full object-cover"
        />
      ) : (
        <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-blue-100 to-blue-300 text-5xl">
          🌍
        </div>
      )}
      <div className="flex flex-col gap-2 p-4">
        <h3 className="text-lg font-semibold">{place.name}</h3>
        <p className="text-xs text-gray-500">{place.display_name}</p>
        {place.type && (
          <span className="w-fit rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
            {place.type.replace(/_/g, " ")}
          </span>
        )}
        <p className="line-clamp-4 text-sm text-gray-700">
          {place.description || "Is jagah ki tafseel abhi maujood nahi."}
        </p>
        <p className="text-xs text-gray-500">
          📍 {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => onVideos(place.name)}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
          >
            Videos dekhein
          </button>
          {place.wiki_url && (
            <a
              href={place.wiki_url}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-gray-200 px-3 py-1 text-sm"
            >
              Wikipedia
            </a>
          )}
        </div>
      </div>
    </div>
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
      setError("Kam az kam 2 harf likhein");
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
      if (!res.ok) throw new Error(await readError(res, "Search nahi ho saka"));
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
    if (query.trim().length >= 2) runSearch(id);
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
      if (!res.ok) throw new Error(await readError(res, "Videos nahi mil sakin"));
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
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-3xl font-bold">Explore</h1>

      <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
        <input
          className="flex-1 rounded border border-gray-300 px-3 py-2"
          placeholder="Jagah likhein (jaise Hunza, Lahore, Murree)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Dhoond rahe hain..." : "Search"}
        </button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => pickCategory(c.id)}
            className={`rounded-full px-3 py-1 text-sm ${
              category === c.id ? "bg-blue-600 text-white" : "bg-gray-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      {videoFor && (
        <div className="mb-6 rounded-xl bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Videos: {videoFor}</h2>
            <button
              onClick={() => setVideoFor("")}
              className="rounded bg-gray-300 px-2 py-1 text-sm"
            >
              Band karein
            </button>
          </div>
          {videosLoading && <p className="text-gray-500">Videos load ho rahi hain...</p>}
          {!videosLoading && videosMsg && <p className="text-gray-600">{videosMsg}</p>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-lg bg-white shadow"
              >
                {v.thumbnail && (
                  <img src={v.thumbnail} alt={v.title} className="w-full" />
                )}
                <div className="p-2">
                  <p className="text-sm font-medium">{v.title}</p>
                  <p className="text-xs text-gray-500">{v.channel}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {!loading && searched && results.length === 0 && !error && (
        <p className="text-gray-600">Koi nateeja nahi mila. Doosra naam ya category try karein.</p>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((p) => (
          <DestinationCard key={p.id} place={p} onVideos={loadVideos} />
        ))}
      </div>
    </div>
  );
}