"use client";

/**
 * Экзаменационные билеты — отдельно от SRS.
 * ?subject_slug= со страницы предмета; только строгий match.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { generateTicket, listTicketBanks, type BankQuestion } from "@/lib/api";
import { resolveSubjectSlug, subjectSlugMatches } from "@/lib/subjectSlug";
import { describeApiError } from "@/lib/errors";
import { compareRu } from "@/lib/collation";
import { type Bank } from "@/components/tickets/model";

export function useTicketsPage() {
  const search = useSearchParams();
  const fromSubject = useMemo(() => {
    const slug = search.get("subject_slug") || search.get("slug") || "";
    const id = search.get("subject") || "";
    return resolveSubjectSlug(slug || id);
  }, [search]);

  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankId, setBankId] = useState("");
  const [count, setCount] = useState(3);
  const [mode, setMode] = useState<"practice" | "exam">("exam");
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [title, setTitle] = useState("");
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    listTicketBanks().then((res) => {
      if (!res.ok) {
        setNote(describeApiError(res.error));
        return;
      }
      const items = (res.data.items || []) as Bank[];
      setBanks([...items].sort((a, b) => compareRu(String(a.title || ""), String(b.title || ""))));
      if (fromSubject) {
        const hit = items.find((b) => subjectSlugMatches(b.subject_slug, fromSubject));
        if (hit) {
          setBankId(hit.id);
          setNote(`Банк: ${hit.title}`);
        } else {
          setBankId("");
          setNote(
            `Для «${fromSubject}» своего банка билетов нет. Чужой предмет не подставляем (гистология ≠ неорганика).`
          );
        }
      } else {
        setBankId("");
        setNote("Выберите банк билетов вручную.");
      }
    });
  }, [fromSubject]);

  async function generate() {
    if (!bankId) return;
    setLoading(true);
    setReveal({});
    const res = await generateTicket(bankId, count, mode);
    setLoading(false);
    if (!res.ok) {
      setNote(describeApiError(res.error));
      return;
    }
    setQuestions(res.data.questions);
    setTitle(res.data.bank.title);
    setNote(null);
  }

  const selected = banks.find((b) => b.id === bankId);

  return {
    fromSubject,
    banks,
    bankId,
    setBankId,
    count,
    setCount,
    mode,
    setMode,
    loading,
    questions,
    title,
    reveal,
    setReveal,
    note,
    generate,
    selected,
  };
}

export type TicketsPageState = ReturnType<typeof useTicketsPage>;
