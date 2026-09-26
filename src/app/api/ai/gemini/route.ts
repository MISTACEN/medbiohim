import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const expected = process.env.GEMINI_VERCEL_PROXY_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.GEMINI_API_KEY || "";
  if (!key) return NextResponse.json({ error: "GEMINI_API_KEY is not configured on Vercel" }, { status: 503 });

  const body = await req.json().catch(() => null) as any;
  if (!body || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "messages required" }, { status: 422 });
  }

  const model = String(body.model || process.env.GEMINI_MODEL || "gemini-3.6-flash");
  const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.4;
  let system = "";
  const input: any[] = [];
  for (const m of body.messages) {
    const role = String(m?.role || "user");
    const content = String(m?.content || "");
    if (role === "system") {
      system += (system ? "\n" : "") + content;
      continue;
    }
    input.push({
      type: role === "assistant" ? "model_output" : "user_input",
      content: [{ type: "text", text: content }],
    });
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input,
      store: false,
      generation_config: { temperature, max_output_tokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 2048) },
      ...(system ? { system_instruction: system } : {}),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: data?.error || data }, { status: response.status });

  let text = "";
  for (const step of Array.isArray(data?.steps) ? data.steps : []) {
    if (step?.type !== "model_output") continue;
    for (const part of Array.isArray(step?.content) ? step.content : []) {
      if (part?.type === "text") text += String(part.text || "");
    }
  }
  if (!text.trim()) return NextResponse.json({ error: "Gemini returned empty content" }, { status: 502 });
  return NextResponse.json({ text: text.trim(), model });
}
