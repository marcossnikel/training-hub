// Per-second Strava streams, normalized and downsampled for charting. Kept in a
// separate table from activities because the raw series are large; this shape is
// what the activity chart consumes.

export interface ActivityStreams {
  n: number; // <= 400 when cached for the chart, the full sample count at FULL_RESOLUTION
  distanceKm: (number | null)[]; // length n
  timeS: (number | null)[]; // length n
  heartrate: (number | null)[] | null;
  paceSPerKm: (number | null)[] | null; // from velocity; null where v<=0
  watts: (number | null)[] | null;
  cadence: (number | null)[] | null;
  altitudeM: (number | null)[] | null;
}

const MAX_POINTS = 400;

/**
 * `maxPoints` for a caller that wants the payload as recorded, with no
 * downsampling: the derived-metrics pipeline reads the raw stream at full
 * resolution (a 30-second rolling power average has nothing to average once a
 * three-hour ride is squeezed into 400 samples) while the chart keeps its 400.
 * Both come out in the same {@link ActivityStreams} shape, so every consumer of a
 * cached stream also works on a full-resolution one.
 */
export const FULL_RESOLUTION = Number.MAX_SAFE_INTEGER;

/**
 * Turns Strava's key_by_type streams payload into a fixed-width, downsampled
 * shape. The base grid comes from the distance stream (else time, else the
 * longest available stream); returns null when no usable stream is present.
 * Every source array is indexed by the same [0,1] fraction, so streams of
 * differing lengths stay aligned. First and last points are always kept.
 */
export function normalizeStreams(
  raw: Record<string, { data: number[] }>,
  maxPoints: number = MAX_POINTS
): ActivityStreams | null {
  const get = (key: string): number[] | undefined => {
    const data = raw?.[key]?.data;
    return Array.isArray(data) && data.length > 0 ? data : undefined;
  };

  const distance = get("distance");
  const time = get("time");
  const heartrate = get("heartrate");
  const velocity = get("velocity_smooth");
  const watts = get("watts");
  const cadence = get("cadence");
  const altitude = get("altitude");

  const present = [distance, time, heartrate, velocity, watts, cadence, altitude].filter(
    (a): a is number[] => a !== undefined
  );
  if (present.length === 0) return null;

  const baseLen = distance?.length ?? time?.length ?? Math.max(...present.map((a) => a.length));
  const n = Math.min(baseLen, maxPoints);

  const fractionAt = (i: number): number => (n <= 1 ? 0 : i / (n - 1));
  const sampleAt = (data: number[], frac: number): number =>
    data[Math.round(frac * (data.length - 1))];

  // Samples a source array at the shared grid, returning null for the whole
  // series when the source is absent.
  const map = (
    data: number[] | undefined,
    fn: (v: number) => number | null
  ): (number | null)[] | null => {
    if (!data) return null;
    const out: (number | null)[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = fn(sampleAt(data, fractionAt(i)));
    return out;
  };

  const round3 = (m: number): number => Math.round(m) / 1000;

  return {
    n,
    distanceKm: map(distance, round3) ?? new Array(n).fill(null),
    timeS: map(time, (s) => s) ?? new Array(n).fill(null),
    heartrate: map(heartrate, (v) => v),
    paceSPerKm: map(velocity, (v) => (v > 0 ? Math.round(1000 / v) : null)),
    watts: map(watts, (v) => v),
    cadence: map(cadence, (v) => v),
    altitudeM: map(altitude, (v) => v),
  };
}
