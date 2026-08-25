"use server";

import { after } from "next/server";
import { fail, type ActionResult } from "@/lib/action-result";
import { dict, refreshAll } from "@/lib/action-helpers";
import { requireCurrentUser } from "@/lib/auth";
import { NONE } from "@/lib/constants";
import {
  createBike,
  createShoe,
  getBike,
  getShoe,
  setBikeGear,
  setBikeRetired,
  setShoeGear,
  setShoeRetired,
  updateBike,
  updateShoe,
  type BikeFields,
  type ShoeFields,
} from "@/lib/db";
import { deletePhoto, InvalidImageError, storePhoto } from "@/lib/storage";
import { parseId } from "@/lib/validate";

export async function saveShoeAction(formData: FormData): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const idRaw = formData.get("id");
    let id: number | null = null;
    if (typeof idRaw === "string" && idRaw.trim() !== "") {
      id = parseId(idRaw);
      if (id === null) return { ok: false, error: t.errors.invalidId };
    }
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: t.errors.shoeNeedsName };
    const role = String(formData.get("role") ?? "").trim() || null;
    const initialKm = Number(formData.get("initial_km") ?? 0),
      retirementKm = Number(formData.get("retirement_km") ?? 700);
    if (!Number.isFinite(initialKm) || initialKm < 0)
      return { ok: false, error: t.errors.invalidBaseline };
    if (!Number.isFinite(retirementKm) || retirementKm <= 0)
      return { ok: false, error: t.errors.invalidRetirement };
    const gearRaw = String(formData.get("strava_gear_id") ?? NONE);
    const gearId = gearRaw && gearRaw !== NONE ? gearRaw : null;
    const photo = formData.get("photo");
    const photoPath =
      photo instanceof File && photo.size > 0 ? await storePhoto(owner, photo) : null;
    const fields: ShoeFields = {
      name,
      role,
      initial_km: Math.round(initialKm * 10) / 10,
      retirement_km: Math.round(retirementKm),
      strava_gear_id: gearId,
    };
    if (id) {
      const existing = await getShoe(owner, id);
      if (!existing) return { ok: false, error: t.errors.shoeNotFound };
      if (existing.origin === "strava") return { ok: false, error: t.errors.providerManagedGear };
      await updateShoe(owner, id, fields, photoPath);
      if (photoPath && existing.photo_path && existing.photo_path !== photoPath) {
        const orphan = existing.photo_path;
        after(() => deletePhoto(owner, orphan));
      }
    } else await createShoe(owner, fields, photoPath);
    refreshAll();
    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidImageError) return { ok: false, error: t.errors.invalidImage };
    return fail(error, t.errors.generic);
  }
}

export async function saveShoeFormAction(
  _previousState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return saveShoeAction(formData);
}
export async function setShoeRetiredAction(id: number, retired: boolean): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const existing = await getShoe(owner, id);
    if (!existing) return { ok: false, error: t.errors.shoeNotFound };
    if (existing.origin === "strava") return { ok: false, error: t.errors.providerManagedGear };
    await setShoeRetired(owner, id, retired);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}
export async function setShoeGearAction(
  shoeId: number,
  gearId: string | null
): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const existing = await getShoe(owner, shoeId);
    if (!existing) return { ok: false, error: t.errors.shoeNotFound };
    if (existing.origin === "strava") return { ok: false, error: t.errors.providerManagedGear };
    await setShoeGear(owner, shoeId, gearId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}

export async function saveBikeAction(formData: FormData): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const idRaw = formData.get("id");
    let id: number | null = null;
    if (typeof idRaw === "string" && idRaw.trim() !== "") {
      id = parseId(idRaw);
      if (id === null) return { ok: false, error: t.errors.invalidId };
    }
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, error: t.errors.bikeNeedsName };
    const role = String(formData.get("role") ?? "").trim() || null,
      initialKm = Number(formData.get("initial_km") ?? 0);
    if (!Number.isFinite(initialKm) || initialKm < 0)
      return { ok: false, error: t.errors.invalidBaseline };
    const gearRaw = String(formData.get("strava_gear_id") ?? NONE),
      gearId = gearRaw && gearRaw !== NONE ? gearRaw : null;
    const photo = formData.get("photo");
    const photoPath =
      photo instanceof File && photo.size > 0 ? await storePhoto(owner, photo) : null;
    const fields: BikeFields = {
      name,
      role,
      initial_km: Math.round(initialKm * 10) / 10,
      strava_gear_id: gearId,
    };
    if (id) {
      const existing = await getBike(owner, id);
      if (!existing) return { ok: false, error: t.errors.bikeNotFound };
      if (existing.origin === "strava") return { ok: false, error: t.errors.providerManagedGear };
      await updateBike(owner, id, fields, photoPath);
      if (photoPath && existing.photo_path && existing.photo_path !== photoPath) {
        const orphan = existing.photo_path;
        after(() => deletePhoto(owner, orphan));
      }
    } else await createBike(owner, fields, photoPath);
    refreshAll();
    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidImageError) return { ok: false, error: t.errors.invalidImage };
    return fail(error, t.errors.generic);
  }
}

export async function saveBikeFormAction(
  _previousState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return saveBikeAction(formData);
}
export async function setBikeRetiredAction(id: number, retired: boolean): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const existing = await getBike(owner, id);
    if (!existing) return { ok: false, error: t.errors.bikeNotFound };
    if (existing.origin === "strava") return { ok: false, error: t.errors.providerManagedGear };
    await setBikeRetired(owner, id, retired);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}
export async function setBikeGearAction(
  bikeId: number,
  gearId: string | null
): Promise<ActionResult> {
  const t = await dict();
  const owner = await requireCurrentUser();
  if (!owner) return { ok: false, error: t.errors.unauthorized };
  try {
    const existing = await getBike(owner, bikeId);
    if (!existing) return { ok: false, error: t.errors.bikeNotFound };
    if (existing.origin === "strava") return { ok: false, error: t.errors.providerManagedGear };
    await setBikeGear(owner, bikeId, gearId);
    refreshAll();
    return { ok: true };
  } catch (error) {
    return fail(error, t.errors.generic);
  }
}
