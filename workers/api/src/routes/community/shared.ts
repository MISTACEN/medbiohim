
export async function assertGroupMember(supabase: any, userId: string, groupId: string) {
  const { data, error } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return "error" as const;
  return data ? ("member" as const) : ("denied" as const);
}

export const GROUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function assertPostAccess(supabase: any, userId: string, postId: string): Promise<{ post?: any; error?: "not_found" | "forbidden" | "db" }> {
  const { data: post, error } = await supabase
    .from("community_posts")
    .select("id,author_id,group_id,title")
    .eq("id", postId)
    .maybeSingle();
  if (error) return { error: "db" };
  if (!post) return { error: "not_found" };
  if (post.group_id) {
    const membership = await assertGroupMember(supabase, userId, String(post.group_id));
    if (membership === "error") return { error: "db" };
    if (membership === "denied") return { error: "forbidden" };
  }
  return { post };
}
