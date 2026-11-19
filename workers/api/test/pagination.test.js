import test from "node:test";
import assert from "node:assert/strict";

import { PAGINATION, pageMeta, paginate, parsePage } from "../src/lib/pagination.ts";

const query = (params = {}) => ({ get: (name) => (name in params ? String(params[name]) : null) });

test("без параметров пагинация не запрошена: контракт ответа не меняется", () => {
  const page = parsePage(query());
  assert.deepEqual(page, { limit: PAGINATION.defaultLimit, offset: 0, requested: false });
});

test("limit и offset читаются по отдельности", () => {
  assert.deepEqual(parsePage(query({ limit: "10" })), { limit: 10, offset: 0, requested: true });
  assert.deepEqual(parsePage(query({ offset: "20" })), {
    limit: PAGINATION.defaultLimit,
    offset: 20,
    requested: true,
  });
  assert.deepEqual(parsePage(query({ limit: "10", offset: "20" })), {
    limit: 10,
    offset: 20,
    requested: true,
  });
});

test("мусор в параметрах не роняет запрос и не включает пагинацию", () => {
  assert.deepEqual(parsePage(query({ limit: "abc", offset: "1.5" })), {
    limit: PAGINATION.defaultLimit,
    offset: 0,
    requested: false,
  });
  assert.deepEqual(parsePage(query({ limit: "" })), {
    limit: PAGINATION.defaultLimit,
    offset: 0,
    requested: false,
  });
});

test("границы зажимаются: limit 1..max, offset >= 0", () => {
  assert.equal(parsePage(query({ limit: "0" })).limit, 1);
  assert.equal(parsePage(query({ limit: "-5" })).limit, 1);
  assert.equal(parsePage(query({ limit: "100000" })).limit, PAGINATION.maxLimit);
  assert.equal(parsePage(query({ offset: "-7" })).offset, 0);
  assert.deepEqual(parsePage(query({ limit: "999999999999999999999999" })), {
    limit: PAGINATION.defaultLimit,
    offset: 0,
    requested: false,
  });
});

test("лимиты можно переопределить в маршруте", () => {
  assert.deepEqual(parsePage(query(), { defaultLimit: 20, maxLimit: 30 }), {
    limit: 20,
    offset: 0,
    requested: false,
  });
  assert.equal(parsePage(query({ limit: "80" }), { maxLimit: 30 }).limit, 30);
});

test("paginate режет список и считает has_more", () => {
  const rows = ["a", "b", "c", "d", "e"];
  const first = paginate(rows, { limit: 2, offset: 0, requested: true });
  assert.deepEqual(first.items, ["a", "b"]);
  assert.deepEqual(first.page, { limit: 2, offset: 0, total: 5, has_more: true });

  const last = paginate(rows, { limit: 2, offset: 4, requested: true });
  assert.deepEqual(last.items, ["e"]);
  assert.equal(last.page.has_more, false);

  const beyond = paginate(rows, { limit: 2, offset: 9, requested: true });
  assert.deepEqual(beyond.items, []);
  assert.equal(beyond.page.has_more, false);
});

test("пустой список и точная граница страницы", () => {
  assert.deepEqual(pageMeta({ limit: 10, offset: 0, requested: true }, 0), {
    limit: 10,
    offset: 0,
    total: 0,
    has_more: false,
  });
  assert.equal(paginate(["a", "b"], { limit: 2, offset: 0, requested: true }).page.has_more, false);
});
