// @ts-nocheck
/**
 * App "Estoque" — controle de estoque do tenant.
 *
 * - Itens com quantidade, mínimo e alerta de reposição
 * - Entrada/saída de 1 clique (+/−) e ajuste direto clicando no número
 * - Toda movimentação vira histórico em `estoque_movimentacoes` via RPC
 *   atômica `movimentar_estoque` (quantidade nunca fica negativa — CHECK)
 * - Soft delete via deleted_at
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, useToast } from '@/bundle/bundle-shared';
import { supabase } from '@/integrations/supabase/client';
import './estoque.css';

type Item = {
  id: string;
  nome: string;
  sku: string | null;
  categoria: string | null;
  quantidade: number;
  quantidade_minima: number;
};

const FORM_VAZIO = { nome: '', sku: '', categoria: '', quantidade: '0', quantidade_minima: '0' };

export function AppEstoque() {
  const t = useToast();
  const [userId, setUserId] = useState(null);
  const [itens, setItens] = useState(null);
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [ajusteId, setAjusteId] = useState(null);
  const confirmandoRef = useRef(false); // trava disparo duplo de confirmarAjuste (Enter + blur)
  const [ajusteValor, setAjusteValor] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: ses } = await supabase.auth.getSession();
      const uid = ses?.session?.user?.id ?? null;
      if (!vivo) return;
      setUserId(uid);
      if (!uid) { setItens([]); return; }
      const { data, error } = await supabase
        .from('estoque_itens')
        .select('id, nome, sku, categoria, quantidade, quantidade_minima')
        .is('deleted_at', null)
        .order('nome');
      if (!vivo) return;
      if (error) {
        console.error('[Estoque] carregar falhou:', error);
        t.error('Não consegui carregar o estoque');
        setItens([]);
        return;
      }
      setItens(data ?? []);
    })();
    return () => { vivo = false; };
  }, []);

  const filtrados = useMemo(() => {
    if (!itens) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((i) =>
      [i.nome, i.sku, i.categoria].some((c) => (c ?? '').toLowerCase().includes(q)),
    );
  }, [itens, busca]);

  const abaixoDoMinimo = useMemo(
    () => (itens ?? []).filter((i) => i.quantidade <= i.quantidade_minima && i.quantidade_minima > 0),
    [itens],
  );

  const movimentar = async (item: Item, tipo: 'entrada' | 'saida' | 'ajuste', qtd: number) => {
    const { data, error } = await supabase.rpc('movimentar_estoque', {
      p_item_id: item.id,
      p_tipo: tipo,
      p_quantidade: qtd,
      p_motivo: null,
    });
    if (error) {
      const msg = /check/i.test(error.message ?? '')
        ? 'Saída maior que o estoque disponível'
        : 'Falha na movimentação';
      t.error(msg);
      return;
    }
    setItens((xs) => xs.map((x) => (x.id === item.id ? { ...x, quantidade: data } : x)));
  };

  const confirmarAjuste = async (item: Item) => {
    // Enter dispara confirmarAjuste, que faz setAjusteId(null) → o input desmonta →
    // dispara onBlur → confirmarAjuste DE NOVO. Sem guard, gravava a movimentação
    // 2x (linha duplicada no histórico). O ref in-flight garante um disparo só.
    if (confirmandoRef.current) return;
    confirmandoRef.current = true;
    const novo = parseInt(ajusteValor, 10);
    setAjusteId(null);
    try {
      if (!Number.isFinite(novo) || novo < 0 || novo === item.quantidade) return;
      await movimentar(item, 'ajuste', novo);
    } finally {
      confirmandoRef.current = false;
    }
  };

  const criarItem = async () => {
    const nome = form.nome.trim();
    if (!nome) { t.error('Dá um nome pro item'); return; }
    const qtd = Math.max(0, parseInt(form.quantidade, 10) || 0);
    const minimo = Math.max(0, parseInt(form.quantidade_minima, 10) || 0);
    const { data, error } = await supabase
      .from('estoque_itens')
      .insert({
        tenant_id: userId,
        nome,
        sku: form.sku.trim() || null,
        categoria: form.categoria.trim() || null,
        quantidade: qtd,
        quantidade_minima: minimo,
      })
      .select('id, nome, sku, categoria, quantidade, quantidade_minima')
      .single();
    if (error) {
      console.error('[Estoque] criar falhou:', error);
      t.error('Não consegui criar o item');
      return;
    }
    setItens((xs) => [...xs, data].sort((a, b) => a.nome.localeCompare(b.nome)));
    setForm(FORM_VAZIO);
    setCriando(false);
    t.success(`"${data.nome}" no estoque`);
  };

  const excluirItem = async (item: Item) => {
    if (!confirm(`Excluir "${item.nome}" do estoque? O histórico de movimentações fica guardado.`)) return;
    const { error } = await supabase
      .from('estoque_itens')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) { t.error('Falha ao excluir'); return; }
    setItens((xs) => xs.filter((x) => x.id !== item.id));
  };

  if (itens === null) return <div className="estq-vazio muted">Carregando estoque…</div>;

  return (
    <div className="estq-app">
      <div className="estq-topo">
        <input
          className="estq-busca"
          placeholder="Buscar por nome, SKU ou categoria…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" onClick={() => setCriando((v) => !v)}>
          <Icon name="plus" size={12} /> Novo item
        </button>
      </div>

      {abaixoDoMinimo.length > 0 && (
        <div className="estq-alerta">
          <Icon name="bell" size={12} /> {abaixoDoMinimo.length}{' '}
          {abaixoDoMinimo.length === 1 ? 'item abaixo do mínimo' : 'itens abaixo do mínimo'}:{' '}
          {abaixoDoMinimo.slice(0, 4).map((i) => i.nome).join(', ')}
          {abaixoDoMinimo.length > 4 ? '…' : ''}
        </div>
      )}

      {criando && (
        <div className="estq-form">
          <input placeholder="Nome do item *" value={form.nome} autoFocus
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          <input placeholder="SKU" value={form.sku}
            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
          <input placeholder="Categoria" value={form.categoria}
            onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} />
          <input placeholder="Qtd" type="number" min="0" value={form.quantidade}
            onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
          <input placeholder="Mínimo" type="number" min="0" value={form.quantidade_minima}
            onChange={(e) => setForm((f) => ({ ...f, quantidade_minima: e.target.value }))} />
          <button className="btn btn-primary btn-sm" onClick={() => void criarItem()}>Salvar</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setCriando(false); setForm(FORM_VAZIO); }}>Cancelar</button>
        </div>
      )}

      {filtrados.length === 0 ? (
        <div className="estq-vazio muted">
          {busca ? 'Nada encontrado com essa busca.' : 'Estoque vazio — clica em "Novo item" pra começar.'}
        </div>
      ) : (
        <div className="estq-lista">
          {filtrados.map((item) => {
            const baixo = item.quantidade_minima > 0 && item.quantidade <= item.quantidade_minima;
            return (
              <div key={item.id} className={`estq-linha ${baixo ? 'is-baixo' : ''}`}>
                <div className="estq-info">
                  <div className="estq-nome">{item.nome}</div>
                  <div className="muted tiny">
                    {[item.sku, item.categoria].filter(Boolean).join(' · ') || '—'}
                    {item.quantidade_minima > 0 ? ` · mín ${item.quantidade_minima}` : ''}
                  </div>
                </div>
                {baixo && <span className="estq-selo-baixo">repor</span>}
                <div className="estq-controles">
                  <button className="btn btn-ghost btn-sm" aria-label={`Saída de 1 ${item.nome}`}
                    onClick={() => void movimentar(item, 'saida', 1)}>−</button>
                  {ajusteId === item.id ? (
                    <input
                      className="estq-ajuste"
                      type="number"
                      min="0"
                      autoFocus
                      value={ajusteValor}
                      onChange={(e) => setAjusteValor(e.target.value)}
                      onBlur={() => void confirmarAjuste(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void confirmarAjuste(item);
                        if (e.key === 'Escape') setAjusteId(null);
                      }}
                    />
                  ) : (
                    <button
                      className="estq-qtd mono"
                      title="Clique pra ajustar a quantidade"
                      onClick={() => { setAjusteId(item.id); setAjusteValor(String(item.quantidade)); }}
                    >
                      {item.quantidade}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" aria-label={`Entrada de 1 ${item.nome}`}
                    onClick={() => void movimentar(item, 'entrada', 1)}>+</button>
                  <button className="btn btn-ghost btn-sm estq-excluir" aria-label={`Excluir ${item.nome}`}
                    onClick={() => void excluirItem(item)}>
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
