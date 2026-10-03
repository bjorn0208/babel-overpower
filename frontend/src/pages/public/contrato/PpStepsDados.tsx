/**
 * PpStepsDados — steps de identificação e leitura do contrato.
 */

import { PpIcone } from "./PpIcone";
import { PpDocumento } from "./PpDocumento";
import { documentoValido, formatarDocumento, sociosValidos, type TipoDocumento } from "./helpers";
import { PpListaSocios } from "./PpListaSocios";
import type { DadosContrato, EscolhaPagamento } from "./tipos";

/* =========================================================================
   Step: Identificação
   ========================================================================= */

// Tokens internos da plataforma — preenchidos automaticamente (ex: a data da
// assinatura é cravada no momento que a pessoa assina, via hidratarCampos + a
// RPC assinar_contrato_publico). Nunca devem virar campo do formulário do
// signatário, mesmo que o template ainda os liste em campos_obrigatorios/cliente.
const TOKENS_INTERNOS_CONTRATO = new Set(["data_assinatura"]);

// Ordem canônica dos campos no formulário (campos fora da lista vão pro fim,
// mantendo a ordem do template).
const ORDEM_CAMPOS = ["nome_completo", "cpf", "telefone", "email", "endereco"];

export function StepDados({
  contrato,
  dados,
  setDados,
  onAvancar,
}: {
  contrato: DadosContrato;
  dados: Record<string, string>;
  setDados: (v: Record<string, string>) => void;
  onAvancar: () => void;
}) {
  // Campos do formulário derivados do template (contratos_template.campos_cliente,
  // exposto via placeholders pela RPC). Formato v2: {slug,rotulo,tipo,obrigatorio}.
  // Tolera formato legado {nome,descricao}. Só cai no fallback fixo se o
  // template não definir campo nenhum.
  const brutos = contrato.placeholders ?? [];
  const campos =
    brutos.length > 0
      ? brutos
          .map((c) => {
            const slug = (c.slug ?? c.nome ?? "").trim();
            return {
              slug,
              rotulo: c.rotulo ?? c.descricao ?? slug.replaceAll("_", " "),
              tipo: c.tipo,
              obrigatorio: c.obrigatorio !== false,
            };
          })
          .filter((c) => c.slug.length > 0 && !TOKENS_INTERNOS_CONTRATO.has(c.slug))
      : [
          { slug: "nome_completo", rotulo: "Nome completo", tipo: "texto", obrigatorio: true },
          { slug: "cpf", rotulo: "CPF", tipo: "cpf", obrigatorio: true },
          { slug: "telefone", rotulo: "Telefone (com DDD)", tipo: "telefone", obrigatorio: true },
          { slug: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true },
        ];

  const ordenado = [...campos].sort(
    (a, b) =>
      (ORDEM_CAMPOS.indexOf(a.slug) + 1 || 999) - (ORDEM_CAMPOS.indexOf(b.slug) + 1 || 999),
  );
  const obrigatorios = ordenado.filter((c) => c.obrigatorio);
  const opcionais = ordenado.filter((c) => !c.obrigatorio);

  // Campo de documento (slug/tipo `cpf`): o contratante escolhe CPF ou CNPJ.
  // O número continua no slug do template; o tipo vai em `tipo_documento`.
  const ehDocumento = (c: { slug: string; tipo?: string }) =>
    c.slug === "cpf" || c.tipo === "cpf";
  const tipoDoc: TipoDocumento = dados.tipo_documento === "CNPJ" ? "CNPJ" : "CPF";
  const ehSocios = (c: { slug: string; tipo?: string }) => c.slug === "socios_adicionais";
  const temSocios = tipoDoc === "CNPJ" && ordenado.some(ehSocios);
  const obrigatoriosSemSocios = obrigatorios.filter((c) => !ehSocios(c));
  const opcionaisSemSocios = opcionais.filter((c) => !ehSocios(c));

  const valido =
    obrigatoriosSemSocios.every((c) =>
      ehDocumento(c)
        ? documentoValido(tipoDoc, dados[c.slug] ?? "")
        : (dados[c.slug] ?? "").trim().length > 1
    ) && (!temSocios || sociosValidos(dados));

  function setCampo(slug: string, valor: string) {
    setDados({ ...dados, [slug]: valor });
  }

  function trocarTipoDoc(slug: string, tipo: TipoDocumento) {
    if (tipo === tipoDoc) return;
    const proximo = { ...dados, tipo_documento: tipo, [slug]: "" };
    if (tipo === "CPF") {
      for (const chave of Object.keys(proximo)) {
        if (/^socio_\d+_/.test(chave) || chave === "socios_adicionais") delete proximo[chave];
      }
    }
    setDados(proximo);
  }

  function rotuloDe(c: { slug: string; rotulo: string; tipo?: string }): string {
    if (ehDocumento(c)) return tipoDoc;
    if (c.slug === "nome_completo" && tipoDoc === "CNPJ") return "Razão social";
    return c.rotulo;
  }

  function renderCampo(
    c: { slug: string; rotulo: string; tipo?: string },
    obrigatorio: boolean,
  ) {
    const rotulo = rotuloDe(c);
    const doc = ehDocumento(c);
    const valor = dados[c.slug] ?? "";
    const completo = valor.replace(/\D/g, "").length === (tipoDoc === "CPF" ? 11 : 14);
    return (
      <div className="pp-field" key={c.slug}>
        <label className="pp-label">
          {doc ? "Documento" : rotulo}
          {obrigatorio && <span className="pp-req">*</span>}
        </label>
        {doc && (
          <div className="pp-seg" role="radiogroup" aria-label="Tipo de documento">
            {(["CPF", "CNPJ"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tipoDoc === t}
                className={`pp-seg-btn${tipoDoc === t ? " is-on" : ""}`}
                onClick={() => trocarTipoDoc(c.slug, t)}
              >
                {t === "CPF" ? "CPF · pessoa física" : "CNPJ · empresa"}
              </button>
            ))}
          </div>
        )}
        <input
          className="pp-input"
          type={doc ? "text" : tipoInput(c.tipo)}
          inputMode={doc ? "numeric" : undefined}
          value={valor}
          onChange={(e) =>
            setCampo(c.slug, doc ? formatarDocumento(tipoDoc, e.target.value) : e.target.value)
          }
          placeholder={
            doc
              ? tipoDoc === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"
              : `Digite ${rotulo.toLowerCase()}`
          }
        />
        {doc && completo && !documentoValido(tipoDoc, valor) && (
          <div className="pp-erro-campo">{tipoDoc} inválido. Confira os números.</div>
        )}
      </div>
    );
  }

  function tipoInput(tipo?: string): string {
    if (tipo === "email") return "email";
    if (tipo === "telefone") return "tel";
    if (tipo === "data") return "date";
    if (tipo === "numero") return "number";
    return "text";
  }

  return (
    <div className="pp-fade">
      <div className="pp-step-icon">
        <PpIcone nome="id" tamanho={20} />
      </div>
      <h2 className="pp-step-title">Seus dados</h2>
      <p className="pp-step-sub">
        Preencha as informações abaixo. Elas vão ser inseridas no seu contrato
        — confira antes de assinar.
      </p>

      {obrigatoriosSemSocios.map((c) => renderCampo(c, true))}

      {temSocios && <PpListaSocios dados={dados} setDados={setDados} />}

      {opcionaisSemSocios.length > 0 && (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--pp-ink-4)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              margin: "18px 0 8px",
            }}
          >
            Opcional
          </div>
          {opcionaisSemSocios.map((c) => renderCampo(c, false))}
        </>
      )}

      <div className="pp-actions">
        <button
          className="pp-btn pp-btn-primary pp-btn-block"
          type="button"
          onClick={onAvancar}
          disabled={!valido}
        >
          Continuar <PpIcone nome="chevr" tamanho={14} />
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   Step: Leitura do contrato (preview)
   ========================================================================= */
export function StepContrato({
  contrato,
  dados,
  escolha,
  onAvancar,
  onVoltar,
}: {
  contrato: DadosContrato;
  dados: Record<string, string>;
  escolha: EscolhaPagamento | null;
  onAvancar: () => void;
  onVoltar: () => void;
}) {
  return (
    <div className="pp-fade">
      <div className="pp-doc-header">
        <div className="pp-step-icon">
          <PpIcone nome="doc" tamanho={22} />
        </div>
        <h2 className="pp-step-title">Leia o seu contrato</h2>
        <p className="pp-step-sub">
          Confira com calma. Seus dados e a forma de pagamento escolhida já
          estão aplicados.
        </p>
      </div>

      <div className="pp-doc-open">
        <PpDocumento contrato={contrato} dados={dados} escolha={escolha} />
      </div>

      <div className="pp-actions" style={{ marginTop: 24 }}>
        <button className="pp-btn pp-btn-ghost" type="button" onClick={onVoltar}>
          <PpIcone nome="chevl" tamanho={14} /> Voltar
        </button>
        <button className="pp-btn pp-btn-primary" type="button" onClick={onAvancar}>
          Eu li e concordo <PpIcone nome="chevr" tamanho={14} />
        </button>
      </div>
    </div>
  );
}
