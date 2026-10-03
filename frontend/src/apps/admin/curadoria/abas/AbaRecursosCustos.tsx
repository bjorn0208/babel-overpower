// Aba "Recursos & Custos" da Curadoria.
// Theus liga/desliga cada recurso da plataforma + vê custo LLM mensal estimado.
// Renomes pt-BR comerciais pra entender o que cada coisa faz.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useRecursosAtivacao, type RecursoAtivacao } from "../dados/use-recursos-ativacao";

const CATEGORIA_ROTULO: Record<RecursoAtivacao["categoria"], string> = {
  motor: "Motor cognitivo",
  sono: "Sono do agente",
  aprendizado: "Aprendizado contínuo",
  cross_nicho: "Entre nichos",
  qualidade: "Qualidade dos dados",
  fosso: "Fosso vertical",
};

const STATUS_COR: Record<RecursoAtivacao["status"], string> = {
  ativo: "oklch(0.65 0.18 145)",
  pausado: "oklch(0.55 0.05 250)",
  bloqueado: "oklch(0.55 0.22 25)",
};

const STATUS_ROTULO: Record<RecursoAtivacao["status"], string> = {
  ativo: "ATIVO",
  pausado: "PAUSADO",
  bloqueado: "BLOQUEADO",
};

export function AbaRecursosCustos() {
  const { status, recursos, erro, ativar, pausar } = useRecursosAtivacao();
  const [expandido, setExpandido] = useState<string | null>(null);
  const [acaoPendente, setAcaoPendente] = useState<string | null>(null);

  const grupos = useMemo(() => {
    const map = new Map<RecursoAtivacao["categoria"], RecursoAtivacao[]>();
    recursos.forEach((r) => {
      if (!map.has(r.categoria)) map.set(r.categoria, []);
      map.get(r.categoria)!.push(r);
    });
    return Array.from(map.entries());
  }, [recursos]);

  const custoTotal = useMemo(
    () =>
      recursos
        .filter((r) => r.ativo)
        .reduce((s, r) => s + Number(r.custo_estimado_mes_brl ?? 0), 0),
    [recursos],
  );

  const handleToggle = async (r: RecursoAtivacao) => {
    if (r.status === "bloqueado") {
      toast.warning(`Bloqueado: ${r.motivo_bloqueio ?? "motivo não cravado"}`);
      return;
    }
    setAcaoPendente(r.chave_recurso);
    try {
      const res = r.ativo ? await pausar(r.chave_recurso) : await ativar(r.chave_recurso);
      if (res.ok) {
        toast.success(r.ativo ? `Pausado: ${r.nome_comercial}` : `Ativado: ${r.nome_comercial}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aviso = (res as any).aviso;
        if (aviso) toast.info(aviso);
      } else {
        toast.error(res.erro ?? "Falha na operação");
      }
    } finally {
      setAcaoPendente(null);
    }
  };

  if (status === "carregando") {
    return <div className="p-4 text-sm text-txt3">carregando recursos...</div>;
  }
  if (status === "erro") {
    return <div className="p-4 text-sm text-vermelho">erro: {erro}</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar com total */}
      <div className="px-4 py-3 border-b border-borda flex items-center justify-between shrink-0">
        <div>
          <div className="text-sm font-medium text-txt-1">Recursos & Custos</div>
          <div className="text-xs text-txt3">
            Ligue/desligue recursos da plataforma. Custos são estimativas pra controlar o gasto com LLM.
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-txt3">Custo mensal estimado</div>
          <div className="text-lg font-semibold text-txt-1">
            R$ {custoTotal.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Lista por categoria */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {grupos.map(([categoria, lista]) => (
          <section key={categoria}>
            <h3 className="text-xs uppercase tracking-wide text-txt-2 mb-2 font-medium">
              {CATEGORIA_ROTULO[categoria]}
            </h3>
            <div className="space-y-2">
              {lista.map((r) => {
                const aberto = expandido === r.chave_recurso;
                const ehBloqueado = r.status === "bloqueado";
                return (
                  <div
                    key={r.id}
                    className="border border-borda rounded bg-pano overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandido(aberto ? null : r.chave_recurso)}
                      className="w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-pano-2 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-txt-1">
                            {r.nome_comercial}
                          </span>
                          <span
                            className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium"
                            style={{
                              color: STATUS_COR[r.status],
                              border: `1px solid ${STATUS_COR[r.status]}`,
                            }}
                          >
                            {STATUS_ROTULO[r.status]}
                          </span>
                        </div>
                        <div className="text-xs text-txt-2">{r.descricao_curta}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-txt3">custo/mês</div>
                        <div className="text-sm text-txt-1 font-medium">
                          R$ {Number(r.custo_estimado_mes_brl).toFixed(2)}
                        </div>
                      </div>
                    </button>

                    {aberto && (
                      <div className="px-3 pb-3 border-t border-borda bg-pano-2">
                        {r.descricao_longa && (
                          <div className="text-xs text-txt-1 mt-2 leading-relaxed">
                            {r.descricao_longa}
                          </div>
                        )}
                        {ehBloqueado && r.motivo_bloqueio && (
                          <div
                            className="text-xs mt-2 p-2 rounded"
                            style={{
                              background: "oklch(0.55 0.22 25 / 0.1)",
                              border: "1px solid oklch(0.55 0.22 25 / 0.3)",
                              color: "oklch(0.55 0.22 25)",
                            }}
                          >
                            <strong>Bloqueado:</strong> {r.motivo_bloqueio}
                          </div>
                        )}
                        {r.dependencias_chaves.length > 0 && (
                          <div className="text-xs text-txt-2 mt-2">
                            Depende de: {r.dependencias_chaves.join(", ")}
                          </div>
                        )}
                        {r.tipo === "cron" && (
                          <div className="text-xs text-txt-2 mt-2">
                            Tipo: cron (após ativar, agende manualmente no painel Crons).
                            {r.cron_nome && <> Nome: <code>{r.cron_nome}</code>.</>}
                          </div>
                        )}
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            disabled={ehBloqueado || acaoPendente === r.chave_recurso}
                            onClick={() => handleToggle(r)}
                            className="text-xs px-3 py-1.5 rounded font-medium transition disabled:opacity-50"
                            style={{
                              background: r.ativo
                                ? "oklch(0.55 0.05 250)"
                                : "oklch(0.65 0.18 145)",
                              color: "white",
                            }}
                          >
                            {acaoPendente === r.chave_recurso
                              ? "..."
                              : r.ativo
                              ? "Pausar"
                              : "Ativar"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
