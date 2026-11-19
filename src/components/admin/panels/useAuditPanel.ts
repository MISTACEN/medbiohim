"use client";

/** Журнал версий контента: состояние и действия — загрузка, diff, откат. */
import { useCallback, useEffect, useState } from "react";
import { adminDbAudit, adminDbAuditVersion, adminRollbackAudit } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  AUDIT_PAGE_SIZE,
  AUDIT_TABLE_LABEL,
  type AuditDetail,
  type AuditRow,
} from "@/components/admin/panels/model";

export function useAuditPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [table, setTable] = useState("");
  const [rollbackTables, setRollbackTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [details, setDetails] = useState<Record<string, AuditDetail | null>>({});
  const [busy, setBusy] = useState("");
  const { confirm, dialog } = useConfirm();

  function msg(err = "", good = "") { setError(err); setOk(good); }

  const load = useCallback(async (nextTable: string, nextOffset: number) => {
    setLoading(true);
    const r = await adminDbAudit({ limit: AUDIT_PAGE_SIZE, offset: nextOffset, table: nextTable || undefined });
    setLoading(false);
    if (!r.ok) return msg(describeApiError(r.error));
    setRows((r.data.items || []) as AuditRow[]);
    setTotal(Number(r.data.total ?? (r.data.items || []).length));
    setOffset(nextOffset);
    setRollbackTables(Array.isArray(r.data.rollback_tables) ? r.data.rollback_tables : []);
    setDetails({});
  }, []);

  useEffect(() => { void load("", 0); }, [load]);

  async function openDetail(row: AuditRow) {
    if (details[row.id]) {
      setDetails((prev) => ({ ...prev, [row.id]: null }));
      return;
    }
    setBusy("detail-" + row.id);
    const r = await adminDbAuditVersion(row.id);
    setBusy("");
    if (!r.ok) return msg(describeApiError(r.error));
    setDetails((prev) => ({ ...prev, [row.id]: r.data as AuditDetail }));
  }

  async function rollback(row: AuditRow) {
    const label = AUDIT_TABLE_LABEL[row.table_name] || row.table_name;
    const agreed = await confirm({
      title: `Откатить к версии №${row.version_no}?`,
      description: `${label} вернётся к значениям этой версии. Текущее состояние тоже попадёт в журнал, так что откат обратим.`,
      confirmLabel: "Откатить",
    });
    if (!agreed) return;
    setBusy("rollback-" + row.id);
    const r = await adminRollbackAudit(row.id);
    setBusy("");
    if (!r.ok) return msg(describeApiError(r.error));
    msg("", `Версия №${row.version_no} восстановлена`);
    await load(table, offset);
  }

  return {
    rows, total, offset, table, setTable,
    rollbackTables, loading, error, ok, details, busy,
    dialog, load, openDetail, rollback,
  };
}
