// @ts-nocheck
/* eslint-disable */
/**
 * App Loja — loja do tenant com dados REAIS do Supabase.
 * Plano atual, pacotes extras, plus e implantação. PIX de config_plataforma.
 * 2026-09-18: tenant não vê preço nenhum aqui — a aba de planos mostra só o plano
 * em que ele está (assinaturas_usuario), e os cards/modal saíram sem valor.
 * ModalComprar real: upload de comprovante + insert pedidos_compra.
 */
import { useState, useEffect } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';
import { AbaAplicativos } from './AbaAplicativos';

export function AppLoja() {
  const [tab, setTab] = useState('aplicativos');
  const [comprar, setComprar] = useState(null);
  const [tipoCompra, setTipoCompra] = useState(null);
  const [dados, setDados] = useState({ planoAtual: null, pacotes: [], plus: [], implantacao: [], pix: '' });
  const [carregando, setCarregando] = useState(true);
  const [userId, setUserId] = useState(null);
  const t = useToast();

  useEffect(() => {
    carregarLoja();
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data?.session?.user?.id ?? null);
    });
  }, []);

  async function carregarLoja() {
    setCarregando(true);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const uid = sessao?.session?.user?.id ?? null;
      // Membro de equipe enxerga o plano do dono da conta.
      let donoId = uid;
      if (uid) {
        const { data: perfil } = await supabase.from('profiles').select('parent_user_id').eq('id', uid).maybeSingle();
        donoId = perfil?.parent_user_id ?? uid;
      }
      const [resPlano, resPacotes, resPlus, resImpl, resConfig] = await Promise.all([
        donoId
          ? supabase.from('assinaturas_usuario')
              .select('plano_nome,status,max_conversas,conversas_usadas,data_expiracao')
              .eq('user_id', donoId).eq('status', 'ativa')
              .order('created_at', { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('loja_pacotes_extra').select('id,nome,conversas,descricao').eq('is_active', true).order('preco'),
        supabase.from('loja_plus').select('id,nome,descricao').eq('is_active', true).order('preco'),
        supabase.from('loja_implantacao').select('id,nome,descricao').eq('is_active', true).order('preco'),
        supabase.from('config_plataforma').select('pix_key').maybeSingle(),
      ]);
      setDados({
        planoAtual: resPlano.data ?? null,
        pacotes: resPacotes.data ?? [],
        plus: resPlus.data ?? [],
        implantacao: resImpl.data ?? [],
        pix: resConfig.data?.pix_key ?? '',
      });
    } catch (e) {
      console.error('[AppLoja] carregarLoja:', e);
      t.error('Erro ao carregar loja.');
    } finally {
      setCarregando(false);
    }
  }

  const abrirModal = (item, tipo) => { setComprar(item); setTipoCompra(tipo); };
  const fecharModal = () => { setComprar(null); setTipoCompra(null); };
  const fmtData = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

  return (
    <div className="col" style={{ height: '100%' }}>
      <div className="row" style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
        <div>
          <div className="h2">Loja</div>
          <div className="muted small">Plano, pacotes e features adicionais.</div>
        </div>
        <div className="flex-1" />
        <div className="tabs">
          {[['aplicativos','Aplicativos','grid'],['planos','Meu plano','star'],['pacotes','Pacotes extra','package'],['plus','Plus','spark'],['implantacao','Implantação','briefcase']].map(([k,l,ic]) => (
            <span key={k} className={`tab ${tab===k?'tab-on':''}`} onClick={() => setTab(k)}>
              <Icon name={ic} size={12}/> {l}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 scroll" style={{ overflowY: 'auto', padding: 22 }}>
        {carregando && tab !== 'aplicativos' && (
          <div className="os-card center" style={{ padding: 60 }}>
            <div className="muted">Carregando…</div>
          </div>
        )}

        {tab === 'aplicativos' && (
          <AbaAplicativos userId={userId} />
        )}

        {!carregando && tab === 'planos' && (
          dados.planoAtual ? (
            <div className="os-card" style={{ padding: 22, maxWidth: 420 }}>
              <div className="muted small">Plano atual</div>
              <div className="h2 os-aurora-text" style={{ marginTop: 4 }}>{dados.planoAtual.plano_nome}</div>
              <div className="muted small" style={{ marginTop: 10 }}>
                {dados.planoAtual.conversas_usadas ?? 0} de {dados.planoAtual.max_conversas ?? 0} conversas usadas no ciclo
              </div>
              {dados.planoAtual.data_expiracao && (
                <div className="muted small" style={{ marginTop: 4 }}>Válido até {fmtData(dados.planoAtual.data_expiracao)}</div>
              )}
            </div>
          ) : (
            <div className="muted">Nenhum plano ativo no momento.</div>
          )
        )}

        {!carregando && tab === 'pacotes' && (
          <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
            {dados.pacotes.map(p => (
              <div key={p.id} className="os-card flex-1 lift" style={{ padding: 18, minWidth: 220 }}>
                <Icon name="package" size={24} stroke="var(--os-acento-1)" />
                <div className="h3" style={{ marginTop: 10 }}>{p.nome}</div>
                {p.descricao && <div className="muted small" style={{ marginTop: 4 }}>{p.descricao}</div>}
                {p.conversas > 0 && <div className="muted small" style={{ marginTop: 4 }}>{p.conversas} conversas</div>}
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={() => abrirModal(p, 'pacote_extra')}>
                  Comprar
                </button>
              </div>
            ))}
            {dados.pacotes.length === 0 && <div className="muted">Nenhum pacote disponível.</div>}
          </div>
        )}

        {!carregando && tab === 'plus' && (
          <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
            {dados.plus.map(p => (
              <div key={p.id} className="os-card flex-1 lift" style={{ padding: 20, minWidth: 280, position: 'relative' }}>
                <Icon name="spark" size={26} stroke="var(--os-acento-2)" />
                <div className="h3" style={{ marginTop: 10 }}>{p.nome}</div>
                {p.descricao && <div className="muted small" style={{ marginTop: 4 }}>{p.descricao}</div>}
                <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={() => abrirModal(p, 'plus')}>
                  Ativar
                </button>
              </div>
            ))}
            {dados.plus.length === 0 && <div className="muted">Nenhum item plus disponível.</div>}
          </div>
        )}

        {!carregando && tab === 'implantacao' && (
          <div className="row gap-3" style={{ flexWrap: 'wrap' }}>
            {dados.implantacao.map(p => (
              <div key={p.id} className="os-card flex-1 lift" style={{ padding: 20, position: 'relative', minWidth: 260 }}>
                <Icon name="briefcase" size={26} stroke="var(--os-acento-1)" />
                <div className="h3" style={{ marginTop: 10 }}>{p.nome}</div>
                {p.descricao && <div className="muted small" style={{ marginTop: 4 }}>{p.descricao}</div>}
                <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={() => abrirModal(p, 'implantacao')}>
                  Contratar
                </button>
              </div>
            ))}
            {dados.implantacao.length === 0 && <div className="muted">Nenhum pacote de implantação disponível.</div>}
          </div>
        )}
      </div>

      {comprar && (
        <ModalComprar
          item={comprar}
          tipo={tipoCompra}
          pix={dados.pix}
          onClose={fecharModal}
        />
      )}
    </div>
  );
}

function ModalComprar({ item, tipo, pix, onClose }) {
  const t = useToast();
  const [arquivo, setArquivo] = useState(null);
  const [erroArquivo, setErroArquivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function concluir() {
    if (!arquivo) {
      setErroArquivo('Anexe o comprovante de pagamento antes de concluir.');
      return;
    }
    setErroArquivo('');
    setEnviando(true);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const uid = sessao?.session?.user?.id;
      if (!uid) throw new Error('Sessão inválida');

      const ext = arquivo.name.split('.').pop();
      const caminho = `${uid}/${Date.now()}.${ext}`;

      const { error: errUpload } = await supabase.storage
        .from('comprovantes')
        .upload(caminho, arquivo, { upsert: false });
      if (errUpload) throw errUpload;

      // Enforcement SERVER-SIDE (auditoria 2026-08-31): a RPC lê o preço da fonte
      // autoritativa (tabela loja_* pelo item.id) e grava o pedido — o client não
      // manda mais item_preco (era adulterável no devtools).
      const { error: errPedido } = await supabase.rpc('criar_pedido_loja', {
        p_tipo: tipo,
        p_item_id: item.id,
        p_comprovante_url: caminho,
      });
      if (errPedido) throw errPedido;

      t.success('Pedido enviado · aguardando aprovação');
      onClose();
    } catch (e) {
      console.error('[ModalComprar] concluir:', e);
      t.error('Erro ao enviar pedido. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div className="muted small">Confirmação de compra</div>
            <div className="h2">{item.nome}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="os-vidro" style={{ padding: 16, marginBottom: 14, background: 'rgba(255,255,255,0.03)' }}>
          <div className="muted small" style={{ marginBottom: 6 }}>Chave PIX (copie e pague)</div>
          <div className="row gap-2">
            <input className="input mono" value={pix || 'Chave PIX não configurada'} readOnly />
            {pix && (
              <button
                className="btn btn-sm"
                onClick={() => { navigator.clipboard?.writeText(pix); t.info('PIX copiado'); }}
              >
                <Icon name="copy" size={12} /> Copiar
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="label">Comprovante de pagamento (obrigatório)</label>
          <label
            className="os-vidro center"
            style={{ height: 90, borderStyle: 'dashed', cursor: 'pointer', flexDirection: 'column', display: 'flex' }}
          >
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setErroArquivo(''); }}
            />
            <Icon name="upload" size={20} stroke="var(--txt-3)" />
            <div className="muted small" style={{ marginTop: 4 }}>
              {arquivo ? arquivo.name : 'Clique para selecionar PDF ou imagem'}
            </div>
          </label>
          {erroArquivo && (
            <div className="small" style={{ color: 'oklch(0.82 0.20 25)', marginTop: 6 }}>{erroArquivo}</div>
          )}
        </div>

        <div className="row gap-2" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose} disabled={enviando}>Cancelar</button>
          <button className="btn btn-primary" onClick={concluir} disabled={enviando}>
            <Icon name="check" size={13} /> {enviando ? 'Enviando…' : 'Concluir pedido'}
          </button>
        </div>
      </div>
    </>
  );
}
