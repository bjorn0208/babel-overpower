import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2";

export function criarClienteAdmin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error(
      "criarClienteAdmin: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente no env",
    );
  }
  return createClient(url, serviceRoleKey);
}

export function criarClienteUsuario(authHeader: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error(
      "criarClienteUsuario: SUPABASE_URL ou SUPABASE_ANON_KEY ausente no env",
    );
  }
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

export function criarClienteUsuarioDoRequest(
  req: Request,
): SupabaseClient | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  return criarClienteUsuario(authHeader);
}
