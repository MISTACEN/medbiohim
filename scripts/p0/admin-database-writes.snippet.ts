dbAdmin.post("/:id/rows/:table", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  const t = sanitizeTable(c.req.param("table") || "");
  if (!t) {
    const { body, status } = fail("VALIDATION_ERROR", "Table not allowed", 422, rid);
    return c.json(body, status as 422);
  }
  let row: any = {};
  try { row = await c.req.json(); } catch {}
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    const { body, status } = fail("VALIDATION_ERROR", "JSON object required", 422, rid);
    return c.json(body, status as 422);
  }
  const svc = createServiceClient(c.env);
  if (!svc) {
    const { body, status } = fail("SERVICE_ROLE_REQUIRED", "Set SUPABASE_SERVICE_ROLE_KEY on Worker for admin row writes", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await svc.from(t).insert(row).select("*").limit(1);
    if (error) throw error;
    return c.json(ok({ item: data?.[0] || null, mode: "service_role" }, rid), 201);
  } catch (e: any) {
    const { body, status } = fail("DB_WRITE_FAILED", e?.message || "Insert failed", 422, rid);
    return c.json(body, status as 422);
  }
});

dbAdmin.patch("/:id/rows/:table", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  const t = sanitizeTable(c.req.param("table") || "");
  if (!t) {
    const { body, status } = fail("VALIDATION_ERROR", "Table not allowed", 422, rid);
    return c.json(body, status as 422);
  }
  let payload: any = {};
  try { payload = await c.req.json(); } catch {}
  const id = payload?.id || c.req.query("id");
  const patch = payload?.patch || payload?.data || payload;
  if (!id || !patch || typeof patch !== "object") {
    const { body, status } = fail("VALIDATION_ERROR", "id and patch required", 422, rid);
    return c.json(body, status as 422);
  }
  const svc = createServiceClient(c.env);
  if (!svc) {
    const { body, status } = fail("SERVICE_ROLE_REQUIRED", "Set SUPABASE_SERVICE_ROLE_KEY on Worker for admin row writes", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await svc.from(t).update(patch).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) {
      const { body, status } = fail("NOT_FOUND", "Row not found", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ item: data, mode: "service_role" }, rid));
  } catch (e: any) {
    const { body, status } = fail("DB_WRITE_FAILED", e?.message || "Update failed", 422, rid);
    return c.json(body, status as 422);
  }
});

dbAdmin.delete("/:id/rows/:table", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  const t = sanitizeTable(c.req.param("table") || "");
  if (!t) {
    const { body, status } = fail("VALIDATION_ERROR", "Table not allowed", 422, rid);
    return c.json(body, status as 422);
  }
  const id = c.req.query("id") || "";
  if (!id) {
    const { body, status } = fail("VALIDATION_ERROR", "id query required", 422, rid);
    return c.json(body, status as 422);
  }
  const svc = createServiceClient(c.env);
  if (!svc) {
    const { body, status } = fail("SERVICE_ROLE_REQUIRED", "Set SUPABASE_SERVICE_ROLE_KEY on Worker for admin row deletes", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    let q = svc.from(t).delete().eq("id", id);
    const { error } = await q;
    if (error) throw error;
    return c.json(ok({ deleted: true }, rid));
  } catch (e: any) {
    const { body, status } = fail("DB_WRITE_FAILED", e?.message || "Delete failed", 422, rid);
    return c.json(body, status as 422);
  }
});

dbAdmin.post("/:id/sql", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gateAdmin(c, rid))) return c.res;
  if (c.req.param("id") !== "supabase_primary") {
    const { body, status } = fail("NOT_FOUND", "Unknown connection", 404, rid);
    return c.json(body, status as 404);
  }
  let payload: any = {};
  try { payload = await c.req.json(); } catch {}
  const sql = String(payload?.sql || "").trim();
  if (!sql) {
    const { body, status } = fail("VALIDATION_ERROR", "sql required", 422, rid);
    return c.json(body, status as 422);
  }
  if (sql.length > 20000) {
    const { body, status } = fail("VALIDATION_ERROR", "sql too large", 422, rid);
    return c.json(body, status as 422);
  }
  if (payload?.confirm !== true) {
    const { body, status } = fail("CONFIRMATION_REQUIRED", "Set confirm:true to run SQL", 422, rid);
    return c.json(body, status as 422);
  }
  const svc = createServiceClient(c.env);
  if (!svc) {
    const { body, status } = fail("SERVICE_ROLE_REQUIRED", "Set SUPABASE_SERVICE_ROLE_KEY on Worker", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await svc.rpc("admin_exec_sql", { query: sql });
    if (error) {
      const { body, status } = fail("SQL_RPC_MISSING", error.message || "Create RPC public.admin_exec_sql(query text) on Supabase for SQL console", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ result: data, mode: "service_role" }, rid));
  } catch (e: any) {
    const { body, status } = fail("SQL_FAILED", e?.message || "SQL failed", 422, rid);
    return c.json(body, status as 422);
  }
});

