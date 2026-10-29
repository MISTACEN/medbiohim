"use client";

import { useState } from "react";
import { Flag, Loader2, Pencil, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  createPostComment,
  deletePostComment,
  reportCommunityPost,
  updateCommunityPost,
  updatePostComment,
} from "@/lib/api";
import { describeApiError } from "@/lib/errors";

type Comment = {
  id: string;
  user_id: string;
  author_name?: string | null;
  body: string;
  created_at: string;
  updated_at?: string;
};

type Post = {
  id: string;
  title: string;
  body: string;
  author_id?: string;
};

function formatDate(iso?: string) {
  return iso ? iso.slice(0, 10) : "—";
}

/**
 * FA5: обсуждение под постом — список, добавление, правка и удаление своих
 * комментариев; правка своего поста; жалоба в модерскую очередь.
 */
export function PostDiscussion({ post, onChanged }: { post: Post; onChanged: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editingPost, setEditingPost] = useState(false);
  const [postTitle, setPostTitle] = useState(post.title);
  const [postBody, setPostBody] = useState(post.body);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");

  const isAuthor = Boolean(user?.id && post.author_id && String(user.id) === String(post.author_id));

  async function loadComments() {
    const { listPostComments } = await import("@/lib/api");
    const res = await listPostComments(post.id);
    if (res.ok) {
      setComments(res.data.items || []);
      setError("");
    } else {
      setError(describeApiError(res.error));
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) void loadComments();
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const res = await createPostComment(post.id, text.trim());
    setBusy(false);
    if (res.ok) {
      setText("");
      setComments((current) => [...(current || []), res.data.comment]);
      setError("");
    } else {
      setError(describeApiError(res.error));
    }
  }

  async function saveCommentEdit(commentId: string) {
    if (!editText.trim()) return;
    const res = await updatePostComment(post.id, commentId, editText.trim());
    if (res.ok) {
      setComments((current) => (current || []).map((c) => (c.id === commentId ? { ...c, body: res.data.comment.body, updated_at: res.data.comment.updated_at } : c)));
      setEditingId(null);
      setError("");
    } else {
      setError(describeApiError(res.error));
    }
  }

  async function removeComment(commentId: string) {
    const res = await deletePostComment(post.id, commentId);
    if (res.ok) {
      setComments((current) => (current || []).filter((c) => c.id !== commentId));
      setError("");
    } else {
      setError(describeApiError(res.error));
    }
  }

  async function savePostEdit() {
    if (!postTitle.trim() || !postBody.trim()) return;
    setBusy(true);
    const res = await updateCommunityPost(post.id, postTitle.trim(), postBody.trim());
    setBusy(false);
    if (res.ok) {
      setEditingPost(false);
      setError("");
      onChanged();
    } else {
      setError(describeApiError(res.error));
    }
  }

  async function sendReport() {
    if (!reportReason.trim()) return;
    setBusy(true);
    const res = await reportCommunityPost(post.id, reportReason.trim());
    setBusy(false);
    if (res.ok) {
      setReporting(false);
      setReportReason("");
      setError("");
      // Честная обратная связь вместо тишины.
      setError("Жалоба отправлена модераторам.");
    } else {
      setError(describeApiError(res.error));
    }
  }

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={toggle} className="font-semibold text-indigo-600">
          {open ? "Скрыть обсуждение" : "Обсуждение"}
        </button>
        {isAuthor && !editingPost && (
          <button type="button" onClick={() => setEditingPost(true)} className="inline-flex items-center gap-1 text-slate-500 hover:text-indigo-600">
            <Pencil className="h-3.5 w-3.5" /> Редактировать
          </button>
        )}
        {!isAuthor && !reporting && (
          <button type="button" onClick={() => setReporting(true)} className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-600">
            <Flag className="h-3.5 w-3.5" /> Жалоба
          </button>
        )}
      </div>

      {error && <p className={"mt-2 text-xs " + (error.startsWith("Жалоба") ? "text-emerald-600" : "text-rose-600")}>{error}</p>}

      {editingPost && (
        <div className="mt-2 space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
          <input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }} />
          <textarea value={postBody} onChange={(e) => setPostBody(e.target.value)} rows={3} className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void savePostEdit()} className="btn-primary text-xs disabled:opacity-50">Сохранить</button>
            <button type="button" onClick={() => { setEditingPost(false); setPostTitle(post.title); setPostBody(post.body); }} className="rounded-xl border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>Отмена</button>
          </div>
        </div>
      )}

      {reporting && (
        <div className="mt-2 rounded-xl bg-rose-50 p-3">
          <textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Что не так с этим постом? (до 500 знаков)"
            className="w-full rounded-xl border border-rose-200 px-3 py-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy || !reportReason.trim()} onClick={() => void sendReport()} className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Отправить жалобу</button>
            <button type="button" onClick={() => setReporting(false)} className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs">Отмена</button>
          </div>
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-2">
          {comments === null ? (
            <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка…</div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-slate-500">Комментариев пока нет.</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <b className="text-slate-700">{comment.author_name || "Студент"}</b>
                  <span>{formatDate(comment.created_at)}{comment.updated_at && comment.updated_at !== comment.created_at ? " (изменён)" : ""}</span>
                  {String(user?.id || "") === String(comment.user_id) && editingId !== comment.id && (
                    <>
                      <button type="button" onClick={() => { setEditingId(comment.id); setEditText(comment.body); }} className="text-indigo-600">правка</button>
                      <button type="button" onClick={() => void removeComment(comment.id)} className="inline-flex items-center gap-0.5 text-rose-500"><Trash2 className="h-3 w-3" /> удалить</button>
                    </>
                  )}
                </div>
                {editingId === comment.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} maxLength={2000} className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }} />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void saveCommentEdit(comment.id)} className="btn-primary text-xs">Сохранить</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-xl border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>Отмена</button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{comment.body}</p>
                )}
              </div>
            ))
          )}
          <form onSubmit={submitComment} className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              placeholder="Ваш комментарий…"
              className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
            <button type="submit" disabled={busy || !text.trim()} className="btn-primary inline-flex items-center gap-1.5 px-3 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
