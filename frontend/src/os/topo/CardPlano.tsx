/**
 * Pílula de status do plano (conversas, dias) no topo. Quando clicada, abre um
 * modal centralizado (fundo desfocado) com a identidade da conta (foto do usuário
 * + logo da empresa), o uso do plano e dois caminhos: renovar o plano atual
 * (anexando comprovante → vai pro financeiro) ou ir pra Loja escolher outro.
 *
 * Era CardPlanoConversas em bundle.jsx:419-477.
 *
 * Refatoração aplicada (auditoria barra-superior 2026-05-13):
 *  - role="dialog" + aria-modal + aria-labelledby + Escape pra fechar
 *  - aria-expanded no trigger
 *  - aria-label dinâmico no trigger
 *
 * Painel rico + renovação (2026-05-23): cabeçalho com fotos reais (lazy via
 * useDadosPlano), miolo em PainelPlanoConteudo, renovar com comprovante em
 * ModalRenovarPlano. Modal central (não mais popover ancorado, que saía da tela).
 */

import { useEffect, useId, useRef, useState } from "react";
import { useDadosPlano } from "./useDadosPlano";
import { ModalCentral } from "./ModalCentral";
import { PainelPlanoConteudo } from "./PainelPlanoConteudo";
import { ModalRenovarPlano } from "./ModalRenovarPlano";

export interface PlanoUso {
  plano_nome: string;
  status: string;
  conversas_usadas: number;
  max_conversas: number;
  dias_ate_expirar: number;
  data_expiracao: string;
}

interface CardPlanoProps {
  plano: PlanoUso;
  onAbrirLoja: () => void;
}

export function CardPlano({ plano, onAbrirLoja }: CardPlanoProps) {
  const [aberto, setAberto] = useState(false);
  const [renovando, setRenovando] = useState(false);
  const refTrigger = useRef<HTMLButtonElement>(null);
  const refPrimeiroFoco = useRef<HTMLButtonElement>(null);
  const tituloId = useId();

  const dados = useDadosPlano(aberto || renovando);

  // Escape fecha + restaura foco no trigger
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setAberto(false);
        refTrigger.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto]);

  // Focus inicial no botão primário quando abre
  useEffect(() => {
    if (aberto) {
      requestAnimationFrame(() => refPrimeiroFoco.current?.focus());
    }
  }, [aberto]);

  const dias = plano.dias_ate_expirar;
  const cor =
    dias < 7
      ? "oklch(0.82 0.20 25)"
      : dias <= 14
        ? "oklch(0.88 0.18 80)"
        : "oklch(0.85 0.18 145)";
  const dotCor =
    dias < 7
      ? "oklch(0.65 0.24 25)"
      : dias <= 14
        ? "oklch(0.78 0.18 80)"
        : "oklch(0.72 0.18 145)";
  const abrirLoja = () => {
    setAberto(false);
    try {
      onAbrirLoja();
    } catch (e) {
      console.error("[CardPlano] falha ao abrir loja:", e);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={refTrigger}
        className="bar-cluster"
        onClick={() => setAberto((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={`Plano ${plano.plano_nome}: ${plano.conversas_usadas} de ${plano.max_conversas} conversas atendidas neste mês, plano renova em ${dias} dias. Clique para ver detalhes.`}
        style={{ cursor: "pointer", padding: "5px 12px", color: cor }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: dotCor,
            boxShadow: `0 0 6px ${dotCor}`,
          }}
        />
        <span style={{ fontWeight: 600 }}>{plano.plano_nome}</span>
        <span className="sep" aria-hidden="true" />
        <span className="mono" style={{ fontWeight: 600 }}>
          {plano.conversas_usadas}/{plano.max_conversas}
        </span>
        <span className="sep" aria-hidden="true" />
        <span className="mono">{dias}d</span>
      </button>

      {aberto && (
        <ModalCentral
          onClose={() => setAberto(false)}
          width={560}
          ariaLabelledby={tituloId}
        >
          <PainelPlanoConteudo
            plano={plano}
            dados={dados}
            tituloId={tituloId}
            cor={cor}
            refPrimeiroFoco={refPrimeiroFoco}
            onRenovar={() => {
              setAberto(false);
              setRenovando(true);
            }}
            onAbrirLoja={abrirLoja}
          />
        </ModalCentral>
      )}

      {renovando && (
        <ModalRenovarPlano
          planoNome={plano.plano_nome}
          planoId={dados.planoId}
          preco={dados.preco}
          pix={dados.pix}
          onClose={() => setRenovando(false)}
        />
      )}
    </div>
  );
}
