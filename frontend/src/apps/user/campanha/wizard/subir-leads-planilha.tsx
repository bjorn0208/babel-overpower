/**
 * Sobe uma planilha (CSV/XLSX) de leads direto no público da campanha.
 *
 * Pedido do Otmar (2026-09-08): ele tem a base dele em Excel e quer subir sozinho,
 * em vez de alguém carregar por ele.
 *
 * Como se encaixa sem inventar nada no backend: os contatos viram leads de verdade
 * na Base do tenant (`leads`, `location='base'`) e os UUIDs resultantes alimentam
 * o modo `lead_ids`, que o `eligibility.ts` já sabe resolver. Zero migration.
 *
 * Duas coisas ficam explícitas na tela de propósito:
 *   - qual coluna virou telefone (a pessoa precisa poder discordar antes de gravar);
 *   - quando o disparo começa. Δ 2026-09-14: contato novo da planilha (nunca
 *     conversou, nunca passou por campanha) não espera mais a janela de
 *     inatividade — ver `eligibility.ts`. Quem já estava na Base continua
 *     esperando, e a tela avisa isso.
 *
 * Usado em dois lugares: passo Público do Wizard e aba Config da campanha já criada.
 */

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lerContatosDaPlanilha, type LeituraPlanilha } from "@/lib/planilha-contatos";
import { chaveTelefone, ehCelularBr, variantesTelefoneBr } from "@/lib/telefone";

import type { SupabaseBruto } from "../re-exports";

interface Props {
  ownerId: string;
  /** Devolve os ids dos leads que entraram, pra virar `filters.lead_ids`. */
  aoConcluir: (leadIds: string[]) => void;
}

/** Lote pequeno o bastante pro PostgREST não engasgar com planilha de milhares. */
const TAMANHO_LOTE = 500;

export function SubirLeadsPlanilha({ ownerId, aoConcluir }: Props) {
  const refArquivo = useRef<HTMLInputElement | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<LeituraPlanilha | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);

  const lerArquivo = async (arquivo: File) => {
    setOcupado(true);
    setErro(null);
    setResumo(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await arquivo.arrayBuffer());
      const aba = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, raw: false }) as unknown[][];
      const leitura = lerContatosDaPlanilha(linhas);
      if (leitura.contatos.length === 0) {
        setErro("Não achei coluna de telefone válida nessa planilha (10 a 13 dígitos, sem contar CPF/CNPJ).");
        setPrevia(null);
        return;
      }
      setPrevia(leitura);
    } catch (e) {
      setErro(`Não consegui ler o arquivo: ${e instanceof Error ? e.message : String(e)}`);
      setPrevia(null);
    } finally {
      setOcupado(false);
      if (refArquivo.current) refArquivo.current.value = "";
    }
  };

  const confirmar = async () => {
    if (!previa) return;
    setOcupado(true);
    setErro(null);
    try {
      const sb = supabase as SupabaseBruto;
      const ids: string[] = [];
      let reaproveitados = 0;

      // `leads` NÃO tem UNIQUE (tenant_id, phone) — upsert com onConflict quebraria.
      // Então a de-dup é por consulta: quem já está na Base reaproveita o id, quem
      // falta é inserido. Assim subir a mesma planilha duas vezes não duplica a base.
      for (let i = 0; i < previa.contatos.length; i += TAMANHO_LOTE) {
        const lote = previa.contatos.slice(i, i + TAMANHO_LOTE);
        const fones = lote.map((c) => c.phone);

        // Δ 2026-09-12 (⑤): a busca era `.in("phone", fones)` — igualdade exata.
        // O mesmo lead gravado com o 9 (`5545976036108`) e sem o 9
        // (`554576036108`) passava como duas pessoas: a Base duplicava e a
        // campanha abordava o contato duas vezes. Agora procura por todas as
        // variantes e compara pela forma canônica, igual o banco faz desde hoje
        // em `telefones_equivalentes`.
        const fonesBusca = [...new Set(fones.flatMap((f) => variantesTelefoneBr(f)))];

        const { data: existentes, error: erroBusca } = await sb
          .from("leads")
          .select("id, phone")
          .eq("tenant_id", ownerId)
          .is("deleted_at", null)
          .in("phone", fonesBusca);
        if (erroBusca) throw erroBusca;

        const porFone = new Map<string, string>();
        for (const l of (existentes ?? []) as Array<{ id: string; phone: string }>) {
          porFone.set(chaveTelefone(l.phone), l.id);
        }

        for (const [, id] of porFone) {
          ids.push(id);
          reaproveitados++;
        }

        const vistosNoLote = new Set<string>();
        const novos = lote.filter((c) => {
          const chave = chaveTelefone(c.phone);
          if (porFone.has(chave) || vistosNoLote.has(chave)) return false;
          vistosNoLote.add(chave);
          return true;
        });
        if (novos.length > 0) {
          const { data, error } = await sb
            .from("leads")
            .insert(
              novos.map((c) => ({
                tenant_id: ownerId,
                name: c.nome ?? c.phone,
                phone: c.phone,
                location: "base",
                origem_lead: "planilha",
              })),
            )
            .select("id");
          if (error) throw error;
          for (const l of (data ?? []) as Array<{ id: string }>) ids.push(l.id);
        }
      }

      aoConcluir(ids);
      const novosCriados = ids.length - reaproveitados;
      setResumo(
        `${ids.length} leads selecionados para esta campanha` +
          ` — ${novosCriados} novos na Base` +
          (reaproveitados > 0 ? `, ${reaproveitados} que já existiam` : "") +
          ".",
      );
      setPrevia(null);
    } catch (e) {
      setErro(`Falha ao gravar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado(false);
    }
  };

  const fixosNaPrevia = (previa?.contatos ?? []).filter((c) => !ehCelularBr(c.phone)).length;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input
        ref={refArquivo}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void lerArquivo(f);
        }}
      />

      <button
        type="button"
        onClick={() => refArquivo.current?.click()}
        disabled={ocupado}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "center",
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px dashed var(--borda, #d4d4d8)",
          background: "transparent",
          cursor: ocupado ? "wait" : "pointer",
          fontSize: 13,
        }}
      >
        <Upload size={15} />
        {ocupado ? "Lendo…" : "Subir planilha de leads (CSV ou Excel)"}
      </button>

      {erro && (
        <p style={{ fontSize: 12, color: "var(--erro, #dc2626)", margin: 0 }}>{erro}</p>
      )}

      {resumo && (
        <p style={{ fontSize: 12, color: "var(--ok, #16a34a)", margin: 0 }}>{resumo}</p>
      )}

      {previa && (
        <div
          style={{
            border: "1px solid var(--borda, #e4e4e7)",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 8,
            fontSize: 12,
          }}
        >
          <strong style={{ fontSize: 13 }}>Confere antes de gravar</strong>

          <div>
            Telefone veio da coluna{" "}
            <strong>{previa.rotuloTelefone ?? `nº ${previa.colunaTelefone + 1}`}</strong>
            {previa.criterio === "densidade" && (
              <span style={{ opacity: 0.7 }}>
                {" "}
                — escolhida pelo formato dos números, porque nenhum cabeçalho dizia telefone. Confere
                se é essa mesmo.
              </span>
            )}
          </div>

          <div>
            <strong>{previa.contatos.length}</strong> contatos
            {previa.duplicadas > 0 && <> · {previa.duplicadas} repetidos entram uma vez só</>}
            {previa.descartadas > 0 && <> · {previa.descartadas} linhas sem telefone válido</>}
          </div>

          {/* Δ 2026-09-12 (②): planilha de empresa vem cheia de fixo — 14,7% na
              primeira base real. Fixo não tem WhatsApp: entra na Base como
              contato, mas a campanha pula. Dizer isso ANTES de gravar evita o
              dono achar que a campanha "não disparou pra todo mundo". */}
          {fixosNaPrevia > 0 && (
            <div style={{ opacity: 0.85 }}>
              <strong>{fixosNaPrevia}</strong> são telefone fixo — entram na Base, mas ficam de fora
              do disparo (fixo não recebe WhatsApp). Vão{" "}
              <strong>{previa.contatos.length - fixosNaPrevia}</strong> pra campanha.
            </div>
          )}

          <ul style={{ margin: 0, paddingLeft: 16, opacity: 0.8 }}>
            {previa.contatos.slice(0, 3).map((c) => (
              <li key={c.phone}>
                {c.phone} — {c.nome ?? "sem nome"}
              </li>
            ))}
          </ul>

          <p style={{ margin: 0, opacity: 0.75 }}>
            Contato novo entra no próximo ciclo da campanha ativa, dentro do horário e dos limites
            configurados. Quem já estava na Base e conversou há pouco espera a janela de
            inatividade (padrão: 1 dia).
          </p>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={ocupado}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: "var(--acento, #18181b)",
                color: "#fff",
                cursor: ocupado ? "wait" : "pointer",
                fontSize: 12,
              }}
            >
              {ocupado ? "Gravando…" : `Gravar ${previa.contatos.length} leads`}
            </button>
            <button
              type="button"
              onClick={() => setPrevia(null)}
              disabled={ocupado}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--borda, #d4d4d8)",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
