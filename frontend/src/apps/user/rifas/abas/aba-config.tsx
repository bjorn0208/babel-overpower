/**
 * Aba Configuração — toggle do agente vendedor + chave PIX própria das rifas.
 * Grava em rifas_config_tenant (sem row = agente liberado + PIX do perfil).
 */

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { AlertTriangle, KeyRound, Settings2 } from "lucide-react";
import { CarregandoCentro } from "../componentes/basicos";
import { Botao } from "../componentes/botao";
import { Campo } from "../componentes/campo";
import { carregarConfig, salvarConfig } from "../dados-rifas";
import type { ConfigRifas } from "../tipos";
import "./aba-criar.css";

export interface AbaConfigProps {
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

/** Um ajuste por linha: rótulo à esquerda, switch à direita (Arena). */
const LinhaSwitch = ({
  titulo,
  descricao,
  extra,
  ligado,
  aoMudar,
}: {
  titulo: string;
  descricao: string;
  extra?: ReactNode;
  ligado: boolean;
  aoMudar: (v: boolean) => void;
}) => {
  const id = useId();
  return (
    <div className="ar-linha justify-between items-start">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer py-1">
        <span className="block text-base font-medium ar-txt-1">{titulo}</span>
        <span className="block text-sm ar-txt-3 mt-1 leading-relaxed">{descricao}</span>
        {extra}
      </label>
      <span className="ar-switch-alvo">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="ar-switch"
          checked={ligado}
          onChange={(e) => aoMudar(e.target.checked)}
        />
      </span>
    </div>
  );
};

export const AbaConfig = ({ aoNotificar }: AbaConfigProps) => {
  const [agentePodeVender, setAgentePodeVender] = useState(true);
  const [postarStatus, setPostarStatus] = useState(false);
  const [bomDiaRifa, setBomDiaRifa] = useState(false);
  const [chavePix, setChavePix] = useState("");
  const [pixDoPerfil, setPixDoPerfil] = useState<string | null>(null);
  const [ultimoPost, setUltimoPost] = useState<string | null>(null);
  // Campos que essa aba não edita (mensagem/mídia do bom-dia, aba Disparo) —
  // só guarda pra não zerar no upsert quando essa tela salva outra coisa.
  const [restoConfig, setRestoConfig] = useState<Pick<
    ConfigRifas,
    "bom_dia_mensagem_saudacao" | "bom_dia_mensagem_followup" | "bom_dia_midia_saudacao_url" | "bom_dia_midia_followup_url"
  > | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const cfg = await carregarConfig();
      setAgentePodeVender(cfg.agente_pode_vender);
      setPostarStatus(cfg.postar_status_ativo);
      setBomDiaRifa(cfg.bom_dia_rifa_ativo);
      setChavePix(cfg.chave_pix ?? "");
      setPixDoPerfil(cfg.pixDoPerfil);
      setUltimoPost(cfg.ultimoPostStatusEm ?? null);
      setRestoConfig({
        bom_dia_mensagem_saudacao: cfg.bom_dia_mensagem_saudacao,
        bom_dia_mensagem_followup: cfg.bom_dia_mensagem_followup,
        bom_dia_midia_saudacao_url: cfg.bom_dia_midia_saudacao_url,
        bom_dia_midia_followup_url: cfg.bom_dia_midia_followup_url,
      });
    } catch (e) {
      aoNotificar(`Falha ao carregar configuração: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setCarregando(false);
    }
  }, [aoNotificar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarConfig({
        agente_pode_vender: agentePodeVender,
        chave_pix: chavePix,
        postar_status_ativo: postarStatus,
        bom_dia_rifa_ativo: bomDiaRifa,
        bom_dia_mensagem_saudacao: restoConfig?.bom_dia_mensagem_saudacao ?? null,
        bom_dia_mensagem_followup: restoConfig?.bom_dia_mensagem_followup ?? null,
        bom_dia_midia_saudacao_url: restoConfig?.bom_dia_midia_saudacao_url ?? null,
        bom_dia_midia_followup_url: restoConfig?.bom_dia_midia_followup_url ?? null,
      });
      aoNotificar("Configuração salva.", "success");
    } catch (e) {
      aoNotificar(`Falha ao salvar: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <CarregandoCentro rotulo="Carregando configuração…" />;

  const semPix = !pixDoPerfil && !chavePix.trim();

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <div>
        <h1 className="ar-titulo-tela">Configuração</h1>
        <p className="text-sm ar-txt-3 mt-1">Como as rifas são vendidas e pra onde o PIX cai.</p>
      </div>

      <section className="ar-cartao">
        <div className="ar-secao-cab">
          <span className="ar-secao-cab__icone">
            <Settings2 size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="ar-titulo-secao">Venda automática</h2>
            <p className="text-sm ar-txt-3 mt-1">O que o agente pode fazer sozinho no WhatsApp.</p>
          </div>
        </div>

        <div className="ar-lista mt-4">
          <LinhaSwitch
            titulo="Agente pode vender números no WhatsApp"
            descricao="Com isso ligado, o agente do Conversas oferece a rifa ativa, reserva números e manda o PIX direto na conversa."
            ligado={agentePodeVender}
            aoMudar={setAgentePodeVender}
          />

          <LinhaSwitch
            titulo="Postar a rifa no Status do WhatsApp (a cada 30 min)"
            descricao="O sistema publica a cartela da rifa ativa no seu Status quando há venda nova. Se houver arte salva na aba Imagens, posta a arte com legenda."
            ligado={postarStatus}
            aoMudar={setPostarStatus}
            extra={
              ultimoPost ? (
                <span className="block text-xs font-medium mt-1.5 ar-num" style={{ color: "var(--ar-ok)" }}>
                  Último post:{" "}
                  {new Date(ultimoPost).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : undefined
            }
          />

          <LinhaSwitch
            titulo="Bom-dia da rifa (7h) + follow-up do meio-dia"
            descricao="Às 7h o agente dá bom dia aos seus contatos oferecendo a rifa do dia — só envia os detalhes pra quem responder. Quem não responder até 12h recebe uma atualização de como a rifa está."
            ligado={bomDiaRifa}
            aoMudar={setBomDiaRifa}
          />
        </div>
      </section>

      <section className="ar-cartao">
        <div className="ar-secao-cab">
          <span className="ar-secao-cab__icone">
            <KeyRound size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="ar-titulo-secao">Recebimento</h2>
            <p className="text-sm ar-txt-3 mt-1">Pra onde o PIX das rifas cai.</p>
          </div>
        </div>

        <div className="ar-form-grid mt-5">
          <div className="ar-col-toda">
            <Campo
              rotulo="Chave PIX das rifas (opcional)"
              className="ar-num"
              value={chavePix}
              onChange={(e) => setChavePix(e.target.value)}
              placeholder={pixDoPerfil ? `Vazio = usa a do perfil (${pixDoPerfil})` : "Vazio = usa a chave PIX do perfil"}
            />
          </div>
        </div>

        {semPix && (
          <p className="ar-aviso-box mt-4 flex items-start gap-2">
            <AlertTriangle size={16} aria-hidden className="shrink-0 mt-0.5" />
            <span>Sem chave PIX aqui nem no perfil, o comprador não tem pra onde pagar.</span>
          </p>
        )}
      </section>

      <div className="ar-sticky-bottom mt-2">
        <span className="text-sm ar-txt-3 min-w-0 truncate">Alterações valem depois de salvar.</span>
        <Botao type="button" variante="primario" onClick={() => void salvar()} carregando={salvando} className="ml-auto">
          Salvar configuração
        </Botao>
      </div>
    </div>
  );
};
