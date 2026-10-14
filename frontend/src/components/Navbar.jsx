
import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/explore", label: "Explore" },
  { to: "/planner", label: "Trip Planner" },
  { to: "/hotels", label: "Hotels" },
  { to: "/bookings", label: "My Bookings" },
  { to: "/map", label: "Map" },
  { to: "/expenses", label: "Expenses" },
];

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-[#D4AF37]/40 bg-[#3B0718] text-white shadow-lg">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4">
        <NavLink
          to="/"
          className="text-2xl font-extrabold tracking-wide text-[#D4AF37] transition hover:text-[#F7EAC0]"
        >
          TravelMate <span className="text-white">AI</span>
        </NavLink>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `border-b-2 pb-1 text-sm font-semibold transition duration-200 sm:text-base ${
                  isActive
                    ? "border-[#D4AF37] text-[#D4AF37]"
                    : "border-transparent text-white hover:border-[#D4AF37] hover:text-[#D4AF37]"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
