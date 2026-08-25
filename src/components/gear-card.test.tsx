// @vitest-environment jsdom
//
// Component test: runs ONLY in jsdom via the pragma above.
//
// T2.1 characterization: pins the CURRENT rendered behavior of the shoe and
// bike cards so the shoe/bike -> shared-gear convergence stays behavior-
// preserving. The shoe card MUST keep its wear/retirement bits (wear meter,
// status pill, km-left) and the bike card MUST keep its indoor/outdoor +
// ride-count bits. Any convergence that drops or cross-wires those goes RED.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ShoeCard } from "@/components/shoe-card";
import { BikeCard } from "@/components/bike-card";
import { en } from "@/lib/i18n/en";
import type { BikeWithMileage, ShoeWithMileage } from "@/lib/types";

// The edit dialog + retire button rendered inside each card call useRouter().
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

const shoe: ShoeWithMileage = {
  id: 1,
  name: "ASICS Superblast 3",
  role: "easy runs",
  strava_gear_id: null,
  photo_path: null,
  initial_km: 0,
  origin: "manual",
  provider_distance_m: null,
  provider_observed_at: null,
  provider_last_seen_at: null,
  retirement_km: 700,
  retired_at: null,
  created_at: "2026-01-01T00:00:00Z",
  current_km: 210,
};

const bike: BikeWithMileage = {
  id: 2,
  name: "TSW TR10 One",
  role: "road",
  strava_gear_id: null,
  photo_path: null,
  initial_km: 0,
  origin: "manual",
  provider_distance_m: null,
  provider_observed_at: null,
  provider_last_seen_at: null,
  retired_at: null,
  created_at: "2026-01-01T00:00:00Z",
  current_km: 1234,
  indoor_km: 400,
  outdoor_km: 834,
  ride_count: 42,
};

describe("ShoeCard (shoe-specific: wear/retirement)", () => {
  it("renders name, role, mileage and the shoe wear/retirement bits", () => {
    render(<ShoeCard shoe={shoe} gearOptions={null} gearName={null} connected={false} t={en} />);

    // Shared identity.
    expect(screen.getByText("ASICS Superblast 3")).toBeTruthy();
    expect(screen.getByText("easy runs")).toBeTruthy();

    // Shoe-specific: the wear meter, the wear-status pill, and the km-left
    // readout against the retirement cap.
    expect(screen.getByRole("meter")).toBeTruthy();
    expect(screen.getByText(en.wear.fresh)).toBeTruthy();
    expect(screen.getByText("210.0")).toBeTruthy();
    expect(screen.getByText(/490 km left/i)).toBeTruthy();

    // The shoe card must NOT carry the bike-only bits.
    expect(screen.queryByText(/rides/i)).toBeNull();
    expect(screen.queryByText(/indoor/i)).toBeNull();
  });
});

describe("BikeCard (bike-specific: indoor/outdoor + ride count)", () => {
  it("renders name, role, distance and the bike indoor/outdoor + ride-count bits", () => {
    render(<BikeCard bike={bike} gearOptions={null} gearName={null} connected={false} t={en} />);

    // Shared identity.
    expect(screen.getByText("TSW TR10 One")).toBeTruthy();
    expect(screen.getByText("road")).toBeTruthy();

    // Bike-specific: the big lifetime distance, the ride count, and the
    // indoor/outdoor split breakdown.
    expect(screen.getByText("1234")).toBeTruthy();
    expect(screen.getByText("42 rides")).toBeTruthy();
    expect(screen.getByText(/400 km\s*indoor/i)).toBeTruthy();
    expect(screen.getByText(/834 km\s*outdoor/i)).toBeTruthy();

    // The bike card must NOT carry the shoe-only wear meter / status pill.
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.queryByText(en.wear.fresh)).toBeNull();
  });
});
