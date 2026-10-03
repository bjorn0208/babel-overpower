// Kit de UI do Babel Central — primitivos reutilizáveis, todos no design system.
// Uso semântico dos tokens (bg-surface, text-ink, sinal…), tema claro/escuro grátis.

export function cn(...cls) {
  return cls.filter(Boolean).join(' ')
}

// Cartão — a superfície base de tudo
export function Cartao({ className, children, plano, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-surface',
        !plano && 'shadow-[var(--shadow)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const VARIANTES_BOTAO = {
  principal: 'bg-sinal text-white hover:brightness-110 font-semibold',
  contorno: 'border border-line bg-surface text-ink hover:bg-surface-2',
  fantasma: 'text-ink-2 hover:bg-surface-2',
  perigo: 'bg-danger text-white hover:brightness-110 font-semibold',
}
const TAM_BOTAO = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3.5 text-base' }

export function Botao({ variante = 'principal', tam = 'md', className, children, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl transition',
        'disabled:opacity-40 disabled:pointer-events-none active:scale-[.98]',
        VARIANTES_BOTAO[variante], TAM_BOTAO[tam], className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

const CORES_CHIP = {
  neutro: 'border-line text-ink-2',
  sinal: 'border-sinal/40 text-sinal bg-sinal/10',
  amber: 'border-amber/40 text-amber bg-amber/10',
  violet: 'border-violet/40 text-violet bg-violet/10',
  sky: 'border-sky/40 text-sky bg-sky/10',
  danger: 'border-danger/40 text-danger bg-danger/10',
}

export function Chip({ cor = 'neutro', className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
      CORES_CHIP[cor], className)}>
      {children}
    </span>
  )
}

// Campo de texto padronizado
export function Campo({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink',
        'placeholder:text-ink-3 outline-none transition',
        'focus:border-sinal focus:bg-surface', className,
      )}
      {...props}
    />
  )
}

export function AreaTexto({ className, ...props }) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink text-sm',
        'placeholder:text-ink-3 outline-none transition resize-none',
        'focus:border-sinal focus:bg-surface', className,
      )}
      {...props}
    />
  )
}

// Rótulo de seção (uppercase discreto)
export function Rotulo({ className, children }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-wider text-ink-3', className)}>
      {children}
    </p>
  )
}

// Ponto de status pulsante (linha viva)
export function Sinal({ cor = 'sinal', pulsa }) {
  const map = { sinal: 'bg-sinal', amber: 'bg-amber', danger: 'bg-danger', ink3: 'bg-ink-3' }
  return <span className={cn('inline-block w-2 h-2 rounded-full', map[cor], pulsa && 'pulso')} />
}

// Avatar (foto ou inicial)
export function Avatar({ url, nome, tam = 36 }) {
  const s = { width: tam, height: tam }
  if (url) return <img src={url} alt="" style={s} className="rounded-full object-cover border border-line shrink-0" />
  return (
    <span style={s} className="rounded-full bg-sinal/15 border border-sinal/30 text-sinal grid place-items-center font-bold shrink-0">
      {(nome || '?')[0]?.toUpperCase()}
    </span>
  )
}
