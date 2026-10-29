"use client";

import { useEffect, useState } from "react";
import { createCommunityPost, getAvatarUrl, listCommunityPosts, me } from "@/lib/api";
import { Loader2, Send } from "lucide-react";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";
import { PostDiscussion } from "@/components/community/PostDiscussion";

type Post = {
  id: string;
  title: string;
  body: string;
  author_id?: string;
  author_name?: string;
  author_has_avatar?: boolean;
  author?: string;
  created_at?: string;
  createdAt?: string;
};

/**
 * SA3: аватар автора. Загруженный файл отдаётся только через
 * аутентифицированный прокси, поэтому сначала берём object URL; если его нет —
 * остаются инициалы (внешний avatar_url в ленте не раскрываем).
 */
function AuthorAvatar({ userId, name, hasAvatar }: { userId?: string; name: string; hasAvatar?: boolean }) {
  const { data: url } = useApiRequest<string | null>(
    async () => (!userId || !hasAvatar ? null : getAvatarUrl(userId)),
    [userId, hasAvatar]
  );
  return (
    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-sm font-bold text-primary">
      {url
        ? /* eslint-disable-next-line @next/next/no-img-element */
          <img src={url} alt="" className="h-full w-full object-cover" />
        : name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [groups, setGroups] = useState<any[]>([]);
  const [groupId, setGroupId] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const res = await listCommunityPosts(groupId || undefined);
      if (res.ok) {
        setPosts((res.data.items as Post[]) || []);
        setNote(null);
      } else {
        setNote(describeApiError(res.error));
      }
    } catch {
      setNote("Сообщество недоступно");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const profile = await me();
      if (profile.ok) {
        const gs = Array.isArray(profile.data?.groups) ? profile.data.groups : [];
        setGroups(gs);
        if (gs.length === 1) setGroupId(String(gs[0].id ?? gs[0].group_id ?? ""));
      }
    })();
  }, []);

  useEffect(() => { if (groupId) reload(); }, [groupId]);

  async function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      const res = await createCommunityPost(title.trim(), body.trim(), groupId || undefined);
      if (!res.ok) {
        setNote(describeApiError(res.error));
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
        <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-3 text-sm text-[var(--status-warn-fg)]">
          {note}
        </div>
      )}

      <form onSubmit={submitPost} className="card space-y-3 p-5">
        <h2 className="font-semibold">Новый пост</h2>
        {groups.length > 1 && (
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">Выберите группу</option>
            {groups.map((g) => <option key={g.id ?? g.group_id} value={g.id ?? g.group_id}>{g.name ?? g.group_name}</option>)}
          </select>
        )}
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
                  <AuthorAvatar userId={p.author_id} name={author} hasAvatar={p.author_has_avatar} />
                  <div>
                    <div className="font-semibold">{author}</div>
                    <div className="text-xs text-slate-500">{date || "—"}</div>
                  </div>
                </div>
                <h3 className="mt-3 font-medium">{p.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{p.body}</p>
                <PostDiscussion post={p} onChanged={reload} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
