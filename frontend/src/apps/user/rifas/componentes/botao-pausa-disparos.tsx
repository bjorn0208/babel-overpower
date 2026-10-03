/**
 * Freio de mão dos disparos — para tudo que está saindo, do manual ao cron.
 *
 * O worker relê `rifas_config_tenant.disparos_pausados` antes de CADA envio.
 * Como ele dorme 20-90s entre mensagens, apertar aqui para na próxima — não
 * cancela a que já foi pro ar, e é isso que o texto do botão promete.
 *
 * Visual Arena: parar é vermelho (`perigo`), retomar é neutro (`secundario`).
 * O estado de agora fica num `Selo`, não na cor do botão.
 */

import { useCallback, useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Botao } from "./botao";
import { Selo } from "./basicos";
import { definirPausaDisparos, lerConfigDisparo } from "../dados-disparos";

export interface BotaoPausaDisparosProps {
  aoNotificar: (mensagem: string, tipo?: "info" | "success" | "error") => void;
  /** Avisa o pai pra ele reavaliar os botões de disparo. */
  aoMudar?: (pausado: boolean) => void;
}

export const BotaoPausaDisparos = ({ aoNotificar, aoMudar }: BotaoPausaDisparosProps) => {
  const [pausado, setPausado] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    lerConfigDisparo()
      .then((c) => setPausado(c.pausados))
      .catch(() => setPausado(false));
  }, []);

  // Relê sozinho: a pausa pode ter sido ligada em outra aba ou por outra
  // pessoa da equipe, e um freio que mente sobre o próprio estado é pior
  // que não ter freio.
  useEffect(() => {
    carregar();
    const id = setInterval(carregar, 10_000);
    return () => clearInterval(id);
  }, [carregar]);

  const alternar = async () => {
    const novo = !pausado;
    setSalvando(true);
    try {
      await definirPausaDisparos(novo);
      setPausado(novo);
      aoMudar?.(novo);
      aoNotificar(
        novo
          ? "Envios pausados. O que já saiu não volta; o próximo não sai."
          : "Envios liberados.",
        novo ? "info" : "success",
      );
    } catch (e) {
      aoNotificar(
        `Não consegui mudar a pausa: ${e instanceof Error ? e.message : String(e)}`,
        "error",
      );
    } finally {
      setSalvando(false);
    }
  };

  if (pausado === null) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Botao
        tamanho="sm"
        variante={pausado ? "secundario" : "perigo"}
        carregando={salvando}
        onClick={() => void alternar()}
      >
        {pausado ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
        {pausado ? "Liberar envios" : "Pausar tudo"}
      </Botao>

      <Selo variante={pausado ? "alerta" : "sucesso"} ponto>
        {pausado ? "Envios pausados" : "Envios liberados"}
      </Selo>

      {pausado && (
        <span className="text-sm ar-txt-3">Nada sai enquanto estiver assim.</span>
      )}
    </div>
  );
};
