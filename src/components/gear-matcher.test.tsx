// @vitest-environment jsdom
//
// Component test: runs ONLY in jsdom via the pragma above.
//
// T2.1 characterization: pins the gear-matching select for each entity — it
// lists the passed gear options and, on selection, calls the entity's OWN
// server action (setShoeGearAction for shoes, setBikeGearAction for bikes) with
// (id, gearId). A convergence that cross-wires the action goes RED.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GearMatcher } from "@/components/settings-forms";

const { setShoeGearAction, setBikeGearAction } = vi.hoisted(() => ({
  setShoeGearAction: vi
    .fn<(id: number, gearId: string | null) => Promise<{ ok: true }>>()
    .mockResolvedValue({ ok: true }),
  setBikeGearAction: vi
    .fn<(id: number, gearId: string | null) => Promise<{ ok: true }>>()
    .mockResolvedValue({ ok: true }),
}));

vi.mock("@/features/gear/server/actions", () => ({
  setShoeGearAction,
  setBikeGearAction,
}));
vi.mock("@/features/activities/server/actions", () => ({ createManualActivityAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix Select needs a few DOM APIs jsdom omits.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  setShoeGearAction.mockClear();
  setBikeGearAction.mockClear();
});

const gear = [
  { id: "g1", name: "Gel Shoe", distance: 100_000, retired: false },
  { id: "g2", name: "Road Bike", distance: 500_000, retired: false },
];

async function pickOption(optionName: string) {
  const trigger = screen.getByRole("combobox");
  // Radix Select opens from the keyboard reliably in jsdom (pointer capture is
  // only partially polyfilled). ArrowDown opens the listbox.
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const option = await screen.findByRole("option", { name: new RegExp(optionName, "i") });
  fireEvent.click(option);
}

describe("GearMatcher (shoes -> setShoeGearAction)", () => {
  it("lists the gear options and links the shoe via its own action", async () => {
    render(
      <GearMatcher
        kind="shoe"
        items={[{ id: 7, name: "Superblast", role: "easy", retired: false, gearId: null }]}
        gear={gear}
      />
    );

    expect(screen.getByText("Superblast")).toBeTruthy();
    expect(screen.getByText("easy")).toBeTruthy();

    await pickOption("Gel Shoe");

    await waitFor(() => expect(setShoeGearAction).toHaveBeenCalledWith(7, "g1"));
    expect(setBikeGearAction).not.toHaveBeenCalled();
  });
});

describe("GearMatcher kind=bike (bikes -> setBikeGearAction)", () => {
  it("lists the gear options and links the bike via its own action", async () => {
    render(
      <GearMatcher
        kind="bike"
        items={[{ id: 3, name: "TR10", role: "road", retired: false, gearId: null }]}
        gear={gear}
      />
    );

    expect(screen.getByText("TR10")).toBeTruthy();

    await pickOption("Road Bike");

    await waitFor(() => expect(setBikeGearAction).toHaveBeenCalledWith(3, "g2"));
    expect(setShoeGearAction).not.toHaveBeenCalled();
  });
});
