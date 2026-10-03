import { useEffect, useMemo, useRef, useState } from "react";
import {
  CAMPOS_PRODUTO, CAMPOS_TELA, SECOES, VALORES_VAZIOS, aplicarMascara, campoRespondido, campoVisivel,
  chaveCampoProduto, mascararTelefone, novoProduto, placeholderDe, produtoVazio, somenteDigitos, validar,
  validarProdutos,
  type Campo, type Produto, type Valores,
} from "./campos";

/** Como a pessoa escolheu terminar o formulário. Vai pra planilha como texto. */
export type MetodoConexao = "qr" | "codigo" | "sem";

type Props = {
  chaveRascunho: string;
  /** null = parado; senão, o método que está sendo enviado agora */
  enviando: MetodoConexao | null;
  erroEnvio?: string;
  onEnviar: (valores: Valores, produtos: Produto[], metodo: MetodoConexao, aceite: boolean) => void;
};

const ACEITE_TEXTO =
  "Autorizo a Babel a usar as informações deste formulário e, se eu conectar um WhatsApp, o histórico de conversas " +
  "desse número exclusivamente para entender como a minha empresa trabalha e configurar o atendimento, conforme a LGPD.";

function lerRascunho(chave: string): Valores {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return VALORES_VAZIOS;
    const salvo = JSON.parse(bruto) as Valores;
    return { ...VALORES_VAZIOS, ...salvo };
  } catch {
    return VALORES_VAZIOS;
  }
}

function lerRascunhoProdutos(chave: string): Produto[] {
  try {
    const bruto = localStorage.getItem(`${chave}:produtos`);
    const salvos = bruto ? (JSON.parse(bruto) as Produto[]) : [];
    if (Array.isArray(salvos) && salvos.length) return salvos.map((p) => ({ ...novoProduto(p.valores), id: p.id }));
  } catch { /* rascunho ilegível: começa do zero */ }
  return [novoProduto()];
}

export function Formulario({ chaveRascunho, enviando, erroEnvio, onEnviar }: Props) {
  const [valores, setValores] = useState<Valores>(() => lerRascunho(chaveRascunho));
  const [produtos, setProdutos] = useState<Produto[]>(() => lerRascunhoProdutos(chaveRascunho));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [aceite, setAceite] = useState(false);
  const tocouRef = useRef(false);

  useEffect(() => {
    if (!tocouRef.current) return;
    try { localStorage.setItem(chaveRascunho, JSON.stringify(valores)); } catch { /* sem storage */ }
  }, [valores, chaveRascunho]);

  useEffect(() => {
    if (!tocouRef.current) return;
    try { localStorage.setItem(`${chaveRascunho}:produtos`, JSON.stringify(produtos)); } catch { /* sem storage */ }
  }, [produtos, chaveRascunho]);

  function mudar(chave: string, valor: string | string[]) {
    tocouRef.current = true;
    setValores((v) => ({ ...v, [chave]: valor }));
    limparErro(chave);
  }

  function limparErro(chave: string) {
    if (tentouEnviar) setErros((e) => { const { [chave]: _, ...resto } = e; return resto; });
  }

  function mudarProdutos(atualizar: (lista: Produto[]) => Produto[]) {
    tocouRef.current = true;
    setProdutos(atualizar);
  }

  const visiveis = useMemo(() => CAMPOS_TELA.filter((c) => campoVisivel(c, valores)), [valores]);
  const camposProdutos = produtos.flatMap((p) => CAMPOS_PRODUTO.filter((c) => campoVisivel(c, p.valores)).map((c) => ({ c, p })));
  const totalPerguntas = visiveis.length + camposProdutos.length;
  const respondidos = visiveis.filter((c) => campoRespondido(c, valores)).length
    + camposProdutos.filter(({ c, p }) => campoRespondido(c, p.valores)).length;
  const secoesFeitas = new Set(
    SECOES.filter((s) => (s.id === "produtos" && produtos.some((p) => !produtoVazio(p)))
      || visiveis.filter((c) => c.secao === s.id).some((c) => campoRespondido(c, valores))).map((s) => s.id),
  );

  function tentar(metodo: MetodoConexao) {
    setTentouEnviar(true);
    const problemas = { ...validar(valores), ...validarProdutos(produtos) };
    setErros(problemas);
    const primeiro = Object.keys(problemas)[0];
    if (primeiro) {
      document.getElementById(`campo-${primeiro}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onEnviar(valores, produtos.filter((p) => !produtoVazio(p)), metodo, aceite);
  }

  const ocupado = enviando !== null;
  const travado = ocupado || !aceite;

  return (
    <div className="form-wrap">
      <aside className="rail" aria-label="Seções">
        <Marca />
        {SECOES.map((s, i) => (
          <a key={s.id} href={`#secao-${s.id}`} className={secoesFeitas.has(s.id) ? "feito" : ""}>
            <b>{i + 1}</b> {s.titulo}
          </a>
        ))}
        <div className="prog">
          {respondidos} de {totalPerguntas} respondidas{tocouRef.current ? " · rascunho salvo" : ""}
          <div><i style={{ width: `${Math.round((respondidos / totalPerguntas) * 100)}%` }}></i></div>
        </div>
      </aside>

      <form
        className="form-col"
        noValidate
        onSubmit={(e) => { e.preventDefault(); tentar("qr"); }}
      >
        <div className="cabeca">
          <div className="eyebrow">Levantamento de clientes Babel</div>
          <h1>Conta pra <em>Babel</em> como é o seu negócio</h1>
          <p>
            Leva de 20 a 30 minutos, dependendo de quantos produtos você cadastrar. Suas respostas ficam salvas neste
            navegador enquanto você preenche. No final, você tem a opção de conectar um WhatsApp da empresa para a Babel
            aprender como vocês trabalham, atendem e dão suporte. Não precisa ser o mesmo número que o agente vai usar.
          </p>
        </div>

        {SECOES.map((s, i) => {
          const campos = visiveis.filter((c) => c.secao === s.id);
          return (
            <section className="secao" id={`secao-${s.id}`} key={s.id}>
              <header>
                <b>{String(i + 1).padStart(2, "0")}</b>
                <h2>{s.titulo}</h2>
                {s.nota && <small>{s.nota}</small>}
              </header>
              {s.aviso && <p className="secao-aviso">{s.aviso}</p>}
              {campos.length > 0 && (
                <div className="grid">
                  {campos.map((c) => (
                    <CampoInput
                      key={c.chave}
                      campo={c}
                      valor={valores[c.chave]}
                      erro={erros[c.chave]}
                      placeholder={placeholderDe(c, valores)}
                      onChange={(v) => mudar(c.chave, v)}
                    />
                  ))}
                </div>
              )}
              {s.id === "produtos" && (
                <ListaProdutos produtos={produtos} valores={valores} erros={erros} onMudar={mudarProdutos} onLimparErro={limparErro} />
              )}
              {s.id === "observacoes" && (
                <AreaEnvio
                  aceite={aceite}
                  onAceite={setAceite}
                  travado={travado}
                  enviando={enviando}
                  erroEnvio={erroEnvio}
                  faltando={tentouEnviar ? Object.keys(erros).length : 0}
                  onEnviar={tentar}
                />
              )}
            </section>
          );
        })}
      </form>
    </div>
  );
}

/** Aceite de dados + os três jeitos de terminar (QR, código, sem conectar). */
function AreaEnvio({ aceite, onAceite, travado, enviando, erroEnvio, faltando, onEnviar }: {
  aceite: boolean;
  onAceite: (v: boolean) => void;
  travado: boolean;
  enviando: MetodoConexao | null;
  erroEnvio?: string;
  faltando: number;
  onEnviar: (metodo: MetodoConexao) => void;
}) {
  return (
    <div className="envio">
      <label className="aceite">
        <input type="checkbox" checked={aceite} onChange={(e) => onAceite(e.target.checked)} />
        <span>{ACEITE_TEXTO}</span>
      </label>

      <div className="envio-bloco">
        <h3>Conecte um WhatsApp para a Babel aprender com as suas conversas (opcional)</h3>
        <p>
          Ao conectar, a Babel lê as conversas desse WhatsApp para entender como a sua empresa trabalha: como vocês
          atendem, vendem, tiram dúvidas e dão suporte. É isso que forma a base de conhecimento do agente.{" "}
          <strong>Pode ser qualquer WhatsApp da empresa que tenha bastante conversa com clientes — não precisa ser o
          número que o agente vai usar.</strong>
        </p>

        <div className="acoes">
          <button type="submit" className="btn btn-primario btn-qr" disabled={travado}>
            <IconeQr />
            {enviando === "qr" ? "Enviando…" : "Enviar e conectar por QR code"}
          </button>
          <button type="button" className="btn btn-secundario" disabled={travado} onClick={() => onEnviar("codigo")}>
            {enviando === "codigo" ? "Enviando…" : "Enviar e conectar por código"}
          </button>
          <button type="button" className="btn btn-leve" disabled={travado} onClick={() => onEnviar("sem")}>
            {enviando === "sem" ? "Enviando…" : "Enviar sem conectar o WhatsApp"}
          </button>
        </div>
        <p className="sub">
          Por QR code você precisa de outro aparelho pra ler o código — normalmente um computador. Só com o celular na
          mão, use <strong>conectar por código</strong>.
        </p>

        {!aceite && <p className="sub">Marque o aceite acima pra liberar o envio.</p>}
        {erroEnvio && <p className="erro-geral" role="alert">{erroEnvio}</p>}
        {faltando > 0 && (
          <p className="erro-geral" role="alert">
            Faltou preencher {faltando} campo{faltando === 1 ? "" : "s"} — marcado{faltando === 1 ? "" : "s"} em vermelho acima.
          </p>
        )}
      </div>
    </div>
  );
}

function ListaProdutos({ produtos, valores, erros, onMudar, onLimparErro }: {
  produtos: Produto[];
  valores: Valores;
  erros: Record<string, string>;
  onMudar: (atualizar: (lista: Produto[]) => Produto[]) => void;
  onLimparErro: (chave: string) => void;
}) {
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [removido, setRemovido] = useState<{ produto: Produto; posicao: number } | null>(null);
  const focarRef = useRef<string | null>(null);

  useEffect(() => {
    const id = focarRef.current;
    if (!id) return;
    focarRef.current = null;
    const el = document.getElementById(`campo-${chaveCampoProduto(id, "nome")}-input`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }, [produtos]);

  function alternar(id: string) {
    setFechados((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function adicionar(base?: Produto) {
    const novo = novoProduto(base ? { ...base.valores, nome: `${base.valores.nome || ""} (cópia)`.trim() } : undefined);
    focarRef.current = novo.id;
    setRemovido(null);
    onMudar((lista) => {
      if (!base) return [...lista, novo];
      const i = lista.findIndex((p) => p.id === base.id);
      return [...lista.slice(0, i + 1), novo, ...lista.slice(i + 1)];
    });
  }

  function remover(p: Produto, posicao: number) {
    setRemovido(produtoVazio(p) ? null : { produto: p, posicao });
    onMudar((lista) => lista.filter((x) => x.id !== p.id));
  }

  function desfazer() {
    if (!removido) return;
    const { produto, posicao } = removido;
    setRemovido(null);
    onMudar((lista) => [...lista.slice(0, posicao), produto, ...lista.slice(posicao)]);
  }

  return (
    <div className="produtos">
      <p className="produtos-nota">
        Um cartão pra cada produto ou serviço que o agente vai oferecer. Só o nome é obrigatório, mas quanto mais você
        contar, melhor o agente responde. Se tiver muitos itens parecidos, use <strong>Duplicar</strong> e troque só o que muda.
      </p>

      {produtos.map((p, i) => {
        const aberto = !fechados.has(p.id);
        const nome = String(p.valores.nome ?? "").trim();
        const valor = String(p.valores.valor ?? "").trim();
        const temErro = CAMPOS_PRODUTO.some((c) => erros[chaveCampoProduto(p.id, c.chave)]);
        return (
          <div className={`produto${temErro ? " com-erro" : ""}`} key={p.id}>
            <div className="produto-topo">
              <button type="button" className="produto-titulo" aria-expanded={aberto} onClick={() => alternar(p.id)}>
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>{nome || <em>Item sem nome</em>}</span>
                {!aberto && valor && <small>{valor}</small>}
                <i aria-hidden="true">{aberto ? "▴" : "▾"}</i>
              </button>
              <div className="produto-acoes">
                <button type="button" className="btn-mini" onClick={() => adicionar(p)}>Duplicar</button>
                <button type="button" className="btn-mini perigo" onClick={() => remover(p, i)}>Remover</button>
              </div>
            </div>
            {aberto && (
              <div className="grid">
                {CAMPOS_PRODUTO.filter((c) => campoVisivel(c, p.valores)).map((c) => {
                  const chave = chaveCampoProduto(p.id, c.chave);
                  return (
                    <CampoInput
                      key={c.chave}
                      campo={c}
                      idBase={chave}
                      valor={p.valores[c.chave]}
                      erro={erros[chave]}
                      placeholder={placeholderDe(c, valores, true)}
                      onChange={(v) => {
                        onMudar((lista) => lista.map((x) => (x.id === p.id ? { ...x, valores: { ...x.valores, [c.chave]: v } } : x)));
                        onLimparErro(chave);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {removido && (
        <p className="produto-removido" role="status">
          “{String(removido.produto.valores.nome || "Item sem nome")}” removido.{" "}
          <button type="button" className="link" onClick={desfazer}>Desfazer</button>
        </p>
      )}

      <button type="button" className="btn btn-adicionar" onClick={() => adicionar()}>
        + Adicionar {produtos.length ? "outro produto ou serviço" : "produto ou serviço"}
      </button>
    </div>
  );
}

function CampoInput({ campo, valor, erro, onChange, idBase, placeholder }: {
  campo: Campo;
  valor: string | string[];
  erro?: string;
  onChange: (v: string | string[]) => void;
  idBase?: string;
  placeholder?: string;
}) {
  const base = idBase ?? campo.chave;
  const id = `campo-${base}`;
  const classes = ["campo", campo.largo ? "largo" : "", erro ? "com-erro" : ""].filter(Boolean).join(" ");
  const texto = Array.isArray(valor) ? "" : valor ?? "";
  const lista = Array.isArray(valor) ? valor : [];
  const dica = placeholder ?? campo.placeholder;

  return (
    <div className={classes} id={id}>
      <label htmlFor={campo.tipo === "multi" || campo.tipo === "sim_nao" ? undefined : `${id}-input`}>
        {campo.rotulo}{campo.obrigatorio && <em aria-label="obrigatório">*</em>}
      </label>

      {campo.tipo === "texto_longo" && (
        <textarea id={`${id}-input`} value={texto} placeholder={dica} onChange={(e) => onChange(e.target.value)} />
      )}
      {(campo.tipo === "texto" || campo.tipo === "email" || campo.tipo === "telefone") && (
        <input
          id={`${id}-input`}
          type={campo.tipo === "email" ? "email" : campo.tipo === "telefone" ? "tel" : "text"}
          inputMode={campo.tipo === "telefone" || campo.mascara === "documento" ? "numeric" : undefined}
          autoComplete={campo.tipo === "email" ? "email" : campo.tipo === "telefone" ? "tel" : "off"}
          value={texto}
          placeholder={dica}
          onChange={(e) => onChange(aplicarMascara(campo, e.target.value))}
        />
      )}
      {campo.tipo === "select" && (
        <select id={`${id}-input`} value={texto} onChange={(e) => onChange(e.target.value)}>
          <option value="">Escolha…</option>
          {campo.opcoes?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {campo.tipo === "sim_nao" && (
        <div className="radios" role="radiogroup" aria-labelledby={id}>
          {["Sim", "Não"].map((o) => (
            <label key={o}>
              <input type="radio" name={base} value={o} checked={texto === o} onChange={() => onChange(o)} /> {o}
            </label>
          ))}
        </div>
      )}
      {campo.tipo === "multi" && (
        <div className="opcoes" role="group" aria-labelledby={id}>
          {campo.opcoes?.map((o) => {
            const marcado = lista.includes(o);
            return (
              <label key={o} className="opcao">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => onChange(marcado ? lista.filter((x) => x !== o) : [...lista, o])}
                />
                <span>{o}</span>
              </label>
            );
          })}
        </div>
      )}

      {erro ? <span className="ajuda erro">{erro}</span> : campo.ajuda ? <span className="ajuda">{campo.ajuda}</span> : null}
    </div>
  );
}

/** Campo de telefone solto (fora do formulário) — usado pra pedir o número do código. */
export function CampoTelefone({ id, valor, onChange, autoFoco }: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  autoFoco?: boolean;
}) {
  return (
    <input
      id={id}
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      autoFocus={autoFoco}
      value={valor}
      placeholder="(84) 99999-0000"
      onChange={(e) => onChange(mascararTelefone(e.target.value))}
    />
  );
}

export function telefoneValido(mascarado: string): boolean {
  const d = somenteDigitos(mascarado);
  return d.length === 10 || d.length === 11;
}

export function Marca() {
  return (
    <div className="marca">
      <img src="/babel-logo.png" alt="" width={20} height={52} />
      <span>Babel<small>levantamento</small></span>
    </div>
  );
}

function IconeQr() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" width="20" height="20">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" />
    </svg>
  );
}
