/**
 * ResumoAusencia — "enquanto você esteve fora" logo depois da saudação.
 *
 * Só entra quando o usuário passou mais de 1 hora sem abrir o sistema e algo
 * de fato aconteceu no período. Sem movimento, não aparece: cartão zerado é
 * ruído, não informação.
 *
 * O "quando foi a última visita" vem de `profiles.ultimo_acesso_em`, não do
 * navegador — assim vale entre celular e computador. Lê primeiro, grava depois.
 *
 * Os números vêm da RPC `resumo_ausencia(p_desde)`, que faz o recorte por
 * tenant a partir do `auth.uid()` e devolve tudo numa ida só.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, MessageCircle, Wallet, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { duration, easing } from "@/os/motion/presets";

type Props = {
  userId: string;
  /** Libera a entrada: a saudação já saiu de cena. */
  pronto: boolean;
};

type Resumo = {
  mensagens: number;
  contratos: number;
  pix: number;
  pix_valor: number;
  /** Admin da plataforma vê o movimento de todo mundo, não o do próprio tenant. */
  global?: boolean;
};

/** Abre um app do OS a partir daqui — o listener mora no `App` do bundle. */
function abrirApp(slug: string): void {
  window.dispatchEvent(new CustomEvent("ragentic-abrir-app", { detail: { slug } }));
}

const UMA_HORA_MS = 60 * 60 * 1000;
const MS_NA_TELA = 12_000;
const MS_ENTRADA = Math.round(duration.slow * 1000); // 360ms

/** "há 3 horas", "há 2 dias" — o tamanho da ausência em linguagem de gente. */
function tempoFora(desde: Date): string {
  const horas = Math.floor((Date.now() - desde.getTime()) / UMA_HORA_MS);
  if (horas < 24) return `há ${horas} hora${horas === 1 ? "" : "s"}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias === 1 ? "" : "s"}`;
}

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const css = (bezier: string) => `
.os-resumo {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 199;
  width: min(360px, 88vw);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  overflow: hidden;
  background: oklch(0.16 0.05 264 / 0.92);
  border: 1px solid oklch(0.98 0 0 / 0.09);
  box-shadow: 0 20px 50px oklch(0.05 0.02 264 / 0.55);
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  animation: os-resumo-entra ${MS_ENTRADA}ms ${bezier} both;
}
@keyframes os-resumo-entra {
  from { opacity: 0; transform: translate(-50%, -50%) translateY(14px) scale(0.97); }
  to   { opacity: 1; transform: translate(-50%, -50%) translateY(0) scale(1); }
}
.os-resumo.is-saindo { animation: os-resumo-sai 200ms ease-out both; }
@keyframes os-resumo-sai {
  from { opacity: 1; transform: translate(-50%, -50%) translateY(0); }
  to   { opacity: 0; transform: translate(-50%, -50%) translateY(8px); }
}
.os-resumo-topo {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  padding: 13px 12px 11px 16px;
  border-bottom: 1px solid oklch(0.98 0 0 / 0.06);
}
.os-resumo-titulo { font-size: 13px; font-weight: 600; color: oklch(0.98 0 0 / 0.92); }
.os-resumo-periodo { font-size: 11px; color: oklch(0.98 0 0 / 0.42); }
.os-resumo-fechar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 7px; flex-shrink: 0;
  background: transparent; border: 0; cursor: pointer;
  color: oklch(0.98 0 0 / 0.45);
  transition: color 130ms ease-out, background 130ms ease-out, transform 130ms ease-out;
}
.os-resumo-fechar:hover { color: oklch(0.98 0 0 / 0.92); background: oklch(0.98 0 0 / 0.08); }
.os-resumo-fechar:active { transform: scale(0.94); }
.os-resumo-linhas { display: flex; flex-direction: column; padding: 6px; gap: 2px; }
.os-resumo-linha {
  display: flex; align-items: center; gap: 11px; width: 100%;
  padding: 9px 10px; border-radius: 10px;
  background: transparent; border: 1px solid transparent;
  text-align: left; color: inherit; font: inherit;
}
/* Linha que leva a algum lugar ganha afordância; a informativa fica quieta. */
.os-resumo-linha.is-clicavel { cursor: pointer; transition: background 130ms ease-out, border-color 130ms ease-out, transform 130ms ease-out; }
.os-resumo-linha.is-clicavel:hover {
  background: oklch(0.7 0.18 250 / 0.12);
  border-color: oklch(0.7 0.18 250 / 0.28);
  transform: translateX(2px);
}
.os-resumo-linha.is-clicavel:active { transform: translateX(2px) scale(0.99); }
.os-resumo-seta { color: oklch(0.98 0 0 / 0.3); font-size: 14px; }
.os-resumo-linha.is-clicavel:hover .os-resumo-seta { color: oklch(0.82 0.12 250); }
.os-resumo-icone {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
  color: oklch(0.82 0.12 250);
  background: oklch(0.7 0.18 250 / 0.11);
  border: 1px solid oklch(0.7 0.18 250 / 0.18);
}
.os-resumo-rotulo { flex: 1; font-size: 12.5px; color: oklch(0.98 0 0 / 0.78); }
.os-resumo-numero {
  font-size: 17px; font-weight: 650; color: oklch(0.98 0 0 / 0.96);
  font-variant-numeric: tabular-nums;
}
.os-resumo-extra { font-size: 11px; color: oklch(0.98 0 0 / 0.42); margin-left: 6px; }
@media (prefers-reduced-motion: reduce) {
  .os-resumo, .os-resumo.is-saindo { animation-duration: 1ms; }
}
`;

export default function ResumoAusencia({ userId, pronto }: Props) {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [desde, setDesde] = useState<Date | null>(null);
  const [saindo, setSaindo] = useState(false);
  const [fechado, setFechado] = useState(false);
  const refBuscou = useRef(false);

  const estilos = useMemo(() => css(`cubic-bezier(${easing.outExpo.join(", ")})`), []);

  // Lê a última visita, decide se houve ausência longa e só então regrava o
  // carimbo. A ordem importa: gravar antes apagaria o que a gente quer ler.
  useEffect(() => {
    if (refBuscou.current) return;
    refBuscou.current = true;
    let vivo = true;

    void (async () => {
      try {
        const { data: perfil } = await supabase
          .from("profiles")
          .select("ultimo_acesso_em")
          .eq("id", userId)
          .maybeSingle();

        // `await` obrigatório: o builder do supabase-js é lazy — sem `then`, a
        // requisição nem sai. Foi isso que deixou a coluna vazia pra todo mundo.
        const agora = new Date().toISOString();
        await supabase.from("profiles").update({ ultimo_acesso_em: agora }).eq("id", userId);

        const anterior = perfil?.ultimo_acesso_em ? new Date(perfil.ultimo_acesso_em) : null;
        // Primeira visita da conta não tem "última vez" pra comparar. Em vez de
        // engolir o cartão logo na estreia, mostra o movimento do último dia.
        const desdeQuando = anterior ?? new Date(Date.now() - 24 * UMA_HORA_MS);
        if (anterior && Date.now() - anterior.getTime() < UMA_HORA_MS) return;

        const { data, error } = await supabase.rpc("resumo_ausencia", {
          p_desde: desdeQuando.toISOString(),
        });
        if (error || !vivo) return;

        const r = data as Resumo;
        const houveMovimento = (r?.mensagens ?? 0) + (r?.contratos ?? 0) + (r?.pix ?? 0) > 0;
        if (!houveMovimento) return; // cartão zerado é ruído

        setDesde(desdeQuando);
        setResumo(r);
      } catch (e) {
        console.warn("[ResumoAusencia] falhou:", (e as Error)?.message ?? e);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [userId]);

  const visivel = pronto && !!resumo && !fechado;

  useEffect(() => {
    if (!visivel) return;
    const t = window.setTimeout(() => fechar(), MS_NA_TELA);
    return () => window.clearTimeout(t);
  }, [visivel]);

  function fechar() {
    setSaindo(true);
    window.setTimeout(() => setFechado(true), 200);
  }

  /** Leva o usuário até o que o número está contando. */
  function irPara(slug: string) {
    abrirApp(slug);
    fechar();
  }

  if (!visivel || !resumo || !desde) return null;

  return (
    <>
      <style>{estilos}</style>
      <div className={`os-resumo${saindo ? " is-saindo" : ""}`} role="status">
        <div className="os-resumo-topo">
          <span className="os-resumo-titulo">
            Enquanto você esteve fora{resumo.global ? " · plataforma" : ""}
          </span>
          <span className="os-resumo-periodo">{tempoFora(desde)}</span>
          <button type="button" className="os-resumo-fechar" onClick={fechar} aria-label="Fechar resumo">
            <X size={14} />
          </button>
        </div>

        <div className="os-resumo-linhas">
          <button
            type="button"
            className="os-resumo-linha is-clicavel"
            onClick={() => irPara("conversas")}
            title="Abrir Conversas"
          >
            <span className="os-resumo-icone"><MessageCircle size={16} /></span>
            <span className="os-resumo-rotulo">
              {resumo.mensagens === 1 ? "mensagem nova" : "mensagens novas"}
            </span>
            <span className="os-resumo-numero">{resumo.mensagens}</span>
            <span className="os-resumo-seta" aria-hidden>›</span>
          </button>

          <button
            type="button"
            className="os-resumo-linha is-clicavel"
            onClick={() => irPara("contratos")}
            title="Abrir Contratos"
          >
            <span className="os-resumo-icone"><FileText size={16} /></span>
            <span className="os-resumo-rotulo">
              {resumo.contratos === 1 ? "contrato assinado" : "contratos assinados"}
            </span>
            <span className="os-resumo-numero">{resumo.contratos}</span>
            <span className="os-resumo-seta" aria-hidden>›</span>
          </button>

          {/* Pix não tem tela: `pagamentos_cliente` não é lida por nenhum app.
              Enquanto isso não existir, a linha informa e não leva a lugar nenhum. */}
          <div className="os-resumo-linha">
            <span className="os-resumo-icone"><Wallet size={16} /></span>
            <span className="os-resumo-rotulo">
              {resumo.pix === 1 ? "pix recebido" : "pix recebidos"}
              {resumo.pix > 0 && <span className="os-resumo-extra">{moeda(resumo.pix_valor)}</span>}
            </span>
            <span className="os-resumo-numero">{resumo.pix}</span>
          </div>
        </div>
      </div>
    </>
  );
}
