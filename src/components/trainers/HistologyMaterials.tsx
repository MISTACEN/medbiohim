"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ClipboardList,
  FileDown,
  FileText,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Search,
  X,
} from "lucide-react";
import JSZip from "jszip";
import { fetchMaterialFile, getTrainerImageUrl, hasToken } from "@/lib/api";
import { listSubjectMaterials, listTrainerFeed } from "@/lib/content-api";
import { ImageLightbox } from "@/components/media/ImageLightbox";

type Item = any;

const MODULE_ORDER: Record<string, number> = {
  "Цитология": 1,
  "Общая эмбриология": 2,
  "Эпителиальные ткани": 3,
  "Кровь и лимфа": 4,
  "Соединительные ткани": 5,
  "Скелетные ткани": 6,
  "Мышечные ткани": 7,
  "Нервная ткань": 8,
  "Нервная система (частная)": 9,
  "Сенсорные системы": 10,
  "Сердечно-сосудистая система": 11,
  "Эндокринная система": 12,
  "Кроветворение и иммунная защита": 13,
  "Пищеварительный канал (начало)": 14,
};

const CURRENT_SCHEME_MAX = 19;

function categoryOf(x: Item): string {
  const key = String(x.source_key || "");
  if (key.startsWith("histology-em-")) return "em";
  if (key.includes("-scheme-") || key.includes("-gif-") || key.includes("-spinal-schemes")) return "scheme";
  if (key.includes("-method-")) return "method";
  if (key.includes("-test-") || key.includes("-fed-") || key.includes("-control-")) return "tests";
  if (key.includes("-exam-") || key.includes("-specimen-list")) return "exam";
  return x.kind === "photo" ? "photo" : "other";
}

const categoryLabel: Record<string, string> = {
  scheme: "Схемы и таблицы",
  em: "Электронограммы",
  method: "Методички",
  tests: "Тесты и контрольные",
  exam: "Экзамен и списки препаратов",
  photo: "Фотографии препаратов",
  other: "Прочее",
};

const categoryOrder: Record<string, number> = {
  scheme: 1,
  em: 2,
  method: 3,
  tests: 4,
  exam: 5,
  photo: 6,
  other: 7,
};

function categoryIcon(category: string) {
  if (category === "em") return <Layers3 className="h-5 w-5" />;
  if (category === "method") return <BookOpen className="h-5 w-5" />;
  if (category === "tests" || category === "exam") return <ClipboardList className="h-5 w-5" />;
  if (category === "photo") return <ImageIcon className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

function schemeNumber(sourceKey: string): number | null {
  const match = String(sourceKey || "").match(/histology-zip-(?:scheme|gif)-(\d+)/);
  return match ? Number(match[1]) : null;
}

function isCurrentDocument(material: Item, currentEmNames: Set<string>) {
  const key = String(material.source_key || "");
  const category = categoryOf(material);
  if (category === "exam") return false;
  if (category === "scheme") {
    const n = schemeNumber(key);
    return n == null ? true : n <= CURRENT_SCHEME_MAX;
  }
  if (category === "em") {
    return currentEmNames.has(String(material.title || "").trim());
  }
  return true;
}

function DocumentView({ blob, title }: { blob: Blob; title: string }) {
  const [text, setText] = useState<string[]>([]);
  const [html, setHtml] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [kind, setKind] = useState<"doc" | "image" | "pdf" | "download">("doc");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mime = String(blob.type || "").toLowerCase();
        if (mime.includes("html")) {
          const value = await blob.text();
          if (alive) setHtml(value);
          return;
        }
        if (mime.startsWith("image/")) {
          if (alive) setKind("image");
          return;
        }
        if (mime.includes("pdf")) {
          if (alive) setKind("pdf");
          return;
        }

        const zip = await JSZip.loadAsync(blob);
        const xml = await zip.file("word/document.xml")?.async("string");
        if (!xml) throw new Error("Документ не содержит читаемого DOCX-текста.");

        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, "p"));
        const rows = paragraphs
          .map((p) => Array.from(p.getElementsByTagNameNS(ns, "t")).map((n) => n.textContent || "").join(""))
          .filter(Boolean);

        const media = Object.keys(zip.files).filter((name) => name.startsWith("word/media/"));
        const nextImages: string[] = [];
        for (const name of media) {
          const file = zip.file(name);
          if (!file) continue;
          const b64 = await file.async("base64");
          const ext = name.split(".").pop()?.toLowerCase() || "png";
          const imageMime =
            ext === "jpg" || ext === "jpeg"
              ? "image/jpeg"
              : ext === "gif"
                ? "image/gif"
                : ext === "webp"
                  ? "image/webp"
                  : "image/png";
          nextImages.push("data:" + imageMime + ";base64," + b64);
        }

        if (alive) {
          setText(rows);
          setImages(nextImages);
          setKind("doc");
        }
      } catch (cause) {
        if (alive) {
          setError(cause instanceof Error ? cause.message : "Не удалось прочитать документ.");
          setKind("download");
        }
      } finally {
        if (alive) setBusy(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [blob]);

  const openBinary = () => {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (busy) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />Открываем документ…
      </div>
    );
  }

  if (html) {
    return <iframe title={title} srcDoc={html} className="min-h-[70vh] w-full rounded-2xl border bg-white" sandbox="" />;
  }

  if (kind === "image") {
    const url = URL.createObjectURL(blob);
    return (
      <div className="flex min-h-full items-center justify-center">
        <img src={url} alt={title} className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-lg" />
      </div>
    );
  }

  if (kind === "pdf") {
    const url = URL.createObjectURL(blob);
    return <iframe title={title} src={url} className="min-h-[78vh] w-full rounded-2xl border bg-white" />;
  }

  if (kind === "download") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-sm text-amber-900">
        <p className="font-semibold">Этот файл нельзя безопасно разобрать в браузере.</p>
        {error ? <p className="mt-2 text-xs text-amber-800">{error}</p> : null}
        <button type="button" onClick={openBinary} className="btn-primary mt-5 inline-flex items-center gap-2">
          <FileDown className="h-4 w-4" /> Открыть оригинал
        </button>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
      <h3 className="mb-7 text-center text-xl font-bold text-slate-900">{title}</h3>
      <div className="space-y-3 text-[15px] leading-7 text-slate-800">
        {text.length ? text.map((row, index) => <p key={index}>{row}</p>) : <p className="text-slate-500">Текст не извлечён.</p>}
      </div>
      {images.length > 0 ? (
        <div className="mt-8 space-y-6 border-t pt-7">
          {images.map((src, index) => <img key={index} src={src} alt="" className="mx-auto max-h-[70vh] rounded-xl border object-contain" />)}
        </div>
      ) : null}
    </article>
  );
}

export default function HistologyMaterials() {
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState<Item | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasToken()) {
      setLoading(false);
      return;
    }

    Promise.all([
      listSubjectMaterials({ subjectSlug: "histology" }),
      listTrainerFeed("histology", "mbh", 500),
    ])
      .then(([materialsResult, feedResult]) => {
        if (!materialsResult.ok) {
          setError(materialsResult.error.message);
          return;
        }

        const feed = feedResult.ok ? (feedResult.data.items || []) : [];
        const currentEmNames = new Set(
          feed
            .filter((card: any) => card.mode_set === "electronogram" && card.plan_status === "ПРИВЯЗАНО")
            .map((card: any) => String(card.preparation?.name || "").trim()),
        );

        const docs = (materialsResult.data.items || []).map((material: any) => {
          const currentSemester = isCurrentDocument(material, currentEmNames);
          return {
            ...material,
            kind: "doc",
            category: categoryOf(material),
            currentSemester,
          };
        });

        const photos = feed.map((card: any) => ({
          id: String(card.id),
          subject_id: card.subject_id || "",
          subject_name: "Гистология",
          subject_slug: "histology",
          type: "image",
          title: card.preparation?.name || "Микропрепарат",
          source_key: card.source_key || null,
          module_title: card.plan_module_title || null,
          topic_title: card.plan_topic_title || null,
          kind: "photo",
          category: "photo",
          currentSemester: card.plan_status === "ПРИВЯЗАНО",
        }));

        setItems([...docs, ...photos]);
      })
      .catch(() => setError("Не удалось загрузить материалы."))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((item) => {
        const category = item.category;
        const tabOk = tab === "all" || tab === category;
        const semesterOk = showAll || item.currentSemester !== false;
        const searchable = [item.title, item.module_title, item.topic_title, item.source_key].filter(Boolean).join(" ").toLowerCase();
        return tabOk && semesterOk && (!needle || searchable.includes(needle));
      })
      .sort((a, b) => {
        const aModule = MODULE_ORDER[String(a.module_title || "")] ?? 99;
        const bModule = MODULE_ORDER[String(b.module_title || "")] ?? 99;
        const aCategory = categoryOrder[a.category] ?? 99;
        const bCategory = categoryOrder[b.category] ?? 99;
        return (
          aModule - bModule ||
          aCategory - bCategory ||
          String(a.topic_title || "").localeCompare(String(b.topic_title || ""), "ru") ||
          String(a.title || "").localeCompare(String(b.title || ""), "ru")
        );
      });
  }, [items, tab, query, showAll]);

  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of visible) {
      const module = item.module_title || "Материалы без привязки к учебному плану";
      const topic = item.topic_title || "Общий раздел";
      const key = module + "||" + topic;
      const group = map.get(key) || [];
      group.push(item);
      map.set(key, group);
    }
    return Array.from(map.entries());
  }, [visible]);

  async function open(item: Item) {
    setActive(item);
    setBlob(null);
    setPhoto(null);

    if (item.kind === "doc") {
      setBlob(await fetchMaterialFile(item.id));
      return;
    }

    setPhoto(await getTrainerImageUrl(item.id));
  }

  const tabs = [
    ["all", "Все"],
    ["scheme", "Схемы"],
    ["em", "Электронограммы"],
    ["method", "Методички"],
    ["tests", "Тесты"],
    ["exam", "Экзамен"],
    ["photo", "Фото препаратов"],
  ];

  if (loading) return <div className="card p-8 text-sm text-slate-500">Загрузка материалов…</div>;

  return (
    <div className="histology-materials-page space-y-5" style={{ colorScheme: "light" }}>
      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Материалы по гистологии</h2>
            <p className="mt-1 text-sm text-slate-500">Только текущий 3 семестр по умолчанию. Следующий семестр остаётся в архиве и не смешивается с текущими материалами.</p>
          </div>
          <label className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти материал…"
              className="!w-full !rounded-xl !border-slate-200 !bg-white !px-3 !py-2 !pl-9 !text-sm !text-slate-900 !shadow-none placeholder:!text-slate-400"
            />
          </label>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={
                "shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold " +
                (tab === key ? "border-indigo-600 bg-indigo-600 text-white" : "!bg-white text-slate-700")
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-800">
          <span>{showAll ? "Показан весь архив курса, включая следующий семестр." : "Показан только текущий 3 семестр."}</span>
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="shrink-0 rounded-lg border border-indigo-200 !bg-white px-3 py-1.5 font-semibold text-indigo-700"
          >
            {showAll ? "Только 3 семестр" : "Весь курс"}
          </button>
        </div>

        {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      </section>

      {groups.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">По выбранному фильтру материалов нет.</div>
      ) : (
        groups.map(([key, group]) => {
          const first = group[0];
          const module = first.module_title || "Материалы без привязки к учебному плану";
          const topic = first.topic_title || "Общий раздел";
          return (
            <section key={key} className="card p-4 sm:p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{module}</div>
                  <h3 className="mt-1 font-bold text-slate-900">{topic}</h3>
                  <p className="text-xs text-slate-500">{group.length} материалов</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void open(item)}
                    className="rounded-2xl border border-slate-200 !bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                        {categoryIcon(item.category)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="line-clamp-2 font-semibold text-slate-900">{item.title}</h4>
                        <p className="mt-1 text-xs text-slate-500">{categoryLabel[item.category] || "Прочее"}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })
      )}

      {active?.kind === "photo" ? (
        photo ? (
          <ImageLightbox
            src={photo}
            alt={String(active.title || "Фото препарата")}
            title={String(active.title || "Фото препарата")}
            caption={active.topic_title ? String(active.topic_title) : "Материалы · фотографии препаратов"}
            openOnMount
            showTrigger={false}
            onClose={() => setActive(null)}
          />
        ) : (
          <div className="fixed inset-0 z-[120] flex h-[100dvh] items-center justify-center bg-black/95 text-sm text-white">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загружаем фотографию препарата…
          </div>
        )
      ) : active ? (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5" onMouseDown={() => setActive(null)}>
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-3xl !bg-slate-100 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between gap-3 border-b !bg-white px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                  {categoryLabel[active.category] || "Документ"}
                </div>
                <h2 className="mt-1 break-words font-bold text-slate-900">{active.title}</h2>
                {active.topic_title ? <div className="mt-1 text-xs text-slate-500">{active.topic_title}</div> : null}
              </div>

              <div className="flex items-center gap-1">
                {active.kind === "doc" && blob ? (
                  <button
                    type="button"
                    onClick={() => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = String(active.title || "material");
                      a.click();
                      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    }}
                    className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                    aria-label="Скачать"
                    title="Скачать"
                  >
                    <FileDown className="h-5 w-5" />
                  </button>
                ) : null}
                <button type="button" onClick={() => setActive(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Закрыть">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto !bg-slate-100 p-3 sm:p-6">
              {blob ? (
                <DocumentView blob={blob} title={active.title} />
              ) : (
                <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center text-sm text-slate-500">
                  <p className="font-semibold text-slate-800">Документ пока не доступен для просмотра.</p>
                  <p className="mt-1">
                    Проверь размещение <code>content/histology</code> на SpaceWeb. После загрузки source-пакета документы и .doc HTML-зеркала открываются тем же viewer без изменения БД.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
