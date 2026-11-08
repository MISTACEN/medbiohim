/**
 * Пробы доступности сервисов FESMU (ЗАДАЧА A3: вынесено из монолита fesmu.ts).
 */
import {
  PROBE_BUDGET_MS,
  PROBE_CONCURRENCY,
  PROBE_TIMEOUT_MS,
  STATUS_TTL_MS,
  fesmuFetch,
} from "./_shared";
import { readThrough } from "./cache";
import { staticServices } from "../portals";
import type { ServiceStatus, ServiceStatusReport } from "../types";

/* ------------------------------------------------------------------ *
 * Service probes (contract §1.5)
 * ------------------------------------------------------------------ */

function uncheckedService(service: ServiceStatus): ServiceStatus {
  return { ...service, reachable: null, http_status: null, latency_ms: null, checked_at: null };
}

async function probeService(service: ServiceStatus, deadline: number): Promise<ServiceStatus> {
  const checkedAt = new Date().toISOString();
  const budgetFor = () => Math.max(500, Math.min(PROBE_TIMEOUT_MS, deadline - Date.now()));
  const startedAt = Date.now();

  const head = await fesmuFetch(service.url, {
    method: "HEAD",
    timeoutMs: budgetFor(),
    maxAttempts: 1,
    totalBudgetMs: budgetFor() + 1_000,
  });
  if (head.ok) {
    return {
      ...service,
      reachable: true,
      http_status: head.status,
      latency_ms: Date.now() - startedAt,
      checked_at: checkedAt,
    };
  }

  // No HTTP answer at all (DNS/TLS/timeout/refused): a GET cannot do better, so
  // do not burn another 6 s of the 15 s budget on the same dead host.
  if (head.status === 0) {
    return {
      ...service,
      reachable: false,
      http_status: null,
      latency_ms: Date.now() - startedAt,
      checked_at: checkedAt,
      note: `${service.note} Ответ сервера: ${head.error ?? "нет ответа"}.`,
    };
  }

  // Real HTTP status but no success (405/403/…): some servers only speak GET.
  const get = await fesmuFetch(service.url, {
    method: "GET",
    timeoutMs: budgetFor(),
    maxAttempts: 1,
    totalBudgetMs: budgetFor() + 1_000,
  });
  const status = get.status > 0 ? get.status : head.status;
  return {
    ...service,
    reachable: get.status > 0 ? get.status >= 200 && get.status < 400 : false,
    http_status: status > 0 ? status : null,
    latency_ms: Date.now() - startedAt,
    checked_at: checkedAt,
    note: get.error ? `${service.note} Ответ сервера: ${get.error}.` : service.note,
  };
}

export function withDeadline<T>(promise: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback()), Math.max(1, ms));
    if (typeof timer.unref === "function") timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback());
      },
    );
  });
}

/** Bounded-concurrency worker pool: a slow host never blocks the next probe. */
export async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const size = Math.max(1, Math.min(limit, items.length));
  for (let index = 0; index < size; index += 1) {
    runners.push(
      (async () => {
        for (;;) {
          const current = cursor;
          cursor += 1;
          if (current >= items.length) return;
          results[current] = await worker(items[current]);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

/** Probes every registry service (HEAD then GET, bounded concurrency 4). */
export async function probeServices(): Promise<ServiceStatus[]> {
  const registry = staticServices();
  const deadline = Date.now() + PROBE_BUDGET_MS;
  return runPool(registry, PROBE_CONCURRENCY, (service) =>
    withDeadline(
      probeService(service, deadline),
      Math.max(0, deadline - Date.now()),
      () => uncheckedService(service),
    ),
  );
}

export async function getServiceStatuses(options: { force?: boolean } = {}): Promise<ServiceStatus[]> {
  const result = await readThrough<ServiceStatus[]>(
    "status",
    STATUS_TTL_MS,
    async () => ({ value: await probeServices(), error: null }),
    options.force === true,
  );
  return result.value ?? staticServices();
}

export async function getServiceReport(options: { force?: boolean } = {}): Promise<ServiceStatusReport> {
  const services = await getServiceStatuses(options);
  return { ok: true, fetched_at: new Date().toISOString(), services };
}
