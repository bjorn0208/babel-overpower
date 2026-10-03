/**
 * Hook principal: carrega o contrato via RPC e gerencia estado.
 */

import { useCallback, useEffect, useState } from "react";
import { validarArquivoPublico } from "../upload-publico";
import { supabase } from "@/integrations/supabase/client";
import type { DadosContrato, IdStep, MetaStep } from "./tipos";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bruto = any;

/** Mapeamento de instrução selfie → step ativo */
function temSelfie(c: DadosContrato): boolean {
  const obrig = c.campos_obrigatorios ?? [];
  return !!(c.instrucao_selfie || (Array.isArray(obrig) && obrig.includes("selfie")));
}

function temDocumento(c: DadosContrato): boolean {
  const obrig = c.campos_obrigatorios ?? [];
  return Array.isArray(obrig) && obrig.includes("documento");
}

/**
 * Deriva a lista ordenada de steps ativos a partir das colunas do contrato.
 * Segue a ordem do design: dados → contrato → pagamento → comprovante
 *   → selfie → documento → assinatura → testemunha → concluido.
 */
export function derivarSteps(c: DadosContrato): MetaStep[] {
  const dp = c.dados_pagamento;
  const temPagamento = !!(dp && dp.total_avista > 0);
  const temComprovante = !!(c.chave_pix || c.link_parcelamento);
  // posicao_pagamento decide QUANDO o comprovante é cobrado:
  //  - "after_sign": paga DEPOIS de assinar (comprovante no fim da jornada).
  //  - "before_sign" (ou ausente): paga ANTES de assinar (logo após a leitura).
  const comprovanteDepois = temComprovante && c.posicao_pagamento === "after_sign";
  const comprovanteAntes = temComprovante && !comprovanteDepois;

  const todos: MetaStep[] = [
    { id: "dados", titulo: "Seus dados" },
    // Pagamento ANTES da leitura: a forma escolhida é aplicada ao texto do
    // contrato, então o cliente lê o contrato já com a sua modalidade.
    ...(temPagamento ? [{ id: "pagamento" as IdStep, titulo: "Forma de pagamento" }] : []),
    { id: "contrato", titulo: "Leitura do contrato" },
    ...(comprovanteAntes ? [{ id: "comprovante" as IdStep, titulo: "Comprovante" }] : []),
    ...(temSelfie(c) ? [{ id: "selfie" as IdStep, titulo: "Selfie" }] : []),
    ...(temDocumento(c) ? [{ id: "documento" as IdStep, titulo: "Documento" }] : []),
    // F3b: testemunha ANTES da assinatura — o submit acontece na assinatura e o
    // payload monta dados_testemunha de `dados`; colhida depois, ia pro nada.
    ...((c.num_testemunhas ?? 0) > 0 ? [{ id: "testemunha" as IdStep, titulo: "Testemunha" }] : []),
    { id: "assinatura", titulo: "Assinatura" },
    ...(comprovanteDepois ? [{ id: "comprovante" as IdStep, titulo: "Comprovante" }] : []),
    { id: "concluido", titulo: "Concluído" },
  ];

  return todos;
}

interface UseContratoReturn {
  contrato: DadosContrato | null;
  carregando: boolean;
  erro: string | null;
  registrarEvento: (evento: string, meta?: Record<string, unknown>) => Promise<void>;
  uploadArquivo: (file: File, prefixo: string) => Promise<string | null>;
  /** Grava o comprovante via RPC quando o pagamento é after_sign (já assinado). */
  enviarComprovante: (url: string) => Promise<boolean>;
  /** Dispara a geração server-side do PDF e atualiza pdf_url no estado. */
  gerarPdf: () => Promise<void>;
}

export function useContrato(chave: string | undefined): UseContratoReturn {
  const [contrato, setContrato] = useState<DadosContrato | null>(null);
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
      const { data, error } = await sb.rpc("obter_contrato_por_token", { p_token: chave });
      if (error || !data?.[0]) {
        setErro("Contrato não encontrado ou expirado.");
        setCarregando(false);
        return;
      }
      setContrato(data[0] as DadosContrato);
      setCarregando(false);
    })();
  }, [chave]);

  const registrarEvento = useCallback(
    async (evento: string, meta?: Record<string, unknown>) => {
      if (!chave) return;
      const sb = supabase as Bruto;
      await sb.rpc("registrar_evento_contrato", {
        p_token: chave,
        p_evento: evento,
        p_meta: meta ?? null,
      });
    },
    [chave]
  );

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
        .from("contract-signatures")
        .upload(path, file, { upsert: true });
      if (error) {
        console.error("upload erro:", error);
        return null;
      }
      const { data: pub } = sb.storage
        .from("contract-signatures")
        .getPublicUrl(path);
      return pub?.publicUrl ?? null;
    },
    [chave]
  );

  const enviarComprovante = useCallback(
    async (url: string): Promise<boolean> => {
      if (!chave) return false;
      const sb = supabase as Bruto;
      const { error } = await sb.rpc("enviar_comprovante_pagamento_publico", {
        p_token: chave,
        p_proof_url: url,
      });
      if (error) {
        console.error("Erro ao enviar comprovante:", error.message);
        return false;
      }
      return true;
    },
    [chave]
  );

  const gerarPdf = useCallback(async (): Promise<void> => {
    if (!chave) return;
    const sb = supabase as Bruto;
    const { data, error } = await sb.functions.invoke("gerar-pdf-contrato", {
      body: { token: chave },
    });
    if (error) {
      console.error("Erro ao gerar PDF:", error);
      return;
    }
    const url = data?.pdf_url ?? null;
    if (url) setContrato((prev) => (prev ? { ...prev, pdf_url: url } : prev));
  }, [chave]);

  return {
    contrato, carregando, erro, registrarEvento, uploadArquivo,
    enviarComprovante, gerarPdf,
  };
}

interface UseAssinarReturn {
  enviando: boolean;
  erro: string | null;
  submeter: (params: {
    chave: string;
    contrato: DadosContrato;
    dados: Record<string, string>;
    urlSelfie: string | null;
    urlDocumento: string | null;
    urlAssinatura: string | null;
    urlComprovante: string | null;
    formaEscolhida: import("./tipos").EscolhaPagamento | null;
    onSucesso: () => void;
  }) => Promise<void>;
}

export function useAssinar(): UseAssinarReturn {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const submeter = useCallback(async (params: {
    chave: string;
    contrato: DadosContrato;
    dados: Record<string, string>;
    urlSelfie: string | null;
    urlDocumento: string | null;
    urlAssinatura: string | null;
    urlComprovante: string | null;
    formaEscolhida: import("./tipos").EscolhaPagamento | null;
    onSucesso: () => void;
  }) => {
    const { chave, contrato, dados, urlSelfie, urlDocumento,
      urlAssinatura, urlComprovante, formaEscolhida, onSucesso } = params;
    setErro(null);
    setEnviando(true);
    const sb = supabase as Bruto;
    const { calcularHash } = await import("./helpers");
    const payload: Record<string, unknown> = {
      dados_cliente: dados,
      dados_signatario: dados,
      url_selfie: urlSelfie,
      url_documento: urlDocumento,
      url_assinatura: urlAssinatura,
      url_comprovante_pagamento: urlComprovante,
      ip_assinatura: "client",
      hash_contrato: await calcularHash(contrato.texto_contrato || ""),
    };
    // Inclui forma_pagamento_escolhida quando há bloco condicional ou pagamento
    if (formaEscolhida) {
      payload.forma_pagamento_escolhida = formaEscolhida;
    }
    // Campo dedicado de testemunha (a RPC grava em contratos.dados_testemunha);
    // mantém também dentro de dados_cliente p/ retrocompatibilidade.
    const nTest = contrato.num_testemunhas ?? 0;
    if (nTest > 0) {
      const testemunhas = Array.from({ length: nTest })
        .map((_, i) => ({
          nome: (dados[`testemunha_${i + 1}_nome`] ?? "").trim(),
          cpf: (dados[`testemunha_${i + 1}_cpf`] ?? "").trim(),
        }))
        .filter((t) => t.nome.length > 0 || t.cpf.length > 0);
      if (testemunhas.length > 0) {
        payload.dados_testemunha = { testemunhas };
      }
    }
    const { error } = await sb.rpc("assinar_contrato_publico", {
      p_token: chave,
      p_payload: payload,
    });
    setEnviando(false);
    if (error) {
      console.error("Erro ao assinar contrato:", error.message);
      setErro(
        "Não foi possível enviar o contrato agora. Confira sua conexão e tente de novo."
      );
      return;
    }
    onSucesso();
  }, []);

  return { enviando, erro, submeter };
}
