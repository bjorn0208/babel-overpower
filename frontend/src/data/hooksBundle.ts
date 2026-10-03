import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { salvarPreferenciasUi, type PreferenciasUi } from "@/preferencias/usePreferenciasUi";
import { marcarNotificacaoLida, marcarNotificacoesAppLidas, removerNotificacao, limparNotificacoes } from "@/notificacoes/useNotificacoes";

/**
 * Hooks de mutação expostos em window.RAGENTIC_HOOKS para o bundle (vendored)
 * chamar fire-and-forget. Falhas só logam — UX otimista é mantida pelo bundle.
 */

export type HooksBundle = {
  aprovarPedido: (id: string) => Promise<void>;
  recusarPedido: (id: string) => Promise<void>;
  pagarSaque: (id: string) => Promise<void>;
  recusarSaque: (id: string) => Promise<void>;
  toggleMembroAtivo: (id: string, ativo: boolean) => Promise<void>;
  salvarPermissoesMembro: (id: string, permissions: string[]) => Promise<void>;
  removerMembro: (id: string) => Promise<{ erro?: string }>;
  salvarApelidoMembro: (id: string, apelido: string) => Promise<{ erro?: string }>;
  convidarMembro: (form: { nome: string; email: string; senha: string; apelido: string }) => Promise<{ erro?: string; reativado?: boolean }>;
  criarTenant: (form: { nome: string; email: string; senha: string }) => Promise<{ erro?: string; user_id?: string; tenant_id?: string }>;
  extrairTenantDePdf: (arquivoBase64: string) => Promise<{ erro?: string; dados?: Record<string, any> }>;
  listarNichos: () => Promise<{ id: string; nome: string }[]>;
  salvarEmpresaTenant: (tenantId: string, patch: Record<string, any>) => Promise<{ erro?: string }>;
  salvarAgenteTenant: (tenantId: string, patch: Record<string, any>) => Promise<{ erro?: string }>;
  criarContrato: (form: { titulo: string; cliente: string; valor: number }) => Promise<{ erro?: string; id?: string }>;
  salvarTenant: (id: string, patch: Record<string, any>) => Promise<{ erro?: string }>;
  toggleTenantAtivo: (id: string, ativo: boolean) => Promise<{ erro?: string }>;
  ativarPlanoTenant: (tenantId: string, planoId: string, opts?: { dataExpiracaoISO?: string; maxConversas?: number; maxCiclos?: number; preco?: number; observacao?: string; lancarComissao?: boolean }) => Promise<{ erro?: string; id?: string }>;
  cancelarPlanoTenant: (tenantId: string) => Promise<{ erro?: string }>;
  zerarContadorTenant: (tenantId: string) => Promise<{ erro?: string }>;
  impersonar: (targetUserId: string, motivo?: string) => Promise<{ erro?: string; url?: string }>;
  redefinirSenhaTenant: (userId: string, novaSenha: string) => Promise<{ erro?: string }>;
  excluirTenant: (tenantId: string, acao?: "excluir" | "restaurar") => Promise<{ erro?: string; aviso?: string; contas?: number; canais?: number }>;
  carregarMembrosTenant: (tenantId: string) => Promise<any[]>;
  salvarCanalZapi: (tenantId: string, patch: Record<string, any>) => Promise<{ erro?: string; id?: string }>;
  carregarCanalZapiAdmin: (tenantId: string) => Promise<any | null>;
  carregarCanalInstagramAdmin: (tenantId: string) => Promise<any | null>;
  salvarCanalInstagram: (tenantId: string, patch: Record<string, any>) => Promise<{ erro?: string; id?: string }>;
  instagramTestarConexao: (tenantId: string) => Promise<{ ok: boolean; username?: string; erro?: string }>;
  // Loja Admin (CRUD)
  lojaListar: (tabela: "loja_planos" | "loja_pacotes_extra" | "loja_implantacao" | "loja_plus" | "loja_aplicativos") => Promise<any[]>;
  lojaSalvar: (tabela: string, registro: any) => Promise<{ erro?: string; id?: string }>;
  lojaRemover: (tabela: string, id: string) => Promise<{ erro?: string }>;
  modelosLlm: () => Promise<any[]>;
  // Sócio Comercial / Multinível
  multinivelListarNiveis: () => Promise<any[]>;
  multinivelSalvarNivel: (registro: any) => Promise<{ erro?: string; id?: string }>;
  multinivelRemoverNivel: (id: string) => Promise<{ erro?: string }>;
  multinivelKpis: () => Promise<{ socios_ativos: number; a_pagar_mes: number; convertidos: number }>;
  // Branding (uploads para bucket "logos")
  brandingUploadArquivo: (arquivo: File, tipo: "logo" | "favicon") => Promise<{ erro?: string; url?: string }>;
  // Preferências de UI + Notificações
  salvarPreferenciasUi: (patch: Partial<PreferenciasUi>) => Promise<void>;
  marcarNotificacaoLida: (id: string) => Promise<void>;
  marcarNotificacoesAppLidas: (slug: string) => Promise<void>;
  removerNotificacao: (id: string) => Promise<void>;
  limparNotificacoes: () => Promise<void>;
};

function err(ctx: string, e: any) {
  if (e) console.error(`[hooksBundle:${ctx}]`, e.message || e);
}

function criarClienteImpersonacaoIsolado() {
  return createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        storage: window.sessionStorage,
        storageKey: "ragentic-impersonacao-auth",
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  );
}

export function instalarHooksBundle(uidPai: string | null) {
  const hooks: HooksBundle = {
    aprovarPedido: async (id) => {
      const { error } = await supabase.from("pedidos_compra").update({ status: "aprovado" }).eq("id", id);
      err("aprovarPedido", error);
    },
    recusarPedido: async (id) => {
      const { error } = await supabase.from("pedidos_compra").update({ status: "recusado" }).eq("id", id);
      err("recusarPedido", error);
    },
    pagarSaque: async (id) => {
      const { error } = await supabase.from("multinivel_saques").update({ status: "pago" }).eq("id", id);
      err("pagarSaque", error);
    },
    recusarSaque: async (id) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // RPC recusar_saque existe no banco mas types.ts não foi regenerado após migration.
      const { error } = await (supabase as any).rpc('recusar_saque', { p_saque_id: id });
      err('recusarSaque', error);
    },
    toggleMembroAtivo: async (id, ativo) => {
      const { error } = await supabase.from("profiles").update({ is_active: ativo }).eq("id", id);
      err("toggleMembroAtivo", error);
    },
    salvarPermissoesMembro: async (id, permissions) => {
      const { error } = await supabase.from("profiles").update({ page_permissions: permissions }).eq("id", id);
      err("salvarPermissoesMembro", error);
    },
    removerMembro: async (id) => {
      // 2026-09-24 (Adrian Alves): remover passa pelo servidor (função remover-membro): marca o perfil como removido,
      // revoga o acesso ao app Gestão e BLOQUEIA o login. Não apaga auth nem histórico; reativar pela Equipe desbloqueia.
      const { data, error } = await supabase.functions.invoke("remover-membro", { body: { id } });
      if (error) {
        err("removerMembro", error);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          const corpo = await ctx.json().catch(() => null);
          if (corpo?.error) return { erro: String(corpo.error) };
        }
        return { erro: error.message };
      }
      if (data?.error) return { erro: data.error };
      return {};
    },
    salvarApelidoMembro: async (id, apelido) => {
      // apelido = login do membro no Porteiro. citext UNIQUE no banco.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ apelido: apelido.trim() })
        .eq("id", id);
      if (error) { err("salvarApelidoMembro", error); return { erro: error.message }; }
      return {};
    },
    convidarMembro: async (_form) => {
      try {
        const { data, error } = await supabase.functions.invoke("convidar-membro", {
          body: { nome: _form.nome, email: _form.email, senha: _form.senha, apelido: _form.apelido },
        });
        if (error) {
          err("convidarMembro", error);
          // A função responde {error: "<código>"} com status 4xx/5xx; o supabase-js só dá "non-2xx status code" em
          // error.message e guarda a resposta em error.context. Lê o código de lá para a tela dizer o motivo real.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === "function") {
            const corpo = await ctx.json().catch(() => null);
            if (corpo?.error) return { erro: String(corpo.error) };
          }
          return { erro: error.message };
        }
        if (data?.error) return { erro: data.error };
        return { reativado: !!data?.reativado };
      } catch (e: any) {
        err("convidarMembro", e);
        return { erro: e?.message ?? "erro_desconhecido" };
      }
    },
    criarTenant: async (_form) => {
      try {
        const { data, error } = await supabase.functions.invoke("admin-ativar-cliente", {
          body: {
            email: _form.email,
            password: _form.senha,
            full_name: _form.nome,
            company_name: _form.nome,
          },
        });
        if (error) {
          // A edge devolve o motivo no corpo (email já cadastrado, senha curta, sem permissão).
          let motivo = error.message;
          try {
            const ctx = (error as any)?.context;
            const txt = await ctx?.text?.();
            if (txt) { const j = JSON.parse(txt); if (j?.error) motivo = j.error; }
          } catch { /* mantém error.message */ }
          err("criarTenant", error);
          return { erro: motivo };
        }
        if (data?.error) return { erro: data.error };
        return { user_id: data?.user_id, tenant_id: data?.tenant_id };
      } catch (e: any) {
        err("criarTenant", e);
        return { erro: e?.message ?? "erro_desconhecido" };
      }
    },
    criarContrato: async (form) => {
      if (!uidPai) return { erro: "sessão ausente" };
      const { data, error } = await supabase.from("contratos").insert({
        titulo: form.titulo,
        tenant_id: uidPai,
        status: "rascunho",
        dados_cliente: { nome: form.cliente, valor: form.valor },
      }).select("id").maybeSingle();
      if (error) { err("criarContrato", error); return { erro: error.message }; }
      return { id: data?.id };
    },
    extrairTenantDePdf: async (arquivoBase64) => {
      try {
        const { data, error } = await supabase.functions.invoke("extrair-tenant-pdf", {
          body: { arquivo_base64: arquivoBase64 },
        });
        if (error) {
          // A edge devolve o motivo no corpo (PDF sem texto, LLM fora, sem permissão).
          let motivo = error.message;
          try {
            const ctx = (error as any)?.context;
            const txt = await ctx?.text?.();
            if (txt) { const j = JSON.parse(txt); if (j?.mensagem || j?.error) motivo = j.mensagem || j.error; }
          } catch { /* mantém error.message */ }
          err("extrairTenantDePdf", error);
          return { erro: motivo };
        }
        if (data?.ok === false) return { erro: data.mensagem || "Falha ao extrair PDF" };
        return { dados: data?.dados };
      } catch (e: any) {
        err("extrairTenantDePdf", e);
        return { erro: e?.message ?? "erro_desconhecido" };
      }
    },
    listarNichos: async () => {
      const { data, error } = await supabase.from("nichos").select("id, nome_exibicao").eq("ativo", true).order("nome_exibicao");
      if (error) { err("listarNichos", error); return []; }
      return (data || []).map((n: any) => ({ id: String(n.id), nome: String(n.nome_exibicao || "") }));
    },
    salvarEmpresaTenant: async (tenantId, patch) => {
      // empresas: 1 linha por tenant (user_id). RLS empresas_admin_all já libera o admin.
      const permitidos = ["nome", "cnpj", "descricao", "endereco", "bairro", "cep", "cidade", "estado", "tipo_presenca", "site", "instagram", "whatsapp"];
      const limpo: Record<string, any> = { user_id: tenantId };
      for (const k of permitidos) if (k in patch) limpo[k] = patch[k];
      const { error } = await supabase.from("empresas").upsert(limpo as any, { onConflict: "user_id" });
      if (error) { err("salvarEmpresaTenant", error); return { erro: error.message }; }
      return {};
    },
    salvarAgenteTenant: async (tenantId, patch) => {
      // agentes_usuario: RLS admin_user_agents já libera o admin. `configuracao_merge`
      // funde chave nova em `configuracao` sem apagar o que já existia (aditivo).
      const permitidos = ["nome_agente", "tom_agente"];
      const limpo: Record<string, any> = {};
      for (const k of permitidos) if (k in patch) limpo[k] = patch[k];
      if (patch.configuracao_merge) {
        const { data: atual } = await supabase.from("agentes_usuario").select("configuracao").eq("user_id", tenantId).maybeSingle();
        limpo.configuracao = { ...((atual as any)?.configuracao || {}), ...patch.configuracao_merge };
      }
      if (!Object.keys(limpo).length) return {};
      const { error } = await supabase.from("agentes_usuario").update(limpo as any).eq("user_id", tenantId);
      if (error) { err("salvarAgenteTenant", error); return { erro: error.message }; }
      return {};
    },
    salvarTenant: async (id, patch) => {
      // Whitelist de campos editáveis pelo admin
      const permitidos = ["full_name", "email", "phone", "cargo", "cnpj", "tipo_pessoa", "chave_pix", "account_status", "is_active", "apelido", "nicho_id"];
      const limpo: Record<string, any> = {};
      for (const k of permitidos) if (k in patch) limpo[k] = patch[k];
      if (!Object.keys(limpo).length) return {};
      const { error } = await supabase.from("profiles").update(limpo as any).eq("id", id);
      if (error) { err("salvarTenant", error); return { erro: error.message }; }
      return {};
    },
    toggleTenantAtivo: async (id, ativo) => {
      const { error } = await supabase.from("profiles").update({ is_active: ativo }).eq("id", id);
      if (error) { err("toggleTenantAtivo", error); return { erro: error.message }; }
      return {};
    },
    ativarPlanoTenant: async (tenantId, planoId, opts) => {
      // Lê plano da loja e renova/reativa a assinatura do tenant.
      const { data: plano, error: e1 } = await supabase
        .from("loja_planos")
        .select("id, nome, preco_mensal, max_conversas, max_ciclos_por_conversa, dias_expiracao, max_storage_mb")
        .eq("id", planoId)
        .maybeSingle();
      if (e1 || !plano) { err("ativarPlanoTenant.lerPlano", e1); return { erro: e1?.message ?? "plano_nao_encontrado" }; }

      // assinaturas_usuario tem UNIQUE(user_id) — 1 assinatura por tenant.
      // Upsert renova/reativa a linha existente (inclusive expirada/cancelada),
      // zerando o ciclo. O INSERT cru violava o unique → "erro ao ativar plano".
      // opts (opcional) deixa o admin sobrescrever validade e limites — ex.:
      // reativar um vencido por mais X dias ou dar um override de conversas.
      // Sem override, usa os valores do plano da loja.
      const dias = (plano as any).dias_expiracao || 30;
      const expira = opts?.dataExpiracaoISO || new Date(Date.now() + dias * 86400000).toISOString();
      const { data, error } = await supabase.from("assinaturas_usuario").upsert({
        user_id: tenantId,
        plano_id: (plano as any).id,
        plano_nome: (plano as any).nome,
        status: "ativa",
        max_conversas: opts?.maxConversas ?? (plano as any).max_conversas,
        max_ciclos_por_conversa: opts?.maxCiclos ?? (plano as any).max_ciclos_por_conversa,
        max_storage_bytes: ((plano as any).max_storage_mb || 0) * 1024 * 1024,
        preco: opts?.preco ?? (plano as any).preco_mensal,
        conversas_usadas: 0,
        data_inicio: new Date().toISOString(),
        data_expiracao: expira,
        observacao: (opts?.observacao && opts.observacao.trim()) ? opts.observacao.trim() : "Ativado manualmente pelo admin",
      }, { onConflict: "user_id" }).select("id").maybeSingle();
      if (error) { err("ativarPlanoTenant.upsert", error); return { erro: error.message }; }

      // Comissão multinível (opt-in): grava um pedido 'aprovado', que dispara
      // trg_comissao_multinivel_insert (AFTER INSERT) → percorre a cadeia
      // referred_by e credita saldo. NÃO reativa a assinatura (trg_aprovacao_pedido
      // é BEFORE UPDATE), então a data/overrides custom acima são preservados.
      // Best-effort: a ativação já valeu; se o pedido falhar, só loga.
      if (opts?.lancarComissao) {
        const { error: ePedido } = await supabase.from("pedidos_compra").insert({
          user_id: tenantId,
          tipo: "plano",
          item_id: planoId,
          item_nome: (plano as any).nome,
          item_preco: opts?.preco ?? Number((plano as any).preco_mensal) ?? 0,
          status: "aprovado",
        });
        if (ePedido) err("ativarPlanoTenant.comissao", ePedido);
      }

      return { id: data?.id };
    },
    cancelarPlanoTenant: async (tenantId) => {
      // Inativa a assinatura do tenant (status 'cancelada'). expirar_assinaturas
      // não toca 'cancelada'; reativar é via ativarPlanoTenant (upsert).
      const { error } = await supabase.from("assinaturas_usuario")
        .update({ status: "cancelada" })
        .eq("user_id", tenantId);
      if (error) { err("cancelarPlanoTenant", error); return { erro: error.message }; }
      return {};
    },
    zerarContadorTenant: async (tenantId) => {
      // Zera o contador de conversas do ciclo atual, mantendo a data de expiração.
      const { error } = await supabase.from("assinaturas_usuario")
        .update({ conversas_usadas: 0, data_inicio: new Date().toISOString() })
        .eq("user_id", tenantId);
      if (error) { err("zerarContadorTenant", error); return { erro: error.message }; }
      return {};
    },
    excluirTenant: async (tenantId, acao = "excluir") => {
      // Soft delete reversível: marca deleted_at, bane o login e desliga os canais
      // (dono + equipe). acao "restaurar" religa exatamente o que foi desligado.
      try {
        const { data, error } = await supabase.functions.invoke("admin-excluir-tenant", {
          body: { tenant_id: tenantId, acao },
        });
        if (error) {
          let motivo = error.message;
          try {
            const ctx = (error as any)?.context;
            const txt = await ctx?.text?.();
            if (txt) { const j = JSON.parse(txt); if (j?.error) motivo = j.error; }
          } catch { /* mantém error.message */ }
          err("excluirTenant", error);
          return { erro: motivo };
        }
        if (data?.error) return { erro: data.error };
        return { aviso: data?.aviso, contas: data?.contas, canais: data?.canais };
      } catch (e: any) {
        err("excluirTenant", e);
        return { erro: e?.message ?? "erro_desconhecido" };
      }
    },
    redefinirSenhaTenant: async (userId, novaSenha) => {
      try {
        const { data, error } = await supabase.functions.invoke("admin-redefinir-senha", {
          body: { user_id: userId, nova_senha: novaSenha },
        });
        if (error) {
          // A edge devolve o motivo no corpo (sem permissão, senha curta, usuário inexistente).
          let motivo = error.message;
          try {
            const ctx = (error as any)?.context;
            const txt = await ctx?.text?.();
            if (txt) { const j = JSON.parse(txt); if (j?.error) motivo = j.error; }
          } catch { /* mantém error.message */ }
          err("redefinirSenhaTenant", error);
          return { erro: motivo };
        }
        if (data?.error) return { erro: data.error };
        return {};
      } catch (e: any) {
        err("redefinirSenhaTenant", e);
        return { erro: e?.message ?? "erro_desconhecido" };
      }
    },
    impersonar: async (targetUserId, motivo) => {
      try {
        const { data, error } = await supabase.functions.invoke("impersonate-user", {
          body: { target_user_id: targetUserId, motivo: motivo ?? null },
        });
        if (error) {
          // Tenta extrair payload retornado pela função (ex.: 403 com detail/roles)
          const ctx = (error as any)?.context;
          let detail: string | undefined;
          try {
            const txt = await ctx?.text?.();
            if (txt) {
              const j = JSON.parse(txt);
              detail = j?.detail || j?.error || txt;
            }
          } catch { /* ignore */ }
          return { erro: error.message + (detail ? ` (${detail})` : "") };
        }
        if (data?.error) {
          return { erro: data.error + (data.detail ? ` — ${data.detail}` : ""), detail: data.detail };
        }
        if (data?.access_token && data?.refresh_token) {
          // Backup da session do admin (mesma aba) — vai ser restaurada quando sair
          try {
            const { data: adminSess } = await supabase.auth.getSession();
            if (adminSess.session) {
              window.sessionStorage.setItem(
                "ragentic_admin_backup",
                JSON.stringify({
                  access_token: adminSess.session.access_token,
                  refresh_token: adminSess.session.refresh_token,
                }),
              );
            }
          } catch { /* ignore */ }

          // Troca pra session do tenant na MESMA aba (substitui localStorage)
          const { error: sessaoErr } = await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });
          if (sessaoErr) return { erro: sessaoErr.message };

          // Flag pra Topo mostrar bloco amarelo + sair restaurar admin
          window.sessionStorage.setItem("ragentic_impersonacao_ativa", "1");
          // Também sinaliza em localStorage (compartilhado entre abas). Os tokens
          // do tenant vivem em localStorage e vazam pra abas novas/existentes; sem
          // um flag compartilhado, essas abas ficam logadas como tenant SEM banner
          // nem botão de sair (o flag/backup do admin ficavam só em sessionStorage,
          // por aba). Com este flag, o Topo consegue mostrar o banner + "Sair" em
          // qualquer aba, mesmo nas que não rodaram o setSession.
          // IMPORTANTE (fora do escopo deste arquivo — Topo.tsx): ao sair da
          // impersonação, o Topo DEVE remover também este flag do localStorage
          // (`localStorage.removeItem("ragentic_impersonacao_ativa")`), senão as
          // abas do admin seguem mostrando o banner depois de voltar. E em abas
          // SEM `ragentic_admin_backup` (sessionStorage), o "Sair" não tem como
          // restaurar o admin — deve cair num signOut simples (volta ao login).
          try {
            window.localStorage.setItem("ragentic_impersonacao_ativa", "1");
          } catch { /* ignore */ }

          return { url: `${window.location.origin}/?impersonacao=1` };
        }
        if (data?.token_hash) {
          const url = new URL("/impersonar", window.location.origin);
          url.searchParams.set("impersonacao", "1");
          url.searchParams.set("token_hash", data.token_hash);
          url.searchParams.set("type", data.verification_type || "magiclink");
          return { url: url.toString() };
        }
        if (!data?.url) return { erro: "link_impersonacao_ausente" };
        const url = new URL(data.url);
        const redirectTo = url.searchParams.get("redirect_to");
        if (redirectTo) {
          const destino = new URL(redirectTo);
          destino.pathname = "/impersonar";
          destino.searchParams.set("impersonacao", "1");
          url.searchParams.set("redirect_to", destino.toString());
        } else {
          url.searchParams.set("impersonacao", "1");
        }
        return { url: url.toString() };
      } catch (e: any) {
        return { erro: e?.message ?? "erro_desconhecido" };
      }
    },
    carregarMembrosTenant: async (tenantId) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, cargo, avatar_url, is_active, account_status, page_permissions, created_at")
        .eq("parent_user_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) { err("carregarMembrosTenant", error); return []; }
      return data || [];
    },
    carregarCanalZapiAdmin: async (tenantId) => {
      const { data, error } = await supabase
        .from("canais")
        .select("id, type, is_active, zapi_instance_id, zapi_token, zapi_security_token, zapi_api_url, whatsapp_phone, url_foto_perfil, chip_maturity_tier, chip_connected_since, chip_observacao, max_messages_per_hour_override, humanize_enabled, humanize_base_delay_ms, humanize_min_delay_ms, humanize_max_delay_ms, bubble_split_enabled, message_grouping_delay_ms")
        .eq("user_id", tenantId)
        .eq("type", "whatsapp")
        .maybeSingle();
      if (error) { err("carregarCanalZapiAdmin", error); return null; }
      return data || null;
    },
    salvarCanalZapi: async (tenantId, patch) => {
      const permitidos = [
        "is_active", "zapi_instance_id", "zapi_token", "zapi_security_token", "zapi_api_url",
        "whatsapp_phone", "url_foto_perfil", "chip_maturity_tier", "chip_connected_since",
        "chip_observacao", "max_messages_per_hour_override",
        "humanize_enabled", "humanize_base_delay_ms", "humanize_min_delay_ms", "humanize_max_delay_ms",
        "bubble_split_enabled", "message_grouping_delay_ms",
      ];
      const limpo: Record<string, any> = { user_id: tenantId, type: "whatsapp" };
      for (const k of permitidos) if (k in patch) limpo[k] = patch[k];
      // upsert por (user_id, type)
      const { data: existing } = await supabase
        .from("canais").select("id").eq("user_id", tenantId).eq("type", "whatsapp").maybeSingle();
      if (existing?.id) {
        const { error } = await supabase.from("canais").update(limpo as any).eq("id", existing.id);
        if (error) { err("salvarCanalZapi.update", error); return { erro: error.message }; }
        return { id: existing.id };
      }
      const { data, error } = await supabase.from("canais").insert(limpo as any).select("id").maybeSingle();
      if (error) { err("salvarCanalZapi.insert", error); return { erro: error.message }; }
      return { id: data?.id };
    },
    carregarCanalInstagramAdmin: async (tenantId) => {
      const { data, error } = await supabase
        .from("canais")
        .select("id, type, is_active, ig_account_id, ig_token, ig_username")
        .eq("user_id", tenantId)
        .eq("type", "instagram")
        .maybeSingle();
      if (error) { err("carregarCanalInstagramAdmin", error); return null; }
      return data || null;
    },
    salvarCanalInstagram: async (tenantId, patch) => {
      const permitidos = ["is_active", "ig_account_id", "ig_token", "ig_username"];
      const limpo: Record<string, any> = { user_id: tenantId, type: "instagram" };
      for (const k of permitidos) if (k in patch) limpo[k] = patch[k];
      // upsert por (user_id, type) — unique channels_user_id_type_key garante 1 canal instagram por tenant
      const { data: existing } = await supabase
        .from("canais").select("id").eq("user_id", tenantId).eq("type", "instagram").maybeSingle();
      if (existing?.id) {
        const { error } = await supabase.from("canais").update(limpo as any).eq("id", existing.id);
        if (error) { err("salvarCanalInstagram.update", error); return { erro: error.message }; }
        return { id: existing.id };
      }
      const { data, error } = await supabase.from("canais").insert(limpo as any).select("id").maybeSingle();
      if (error) { err("salvarCanalInstagram.insert", error); return { erro: error.message }; }
      return { id: data?.id };
    },
    instagramTestarConexao: async (tenantId) => {
      const { data, error } = await supabase.functions.invoke("instagram-testar-conexao", {
        body: { tenant_id: tenantId },
      });
      if (error) { err("instagramTestarConexao", error); return { ok: false, erro: error.message }; }
      return data as { ok: boolean; username?: string; erro?: string };
    },
    lojaListar: async (tabela) => {
      const ord = (tabela === "loja_planos" || tabela === "loja_aplicativos") ? "ordem" : "created_at";
      const { data, error } = await supabase.from(tabela).select("*").order(ord, { ascending: true });
      if (error) { err("lojaListar." + tabela, error); return []; }
      return data || [];
    },
    lojaSalvar: async (tabela, registro) => {
      const { id, ...rest } = registro || {};
      if (id) {
        const { error } = await supabase.from(tabela as any).update(rest).eq("id", id);
        if (error) { err("lojaSalvar.update." + tabela, error); return { erro: error.message }; }
        return { id };
      }
      const { data, error } = await supabase.from(tabela as any).insert(rest).select("id").maybeSingle();
      if (error) { err("lojaSalvar.insert." + tabela, error); return { erro: error.message }; }
      return { id: (data as any)?.id };
    },
    lojaRemover: async (tabela, id) => {
      const { error } = await supabase.from(tabela as any).delete().eq("id", id);
      if (error) { err("lojaRemover." + tabela, error); return { erro: error.message }; }
      return {};
    },
    modelosLlm: async () => {
      const { data, error } = await supabase
        .from("modelos_llm")
        .select("id, nome")
        .order("nome", { ascending: true });
      if (error) { err("modelosLlm", error); return []; }
      return data || [];
    },
    multinivelListarNiveis: async () => {
      const { data, error } = await supabase
        .from("multinivel_niveis")
        .select("id, nivel, valor, descricao, is_active, tipo_produto, tipo_valor")
        .order("tipo_produto", { ascending: true })
        .order("nivel", { ascending: true });
      if (error) { err("multinivelListarNiveis", error); return []; }
      return data || [];
    },
    multinivelSalvarNivel: async (registro) => {
      const permitidos = ["nivel", "valor", "descricao", "is_active", "tipo_produto", "tipo_valor"];
      const limpo: Record<string, any> = {};
      for (const k of permitidos) if (k in registro) limpo[k] = (registro as any)[k];
      if (registro?.id) {
        const { error } = await (supabase.from("multinivel_niveis") as any).update(limpo).eq("id", registro.id);
        if (error) { err("multinivelSalvarNivel.update", error); return { erro: error.message }; }
        return { id: registro.id };
      }
      const { data, error } = await (supabase.from("multinivel_niveis") as any).insert(limpo).select("id").maybeSingle();
      if (error) { err("multinivelSalvarNivel.insert", error); return { erro: error.message }; }
      return { id: (data as any)?.id };
    },
    multinivelRemoverNivel: async (id) => {
      const { error } = await supabase.from("multinivel_niveis").delete().eq("id", id);
      if (error) { err("multinivelRemoverNivel", error); return { erro: error.message }; }
      return {};
    },
    multinivelKpis: async () => {
      const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
      const [{ count: socios }, { data: comissoes }, { count: convertidos }] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("multinivel_ativo", true),
        supabase.from("multinivel_comissoes")
          .select("valor_comissao")
          .eq("status", "pendente")
          .gte("created_at", inicioMes.toISOString()),
        supabase.from("profiles").select("id", { count: "exact", head: true }).not("referred_by", "is", null).is("parent_user_id", null),
      ]);
      const a_pagar_mes = (comissoes || []).reduce((s: number, r: any) => s + Number(r.valor_comissao || 0), 0);
      return { socios_ativos: socios || 0, a_pagar_mes, convertidos: convertidos || 0 };
    },
    brandingUploadArquivo: async (arquivo, tipo) => {
      const ext = (arquivo.name.split(".").pop() || "png").toLowerCase();
      const path = `branding/${tipo}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("logos").upload(path, arquivo, {
        cacheControl: "3600", upsert: true, contentType: arquivo.type || undefined,
      });
      if (error) { err("brandingUploadArquivo", error); return { erro: error.message }; }
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      return { url: data?.publicUrl };
    },
    salvarPreferenciasUi: async (patch) => {
      if (!uidPai) return;
      try { await salvarPreferenciasUi(uidPai, patch); } catch (e) { err("salvarPreferenciasUi", e); }
    },
    marcarNotificacaoLida: async (id) => { try { await marcarNotificacaoLida(id); } catch (e) { err("marcarNotificacaoLida", e); } },
    marcarNotificacoesAppLidas: async (slug) => {
      if (!uidPai) return;
      try { await marcarNotificacoesAppLidas(uidPai, slug); } catch (e) { err("marcarNotificacoesAppLidas", e); }
    },
    removerNotificacao: async (id) => { try { await removerNotificacao(id); } catch (e) { err("removerNotificacao", e); } },
    limparNotificacoes: async () => {
      if (!uidPai) return;
      try { await limparNotificacoes(uidPai); } catch (e) { err("limparNotificacoes", e); }
    },
  };
  (window as any).RAGENTIC_HOOKS = hooks;
  (window as any).supabaseClient = supabase;
}