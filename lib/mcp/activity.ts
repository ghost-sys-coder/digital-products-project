import "server-only";
import { getSupabase } from "../supabase";
import type { McpActivity } from "../database.types";

// The owner's log of what assistants did (/admin/connections). A failed write here never fails the tool.

export async function logActivity(connectionId: string, tool: string, summary: string, ok: boolean) {
  try {
    await getSupabase().from("mcp_activity").insert({ connection_id: connectionId, tool: tool.slice(0, 80), summary: summary.replace(/\s+/g, " ").trim().slice(0, 300), ok });
  } catch { /* the log is best effort */ }
}

export async function recentActivity(limit = 60) {
  const { data, error } = await getSupabase().from("mcp_activity").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Could not load assistant activity");
  return (data ?? []) as McpActivity[];
}
