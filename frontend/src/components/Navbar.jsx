import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/explore", label: "Explore" },
  { to: "/planner", label: "Trip Planner" },
  { to: "/hotels", label: "Hotels" },
  { to: "/bookings", label: "My Bookings" },
  { to: "/map", label: "Map" },
  { to: "/expenses", label: "Expenses" },
];

function isActive(pathname, to) {
  if (to === "/") return pathname === "/";
  if (to === "/planner") {
    return pathname === "/planner" || pathname.startsWith("/trips/");
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

function Avatar({ user }) {
  if (!user?.picture) return null;
  return (
    <img
      src={user.picture}
      alt=""
      referrerPolicy="no-referrer"
      className="h-8 w-8 rounded-full border border-[#D4AF37]/60"
    />
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Page badalne par menu band
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape dabane par menu band
  useEffect(() => {
    if (!open) return undefined;

    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="relative bg-[#3B0718] shadow-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="text-2xl font-extrabold tracking-tight sm:text-3xl"
        >
          <span className="text-[#D4AF37]">TravelMate</span>{" "}
          <span className="text-white">AI</span>
        </Link>

        {/* Desktop links */}
        <nav className="hidden items-center gap-6 xl:flex" aria-label="Main">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`border-b-2 pb-1 font-semibold transition ${
                  active
                    ? "border-[#D4AF37] text-[#D4AF37]"
                    : "border-transparent text-white hover:text-[#D4AF37]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop: naam, Account, Logout */}
        <div className="hidden items-center gap-3 xl:flex">
          <Avatar user={user} />
          <span className="max-w-[140px] truncate text-sm text-white">
            {user?.name}
          </span>
          <Link
            to="/account"
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
              pathname === "/account"
                ? "border-[#D4AF37] bg-[#D4AF37] text-[#3B0718]"
                : "border-[#D4AF37]/60 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#3B0718]"
            }`}
          >
            Account
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg bg-[#D4AF37] px-3 py-1.5 text-sm font-bold text-[#3B0718] transition hover:bg-white"
          >
            Logout
          </button>
        </div>

        {/* Mobile: 3 lines ka button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Menu band karein" : "Menu kholein"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="rounded-lg border border-[#D4AF37]/60 p-2 text-[#D4AF37] transition hover:bg-white/10 xl:hidden"
        >
          {open ? (
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="border-t border-[#D4AF37]/30 xl:hidden"
        >
          <ul className="mx-auto max-w-7xl px-2 py-2 sm:px-4">
            {LINKS.map((link) => {
              const active = isActive(pathname, link.to);
              return (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    onClick={() => setOpen(false)}
                    className={`block rounded-lg px-4 py-3 text-base font-semibold transition ${
                      active
                        ? "bg-white/10 text-[#D4AF37]"
                        : "text-white hover:bg-white/10"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                to="/account"
                onClick={() => setOpen(false)}
                className={`block rounded-lg px-4 py-3 text-base font-semibold transition ${
                  pathname === "/account"
                    ? "bg-white/10 text-[#D4AF37]"
                    : "text-white hover:bg-white/10"
                }`}
              >
                Account (password badlein)
              </Link>
            </li>
          </ul>

          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 border-t border-[#D4AF37]/30 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar user={user} />
              <span className="truncate text-sm text-white">{user?.name}</span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-bold text-[#3B0718] transition hover:bg-white"
            >
              Logout
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}