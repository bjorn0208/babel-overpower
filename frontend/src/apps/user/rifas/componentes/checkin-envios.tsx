/**
 * Check-in de entrega do ritual bom-dia (Theus 2026-09-02) — mostra, por
 * contato, se a saudação (07h) e o followup (12h) de HOJE foram enfileirados
 * com sucesso ou falharam. Só mostra status, zero ação automática em falha
 * (decisão do Theus — ele decide manualmente o que fazer com quem falhou).
 */

import { useEffect, useState } from "react";
import { Check, Hourglass, X } from "lucide-react";
import { listarCheckinHoje, type CheckinContato } from "../dados-checkin";
import "../abas/aba-disparo.css";

const MarcaEtapa = ({ status }: { status: "sucesso" | "erro" | null }) => {
  if (status === "sucesso")
    return (
      <span style={{ color: "var(--ar-ok)" }} title="Enfileirado com sucesso" aria-label="enfileirado">
        <Check size={15} />
      </span>
    );
  if (status === "erro")
    return (
      <span style={{ color: "var(--ar-erro)" }} title="Falhou" aria-label="falhou">
        <X size={15} />
      </span>
    );
  return (
    <span className="ar-txt-4" title="Ainda não passou por essa etapa hoje" aria-label="ainda não">
      <Hourglass size={14} />
    </span>
  );
};

export const CheckinEnvios = () => {
  const [linhas, setLinhas] = useState<CheckinContato[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    listarCheckinHoje()
      .then(setLinhas)
      .catch(() => setLinhas([]))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) return <p className="text-sm ar-txt-3">Carregando check-in…</p>;
  if (linhas.length === 0) return <p className="text-sm ar-txt-3">Ninguém foi saudado hoje ainda.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs ar-txt-4">
        Verde = enfileirado com sucesso · vermelho = falhou · ampulheta = ainda não chegou a etapa.
        Não confirma que a pessoa LEU a mensagem — só que o envio foi processado sem erro.
      </p>

      <div className="ar-cartao ar-cartao--compacto">
        <div className="ar-lista ard-rolavel max-h-72">
          {linhas.map((l) => (
            <div key={l.id} className="ar-linha">
              <span className="font-medium ar-txt-1 truncate flex-1">
                {l.nome || l.phone || "Contato"}
              </span>
              <span
                className="inline-flex items-center gap-1.5 shrink-0"
                title={l.erroSaudacao ?? undefined}
              >
                <span className="ar-rotulo">07h</span>
                <MarcaEtapa status={l.statusSaudacao} />
              </span>
              <span
                className="inline-flex items-center gap-1.5 shrink-0"
                title={l.erroFollowup ?? undefined}
              >
                <span className="ar-rotulo">12h</span>
                <MarcaEtapa status={l.statusFollowup} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
