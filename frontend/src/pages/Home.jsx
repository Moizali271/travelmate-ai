

import { Link } from "react-router-dom";

const destinations = [
  {
    name: "Hunza Valley",
    country: "Gilgit-Baltistan, Pakistan",
    image:
      "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Skardu",
    country: "Gilgit-Baltistan, Pakistan",
    image:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Swat Valley",
    country: "Khyber Pakhtunkhwa, Pakistan",
    image:
      "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=900&q=80",
  },
];

export default function Home() {
  return (
    <div className="space-y-16 pb-10">

      {/* Hero Section */}
      <section
        className="relative overflow-hidden rounded-3xl bg-cover bg-center px-6 py-24 text-white sm:px-12 sm:py-32"
        style={{
          backgroundImage:
            "linear-gradient(rgba(36,4,14,.65),rgba(36,4,14,.72)),url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1800&q=85')",
        }}
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 font-semibold uppercase tracking-widest text-[#D4AF37]">
            Welcome to TravelMate AI
          </p>

          <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">
            Your Journey,
            <br />
            Your Story.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base text-gray-100 sm:text-lg">
            Discover amazing places, plan your trips, explore hotels
            and manage your travel budget — all in one place.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/explore"
              className="rounded-xl bg-[#D4AF37] px-6 py-3 font-bold text-[#24040E] transition hover:bg-[#F7EAC0]"
            >
              Explore Destinations →
            </Link>

            <Link
              to="/planner"
              className="rounded-xl border border-[#D4AF37] px-6 py-3 font-semibold text-white transition hover:bg-[#D4AF37] hover:text-[#24040E]"
            >
              Plan My Trip
            </Link>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="text-center">
        <p className="font-semibold uppercase tracking-widest text-[#701C35]">
          About Us
        </p>

        <h2 className="mt-3 text-3xl font-bold text-[#3B0718]">
          Travel Smarter with TravelMate AI
        </h2>

        <p className="mx-auto mt-4 max-w-3xl leading-7 text-[#746B70]">
          TravelMate AI is a travel planning platform designed to help
          you discover destinations, explore travel photos and videos,
          organize your itinerary, find hotels and keep track of expenses.
          Our goal is to make trip planning easier and more organized.
        </p>
      </section>

      {/* Popular Destinations */}
      <section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-semibold uppercase tracking-widest text-[#701C35]">
              Explore Pakistan
            </p>

            <h2 className="mt-2 text-3xl font-bold text-[#3B0718]">
              Popular Destinations
            </h2>
          </div>

          <Link
            to="/explore"
            className="font-semibold text-[#701C35] transition hover:text-[#D4AF37]"
          >
            View All →
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((place) => (
            <article
              key={place.name}
              className="overflow-hidden rounded-2xl border border-[#D4AF37]/40 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <img
                src={place.image}
                alt={place.name}
                className="h-52 w-full object-cover"
                loading="lazy"
              />

              <div className="p-5">
                <h3 className="text-xl font-bold text-[#3B0718]">
                  {place.name}
                </h3>

                <p className="mt-2 text-sm text-[#746B70]">
                  📍 {place.country}
                </p>

                <Link
                  to="/explore"
                  className="mt-4 inline-block font-semibold text-[#701C35] transition hover:text-[#D4AF37]"
                >
                  Explore destination →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="rounded-3xl border border-[#D4AF37]/30 bg-[#FFFDF8] px-6 py-10 sm:px-10">
        <div className="text-center">
          <p className="font-semibold uppercase tracking-widest text-[#701C35]">
            How It Works
          </p>

          <h2 className="mt-3 text-3xl font-bold text-[#3B0718]">
            Plan Your Trip in 4 Easy Steps
          </h2>
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: "🔎",
              title: "Discover",
              description: "Search destinations and explore photos and videos.",
            },
            {
              icon: "🗺️",
              title: "Explore Maps",
              description: "View destinations and discover nearby attractions.",
            },
            {
              icon: "🗓️",
              title: "Plan Your Trip",
              description: "Organize your travel plan and itinerary.",
            },
            {
              icon: "💰",
              title: "Track Budget",
              description: "Record expenses and monitor your travel budget.",
            },
          ].map((step, index) => (
            <div key={step.title} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F7EAC0] text-3xl">
                {step.icon}
              </div>

              <p className="mt-3 text-sm font-bold text-[#701C35]">
                STEP {index + 1}
              </p>

              <h3 className="mt-2 text-lg font-bold text-[#3B0718]">
                {step.title}
              </h3>

              <p className="mt-2 text-sm leading-6 text-[#746B70]">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Call to Action */}
      <section className="rounded-3xl bg-[#3B0718] px-6 py-12 text-center text-white sm:px-10">
        <p className="font-semibold uppercase tracking-widest text-[#D4AF37]">
          Your Next Adventure
        </p>

        <h2 className="mt-3 text-3xl font-bold">
          Ready for Your Next Adventure?
        </h2>

        <p className="mx-auto mt-4 max-w-xl text-gray-200">
          Start exploring new places and create a travel plan that
          works for you.
        </p>

        <Link
          to="/planner"
          className="mt-7 inline-block rounded-xl bg-[#D4AF37] px-6 py-3 font-bold text-[#24040E] transition hover:bg-[#F7EAC0]"
        >
          Start Planning →
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-[#D4AF37] pt-6 text-center text-sm text-[#746B70]">
        <p className="text-lg font-bold text-[#3B0718]">
          TravelMate <span className="text-[#D4AF37]">AI</span>
        </p>

        <p className="mt-2">
          Discover places. Plan smarter. Travel better.
        </p>

        <p className="mt-3 font-semibold text-[#701C35]">
          Design by Mohammad Shoaib Khan
        </p>
      </footer>
    </div>
  );
}
