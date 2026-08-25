import { createServer } from "node:http";

const port = Number(process.env.TRAINING_HUB_STRAVA_TEST_PROVIDER_PORT ?? "3210");

function reply(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (req.method === "POST" && url.pathname === "/oauth/token") {
    // This is a disposable local fixture. It never logs request bodies, which
    // contain test-only credentials/tokens, and it has no network dependency.
    let body = "";
    for await (const chunk of req) body += String(chunk);
    const params = new URLSearchParams(body);
    if (params.get("grant_type") === "authorization_code") {
      const revocationFailure = params.get("code") === "e2e-authorized-code-revocation-failure";
      return reply(res, 200, {
        access_token: revocationFailure
          ? "e2e-revocation-failure-access-token"
          : "e2e-access-token-not-a-secret",
        refresh_token: revocationFailure
          ? "e2e-revocation-failure-refresh-token"
          : "e2e-refresh-token-not-a-secret",
        expires_at: 4_000_000_000,
        scope: "profile:read_all read activity:read_all",
        athlete: { id: 314, firstname: "E2E", lastname: "Athlete" },
      });
    }
    if (params.get("grant_type") === "refresh_token") {
      return reply(res, 200, {
        access_token: "e2e-refreshed-access-not-a-secret",
        refresh_token: "e2e-refreshed-refresh-not-a-secret",
        expires_at: 4_000_000_000,
      });
    }
    return reply(res, 400, { message: "invalid request" });
  }
  if (req.method === "POST" && url.pathname === "/oauth/deauthorize") {
    // Deliberately supports the two lifecycle outcomes without ever logging the
    // form body. The failure token can only be minted by this local fixture.
    let body = "";
    for await (const chunk of req) body += String(chunk);
    const failed =
      new URLSearchParams(body).get("access_token") === "e2e-revocation-failure-access-token";
    return reply(res, failed ? 503 : 200, {});
  }
  if (req.method === "GET" && url.pathname === "/api/v3/athlete/activities") {
    // Initial history is confirmed against the connection cutoff; the later
    // `after` request supplies one pending run to prove local gear matching.
    if (url.searchParams.has("after")) {
      return reply(res, 200, [
        {
          id: 9_002,
          name: "E2E new Nimbus run",
          sport_type: "Run",
          start_date: "2099-01-02T12:00:00Z",
          distance: 5_000,
          moving_time: 1_500,
          gear_id: "e2e-shoe",
        },
      ]);
    }
    return reply(res, 200, [
      {
        id: 9_001,
        name: "E2E Nimbus history",
        sport_type: "Run",
        start_date: "2025-01-02T12:00:00Z",
        distance: 5_000,
        moving_time: 1_500,
        gear_id: "e2e-shoe",
      },
    ]);
  }
  if (req.method === "GET" && url.pathname === "/api/v3/athlete") {
    return reply(res, 200, {
      shoes: [{ id: "e2e-shoe", name: "E2E Nimbus", distance: 120_000, retired: false }],
      bikes: [{ id: "e2e-bike", name: "E2E Road", distance: 2_400_000, retired: false }],
    });
  }
  return reply(res, 404, { message: "not found" });
});

server.listen(port, "127.0.0.1");

function stop() {
  server.close(() => process.exit(0));
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
