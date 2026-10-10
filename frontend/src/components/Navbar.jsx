import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Explore" },
  { to: "/planner", label: "Trip Planner" },
  { to: "/hotels", label: "Hotels" },
  { to: "/map", label: "Map" },
  { to: "/expenses", label: "Expenses" },
];

export default function Navbar() {
  return (
    <nav className="bg-blue-600 text-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 p-4">
        <span className="text-xl font-bold">TravelMate AI</span>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end
            className={({ isActive }) =>
              isActive ? "font-bold underline" : "opacity-80 hover:opacity-100"
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}