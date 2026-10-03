import { describe, it, expect } from "vitest";
import { montarMemoriaLonga, montarTimelineQuem } from "./memoria-longa";
import type { DossieEnriquecido } from "../conversas/hooks/useConversasLive";

const baseDossie = (over: Partial<DossieEnriquecido>): DossieEnriquecido => ({
  fatos: [],
  episodios: [],
  alertas: [],
  cargo_ativo: null,
  cargo_ativo_regras_livres: null,
  cargo_ativo_objetivo_principal: null,
  cargo_ativo_nome: null,
  contratos: [],
  campanhas: [],
  compromissos_ativos: [],
  anexos: [],
  pensamento_atual: null,
  crenca_belief: null,
  crenca_resumo: null,
  engajamento: null,
  lead: null,
  conversa_ativa_id: null,
  gerado_em: "2026-05-16T00:00:00Z",
  ...over,
});

describe("montarMemoriaLonga", () => {
  it("usa crenca_resumo como resumo e fatos como pontos-chave (relevancia alta primeiro)", () => {
    const d = baseDossie({
      crenca_resumo: "Lead quer limpar nome p/ alugar apê.",
      fatos: [
        { id: "1", fato: "Dívida de 30 mil", categoria: "fato_financeiro", relevancia: "alta", confianca: 1, criado_em: "x", escopo: "curto" },
        { id: "2", fato: "Prazo curto", categoria: "objecao", relevancia: "media", confianca: 0.9, criado_em: "x", escopo: "curto" },
      ],
    });
    const m = montarMemoriaLonga(d, 78);
    expect(m.resumo).toBe("Lead quer limpar nome p/ alugar apê.");
    expect(m.pontos_chave[0]).toBe("Dívida de 30 mil");
    expect(m.engajamento_score).toBeCloseTo(0.78);
  });

  it("score_lead vira engajamento 0-1; fallback engajamento.pontuacao do RPC quando houver", () => {
    const d = baseDossie({ engajamento: { pontuacao: 0.42 } });
    expect(montarMemoriaLonga(d, 0).engajamento_score).toBeCloseTo(0.42);
    expect(montarMemoriaLonga(baseDossie({}), 90).engajamento_score).toBeCloseTo(0.9);
  });

  it("primeiro contato vem de lead.first_contact_at, senão criado_em, senão mantém anterior", () => {
    const d = baseDossie({
      lead: { id: "l", nome_exibicao: "X", name: null, phone: null, criado_em: "2026-01-01T00:00:00Z", first_contact_at: "2026-02-02T10:00:00Z" },
    });
    expect(montarMemoriaLonga(d, 0, "2025-01-01T00:00:00Z").primeiro_contato_iso).toBe("2026-02-02T10:00:00Z");
    const semFirst = baseDossie({
      lead: { id: "l", nome_exibicao: "X", name: null, phone: null, criado_em: "2026-01-01T00:00:00Z", first_contact_at: null },
    });
    expect(montarMemoriaLonga(semFirst, 0, "2025-01-01T00:00:00Z").primeiro_contato_iso).toBe("2026-01-01T00:00:00Z");
  });
});

describe("montarTimelineQuem", () => {
  it("mapeia episodios -> EventoTimeline ordenado por mais recente", () => {
    const d = baseDossie({
      episodios: [
        { id: "e1", episodio_resumo: "Pediu preço", gancho: null, emocao: null, outcome: null, decay_factor: 1, relevancia: 1, turno_inicio: 1, turno_fim: 2, criado_em: "2026-05-16T09:00:00Z" },
        { id: "e2", episodio_resumo: "Fechou", gancho: null, emocao: null, outcome: null, decay_factor: 1, relevancia: 1, turno_inicio: 3, turno_fim: 4, criado_em: "2026-05-16T10:00:00Z" },
      ],
    });
    const t = montarTimelineQuem(d);
    expect(t[0]).toMatchObject({ id: "ep-e2", tipo: "conversa_iniciada", rotulo: "Fechou" });
    expect(t[1].id).toBe("ep-e1");
  });
});
