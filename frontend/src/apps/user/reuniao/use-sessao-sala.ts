// @ts-nocheck
/**
 * use-sessao-sala — ciclo de vida da sessão do app Reunião:
 * criar sala agora, agendar, entrar, sair, encerrar, alternar aprovação
 * de entrada e copiar link.
 *
 * O estado da chamada NÃO mora mais aqui: mora em `sessao-viva.ts`, fora da
 * árvore React, pra sobreviver a minimizar/fechar a janela do app. Este hook
 * virou a camada de comandos + leitura desse estado.
 */

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  abrirSessaoViva,
  assinarSessaoViva,
  definirAprovacaoAtiva,
  definirMostrarLinkPronto,
  encerrarSalaPorId,
  encerrarSessaoViva,
  lerSessaoViva,
} from "./sessao-viva";
import { urlSala } from "@/lib/url-app";
import type { SalaResumo } from "./reuniao-tipos";

export { encerrarSalaPorId };

export function linkPublico(chave: string): string {
  return urlSala(chave);
}

type Params = {
  userId: string | null;
  meuNome: string;
  teto: number;
  setSalas: (fn: (prev: SalaResumo[]) => SalaResumo[]) => void;
  /** Limpeza extra ao sair da sessão (ex.: resetar estado local da tela). */
  aoSair: () => void;
};

export function useSessaoSala({ userId, meuNome, teto, setSalas, aoSair }: Params) {
  const viva = useSyncExternalStore(assinarSessaoViva, lerSessaoViva, lerSessaoViva);
  const { sessao, estadoRTC, aprovacaoAtiva, mostrarLinkPronto, recursoAberto } = viva;
  const [entrando, setEntrando] = useState<string | null>(null);

  async function reunirAgora() {
    if (!userId) {
      toast.error("Você precisa estar logado.");
      return;
    }
    setEntrando("novo");
    try {
      const maxSeguro = teto; // teto da plataforma (config_plataforma — gerido no app Admin Reuniões)
      const { data, error } = await supabase.rpc("criar_sala_agora", {
        p_titulo: "Reunião rápida",
        p_max: maxSeguro,
      });
      if (error) throw error;
      const res = data as {
        sala_id: string;
        chave_publica: string;
        titulo: string;
        exige_aprovacao?: boolean;
      };
      abrirSessaoViva({
        sessao: {
          salaId: res.sala_id,
          chavePublica: res.chave_publica,
          titulo: res.titulo,
          ehAnfitriao: true,
        },
        meuNome,
        aprovacaoAtiva: res.exige_aprovacao ?? false,
        mostrarLinkPronto: true,
      });
      setSalas((prev) => [
        {
          id: res.sala_id,
          titulo: res.titulo,
          status: "ao_vivo",
          chave_publica: res.chave_publica,
          agendada_para: null,
          duracao_min: null,
        },
        ...prev,
      ]);
    } catch (err) {
      console.error("[Reunião] reunirAgora", err);
      toast.error("Erro ao criar sala. Tente novamente.");
    } finally {
      setEntrando(null);
    }
  }

  async function agendarReuniao(
    titulo: string,
    dataHora: string,
    duracao: number,
    max: number,
    exigeAprovacao: boolean,
  ) {
    const maxSeguro = Math.min(max, teto); // dupla defesa: clamp antes da RPC
    const { data, error } = await supabase.rpc("agendar_reuniao", {
      p_titulo: titulo,
      p_agendada_para: dataHora,
      p_duracao_min: duracao,
      p_max: maxSeguro,
      p_exige_aprovacao: exigeAprovacao,
    });
    if (error) {
      toast.error("Erro ao agendar reunião.");
      return;
    }
    const res = data as { sala_id: string; chave_publica: string };
    setSalas((prev) => [
      {
        id: res.sala_id,
        titulo,
        status: "agendada",
        chave_publica: res.chave_publica,
        agendada_para: dataHora,
        duracao_min: duracao,
      },
      ...prev,
    ]);
    toast.success(`Reunião "${titulo}" agendada.`);
  }

  async function entrarNaSala(sala: SalaResumo) {
    if (!userId) return;
    setEntrando(sala.id);
    try {
      await supabase
        .from("salas_reuniao_participantes")
        .insert({ sala_id: sala.id, user_id: userId, papel: "participante" });
      abrirSessaoViva({
        sessao: {
          salaId: sala.id,
          chavePublica: sala.chave_publica,
          titulo: sala.titulo,
          ehAnfitriao: false,
        },
        meuNome,
      });
    } catch (err) {
      console.error("[Reunião] entrarNaSala", err);
      toast.error("Não foi possível entrar na sala.");
    } finally {
      setEntrando(null);
    }
  }

  function sairDaSessao() {
    encerrarSessaoViva();
    aoSair();
  }

  async function encerrarSala() {
    if (!sessao) return;
    const salaId = sessao.salaId;
    try {
      await encerrarSalaPorId(salaId);
      setSalas((prev) =>
        prev.map((sala) => (sala.id === salaId ? { ...sala, status: "encerrada" } : sala)),
      );
      toast.info("Sala encerrada.");
    } catch (err) {
      console.error("[Reunião] encerrarSala", err);
    } finally {
      sairDaSessao();
    }
  }

  async function alternarAprovacao(ativar: boolean) {
    if (!sessao) return;
    const { error } = await supabase
      .from("salas_reuniao")
      .update({ exige_aprovacao: ativar })
      .eq("id", sessao.salaId);
    if (error) {
      console.error("[Reunião] alternarAprovacao", error);
      toast.error("Não foi possível alterar a aprovação de entrada.");
      return;
    }
    definirAprovacaoAtiva(ativar);
    toast.success(
      ativar
        ? "Agora você aprova quem entra pelo link."
        : "Entrada liberada: quem tiver o link entra direto.",
    );
  }

  function copiarLink(chave: string) {
    void navigator.clipboard
      .writeText(linkPublico(chave))
      .then(() => toast.success("Link copiado."));
  }

  return {
    sessao,
    estadoRTC,
    recursoAberto,
    aprovacaoAtiva,
    mostrarLinkPronto,
    setMostrarLinkPronto: definirMostrarLinkPronto,
    entrando,
    reunirAgora,
    agendarReuniao,
    entrarNaSala,
    sairDaSessao,
    encerrarSala,
    alternarAprovacao,
    copiarLink,
  };
}
