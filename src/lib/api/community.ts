/**
 * Сообщество: посты, комментарии, жалобы (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 */
import { api } from "./client";
import { endpoints } from "../endpoints";

export async function createCommunityPost(title: string, body: string, groupId?: string): Promise<any> { return api(endpoints.community.posts(), { method: "POST", body: JSON.stringify({ title, body, group_id: groupId }) }) as any; }
export async function listCommunityPosts(groupId?: string): Promise<any> {
  const q = groupId ? `group_id=${encodeURIComponent(groupId)}` : "";
  return api(endpoints.community.posts(q || undefined)) as any;
}
export async function listPostComments(postId: string, options: RequestInit = {}) { return api(endpoints.community.postComments(postId), options) as any; }
export async function createPostComment(postId: string, body: string) { return api(endpoints.community.postComments(postId), { method: "POST", body: JSON.stringify({ body }) }) as any; }
export async function updatePostComment(postId: string, commentId: string, body: string) { return api(endpoints.community.postComment(postId, commentId), { method: "PATCH", body: JSON.stringify({ body }) }) as any; }
export async function deletePostComment(postId: string, commentId: string) { return api(endpoints.community.postComment(postId, commentId), { method: "DELETE" }) as any; }
export async function updateCommunityPost(postId: string, title: string, body: string) { return api(endpoints.community.post(postId), { method: "PATCH", body: JSON.stringify({ title, body }) }) as any; }
export async function reportCommunityPost(postId: string, reason: string) { return api(endpoints.community.postReport(postId), { method: "POST", body: JSON.stringify({ reason }) }) as any; }
