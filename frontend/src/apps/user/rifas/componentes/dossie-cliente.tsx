/**
 * Dossiê do cliente (Theus 2026-09-02) — "livro da vida": foto grande +
 * nome (estilo tela de info de contato do WhatsApp), linha do tempo de
 * compras/vitórias com data/hora explícita, rifa atual + anteriores,
 * números fixos, dados da compra e comprovantes (cada imagem é um botão
 * com rótulo que abre popup — nunca inline).
 *
 * Arena (2026-09-12): painel escuro `.ar-dossie` (aba-atendimento.css) em vez da
 * folha branca; linha do tempo em `.ar-timeline`, avatar em `.ar-avatar--grande`.
 */

import { useEffect, useState } from "react";
import { Modal } from "./modal";
import { fmtBRL } from "../formato";
import { buscarDossie, ganhouEssePedido, type Dossie, type PedidoDossie } from "../dados-dossie";

export interface DossieClienteProps {
  aberto: boolean;
  aoFechar: () => void;
  leadId: string | null;
  phone: string | null;
}

const iniciais = (nome: string | null) =>
  (nome ?? "")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const ROTULO_STATUS_PEDIDO: Record<string, string> = {
  reservado: "reservou",
  aguardando_validacao: "mandou comprovante — aguardando validação",
  pago: "pagou",
  expirado: "deixou expirar",
  cancelado: "cancelou",
  rejeitado: "teve comprovante rejeitado",
};

interface EventoTimeline {
  id: string;
  rotulo: string;
  dataIso: string;
  vitoria?: boolean;
}

function montarTimeline(pedidos: PedidoDossie[]): EventoTimeline[] {
  const eventos: EventoTimeline[] = [];
  for (const p of pedidos) {
    eventos.push({
      id: `${p.id}-status`,
      rotulo: `${p.nome} ${ROTULO_STATUS_PEDIDO[p.status] ?? p.status} os números *${p.numeros.join(", ")}* na rifa "${p.rifaTitulo}"`,
      dataIso: p.pagoEm ?? p.criadoEm,
    });
    if (ganhouEssePedido(p)) {
      eventos.push({
        id: `${p.id}-vitoria`,
        rotulo: `🏆 Ganhou a rifa "${p.rifaTitulo}" com o número ${p.numeroSorteado}`,
        dataIso: p.pagoEm ?? p.criadoEm,
        vitoria: true,
      });
    }
  }
  return eventos.sort((a, b) => new Date(b.dataIso).getTime() - new Date(a.dataIso).getTime());
}

export const DossieCliente = ({ aberto, aoFechar, leadId, phone }: DossieClienteProps) => {
  const [dados, setDados] = useState<Dossie | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [comprovanteAberto, setComprovanteAberto] = useState<PedidoDossie | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setCarregando(true);
    buscarDossie(leadId, phone)
      .then(setDados)
      .catch(() => setDados(null))
      .finally(() => setCarregando(false));
  }, [aberto, leadId, phone]);

  if (!aberto) return null;

  const timeline = dados ? montarTimeline(dados.pedidos) : [];
  const rifaAtual = dados?.pedidos.find((p) => p.rifaStatus === "ativa");
  const rifasAnteriores = dados ? [...new Map(dados.pedidos.filter((p) => p.rifaStatus !== "ativa").map((p) => [p.rifaId, p])).values()] : [];

  return (
    <div className="ar-dossie-wrap">
      <div className="ar-dossie-fundo" onClick={aoFechar} />
      <div className="ar-dossie">
        <div className="ar-dossie__topo">
          <h3>Dossiê do cliente</h3>
          <button onClick={aoFechar} className="ar-icone-btn" aria-label="Fechar">
            ✕
          </button>
        </div>

        {carregando ? (
          <p className="ar-txt-3 p-6 text-sm">Carregando…</p>
        ) : !dados ? (
          <p className="ar-txt-3 p-6 text-sm">Sem dados desse contato ainda.</p>
        ) : (
          <div className="p-5 space-y-6">
            {/* Cabeçalho — foto grande + nome, estilo info de contato */}
            <div className="flex flex-col items-center text-center gap-2 pt-2">
              <div className="ar-avatar ar-avatar--grande">
                {dados.lead?.fotoUrl ? (
                  <img src={dados.lead.fotoUrl} alt={dados.lead.nome ?? ""} />
                ) : (
                  iniciais(dados.lead?.nome ?? null)
                )}
              </div>
              <p className="ar-txt-1 font-bold text-lg">{dados.lead?.nome || "Contato"}</p>
              {dados.lead?.phone && <p className="ar-num ar-txt-3 text-xs">{dados.lead.phone}</p>}
            </div>

            {/* Linha do tempo */}
            <div>
              <p className="ar-rotulo mb-2">Linha do tempo</p>
              {timeline.length === 0 ? (
                <p className="ar-txt-4 text-sm">Nenhuma compra ainda.</p>
              ) : (
                <ol className="ar-timeline">
                  {timeline.map((ev) => (
                    <li key={ev.id} className="flex items-start gap-2.5">
                      <span
                        className={`ar-timeline__ponto${ev.vitoria ? " ar-timeline__ponto--vitoria" : ""}`}
                        aria-hidden="true"
                      />
                      <div>
                        <p className="ar-txt-2 text-sm">{ev.rotulo}</p>
                        <p className="ar-txt-4 text-xs">{fmtDataHora(ev.dataIso)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Rifa atual + anteriores */}
            <div>
              <p className="ar-rotulo mb-2">Rifas</p>
              {rifaAtual && (
                <p className="ar-txt-2 text-sm mb-1">
                  🎯 Participando agora: <strong className="ar-txt-1">{rifaAtual.rifaTitulo}</strong> {rifaAtual.rifaCodigo && <span className="ar-num ar-txt-4 text-xs">({rifaAtual.rifaCodigo})</span>}
                </p>
              )}
              {rifasAnteriores.length > 0 && (
                <div className="ar-txt-3 text-sm space-y-0.5">
                  {rifasAnteriores.map((p) => (
                    <p key={p.rifaId}>· {p.rifaTitulo} {p.rifaCodigo && <span className="ar-num ar-txt-4 text-xs">({p.rifaCodigo})</span>}</p>
                  ))}
                </div>
              )}
              {!rifaAtual && rifasAnteriores.length === 0 && <p className="ar-txt-4 text-sm">Nenhuma rifa ainda.</p>}
            </div>

            {/* Números fixos */}
            {dados.numerosFixos.length > 0 && (
              <div>
                <p className="ar-rotulo mb-2">Números fixos</p>
                <div className="ar-txt-2 text-sm space-y-0.5">
                  {dados.numerosFixos.map((f, i) => (
                    <p key={i}>· {f.metodoSorteio}: número {f.numero}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Dados preenchidos + comprovantes */}
            <div>
              <p className="ar-rotulo mb-2">Pedidos e comprovantes</p>
              <div className="space-y-2">
                {dados.pedidos.map((p) => (
                  <div key={p.id} className="ar-cartao ar-cartao--compacto text-sm">
                    <p className="ar-txt-1 font-medium">{p.rifaTitulo} — {fmtBRL(p.valorCentavos)}</p>
                    <p className="ar-txt-3 text-xs">Nome informado: {p.nome} · números {p.numeros.join(", ")}</p>
                    {p.comprovanteUrl && (
                      <button
                        onClick={() => setComprovanteAberto(p)}
                        className="ar-link mt-1.5 text-xs font-semibold"
                      >
                        🧾 Ver comprovante — {p.rifaTitulo}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal aberto={!!comprovanteAberto} aoFechar={() => setComprovanteAberto(null)} titulo={`Comprovante — ${comprovanteAberto?.rifaTitulo ?? ""}`} tamanho="md">
        {comprovanteAberto?.comprovanteUrl && (
          <img src={comprovanteAberto.comprovanteUrl} alt="Comprovante" className="ar-comprovante" />
        )}
      </Modal>
    </div>
  );
};
