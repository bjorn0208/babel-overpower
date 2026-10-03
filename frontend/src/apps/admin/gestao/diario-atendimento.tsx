/**
 * Diário de 15 dias (itens 2-5 e 11 do Lote H): um `<details>` por dia, campos que salvam sozinhos ao
 * sair do campo (onBlur), aviso "Salvo às HH:MM", marcador "✓ registrado" e barra "Dia X de 15".
 * Original: financeiro-original:2409-2444 (renderização) e :2814-2826 (salvar ao sair do campo).
 *
 * Correções da auditoria de 2026-09-22 (`AUDITORIA-SERJAO-APP.md`):
 *  B4 (rodada 1) — dois `onBlur` em sequência (ex.: Tab de um campo para o outro) mesclavam sobre a prop
 *       `registro` do render em que o blur aconteceu; enquanto o `recarregar()` do primeiro não voltava, o
 *       segundo gravava a partir do mesmo snapshot velho e apagava o primeiro campo.
 *  B7 (rodada 2) — a correção do B4 usava um `ref` só deste componente, alimentado só pelas próprias
 *       gravações do diário: no contexto "prog", tentativas gravam no mesmo `extras` e o ref daqui não via
 *       o que elas tinham acabado de gravar, e vice-versa — a gravação seguinte apagava a outra.
 *  Corrigido junto: o diário não mantém mais o retrato nem a fila sozinho. Recebe `gravador` (criado uma
 *  vez em `DetalheAtendimento`, compartilhado com o painel de tentativas — `logica-atendimento.ts`,
 *  `criarGravadorAtendimento`). Toda gravação desta tela parte do mesmo retrato confirmado pelo banco.
 *  B5 — em erro, o `finally` limpava `pendentes` e o campo voltava ao valor antigo, perdendo o que a
 *       pessoa tinha digitado. Agora só limpa em sucesso; em erro mantém o texto e mostra "não salvou".
 *  A9 — no sucesso, `pendentes` era limpo ANTES do `recarregar()`: por uma fração de segundo o campo
 *       piscava de volta ao valor antigo até a prop chegar. Agora só limpa depois do `recarregar()`.
 */

import { useRef, useState } from "react";
import {
  CAMPOS_DIARIO,
  ROTULO_DIARIO,
  chaveDadosDoContexto,
  dataDoDiaDe,
  diaAtualDe,
  diaTemRegistro,
  diarioDoContexto,
  resumoDoDia,
  DIAS_SEMANA,
  isoParaBR,
  salvarCampoDia,
  DIAS_ATENDIMENTO,
  type CampoDiario,
  type Contexto,
  type GravadorAtendimento,
  type RegistroAtendimento,
  type RegistroComHistorico,
} from "./dados-atendimento";
import { dataDeBR, mascararData } from "./calculos";
import { mensagemDeErro } from "./dados";
import { dataBR, ymd, type DiaRegistro, type PropsAba, type ToastApi } from "./tipos";

const horaAgora = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

type RegistroDiario = Pick<RegistroComHistorico, "id" | "dias" | "extras">;

export function DiarioAtendimento({
  ctx,
  registro,
  gravador,
  inicioIso,
  somenteLeitura,
  ativo,
  iniciado,
  t,
  recarregar,
}: {
  ctx: Contexto;
  /** Só para exibir o que já está salvo — quem grava é `gravador` (retrato compartilhado da tela). */
  registro: RegistroDiario;
  gravador: GravadorAtendimento<RegistroAtendimento>;
  inicioIso: string | null;
  somenteLeitura: boolean;
  ativo: boolean;
  iniciado: boolean;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
}) {
  const campos = CAMPOS_DIARIO[ctx];
  const diario = diarioDoContexto(ctx, registro);
  const hoje = new Date();
  const diaAtual = diaAtualDe(inicioIso, hoje);

  const [abertos, setAbertos] = useState<Set<number>>(
    () => new Set([Math.max(1, Math.min(diaAtual || 1, DIAS_ATENDIMENTO))]),
  );
  const [pendentes, setPendentes] = useState<Record<string, string>>({});
  const [salvoEm, setSalvoEm] = useState<Record<number, string>>({});
  const [erros, setErros] = useState<Record<number, string>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  function alternar(n: number) {
    setAbertos((s) => {
      const novo = new Set(s);
      if (novo.has(n)) novo.delete(n);
      else novo.add(n);
      return novo;
    });
  }

  function salvarCampo(n: number, campo: CampoDiario, valorAtual: string) {
    const chave = `${n}:${campo.chave}`;
    let valor = pendentes[chave];
    if (valor === undefined) return;
    if (campo.tipo === "data") {
      // Artefato :2817-2820: data digitada dd/mm/aaaa; inválida não grava e avisa.
      const v = valor.trim();
      if (v && !dataDeBR(v)) {
        t.error("Use o formato dd/mm/aaaa.");
        return;
      }
      valor = v ? dataDeBR(v) : "";
    }
    if (valor === valorAtual) {
      setPendentes((p) => {
        const { [chave]: _igual, ...resto } = p;
        return resto;
      });
      return;
    }
    const valorFinal = valor;
    // B4/B7: enfileira no gravador COMPARTILHADO da tela — parte sempre do retrato mais recente,
    // confirmado pelo banco, mesmo que outra gravação (diário ou tentativa) tenha acabado de rodar.
    void gravador
      .gravar((atual) => salvarCampoDia(ctx, atual, n, campo.chave, valorFinal))
      .then(async () => {
        setSalvoEm((s) => ({ ...s, [n]: `Salvo às ${horaAgora()}` }));
        setErros((s) => ({ ...s, [n]: "" }));
        clearTimeout(timers.current[n]);
        timers.current[n] = setTimeout(() => setSalvoEm((s) => ({ ...s, [n]: "" })), 4000);
        await recarregar([chaveDadosDoContexto(ctx)]);
        // A9: só limpa o rascunho depois do recarregar, para o campo não piscar de volta ao valor antigo.
        setPendentes((p) => {
          const { [chave]: _fora, ...resto } = p;
          return resto;
        });
      })
      .catch((e) => {
        // B5: em erro, o rascunho NÃO é limpo — o texto digitado continua na tela.
        const msg = mensagemDeErro(e, "Não consegui salvar. O texto continua aqui — tente de novo.");
        setErros((s) => ({ ...s, [n]: msg }));
        t.error(msg);
      });
  }

  if (!iniciado) {
    return (
      <div className="os-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="row gap-3" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
          <div className="h3">
            {ROTULO_DIARIO[ctx]} · {DIAS_ATENDIMENTO} dias
          </div>
          <div className="muted tiny">Salvo automaticamente ao sair de cada campo. Este histórico é só desta aba.</div>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Clique em <b>Iniciar atendimento</b> para liberar o acompanhamento do dia 1 ao dia {DIAS_ATENDIMENTO}.
        </p>
      </div>
    );
  }

  return (
    <div className="os-card" style={{ padding: 18, marginBottom: 16 }}>
      {/* Artefato :2410-2411. A barra "Dia X de 15" mora na coluna Andamento da lista (:2117-2121), não aqui. */}
      <div className="row gap-3" style={{ alignItems: "baseline", flexWrap: "wrap", marginBottom: 12 }}>
        <div className="h3">
          {ROTULO_DIARIO[ctx]} · {DIAS_ATENDIMENTO} dias
        </div>
        <div className="muted tiny">Salvo automaticamente ao sair de cada campo. Este histórico é só desta aba.</div>
      </div>

      <div className="col gap-2">
        {Array.from({ length: DIAS_ATENDIMENTO }, (_, i) => i + 1).map((n) => {
          const diaAtualObj = diario[n] ?? {};
          const preenchido = diaTemRegistro(diaAtualObj);
          const dt = dataDoDiaDe(inicioIso, n);
          const resumo = resumoDoDia(campos, diaAtualObj);
          const aberto = abertos.has(n);
          return (
            <details
              key={n}
              open={aberto}
              onToggle={(e) => {
                const novoAberto = (e.target as HTMLDetailsElement).open;
                if (novoAberto !== aberto) alternar(n);
              }}
              className="os-card"
              style={{ padding: 0, border: n === diaAtual && ativo ? "1px solid var(--os-acento-1)" : undefined }}
            >
              <summary
                className="row gap-2"
                style={{ padding: "10px 14px", cursor: "pointer", alignItems: "center", listStyle: "none" }}
              >
                <span className="small" style={{ fontWeight: 600, minWidth: 56 }}>
                  Dia {n}
                </span>
                <span className="muted tiny" style={{ minWidth: 90 }}>
                  {dt ? `${dataBR(ymd(dt))} · ${DIAS_SEMANA[dt.getDay()].slice(0, 3)}` : ""}
                </span>
                <span className="muted tiny" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {resumo || (n === diaAtual ? "hoje" : "")}
                </span>
                {preenchido && <span className="badge badge-success">✓ registrado</span>}
              </summary>
              <div className="col gap-2" style={{ padding: "0 14px 14px" }}>
                {campos.map((campo) => {
                  const chave = `${n}:${campo.chave}`;
                  const valorAtual = diaAtualObj[campo.chave] ?? "";
                  const valor = pendentes[chave] ?? valorAtual;
                  return (
                    <div key={campo.chave} className="col gap-1">
                      <label className="label">{campo.rotulo}</label>
                      {campo.tipo === "textarea" ? (
                        <textarea
                          className="input"
                          rows={3}
                          value={valor}
                          placeholder={campo.dica}
                          disabled={somenteLeitura}
                          onChange={(e) => setPendentes((p) => ({ ...p, [chave]: e.target.value }))}
                          onBlur={() => salvarCampo(n, campo, valorAtual)}
                        />
                      ) : campo.tipo === "data" ? (
                        <input
                          className="input"
                          inputMode="numeric"
                          maxLength={10}
                          placeholder="dd/mm/aaaa"
                          value={pendentes[chave] ?? isoParaBR(valorAtual)}
                          disabled={somenteLeitura}
                          onChange={(e) => setPendentes((p) => ({ ...p, [chave]: mascararData(e.target.value) }))}
                          onBlur={() => salvarCampo(n, campo, valorAtual)}
                        />
                      ) : (
                        <input
                          className="input"
                          type="text"
                          value={valor}
                          placeholder={campo.dica}
                          disabled={somenteLeitura}
                          onChange={(e) => setPendentes((p) => ({ ...p, [chave]: e.target.value }))}
                          onBlur={() => salvarCampo(n, campo, valorAtual)}
                        />
                      )}
                    </div>
                  );
                })}
                {erros[n] ? (
                  <p className="small" style={{ color: "var(--os-erro)" }}>
                    {erros[n]}{" "}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        for (const campo of campos) {
                          const chave = `${n}:${campo.chave}`;
                          if (pendentes[chave] !== undefined) salvarCampo(n, campo, diaAtualObj[campo.chave] ?? "");
                        }
                      }}
                    >
                      Tentar de novo
                    </button>
                  </p>
                ) : (
                  // "Salvo" em verde, como o artefato (.salvo, financeiro.html:219)
                  salvoEm[n] && (
                    <p className="tiny" style={{ color: "var(--os-sucesso)", fontWeight: 600 }}>
                      {salvoEm[n]}
                    </p>
                  )
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Histórico do outro lado, somente leitura (item 6/9) — financeiro-original:2270-2283.
 * Em impl mostra o diário do programador; em prog mostra o da implementação.
 */
export function HistoricoOutroLado({
  titulo,
  campos,
  diario,
  inicioIso,
}: {
  titulo: string;
  campos: CampoDiario[];
  diario: Record<string, DiaRegistro>;
  inicioIso: string | null;
}) {
  const itens = Array.from({ length: DIAS_ATENDIMENTO }, (_, i) => i + 1)
    .map((n) => ({ n, dia: diario[n] }))
    .filter(({ dia }) => diaTemRegistro(dia));

  return (
    <details className="os-card" style={{ padding: 0, marginTop: 12 }}>
      <summary className="row gap-2" style={{ padding: "10px 14px", cursor: "pointer", alignItems: "center", listStyle: "none" }}>
        <span className="small" style={{ fontWeight: 600 }}>
          {titulo}
        </span>
        <span className="muted tiny">
          {itens.length ? `${itens.length} dia(s) com registro · somente leitura` : "nenhum registro ainda"}
        </span>
      </summary>
      <div className="col gap-2" style={{ padding: "0 14px 14px" }}>
        {itens.length === 0 ? (
          <p className="muted small">Nada registrado.</p>
        ) : (
          itens.map(({ n, dia }) => {
            const dt = dataDoDiaDe(inicioIso, n);
            return (
              <div key={n} style={{ padding: "6px 0", borderTop: "1px solid oklch(0.98 0 0 / 0.06)" }}>
                <div className="muted tiny" style={{ marginBottom: 2 }}>
                  Dia {n}
                  {dt ? ` · ${dataBR(ymd(dt))}` : ""}
                </div>
                {campos.map((campo) => {
                  const v = dia?.[campo.chave];
                  if (!v || !String(v).trim()) return null;
                  return (
                    <div key={campo.chave} className="small">
                      <span className="muted">{campo.rotulo}:</span> {campo.tipo === "data" ? dataBR(v) : v}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}
