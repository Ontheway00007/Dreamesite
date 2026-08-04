import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Typed wrapper for the admin database functions.
 *
 * `src/types/database.ts` is hand-maintained rather than produced by
 * `supabase gen types` (documented in that file and in the README), and the
 * simplified shape does not give `supabase.rpc()` enough information to
 * infer argument and return types. The generated types will; until a
 * Supabase project exists to generate them from, the assertion has to live
 * somewhere.
 *
 * Keeping it here means exactly one place performs it, guarded by argument
 * types derived from the same `Database` declaration the rest of the code
 * uses. Call sites stay fully typed.
 *
 * When `npm run db:types` becomes available, this module can be deleted and
 * the calls inlined.
 */

type Functions = Database["public"]["Functions"];

interface RpcResult<T> {
  readonly data: T | null;
  readonly error: { code?: string; message?: string } | null;
}

interface RpcCapableClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult<unknown>>;
}

/**
 * Calls a database function with checked arguments.
 *
 * @example
 * const { error } = await callRpc(supabase, "property_publish_blockers", {
 *   p_property_id: id,
 * });
 */
export async function callRpc<Name extends keyof Functions & string>(
  client: SupabaseClient<Database>,
  name: Name,
  args: Functions[Name]["Args"],
): Promise<RpcResult<Functions[Name]["Returns"]>> {
  const result = await (client as unknown as RpcCapableClient).rpc(
    name,
    args as Record<string, unknown>,
  );

  return result as RpcResult<Functions[Name]["Returns"]>;
}
