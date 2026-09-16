"use client";

import { useEffect, useState } from "react";
import { createCommunityPost, listCommunityPosts } from "@/lib/api";
import { Loader2, Send } from "lucide-react";

type Post = {
  id: string;
  title: string;
  body: string;
  author_name?: string;
  author?: string;
  created_at?: string;
  createdAt?: string;
};

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const res = await listCommunityPosts();
      if (res.ok) {
        setPosts((res.data.items as Post[]) || []);
        setNote(null);
      } else {
        setNote(res.error.message);
      }
    } catch {
      setNote("Сообщество недоступно");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      const res = await createCommunityPost(title.trim(), body.trim());
      if (!res.ok) {
        setNote(res.error.message);
        return;
      }
      setTitle("");
      setBody("");
      await reload();
    } catch {
      setNote("Не удалось опубликовать");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Сообщество</h1>
        <p className="page-subtitle">Обсуждения группы · живые посты из API</p>
      </div>

      {note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {note}
        </div>
      )}

      <form onSubmit={submitPost} className="card space-y-3 p-5">
        <h2 className="font-semibold">Новый пост</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Заголовок"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Текст сообщения…"
          rows={3}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={busy}
          className="btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Опубликовать
        </button>
      </form>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-slate-500">Пока нет постов — будьте первым.</p>
      ) : (
        <ul className="space-y-4">
          {posts.map((p) => {
            const author = p.author_name || p.author || "Студент";
            const date = (p.created_at || p.createdAt || "").slice(0, 10);
            return (
              <li key={p.id} className="card p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                    {author.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold">{author}</div>
                    <div className="text-xs text-slate-500">{date || "—"}</div>
                  </div>
                </div>
                <h3 className="mt-3 font-medium">{p.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{p.body}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
