/**
 * App Base — contatos que saíram do Conversas (concluído/arquivado,
 * `leads.location='base'`) organizados em pastas (grupos, nível único).
 * Header = valor total real (RPC metricas_base). Clicar num contato abre o
 * Dossiê (dado rico do motor RAGENTIC, reuso). Contato que volta pro Conversas
 * segue na pasta com selo "em conversa". Ondas 3.1 + pastas 2026-07-05.
 */
import { useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Dossie } from "../conversas/Dossie";
import { useBase, type ContatoBase } from "./useBase";
import { montarConversaDeLead } from "./montar-conversa-lead";
import { ListaContatosBase } from "./ListaContatosBase";

function Metrica({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: 0.5 }}>{rotulo}</span>
      <span style={{ fontSize: destaque ? 22 : 16, fontWeight: 700, color: destaque ? "var(--os-acento-1, oklch(0.7 0.18 220))" : "var(--txt-1)" }}>
        {valor}
      </span>
    </div>
  );
}

export function Base() {
  const { contatos, pastas, metricas, carregando, erro, tenantId, recarregar } = useBase();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const selecionado = useMemo<ContatoBase | null>(
    () => contatos.find((c) => c.id === selecionadoId) ?? null,
    [contatos, selecionadoId],
  );

  const conversaDossie = useMemo(
    () =>
      selecionado
        ? montarConversaDeLead({
            id: selecionado.id,
            nome: selecionado.nome,
            telefone: selecionado.telefone,
            foto_url: selecionado.foto_url,
            produto: selecionado.produto,
            conversa_id: selecionado.conversa_id,
          })
        : null,
    [selecionado],
  );

  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const fmtMoeda = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, color: "var(--txt-1)" }}>
      <header
        style={{
          display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap",
          padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Base</div>
          <div className="tiny muted">Contatos concluídos / arquivados</div>
        </div>
        <Metrica rotulo="Total de contatos" valor={fmt(metricas.total)} destaque />
        <Metrica rotulo="Leads" valor={fmt(metricas.leads)} />
        <Metrica rotulo="Clientes" valor={fmt(metricas.clientes)} />
        <Metrica rotulo="Produto top" valor={metricas.produtoMaisVendido ?? "—"} />
        <Metrica rotulo="Consumido (clientes)" valor={fmtMoeda(metricas.totalConsumidoClientes)} />
      </header>

      <Group id="base-layout" orientation="horizontal" defaultLayout={{ lista: 34, dossie: 66 }} style={{ flex: 1, minHeight: 0 }}>
        <Panel id="lista" minSize="22%" maxSize="50%">
          <ListaContatosBase
            contatos={contatos}
            pastas={pastas}
            carregando={carregando}
            erro={erro}
            tenantId={tenantId}
            selecionadoId={selecionadoId}
            onSelecionar={setSelecionadoId}
            onMudou={recarregar}
          />
        </Panel>
        <Separator className="separador-painel" />
        <Panel id="dossie" minSize="40%">
          {conversaDossie ? (
            <Dossie conversa={conversaDossie} conversaIdOverride={selecionado?.conversa_id ?? null} />
          ) : (
            <div className="muted small" style={{ display: "grid", placeItems: "center", height: "100%" }}>
              Selecione um contato pra ver o dossiê completo
            </div>
          )}
        </Panel>
      </Group>
    </div>
  );
}
