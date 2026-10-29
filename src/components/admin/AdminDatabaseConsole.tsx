"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { clearDraft, formatDraftTime, readDraft, saveDraft, useUnsavedChanges } from "@/lib/unsaved-changes";

const INITIAL_SQL = "SELECT * FROM subjects LIMIT 50";
const SQL_DRAFT_KEY = "admin:sql";
import {
  CheckCircle2,
  Database,
  Download,
  History,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Server,
  Settings2,
  Table2,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  adminDatabaseConnections,
  adminDatabaseDelete,
  adminDatabaseInsert,
  adminDatabaseRows,
  adminDatabaseSaveConnection,
  adminDatabaseSchema,
  adminDatabaseSql,
  adminDatabaseTables,
  adminDatabaseTestConnection,
  adminDatabaseUpdate,
  type AdminDatabaseConnection,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";

type Column = {
  column_name: string;
  data_type?: string;
  udt_name?: string;
  is_nullable?: string;
  column_default?: string | null;
  ordinal_position?: number;
  is_primary_key?: boolean;
};

type TableInfo = {
  schema_name?: string;
  table_name: string;
  estimated_rows?: number | null;
  comment?: string | null;
};

type RowData = Record<string, unknown>;

type Mode = "data" | "schema" | "sql" | "settings";

// LEGACY-пресеты SpaceWeb (spaceweb_pgsql/spaceweb_mysql8) удалены (MA13):
// миграция на Supabase завершена, панель аудита/отката (MA3) живёт в /admin/audit.
const DEFAULT_CONNECTIONS: Record<string, Partial<AdminDatabaseConnection>> = {};

function display(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseCell(value: string, original: unknown): unknown {
  if (value === "" && original === null) return null;
  if (typeof original === "boolean") return value === "true" || value === "1";
  if (typeof original === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (original && typeof original === "object") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function keyOf(row: RowData, columns: Column[]): Record<string, unknown> {
  const pk = columns.filter((c) => c.is_primary_key).map((c) => c.column_name);
  if (pk.length) return Object.fromEntries(pk.map((name) => [name, row[name]]));
  return {};
}

function keyLabel(row: RowData, columns: Column[]): string {
  const key = keyOf(row, columns);
  return Object.keys(key).length ? Object.values(key).map(display).join(" · ") : "без PK";
}

function connectionStatus(connection: AdminDatabaseConnection) {
  if (connection.status === "connected") return { text: "Подключено", good: true };
  if (connection.status === "failed") return { text: "Ошибка", good: false };
  if (connection.builtin) return { text: "Основная", good: true };
  return { text: "Не проверено", good: false };
}

export default function AdminDatabaseConsole() {
  const { confirm, dialog } = useConfirm();
  const [connections, setConnections] = useState<AdminDatabaseConnection[]>([]);
  const [selectedId, setSelectedId] = useState("supabase_primary");
  const [mode, setMode] = useState<Mode>("data");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [table, setTable] = useState("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<RowData[]>([]);
  const [originalRows, setOriginalRows] = useState<RowData[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [sql, setSql] = useState(INITIAL_SQL);
  const [sqlDraftOffer, setSqlDraftOffer] = useState<{ savedAt: string; value: string } | null>(null);
  // Длинный SQL-запрос терялся при обновлении страницы — держим его в черновике.
  const sqlDirty = sql.trim() !== "" && sql !== INITIAL_SQL;
  useUnsavedChanges(sqlDirty, "В SQL-окне есть невыполненный запрос — он потеряется при уходе.");
  const [sqlResult, setSqlResult] = useState<any | null>(null);
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [schemaBusy, setSchemaBusy] = useState(false);
  const [newJson, setNewJson] = useState("{}");

  useEffect(() => {
    const stored = readDraft<string>(SQL_DRAFT_KEY);
    if (stored?.data && stored.data !== INITIAL_SQL) setSqlDraftOffer({ savedAt: stored.savedAt, value: stored.data });
  }, []);

  useEffect(() => {
    if (!sqlDirty) return;
    const timer = setTimeout(() => saveDraft(SQL_DRAFT_KEY, sql), 800);
    return () => clearTimeout(timer);
  }, [sqlDirty, sql]);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [isNewConnection, setIsNewConnection] = useState(false);

  async function loadConnections(selectId?: string) {
    const result = await adminDatabaseConnections();
    if (!result.ok) {
      setMessage(describeApiError(result.error));
      return;
    }
    const list = (result.data.items || []) as AdminDatabaseConnection[];
    setConnections(list);
    const next = selectId || selectedId;
    if (list.some((item) => item.id === next)) {
      setSelectedId(next);
    } else if (list[0]?.id) {
      setSelectedId(list[0].id);
    }
  }

  async function loadTables(id: string) {
    setBusy(true);
    setMessage("");
    setTables([]);
    setTable("");
    setColumns([]);
    setRows([]);
    const result = await adminDatabaseTables(id);
    setBusy(false);
    if (!result.ok) {
      setMessage(describeApiError(result.error));
      return;
    }
    const items = (result.data.items || []) as TableInfo[];
    setTables(items);
    if (items[0]?.table_name) setTable(items[0].table_name);
  }

  async function loadTableData(id = selectedId, tableName = table) {
    if (!tableName) return;
    setBusy(true);
    const result = await adminDatabaseRows(id, tableName, pageSize, (page - 1) * pageSize, query);
    setBusy(false);
    if (!result.ok) {
      setMessage(describeApiError(result.error));
      return;
    }
    setColumns((result.data.columns || []) as Column[]);
    const items = (result.data.items || []) as RowData[];
    setRows(items);
    setOriginalRows(items.map((row) => ({ ...row })));
  }

  async function loadSchema(id = selectedId, tableName = table) {
    if (!tableName) return;
    setSchemaBusy(true);
    const result = await adminDatabaseSchema(id, tableName);
    setSchemaBusy(false);
    if (!result.ok) {
      setMessage(describeApiError(result.error));
      return;
    }
    setColumns((result.data.columns || []) as Column[]);
  }

  useEffect(() => {
    void loadConnections();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setMode("data");
    void loadTables(selectedId);
    const connection = connections.find((item) => item.id === selectedId);
    if (connection && !connection.builtin) {
      setDraft({
        label: connection.label || "",
        slug: connection.slug || "",
        driver: connection.driver || "pgsql",
        host: connection.host || "",
        port: String(connection.port || ""),
        database_name: connection.database_name || "",
        username: connection.username || "",
        password: "",
        password_configured: String(connection.password_configured === true),
        sslmode: connection.sslmode || "require",
        charset: connection.charset || "utf8mb4",
        enabled: String(connection.enabled !== false),
      });
      setIsNewConnection(false);
    } else if (connection?.builtin) {
      const cfg = DEFAULT_CONNECTIONS[selectedId];
      setDraft({
        label: connection.label || "",
        slug: connection.slug || "",
        driver: connection.driver || "pgsql",
        host: "",
        port: "",
        database_name: "",
        username: "",
        password: "",
        sslmode: connection.sslmode || "require",
        charset: connection.charset || "UTF8",
        enabled: "true",
      });
      if (cfg) {
        Object.entries(cfg).forEach(([key, value]) => {
          setDraft((current) => ({ ...current, [key]: String(value ?? "") }));
        });
      }
      setIsNewConnection(false);
    }
  }, [selectedId, connections]);

  useEffect(() => {
    setPage(1);
    if (selectedId && table && mode === "data") void loadTableData(selectedId, table);
    if (selectedId && table && mode === "schema") void loadSchema(selectedId, table);
  }, [table, selectedId, mode]);

  useEffect(() => {
    if (mode === "data" && selectedId && table) void loadTableData(selectedId, table);
  }, [page]);

  const currentConnection = connections.find((item) => item.id === selectedId) || null;
  const pks = useMemo(() => columns.filter((c) => c.is_primary_key).map((c) => c.column_name), [columns]);

  const dirty = (row: RowData) => {
    const key = keyOf(row, columns);
    const old = originalRows.find((item) => JSON.stringify(keyOf(item, columns)) === JSON.stringify(key));
    return JSON.stringify(row) !== JSON.stringify(old);
  };

  function setCell(index: number, column: string, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [column]: parseCell(value, row[column]) } : row,
      ),
    );
  }

  async function saveRow(row: RowData) {
    if (!pks.length) {
      setMessage("У таблицы нет первичного ключа. Для изменения используйте SQL.");
      return;
    }
    setBusy(true);
    const result = await adminDatabaseUpdate(selectedId, table, keyOf(row, columns), row);
    setBusy(false);
    if (!result.ok) {
      setMessage(describeApiError(result.error));
      return;
    }
    setMessage("Строка сохранена");
    await loadTableData();
  }

  async function deleteRow(row: RowData) {
    if (!pks.length) {
      setMessage("У таблицы нет первичного ключа. Для удаления используйте SQL.");
      return;
    }
    const agreed = await confirm({
      title: "Удалить строку?",
      description: `Ключ «${keyLabel(row, columns)}» — строка исчезнет из прод-базы без возможности отмены.`,
      confirmLabel: "Удалить строку",
      danger: true,
    });
    if (!agreed) return;
    setBusy(true);
    const result = await adminDatabaseDelete(selectedId, table, keyOf(row, columns));
    setBusy(false);
    if (!result.ok) {
      setMessage(describeApiError(result.error));
      return;
    }
    setMessage("Строка удалена");
    await loadTableData();
  }

  async function insertRow() {
    try {
      const payload = JSON.parse(newJson) as Record<string, unknown>;
      setBusy(true);
      const result = await adminDatabaseInsert(selectedId, table, payload);
      setBusy(false);
      if (!result.ok) {
        setMessage(describeApiError(result.error));
        return;
      }
      setShowNew(false);
      setNewJson("{}");
      setMessage("Строка добавлена");
      await loadTableData();
    } catch {
      setMessage("Неверный JSON");
    }
  }

  async function runSql() {
    setBusy(true);
    setSqlResult(null);
    const result = await adminDatabaseSql(selectedId, sql, confirmDanger);
    setBusy(false);
    if (!result.ok) {
      setMessage(describeApiError(result.error));
      return;
    }
    setMessage("SQL выполнен");
    setSqlResult(result.data);
    setConfirmDanger(false);
    // Запрос выполнен — предупреждение о потере больше не актуально.
    clearDraft(SQL_DRAFT_KEY);
    setSqlDraftOffer(null);
  }

  async function testConnection(id = selectedId) {
    setBusy(true);
    const result = await adminDatabaseTestConnection(id);
    setBusy(false);
    if (!result.ok) {
      setMessage(describeApiError(result.error));
      await loadConnections();
      return;
    }
    setMessage("Подключение проверено · " + result.data.latency_ms + " мс");
    await loadConnections(id);
    await loadTables(id);
  }

  async function saveConnection() {
    const payload = {
      label: draft.label || "",
      slug: draft.slug || "",
      driver: draft.driver || "pgsql",
      host: draft.host || "",
      port: Number(draft.port || 0),
      database_name: draft.database_name || "",
      username: draft.username || "",
      password: draft.password || "",
      sslmode: draft.sslmode || "require",
      charset: draft.charset || "utf8mb4",
      enabled: draft.enabled !== "false",
    };
    setBusy(true);
    const result = await adminDatabaseSaveConnection(isNewConnection ? "new" : selectedId, payload);
    setBusy(false);
    if (!result.ok) {
      setMessage(describeApiError(result.error));
      return;
    }
    setMessage("Подключение сохранено");
    setIsNewConnection(false);
    await loadConnections(String(result.data.item.id));
    await testConnection(String(result.data.item.id));
  }

  function startNewConnection() {
    setSelectedId("");
    setIsNewConnection(true);
    setMode("settings");
    setTables([]);
    setTable("");
    setColumns([]);
    setRows([]);
    setDraft({
      label: "Новое подключение",
      slug: "external_db",
      driver: "pgsql",
      host: "",
      port: "5432",
      database_name: "",
      username: "",
      password: "",
      sslmode: "require",
      charset: "UTF8",
      enabled: "true",
    });
  }

  function downloadJson() {
    const payload = JSON.stringify(rows, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = (table || "database") + ".json";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  if (selectedId === "" && isNewConnection) {
    return (
      <section className="space-y-5">
        <ConnectionPanel
          draft={draft}
          setDraft={setDraft}
          isNew
          busy={busy}
          onSave={saveConnection}
          onCancel={() => {
            setIsNewConnection(false);
            void loadConnections();
          }}
        />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="card h-fit p-3">
          <div className="flex items-center justify-between gap-2 px-2 pb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Подключения</div>
              <div className="text-sm font-semibold text-slate-900">{connections.length} профиля</div>
            </div>
            <button type="button" onClick={startNewConnection} className="rounded-xl border bg-white p-2 text-indigo-600" title="Новое подключение">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1">
            {connections.map((connection) => {
              const status = connectionStatus(connection);
              return (
                <button
                  type="button"
                  key={connection.id}
                  onClick={() => setSelectedId(connection.id)}
                  className={"w-full rounded-xl border px-3 py-3 text-left transition " + (selectedId === connection.id ? "border-indigo-300 bg-indigo-50" : "border-transparent hover:border-slate-200 hover:bg-slate-50")}
                >
                  <div className="flex items-center gap-2">
                    {connection.driver === "mysql" ? <Server className="h-4 w-4 text-orange-500" /> : <Database className="h-4 w-4 text-indigo-500" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{connection.label}</span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-slate-500">{connection.host}{connection.port ? ":" + connection.port : ""} · {connection.database_name}</div>
                  <div className={"mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold " + (status.good ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]" : "bg-slate-100 text-slate-500")}>
                    {status.good ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {status.text}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <header className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-indigo-600" />
                  <h2 className="text-lg font-extrabold">Управление базой данных</h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {currentConnection?.label || "Подключение"} · {currentConnection?.driver?.toUpperCase() || ""}
                  {currentConnection?.host ? " · " + currentConnection.host : ""}
                  {currentConnection?.port ? ":" + currentConnection.port : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => void testConnection()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Проверить
                </button>
                {!currentConnection?.builtin ? (
                  <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => setMode("settings")}>
                    <Settings2 className="h-4 w-4" />
                    Настройки
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {([
                ["data", "Данные", Table2],
                ["schema", "Схема", History],
                ["sql", "SQL", Play],
                ["settings", "Подключение", Settings2],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={"inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold " + (mode === id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700")}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </header>

          {message ? <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{message}</div> : null}

          {mode === "settings" ? (
            currentConnection?.builtin ? (
              <section className="card p-5">
                <h3 className="font-bold">Основная БД</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Основная база данных MEDBIOHIM. Реквизиты подключения хранятся только на сервере и намеренно не редактируются из браузера.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Info label="Драйвер" value="PostgreSQL" />
                  <Info label="База" value={currentConnection.database_name || "postgres"} />
                  <Info label="Пользователь" value="server-side configuration" />
                  <Info label="SSL" value={currentConnection.sslmode || "require"} />
                </div>
              </section>
            ) : (
              <ConnectionPanel
                draft={draft}
                setDraft={setDraft}
                isNew={false}
                busy={busy}
                onSave={saveConnection}
              />
            )
          ) : null}

          {mode === "data" ? (
            <section className="card overflow-hidden">
              <div className="border-b bg-slate-50 p-4">
                <div className="flex flex-wrap gap-2">
                  <select value={table} onChange={(e) => setTable(e.target.value)} className="min-w-[240px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                    <option value="">Выберите таблицу</option>
                    {tables.map((item) => <option key={item.table_name} value={item.table_name}>{item.table_name} {item.estimated_rows != null ? "· " + Number(item.estimated_rows).toLocaleString("ru-RU") : ""}</option>)}
                  </select>
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Поиск по строкам…" className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                  <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => void loadTableData()} disabled={!table || busy}>
                    <RefreshCw className="h-4 w-4" /> Обновить
                  </button>
                  <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={downloadJson} disabled={!rows.length}>
                    <Download className="h-4 w-4" /> JSON
                  </button>
                  <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => setShowNew(true)} disabled={!table}>
                    <Plus className="h-4 w-4" /> Строка
                  </button>
                </div>
                {table ? (
                  <div className="mt-3 text-xs text-slate-500">
                    Таблица: <b>{table}</b> · PK: <b>{pks.length ? pks.join(" + ") : "нет"}</b> · показано {rows.length}
                  </div>
                ) : null}
              </div>

              {busy && !rows.length ? (
                <div className="flex min-h-[280px] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Загрузка данных…</div>
              ) : table && rows.length ? (
                <div className="overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-100">
                      <tr>
                        {columns.map((column) => <th key={column.column_name} className="whitespace-nowrap border-b border-r px-3 py-2 text-left">{column.column_name}{column.is_primary_key ? <span className="ml-1 text-indigo-500">PK</span> : null}</th>)}
                        <th className="sticky right-0 border-b bg-slate-100 px-3">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={String(index)} className={dirty(row) ? "bg-[var(--status-warn-bg)]" : "bg-white"}>
                          {columns.map((column) => (
                            <td key={column.column_name} className="border-b border-r p-0 align-top">
                              <textarea
                                disabled={column.is_primary_key}
                                value={display(row[column.column_name])}
                                onChange={(e) => setCell(index, column.column_name, e.target.value)}
                                className="min-h-9 min-w-[150px] resize-y bg-transparent px-3 py-2 outline-none focus:bg-indigo-50 disabled:text-slate-400"
                              />
                            </td>
                          ))}
                          <td className="sticky right-0 border-b bg-white px-2 align-top">
                            <button type="button" className="mr-1 rounded-lg bg-[var(--status-ok-bg)] p-2 text-[var(--status-ok-fg)] disabled:opacity-40" onClick={() => void saveRow(row)} disabled={!dirty(row) || busy || !pks.length} title="Сохранить">
                              <Save className="h-4 w-4" />
                            </button>
                            <button type="button" className="rounded-lg bg-[var(--status-critical-bg)] p-2 text-[var(--status-critical-fg)] disabled:opacity-40" onClick={() => void deleteRow(row)} disabled={busy || !pks.length} title="Удалить">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : table ? (
                <div className="p-10 text-center text-sm text-slate-500">Строк нет или поиск ничего не нашёл.</div>
              ) : (
                <div className="p-10 text-center text-sm text-slate-500">Выберите таблицу.</div>
              )}

              <div className="flex items-center justify-between gap-3 border-t bg-slate-50 px-4 py-3 text-xs">
                <span>Страница {page} · шаг {pageSize}</span>
                <div className="flex gap-2">
                  <button type="button" className="rounded-lg border bg-white px-3 py-1.5" disabled={page <= 1 || busy} onClick={() => setPage((value) => Math.max(1, value - 1))}>Назад</button>
                  <button type="button" className="rounded-lg border bg-white px-3 py-1.5" disabled={rows.length < pageSize || busy} onClick={() => setPage((value) => value + 1)}>Дальше</button>
                </div>
              </div>
            </section>
          ) : null}

          {mode === "schema" ? (
            <section className="card overflow-hidden">
              <div className="border-b bg-slate-50 px-4 py-3">
                <select value={table} onChange={(e) => setTable(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  {tables.map((item) => <option key={item.table_name} value={item.table_name}>{item.table_name}</option>)}
                </select>
              </div>
              {schemaBusy ? <div className="p-10 text-center text-sm text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : (
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-xs"><tr><th className="px-3 py-2 text-left">Колонка</th><th className="px-3 py-2 text-left">Тип</th><th className="px-3 py-2 text-left">NULL</th><th className="px-3 py-2 text-left">По умолчанию</th><th className="px-3 py-2 text-left">Ключ</th></tr></thead>
                    <tbody>{columns.map((column) => <tr key={column.column_name} className="border-t"><td className="px-3 py-2 font-semibold">{column.column_name}</td><td className="px-3 py-2 text-slate-600">{column.data_type} {column.udt_name && column.udt_name !== column.data_type ? "· " + column.udt_name : ""}</td><td className="px-3 py-2">{column.is_nullable}</td><td className="px-3 py-2 text-xs text-slate-500">{column.column_default || "—"}</td><td className="px-3 py-2">{column.is_primary_key ? <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">PRIMARY KEY</span> : "—"}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {mode === "sql" ? (
            <section className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">SQL Editor</h3>
                  <p className="text-xs text-slate-500">Один оператор за запуск. SELECT/EXPLAIN/SHOW выполняются сразу; изменение схемы или данных требует подтверждения.</p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--status-critical-fg)]">
                  <input type="checkbox" checked={confirmDanger} onChange={(e) => setConfirmDanger(e.target.checked)} />
                  Подтвердить изменение БД
                </label>
              </div>
              {sqlDraftOffer && (
                <div role="status" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                  <span className="min-w-0 flex-1">Найден невыполненный запрос от {formatDraftTime(sqlDraftOffer.savedAt)}.</span>
                  <button type="button" className="font-semibold" onClick={() => { setSql(sqlDraftOffer.value); setSqlDraftOffer(null); }}>Вставить</button>
                  <button type="button" className="font-semibold text-[var(--status-critical-fg)]" onClick={() => { clearDraft(SQL_DRAFT_KEY); setSqlDraftOffer(null); }}>Удалить</button>
                </div>
              )}
              <textarea value={sql} onChange={(e) => setSql(e.target.value)} className="mt-3 min-h-[260px] w-full rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-sm text-white outline-none" spellCheck={false} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => void runSql()} disabled={busy || !sql.trim()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Выполнить
                </button>
                <button type="button" className="btn-secondary" onClick={() => setSql("SELECT * FROM " + (table || "subjects") + " LIMIT 50")}>Шаблон SELECT</button>
                <button type="button" className="btn-secondary" onClick={() => setSqlResult(null)}>Очистить результат</button>
              </div>
              {sqlResult ? (
                <div className="mt-4 overflow-auto rounded-2xl border">
                  <div className="border-b bg-slate-50 px-3 py-2 text-xs text-slate-500">Результат: {sqlResult.command} · строк {sqlResult.row_count}{sqlResult.affected_rows != null ? " · изменено " + sqlResult.affected_rows : ""}</div>
                  {sqlResult.columns?.length ? (
                    <table className="min-w-full text-xs"><thead className="bg-slate-100"><tr>{sqlResult.columns.map((name: string) => <th key={name} className="whitespace-nowrap border-b px-3 py-2 text-left">{name}</th>)}</tr></thead><tbody>{(sqlResult.rows || []).map((row: RowData, index: number) => <tr key={index} className="border-t">{sqlResult.columns.map((name: string) => <td key={name} className="max-w-[420px] border-r px-3 py-2 align-top whitespace-pre-wrap">{display(row[name])}</td>)}</tr>)}</tbody></table>
                  ) : <div className="p-4 text-sm text-slate-600">Команда выполнена.</div>}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      {showNew ? (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 p-3 backdrop-blur-sm" onMouseDown={() => setShowNew(false)}>
          <div className="mx-auto mt-[8vh] max-w-3xl rounded-3xl bg-white p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold">Добавить строку</h3><p className="text-xs text-slate-500">JSON-объект. Поля с DEFAULT можно не передавать.</p></div><button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setShowNew(false)}><XCircle className="h-5 w-5" /></button></div>
            <textarea value={newJson} onChange={(e) => setNewJson(e.target.value)} className="mt-4 min-h-[260px] w-full rounded-2xl border bg-slate-950 p-4 font-mono text-sm text-white" spellCheck={false} />
            <div className="mt-3 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Отмена</button><button type="button" className="btn-primary" onClick={() => void insertRow()} disabled={busy}>Добавить</button></div>
          </div>
        </div>
      ) : null}
      {dialog}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-slate-50 p-3"><div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold text-slate-800">{value}</div></div>;
}

function ConnectionPanel({
  draft,
  setDraft,
  isNew,
  busy,
  onSave,
  onCancel,
}: {
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
  isNew: boolean;
  busy: boolean;
  onSave: () => void;
  onCancel?: () => void;
}) {
  const set = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <Settings2 className="mt-0.5 h-5 w-5 text-indigo-600" />
        <div><h3 className="font-bold">{isNew ? "Новое подключение" : "Настройка подключения"}</h3><p className="mt-1 text-sm text-slate-500">Пароль никогда не показывается обратно в браузер. Пустой пароль при редактировании сохраняет ранее сохранённый секрет.</p></div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Название<input value={draft.label || ""} onChange={(e) => set("label", e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="text-sm font-semibold">ID / slug<input value={draft.slug || ""} onChange={(e) => set("slug", e.target.value)} disabled={!isNew} className="mt-1 w-full rounded-xl border px-3 py-2 disabled:bg-slate-100" /></label>
        <label className="text-sm font-semibold">Драйвер<select value={draft.driver || "pgsql"} onChange={(e) => set("driver", e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="pgsql">PostgreSQL</option><option value="mysql">MySQL 8</option></select></label>
        <label className="text-sm font-semibold">Хост<input value={draft.host || ""} onChange={(e) => set("host", e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="text-sm font-semibold">Порт<input type="number" value={draft.port || ""} onChange={(e) => set("port", e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="text-sm font-semibold">Имя базы<input value={draft.database_name || ""} onChange={(e) => set("database_name", e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="text-sm font-semibold">Логин<input value={draft.username || ""} onChange={(e) => set("username", e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="text-sm font-semibold">Пароль<input type="password" value={draft.password || ""} onChange={(e) => set("password", e.target.value)} placeholder={isNew ? "Введите пароль" : draft.password_configured === "true" ? "••••••••  сохранён" : "Введите пароль"} className="mt-1 w-full rounded-xl border px-3 py-2" autoComplete="new-password" /></label>
        {draft.driver === "pgsql" ? <label className="text-sm font-semibold">SSL mode<select value={draft.sslmode || "require"} onChange={(e) => set("sslmode", e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="require">require</option><option value="prefer">prefer</option><option value="disable">disable</option></select></label> : null}
        <label className="text-sm font-semibold">Кодировка<input value={draft.charset || (draft.driver === "pgsql" ? "UTF8" : "utf8mb4")} onChange={(e) => set("charset", e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="flex items-end gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={draft.enabled !== "false"} onChange={(e) => set("enabled", e.target.checked ? "true" : "false")} /> Подключение активно</label>
      </div>
      <div className="mt-4 rounded-2xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-xs leading-5 text-[var(--status-warn-fg)]">
        Для сохранения пароля backend использует server-side DB_CREDENTIALS_KEY. В репозитории секретов нет; пароль сохраняется только в зашифрованном виде.
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {onCancel ? <button type="button" className="btn-secondary" onClick={onCancel}>Отмена</button> : null}
        <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={onSave} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Сохранить
        </button>
      </div>
    </section>
  );
}
