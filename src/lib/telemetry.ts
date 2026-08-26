/**
 * Telemetry seam — the single place observability and analytics vendors plug in.
 *
 * Today the sink is the console. Vercel Observability automatically captures a
 * function's stdout/stderr, so `console.*` is all that is needed to get these
 * structured logs in production. Swapping in Sentry / Datadog / PostHog later is
 * a one-file change confined to this module: callers keep importing `logger` and
 * never learn where the data actually goes.
 *
 * The logger responsibility lives behind this seam:
 *  - `logger`: structured error/warn/info/debug lines tagged with a call-site
 *    context (e.g. "strava.tryFetchGear"), used to make silent, best-effort
 *    failures observable without changing how a caller degrades.
 */

/** Arbitrary structured fields attached to a log line. `error` is serialized. */
type LogFields = Record<string, unknown>;

type LogLevel = "error" | "warn" | "info" | "debug";

interface Logger {
  error(context: string, fields?: LogFields): void;
  warn(context: string, fields?: LogFields): void;
  info(context: string, fields?: LogFields): void;
  debug(context: string, fields?: LogFields): void;
}

/** Turns an unknown thrown value into something JSON-friendly and readable. */
function serializeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(level: LogLevel, context: string, fields?: LogFields): void {
  const payload: LogFields = { ...fields };
  if ("error" in payload) payload.error = serializeError(payload.error);
  const tag = `[${context}]`;
  if (Object.keys(payload).length > 0) {
    console[level](tag, payload);
  } else {
    console[level](tag);
  }
}

/**
 * Structured logger. `console` is the sink today (captured by Vercel
 * Observability); this is the one place to redirect logs to a vendor later.
 */
export const logger: Logger = {
  error(context: string, fields?: LogFields): void {
    emit("error", context, fields);
  },
  warn(context: string, fields?: LogFields): void {
    emit("warn", context, fields);
  },
  info(context: string, fields?: LogFields): void {
    emit("info", context, fields);
  },
  debug(context: string, fields?: LogFields): void {
    emit("debug", context, fields);
  },
};
