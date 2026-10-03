import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Botao, Campo, Cartao } from '../componentes/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setErro('E-mail ou senha inválidos.')
    setCarregando(false)
  }

  return (
    <div className="min-h-full grid place-items-center p-6 relative overflow-hidden">
      {/* brilho ambiente da linha viva */}
      <div className="pointer-events-none absolute -top-40 right-0 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-20"
        style={{ background: 'radial-gradient(circle, var(--sinal), transparent 60%)' }} />

      <Cartao className="w-full max-w-sm p-8 anim-in relative">
        <div className="flex flex-col items-center text-center mb-7">
          <span className="w-12 h-12 rounded-2xl bg-sinal grid place-items-center text-white font-extrabold text-2xl mb-4 shadow-[0_0_30px_var(--sinal)]">B</span>
          <div className="text-2xl font-extrabold tracking-tight">Babel<span className="text-sinal">Phone</span></div>
          <p className="text-sm text-ink-3 mt-1">Central comercial da equipe</p>
        </div>
        <form onSubmit={entrar} className="space-y-3">
          <Campo type="email" required placeholder="E-mail" value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Campo type="password" required placeholder="Senha" value={senha}
            onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
          {erro && <p className="text-sm text-danger">{erro}</p>}
          <Botao tam="lg" className="w-full" disabled={carregando}>
            {carregando ? 'Entrando…' : 'Entrar'}
          </Botao>
        </form>
      </Cartao>
    </div>
  )
}
