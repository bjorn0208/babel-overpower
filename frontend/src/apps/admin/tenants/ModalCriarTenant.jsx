import { useEffect, useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';

/**
 * Wizard de criação de tenant — carrossel de importação em massa (2026-09-01).
 *
 * Fluxo: sobe o PDF do "Formulário de Implementação" → edge `extrair-tenant-pdf`
 * lê e estrutura os dados (menos o catálogo de produtos, ignorado de propósito) →
 * pré-preenche o form → admin revisa e confirma → cria o tenant SEM fechar o
 * modal, pronto pro próximo PDF. Fecha só quando o admin clica "Fechar".
 */

const CAMPOS_EMPRESA = [
  ['nome_comercial', 'Nome comercial'],
  ['razao_social', 'Razão social'],
  ['segmento', 'Segmento'],
  ['descricao_negocio', 'Negócio em 2 parágrafos', 'textarea'],
  ['endereco', 'Endereço'],
];
const CAMPOS_CANAIS = [
  ['site', 'Site'],
  ['instagram', 'Instagram'],
  ['whatsapp_agente', 'WhatsApp do agente'],
  ['chave_pix', 'Chave PIX'],
];
const CAMPOS_AGENTE = [
  ['nome_agente', 'Nome do agente'],
  ['tom_de_voz', 'Tom de voz'],
  ['saudacao', 'Saudação', 'textarea'],
];

// Resto do formulário (horário, funil, formas de pagamento, etc.) não vira
// coluna própria — vai inteiro como anotação em agentes_usuario.configuracao.intake_pdf
// pra não se perder, mas configurar de verdade fica manual depois.
const CAMPOS_MAPEADOS = new Set([
  ...CAMPOS_EMPRESA.map((c) => c[0]), ...CAMPOS_CANAIS.map((c) => c[0]), ...CAMPOS_AGENTE.map((c) => c[0]),
  'responsavel_nome', 'responsavel_email', 'responsavel_whatsapp', 'documento',
]);

const MAPA_TOM = {
  formal: 'formal', técnico: 'formal', descontraído: 'informal',
  'próximo e acolhedor': 'informal', consultivo: 'espelhado',
};
const MAPA_PRESENCA = { presencial: 'fisica', online: 'digital', ambos: 'ambos', 'os dois': 'ambos' };

const soDigitos = (s) => (s || '').replace(/\D/g, '');
const normalizarApelido = (s) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 32);

function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Senha padrão do cadastro em massa — Theus cravou "babel123" pra todos os
// tenants importados via PDF. Fica editável (campo + "Gerar") se algum precisar de outra.
const SENHA_PADRAO = 'babel123';
const FORM_VAZIO = { nome: '', email: '', apelido: '', phone: '', senha: SENHA_PADRAO, planoId: '' };

export function ModalCriarTenant({ onClose, onCriar }) {
  const t = useToast();
  const [form, setForm] = useState(FORM_VAZIO);
  const [campos, setCampos] = useState({});
  const [dadosPdf, setDadosPdf] = useState(null);
  const [nichoId, setNichoId] = useState('');
  const [nichos, setNichos] = useState([]);
  const [showSenha, setShowSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState('');
  const [criados, setCriados] = useState(0);
  const planos = (window.RAGENTIC_DATA.PLANOS || []).filter((p) => p.is_active !== false);
  const apelidoValido = !form.apelido || /^[a-zA-Z0-9_.\-]{2,32}$/.test(form.apelido);
  const senhaValida = form.senha.length >= 6;
  const ok = form.nome && form.email && apelidoValido && senhaValida;

  useEffect(() => { window.RAGENTIC_HOOKS?.listarNichos?.().then(setNichos); }, []);

  const gerarSenha = () => {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    const arr = new Uint32Array(14);
    crypto.getRandomValues(arr);
    let s = '';
    for (let i = 0; i < 14; i++) s += alfabeto[arr[i] % alfabeto.length];
    return s;
  };

  const importarPdf = async (arquivo) => {
    if (!arquivo) return;
    setImportando(true); setErro('');
    try {
      const b64 = await arquivoParaBase64(arquivo);
      const r = await window.RAGENTIC_HOOKS?.extrairTenantDePdf?.(b64);
      if (!r || r.erro) { setErro(r?.erro || 'Falha ao importar PDF'); return; }
      const d = r.dados || {};
      setDadosPdf(d);
      setForm((f) => ({
        ...f,
        nome: d.responsavel_nome || f.nome,
        email: d.responsavel_email || f.email,
        phone: d.responsavel_whatsapp || f.phone,
        apelido: f.apelido || normalizarApelido(d.nome_comercial || d.responsavel_nome),
        senha: f.senha || SENHA_PADRAO,
      }));
      const extra = {};
      for (const [chave] of [...CAMPOS_EMPRESA, ...CAMPOS_CANAIS, ...CAMPOS_AGENTE]) extra[chave] = d[chave] || '';
      setCampos(extra);
      setShowSenha(true);
      // casa o segmento do formulário com um nicho existente (por nome, best-effort)
      if (d.segmento && nichos.length) {
        const alvo = d.segmento.trim().toLowerCase();
        const achado = nichos.find((n) => n.nome.toLowerCase() === alvo || n.nome.toLowerCase().includes(alvo) || alvo.includes(n.nome.toLowerCase()));
        if (achado) setNichoId(achado.id);
      }
      t.success('PDF importado — confira os campos antes de criar');
    } catch (e) {
      setErro(e?.message || 'Falha ao ler o arquivo');
    } finally {
      setImportando(false);
    }
  };

  const copiarSenha = async () => {
    try { await navigator.clipboard.writeText(form.senha); t.success('Senha copiada'); }
    catch { /* clipboard pode estar bloqueado pelo navegador */ }
  };

  const resetarParaProximo = () => {
    setForm(FORM_VAZIO); setCampos({}); setDadosPdf(null); setNichoId(''); setShowSenha(false); setErro('');
  };

  const submeter = async () => {
    if (!ok || salvando) return;
    setSalvando(true); setErro('');
    const r = await window.RAGENTIC_HOOKS?.criarTenant?.({ nome: form.nome, email: form.email, senha: form.senha });
    if (!r || r.erro) { setSalvando(false); setErro(r?.erro || 'Falha ao criar tenant'); return; }
    const uid = r.user_id;
    if (uid) {
      const documento = soDigitos(dadosPdf?.documento);
      await window.RAGENTIC_HOOKS?.salvarTenant?.(uid, {
        apelido: form.apelido || undefined,
        phone: form.phone || undefined,
        cnpj: documento || undefined,
        tipo_pessoa: documento ? (documento.length === 14 ? 'pj' : 'pf') : undefined,
        chave_pix: campos.chave_pix || undefined,
        nicho_id: nichoId || undefined,
      });
      const temEmpresa = campos.nome_comercial || campos.descricao_negocio || campos.endereco || campos.site || campos.instagram;
      if (temEmpresa) {
        await window.RAGENTIC_HOOKS?.salvarEmpresaTenant?.(uid, {
          nome: campos.nome_comercial || form.nome,
          cnpj: documento || undefined,
          descricao: campos.descricao_negocio || undefined,
          endereco: campos.endereco || undefined,
          site: campos.site || undefined,
          instagram: campos.instagram || undefined,
          whatsapp: campos.whatsapp_agente || form.phone || undefined,
          tipo_presenca: MAPA_PRESENCA[(dadosPdf?.modo_atendimento || '').toLowerCase()] || undefined,
        });
      }
      const restoIntake = dadosPdf
        ? Object.fromEntries(Object.entries(dadosPdf).filter(([k, v]) => !CAMPOS_MAPEADOS.has(k) && v))
        : null;
      if (campos.nome_agente || campos.tom_de_voz || restoIntake) {
        await window.RAGENTIC_HOOKS?.salvarAgenteTenant?.(uid, {
          nome_agente: campos.nome_agente || undefined,
          tom_agente: MAPA_TOM[(campos.tom_de_voz || '').toLowerCase()] || undefined,
          configuracao_merge: restoIntake && Object.keys(restoIntake).length ? { intake_pdf: restoIntake } : undefined,
        });
      }
    }
    let planoNome = '—';
    if (uid && form.planoId) {
      const rp = await window.RAGENTIC_HOOKS?.ativarPlanoTenant?.(uid, form.planoId);
      if (!rp?.erro) planoNome = planos.find((p) => p.id === form.planoId)?.nome || '—';
    }
    setSalvando(false);
    onCriar({ id: uid, nome: form.nome, email: form.email, phone: form.phone, plano: planoNome });
    setCriados((n) => n + 1);
    t.success('Tenant criado · pronto pro próximo PDF');
    resetarParaProximo();
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal" style={{ width: 640, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div className="h2">Criar tenant {criados > 0 && <span className="badge badge-success" style={{ marginLeft: 6 }}>{criados} criado(s) nesta sessão</span>}</div>
            <div className="muted small">Importe o PDF do formulário ou preencha na mão.</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>

        <div className="os-vidro row gap-3" style={{ padding: 12, marginBottom: 16, alignItems: 'center' }}>
          <Icon name="upload" size={18} />
          <div style={{ flex: 1 }}>
            <div className="h3" style={{ fontSize: 13 }}>Importar de PDF</div>
            <div className="muted tiny">Formulário de implementação (Google Forms) — absorve tudo, menos a lista de produtos.</div>
          </div>
          <label className="btn btn-sm" style={{ cursor: importando ? 'default' : 'pointer', opacity: importando ? 0.6 : 1 }}>
            {importando ? 'Lendo…' : 'Escolher PDF'}
            <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={importando}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importarPdf(f); }} />
          </label>
        </div>

        <div className="col gap-3">
          <div><label className="label">Nome do tenant</label><input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="João Silva" /></div>
          <div><label className="label">E-mail</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="joao@empresa.com" autoCapitalize="none" /></div>
          <div>
            <label className="label">Senha de acesso</label>
            <div className="row gap-2">
              <div style={{ flex: 1, position: 'relative' }}>
                <input className="input mono" type={showSenha ? 'text' : 'password'} value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder="mínimo 6 caracteres"
                  autoCapitalize="none" spellCheck={false} style={{ paddingRight: 38 }} />
                <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={() => setShowSenha((s) => !s)} style={{ position: 'absolute', right: 4, top: 4 }}>
                  <Icon name={showSenha ? 'eyeOff' : 'eye'} size={13} />
                </button>
              </div>
              <button className="btn btn-sm" type="button" onClick={() => setForm((f) => ({ ...f, senha: gerarSenha() }))}>Gerar</button>
              <button className="btn btn-sm" type="button" onClick={copiarSenha} disabled={!form.senha}>Copiar</button>
            </div>
            <div className="muted tiny" style={{ marginTop: 4 }}>
              {form.senha && !senhaValida ? <span style={{ color: 'oklch(0.7 0.2 25)' }}>A senha precisa de no mínimo 6 caracteres.</span> : 'O tenant entra com e-mail + senha. Anote e repasse com segurança.'}
            </div>
          </div>
          <div className="row gap-3">
            <div style={{ flex: 1 }}>
              <label className="label">Apelido (login conversacional do Porteiro)</label>
              <input className="input mono" value={form.apelido} onChange={(e) => setForm({ ...form, apelido: e.target.value.trim() })} placeholder="joaosilva" autoCapitalize="none" spellCheck={false} />
              <div className="muted tiny" style={{ marginTop: 4 }}>
                {form.apelido && !apelidoValido ? <span style={{ color: 'oklch(0.7 0.2 25)' }}>2-32 caracteres · só letras, números, _ . -</span> : 'Opcional. Único na plataforma.'}
              </div>
            </div>
            <div style={{ flex: 1 }}><label className="label">Telefone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+55 11 99999-9999" /></div>
          </div>
          <div className="row gap-3">
            <div style={{ flex: 1 }}>
              <label className="label">Plano inicial (opcional)</label>
              <select className="input" value={form.planoId} onChange={(e) => setForm({ ...form, planoId: e.target.value })}>
                <option value="" style={{ background: '#1a1530' }}>Sem plano por enquanto</option>
                {planos.map((p) => <option key={p.id} value={p.id} style={{ background: '#1a1530' }}>{p.nome} — R$ {p.preco}/mês</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Nicho (base de conhecimento)</label>
              <select className="input" value={nichoId} onChange={(e) => setNichoId(e.target.value)}>
                <option value="" style={{ background: '#1a1530' }}>Sem nicho ainda</option>
                {nichos.map((n) => <option key={n.id} value={n.id} style={{ background: '#1a1530' }}>{n.nome}</option>)}
              </select>
            </div>
          </div>

          {dadosPdf && (
            <>
              <GrupoCampos titulo="Empresa" campos={CAMPOS_EMPRESA} valores={campos} setValores={setCampos} />
              <GrupoCampos titulo="Canais" campos={CAMPOS_CANAIS} valores={campos} setValores={setCampos} />
              <GrupoCampos titulo="Agente" campos={CAMPOS_AGENTE} valores={campos} setValores={setCampos} />
              <div className="muted tiny">
                Resto do formulário (horário, funil, pagamento, garantia…) vai guardado como anotação do agente pra configurar depois — nada do PDF se perde.
              </div>
            </>
          )}

          {erro && <div className="badge badge-err" style={{ whiteSpace: 'normal' }}>{erro}</div>}
        </div>
        <div className="row gap-2" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose} disabled={salvando}>Fechar</button>
          <button className="btn btn-primary" disabled={!ok || salvando} onClick={submeter} style={{ opacity: ok && !salvando ? 1 : 0.5 }}>
            {salvando ? 'Criando…' : 'Criar tenant'}
          </button>
        </div>
      </div>
    </>
  );
}

function GrupoCampos({ titulo, campos, valores, setValores }) {
  return (
    <div className="os-vidro" style={{ padding: 12 }}>
      <div className="muted tiny" style={{ textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{titulo}</div>
      <div className="col gap-2">
        {campos.map(([chave, rotulo, tipo]) => (
          <div key={chave}>
            <label className="label">{rotulo}</label>
            {tipo === 'textarea' ? (
              <textarea className="input" rows={2} value={valores[chave] || ''} onChange={(e) => setValores((v) => ({ ...v, [chave]: e.target.value }))} />
            ) : (
              <input className="input" value={valores[chave] || ''} onChange={(e) => setValores((v) => ({ ...v, [chave]: e.target.value }))} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
