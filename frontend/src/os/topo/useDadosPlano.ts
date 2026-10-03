/**
 * Carrega sob demanda (lazy) os dados ricos do painel do plano: foto do usuário,
 * logo + nome da empresa, identidade do plano atual (pra renovar) e a chave PIX.
 *
 * Só dispara quando o popover do plano abre (`ativo = true`) e guarda o resultado
 * em cache pra não rebuscar a cada abertura. Não toca o boot do Desktop — todo o
 * peso fica fora do carregamento inicial.
 *
 * Reusa as tabelas que já existem: `profiles`, `empresas`, `assinaturas_usuario`
 * e `config_plataforma`. Nenhuma é nova.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DadosPlanoRico {
  carregando: boolean;
  usuarioNome: string;
  avatarUrl: string | null;
  empresaNome: string;
  empresaLogoUrl: string | null;
  /** id do plano atual em `loja_planos` — vira `item_id` do pedido de renovação. */
  planoId: string | null;
  /** preço do plano atual — vira `item_preco` do pedido. */
  preco: number;
  /** chave PIX da plataforma (pra copiar e pagar). */
  pix: string;
  /** data de expiração real da assinatura (ISO), pra recalcular os dias no painel. */
  dataExpiracao: string | null;
  /** descrição do plano em `loja_planos` — o que ele comporta, em texto. */
  descricaoPlano: string;
  /** duração do ciclo do plano em dias (`loja_planos.dias_expiracao`). */
  cicloDias: number | null;
}

const VAZIO: DadosPlanoRico = {
  carregando: false,
  usuarioNome: "",
  avatarUrl: null,
  empresaNome: "",
  empresaLogoUrl: null,
  planoId: null,
  preco: 0,
  pix: "",
  dataExpiracao: null,
  descricaoPlano: "",
  cicloDias: null,
};

export function useDadosPlano(ativo: boolean): DadosPlanoRico {
  const [dados, setDados] = useState<DadosPlanoRico>(VAZIO);
  const jaCarregou = useRef(false);

  useEffect(() => {
    if (!ativo || jaCarregou.current) return;
    jaCarregou.current = true;

    (async () => {
      setDados((d) => ({ ...d, carregando: true }));
      try {
        const { data: sessao } = await supabase.auth.getSession();
        const uid = sessao?.session?.user?.id;
        if (!uid) {
          setDados(VAZIO);
          return;
        }

        const [resPerfil, resEmpresa, resAssinatura, resConfig] =
          await Promise.allSettled([
            supabase
              .from("profiles")
              .select("full_name, avatar_url")
              .eq("id", uid)
              .maybeSingle(),
            supabase
              .from("empresas")
              .select("nome, logo_url")
              .eq("user_id", uid)
              .maybeSingle(),
            supabase
              .from("assinaturas_usuario")
              .select("plano_id, preco, data_expiracao")
              .eq("user_id", uid)
              .eq("status", "ativa")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("config_plataforma")
              .select("pix_key")
              .maybeSingle(),
          ]);

        const valor = <T,>(
          r: PromiseSettledResult<{ data: T | null }>,
        ): T | null => (r.status === "fulfilled" ? (r.value.data ?? null) : null);

        const perfil = valor<{ full_name: string; avatar_url: string | null }>(
          resPerfil,
        );
        const empresa = valor<{ nome: string; logo_url: string | null }>(
          resEmpresa,
        );
        const assinatura = valor<{
          plano_id: string | null;
          preco: number | null;
          data_expiracao: string | null;
        }>(resAssinatura);
        const config = valor<{ pix_key: string | null }>(resConfig);

        // O que o plano comporta (descrição + ciclo) vem de loja_planos —
        // depende do plano_id da assinatura, então busca em seguida.
        let plano: { descricao: string | null; dias_expiracao: number | null } | null =
          null;
        if (assinatura?.plano_id) {
          const { data } = await supabase
            .from("loja_planos")
            .select("descricao, dias_expiracao")
            .eq("id", assinatura.plano_id)
            .maybeSingle();
          plano = data ?? null;
        }

        setDados({
          carregando: false,
          usuarioNome: perfil?.full_name ?? "",
          avatarUrl: perfil?.avatar_url ?? null,
          empresaNome: empresa?.nome ?? "",
          empresaLogoUrl: empresa?.logo_url ?? null,
          planoId: assinatura?.plano_id ?? null,
          preco: Number(assinatura?.preco ?? 0),
          pix: config?.pix_key ?? "",
          dataExpiracao: assinatura?.data_expiracao ?? null,
          descricaoPlano: plano?.descricao ?? "",
          cicloDias: plano?.dias_expiracao ?? null,
        });
      } catch (e) {
        console.error("[useDadosPlano] falha ao carregar:", e);
        jaCarregou.current = false; // permite tentar de novo na próxima abertura
        setDados((d) => ({ ...d, carregando: false }));
      }
    })();
  }, [ativo]);

  return dados;
}
