import { BrowserRouter, Routes, Route } from "react-router-dom";

import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import TripPlanner from "./pages/TripPlanner";
import ItineraryEditor from "./pages/ItineraryEditor";
import AiPlanner from "./pages/AiPlanner";
import Hotels from "./pages/Hotels";
import MapPage from "./pages/MapPage";
import Expenses from "./pages/Expenses";
import Bookings from "./pages/Bookings";
import Account from "./pages/Account";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/planner" element={<TripPlanner />} />
          <Route path="/trips/:id/itinerary" element={<ItineraryEditor />} />
          <Route path="/trips/:id/ai-planner" element={<AiPlanner />} />
          <Route path="/hotels" element={<Hotels />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/account" element={<Account />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}