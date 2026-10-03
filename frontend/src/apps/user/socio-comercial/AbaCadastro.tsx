import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

type RagenticToast = { success: (m: string) => void; error: (m: string) => void }
function obterToast(): RagenticToast {
  const w = window as unknown as { useToast?: () => RagenticToast }
  return w.useToast?.() ?? { success: () => {}, error: () => {} }
}

type Props = {
  ownerId: string
  tipoPessoaInicial: 'pf' | 'pj' | null
  nomeInicial: string | null
  documentoInicial: string | null
  cnpjInicial: string | null
  razaoSocialInicial: string | null
  chavePixInicial: string | null
}

export function AbaCadastro({
  ownerId,
  tipoPessoaInicial,
  nomeInicial,
  documentoInicial,
  cnpjInicial,
  razaoSocialInicial,
  chavePixInicial,
}: Props) {
  const [tipoPessoa, setTipoPessoa] = useState<'pf' | 'pj'>(tipoPessoaInicial ?? 'pf')
  const [nome, setNome] = useState(nomeInicial ?? '')
  const [documento, setDocumento] = useState(documentoInicial ?? '')
  const [cnpj, setCnpj] = useState(cnpjInicial ?? '')
  const [razaoSocial, setRazaoSocial] = useState(razaoSocialInicial ?? '')
  const [chavePix, setChavePix] = useState(chavePixInicial ?? '')
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    const t = obterToast()
    setSalvando(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any = { tipo_pessoa: tipoPessoa, chave_pix: chavePix }
      if (tipoPessoa === 'pf') {
        updates.full_name = nome
        updates.document = documento
        updates.razao_social = null
        updates.cnpj = null
      } else {
        updates.razao_social = razaoSocial
        updates.cnpj = cnpj
        updates.full_name = nome
        updates.document = null
      }
      // any justificado: Supabase SDK usa tipo derivado do schema gerado que não
      // aceita Record<string,unknown> — cast necessário para atualização parcial
      // `.select()` + checagem de linhas: membro de equipe não tem policy pra
      // escrever no profile do dono (ownerId = parent_user_id) — o UPDATE afeta
      // 0 linhas sem erro. Não mentir "salvo".
      const { data, error } = await supabase.from('profiles').update(updates).eq('id', ownerId).select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        t.error('Não foi possível salvar: só o dono da conta pode editar este cadastro.')
        return
      }
      t.success('Cadastro salvo com sucesso')
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2500)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar cadastro'
      obterToast().error(msg)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="os-card" style={{ padding: 22, maxWidth: 520 }}>
      <form onSubmit={handleSalvar} className="col gap-3">
        {/* Tipo pessoa */}
        <div className="col gap-2">
          <label className="label">Tipo de cadastro</label>
          <div className="row gap-2">
            <button
              type="button"
              onClick={() => setTipoPessoa('pf')}
              className={`btn${tipoPessoa === 'pf' ? ' btn-primary' : ''}`}
              style={{ flex: 1 }}
            >
              Pessoa Física
            </button>
            <button
              type="button"
              onClick={() => setTipoPessoa('pj')}
              className={`btn${tipoPessoa === 'pj' ? ' btn-primary' : ''}`}
              style={{ flex: 1 }}
            >
              Pessoa Jurídica
            </button>
          </div>
        </div>

        {/* PF */}
        {tipoPessoa === 'pf' && (
          <>
            <div className="col gap-1">
              <label className="label">Nome completo</label>
              <input
                className="input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                placeholder="Seu nome completo"
              />
            </div>
            <div className="col gap-1">
              <label className="label">CPF</label>
              <input
                className="input mono"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                required
                placeholder="000.000.000-00"
              />
            </div>
          </>
        )}

        {/* PJ */}
        {tipoPessoa === 'pj' && (
          <>
            <div className="col gap-1">
              <label className="label">Razão Social</label>
              <input
                className="input"
                value={razaoSocial}
                onChange={(e) => setRazaoSocial(e.target.value)}
                required
                placeholder="Nome da empresa"
              />
            </div>
            <div className="col gap-1">
              <label className="label">CNPJ</label>
              <input
                className="input mono"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                required
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="col gap-1">
              <label className="label">Responsável</label>
              <input
                className="input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                placeholder="Nome do responsável"
              />
            </div>
          </>
        )}

        {/* Chave Pix */}
        <div className="col gap-1">
          <label className="label">Chave Pix para saques</label>
          <input
            className="input mono"
            value={chavePix}
            onChange={(e) => setChavePix(e.target.value)}
            required
            placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
          />
          <div className="muted tiny" style={{ color: 'oklch(0.78 0.16 65)' }}>
            A chave Pix deve estar vinculada ao{' '}
            {tipoPessoa === 'pf' ? 'nome cadastrado acima' : 'CNPJ ou razão social cadastrados acima'}
          </div>
        </div>

        <div style={{ paddingTop: 4 }}>
          <button
            type="submit"
            disabled={salvando}
            className="btn btn-primary"
          >
            {salvando ? 'Salvando…' : salvo ? '✓ Salvo' : 'Salvar Cadastro'}
          </button>
        </div>
      </form>
    </div>
  )
}
