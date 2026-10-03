// @ts-nocheck
/**
 * use-motor-marketing — hook que chama o motor Mentor (agente-mestre-chat /
 * ragentic-processar-inline) para o App Marketing.
 *
 * Reusa exatamente o mesmo cano do CommandBar do bundle:
 *   1. Garante 1 row em `mentor_conversas` por sessão.
 *   2. Detecta VITE_COMMANDBAR_MOTOR_UNICO pra escolher edge.
 *   3. Parseia `tool_calls[]` → genUis com `dados.tipo = "imagem_post"`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type MensagemMarketing = {
  id: number;
  origem: 'usuario' | 'mentor';
  texto: string;
  genUis?: { tipo: string; dados: unknown; mensagem: string }[];
};

export function useMotorMarketing() {
  const [mensagens, setMensagens] = useState<MensagemMarketing[]>([]);
  const [gerando, setGerando] = useState(false);
  const refConversa = useRef<string | null>(null);
  const refCargoTipologia = useRef<string | null>(null);

  // Garante conversa ativa do Mentor (idêntico ao CommandBar)
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess?.session?.user?.id;
        if (!uid) return;
        const { data: existente } = await supabase
          .from('mentor_conversas')
          .select('id')
          .eq('owner_id', uid)
          .order('atualizado_em', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existente?.id) {
          if (ativo) refConversa.current = existente.id;
          return;
        }
        const { data: nova } = await supabase
          .from('mentor_conversas')
          .insert({ owner_id: uid })
          .select('id')
          .single();
        if (ativo && nova?.id) refConversa.current = nova.id;
      } catch (e) {
        console.warn('[marketing] mentor_conversas init falhou:', e?.message ?? e);
      }
    })();
    return () => { ativo = false; };
  }, []);

  const enviar = useCallback(async (texto: string) => {
    const t = texto.trim();
    if (!t || gerando) return;

    const id = Date.now();
    setMensagens(m => [...m, { id, origem: 'usuario', texto: t }]);
    setGerando(true);

    try {
      let conversaId = refConversa.current;
      if (!conversaId) {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess?.session?.user?.id;
        if (!uid) throw new Error('Faça login pra continuar.');
        const { data: nova, error: errIns } = await supabase
          .from('mentor_conversas')
          .insert({ owner_id: uid })
          .select('id')
          .single();
        if (errIns) throw errIns;
        conversaId = nova.id;
        refConversa.current = conversaId;
      }

      // Cano idêntico ao CommandBar: respeita flag de motor único
      const USAR_MOTOR_UNICO = import.meta.env.VITE_COMMANDBAR_MOTOR_UNICO === 'true';

      if (!USAR_MOTOR_UNICO && refCargoTipologia.current === null) {
        try {
          const { data: sessP } = await supabase.auth.getSession();
          const uidP = sessP?.session?.user?.id;
          let systemRole: string | null = null;
          if (uidP) {
            const { data: perfil } = await supabase
              .from('profiles')
              .select('system_role')
              .eq('id', uidP)
              .maybeSingle();
            systemRole = perfil?.system_role ?? null;
          }
          refCargoTipologia.current = systemRole === 'platform_admin' ? 'admin' : 'mentor';
        } catch {
          refCargoTipologia.current = 'mentor';
        }
      }

      const { data: resp, error: errInv } = USAR_MOTOR_UNICO
        ? await supabase.functions.invoke('ragentic-processar-inline', {
            body: { conversa_id: conversaId, mensagem: t },
          })
        : await supabase.functions.invoke('agente-mestre-chat', {
            body: { conversa_id: conversaId, mensagem: t, cargo_tipologia: refCargoTipologia.current },
          });
      if (errInv) throw errInv;
      if (!resp?.ok) throw new Error(resp?.error ?? 'Falha ao gerar imagem');

      const respostaTexto = String(resp.mensagem ?? '').trim() || '…';
      const toolCalls = Array.isArray(resp.tool_calls) ? resp.tool_calls : [];
      const genUis = toolCalls
        .map((tc: unknown) => {
          if (!tc?.resultado || typeof tc.resultado !== 'string') return null;
          try {
            const j = JSON.parse(tc.resultado);
            if (j?.dados?.tipo) return { tipo: j.dados.tipo, dados: j.dados, mensagem: j.mensagem ?? '' };
          } catch { /* não-JSON */ }
          return null;
        })
        .filter(Boolean);

      setMensagens(m => [
        ...m,
        { id: id + 1, origem: 'mentor', texto: respostaTexto, genUis },
      ]);
    } catch (e: unknown) {
      const msg = e?.message ?? String(e);
      setMensagens(m => [
        ...m,
        { id: id + 1, origem: 'mentor', texto: `Não consegui gerar a imagem agora. (${msg})` },
      ]);
    } finally {
      setGerando(false);
    }
  }, [gerando]);

  const limpar = useCallback(() => setMensagens([]), []);

  return { mensagens, gerando, enviar, limpar };
}
