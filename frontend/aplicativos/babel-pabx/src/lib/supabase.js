import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// Quando uma Edge Function responde erro (4xx/5xx), o supabase-js esconde o
// corpo dentro de error.context — e a tela mostrava um erro genérico enquanto
// o servidor explicava exatamente o problema ("cota da RapidAPI estourou…").
// Este helper resgata a mensagem verdadeira. (Caso RITMO FORTE, 04/08.)
export async function erroDaFuncao(error, data) {
  if (data?.erro) return data.erro
  if (!error) return null
  try {
    const det = await error.context?.json?.()
    if (det?.erro) return det.erro
  } catch { /* corpo não era JSON */ }
  return null
}
