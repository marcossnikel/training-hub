// @vitest-environment jsdom
//
// Component test: runs ONLY in jsdom via the pragma above.
//
// T2.1 characterization: pins the CURRENT edit-dialog fields for each entity.
// The shoe dialog MUST expose a retirement-km field and shoe-namespaced labels;
// the bike dialog MUST NOT expose retirement and uses bike-namespaced labels
// ("Type" for role). A convergence that cross-wires the namespace or drops the
// shoe-only retirement field goes RED. Gear options are passed empty on purpose
// so the dialog renders its plain fields (no Radix Select popover to drive).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GearDialog } from "@/components/gear-dialog";
import { en } from "@/lib/i18n/en";

const mocks = vi.hoisted(() => ({
  saveShoeFormAction: vi.fn(),
  saveBikeFormAction: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/actions", () => ({
  saveShoeFormAction: mocks.saveShoeFormAction,
  saveBikeFormAction: mocks.saveBikeFormAction,
  saveShoeAction: vi.fn(),
  saveBikeAction: vi.fn(),
  setShoeRetiredAction: vi.fn(),
  setBikeRetiredAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

// Radix Dialog needs a few DOM APIs jsdom omits.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
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
  vi.clearAllMocks();
});

function open(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("GearDialog kind=shoe (shoe-specific: retirement)", () => {
  it("exposes name/role/baseline plus the shoe-only retirement field", () => {
    render(
      <GearDialog kind="shoe" gearOptions={[]} connected={true}>
        <button>open</button>
      </GearDialog>
    );
    open("open");

    expect(screen.getByText(en.shoeDialog.addTitle)).toBeTruthy();
    expect(screen.getByLabelText(en.shoeDialog.name)).toBeTruthy();
    expect(screen.getByLabelText(en.shoeDialog.role)).toBeTruthy(); // "Role"
    expect(screen.getByLabelText(en.shoeDialog.baseline)).toBeTruthy();

    // Shoe-only retirement cap field.
    expect(screen.getByLabelText(en.shoeDialog.retireAt)).toBeTruthy();

    // Shoe-namespaced name placeholder (guards against namespace cross-wiring).
    expect(screen.getByPlaceholderText("ASICS Superblast 3")).toBeTruthy();
  });
});

describe("GearDialog kind=bike (bike-specific: no retirement, 'Type' role)", () => {
  it("exposes name/type/baseline and NO retirement field", () => {
    render(
      <GearDialog kind="bike" gearOptions={[]} connected={true}>
        <button>open</button>
      </GearDialog>
    );
    open("open");

    expect(screen.getByText(en.bikeDialog.addTitle)).toBeTruthy();
    expect(screen.getByLabelText(en.bikeDialog.name)).toBeTruthy();
    expect(screen.getByLabelText(en.bikeDialog.role)).toBeTruthy(); // "Type"
    expect(screen.getByLabelText(en.bikeDialog.baseline)).toBeTruthy();

    // No shoe-only retirement field on the bike dialog.
    expect(screen.queryByLabelText(en.shoeDialog.retireAt)).toBeNull();
    expect(screen.queryByLabelText(/retire at/i)).toBeNull();

    // Bike-namespaced name placeholder.
    expect(screen.getByPlaceholderText("TSW TR10 One")).toBeTruthy();
  });
});

describe("GearDialog direct Server Action form bindings", () => {
  it("shows pending feedback, prevents a duplicate action, then closes and toasts exactly once", async () => {
    let resolve!: (value: { ok: true }) => void;
    mocks.saveShoeFormAction.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    render(
      <GearDialog kind="shoe" gearOptions={[]} connected={true}>
        <button>open</button>
      </GearDialog>
    );
    open("open");
    fireEvent.change(screen.getByLabelText(en.shoeDialog.name), { target: { value: "Test shoe" } });
    const form = screen.getByRole("button", { name: en.shoeDialog.add }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: en.shoeDialog.add }).hasAttribute("disabled")).toBe(
        true
      )
    );
    expect(document.querySelector("svg.animate-spin")).toBeTruthy();
    expect(mocks.saveShoeFormAction).toHaveBeenCalledTimes(1);
    resolve({ ok: true });
  });

  it("submits a shoe through the static form action and keeps the dialog open on a safe error", async () => {
    mocks.saveShoeFormAction.mockResolvedValueOnce({ ok: false, error: "Could not save gear." });
    render(
      <GearDialog kind="shoe" gearOptions={[]} connected={true}>
        <button>open</button>
      </GearDialog>
    );
    open("open");
    fireEvent.change(screen.getByLabelText(en.shoeDialog.name), { target: { value: "Test shoe" } });
    fireEvent.submit(screen.getByRole("button", { name: en.shoeDialog.add }).closest("form")!);

    await waitFor(() => expect(mocks.saveShoeFormAction).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("binds the bike form to its own Server Action", async () => {
    mocks.saveBikeFormAction.mockResolvedValueOnce({ ok: false, error: "Could not save gear." });
    render(
      <GearDialog kind="bike" gearOptions={[]} connected={true}>
        <button>open</button>
      </GearDialog>
    );
    open("open");
    fireEvent.change(screen.getByLabelText(en.bikeDialog.name), { target: { value: "Test bike" } });
    fireEvent.submit(screen.getByRole("button", { name: en.bikeDialog.add }).closest("form")!);

    await waitFor(() => expect(mocks.saveBikeFormAction).toHaveBeenCalledTimes(1));
    expect(mocks.saveShoeFormAction).not.toHaveBeenCalled();
  });
});
