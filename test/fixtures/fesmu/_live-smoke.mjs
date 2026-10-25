/**
 * Live smoke test for the FESMU adapter — needs real network access, so it is
 * NOT part of `node --test`. Run manually from the repo root:
 *
 *   node test/fixtures/fesmu/_live-smoke.mjs
 *
 * It exercises the shipped TypeScript adapter (via load-ts.mjs) against
 * www.fesmu.ru:
 *   1. baseline: plain fetch() → UNABLE_TO_VERIFY_LEAF_SIGNATURE;
 *   2. getOverview(): the three press feeds + the schedule index;
 *   3. getFacultySchedule("lechebnyy");
 *   4. getServiceReport({ force: true }): live probes of all six services;
 *   5. FESMU_STRICT_TLS=1: strict verification must degrade to an error string,
 *      never throw.
 *
 * Exit code stays 0 even when the university network is unreachable: the point
 * is to document the observed behaviour, and the adapter must degrade gracefully.
 */
import { loadUniversityTs } from "./load-ts.mjs";

const fesmu = await loadUniversityTs("fesmu.ts");

function mark(ok) {
  return ok ? "OK  " : "FAIL";
}

async function plainFetchBaseline() {
  try {
    const response = await fetch("https://www.fesmu.ru/");
    console.log(`${mark(response.ok)} plain fetch("https://www.fesmu.ru/") → HTTP ${response.status}`);
  } catch (cause) {
    const code = cause?.cause?.code || cause?.code || cause?.message;
    console.log(`${mark(false)} plain fetch("https://www.fesmu.ru/") → ${code}`);
  }
}

function summarizeFeed(name, feed) {
  const first = feed.items[0];
  console.log(
    `${mark(feed.error === null && feed.items.length > 0)} feed ${name}: items=${feed.items.length}` +
      ` cached=${feed.cached} stale=${feed.stale} error=${feed.error ?? "none"}` +
      `${first ? ` first="${first.title.slice(0, 60)}" date=${first.date ?? "null"}` : ""}`,
  );
}

console.log("== FESMU live smoke", new Date().toISOString());
await plainFetchBaseline();

try {
  const started = Date.now();
  const overview = await fesmu.getOverview();
  console.log(
    `${mark(overview.ok)} overview: ${Date.now() - started} ms, services=${overview.services.length}` +
      ` (probed=${overview.services.filter((service) => service.checked_at !== null).length})`,
  );
  summarizeFeed("news", overview.feeds.news);
  summarizeFeed("announcements", overview.feeds.announcements);
  summarizeFeed("events", overview.feeds.events);
  console.log(
    `${mark(overview.schedule.error === null)} schedule index: documents=${overview.schedule.documents.length}` +
      ` cached=${overview.schedule.cached} error=${overview.schedule.error ?? "none"}`,
  );
} catch (cause) {
  console.log(`${mark(false)} overview threw (must never happen): ${cause}`);
}

try {
  const started = Date.now();
  const schedule = await fesmu.getFacultySchedule("lechebnyy");
  if (!schedule) {
    console.log(`${mark(false)} faculty lechebnyy: unknown id`);
  } else {
    console.log(
      `${mark(schedule.ok)} faculty lechebnyy: ${Date.now() - started} ms, items=${schedule.items.length}` +
        ` cached=${schedule.cached} error=${schedule.error ?? "none"}`,
    );
    const sample = schedule.items.slice(0, 3);
    for (const item of sample) {
      console.log(`     - ${item.kind}/${item.course ?? "—"}/${item.semester ?? "—"}: ${item.title.slice(0, 70)}`);
    }
    const debt = schedule.items.filter((item) => item.is_debt).length;
    console.log(`     debt documents: ${debt}, internal links kept: ${schedule.items.filter((item) => item.url.includes("192.168.")).length}`);
  }
} catch (cause) {
  console.log(`${mark(false)} faculty lechebnyy threw (must never happen): ${cause}`);
}

try {
  const started = Date.now();
  const report = await fesmu.getServiceReport({ force: true });
  console.log(`${mark(report.ok)} service probes: ${Date.now() - started} ms`);
  for (const service of report.services) {
    console.log(
      `     ${service.id.padEnd(9)} reachable=${String(service.reachable).padEnd(5)}` +
        ` status=${String(service.http_status).padEnd(4)} latency=${String(service.latency_ms).padStart(5)} ms` +
        ` checked_at=${service.checked_at}`,
    );
  }
} catch (cause) {
  console.log(`${mark(false)} service probes threw (must never happen): ${cause}`);
}

process.env.FESMU_STRICT_TLS = "1";
try {
  const strict = await fesmu.fetchFeed("news", { force: true });
  console.log(
    `${mark(strict.error !== null)} FESMU_STRICT_TLS=1: items=${strict.items.length}` +
      ` error=${strict.error ?? "none (unexpected: strict verification succeeded)"}`,
  );
} catch (cause) {
  console.log(`${mark(false)} FESMU_STRICT_TLS=1 threw (must never happen): ${cause}`);
}
console.log("== live smoke finished");
