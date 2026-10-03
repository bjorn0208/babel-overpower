/**
 * Conteúdo do painel do plano (miolo do popover do CardPlano): identidade da
 * conta (foto do usuário + logo da empresa), uso do plano, validade e os dois
 * CTAs (renovar com comprovante / ir pra loja). Extraído do CardPlano pra manter
 * cada arquivo abaixo do limite de 300 linhas.
 */

import type { PlanoUso } from "./CardPlano";
import type { DadosPlanoRico } from "./useDadosPlano";
import { AnelUsoPlano } from "./AnelUsoPlano";
import { CalendarioExpiracao } from "./CalendarioExpiracao";

/** Pílula de capacidade do plano: valor forte + rótulo do que ele comporta. */
function Capacidade({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <span
      className="tiny"
      style={{
        padding: "5px 10px",
        borderRadius: 99,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        whiteSpace: "nowrap",
      }}
    >
      <span className="mono" style={{ fontWeight: 700 }}>{valor}</span>{" "}
      <span className="muted">{rotulo}</span>
    </span>
  );
}

/** Foto da conta (avatar do usuário ou logo da empresa) com fallback de iniciais. */
function Selo({
  url,
  nome,
  forma,
  size = 42,
  style,
}: {
  url: string | null;
  nome: string;
  forma: "circulo" | "quadrado";
  size?: number;
  style?: React.CSSProperties;
}) {
  const radius = forma === "circulo" ? "50%" : 12;
  const iniciais =
    (nome || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "—";
  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    border: "2px solid rgba(15,12,30,0.96)",
    ...style,
  };
  if (url) {
    return <img src={url} alt={nome} style={{ ...base, objectFit: "cover" }} />;
  }
  return (
    <div
      aria-hidden="true"
      style={{
        ...base,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,255,255,0.08)",
        fontSize: size * 0.34,
        fontWeight: 700,
        color: "var(--txt-2)",
      }}
    >
      {iniciais}
    </div>
  );
}

interface PainelPlanoConteudoProps {
  plano: PlanoUso;
  dados: DadosPlanoRico;
  tituloId: string;
  cor: string;
  refPrimeiroFoco: React.RefObject<HTMLButtonElement | null>;
  onRenovar: () => void;
  onAbrirLoja: () => void;
}

export function PainelPlanoConteudo({
  plano,
  dados,
  tituloId,
  cor,
  refPrimeiroFoco,
  onRenovar,
  onAbrirLoja,
}: PainelPlanoConteudoProps) {
  // Data/dias reais da assinatura (quando o lazy já carregou) vencem a prop.
  const diasReais = dados.dataExpiracao
    ? Math.max(
        0,
        Math.ceil(
          (new Date(dados.dataExpiracao).getTime() - Date.now()) / 86400000,
        ),
      )
    : plano.dias_ate_expirar;
  const dataIso = dados.dataExpiracao ?? plano.data_expiracao;
  const tituloConta = dados.empresaNome || dados.usuarioNome || plano.plano_nome;

  return (
    <>
      {/* Cabeçalho: identidade da conta (foto do usuário + logo da empresa) */}
      <div className="row" style={{ alignItems: "center", gap: 12 }}>
        <div style={{ position: "relative", width: 64, height: 42, flexShrink: 0 }}>
          <Selo
            url={dados.avatarUrl}
            nome={dados.usuarioNome}
            forma="circulo"
            style={{ position: "absolute", left: 0, top: 0, zIndex: 2 }}
          />
          <Selo
            url={dados.empresaLogoUrl}
            nome={dados.empresaNome}
            forma="quadrado"
            style={{ position: "absolute", left: 22, top: 0, zIndex: 1 }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="tiny muted">Sua conta</div>
          <div
            className="h3"
            style={{
              fontSize: 15,
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {tituloConta}
          </div>
        </div>
      </div>

      <div className="hr" />

      {/* Plano atual + anel de uso lado a lado (gráfico substitui a barra antiga) */}
      <div className="row" style={{ gap: 16, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="small muted">Plano atual</div>
          <div
            id={tituloId}
            className="h3 os-aurora-text"
            style={{ marginTop: 2, fontSize: 20 }}
          >
            {plano.plano_nome}
          </div>
          <span
            className="badge"
            style={{
              color: cor,
              borderColor: cor,
              background: "transparent",
              display: "inline-block",
              marginTop: 6,
            }}
          >
            {plano.status}
          </span>
          {dados.descricaoPlano && (
            <div className="muted tiny" style={{ marginTop: 8 }}>
              {dados.descricaoPlano}
            </div>
          )}
        </div>
        <AnelUsoPlano usadas={plano.conversas_usadas} max={plano.max_conversas} />
      </div>

      {/* O que o plano comporta */}
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        <Capacidade valor={`${plano.max_conversas}`} rotulo="conversas por ciclo" />
        {dados.cicloDias != null && (
          <Capacidade valor={`${dados.cicloDias}`} rotulo="dias de ciclo" />
        )}
      </div>
      <div className="muted tiny" style={{ marginTop: 6 }}>
        Cada lead atendido conta como 1 conversa, independente do nº de mensagens.
      </div>

      <div className="hr" />

      {/* Calendário: dias contados até o último dia do plano */}
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <div className="small muted">Validade</div>
        <div className="small mono" style={{ fontWeight: 700, color: cor }}>
          {diasReais} dias restantes
        </div>
      </div>
      {dataIso ? (
        <CalendarioExpiracao dataExpiracao={dataIso} cor={cor} />
      ) : (
        <div className="muted tiny">Sem data de expiração registrada.</div>
      )}

      <button
        ref={refPrimeiroFoco}
        className="btn btn-primary"
        style={{ width: "100%", marginTop: 14 }}
        onClick={onRenovar}
      >
        Renovar este plano
      </button>
      <button
        className="btn"
        style={{ width: "100%", marginTop: 8 }}
        onClick={onAbrirLoja}
      >
        Ver pacotes e adicionais na loja
      </button>
    </>
  );
}
