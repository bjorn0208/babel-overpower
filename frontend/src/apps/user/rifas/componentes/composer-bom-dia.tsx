/**
 * Composer da mensagem do ritual bom-dia (saudação 7h + follow-up meio-dia)
 * — texto editável + mídia própria (imagem/vídeo), campo que a "Lista de
 * disparo" nunca teve (era 100% hardcoded em `cron-bom-dia-rifa`). Salva em
 * `rifas_config_tenant`; vazio = mantém o texto/comportamento padrão atual.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Paperclip } from "lucide-react";
import { Botao } from "./botao";
import { AreaTexto } from "./campo";
import { carregarConfig, salvarConfig, subirMidiaBomDia } from "../dados-rifas";
import type { ConfigRifas } from "../tipos";
import "../abas/aba-disparo.css";

export interface ComposerBomDiaProps {
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
}

const ehVideo = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url);

function BlocoMidia({
  rotulo,
  url,
  enviando,
  aoEscolher,
  aoRemover,
}: {
  rotulo: string;
  url: string | null;
  enviando: boolean;
  aoEscolher: (e: ChangeEvent<HTMLInputElement>) => void;
  aoRemover: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="ar-rotulo mb-1.5">{rotulo}</p>
      {url ? (
        <div className="flex items-center gap-3">
          {ehVideo(url) ? (
            <video src={url} className="ard-midia" muted />
          ) : (
            <img src={url} alt={rotulo} className="ard-midia" />
          )}
          <Botao tamanho="sm" variante="fantasma" onClick={aoRemover}>
            Remover
          </Botao>
        </div>
      ) : (
        <>
          <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={aoEscolher} />
          <button
            type="button"
            className="ard-upload"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
          >
            <span className="ard-upload__icone" aria-hidden>
              <Paperclip size={18} />
            </span>
            <span className="ar-txt-1 font-medium">
              {enviando ? "Subindo…" : "Anexar imagem ou vídeo"}
            </span>
            <span className="text-xs ar-txt-3">Vai junto com a mensagem, no mesmo envio</span>
          </button>
        </>
      )}
    </div>
  );
}

export const ComposerBomDia = ({ aoNotificar }: ComposerBomDiaProps) => {
  const [cfg, setCfg] = useState<ConfigRifas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoSaudacao, setEnviandoSaudacao] = useState(false);
  const [enviandoFollowup, setEnviandoFollowup] = useState(false);

  useEffect(() => {
    carregarConfig()
      .then(setCfg)
      .catch((e) => aoNotificar(`Falha ao carregar: ${e instanceof Error ? e.message : String(e)}`, "error"))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const escolherMidia = async (
    e: ChangeEvent<HTMLInputElement>,
    campo: "bom_dia_midia_saudacao_url" | "bom_dia_midia_followup_url",
    setEnviando: (v: boolean) => void,
  ) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file || !cfg) return;
    setEnviando(true);
    try {
      const url = await subirMidiaBomDia(file);
      setCfg({ ...cfg, [campo]: url });
      aoNotificar("Mídia enviada — clique em Salvar pra confirmar.", "success");
    } catch (e2) {
      aoNotificar(`Falha ao subir mídia: ${e2 instanceof Error ? e2.message : String(e2)}`, "error");
    } finally {
      setEnviando(false);
    }
  };

  const salvar = async () => {
    if (!cfg) return;
    setSalvando(true);
    try {
      await salvarConfig(cfg);
      aoNotificar("Mensagem do bom-dia salva.", "success");
    } catch (e) {
      aoNotificar(`Falha ao salvar: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSalvando(false);
    }
  };

  if (carregando || !cfg) return <p className="text-sm ar-txt-3">Carregando…</p>;

  return (
    <div className="ar-cartao space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="ar-titulo-secao">Mensagem do bom-dia</h3>
        <Botao tamanho="sm" carregando={salvando} onClick={() => void salvar()}>
          Salvar
        </Botao>
      </div>

      <div className="space-y-3">
        <p className="ar-rotulo">☀️ Saudação · 7h</p>
        <AreaTexto
          placeholder={"Oi, bom dia! ☀️ Tudo bem por aí?\nHoje tá rolando a rifa *{{titulo}}* — prêmio: {{premio}}. Quer que eu te mande os detalhes?"}
          dica="Vazio = usa o texto padrão. Placeholders: {{titulo}} {{premio}}"
          value={cfg.bom_dia_mensagem_saudacao ?? ""}
          onChange={(e) => setCfg({ ...cfg, bom_dia_mensagem_saudacao: e.target.value })}
          rows={3}
        />
        <BlocoMidia
          rotulo="Mídia da saudação (opcional)"
          url={cfg.bom_dia_midia_saudacao_url}
          enviando={enviandoSaudacao}
          aoEscolher={(e) => void escolherMidia(e, "bom_dia_midia_saudacao_url", setEnviandoSaudacao)}
          aoRemover={() => setCfg({ ...cfg, bom_dia_midia_saudacao_url: null })}
        />
      </div>

      <div className="ar-divisor" />

      <div className="space-y-3">
        <p className="ar-rotulo">👀 Follow-up · meio-dia, quem não respondeu</p>
        <AreaTexto
          placeholder={"Passando pra te atualizar sobre a rifa *{{titulo}}* 👀\n🏆 Prêmio: {{premio}}\n🔥 {{vendidos}} números já garantidos · restam {{restam}}\n💰 {{preco}} por número\n{{link}}"}
          dica="Vazio = usa o texto padrão. Placeholders: {{titulo}} {{premio}} {{vendidos}} {{restam}} {{preco}} {{link}}"
          value={cfg.bom_dia_mensagem_followup ?? ""}
          onChange={(e) => setCfg({ ...cfg, bom_dia_mensagem_followup: e.target.value })}
          rows={4}
        />
        <BlocoMidia
          rotulo="Mídia do follow-up (opcional — sem ela usa a arte de divulgação da galeria)"
          url={cfg.bom_dia_midia_followup_url}
          enviando={enviandoFollowup}
          aoEscolher={(e) => void escolherMidia(e, "bom_dia_midia_followup_url", setEnviandoFollowup)}
          aoRemover={() => setCfg({ ...cfg, bom_dia_midia_followup_url: null })}
        />
      </div>
    </div>
  );
};
