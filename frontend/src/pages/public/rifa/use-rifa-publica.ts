/**
 * Hook da página pública da rifa (/rifa/:chave).
 * Vitrine via obter_rifa_por_token; reserva via reservar_numeros_rifa_publico
 * (a MESMA RPC que a tool do agente usa — fonte única); pedido acompanhado por
 * token próprio (URL ?pedido= ou localStorage), comprovante no bucket rifas-anexos.
 */

import { useCallback, useEffect, useState } from "react";
import { validarArquivoPublico } from "../upload-publico";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bruto = any;

export interface DadosRifaPublica {
  rifa: {
    titulo: string;
    descricao: string | null;
    imagem_url: string | null;
    galeria_urls?: string[];
    premio_principal: string;
    total_numeros: number;
    numeracao_desde_zero?: boolean | null;
    preco_numero_centavos: number;
    promocoes: Array<{ qtd: number; preco_total_centavos: number }>;
    status: string;
    data_sorteio_prevista: string | null;
    metodo_sorteio: string;
    max_numeros_por_pedido: number;
    minutos_reserva: number;
  };
  progresso: { pagos: number; reservados: number; disponiveis: number };
  /** Todos os números ocupados (pagos + reservados). null quando a rifa tem >1000 números (grade vira campo de texto). */
  numeros_ocupados: number[] | null;
  /** Subconjunto de `numeros_ocupados` que já foi pago — o resto é reservado/a validar. */
  numeros_pagos: number[] | null;
  /** Números com nome do comprador (quando rifa ≤ 1000). */
  numeros_com_nome: Array<{ numero: number; status: 'pago' | 'reservado'; nome: string; phone_mascarado: string }> | null;
  ranking: Array<{ nome: string; phone_mascarado: string; qtd: number }>;
  cotas_premiadas: Array<{
    numero: number;
    premio: string;
    ganho: boolean;
    ganhador_nome: string | null;
  }>;
  resultado: { numero_sorteado: number; ganhador_nome: string | null; sorteada_em: string } | null;
  branding: { nome?: string; logo_url?: string; banner_url?: string };
  chave_pix: string | null;
}

export interface PedidoRifaPublico {
  rifa_titulo: string;
  nome: string;
  phone: string | null;
  numeros: number[];
  qtd: number;
  valor_centavos: number;
  status: string;
  comprovante_url: string | null;
  motivo_rejeicao: string | null;
  expira_em: string | null;
  pago_em: string | null;
  chave_pix: string | null;
}

export const fmtBRL = (c: number | null | undefined) =>
  (Number(c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const chaveArmazenamento = (chave: string) => `rifa-pedido-${chave}`;

export function useRifaPublica(chave: string | undefined) {
  const [dados, setDados] = useState<DadosRifaPublica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pedidoToken, setPedidoToken] = useState<string | null>(() => {
    const daUrl = new URLSearchParams(window.location.search).get("pedido");
    if (daUrl) return daUrl;
    return chave ? localStorage.getItem(chaveArmazenamento(chave)) : null;
  });
  const [pedido, setPedido] = useState<PedidoRifaPublico | null>(null);

  const recarregar = useCallback(async () => {
    if (!chave) return;
    const sb = supabase as Bruto;
    const { data, error } = await sb.rpc("obter_rifa_por_token", { p_token: chave });
    if (error || !data?.ok) {
      setErro("Rifa não encontrada ou indisponível.");
    } else {
      setDados(data as DadosRifaPublica);
    }
    setCarregando(false);
  }, [chave]);

  const carregarPedido = useCallback(async (token: string) => {
    const sb = supabase as Bruto;
    const { data, error } = await sb.rpc("obter_pedido_rifa_por_token", { p_token: token });
    if (!error && data?.ok) setPedido(data as PedidoRifaPublico);
    else setPedido(null);
  }, []);

  useEffect(() => {
    if (!chave) {
      setErro("Link inválido.");
      setCarregando(false);
      return;
    }
    void recarregar();
  }, [chave, recarregar]);

  useEffect(() => {
    if (pedidoToken) void carregarPedido(pedidoToken);
  }, [pedidoToken, carregarPedido]);

  /**
   * Reserva números; devolve mensagem de erro ou null (sucesso).
   * `pedidoParaJuntar`: token de um pedido reservado/aguardando_validacao já
   * aberto — os números novos entram NELE (mesmo PIX, mesmo total), em vez
   * de abrir um pedido separado. Passar só quando o comprador está pegando
   * mais números de um pedido em aberto.
   */
  const reservar = useCallback(
    async (
      nome: string,
      phone: string,
      qtd: number,
      numeros: number[] | null,
      pedidoParaJuntar?: string | null,
    ): Promise<string | null> => {
      if (!chave) return "Link inválido.";
      const sb = supabase as Bruto;
      const { data, error } = await sb.rpc("reservar_numeros_rifa_publico", {
        p_token: chave,
        p_nome: nome,
        p_phone: phone,
        p_qtd: qtd,
        p_numeros: numeros && numeros.length > 0 ? numeros : null,
        p_pedido_token: pedidoParaJuntar || null,
      });
      if (error) {
        const m = String(error.message ?? "");
        if (m.includes("NUMEROS_OCUPADOS")) {
          return (
            "Alguém acabou de levar um dos números escolhidos: " +
            m.split(":")[1] +
            ". Escolha outros."
          );
        }
        if (m.includes("NUMEROS_INSUFICIENTES")) return "Não há números suficientes disponíveis.";
        if (m.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos.";
        return "Não foi possível reservar agora. Tente de novo.";
      }
      if (!data?.ok) return "Reserva recusada: " + (data?.erro ?? "erro desconhecido");
      const token = String(data.pedido_token);
      localStorage.setItem(chaveArmazenamento(chave), token);
      setPedidoToken(token);
      // Notifica o comprador no WhatsApp (números + PIX) — melhor esforço, sem travar a UX.
      void fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notificar-pedido-rifa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, evento: "reserva" }),
      }).catch(() => undefined);
      await carregarPedido(token);
      await recarregar();
      return null;
    },
    [chave, carregarPedido, recarregar],
  );

  const uploadComprovante = useCallback(
    async (file: File): Promise<string | null> => {
      if (!chave) return null;
      const sb = supabase as Bruto;
      let ext: string;
      try {
        ext = validarArquivoPublico(file);
      } catch (e) {
        console.error("upload comprovante recusado:", e);
        alert((e as Error).message);
        return null;
      }
      const caminho = `${chave}/comprovante-${Date.now()}.${ext}`;
      const { error } = await sb.storage
        .from("rifas-anexos")
        // upsert:false — visitante anônimo só tem INSERT no bucket (caminho já é único pelo Date.now()).
        .upload(caminho, file, { upsert: false });
      if (error) {
        console.error("upload comprovante erro:", error);
        return null;
      }
      const { data: pub } = sb.storage.from("rifas-anexos").getPublicUrl(caminho);
      return pub?.publicUrl ?? null;
    },
    [chave],
  );

  const enviarComprovante = useCallback(
    async (url: string): Promise<boolean> => {
      if (!pedidoToken) return false;
      const sb = supabase as Bruto;
      const { data, error } = await sb.rpc("enviar_comprovante_rifa_publico", {
        p_token: pedidoToken,
        p_url: url,
      });
      if (error || !data?.ok) return false;
      await carregarPedido(pedidoToken);
      return true;
    },
    [pedidoToken, carregarPedido],
  );

  const novaCompra = useCallback(() => {
    if (chave) localStorage.removeItem(chaveArmazenamento(chave));
    setPedidoToken(null);
    setPedido(null);
  }, [chave]);

  return {
    dados,
    carregando,
    erro,
    recarregar,
    pedido,
    pedidoToken,
    carregarPedido,
    reservar,
    uploadComprovante,
    enviarComprovante,
    novaCompra,
  };
}
