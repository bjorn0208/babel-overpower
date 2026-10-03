// A assinatura e o fundo da Babel — copiados do formulário, para que a jornada
// inteira (formulário → diagnóstico → painel) seja a mesma casa.

export function Marca({ centro }) {
  return (
    <div className={'flex items-center gap-3 ' + (centro ? 'justify-center' : '')}>
      <img
        src="/assets/b-joia.png" alt=""
        className="h-9 w-auto drop-shadow-[0_0_10px_rgba(122,69,232,0.7)]"
      />
      <div className="leading-tight">
        <p className="fala text-xl text-tinta tracking-[0.22em]">babel</p>
        <p className="text-[9px] uppercase tracking-[0.22em] text-tinta-3 mt-0.5">
          consciência artificial
        </p>
      </div>
    </div>
  )
}

// O fundo, com os mesmos valores do formulário: a base em 175°, a grade fina de
// violeta a 4% e os dois halos que pulsam. Antes eu tinha escurecido o meio com
// #08060F e as telas ficavam mais fechadas que o formulário.
export function Halo() {
  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      style={{ background: 'linear-gradient(175deg,#0C0820 0%,#0A0A22 42%,#071427 78%,#061020 100%)' }}>
      <div className="absolute inset-0" style={{
        backgroundImage:
          'linear-gradient(rgba(155,107,255,.04) 1px,transparent 1px),' +
          'linear-gradient(90deg,rgba(155,107,255,.04) 1px,transparent 1px)',
        backgroundSize: 'clamp(40px,6vw,64px) clamp(40px,6vw,64px)',
      }} />
      <div className="absolute rounded-full pulsa" style={{
        top: '-30vh', left: '-20vw', width: '70vw', height: '70vw',
        background: 'radial-gradient(circle,rgba(122,69,232,.30),rgba(122,69,232,0) 68%)',
        animationDuration: '9s',
      }} />
      <div className="absolute rounded-full pulsa" style={{
        bottom: '-35vh', right: '-22vw', width: '76vw', height: '76vw',
        background: 'radial-gradient(circle,rgba(31,121,224,.26),rgba(31,121,224,0) 68%)',
        animationDuration: '11s',
      }} />
    </div>
  )
}
