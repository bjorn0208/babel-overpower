import { useCallback } from 'react'
import { supabase } from '@/integrations/supabase/client'

/**
 * Regenera o RAG (`blocos_conhecimento`) do agente do tenant após salvar
 * dado-fonte (produto / produto_conhecimento / empresa / contrato_template /
 * config do agente). Porte do padrão do sistema antigo pro OS novo.
 *
 * Fire-and-forget: o erro não bloqueia o save do usuário — se o sync falhar,
 * o dado já está salvo; a próxima edição ressincroniza (a edge é full-rebuild).
 *
 * @param ownerId `user_id` do tenant dono do agente.
 */
export function useSincronizarBlocos(ownerId: string | null | undefined) {
  const sync = useCallback(async () => {
    if (!ownerId) return
    try {
      const { data, error } = await supabase
        .from('agentes_usuario')
        .select('id')
        .eq('user_id', ownerId)
        .limit(1)
        .single()
      if (error || !data?.id) return
      await supabase.functions.invoke('sincronizar-blocos', {
        body: { agente_id: data.id },
      })
    } catch {
      /* sync silencioso — não interrompe o fluxo do usuário */
    }
  }, [ownerId])

  return { sync }
}
