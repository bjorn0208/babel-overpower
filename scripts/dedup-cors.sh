#!/usr/bin/env bash
# B-09: Deduplica 36 cópias de _shared/cors.ts em backend/supabase/functions/
# Substitui todas por versão canônica com CORS restrito (sem wildcard *)
# Uso: ./scripts/dedup-cors.sh [--dry-run]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_DIR="$ROOT/backend/supabase/functions"
DRY_RUN="${1:-}"

CANONICAL='// cors.ts — versão canônica (B-09)
// Substitui 36 cópias divergentes; CORS restrito a origens conhecidas
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://babel-overpower.vercel.app",
];

export const corsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
};

export const handleCorsPreflight = (req: Request): Response | null => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  return null;
};
'

count=0
replaced=0

while IFS= read -r file; do
  count=$((count + 1))
  if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "[dry-run] would replace: $file"
  else
    printf '%s\n' "$CANONICAL" > "$file"
    replaced=$((replaced + 1))
  fi
done < <(find "$FUNCTIONS_DIR" -path '*/_shared/cors.ts' -type f)

echo "Found: $count files | Replaced: $replaced files"
if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "Run without --dry-run to apply changes."
fi