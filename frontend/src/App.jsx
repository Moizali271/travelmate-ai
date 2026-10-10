import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Explore from "./pages/Explore";
import TripPlanner from "./pages/TripPlanner";
import Hotels from "./pages/Hotels";
import MapPage from "./pages/MapPage";
import Expenses from "./pages/Expenses";

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main className="mx-auto max-w-5xl p-4">
        <Routes>
          <Route path="/" element={<Explore />} />
          <Route path="/planner" element={<TripPlanner />} />
          <Route path="/hotels" element={<Hotels />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/expenses" element={<Expenses />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
