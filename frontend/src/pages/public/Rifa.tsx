/**
 * Página pública da rifa.
 *
 * URL: /rifa/:chave
 * App.tsx importa: import RifaPublica from "@/pages/public/Rifa"
 *
 * Orquestrador fino. Telas em `rifa/`: VitrineRifa (prêmio, progresso, promoções,
 * cotas, ranking, resultado), CompraRifa (números + dados) e PedidoRifa
 * (PIX + comprovante + status). Visual "Arena" próprio (`arp-*`), escuro —
 * não usa mais o design system claro da página de contrato.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { useRifaPublica } from "./rifa/use-rifa-publica";
import { VitrineRifa } from "./rifa/VitrineRifa";
import { CompraRifa, PedidoRifa } from "./rifa/CompraRifa";
import "./rifa/arena-publica.css";

type Tela = "vitrine" | "compra" | "pedido";

/* Tela de carregamento inicial */
function ArpCarregando() {
  return (
    <div className="arp-app">
      <div className="arp-estado">
        <div className="arp-spinner" role="status" aria-label="Carregando" />
      </div>
    </div>
  );
}

/* Tela de erro (rifa não encontrada, link inválido etc.) */
function ArpErro({ mensagem }: { mensagem: string }) {
  return (
    <div className="arp-app">
      <div className="arp-estado">
        <div className="arp-estado__caixa">
          <h1>Algo não bate</h1>
          <p className="arp-estado__texto">{mensagem}</p>
        </div>
      </div>
    </div>
  );
}

export default function RifaPublica() {
  const { chave } = useParams<{ chave: string }>();

  const {
    dados,
    carregando,
    erro,
    pedido,
    pedidoToken,
    reservar,
    uploadComprovante,
    enviarComprovante,
    novaCompra,
  } = useRifaPublica(chave);

  const [tela, setTela] = useState<Tela>("vitrine");

  // Reabriu o link com pedido em aberto (reservado/validação)? Cai direto no pedido.
  useEffect(() => {
    if (pedido && (pedido.status === "reservado" || pedido.status === "aguardando_validacao")) {
      setTela("pedido");
    }
  }, [pedido]);

  if (carregando) return <ArpCarregando />;
  if (erro || !dados) return <ArpErro mensagem={erro ?? "Rifa não encontrada."} />;

  const nomeEmpresa = dados.branding?.nome ?? dados.rifa.titulo;
  const logoUrl = dados.branding?.logo_url ?? null;

  return (
    <div className="arp-app">
      <header className="arp-topo">
        {logoUrl ? (
          <img className="arp-topo__logo" src={logoUrl} alt="" />
        ) : (
          <div className="arp-topo__inicial" aria-hidden="true">
            {nomeEmpresa.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="arp-topo__eyebrow">Rifa</div>
          <div className="arp-topo__nome truncate">{nomeEmpresa}</div>
        </div>
      </header>

      {dados.branding?.banner_url && (
        <div className="arp-banner">
          <img src={dados.branding.banner_url} alt="" />
        </div>
      )}

      <main className="arp-main">
        <div className="arp-fade" key={tela}>
          {tela === "vitrine" && (
            <VitrineRifa
              dados={dados}
              temPedido={Boolean(pedidoToken && pedido)}
              onComprar={() => setTela("compra")}
              onVerPedido={() => setTela("pedido")}
            />
          )}
          {tela === "compra" && (
            <div className="arp-conteudo pt-5">
              <CompraRifa
                dados={dados}
                pedidoAberto={
                  pedido && (pedido.status === "reservado" || pedido.status === "rejeitado")
                    ? { nome: pedido.nome, phone: pedido.phone, numeros: pedido.numeros }
                    : null
                }
                onReservar={async (nome, phone, qtd, numeros) => {
                  // Pedido reservado/rejeitado em aberto → soma nele (mesmo PIX).
                  // Pago/expirado (via "Comprar mais números") já veio com token
                  // limpo pelo novaCompra() — abre pedido novo de propósito.
                  const juntarToken =
                    pedido && (pedido.status === "reservado" || pedido.status === "rejeitado")
                      ? pedidoToken
                      : null;
                  const msg = await reservar(nome, phone, qtd, numeros, juntarToken);
                  if (!msg) setTela("pedido");
                  return msg;
                }}
                onVoltar={() => setTela("vitrine")}
              />
            </div>
          )}
          {tela === "pedido" && pedido && (
            <div className="arp-conteudo pt-5">
              <PedidoRifa
                pedido={pedido}
                onEnviarComprovante={enviarComprovante}
                onUpload={uploadComprovante}
                onNovaCompra={() => {
                  novaCompra();
                  setTela("compra");
                }}
                onAdicionarMais={() => setTela("compra")}
                onVoltarVitrine={() => setTela("vitrine")}
              />
            </div>
          )}
          {tela === "pedido" && !pedido && (
            <div className="arp-estado">
              <div className="arp-spinner" role="status" aria-label="Carregando pedido" />
            </div>
          )}
        </div>
      </main>

      <footer className="arp-rodape">
        <span>{nomeEmpresa}</span>
        <span className="arp-num">ID {(chave ?? "").slice(0, 12)}</span>
      </footer>
    </div>
  );
}
