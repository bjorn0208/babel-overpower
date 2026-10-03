import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// Diagnóstico Digital — o documento que o mentor manda no WhatsApp do lead.
// Tudo aqui é fato levantado das fontes públicas (Google, Instagram, Receita,
// Reclame Aqui, site) e organizado como leitura de valor, não como proposta.
// "Baixar PDF" usa a impressão do navegador (destino: Salvar como PDF).

function fmtData(iso) {
  return new Date(iso || Date.now()).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

// "★1 (2026-01-28) "texto" [resposta da empresa: "..."]" → partes
function partirAvaliacao(linha) {
  const nota = (linha.match(/★(\d)/) || [])[1]
  const data = (linha.match(/\((\d{4}-\d{2}-\d{2})\)/) || [])[1]
  const texto = (linha.match(/"([^"]{10,})"/) || [])[1] || linha
  return { nota, data, texto }
}

function Bloco({ titulo, children, sub }) {
  return (
    <section className="dg-bloco">
      <h2>{titulo}</h2>
      {sub && <p className="dg-sub">{sub}</p>}
      {children}
    </section>
  )
}

function Linha({ rotulo, valor }) {
  if (!valor) return null
  return (
    <p className="dg-linha"><b>{rotulo}:</b> {valor}</p>
  )
}

export default function Diagnostico({ lead, perfil, aoFechar }) {
  const d = lead?.dossie || {}

  // Esc fecha — o mentor costuma abrir isto no meio da ligação
  useEffect(() => {
    const sair = (e) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', sair)
    return () => window.removeEventListener('keydown', sair)
  }, [aoFechar])

  const piores = String(d.piores_avaliacoes || '').split('\n\n').filter(Boolean).slice(0, 3)
  const melhores = String(d.melhores_avaliacoes || '').split('\n\n').filter(Boolean).slice(0, 2)

  // pontos de atenção: só entram os que os dados comprovam
  const atencao = [
    !d.site && 'A empresa não tem site próprio identificado — quem procura no Google encontra pouco além do mapa.',
    d.reclame_aqui && `Reclame Aqui: ${d.reclame_aqui}`,
    piores.length > 0 && 'Há reclamações públicas no Google que seguem visíveis para quem pesquisa a empresa.',
    d.sistema_atual === 'nenhum detectado' && 'Não identificamos ferramenta de atendimento ou agendamento no site — indício de processo manual.',
    /whatsapp/i.test(String(d.sistema_atual) + String(d.canal_contato)) &&
      'O atendimento depende de alguém respondendo o WhatsApp manualmente — fora do horário, a mensagem espera.',
    d.instagram && !d.link_bio && 'O perfil do Instagram não leva a um caminho de conversão claro (link da bio).',
  ].filter(Boolean)

  return createPortal(
    <div className="dg-fundo" onClick={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <div className="dg-papel">
        {/* ações — somem na impressão */}
        <div className="dg-acoes">
          <button onClick={() => window.print()} className="dg-btn-pdf">Baixar PDF</button>
          <button onClick={aoFechar} className="dg-btn-fechar">Fechar</button>
        </div>

        {/* ───────── cabeçalho ───────── */}
        <header className="dg-topo">
          <div className="dg-marca">
            <span className="dg-logo">B</span>
            <span>
              <b>Babel</b>
              <i>Diagnóstico Digital</i>
            </span>
          </div>
          <p className="dg-data">{fmtData(d.dados_levantados_em)}</p>
        </header>

        <h1 className="dg-titulo">{lead.empresa}</h1>
        <p className="dg-local">
          {[lead.cidade, lead.estado].filter(Boolean).join('/')}
          {lead.nicho ? ` · ${lead.nicho}` : ''}
        </p>

        <p className="dg-intro">
          Este é um retrato da presença digital da sua empresa hoje, montado a partir
          de informações públicas: Google Maps e avaliações de clientes, Instagram,
          registros oficiais, Reclame Aqui e o próprio site. Nada aqui é opinião —
          é o que qualquer cliente encontra ao procurar por você.
        </p>

        {/* ───────── quem é ───────── */}
        <Bloco titulo="A empresa">
          <Linha rotulo="Razão social" valor={d.razao_social} />
          <Linha rotulo="CNPJ" valor={d.cnpj} />
          <Linha rotulo="Situação cadastral" valor={d.situacao_cadastral} />
          <Linha rotulo="Quadro societário" valor={d.socios} />
          <Linha rotulo="Atividade" valor={d.atividade} />
          <Linha rotulo="Porte" valor={d.porte} />
          <Linha rotulo="Capital social" valor={d.capital_social} />
          <Linha rotulo="Abertura" valor={d.data_abertura} />
          <Linha rotulo="Endereço" valor={lead.endereco} />
          <Linha rotulo="Telefone" valor={lead.telefone} />
        </Bloco>

        {/* ───────── presença ───────── */}
        <Bloco titulo="Presença digital">
          <Linha rotulo="Site" valor={d.site || (lead.site || 'não identificado')} />
          <Linha rotulo="Google Meu Negócio" valor={d.google_meu_negocio ? 'ficha ativa' : null} />
          <Linha rotulo="Nota no Google" valor={d.avaliacao_google} />
          <Linha rotulo="Instagram" valor={d.instagram
            ? `${d.instagram}${d.instagram_seguidores ? ` · ${d.instagram_seguidores} seguidores` : ''}` : null} />
          <Linha rotulo="Bio" valor={d.instagram_bio} />
          <Linha rotulo="Link da bio" valor={d.link_bio} />
          {d.presenca && <p className="dg-texto">{d.presenca}</p>}
          {d.posts_recentes && <p className="dg-texto"><b>O que anda publicando:</b> {d.posts_recentes}</p>}
        </Bloco>

        {/* ───────── atendimento ───────── */}
        <Bloco titulo="Como o cliente fala com você hoje">
          <Linha rotulo="Canal de contato" valor={d.canal_contato} />
          <Linha rotulo="Ferramentas identificadas" valor={
            d.sistema_atual === 'nenhum detectado' ? 'nenhuma ferramenta de atendimento detectada' : d.sistema_atual} />
          {d.como_atendem && <p className="dg-texto">{d.como_atendem}</p>}
        </Bloco>

        {/* ───────── reputação ───────── */}
        <Bloco titulo="O que os clientes dizem"
          sub={d.avaliacoes_lidas ? `Amostra: ${d.avaliacoes_lidas} no Google.` : null}>
          {d.elogios && <p className="dg-texto"><b>Elogiam:</b> {d.elogios}</p>}
          {melhores.map((linha, i) => {
            const a = partirAvaliacao(linha)
            return (
              <blockquote key={`m${i}`} className="dg-aval dg-aval-boa">
                <span className="dg-nota">★{a.nota}</span> “{a.texto}”
              </blockquote>
            )
          })}
          {d.reclamacoes && <p className="dg-texto"><b>Reclamam:</b> {d.reclamacoes}</p>}
          {piores.map((linha, i) => {
            const a = partirAvaliacao(linha)
            return (
              <blockquote key={`p${i}`} className="dg-aval dg-aval-ruim">
                <span className="dg-nota">★{a.nota}</span> “{a.texto}”
              </blockquote>
            )
          })}
          {d.reclame_aqui && <p className="dg-texto"><b>Reclame Aqui:</b> {d.reclame_aqui}</p>}
        </Bloco>

        {/* ───────── pontos de atenção ───────── */}
        {atencao.length > 0 && (
          <Bloco titulo="Pontos de atenção" sub="O que encontramos e merece um olhar.">
            <ul className="dg-lista">
              {atencao.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </Bloco>
        )}

        {/* ───────── caminho ───────── */}
        {d.diagnostico && (
          <Bloco titulo="Por onde começar">
            <p className="dg-texto">{d.diagnostico}</p>
            <p className="dg-texto dg-nota-rodape">
              A Babel é um sistema operacional para empresas: atendimento por IA no
              WhatsApp com a base de conhecimento da sua operação, agenda, CRM e
              contratos no mesmo lugar. O diagnóstico acima aponta onde isso teria
              efeito primeiro nesta empresa.
            </p>
          </Bloco>
        )}

        {/* ───────── assinatura do mentor ───────── */}
        <footer className="dg-rodape">
          {perfil?.avatar_url
            ? <img src={perfil.avatar_url} alt="" className="dg-foto" />
            : <span className="dg-foto dg-foto-vazia">{perfil?.nome?.[0]?.toUpperCase() || 'B'}</span>}
          <span>
            <b>{perfil?.nome}</b>
            <i>Mentor · Babel</i>
          </span>
          <span className="dg-fontes">
            Fontes: Google Maps e avaliações · Instagram · Receita Federal ·
            Reclame Aqui · site da empresa. Levantado em {fmtData(d.dados_levantados_em)}.
          </span>
        </footer>
      </div>
    </div>,
    document.body
  )
}
