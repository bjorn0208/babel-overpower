// Os gráficos do diagnóstico.
//
// Duas séries só: HOJE e COM O PLANO. O par foi validado com o script da skill
// de dataviz contra fundo escuro — ΔE 23,7 (deuteranopia) e 30,2 (visão normal),
// bem acima do piso de 8. O brilho carrega o sentido: o violeta fechado é o
// presente, o ciano aceso é o depois.
//
// Nenhum gráfico usa cor sozinha para dizer quem é quem: tudo tem rótulo direto.

export const HOJE = '#7A45E8'
export const PLANO = '#39C4FF'
const VAZIO = 'rgba(155,107,255,.10)'
const PERDIDO = '#3A3358'

const brl = (n) => Number(n).toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
})

export function Legenda({ itens }) {
  return (
    <div className="flex items-center gap-5 flex-wrap">
      {itens.map((i) => (
        <span key={i.rotulo} className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-tinta-3">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: i.cor }} />
          {i.rotulo}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// O salto do score. Não é medidor de ponteiro: é uma régua de 0 a 1000 com as
// duas marcas em cima — dá para ler a distância, que é o que interessa.
// ---------------------------------------------------------------------------
export function Salto({ hoje, projetado, teto = 1000 }) {
  const a = (hoje / teto) * 100
  const b = (projetado / teto) * 100
  return (
    <div className="figura">
      <div className="flex items-end gap-6 flex-wrap">
        <div>
          <div className="text-5xl sm:text-6xl tabular-nums leading-none" style={{ color: HOJE }}>{hoje}</div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-tinta-3 mt-2">hoje</p>
        </div>
        <div className="text-2xl text-tinta-3 pb-3">→</div>
        <div>
          <div className="text-6xl sm:text-7xl tabular-nums leading-none" style={{ color: PLANO }}>{projetado}</div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-tinta-3 mt-2">com o plano</p>
        </div>
        <div className="pb-3 ml-auto text-right">
          <div className="text-3xl tabular-nums text-tinta leading-none">+{projetado - hoje}</div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-tinta-3 mt-2">pontos</p>
        </div>
      </div>

      <div className="mt-7">
        <div className="relative h-3 rounded-full" style={{ background: VAZIO }}>
          {/* o trecho que o plano acrescenta, recuado 2px para não colar no de hoje */}
          <div className="absolute inset-y-0 rounded-r-full"
            style={{ left: `calc(${a}% + 2px)`, width: `calc(${b - a}% - 2px)`, background: PLANO }} />
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${a}%`, background: HOJE }} />
        </div>
        <div className="flex justify-between mt-2 text-[10px] tabular-nums text-tinta-3">
          <span>0</span><span>{teto}</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Os eixos, em halteres: o ponto de hoje, o ponto de depois, e a distância
// entre eles desenhada. A distância É a mensagem.
// ---------------------------------------------------------------------------
export function Eixos({ eixos }) {
  return (
    <div>
      <Legenda itens={[{ rotulo: 'hoje', cor: HOJE }, { rotulo: 'com o plano', cor: PLANO }]} />
      <div className="mt-6 space-y-5">
        {eixos.map((e) => {
          const a = (e.hoje / e.teto) * 100
          const b = (e.projetado / e.teto) * 100
          return (
            <div key={e.chave} className="figura">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <span className="text-[13px] text-tinta-2">{e.chave}</span>
                <span className="text-[12px] tabular-nums text-tinta-3">
                  <span style={{ color: HOJE }}>{e.hoje}</span>
                  {' → '}
                  <span style={{ color: PLANO }}>{e.projetado}</span>
                  <span className="text-tinta-3/60"> /{e.teto}</span>
                </span>
              </div>
              <div className="relative h-2.5">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full"
                  style={{ background: VAZIO }} />
                <div className="absolute top-1/2 -translate-y-1/2 h-[3px]"
                  style={{ left: `${a}%`, width: `${Math.max(0, b - a)}%`,
                           background: `linear-gradient(90deg, ${HOJE}, ${PLANO})` }} />
                <span className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
                  style={{ left: `calc(${a}% - 5px)`, background: HOJE, boxShadow: '0 0 0 2px #0A0A22' }} />
                <span className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
                  style={{ left: `calc(${b}% - 5px)`, background: PLANO, boxShadow: '0 0 0 2px #0A0A22' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// O funil: uma barra só, dois pedaços. Mostrar 40 contra 710 em barras
// separadas esconderia a proporção — que é justamente o soco.
// ---------------------------------------------------------------------------
export function Funil({ leadsMes, contratos, ticket }) {
  const perdidos = Math.max(0, leadsMes - contratos)
  const pctFecha = (contratos / leadsMes) * 100
  return (
    <div className="figura">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-4xl tabular-nums text-tinta">{leadsMes.toLocaleString('pt-BR')}</span>
        <span className="text-[13px] text-tinta-2">leads chegam por mês</span>
      </div>

      <div className="mt-5 flex h-12 rounded-lg overflow-hidden gap-[2px]">
        <div className="grid place-items-center rounded-l-lg"
          style={{ width: `${Math.max(pctFecha, 2)}%`, background: PLANO, minWidth: 44 }}>
          <span className="text-[13px] tabular-nums font-medium" style={{ color: '#061020' }}>{contratos}</span>
        </div>
        <div className="flex-1 grid place-items-center rounded-r-lg px-3" style={{ background: PERDIDO }}>
          <span className="text-[13px] tabular-nums text-tinta-2">
            {perdidos.toLocaleString('pt-BR')} não viram nada
          </span>
        </div>
      </div>

      <div className="mt-3 flex justify-between text-[11px] uppercase tracking-[0.14em] text-tinta-3">
        <span>viram contrato · {pctFecha.toFixed(1)}%</span>
        {ticket ? <span>{brl(contratos * ticket)} fechados</span> : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// O CONFRONTO — o coração do diagnóstico.
// Duas barras na mesma escala: o que a pessoa declarou e o que a conta dela dá.
// O vazio entre as duas É o buraco, e por isso ele é desenhado, não descrito.
// ---------------------------------------------------------------------------
export function Confronto({ visual }) {
  if (!visual?.a || !visual?.b) return null
  const { a, b, formato } = visual
  // vírgula decimal — "34.7%" é inglês, e o lead lê em português
  const fmt = (v) =>
    formato === 'brl' ? brl(v)
      : formato === 'pct' ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
        : Number(v).toLocaleString('pt-BR')

  const teto = Math.max(a.valor, b.valor) || 1
  const pa = (a.valor / teto) * 100
  const pb = (b.valor / teto) * 100
  const maiorEhA = a.valor >= b.valor
  const dif = Math.abs(a.valor - b.valor)

  const Linha = ({ item, pct, cor, forte }) => (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-[12px] text-tinta-3">{item.rotulo}</span>
        <span className={'tabular-nums ' + (forte ? 'text-[19px]' : 'text-[15px]')}
          style={{ color: cor }}>{fmt(item.valor)}</span>
      </div>
      <div className="h-3 rounded-full" style={{ background: VAZIO }}>
        <div className="h-3 rounded-full" style={{ width: `${pct}%`, background: cor }} />
      </div>
    </div>
  )

  return (
    <div className="figura">
      <div className="space-y-4">
        <Linha item={a} pct={pa} cor={maiorEhA ? HOJE : PLANO} forte={maiorEhA} />
        <Linha item={b} pct={pb} cor={maiorEhA ? PLANO : HOJE} forte={!maiorEhA} />
      </div>

      {/* o vazio entre as duas, nomeado */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: 'rgba(155,107,255,.25)' }} />
        <span className="text-[12px] tabular-nums px-3 py-1 rounded-full"
          style={{ color: HOJE, border: `1px solid ${HOJE}55`, background: 'rgba(122,69,232,.08)' }}>
          diferença de {fmt(dif)}
        </span>
        <div className="h-px flex-1" style={{ background: 'rgba(155,107,255,.25)' }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A coerência. Uma régua de 0 a 100 com a marca no lugar, e as três zonas
// nomeadas — sem isso um "30" não diz se é bom ou ruim.
// ---------------------------------------------------------------------------
export function Coerencia({ nota }) {
  const zona = nota >= 70 ? 'os seus números fecham entre si'
    : nota >= 40 ? 'há pontas soltas nos seus números'
      : 'os seus números não fecham entre si'
  return (
    <div className="figura">
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex items-baseline gap-1">
          <span className="text-6xl tabular-nums leading-none"
            style={{ color: nota >= 70 ? PLANO : HOJE }}>{nota}</span>
          <span className="text-xl text-tinta-3 tabular-nums">/100</span>
        </div>
        <p className="text-[15px] text-tinta-2 pb-2">{zona}</p>
      </div>

      <div className="mt-6 relative h-3 rounded-full overflow-hidden flex gap-[2px]">
        <div className="h-full" style={{ width: '40%', background: 'rgba(122,69,232,.35)' }} />
        <div className="h-full" style={{ width: '30%', background: 'rgba(122,69,232,.20)' }} />
        <div className="h-full flex-1" style={{ background: 'rgba(57,196,255,.22)' }} />
      </div>
      <div className="relative">
        <span className="absolute -top-[18px] w-3 h-3 rounded-full"
          style={{ left: `calc(${nota}% - 6px)`, background: nota >= 70 ? PLANO : HOJE,
                   boxShadow: '0 0 0 3px #0A0A22' }} />
      </div>
      <div className="mt-3 flex justify-between text-[10px] uppercase tracking-[0.14em] text-tinta-3">
        <span>não fecham</span><span>pontas soltas</span><span>fecham</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Os indicadores derivados em ladrilhos. Cada um traz a conta embaixo — é o que
// separa "número que apareceu" de "número que eu posso conferir".
// ---------------------------------------------------------------------------
export function Ladrilhos({ itens }) {
  if (!itens?.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map((i, k) => (
        <div key={k} className="rounded-2xl border border-linha bg-superficie/40 p-4 evitar-quebra">
          <p className="text-[11px] text-tinta-3 leading-tight min-h-[28px]">{i.rotulo}</p>
          <p className="mt-2 text-2xl tabular-nums" style={{ color: PLANO }}>{i.valor}</p>
          <p className="mt-1.5 text-[10px] text-tinta-3/80">{i.conta}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A cascata do dinheiro: de onde ele parte, o que cada movimento acrescenta,
// onde chega. "+R$18.000" solto é um número; em cima da base, é uma subida.
// ---------------------------------------------------------------------------
export function Cascata({ base, passos, fim }) {
  if (!base || !passos?.length) return null
  const teto = fim || base
  const pct = (v) => (v / teto) * 100
  return (
    <div className="figura">
      <div className="flex h-14 rounded-lg overflow-hidden gap-[2px]">
        <div className="grid place-items-center px-3 rounded-l-lg overflow-hidden"
          style={{ width: `${pct(base)}%`, background: 'rgba(122,69,232,.30)', minWidth: 60 }}>
          <span className="text-[12px] tabular-nums text-tinta whitespace-nowrap">{brl(base)}</span>
        </div>
        {passos.map((p, k) => {
          const largura = pct(p.valor)
          // Rótulo dentro de segmento estreito sai cortado pela metade. Abaixo
          // de 12% o degrau fica só com a cor — o valor já está na lista.
          const cabe = largura >= 12
          return (
            <div key={k} className={'grid place-items-center px-2 ' + (k === passos.length - 1 ? 'rounded-r-lg' : '')}
              style={{ width: `${largura}%`, background: PLANO, minWidth: 28 }}>
              {cabe && (
                <span className="text-[12px] tabular-nums font-medium whitespace-nowrap"
                  style={{ color: '#061020' }}>+{brl(p.valor)}</span>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-4 flex-wrap">
        <span className="text-[11px] uppercase tracking-[0.14em] text-tinta-3">hoje</span>
        <span className="text-[15px] tabular-nums" style={{ color: PLANO }}>
          {brl(fim)}/mês com o plano
        </span>
      </div>
    </div>
  )
}
