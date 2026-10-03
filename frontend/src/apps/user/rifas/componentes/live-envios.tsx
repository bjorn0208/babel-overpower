/**
 * Envios ao vivo — a fila do disparo em andamento: quem já recebeu (com a
 * mensagem exata e se deu certo), quem ainda falta, e o freio de mão.
 *
 * Poll adaptativo em vez de Realtime, pra manter o app leve: enquanto o
 * disparo está andando (envio nos últimos 2 min) relê a cada 3s; parado,
 * volta pra 20s. Um poll fixo de 15s fazia a fila parecer travada bem na
 * hora em que o dono está olhando pra ela.
 *
 * Visual Arena: livro-razão (`ar-lista`/`ar-linha`), ponto verde pulsando na
 * linha que está saindo agora, contadores em `.ar-num` e barra de progresso.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Eye, Hourglass, RotateCw } from "lucide-react";
import { Botao } from "./botao";
import { BarraProgresso } from "./basicos";
import { BotaoPausaDisparos } from "./botao-pausa-disparos";
import {
  listarEnviosAoVivo,
  listarFilaPendente,
  reenviarEnvio,
  type EnvioDisparo,
  type PendenteFila,
} from "../dados-disparos";
import "../abas/aba-disparo.css";

const POLL_ATIVO_MS = 3_000;
const POLL_PARADO_MS = 20_000;
/** Envio recente = disparo em andamento. */
const JANELA_ATIVIDADE_MS = 2 * 60_000;

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export interface LiveEnviosProps {
  rifaId: string;
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

export const LiveEnvios = ({ rifaId, aoNotificar }: LiveEnviosProps) => {
  const [envios, setEnvios] = useState<EnvioDisparo[]>([]);
  const [fila, setFila] = useState<PendenteFila[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [reenviando, setReenviando] = useState<string | null>(null);
  const [verMensagem, setVerMensagem] = useState<string | null>(null);
  const [filaAberta, setFilaAberta] = useState(false);
  const timerRef = useRef<number | null>(null);

  const carregar = useCallback(() => {
    void Promise.allSettled([listarEnviosAoVivo(rifaId), listarFilaPendente(rifaId)]).then(
      ([resEnvios, resFila]) => {
        if (resEnvios.status === "fulfilled") setEnvios(resEnvios.value);
        if (resFila.status === "fulfilled") setFila(resFila.value);
        setCarregando(false);
      },
    );
  }, [rifaId]);

  const ultimoEnvioEm = envios[0]?.criado_em ?? null;
  const disparoAndando =
    !!ultimoEnvioEm && Date.now() - new Date(ultimoEnvioEm).getTime() < JANELA_ATIVIDADE_MS;

  // Reagenda a cada carga: o ritmo acompanha o disparo em vez de ser fixo.
  useEffect(() => {
    carregar();
    const intervalo = disparoAndando ? POLL_ATIVO_MS : POLL_PARADO_MS;
    timerRef.current = window.setInterval(carregar, intervalo);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [carregar, disparoAndando]);

  const reenviar = async (envio: EnvioDisparo) => {
    setReenviando(envio.id);
    const r = await reenviarEnvio(envio.id);
    setReenviando(null);
    if (r.ok) {
      aoNotificar("Reenviado.", "success");
      carregar();
    } else aoNotificar(`Falha no reenvio: ${r.erro}`, "error");
  };

  const total = envios.length;
  const sucessos = envios.filter((e) => e.status === "sucesso").length;
  const taxa = total > 0 ? Math.round((sucessos / total) * 100) : 0;

  const corTaxa = taxa >= 80 ? "var(--ar-ok)" : taxa >= 50 ? "var(--ar-aviso)" : "var(--ar-erro)";
  const previsto = total + fila.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="ar-titulo-secao flex items-center gap-2">
          Envios ao vivo
          {disparoAndando && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--ar-ok)" }}>
              <span className="ard-ponto ard-ponto--vivo" aria-hidden />
              disparando
            </span>
          )}
        </h3>
      </div>

      {/* Placar do disparo: as "odds" da referência viram contadores de envio. */}
      <div className="ar-scroll-x">
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">entregues</span>
          <span className="ar-chip-num__valor" style={{ color: "var(--ar-ok)" }}>{sucessos}</span>
        </span>
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">saíram</span>
          <span className="ar-chip-num__valor">{total}</span>
        </span>
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">taxa</span>
          <span className="ar-chip-num__valor" style={{ color: total > 0 ? corTaxa : undefined }}>
            {taxa}%
          </span>
        </span>
        <span className="ar-chip-num">
          <span className="ar-chip-num__rotulo">na fila</span>
          <span className="ar-chip-num__valor" style={{ color: fila.length > 0 ? "var(--ar-aviso)" : undefined }}>
            {fila.length}
          </span>
        </span>
      </div>

      {previsto > 0 && (
        <div className="space-y-1.5">
          <BarraProgresso valor={total} maximo={previsto} />
          <p className="text-xs ar-txt-3">
            <span className="ar-num">{total}</span> de <span className="ar-num">{previsto}</span> do
            lote de hoje já passaram pela esteira.
          </p>
        </div>
      )}

      <BotaoPausaDisparos aoNotificar={aoNotificar} aoMudar={() => carregar()} />

      {/* Quem ainda falta. Sem isso o dono só enxerga quem já recebeu e não
          tem ideia de quanto ainda vem pela frente. */}
      {fila.length > 0 && (
        <div className="ar-cartao ar-cartao--compacto">
          <button
            type="button"
            className="w-full flex items-center gap-2 text-left min-h-[44px]"
            onClick={() => setFilaAberta((v) => !v)}
            aria-expanded={filaAberta}
          >
            <span className="ar-txt-3" aria-hidden>
              {filaAberta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
            <span className="font-medium ar-txt-1">
              Na fila: <span className="ar-num">{fila.length}</span>
            </span>
            <span className="text-xs ar-txt-3">ainda não receberam hoje</span>
          </button>

          {filaAberta && (
            <div className="ar-lista ard-rolavel max-h-64 mt-1">
              {fila.map((c) => (
                <div key={c.id} className="ar-linha">
                  <span className="ar-txt-4 shrink-0" aria-hidden>
                    <Hourglass size={15} />
                  </span>
                  <span className="ar-txt-2 truncate flex-1">{c.nome || "(sem nome)"}</span>
                  <span className="ar-num text-xs ar-txt-3 shrink-0">{c.phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {carregando ? (
        <p className="text-sm ar-txt-3">Carregando…</p>
      ) : envios.length === 0 ? (
        <p className="text-sm ar-txt-3">Nenhum envio ainda.</p>
      ) : (
        <div className="ar-cartao ar-cartao--compacto">
          <div className="ar-lista ard-rolavel max-h-96">
            {envios.map((e, i) => {
              const ok = e.status === "sucesso";
              const saindoAgora = i === 0 && disparoAndando;
              return (
                <div key={e.id} className="ar-linha flex-wrap">
                  <span
                    className={`ard-ponto ${saindoAgora ? "ard-ponto--vivo" : ok ? "ard-ponto--ok" : "ard-ponto--erro"}`}
                    title={saindoAgora ? "Saindo agora" : ok ? "Entregue" : "Falhou"}
                  />
                  <span className="ar-num ar-txt-1">{e.phone}</span>
                  <span className="ar-num text-xs ar-txt-4">{fmtHora(e.criado_em)}</span>
                  {!ok && e.erro_detalhe && (
                    <span
                      className="text-xs truncate max-w-[200px]"
                      style={{ color: "var(--ar-erro)" }}
                      title={e.erro_detalhe}
                    >
                      {e.erro_detalhe}
                    </span>
                  )}

                  <div className="ml-auto flex items-center gap-1">
                    <span
                      className="ar-icone-btn relative"
                      style={{ width: 36, height: 36, background: "transparent" }}
                      onMouseEnter={() => setVerMensagem(e.id)}
                      onMouseLeave={() => setVerMensagem((v) => (v === e.id ? null : v))}
                      title="Ver a mensagem exata que saiu"
                    >
                      <Eye size={16} aria-hidden />
                      {verMensagem === e.id && e.mensagem_enviada && (
                        <span className="ard-balao">{e.mensagem_enviada}</span>
                      )}
                    </span>
                    {!ok && (
                      <Botao
                        tamanho="sm"
                        variante="fantasma"
                        carregando={reenviando === e.id}
                        onClick={() => void reenviar(e)}
                      >
                        <RotateCw size={14} aria-hidden />
                        Reenviar
                      </Botao>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
