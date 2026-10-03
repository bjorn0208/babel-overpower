/**
 * Aba Pacotes de Conhecimento (Curadoria admin).
 *
 * O admin monta os pacotes "Da Babel": conhecimento extra que os tenants ligam no Hub
 * do agente. Aqui: criar/editar/pausar pacote, editar blocos (modo Sempre ou Por
 * relevância), publicar na Loja com preço e liberar manualmente para um tenant
 * (enquanto o pagamento PIX da Loja não existe).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Sparkles,
  Store,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  BotaoIcone,
  BotaoPrimario,
  Vazio,
  estiloInput,
} from "@/apps/user/agente/hub-conhecimento/ui-hub";
import {
  alternarAtivoBlocoPacote,
  alternarAtivoPacote,
  criarBlocoPacote,
  criarPacoteAdmin,
  editarBlocoPacote,
  editarPacote,
  excluirBlocoPacote,
  lerItensLoja,
  lerUsoPacote,
  liberarParaTenant,
  listarBlocos,
  listarNichos,
  listarPacotes,
  listarTenants,
  mensagemErro,
  publicarNaLoja,
  type ItemLoja,
  type OpcaoSimples,
  type UsoPacote,
} from "@/apps/user/agente/pacotes/dados-pacotes";
import {
  resumoBlocos,
  type BlocoPacote,
  type Pacote,
} from "@/apps/user/agente/pacotes/logica-pacotes";
import {
  Etiqueta,
  Interruptor,
  ListaBlocosPacote,
  ModalPacote,
} from "@/apps/user/agente/pacotes/ui-pacotes";

const toastApi = {
  success: (m: string) => toast.success(m),
  error: (m: string) => toast.error(m),
};

type Estado = {
  pacotes: Pacote[];
  blocos: BlocoPacote[];
  loja: Record<string, ItemLoja>;
};

export function AbaPacotesConhecimento() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nichos, setNichos] = useState<OpcaoSimples[]>([]);
  const [tenants, setTenants] = useState<OpcaoSimples[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [modal, setModal] = useState<{ pacote: Pacote | null } | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const pacotes = (await listarPacotes()).filter((p) => p.origem === "admin");
      const [blocos, loja] = await Promise.all([
        listarBlocos(pacotes.map((p) => p.id)),
        lerItensLoja(pacotes.map((p) => p.loja_aplicativo_id).filter((x): x is string => !!x)),
      ]);
      setEstado({ pacotes, blocos, loja });
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, []);

  useEffect(() => {
    void recarregar();
    listarNichos()
      .then(setNichos)
      .catch(() => setNichos([]));
    listarTenants()
      .then(setTenants)
      .catch(() => setTenants([]));
  }, [recarregar]);

  const nomeNicho = (id: string | null) =>
    id ? (nichos.find((n) => n.id === id)?.nome ?? "nicho") : "Todos os nichos";

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 680 }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "oklch(0.98 0 0)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Sparkles size={16} style={{ color: "oklch(0.78 0.14 75)" }} /> Pacotes de Conhecimento
          </span>
          <span style={{ fontSize: 11.5, color: "oklch(0.98 0 0 / 0.55)", lineHeight: 1.5 }}>
            Upgrades de conhecimento que os tenants ligam no Hub do agente. Ligado, soma ao
            conhecimento padrão; desligado, o agente não muda. Publicado na Loja, o tenant precisa
            instalar antes de ligar.
          </span>
        </div>
        <BotaoPrimario onClick={() => setModal({ pacote: null })}>
          <Plus size={14} /> Novo pacote
        </BotaoPrimario>
      </div>

      {erro && <span style={{ fontSize: 12, color: "oklch(0.75 0.16 40)" }}>{erro}</span>}
      {!estado && !erro && <Vazio mensagem="Carregando pacotes…" />}
      {estado && estado.pacotes.length === 0 && (
        <Vazio
          mensagem="Nenhum pacote ainda."
          dica="Crie o primeiro pacote e adicione blocos. Ele aparece no Hub de todos os tenants do nicho escolhido."
        />
      )}

      {estado?.pacotes.map((p) => (
        <CardPacoteAdmin
          key={p.id}
          p={p}
          blocos={estado.blocos.filter((b) => b.pacote_id === p.id)}
          itemLoja={p.loja_aplicativo_id ? (estado.loja[p.loja_aplicativo_id] ?? null) : null}
          nomeNicho={nomeNicho(p.nicho_id)}
          tenants={tenants}
          aberto={aberto === p.id}
          onAlternarAberto={() => setAberto((a) => (a === p.id ? null : p.id))}
          onEditar={() => setModal({ pacote: p })}
          recarregar={recarregar}
        />
      ))}

      {modal && (
        <ModalPacote
          nichos={nichos}
          inicial={
            modal.pacote
              ? {
                  nome: modal.pacote.nome,
                  descricao: modal.pacote.descricao,
                  nicho_id: modal.pacote.nicho_id,
                }
              : null
          }
          onFechar={() => setModal(null)}
          onSalvar={async (v) => {
            if (modal.pacote) {
              await editarPacote(modal.pacote.id, v);
              // Pacote publicado: mantém nome/descrição/nicho da Loja em sincronia.
              if (modal.pacote.loja_aplicativo_id) {
                const item = estado?.loja[modal.pacote.loja_aplicativo_id];
                await publicarNaLoja(
                  modal.pacote.id,
                  item?.preco_mensal ?? null,
                  item?.is_active ?? true,
                );
              }
              toast.success("Pacote atualizado");
            } else {
              const novo = await criarPacoteAdmin(v);
              setAberto(novo.id);
              toast.success("Pacote criado — adicione os blocos");
            }
            await recarregar();
          }}
        />
      )}
    </div>
  );
}

function CardPacoteAdmin({
  p,
  blocos,
  itemLoja,
  nomeNicho,
  tenants,
  aberto,
  onAlternarAberto,
  onEditar,
  recarregar,
}: {
  p: Pacote;
  blocos: BlocoPacote[];
  itemLoja: ItemLoja | null;
  nomeNicho: string;
  tenants: OpcaoSimples[];
  aberto: boolean;
  onAlternarAberto: () => void;
  onEditar: () => void;
  recarregar: () => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function executar(acao: () => Promise<void>, ok: string) {
    setOcupado(true);
    try {
      await acao();
      toast.success(ok);
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setOcupado(false);
      await recarregar();
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        background: "oklch(0.18 0.06 280 / 0.4)",
        border: "1px solid oklch(0.98 0 0 / 0.08)",
        opacity: p.ativo ? 1 : 0.7,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <button
          type="button"
          onClick={onAlternarAberto}
          aria-expanded={aberto}
          aria-label={aberto ? `Recolher ${p.nome}` : `Abrir ${p.nome}`}
          style={{
            background: "transparent",
            border: "none",
            color: "oklch(0.98 0 0 / 0.6)",
            cursor: "pointer",
            padding: 2,
            marginTop: 1,
          }}
        >
          {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "oklch(0.98 0 0)" }}>
              {p.nome}
            </span>
            <Etiqueta cor="oklch(0.70 0.16 235)">{nomeNicho}</Etiqueta>
            {itemLoja?.is_active && (
              <Etiqueta cor="oklch(0.75 0.14 300)">
                Loja ·{" "}
                {itemLoja.preco_mensal && itemLoja.preco_mensal > 0
                  ? `${Number(itemLoja.preco_mensal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês`
                  : "grátis"}
              </Etiqueta>
            )}
            {!p.ativo && <Etiqueta cor="oklch(0.7 0.02 280)">Pausado</Etiqueta>}
          </div>
          {p.descricao && (
            <span style={{ fontSize: 11.5, color: "oklch(0.98 0 0 / 0.6)", lineHeight: 1.5 }}>
              {p.descricao}
            </span>
          )}
          <span style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.45)" }}>
            {resumoBlocos(blocos)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <BotaoIcone titulo="Editar pacote" onClick={onEditar}>
            <Pencil size={14} />
          </BotaoIcone>
          <Interruptor
            ligado={p.ativo}
            rotulo={p.ativo ? "Pausar pacote (sai de todos os agentes)" : "Reativar pacote"}
            desabilitado={ocupado}
            onToggle={() =>
              void executar(
                () => alternarAtivoPacote(p.id, !p.ativo),
                p.ativo ? "Pacote pausado" : "Pacote reativado",
              )
            }
          />
        </div>
      </div>

      {aberto && (
        <div style={{ paddingLeft: 26, display: "flex", flexDirection: "column", gap: 16 }}>
          <ListaBlocosPacote
            nomePacote={p.nome}
            blocos={blocos}
            editavel
            toast={toastApi}
            onCriar={async (v) => {
              await criarBlocoPacote(p.id, v, blocos.length);
              await recarregar();
            }}
            onEditar={async (id, v) => {
              await editarBlocoPacote(id, v);
              await recarregar();
            }}
            onAlternarAtivo={async (id, ativo) => {
              await alternarAtivoBlocoPacote(id, ativo);
              await recarregar();
            }}
            onExcluir={async (id) => {
              await excluirBlocoPacote(id);
              await recarregar();
            }}
          />
          <PainelLoja p={p} itemLoja={itemLoja} ocupado={ocupado} executar={executar} />
          {p.loja_aplicativo_id && <PainelUso p={p} tenants={tenants} executar={executar} />}
        </div>
      )}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingTop: 12,
        borderTop: "1px solid oklch(0.98 0 0 / 0.07)",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: "oklch(0.98 0 0 / 0.45)",
        }}
      >
        {titulo}
      </span>
      {children}
    </div>
  );
}

function PainelLoja({
  p,
  itemLoja,
  ocupado,
  executar,
}: {
  p: Pacote;
  itemLoja: ItemLoja | null;
  ocupado: boolean;
  executar: (acao: () => Promise<void>, ok: string) => Promise<void>;
}) {
  const [preco, setPreco] = useState(
    itemLoja?.preco_mensal != null ? String(itemLoja.preco_mensal) : "",
  );
  useEffect(() => {
    setPreco(itemLoja?.preco_mensal != null ? String(itemLoja.preco_mensal) : "");
  }, [itemLoja?.preco_mensal]);

  const precoNumero = preco.trim() === "" ? null : Number(preco.replace(",", "."));
  const precoInvalido = precoNumero != null && (!Number.isFinite(precoNumero) || precoNumero < 0);
  const publicado = !!itemLoja?.is_active;

  return (
    <Secao titulo="Loja">
      <span style={{ fontSize: 11, color: "oklch(0.98 0 0 / 0.55)", lineHeight: 1.5 }}>
        {publicado
          ? "Publicado: o tenant só liga depois de instalar na Loja."
          : p.loja_aplicativo_id
            ? "Fora da Loja: quem já instalou continua usando; ninguém novo instala."
            : "Não publicado: qualquer tenant do nicho liga direto no Hub, sem instalar."}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          inputMode="decimal"
          aria-label="Preço mensal em reais"
          placeholder="Preço/mês (vazio = grátis)"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          style={{ ...estiloInput, width: 200 }}
        />
        <BotaoPrimario
          onClick={() => {
            if (precoInvalido || ocupado) return;
            void executar(
              () => publicarNaLoja(p.id, precoNumero, true),
              publicado ? "Loja atualizada" : "Publicado na Loja",
            );
          }}
        >
          <Store size={14} /> {publicado ? "Atualizar na Loja" : "Publicar na Loja"}
        </BotaoPrimario>
        {publicado && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() =>
              void executar(
                () => publicarNaLoja(p.id, itemLoja?.preco_mensal ?? null, false),
                "Retirado da Loja",
              )
            }
            style={{
              padding: "8px 14px",
              fontSize: 12,
              color: "oklch(0.98 0 0 / 0.7)",
              background: "transparent",
              border: "1px solid oklch(0.98 0 0 / 0.14)",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Tirar da Loja
          </button>
        )}
      </div>
      {precoInvalido && (
        <span style={{ fontSize: 11, color: "oklch(0.75 0.16 40)" }}>Preço inválido.</span>
      )}
      {precoNumero != null && precoNumero > 0 && (
        <span style={{ fontSize: 10.5, color: "oklch(0.98 0 0 / 0.45)" }}>
          Pagamento na Loja ainda não está conectado: para liberar um pacote pago, use "Liberar para
          tenant" abaixo.
        </span>
      )}
    </Secao>
  );
}

function PainelUso({
  p,
  tenants,
  executar,
}: {
  p: Pacote;
  tenants: OpcaoSimples[];
  executar: (acao: () => Promise<void>, ok: string) => Promise<void>;
}) {
  const [uso, setUso] = useState<UsoPacote[] | null>(null);
  const [tenantEscolhido, setTenantEscolhido] = useState("");

  const carregar = useCallback(async () => {
    try {
      setUso(await lerUsoPacote(p.id));
    } catch (e) {
      toast.error(mensagemErro(e));
      setUso([]);
    }
  }, [p.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const semAcesso = useMemo(() => {
    const comAcesso = new Set((uso ?? []).filter((u) => u.instalado).map((u) => u.tenant_id));
    return tenants.filter((t) => !comAcesso.has(t.id));
  }, [uso, tenants]);

  return (
    <Secao titulo="Tenants com acesso">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <select
          aria-label="Tenant para liberar"
          value={tenantEscolhido}
          onChange={(e) => setTenantEscolhido(e.target.value)}
          style={{ ...estiloInput, width: 260 }}
        >
          <option value="">Escolha um tenant…</option>
          {semAcesso.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <BotaoPrimario
          onClick={() => {
            if (!tenantEscolhido) return;
            const alvo = tenantEscolhido;
            setTenantEscolhido("");
            void executar(() => liberarParaTenant(p.id, alvo, true), "Liberado para o tenant").then(
              carregar,
            );
          }}
        >
          <UserCheck size={14} /> Liberar para tenant
        </BotaoPrimario>
      </div>
      {uso === null ? (
        <Vazio pequeno mensagem="Carregando…" />
      ) : uso.length === 0 ? (
        <Vazio pequeno mensagem="Nenhum tenant instalou ainda." />
      ) : (
        uso.map((u) => (
          <div
            key={u.tenant_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 10,
              background: "oklch(0.98 0 0 / 0.035)",
              border: "1px solid oklch(0.98 0 0 / 0.07)",
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "oklch(0.98 0 0 / 0.9)" }}>
              {u.tenant_nome}
            </span>
            {u.instalado ? (
              <Etiqueta cor="oklch(0.78 0.16 155)">Instalado</Etiqueta>
            ) : (
              <Etiqueta cor="oklch(0.7 0.02 280)">Sem instalação</Etiqueta>
            )}
            <span
              style={{
                fontSize: 10.5,
                color: "oklch(0.98 0 0 / 0.5)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {u.agentes_ligados} agente{u.agentes_ligados === 1 ? "" : "s"} ligado
              {u.agentes_ligados === 1 ? "" : "s"}
            </span>
            {u.instalado && (
              <BotaoIcone
                titulo="Revogar acesso (desinstala e desliga dos agentes)"
                perigo
                onClick={() =>
                  void executar(
                    () => liberarParaTenant(p.id, u.tenant_id, false),
                    "Acesso revogado",
                  ).then(carregar)
                }
              >
                <UserX size={14} />
              </BotaoIcone>
            )}
          </div>
        ))
      )}
    </Secao>
  );
}
