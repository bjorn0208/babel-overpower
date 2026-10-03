import { useState, useEffect, useCallback } from 'react'
import { useAbaAlvo } from "@/os/dock/aba-alvo";
import { supabase } from '@/integrations/supabase/client'
import { AbaRede } from './AbaRede'
import { AbaComissoes } from './AbaComissoes'
import { AbaSaques } from './AbaSaques'
import { AbaCadastro } from './AbaCadastro'
import { ModalSaque } from './ModalSaque'
import {
  checkSaquePermitido,
  formatarBRL,
  type Comissao,
  type Indicado,
  type PerfilSocio,
  type Saque,
  type SaqueRegras,
} from './tipos'

// ---------------------------------------------------------------------------
// Toast defensivo (mesmo padrão de Conversas.tsx)
// ---------------------------------------------------------------------------
type RagenticToast = { success: (m: string) => void; error: (m: string) => void }
function obterToast(): RagenticToast {
  const w = window as unknown as { useToast?: () => RagenticToast }
  return w.useToast?.() ?? { success: () => {}, error: () => {} }
}

type Aba = 'rede' | 'comissoes' | 'saques' | 'cadastro'

const ABAS: { id: Aba; label: string; icone: string }[] = [
  { id: 'rede', label: 'Minha Rede', icone: '👥' },
  { id: 'comissoes', label: 'Comissões', icone: '💰' },
  { id: 'saques', label: 'Saques', icone: '🏦' },
  { id: 'cadastro', label: 'Cadastro', icone: '📋' },
]

export function SocioComercial() {
  const [perfil, setPerfil] = useState<PerfilSocio | null>(null)
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [saques, setSaques] = useState<Saque[]>([])
  const [indicados, setIndicados] = useState<Indicado[]>([])
  const [saqueRegras, setSaqueRegras] = useState<SaqueRegras | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<Aba>('rede')
  useAbaAlvo("socio-comercial-user", (v) => setAba(v as Aba));
  const [mostrarSaque, setMostrarSaque] = useState(false)
  const [copiado, setCopiado] = useState(false)

  // ------------------------------------------------------------------
  // Resolve ownerId: parent_user_id (membro de equipe) ou uid próprio
  // ------------------------------------------------------------------
  const [ownerId, setOwnerId] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const { data: sessao } = await supabase.auth.getSession()
      const uid = sessao?.session?.user?.id
      if (!uid || !ativo) return

      const { data: p } = await supabase
        .from('profiles')
        .select(
          'id, parent_user_id, full_name, email, referral_code, saldo_multinivel, multinivel_ativo, chave_pix, tipo_pessoa, document, cnpj, razao_social',
        )
        .eq('id', uid)
        .single()

      if (!ativo) return
      if (p) {
        setPerfil(p as PerfilSocio)
        setOwnerId((p.parent_user_id as string | null) || uid)
      }
    })()
    return () => { ativo = false }
  }, [])

  // ------------------------------------------------------------------
  // Carrega regras de saque (independente de ownerId)
  // ------------------------------------------------------------------
  useEffect(() => {
    supabase
      .from('config_plataforma')
      .select('saque_regras_ativo, saque_dia_semana, saque_hora_inicio, saque_hora_fim, saque_valor_minimo')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setSaqueRegras(data as SaqueRegras) })
  }, [])

  // ------------------------------------------------------------------
  // fetchData — carrega saldo, comissões, saques e rede
  // ------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (!ownerId) return
    setCarregando(true)
    try {
      const [perfilRes, comsRes, sqsRes, indsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('saldo_multinivel, multinivel_ativo, referral_code, chave_pix, tipo_pessoa, document, cnpj, razao_social, full_name')
          .eq('id', ownerId)
          .single(),
        supabase
          .from('multinivel_comissoes')
          .select('id, origem_id, nivel, percentual, valor_base, valor_comissao, status, created_at')
          .eq('beneficiario_id', ownerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('multinivel_saques')
          .select('id, valor, status, chave_pix, created_at')
          .eq('user_id', ownerId)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_minha_rede', { p_owner_id: ownerId }),
      ])

      // Supabase não lança em erro — o destructure só de `data` engolia falha de
      // RLS/rede e mostrava a tela vazia como se fosse "sem dados". Checa `error`
      // pra diferenciar falha real de ausência de registros.
      // perfilRes usa `.single()` (PGRST116 quando não há linha = "sem dados",
      // tolerado pelo `if (p)` abaixo). As listas é que engoliam falha real.
      const primeiroErro = comsRes.error ?? sqsRes.error ?? indsRes.error
      if (primeiroErro) throw primeiroErro
      const { data: p } = perfilRes
      const { data: coms } = comsRes
      const { data: sqs } = sqsRes
      const { data: inds } = indsRes

      if (p) {
        setPerfil((prev) => ({
          ...(prev ?? ({} as PerfilSocio)),
          ...(p as Partial<PerfilSocio>),
        }))
      }

      if (coms && coms.length > 0) {
        const origemIds = [...new Set((coms as Comissao[]).map((c) => c.origem_id))]
        const { data: origens } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', origemIds)
        const mapa = Object.fromEntries((origens ?? []).map((o) => [o.id, o.full_name]))
        setComissoes(
          (coms as Comissao[]).map((c) => ({ ...c, origem_nome: mapa[c.origem_id] || '—' })),
        )
      } else {
        setComissoes([])
      }

      setSaques((sqs as Saque[]) ?? [])
      setIndicados((inds as Indicado[]) ?? [])
    } catch {
      obterToast().error('Erro ao carregar dados do Sócio Comercial')
    } finally {
      setCarregando(false)
    }
  }, [ownerId])

  useEffect(() => { fetchData() }, [fetchData])

  // ------------------------------------------------------------------
  // Realtime: saques, perfil, comissões
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!ownerId) return
    const canal = supabase
      .channel(`socio-comercial-${ownerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'multinivel_saques', filter: `user_id=eq.${ownerId}` },
        () => fetchData(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${ownerId}` },
        () => fetchData(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'multinivel_comissoes', filter: `beneficiario_id=eq.${ownerId}` },
        () => fetchData(),
      )
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [ownerId, fetchData])

  // ------------------------------------------------------------------
  // Derivações
  // ------------------------------------------------------------------
  const saldo = Number(perfil?.saldo_multinivel ?? 0)
  const totalGanho = comissoes.reduce((acc, c) => acc + Number(c.valor_comissao), 0)
  const saldoPendente = saques
    .filter((s) => s.status === 'pendente')
    .reduce((acc, s) => acc + Number(s.valor), 0)
  const saqueCheck = checkSaquePermitido(saqueRegras)
  const valorMinimo = saqueRegras?.saque_regras_ativo ? (saqueRegras.saque_valor_minimo ?? 0) : 0
  const saqueBloqueado =
    !saqueCheck.permitido || saldo <= 0 || (valorMinimo > 0 && saldo < valorMinimo)

  const referralLink = `${window.location.origin}/cadastro?ref=${perfil?.referral_code ?? ''}`

  function copiarLink() {
    navigator.clipboard.writeText(referralLink)
    setCopiado(true)
    obterToast().success('Link copiado')
    setTimeout(() => setCopiado(false), 2000)
  }

  // ------------------------------------------------------------------
  // Estado vazio: multinível inativo
  // ------------------------------------------------------------------
  if (!carregando && perfil && !perfil.multinivel_ativo) {
    return (
      <div className="col" style={{ height: '100%', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontSize: 40, opacity: 0.3 }}>🤝</div>
        <div className="h2" style={{ opacity: 0.5 }}>Sócio Comercial não ativo</div>
        <div className="muted small" style={{ textAlign: 'center', maxWidth: 320 }}>
          O programa Sócio Comercial não está ativo na sua conta.
          Entre em contato com o suporte para mais informações.
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // Carregando
  // ------------------------------------------------------------------
  if (carregando && !perfil) {
    return (
      <div className="col" style={{ height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div className="muted small">Carregando…</div>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // Render principal
  // ------------------------------------------------------------------
  return (
    <div className="col" style={{ height: '100%' }}>
      {/* Cabeçalho */}
      <div
        className="row"
        style={{
          padding: '16px 22px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div>
          <div className="h2">Sócio Comercial</div>
          <div className="muted small">Rede, comissões e saques</div>
        </div>
      </div>

      {/* Conteúdo com scroll */}
      <div className="flex-1 scroll" style={{ overflow: 'auto', padding: 22 }}>
        {/* Cards de resumo */}
        <div
          className="row gap-3"
          style={{ flexWrap: 'wrap', marginBottom: 20 }}
        >
          {/* Saldo disponível */}
          <div className="os-card col gap-2" style={{ padding: 16, minWidth: 180, flex: 1 }}>
            <div className="muted tiny">Saldo disponível</div>
            <div
              className="mono"
              style={{ fontSize: 22, fontWeight: 700, color: 'oklch(0.72 0.18 142)' }}
            >
              {formatarBRL(saldo)}
            </div>
            <button
              onClick={() => setMostrarSaque(true)}
              disabled={saqueBloqueado}
              className={`btn btn-sm${saqueBloqueado ? '' : ' btn-primary'}`}
              style={{ marginTop: 4 }}
              title={!saqueCheck.permitido ? saqueCheck.motivo : undefined}
            >
              {!saqueCheck.permitido
                ? `🔒 ${saqueCheck.motivo}`
                : saqueBloqueado && valorMinimo > 0 && saldo < valorMinimo
                  ? `🔒 Mín. ${formatarBRL(valorMinimo)}`
                  : 'Solicitar Saque'}
            </button>
          </div>

          {/* Saque pendente (só exibe se houver) */}
          {saldoPendente > 0 && (
            <div className="os-card col gap-2" style={{ padding: 16, minWidth: 160, flex: 1 }}>
              <div className="muted tiny">Saque pendente</div>
              <div
                className="mono"
                style={{ fontSize: 22, fontWeight: 700, color: 'oklch(0.78 0.16 65)' }}
              >
                {formatarBRL(saldoPendente)}
              </div>
              <span className="badge badge-warn" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                Em análise
              </span>
            </div>
          )}

          {/* Total ganho */}
          <div className="os-card col gap-2" style={{ padding: 16, minWidth: 160, flex: 1 }}>
            <div className="muted tiny">Total ganho</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
              {formatarBRL(totalGanho)}
            </div>
          </div>

          {/* Indicados diretos */}
          <div className="os-card col gap-2" style={{ padding: 16, minWidth: 140, flex: 1 }}>
            <div className="muted tiny">Indicados diretos</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
              {indicados.length}
            </div>
          </div>
        </div>

        {/* Link de cadastro */}
        <div className="os-card col gap-2" style={{ padding: 16, marginBottom: 20 }}>
          <div className="row gap-2" style={{ alignItems: 'center' }}>
            <span style={{ fontSize: 14 }}>🔗</span>
            <span className="small" style={{ fontWeight: 600 }}>Link de Cadastro</span>
          </div>
          <div className="muted tiny">
            Compartilhe este link para cadastrar novos usuários na sua rede
          </div>
          <div className="row gap-2" style={{ alignItems: 'center' }}>
            <input
              readOnly
              value={referralLink}
              className="input mono"
              style={{ flex: 1, fontSize: 11, opacity: 0.7 }}
            />
            <button onClick={copiarLink} className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
              {copiado ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
        </div>

        {/* Tabs — flexWrap: 4 abas com ícone+texto estouram a largura em tela
            bem estreita (.tabs é inline-flex sem wrap); quebra pra 2ª linha
            em vez de cortar/gerar scroll horizontal indesejado. */}
        <div className="tabs" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
          {ABAS.map((a) => (
            <span
              key={a.id}
              className={`tab${aba === a.id ? ' tab-on' : ''}`}
              onClick={() => setAba(a.id)}
            >
              {a.icone} {a.label}
            </span>
          ))}
        </div>

        {/* Conteúdo da aba */}
        {aba === 'rede' && <AbaRede indicados={indicados} />}
        {aba === 'comissoes' && <AbaComissoes comissoes={comissoes} />}
        {aba === 'saques' && <AbaSaques saques={saques} />}
        {aba === 'cadastro' && ownerId && (
          <AbaCadastro
            ownerId={ownerId}
            tipoPessoaInicial={perfil?.tipo_pessoa ?? null}
            nomeInicial={perfil?.full_name ?? null}
            documentoInicial={perfil?.document ?? null}
            cnpjInicial={perfil?.cnpj ?? null}
            razaoSocialInicial={perfil?.razao_social ?? null}
            chavePixInicial={perfil?.chave_pix ?? null}
          />
        )}
      </div>

      {/* Modal saque */}
      {mostrarSaque && (
        <ModalSaque
          saldo={saldo}
          valorMinimo={valorMinimo}
          chavePixPadrao={perfil?.chave_pix ?? null}
          onClose={() => setMostrarSaque(false)}
          onSucesso={fetchData}
        />
      )}
    </div>
  )
}
