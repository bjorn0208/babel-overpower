import { useState } from 'react'
import { supabase, limparSlug, ehReservado } from '../lib/supabase'
import { Marca, Halo } from '../componentes/Marca'
import EditorPerfil, { GRADE_PADRAO, Campo, CAIXA } from '../componentes/EditorPerfil'

export default function Cadastro({ navegar }) {
  const [nome, setNome] = useState('')
  const [slug, setSlug] = useState('')
  const [tocouSlug, setTocouSlug] = useState(false)
  const [perfil, setPerfil] = useState({ whatsapp: '', descricao: '', foto_url: null, grade: GRADE_PADRAO })
  const [foto, setFoto] = useState(null)   // { arquivo, previa }
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Enquanto a pessoa não mexer no endereço, ele se escreve sozinho pelo nome.
  const endereco = tocouSlug ? limparSlug(slug) : limparSlug(nome)

  function escolherFoto(e) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    if (arquivo.size > 4 * 1024 * 1024) { setErro('A foto passou de 4 MB.'); return }
    setErro('')
    setFoto({ arquivo, previa: URL.createObjectURL(arquivo) })
  }

  async function entrar() {
    setErro('')
    if (nome.trim().length < 2) return setErro('Me diz seu nome.')
    if (endereco.length < 3) return setErro('O endereço precisa de pelo menos 3 letras.')
    if (ehReservado(endereco)) return setErro('Esse endereço é do sistema. Escolhe outro.')
    if (!perfil.grade?.dias?.length) return setErro('Marque ao menos um dia que você atende.')

    setSalvando(true)
    let foto_url = null

    if (foto) {
      const ext = (foto.arquivo.name.split('.').pop() || 'jpg').toLowerCase()
      const caminho = `${endereco}-${Date.now()}.${ext}`
      const { error: e1 } = await supabase.storage
        .from('comercial-fotos').upload(caminho, foto.arquivo, { upsert: true })
      if (!e1) foto_url = supabase.storage.from('comercial-fotos').getPublicUrl(caminho).data.publicUrl
      // Foto que não sobe não impede o cadastro — ele entra sem ela, e a
      // pessoa põe depois pelo painel.
    }

    const { error } = await supabase.from('comercial_pessoas').insert({
      nome: nome.trim(),
      slug: endereco,
      whatsapp: perfil.whatsapp?.trim() || null,
      descricao: perfil.descricao?.trim() || null,
      foto_url,
      ativo: true,
      grade: perfil.grade,
    })

    if (error) {
      setSalvando(false)
      setErro(error.code === '23505'
        ? 'Esse endereço já é de alguém. Tenta outro.'
        : 'Não consegui criar agora. Tenta de novo.')
      return
    }
    navegar('/' + endereco)
  }

  return (
    <div className="min-h-full relative">
      <Halo />
      <div className="relative z-10 mx-auto max-w-lg px-5 py-12">
        <Marca />

        <div className="mt-12 sobe">
          <p className="fala text-4xl text-tinta leading-tight">
            entra no comercial da <span className="marca">babel</span>.
          </p>
          <p className="mt-4 text-tinta-2 leading-relaxed">
            Você ganha um endereço só seu. Dele saem os links de campanha, e nele
            chegam as inscrições que a Babel já leu, pontuou e agendou.
          </p>

          <div className="mt-10 space-y-6">
            <Campo rotulo="Seu nome">
              <input className={CAIXA} placeholder="como te chamam"
                value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>

            <Campo rotulo="O endereço do seu painel">
              <div className="flex items-center rounded-2xl bg-superficie-2 border border-linha
                              px-4 py-3.5 focus-within:border-violeta/70 transition-colors">
                <span className="text-tinta-3 text-sm shrink-0">comercial.babel-os.com/</span>
                <input
                  className="flex-1 min-w-0 bg-transparent text-tinta outline-none placeholder:text-tinta-3"
                  placeholder="seunome"
                  value={tocouSlug ? slug : endereco}
                  onChange={(e) => { setTocouSlug(true); setSlug(e.target.value) }}
                />
              </div>
            </Campo>

            <div className="pt-4 border-t border-linha space-y-6">
              <EditorPerfil
                valor={perfil} aoMudar={setPerfil}
                aoEscolherFoto={escolherFoto} previaFoto={foto?.previa}
              />
            </div>
          </div>

          {erro && <p className="mt-6 text-sm text-violeta-claro">{erro}</p>}

          <button
            type="button" disabled={salvando} onClick={entrar}
            className="mt-9 w-full rounded-full bg-linear-to-r from-violeta to-ciano px-7 py-3.5
                       text-[15px] font-medium text-fundo transition-opacity
                       hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? 'criando…' : 'criar meu painel'}
          </button>

          <p className="mt-6 text-[12px] text-tinta-3 leading-relaxed">
            Já tem painel? Abra <span className="text-tinta-2">comercial.babel-os.com/seunome</span> direto.
          </p>
        </div>
      </div>
    </div>
  )
}
