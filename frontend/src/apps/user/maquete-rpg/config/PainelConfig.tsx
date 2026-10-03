/**
 * PainelConfig — Painel full-screen para configurar a maquete-RPG.
 *
 * Configurável:
 *  - Tempos (espera / ir embora, em minutos) — globais para todos os contatos.
 *  - Cargos: visibilidade, personagem (sprite) e estação primária.
 *  - Funcionários humanos (membros do app Equipe): cargo, estação, sprite.
 *
 * Persistência: localStorage (ver Docs/maquete-rpg/configuracao-supabase.md).
 *
 * Design: layout centrado, header sticky com blur, cards com hover sutil,
 * tokens neutros (zinc) + accent amber pra seleção, tipografia hierarquizada.
 */
import { useMemo } from "react";
import {
  X,
  Plus,
  Trash2,
  Clock,
  Users,
  UserCog,
  MapPin,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  CARGOS,
  NUMERO_ESTACAO,
  ROTULO_CARGO,
  SPRITES_DISPONIVEIS,
  type ConfigHumano,
  type ConfigMaquete,
  type SpriteKey,
} from "./configMaquete";
import { useConfigMaquete } from "./useConfigMaquete";
import { ESTACOES } from "../canvas/MapaEmpresa";
import { URLS as SPRITE_URLS } from "../assets/texturas";
import type { CargoTipologia } from "../dados/useConversasMaquete";

type MembroEquipe = {
  id: string;
  nome: string;
  foto_url?: string | null;
  avatar?: string;
};

interface Props {
  aberto: boolean;
  onFechar: () => void;
}

function lerEquipe(): MembroEquipe[] {
  try {
    const w = window as unknown as {
      RAGENTIC_DATA?: { EQUIPE?: MembroEquipe[] };
      EQUIPE?: MembroEquipe[];
    };
    const lista = w.RAGENTIC_DATA?.EQUIPE ?? w.EQUIPE ?? [];
    return Array.isArray(lista)
      ? lista.map((m) => ({
          id: m.id,
          nome: m.nome || "Sem nome",
          foto_url: m.foto_url ?? null,
          avatar: m.avatar ?? iniciais(m.nome || "?"),
        }))
      : [];
  } catch {
    return [];
  }
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function PainelConfig({ aberto, onFechar }: Props) {
  const { config, setConfig } = useConfigMaquete();
  const equipe = useMemo(lerEquipe, [aberto]);
  const mapaEquipe = useMemo(() => {
    const m = new Map<string, MembroEquipe>();
    for (const e of equipe) m.set(e.id, e);
    return m;
  }, [equipe]);

  const usadas = useMemo(() => {
    const s = new Set<string>();
    for (const c of CARGOS) {
      const cc = config.cargos[c];
      if (cc?.visivel && cc.estacaoId) s.add(cc.estacaoId);
    }
    for (const h of config.humanos) {
      if (h.visivel && h.estacaoId) s.add(h.estacaoId);
    }
    return s;
  }, [config]);

  function patch(p: Partial<ConfigMaquete>) {
    setConfig({ ...config, ...p });
  }
  function patchCargo(
    cargo: CargoTipologia,
    p: Partial<ConfigMaquete["cargos"][CargoTipologia]>,
  ) {
    setConfig({
      ...config,
      cargos: { ...config.cargos, [cargo]: { ...config.cargos[cargo], ...p } },
    });
  }
  function patchHumano(id: string, p: Partial<ConfigHumano>) {
    setConfig({
      ...config,
      humanos: config.humanos.map((h) => (h.id === id ? { ...h, ...p } : h)),
    });
  }
  function adicionarHumano(membro: MembroEquipe) {
    if (config.humanos.some((h) => h.id === membro.id)) return;
    const livre = ESTACOES.find((e) => !usadas.has(e.id));
    const novo: ConfigHumano = {
      id: membro.id,
      nome: membro.nome,
      cargo: "atendimento",
      estacaoId: livre?.id ?? ESTACOES[0].id,
      sprite: "char5",
      visivel: true,
    };
    setConfig({ ...config, humanos: [...config.humanos, novo] });
  }
  function removerHumano(id: string) {
    setConfig({ ...config, humanos: config.humanos.filter((h) => h.id !== id) });
  }

  function opcoesEstacao(propriaId: string | undefined): typeof ESTACOES {
    return ESTACOES.filter((e) => e.id === propriaId || !usadas.has(e.id));
  }

  const membrosDisponiveis = equipe.filter(
    (m) => !config.humanos.find((h) => h.id === m.id),
  );

  if (!aberto) return null;

  return (
    <div className="absolute inset-0 z-20">
      {/* Backdrop com blur */}
      <div
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
        onClick={onFechar}
      />

      {/* Painel — full screen do app, conteúdo centralizado */}
      <div
        className="relative z-10 flex h-full w-full flex-col bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 px-6 py-3 backdrop-blur-md">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
              Configuração da maquete
            </h2>
            <p className="text-[11px] text-zinc-500">
              Personagens, estações e ritmo dos contatos.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="grid h-8 w-8 place-content-center rounded-md text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-6 text-sm">
            {/* Tempos */}
            <Secao
              icone={<Clock className="h-3.5 w-3.5" />}
              titulo="Ritmo dos contatos"
              descricao="Tempo padrão para sentar na espera e ir embora."
            >
              <div className="grid grid-cols-2 gap-3">
                <CampoNumero
                  label="Sentar na espera (min)"
                  value={config.tempoEsperaMin}
                  onChange={(n) => patch({ tempoEsperaMin: n })}
                />
                <CampoNumero
                  label="Ir embora (min)"
                  value={config.tempoEmboraMin}
                  onChange={(n) => patch({ tempoEmboraMin: n })}
                />
              </div>
            </Secao>

            {/* Cargos */}
            <Secao
              icone={<UserCog className="h-3.5 w-3.5" />}
              titulo="Cargos"
              descricao="Quem aparece, com qual personagem e em qual estação."
            >
              <div className="grid gap-2.5 sm:grid-cols-2">
                {CARGOS.map((cargo) => {
                  const cc = config.cargos[cargo];
                  const opcoes = opcoesEstacao(cc.estacaoId);
                  return (
                    <article
                      key={cargo}
                      className={
                        "group rounded-xl border bg-zinc-900/50 p-3 transition " +
                        (cc.visivel
                          ? "border-zinc-700/60 hover:border-zinc-600"
                          : "border-zinc-800/60 opacity-70")
                      }
                    >
                      <header className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <PreviewSprite sprite={cc.sprite} />
                          <div className="font-medium text-zinc-100">
                            {ROTULO_CARGO[cargo]}
                          </div>
                        </div>
                        <Switch
                          checked={cc.visivel}
                          onCheckedChange={(v) =>
                            patchCargo(cargo, { visivel: !!v })
                          }
                        />
                      </header>
                      {cc.visivel && (
                        <div className="mt-3 space-y-2">
                          <SelectSprite
                            value={cc.sprite}
                            onChange={(s) => patchCargo(cargo, { sprite: s })}
                          />
                          <SelectEstacao
                            value={cc.estacaoId}
                            opcoes={opcoes}
                            onChange={(v) =>
                              patchCargo(cargo, { estacaoId: v })
                            }
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </Secao>

            {/* Humanos */}
            <Secao
              icone={<Users className="h-3.5 w-3.5" />}
              titulo="Funcionários humanos"
              descricao="Membros do app Equipe posicionados na maquete."
            >
              {equipe.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500">
                  Nenhum membro encontrado no app Equipe. Adicione membros lá
                  primeiro.
                </p>
              ) : (
                <>
                  <div className="space-y-2.5">
                    {config.humanos.length === 0 && (
                      <p className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500">
                        Nenhum humano na maquete ainda. Escolha alguém abaixo.
                      </p>
                    )}
                    {config.humanos.map((h) => {
                      const opcoes = opcoesEstacao(h.estacaoId);
                      const m = mapaEquipe.get(h.id);
                      return (
                        <article
                          key={h.id}
                          className={
                            "rounded-xl border bg-zinc-900/50 p-3 transition " +
                            (h.visivel
                              ? "border-zinc-700/60"
                              : "border-zinc-800/60 opacity-70")
                          }
                        >
                          <header className="flex items-center gap-3">
                            <AvatarMembro nome={h.nome} foto={m?.foto_url} fallback={m?.avatar} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-zinc-100">
                                {h.nome}
                              </div>
                              <div className="text-[11px] text-zinc-500">
                                Estação {NUMERO_ESTACAO[h.estacaoId] ?? "—"} ·{" "}
                                {ROTULO_CARGO[h.cargo]}
                              </div>
                            </div>
                            <Switch
                              checked={h.visivel}
                              onCheckedChange={(v) =>
                                patchHumano(h.id, { visivel: !!v })
                              }
                            />
                            <button
                              type="button"
                              onClick={() => removerHumano(h.id)}
                              className="grid h-8 w-8 place-content-center rounded-md text-zinc-400 transition hover:bg-zinc-800 hover:text-red-400"
                              title="Remover"
                              aria-label="Remover"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </header>
                          {h.visivel && (
                            <div className="mt-3 grid gap-2 sm:grid-cols-3">
                              <SelectCargo
                                value={h.cargo}
                                onChange={(v) =>
                                  patchHumano(h.id, { cargo: v })
                                }
                              />
                              <SelectEstacao
                                value={h.estacaoId}
                                opcoes={opcoes}
                                onChange={(v) =>
                                  patchHumano(h.id, { estacaoId: v })
                                }
                              />
                              <SelectSprite
                                value={h.sprite}
                                onChange={(s) =>
                                  patchHumano(h.id, { sprite: s })
                                }
                              />
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>

                  {membrosDisponiveis.length > 0 && (
                    <div className="mt-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
                      <Label className="text-[11px] uppercase tracking-wide text-zinc-500">
                        Adicionar da Equipe
                      </Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {membrosDisponiveis.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => adicionarHumano(m)}
                            className="group flex items-center gap-2 rounded-full border border-zinc-700/60 bg-zinc-900 py-1 pl-1 pr-3 text-xs text-zinc-200 transition hover:border-amber-400/60 hover:bg-zinc-800"
                          >
                            <AvatarMembro
                              nome={m.nome}
                              foto={m.foto_url}
                              fallback={m.avatar}
                              size={22}
                            />
                            <span className="truncate max-w-[140px]">
                              {m.nome}
                            </span>
                            <Plus className="h-3 w-3 text-zinc-500 transition group-hover:text-amber-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Secao>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =================== átomos de UI =================== */

function Secao({
  icone,
  titulo,
  descricao,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-end justify-between gap-3 border-b border-zinc-800/60 pb-2">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-content-center rounded-md bg-amber-400/10 text-amber-400">
            {icone}
          </span>
          <h3 className="text-sm font-semibold text-zinc-100">{titulo}</h3>
        </div>
        {descricao && (
          <p className="text-[11px] text-zinc-500">{descricao}</p>
        )}
      </header>
      {children}
    </section>
  );
}

function CampoNumero({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </Label>
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) =>
          onChange(Math.max(1, Number(e.target.value) || 1))
        }
        className="mt-1 h-9 border-zinc-700/80 bg-zinc-900 text-zinc-100 focus-visible:ring-amber-400/40"
      />
    </div>
  );
}

function AvatarMembro({
  nome,
  foto,
  fallback,
  size = 36,
}: {
  nome: string;
  foto?: string | null;
  fallback?: string;
  size?: number;
}) {
  const ini = fallback || iniciais(nome);
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 text-zinc-200 ring-1 ring-zinc-700/60"
      style={{ width: size, height: size }}
    >
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt={nome}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="grid h-full w-full place-content-center font-semibold"
          style={{ fontSize: Math.max(10, size * 0.36) }}
        >
          {ini}
        </div>
      )}
    </div>
  );
}

function PreviewSprite({ sprite }: { sprite: SpriteKey }) {
  return (
    <div className="grid h-8 w-6 place-content-center rounded bg-zinc-950/60 ring-1 ring-zinc-700/60">
      <div
        style={{
          width: 16,
          height: 32,
          backgroundImage: `url(${SPRITE_URLS[sprite]})`,
          backgroundPosition: "0 0",
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

function SelectSprite({
  value,
  onChange,
}: {
  value: SpriteKey;
  onChange: (s: SpriteKey) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-1.5">
      {SPRITES_DISPONIVEIS.map((s) => {
        const ativo = s === value;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={
              "shrink-0 grid place-content-center rounded-md h-10 w-9 border transition " +
              (ativo
                ? "border-amber-400 bg-amber-400/10 shadow-[0_0_0_2px_rgb(251_191_36/0.15)]"
                : "border-transparent hover:border-zinc-600 hover:bg-zinc-900")
            }
            aria-label={s}
            title={s}
          >
            <div
              style={{
                width: 16,
                height: 32,
                backgroundImage: `url(${SPRITE_URLS[s]})`,
                backgroundPosition: "0 0",
                backgroundRepeat: "no-repeat",
                imageRendering: "pixelated",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function SelectEstacao({
  value,
  opcoes,
  onChange,
}: {
  value: string;
  opcoes: typeof ESTACOES;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-300 focus-within:border-amber-400/60">
      <MapPin className="h-3.5 w-3.5 text-zinc-500" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent text-zinc-100 outline-none"
      >
        {opcoes.map((e) => (
          <option key={e.id} value={e.id} className="bg-zinc-900">
            Estação {NUMERO_ESTACAO[e.id]}
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectCargo({
  value,
  onChange,
}: {
  value: CargoTipologia;
  onChange: (v: CargoTipologia) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-xs text-zinc-300 focus-within:border-amber-400/60">
      <UserCog className="h-3.5 w-3.5 text-zinc-500" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CargoTipologia)}
        className="flex-1 bg-transparent text-zinc-100 outline-none"
      >
        {CARGOS.map((c) => (
          <option key={c} value={c} className="bg-zinc-900">
            {ROTULO_CARGO[c]}
          </option>
        ))}
      </select>
    </label>
  );
}
