/**
 * Tabela "Funcionários da implementação" / "Programadores" — artefato `painelFuncionarios` :2156-2178.
 * Sem ela não havia como editar, inativar ou excluir quem já estava cadastrado (REVISAO-ABAS-OPERACAO I27/P21/C2).
 *
 * "Editar" abre o mesmo `ModalFuncionario` do cadastro. PENDÊNCIA DE BANCO: a RLS só deixa o admin gravar em
 * `gestao_funcionarios` (MIGRACAO-RASCUNHO.sql, funcionarios_ins/upd); no artefato, todo papel da aba grava.
 * Por isso o botão só aparece para quem o banco deixa gravar — a lista, todos veem.
 */

import { useState } from "react";
import { abertosPorPessoa } from "./logica-atendimento";
import { waLink } from "./logica-indicacao";
import { ModalFuncionario } from "./modais-cadastro";
import type { Dados, Funcionario, PropsAba, ToastApi } from "./tipos";
import { BotaoAcao, Selo } from "./ui-gestao";

export function PainelFuncionarios({
  area,
  dados,
  podeEditar,
  t,
  recarregar,
}: {
  area: "implementacao" | "programador";
  dados: Dados;
  podeEditar: boolean;
  t: ToastApi;
  recarregar: PropsAba["recarregar"];
}) {
  const [editando, setEditando] = useState<Funcionario | null>(null);
  const ehProg = area === "programador";
  const lista = dados.funcionarios
    .filter((f) => (f.area === "programador" ? "programador" : "implementacao") === area)
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const abertos = abertosPorPessoa(dados.implementacoes, ehProg ? "programador" : "responsavel");

  return (
    <div className="os-card" style={{ padding: 18, marginTop: 16 }}>
      <div className="row gap-2" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
        <div className="h3">{ehProg ? "Programadores" : "Funcionários da implementação"}</div>
        <span className="muted tiny">
          {ehProg
            ? "Quem pode assumir a parte do programador."
            : "Quem pode ser responsável pelo atendimento e pelas reuniões."}
        </span>
      </div>
      {lista.length === 0 ? (
        <p className="muted small" style={{ marginTop: 8 }}>
          {ehProg ? "Nenhum programador cadastrado." : "Nenhum funcionário cadastrado."}
        </p>
      ) : (
        <div style={{ marginTop: 10, overflow: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Nome</th>
                <th style={{ textAlign: "left" }}>Função</th>
                <th style={{ textAlign: "left" }}>Contato</th>
                <th style={{ textAlign: "right" }}>Clientes em aberto</th>
                <th style={{ textAlign: "right" }} />
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => {
                const wa = waLink(f.whatsapp);
                return (
                  <tr key={f.id}>
                    <td>
                      <div className="small">{f.nome}</div>
                      {f.ativo === false && <Selo>Inativo</Selo>}
                    </td>
                    <td className="small">{f.cargo || "—"}</td>
                    <td className="small">
                      {f.whatsapp ? (
                        wa ? (
                          <a className="fmt-link" href={wa} target="_blank" rel="noopener noreferrer">
                            {f.whatsapp}
                          </a>
                        ) : (
                          f.whatsapp
                        )
                      ) : (
                        "—"
                      )}
                      {f.email && (
                        <div>
                          <a className="fmt-link" href={`mailto:${f.email}`}>{f.email}</a>
                        </div>
                      )}
                    </td>
                    <td className="small mono" style={{ textAlign: "right" }}>
                      {abertos[f.nome] ?? 0}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {podeEditar && <BotaoAcao onClick={() => setEditando(f)}>Editar</BotaoAcao>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editando && (
        <ModalFuncionario
          funcionario={editando}
          areaPadrao={area}
          dados={dados}
          t={t}
          recarregar={recarregar}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
