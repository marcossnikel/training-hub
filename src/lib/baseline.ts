// The sole owner's baseline gear fixtures: the ONE place to change
// or remove when the app becomes multi-user. Kept out of the shared db.ts
// runtime per G5.7 (personal data does not belong in shared code); db.ts imports
// these and seeds them on a fresh database.

export interface BaselineBike {
  name: string;
  role: string;
  photo: string;
  initial_km: number;
}

export interface BaselineShoe {
  name: string;
  initial_km: number;
  role: string;
}

// Real bikes with their current Strava odometers as baseline. The TR10 is the
// trainer bike: its 33.4 km are the virtual rides already in the hub, so its
// baseline is 0 and those confirmed rides supply the distance. The Stamina's
// 467 km is outdoor history that lives in the log as pre-baseline (uncounted),
// so its baseline carries that total.
export const BASELINE_BIKES: BaselineBike[] = [
  { name: "TSW TR10 Speed Bike", role: "road", photo: "bike-tsw-tr10-one.png", initial_km: 0 },
  {
    name: "TSW Stamina 2025",
    role: "mountain bike",
    photo: "bike-tsw-stamina.png",
    initial_km: 467,
  },
];

// Real shoes with corrected current mileage (includes the 18 km moved from the
// Adios Pro 4 to the Superblast 3). Inserted only when the shoes table is empty.
export const BASELINE_SHOES: BaselineShoe[] = [
  { name: "Adidas Adios Pro 4", initial_km: 196.1, role: "race day / race pace trainings" },
  { name: "Adidas Drive RC", initial_km: 474.1, role: "intervals" },
  { name: "Adidas Evo SL Preto e Branco", initial_km: 452.6, role: "everyday shoe" },
  { name: "Adidas Evo SL Preto e Cinza", initial_km: 236.2, role: "everyday shoe" },
  {
    name: "ASICS Superblast 3",
    initial_km: 291.9,
    role: "easy runs, long runs, injury recovery shoe",
  },
  { name: "Salomon S/Lab Ultra 3 V2", initial_km: 141.1, role: "trail shoe" },
];
