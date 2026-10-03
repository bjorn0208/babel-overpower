// @ts-nocheck
/**
 * App "Textos" — editor visual de documentos. Primeiro app instalável do catálogo.
 *
 * Layout: sidebar à esquerda (lista de arquivos) + editor à direita.
 * Editor usa contentEditable nativo com toolbar custom (bold, italic, h1, h2, h3,
 * lista, citação, link). Salva HTML em arquivos_textos.conteudo.
 *
 * Auto-save: debounce de 1.5s após cada tecla. Estado visual no rodapé.
 *
 * Design: paleta da plataforma + tipografia serif na área de escrita pra
 * sensação de "papel digital" — diferente do WordPress (proteção de plágio).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';
import './textos.css';

type Arquivo = {
  id: string;
  titulo: string;
  conteudo: string;
  updated_at: string;
  created_at: string;
};

const DEBOUNCE_MS = 1500;

const fmtData = (iso: string) => {
  try {
    const d = new Date(iso);
    const hoje = new Date();
    const mesmoDia =
      d.getFullYear() === hoje.getFullYear() &&
      d.getMonth() === hoje.getMonth() &&
      d.getDate() === hoje.getDate();
    if (mesmoDia) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
};

const BOTOES_TOOLBAR: Array<
  | { tipo: 'comando'; comando: string; valor?: string; rotulo: string; titulo: string }
  | { tipo: 'sep' }
> = [
  { tipo: 'comando', comando: 'bold', rotulo: 'B', titulo: 'Negrito (Ctrl+B)' },
  { tipo: 'comando', comando: 'italic', rotulo: 'I', titulo: 'Itálico (Ctrl+I)' },
  { tipo: 'comando', comando: 'underline', rotulo: 'U', titulo: 'Sublinhado' },
  { tipo: 'sep' },
  { tipo: 'comando', comando: 'formatBlock', valor: 'h1', rotulo: 'H1', titulo: 'Título 1' },
  { tipo: 'comando', comando: 'formatBlock', valor: 'h2', rotulo: 'H2', titulo: 'Título 2' },
  { tipo: 'comando', comando: 'formatBlock', valor: 'h3', rotulo: 'H3', titulo: 'Título 3' },
  { tipo: 'comando', comando: 'formatBlock', valor: 'p', rotulo: '¶', titulo: 'Parágrafo' },
  { tipo: 'sep' },
  { tipo: 'comando', comando: 'insertUnorderedList', rotulo: '•', titulo: 'Lista' },
  { tipo: 'comando', comando: 'insertOrderedList', rotulo: '1.', titulo: 'Lista numerada' },
  { tipo: 'comando', comando: 'formatBlock', valor: 'blockquote', rotulo: '"', titulo: 'Citação' },
];

export function AppTextos() {
  const t = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null);
  const [ativoId, setAtivoId] = useState<string | null>(null);
  const [status, setStatus] = useState<'salvo' | 'salvando' | 'erro' | 'pristine'>('pristine');
  const [tituloLocal, setTituloLocal] = useState('');
  const editorRef = useRef<HTMLDivElement | null>(null);
  const conteudoLocalRef = useRef<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignorarProxInputRef = useRef<boolean>(false);

  // Pega sessão + carrega arquivos
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id ?? null;
      if (!vivo) return;
      setUserId(uid);
      if (!uid) {
        setArquivos([]);
        return;
      }
      const { data: linhas, error } = await supabase
        .from('arquivos_textos')
        .select('id, titulo, conteudo, created_at, updated_at')
        .order('updated_at', { ascending: false });
      if (!vivo) return;
      if (error) {
        console.error('[Textos] listar:', error);
        t.error('Erro ao carregar arquivos.');
        setArquivos([]);
        return;
      }
      setArquivos((linhas ?? []) as Arquivo[]);
      if ((linhas ?? []).length > 0) {
        const primeiro = linhas![0];
        setAtivoId(primeiro.id);
        setTituloLocal(primeiro.titulo || '');
        conteudoLocalRef.current = primeiro.conteudo || '';
        ignorarProxInputRef.current = true;
        queueMicrotask(() => {
          if (editorRef.current) editorRef.current.innerHTML = primeiro.conteudo || '';
        });
      }
    })();
    return () => {
      vivo = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ativo = useMemo(
    () => (arquivos || []).find((a) => a.id === ativoId) || null,
    [arquivos, ativoId],
  );

  const salvarAgora = useCallback(
    async (id: string, payload: { titulo?: string; conteudo?: string }) => {
      setStatus('salvando');
      const { error } = await supabase
        .from('arquivos_textos')
        .update(payload)
        .eq('id', id);
      if (error) {
        console.error('[Textos] salvar:', error);
        setStatus('erro');
        return;
      }
      setStatus('salvo');
      setArquivos((prev) =>
        (prev || [])
          .map((a) => (a.id === id ? { ...a, ...payload, updated_at: new Date().toISOString() } : a))
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
      );
    },
    [],
  );

  // Acumula os campos pendentes (título E conteúdo) do MESMO arquivo num único
  // payload. Antes um debounce só servia os dois campos: digitar o título e logo
  // depois o conteúdo fazia o segundo agendamento CANCELAR o primeiro, e o título
  // nunca chegava a salvar mesmo com o rodapé mostrando "Salvo". Agora o payload é
  // mesclado e há flush do pendente antes de trocar de arquivo / desmontar.
  const pendenteRef = useRef<{ id: string; payload: { titulo?: string; conteudo?: string } } | null>(null);

  const flushPendente = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const p = pendenteRef.current;
    pendenteRef.current = null;
    if (p) void salvarAgora(p.id, p.payload);
  }, [salvarAgora]);

  const agendarSalvar = useCallback(
    (id: string, payload: { titulo?: string; conteudo?: string }) => {
      // Havia edição pendente de OUTRO arquivo → salva já, não deixa se perder.
      if (pendenteRef.current && pendenteRef.current.id !== id) {
        const anterior = pendenteRef.current;
        pendenteRef.current = null;
        void salvarAgora(anterior.id, anterior.payload);
      }
      pendenteRef.current = {
        id,
        payload: { ...(pendenteRef.current?.payload ?? {}), ...payload },
      };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setStatus('salvando');
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const p = pendenteRef.current;
        pendenteRef.current = null;
        if (p) void salvarAgora(p.id, p.payload);
      }, DEBOUNCE_MS);
    },
    [salvarAgora],
  );

  // Flush ao desmontar — edição parada no debounce não se perde.
  useEffect(() => flushPendente, [flushPendente]);

  const trocarAtivo = useCallback(
    (id: string) => {
      if (id === ativoId) return;
      const novo = (arquivos || []).find((a) => a.id === id);
      if (!novo) return;
      // Flush do save pendente ANTES de trocar — senão a edição do arquivo atual
      // que estava no debounce se perde ao trocar de arquivo.
      flushPendente();
      setAtivoId(id);
      setTituloLocal(novo.titulo || '');
      conteudoLocalRef.current = novo.conteudo || '';
      ignorarProxInputRef.current = true;
      if (editorRef.current) editorRef.current.innerHTML = novo.conteudo || '';
      setStatus('salvo');
    },
    [arquivos, ativoId, flushPendente],
  );

  const novoArquivo = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('arquivos_textos')
      .insert({ user_id: userId, titulo: 'Sem título', conteudo: '' })
      .select('id, titulo, conteudo, created_at, updated_at')
      .maybeSingle();
    if (error || !data) {
      console.error('[Textos] criar:', error);
      t.error('Falha ao criar arquivo.');
      return;
    }
    setArquivos((prev) => [data as Arquivo, ...(prev || [])]);
    trocarAtivo((data as Arquivo).id);
    setTimeout(() => editorRef.current?.focus(), 50);
  };

  const excluirAtivo = async () => {
    if (!ativo) return;
    if (!window.confirm(`Excluir "${ativo.titulo || 'Sem título'}"?\nNão dá pra desfazer.`)) return;
    const { error } = await supabase
      .from('arquivos_textos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', ativo.id);
    if (error) {
      console.error('[Textos] excluir:', error);
      t.error('Falha ao excluir.');
      return;
    }
    setArquivos((prev) => (prev || []).filter((a) => a.id !== ativo.id));
    const proximos = (arquivos || []).filter((a) => a.id !== ativo.id);
    if (proximos.length > 0) {
      trocarAtivo(proximos[0].id);
    } else {
      setAtivoId(null);
      setTituloLocal('');
      conteudoLocalRef.current = '';
      if (editorRef.current) editorRef.current.innerHTML = '';
    }
    t.success('Arquivo excluído');
  };

  const onTitulo = (e: any) => {
    const novo = e.target.value;
    setTituloLocal(novo);
    if (ativoId) agendarSalvar(ativoId, { titulo: novo || 'Sem título' });
  };

  const onInputEditor = () => {
    if (ignorarProxInputRef.current) {
      ignorarProxInputRef.current = false;
      return;
    }
    if (!editorRef.current || !ativoId) return;
    conteudoLocalRef.current = editorRef.current.innerHTML;
    agendarSalvar(ativoId, { conteudo: conteudoLocalRef.current });
  };

  const aplicarComando = (comando: string, valor?: string) => {
    editorRef.current?.focus();
    try {
      document.execCommand(comando, false, valor);
      onInputEditor();
    } catch (e) {
      console.warn('[Textos] execCommand:', e);
    }
  };

  const inserirLink = () => {
    const url = window.prompt('URL do link (com http:// ou https://)');
    if (!url) return;
    aplicarComando('createLink', url);
  };

  const statusTexto = {
    pristine: 'Sem alterações',
    salvando: 'Salvando…',
    salvo: 'Salvo',
    erro: 'Erro ao salvar',
  }[status];

  if (arquivos === null) {
    return (
      <div className="textos-root">
        <div className="muted" style={{ padding: 40 }}>Carregando arquivos…</div>
      </div>
    );
  }

  return (
    <div className="textos-root">
      <aside className="textos-sidebar">
        <div className="textos-sidebar-topo">
          <span className="textos-sidebar-titulo">Arquivos</span>
          <button className="btn btn-primary btn-sm" onClick={novoArquivo} title="Novo arquivo">
            <Icon name="plus" size={12} /> Novo
          </button>
        </div>
        <div className="textos-sidebar-lista">
          {arquivos.length === 0 && (
            <div className="textos-vazio-lista">
              <Icon name="fileText" size={28} stroke="rgba(255,255,255,0.35)" />
              <div>Nenhum arquivo ainda.</div>
              <div style={{ opacity: 0.7 }}>Clique em "Novo" pra começar.</div>
            </div>
          )}
          {arquivos.map((a) => (
            <div
              key={a.id}
              className={`textos-item ${a.id === ativoId ? 'ativo' : ''}`}
              onClick={() => trocarAtivo(a.id)}
            >
              <div className="textos-item-titulo">{a.titulo || 'Sem título'}</div>
              <div className="textos-item-meta">{fmtData(a.updated_at)}</div>
            </div>
          ))}
        </div>
      </aside>

      <main className="textos-editor">
        {!ativo && (
          <div className="textos-editor-vazio">
            <Icon name="fileText" size={48} stroke="rgba(255,255,255,0.3)" />
            <div className="h3">Nenhum arquivo selecionado</div>
            <div className="muted small">Selecione um arquivo da lista ou crie um novo.</div>
            <button className="btn btn-primary" onClick={novoArquivo}>
              <Icon name="plus" size={13} /> Criar primeiro arquivo
            </button>
          </div>
        )}

        {ativo && (
          <>
            <div className="textos-editor-topo">
              <input
                className="textos-titulo-input"
                value={tituloLocal}
                onChange={onTitulo}
                placeholder="Título do arquivo…"
              />
              <button className="btn btn-ghost btn-icon btn-sm" onClick={excluirAtivo} title="Excluir arquivo">
                <Icon name="x" size={14} />
              </button>
            </div>

            <div className="textos-toolbar">
              {BOTOES_TOOLBAR.map((b, i) =>
                b.tipo === 'sep' ? (
                  <span key={`sep-${i}`} className="textos-toolbar-sep" />
                ) : (
                  <button
                    key={`${b.comando}-${b.valor ?? ''}`}
                    type="button"
                    className="textos-toolbar-btn"
                    title={b.titulo}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => aplicarComando(b.comando, b.valor)}
                    style={b.comando === 'bold' ? { fontWeight: 700 } : b.comando === 'italic' ? { fontStyle: 'italic' } : b.comando === 'underline' ? { textDecoration: 'underline' } : undefined}
                  >
                    {b.rotulo}
                  </button>
                ),
              )}
              <button
                type="button"
                className="textos-toolbar-btn"
                title="Inserir link"
                onMouseDown={(e) => e.preventDefault()}
                onClick={inserirLink}
                style={{ width: 'auto', padding: '0 10px' }}
              >
                🔗 link
              </button>
            </div>

            <div
              ref={editorRef}
              className="textos-conteudo"
              contentEditable
              suppressContentEditableWarning
              onInput={onInputEditor}
              spellCheck
            />

            <div className="textos-rodape">
              <span>Editando · {fmtData(ativo.updated_at)}</span>
              <span className={`textos-status ${status}`}>
                {status === 'salvando' && <Icon name="loader" size={12} />}
                {status === 'salvo' && <Icon name="check" size={12} />}
                {status === 'erro' && <Icon name="alertTriangle" size={12} />}
                {statusTexto}
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
