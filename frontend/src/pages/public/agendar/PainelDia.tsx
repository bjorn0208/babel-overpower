/**
 * Painel do dia selecionado: horários livres (chips) + dados do contato.
 * Aparece ao clicar num dia do calendário. Form curto: motivo, nome, WhatsApp.
 */
import { PpIcone } from "../contrato/PpIcone";

type Props = {
  diaLongo: string;
  slotsDoDia: string[];
  slotSel: string | null;
  onSelecionarSlot: (iso: string) => void;
  nome: string; setNome: (v: string) => void;
  telefone: string; setTelefone: (v: string) => void;
  motivo: string; setMotivo: (v: string) => void;
  enviando: boolean;
  erroEnvio: string | null;
  onConfirmar: () => void;
  horaLegivel: (iso: string) => string;
};

export function PainelDia({
  diaLongo, slotsDoDia, slotSel, onSelecionarSlot,
  nome, setNome, telefone, setTelefone, motivo, setMotivo,
  enviando, erroEnvio, onConfirmar, horaLegivel,
}: Props) {
  if (!slotsDoDia.length) {
    return (
      <div className="pp-dia-vazio pp-fade">
        <PpIcone nome="sparkles" tamanho={22} />
        Escolha um dia destacado no calendário para ver os horários livres.
      </div>
    );
  }

  return (
    <div className="pp-fade">
      <p className="pp-dia-head">{diaLongo}</p>

      <div className="pp-slots">
        {slotsDoDia.map((iso) => (
          <button
            key={iso}
            type="button"
            className={slotSel === iso ? "pp-slot is-on" : "pp-slot"}
            onClick={() => onSelecionarSlot(iso)}
          >
            {horaLegivel(iso)}
          </button>
        ))}
      </div>

      {slotSel && (
        <div className="pp-fade">
          <div className="pp-field">
            <label className="pp-label" htmlFor="ag-motivo">Motivo</label>
            <input
              id="ag-motivo" className="pp-input" value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Sobre o que é a conversa"
            />
          </div>
          <div className="pp-field">
            <label className="pp-label" htmlFor="ag-nome">Seu nome<span className="pp-req">*</span></label>
            <input
              id="ag-nome" className="pp-input" value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como devemos te chamar"
            />
          </div>
          <div className="pp-field">
            <label className="pp-label" htmlFor="ag-tel">WhatsApp (com DDD)</label>
            <input
              id="ag-tel" className="pp-input" type="tel" inputMode="tel" value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(00) 90000-0000"
            />
          </div>

          {erroEnvio && (
            <p style={{ color: "var(--pp-rose)", fontSize: 12.5, margin: "4px 0 0" }}>{erroEnvio}</p>
          )}

          <button
            type="button"
            className="pp-btn pp-btn-primary pp-btn-block"
            style={{ marginTop: 14 }}
            disabled={enviando || !nome.trim()}
            onClick={onConfirmar}
          >
            {enviando ? "Confirmando…" : `Agendar às ${horaLegivel(slotSel)}`}
            <PpIcone nome="chevr" tamanho={14} />
          </button>
        </div>
      )}
    </div>
  );
}
