import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// Slugs que a aplicacao usa para si - ninguem pode tomar como nome de painel.
// A mesma lista esta na policy de insert do banco: as duas precisam bater.
export const RESERVADOS = [
  'f', 'cadastro', 'gestao', 'admin', 'api', 'assets',
  'robots', 'favicon', 'app', 'www', 'painel',
]

// 'diagnostico*' é o formato dos links de formulário, que moram na raiz:
// ninguém pode tomar esse nome como endereço de painel.
export const ehReservado = (s) => RESERVADOS.includes(s) || /^diagnostico/i.test(s)

export function limparSlug(t) {
  return (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export const NIVEIS = {
  A: { rotulo: 'Quente', cor: 'text-violeta', borda: 'border-violeta/50', fundo: 'bg-violeta/10' },
  B: { rotulo: 'Morno', cor: 'text-ciano', borda: 'border-ciano/40', fundo: 'bg-ciano/10' },
  C: { rotulo: 'Frio', cor: 'text-tinta-3', borda: 'border-linha-forte/60', fundo: 'bg-superficie-2' },
}
