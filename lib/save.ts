import type { SupabaseClient } from "@supabase/supabase-js";

// Columns added after the first version. If the database hasn't been updated yet
// (supabase/schema.sql), saving still works without them.
const NEWER = ["brand", "details", "position"];
const missingColumn = (e: { message?: string; code?: string } | null) => !!e && (e.code === "PGRST204" || /column/i.test(e.message || ""));

export async function saveThing<T = unknown>(sb: SupabaseClient, fields: Record<string, unknown>, id?: string): Promise<T> {
  const run = (f: Record<string, unknown>) => (id ? sb.from("things").update(f).eq("id", id).select().single() : sb.from("things").insert(f).select().single());
  let { data, error } = await run(fields);
  if (error && missingColumn(error) && NEWER.some((k) => k in fields)) {
    const older = Object.fromEntries(Object.entries(fields).filter(([k]) => !NEWER.includes(k)));
    ({ data, error } = await run(older));
  }
  if (error) throw error;
  return data as T;
}
