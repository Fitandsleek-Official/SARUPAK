#!/usr/bin/env node
/**
 * Lightweight live smoke against a running SARUPAK API.
 * Usage: node scripts/smoke-api.mjs [http://localhost:4003/v1]
 */
const BASE = (process.argv[2] ?? "http://localhost:4003/v1").replace(/\/$/, "");

async function main() {
  const res = await fetch(`${BASE}/health`);
  const body = await res.json().catch(() => null);
  if (res.status !== 200) {
    console.error(`FAIL health HTTP ${res.status}`);
    process.exit(1);
  }
  if (body?.service !== "sarupak-api") {
    console.error(
      `FAIL expected service sarupak-api, got ${JSON.stringify(body)}`,
    );
    console.error(
      "Hint: port may belong to another app (e.g. Norng Downloader on :4000).",
    );
    process.exit(1);
  }
  if (!body.version) {
    console.error("FAIL missing version — is this a stale SARUPAK build?");
    process.exit(1);
  }
  console.log(
    `PASS  ${body.service} v${body.version} phase=${body.phase} port=${body.port ?? "?"} @ ${BASE}`,
  );
}

main().catch((err) => {
  console.error("FAIL", err instanceof Error ? err.message : err);
  process.exit(1);
});
