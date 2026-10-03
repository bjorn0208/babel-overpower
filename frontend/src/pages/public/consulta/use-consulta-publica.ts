/**
 * Hook principal da página pública de consulta.
 * Carrega dados por token (RPC), gerencia upload de anexos e submissão.
 */

import { useCallback, useEffect, useState } from "react";
import { validarArquivoPublico } from "../upload-publico";
import { supabase } from "@/integrations/supabase/client";
import type { DadosConsultaPublica, IdStepConsulta, MetaStep } from "./tipos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bruto = any;

/**
 * Deriva a lista ordenada de steps ativos a partir dos dados da consulta.
 * Ordem: dados → selfie? → documento? → comprovante? → aguardando → resultado
 */
export function derivarStepsConsulta(c: DadosConsultaPublica): MetaStep[] {
  const temSelfie = c.campos_obrigatorios.includes("selfie");
  const temDocumento = c.campos_obrigatorios.includes("documento");
  // Link universal: o preço pode não estar fixado ainda (resolve pelo documento).
  // Mostra o step de pagamento se há QUALQUER preço configurado (snapshot ou por tipo) + PIX.
  const temPrecoConfig =
    (c.preco != null && c.preco > 0) ||
    (c.preco_venda_cpf != null && c.preco_venda_cpf > 0) ||
    (c.preco_venda_cnpj != null && c.preco_venda_cnpj > 0);
  const temPagamento = !!(temPrecoConfig && c.chave_pix);

  return [
    { id: "dados", titulo: "Seus dados" },
    ...(temSelfie ? [{ id: "selfie" as IdStepConsulta, titulo: "Selfie" }] : []),
    ...(temDocumento ? [{ id: "documento" as IdStepConsulta, titulo: "Documento" }] : []),
    ...(temPagamento ? [{ id: "comprovante" as IdStepConsulta, titulo: "Pagamento" }] : []),
    { id: "aguardando", titulo: "Aguardando" },
    { id: "resultado", titulo: "Resultado" },
  ];
}

export interface PayloadSubmissao {
  documento: string;
  tipo_doc: "cpf" | "cnpj";
  dados_cliente: Record<string, string>;
  url_selfie: string | null;
  url_documento: string | null;
  url_comprovante: string | null;
}

interface UseConsultaPublicaReturn {
  consulta: DadosConsultaPublica | null;
  carregando: boolean;
  erro: string | null;
  uploadArquivo: (file: File, prefixo: string) => Promise<string | null>;
  submeter: (payload: PayloadSubmissao) => Promise<boolean>;
  gerarPdf: () => Promise<void>;
}

export function useConsultaPublica(chave: string | undefined): UseConsultaPublicaReturn {
  const [consulta, setConsulta] = useState<DadosConsultaPublica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!chave) {
      setErro("Link inválido.");
      setCarregando(false);
      return;
    }
    (async () => {
      const sb = supabase as Bruto;
      const { data, error } = await sb.rpc("obter_consulta_por_token", { p_token: chave });
      if (error || !data) {
        setErro("Consulta não encontrada ou expirada.");
        setCarregando(false);
        return;
      }
      setConsulta(data as DadosConsultaPublica);
      setCarregando(false);
    })();
  }, [chave]);

  const uploadArquivo = useCallback(
    async (file: File, prefixo: string): Promise<string | null> => {
      if (!chave) return null;
      const sb = supabase as Bruto;
      let ext: string;
      try {
        ext = validarArquivoPublico(file);
      } catch (e) {
        console.error("upload recusado:", e);
        alert((e as Error).message);
        return null;
      }
      const path = `${chave}/${prefixo}-${Date.now()}.${ext}`;
      const { error } = await sb.storage
        .from("consultas-anexos")
        .upload(path, file, { upsert: true });
      if (error) {
        console.error("upload erro:", error);
        return null;
      }
      const { data: pub } = sb.storage.from("consultas-anexos").getPublicUrl(path);
      return pub?.publicUrl ?? null;
    },
    [chave],
  );

  const submeter = useCallback(
    async (payload: PayloadSubmissao): Promise<boolean> => {
      if (!chave) return false;
      const sb = supabase as Bruto;
      const { data, error } = await sb.rpc("submeter_consulta_publica", {
        p_token: chave,
        p_payload: payload,
      });
      if (error || data?.ok === false) {
        console.error("Erro ao submeter consulta:", error?.message ?? data?.erro);
        return false;
      }
      setConsulta((prev) => (prev ? { ...prev, status: "comprovante_enviado" } : prev));
      // Dispara a validação por visão (auto/fila/manual conforme config do tenant)
      void sb.functions.invoke("validar-comprovante-consulta", { body: { token: chave } });
      return true;
    },
    [chave],
  );

  const gerarPdf = useCallback(async (): Promise<void> => {
    if (!chave) return;
    const sb = supabase as Bruto;
    const { data, error } = await sb.functions.invoke("gerar-pdf-consulta", {
      body: { token: chave },
    });
    if (error) {
      console.warn("gerar-pdf-consulta indisponível ainda:", error.message);
      return;
    }
    const url = data?.pdf_url ?? null;
    if (url) setConsulta((prev) => (prev ? { ...prev, pdf_url: url } : prev));
  }, [chave]);

  return { consulta, carregando, erro, uploadArquivo, submeter, gerarPdf };
}
