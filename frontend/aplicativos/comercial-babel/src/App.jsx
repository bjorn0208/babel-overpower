import { useEffect, useState } from 'react'
import Painel from './paginas/Painel'
import Cadastro from './paginas/Cadastro'
import Resultado from './paginas/Resultado'

// Roteador de bolso. Os endereços:
//   /                          → cadastro
//   /diagnostico1              → o formulário (arquivo estático do Claude
//                                Design; a Vercel reescreve para
//                                /formulario.html antes de o React acordar)
//   /diagnostico1/4085420843   → o diagnóstico daquele lead (código curto)
//   /<pessoa>                  → painel do mentor
//
// O link que vai para o lead não carrega o nome de quem mandou: é só
// /diagnostico1. Quem é o mentor sai da campanha, no banco.
function rotaDe(caminho) {
  const p = caminho.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
  if (p.length === 0 || p[0] === 'cadastro') return { tela: 'cadastro' }
  if (p.length === 1) {
    return /^diagnostico/i.test(p[0])
      ? { tela: 'formulario', campanha: p[0] }
      : { tela: 'painel', pessoa: p[0] }
  }
  // /<campanha>/<codigo> é o diagnóstico. 'resultado' segue aceito para não
  // quebrar link antigo já enviado a alguém.
  if (p[1] === 'resultado') return { tela: 'resultado', campanha: p[0] }
  if (/^\d{6,}$/.test(p[1])) return { tela: 'resultado', campanha: p[0], codigo: p[1] }
  return { tela: 'painel', pessoa: p[0] }
}

export default function App() {
  const [rota, setRota] = useState(() => rotaDe(window.location.pathname))

  useEffect(() => {
    const aoVoltar = () => setRota(rotaDe(window.location.pathname))
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  // Painel e diagnóstico mostram dado de gente — fora de buscador.
  useEffect(() => {
    const tag = document.querySelector('meta[name="robots"]') ?? (() => {
      const m = document.createElement('meta')
      m.name = 'robots'
      document.head.appendChild(m)
      return m
    })()
    tag.content = 'noindex, nofollow'
  }, [])

  // Em desenvolvimento não existe a reescrita da Vercel, então o React é quem
  // manda o navegador para o arquivo do formulário.
  useEffect(() => {
    if (rota.tela === 'formulario') window.location.replace('/formulario.html')
  }, [rota.tela])

  function navegar(para) {
    window.history.pushState({}, '', para)
    setRota(rotaDe(para))
  }

  if (rota.tela === 'resultado') return <Resultado codigo={rota.codigo} />
  if (rota.tela === 'formulario') return null
  if (rota.tela === 'painel') return <Painel slug={rota.pessoa} navegar={navegar} />
  return <Cadastro navegar={navegar} />
}
