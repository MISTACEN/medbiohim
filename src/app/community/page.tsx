"use client";

import { useState } from "react";
import { communityPosts } from "@/lib/mock-data";
import { Heart, MessageCircle, Send } from "lucide-react";

export default function CommunityPage() {
  const [posts, setPosts] = useState(communityPosts);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  function toggleLike(id: string) {
    setLiked((prev) => ({ ...prev, [id]: !prev[id] }));
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, likes: liked[id] ? p.likes - 1 : p.likes + 1 }
          : p
      )
    );
  }

  function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setPosts((prev) => [
      {
        id: `c-${Date.now()}`,
        author: "Egor Ryazansev",
        role: "Студент",
        title: title.trim(),
        body: body.trim(),
        createdAt: new Date().toISOString().slice(0, 10),
        likes: 0,
        comments: 0,
      },
      ...prev,
    ]);
    setTitle("");
    setBody("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Сообщество</h1>
        <p className="mt-1 text-gray-500">Объявления, обсуждения и новости группы</p>
      </div>

      <form onSubmit={submitPost} className="card space-y-3 p-5">
        <h2 className="font-semibold text-gray-800">Новый пост</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Заголовок"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Текст сообщения..."
          rows={3}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button type="submit" className="btn-primary inline-flex items-center gap-2 text-sm">
          <Send className="h-4 w-4" />
          Опубликовать
        </button>
      </form>

      <ul className="space-y-4">
        {posts.map((p) => (
          <li key={p.id} className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {p.author.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <div className="font-semibold text-gray-900">{p.author}</div>
                <div className="text-xs text-gray-500">{p.role} · {p.createdAt}</div>
              </div>
            </div>
            <h3 className="mt-3 font-semibold text-gray-900">{p.title}</h3>
            <p className="mt-1 text-sm text-gray-700">{p.body}</p>
            <div className="mt-4 flex gap-4 text-sm text-gray-500">
              <button
                type="button"
                onClick={() => toggleLike(p.id)}
                className={`inline-flex items-center gap-1.5 hover:text-danger ${liked[p.id] ? "text-danger" : ""}`}
              >
                <Heart className="h-4 w-4" fill={liked[p.id] ? "currentColor" : "none"} />
                {p.likes}
              </button>
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" />
                {p.comments}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
