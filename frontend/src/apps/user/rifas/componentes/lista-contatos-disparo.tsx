/**
 * Lista de pessoas escolhidas pro bom-dia da rifa (7h) — sobe CSV/Excel,
 * marca quem recebe, escolhe a RIFA DO DIA e testa o disparo real agora.
 * Extraído da aba Disparo (2026-08-28) pra caber no limite de 300 linhas.
 * Tabela `rifa_lista_disparo` (RLS tenant) + `rifas_config_tenant.rifa_disparo_id`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizarTelefoneBrasil } from "@/lib/telefone";
import { lerContatosDaPlanilha } from "@/lib/planilha-contatos";
import { CarregandoCentro } from "./basicos";
import { Botao } from "./botao";
import { ModalConfirmar } from "./modal-confirmar";
import { TabelaContatosDisparo, type PessoaDisparo } from "./tabela-contatos-disparo";
import { ControlesImportDisparo } from "./controles-import-disparo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

interface RifaOpcao {
  id: string;
  titulo: string;
}

export interface ListaContatosDisparoProps {
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
  /** Avisa o pai qual é a rifa "efetiva" (do dia, ou ativa mais recente) — usada pelos disparos automáticos. */
  aoRifaEfetivaMudar: (rifaId: string) => void;
}

export const ListaContatosDisparo = ({
  aoNotificar,
  aoRifaEfetivaMudar,
}: ListaContatosDisparoProps) => {
  const [pessoas, setPessoas] = useState<PessoaDisparo[]>([]);
  const [rifas, setRifas] = useState<RifaOpcao[]>([]);
  const [rifaDisparoId, setRifaDisparoId] = useState<string>("");
  const [carregando, setCarregando] = useState(true);
  const [importando, setImportando] = useState(false);
  const [manual, setManual] = useState("");
  const [busca, setBusca] = useState("");
  const refArquivo = useRef<HTMLInputElement | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const sb = supabase as Sb;
      const { data: ses } = await sb.auth.getSession();
      const uid = ses?.session?.user?.id;
      if (!uid) return;
      const [{ data: lista }, { data: rs }, { data: cfg }] = await Promise.all([
        sb
          .from("rifa_lista_disparo")
          .select("id, nome, phone, marcado")
          .eq("tenant_id", uid)
          .order("created_at", { ascending: false })
          .limit(500),
        sb
          .from("rifas")
          .select("id, titulo")
          .eq("tenant_id", uid)
          .eq("status", "ativa")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        sb.from("rifas_config_tenant").select("rifa_disparo_id").eq("tenant_id", uid).maybeSingle(),
      ]);
      setPessoas((lista ?? []) as PessoaDisparo[]);
      const rifasAtivas = (rs ?? []) as RifaOpcao[];
      setRifas(rifasAtivas);
      // Nunca usa uma "rifa do dia" que não esteja mais entre as ativas —
      // rifa deletada/sorteada vira automática (a ativa mais recente), em
      // vez de travar disparos/preview numa referência morta (bug real:
      // trigger no banco já limpa isso ao deletar, mas essa checagem cobre
      // dados antigos de antes do trigger existir e qualquer outra brecha).
      const idConfig = cfg?.rifa_disparo_id ?? "";
      setRifaDisparoId(idConfig && rifasAtivas.some((r) => r.id === idConfig) ? idConfig : "");
    } catch (e) {
      aoNotificar(`Falha ao carregar: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setCarregando(false);
    }
  }, [aoNotificar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    aoRifaEfetivaMudar(rifaDisparoId || rifas[0]?.id || "");
  }, [rifaDisparoId, rifas, aoRifaEfetivaMudar]);

  const importar = async (arquivo: File) => {
    setImportando(true);
    try {
      const XLSX = await import("xlsx");
      const dados = await arquivo.arrayBuffer();
      const wb = XLSX.read(dados);
      const aba = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, raw: false }) as unknown[][];
      const { contatos } = lerContatosDaPlanilha(linhas);
      if (contatos.length === 0) {
        aoNotificar("Não achei telefones válidos no arquivo (10 a 13 dígitos).", "error");
        return;
      }
      const sb = supabase as Sb;
      const { data: ses } = await sb.auth.getSession();
      const uid = ses?.session?.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      const { error } = await sb.from("rifa_lista_disparo").upsert(
        contatos.map((c) => ({
          tenant_id: uid,
          nome: c.nome,
          phone: c.phone,
          marcado: true,
          origem: "csv",
        })),
        { onConflict: "tenant_id,phone" },
      );
      if (error) throw error;
      aoNotificar(`${contatos.length} contatos importados (todos marcados).`, "success");
      await carregar();
    } catch (e) {
      aoNotificar(`Falha na importação: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setImportando(false);
      if (refArquivo.current) refArquivo.current.value = "";
    }
  };

  const adicionarManual = async () => {
    const phone = normalizarTelefoneBrasil(manual);
    if (!phone) {
      aoNotificar("Número inválido — use DDD + número (ex.: 11 91234-5678).", "error");
      return;
    }
    const sb = supabase as Sb;
    const { data: ses } = await sb.auth.getSession();
    const uid = ses?.session?.user?.id;
    if (!uid) return;
    const { error } = await sb
      .from("rifa_lista_disparo")
      .upsert([{ tenant_id: uid, nome: null, phone, marcado: true, origem: "manual" }], {
        onConflict: "tenant_id,phone",
      });
    if (error) aoNotificar(`Falha: ${error.message}`, "error");
    else {
      setManual("");
      await carregar();
    }
  };

  const alternar = async (p: PessoaDisparo) => {
    setPessoas((ps) => ps.map((x) => (x.id === p.id ? { ...x, marcado: !p.marcado } : x)));
    const { error } = await (supabase as Sb)
      .from("rifa_lista_disparo")
      .update({ marcado: !p.marcado })
      .eq("id", p.id);
    if (error) {
      aoNotificar(`Falha: ${error.message}`, "error");
      await carregar();
    }
  };

  const marcarTodos = async (valor: boolean) => {
    const sb = supabase as Sb;
    const { data: ses } = await sb.auth.getSession();
    const uid = ses?.session?.user?.id;
    if (!uid) return;
    setPessoas((ps) => ps.map((x) => ({ ...x, marcado: valor })));
    const { error } = await sb
      .from("rifa_lista_disparo")
      .update({ marcado: valor })
      .eq("tenant_id", uid);
    if (error) {
      aoNotificar(`Falha: ${error.message}`, "error");
      await carregar();
    }
  };

  const remover = async (p: PessoaDisparo) => {
    const { error } = await (supabase as Sb).from("rifa_lista_disparo").delete().eq("id", p.id);
    if (error) aoNotificar(`Falha: ${error.message}`, "error");
    else setPessoas((ps) => ps.filter((x) => x.id !== p.id));
  };

  const [testando, setTestando] = useState(false);
  const [confirmandoTeste, setConfirmandoTeste] = useState(false);
  const [removendo, setRemovendo] = useState<PessoaDisparo | null>(null);

  /** Dispara o bom-dia AGORA (como às 7h) — envio REAL pela mesma esteira,
   *  só pro tenant logado; quem já recebeu hoje não recebe de novo (dedup). */
  const testarDisparo = async () => {
    if (marcados === 0 && pessoas.length > 0) {
      aoNotificar("Ninguém marcado — marque pelo menos uma pessoa.", "info");
      return;
    }
    setTestando(true);
    try {
      const { data, error } = await supabase.functions.invoke("cron-bom-dia-rifa", {
        body: { etapa: "saudacao" },
      });
      if (error) throw error;
      const r = data as { ok?: boolean; enviados?: number; pulados?: number; erro?: string };
      if (!r?.ok) throw new Error(r?.erro ?? "resposta inválida");
      if ((r.enviados ?? 0) === 0) {
        aoNotificar(
          "0 enviados — provável que todos já tenham recebido hoje (dedup diário), ou falte rifa ativa/canal conectado.",
          "info",
        );
      } else {
        aoNotificar(
          `Disparo de teste feito: ${r.enviados} na fila de envio${r.pulados ? ` · ${r.pulados} pulados` : ""}. As mensagens saem no ritmo humano da caixa.`,
          "success",
        );
      }
    } catch (e) {
      aoNotificar(`Falha no teste: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setTestando(false);
    }
  };

  const salvarRifaDoDia = async (id: string) => {
    setRifaDisparoId(id);
    const sb = supabase as Sb;
    const { data: ses } = await sb.auth.getSession();
    const uid = ses?.session?.user?.id;
    if (!uid) return;
    const { error } = await sb
      .from("rifas_config_tenant")
      .upsert(
        { tenant_id: uid, rifa_disparo_id: id || null, updated_at: new Date().toISOString() },
        { onConflict: "tenant_id" },
      );
    if (error) aoNotificar(`Falha ao salvar a rifa do dia: ${error.message}`, "error");
    else
      aoNotificar(
        id ? "Rifa do dia definida." : "Rifa do dia: automática (a ativa mais recente).",
        "success",
      );
  };

  /** Exporta a lista atual pra CSV (backup / edição externa). */
  const exportarCsv = () => {
    const linhas = [
      ["nome", "telefone", "marcado"],
      ...pessoas.map((p) => [p.nome ?? "", p.phone, p.marcado ? "sim" : "nao"]),
    ];
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lista-disparo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (carregando) return <CarregandoCentro rotulo="Carregando lista de disparo…" />;

  const marcados = pessoas.filter((p) => p.marcado).length;
  const buscaLimpa = busca.trim().toLowerCase();
  const visiveis = buscaLimpa
    ? pessoas.filter(
        (p) =>
          (p.nome ?? "").toLowerCase().includes(buscaLimpa) ||
          p.phone.includes(buscaLimpa.replace(/\D/g, "") || buscaLimpa),
      )
    : pessoas;

  return (
    <div className="space-y-5">
      <div>
        <h2>📋 Lista de disparo</h2>
        <p className="ar-txt-3 text-sm mt-0.5">
          Quem está marcado recebe o bom-dia da rifa às 7h (com follow-up ao meio-dia). Lista vazia
          = o sistema usa seus leads recentes.
        </p>
      </div>

      <ControlesImportDisparo
        refArquivo={refArquivo}
        importando={importando}
        aoImportar={(f) => void importar(f)}
        manual={manual}
        aoManualMudar={setManual}
        aoAdicionarManual={() => void adicionarManual()}
        rifas={rifas}
        rifaDisparoId={rifaDisparoId}
        aoSalvarRifaDoDia={(id) => void salvarRifaDoDia(id)}
      />

      <TabelaContatosDisparo
        pessoas={pessoas}
        visiveis={visiveis}
        marcados={marcados}
        busca={busca}
        aoBuscarMudar={setBusca}
        aoAlternar={(p) => void alternar(p)}
        aoMarcarTodos={(v) => void marcarTodos(v)}
        aoRemover={setRemovendo}
        aoExportar={exportarCsv}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <Botao onClick={() => setConfirmandoTeste(true)} carregando={testando}>
          🧪 Testar disparo agora (como às 7h)
        </Botao>
        <span className="ar-txt-aviso text-xs">
          ⚠️ Envio REAL: os marcados recebem o bom-dia no WhatsApp agora, pela mesma esteira da
          manhã.
        </span>
      </div>

      <p className="ar-txt-4 text-xs">
        Teto de 150 saudações por dia (proteção do chip). Quem já recebeu hoje não recebe de novo —
        nem no teste, nem no cron das 7h.
      </p>

      <ModalConfirmar
        aberto={confirmandoTeste}
        titulo="Disparar o bom-dia agora?"
        mensagem={
          <>
            Isso é um envio <strong>REAL</strong>:{" "}
            {marcados > 0 ? (
              <>
                <strong>{marcados}</strong> marcado{marcados === 1 ? "" : "s"} da lista
              </>
            ) : (
              "seus leads recentes"
            )}{" "}
            recebem a saudação da rifa no WhatsApp agora, pela mesma esteira das 7h. Quem já recebeu
            hoje é pulado.
          </>
        }
        textoConfirmar="🧪 Disparar agora"
        variante="perigo"
        carregando={testando}
        aoConfirmar={() => {
          setConfirmandoTeste(false);
          void testarDisparo();
        }}
        aoCancelar={() => setConfirmandoTeste(false)}
      />

      <ModalConfirmar
        aberto={!!removendo}
        titulo="Remover da lista?"
        mensagem={
          removendo ? (
            <>
              Tirar <strong>{removendo.nome || removendo.phone}</strong> da lista de disparo? Essa
              pessoa deixa de receber o bom-dia (dá pra importar de novo depois).
            </>
          ) : (
            ""
          )
        }
        textoConfirmar="Remover"
        variante="perigo"
        aoConfirmar={() => {
          if (removendo) {
            const alvo = removendo;
            setRemovendo(null);
            void remover(alvo);
          }
        }}
        aoCancelar={() => setRemovendo(null)}
      />
    </div>
  );
};
