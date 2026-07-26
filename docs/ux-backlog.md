# UX backlog

Small UX / navigation ideas, not tied to a specific feature. Pick up any time.

## Single "Gear" page (merge Bikes + Shoes) — done
Shipped in commit `ee6737d`: `src/app/gear/page.tsx` renders both collections behind Shoes / Bikes
pills (`/gear?tab=bikes`), the header nav carries one **Gear** entry, and `/shoes` and `/bikes` are
redirects. Original note below, kept for context.

Today the nav has separate **Shoes** and **Bikes** entries. Replace them with one **Gear** page that shows both (tabs or two sections: Shoes, Bikes). This is a small UI change, not a data change: the shoe/bike code was already converged into one parameterized `Gear` abstraction (see the T2.1 work — `GearCard`/`GearDialog`/`GearCollection` are `kind`-parameterized), so a unified `/gear` page just renders both collections and the nav loses one item.
- Scope: a `/gear` route with the two collections (reuse `GearCollection`), update the header nav (one "Gear" link), keep `/shoes` and `/bikes` as redirects (or drop them). i18n en+pt for the new label.
- Low risk, behavior-preserving; good candidate to bundle with any nav refresh.
