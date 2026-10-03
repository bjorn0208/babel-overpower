/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />
/**
 * Adaptador isolado do provedor de consultas (Motor de Crédito).
 *
 * O resto do app não conhece detalhes da API externa — só esta interface.
 * Credenciais via `ler_config_consulta` (RPC service_role) → nunca hardcoded.
 *
 * Fluxo da API (confirmado em teste 2026-06-02):
 *  1. POST /generate-token {logonOrEmail, password} → {token} (JWT, sem exp → gera por chamada)
 *  2. POST /activity/create {serviceId, documento, tipo_documento, ...paramsExtra}
 *     - cada serviço tem `settings` próprios (ex: serviço 20/23 exigem `uf`)
 *     - resposta SÍNCRONA: já vem `output` + status "Concluído"
 *     - resposta ASSÍNCRONA: vem `code` → poll GET /activity/{code} até concluir
 *  3. erro → POST /activity/{code}/remake refaz (retry 1x)
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type TipoDoc = "cpf" | "cnpj" | "placa" | "chassi";

export type ResultadoConsulta = {
  ok: boolean;
  bruto: unknown; // output cru da API (PII)
  codigo_externo?: string; // code da atividade
  status_externo?: string;
  erro?: string;
};

type Credencial = { logonOrEmail: string; password: string };

const STATUS_CONCLUIDO = /conclu/i;
const STATUS_ERRO = /err/i;

export class ConsultaProvider {
  constructor(
    private readonly urlBase: string,
    private readonly cred: Credencial,
  ) {}

  /** Gera um JWT novo a cada chamada (API não expõe exp → não cacheia). */
  private async gerarToken(): Promise<string> {
    const r = await fetch(`${this.urlBase}generate-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.cred),
    });
    if (!r.ok) throw new Error(`generate-token falhou: HTTP ${r.status}`);
    const j = await r.json();
    if (!j?.token) throw new Error("token ausente na resposta de generate-token");
    return j.token as string;
  }

  /**
   * Consulta um documento. Síncrono com fallback de polling pra serviços lentos.
   * `paramsExtra` mescla campos exigidos pelo `settings` do serviço (ex: uf, insumo).
   */
  async consultar(
    codigoApi: string,
    tipoDoc: TipoDoc,
    documento: string,
    paramsExtra: Record<string, unknown> = {},
  ): Promise<ResultadoConsulta> {
    try {
      const token = await this.gerarToken();
      // A API faz json_decode() nos params do tipo lista (ex: `insumo`) → espera STRING JSON,
      // não array nativo. Array nativo no body causa HTTP 500 "Ocorreu um erro no servidor".
      // Serializa qualquer valor array de paramsExtra como string JSON; escalares passam direto.
      const paramsSerializados: Record<string, unknown> = {};
      for (const [chave, valor] of Object.entries(paramsExtra)) {
        paramsSerializados[chave] = Array.isArray(valor) ? JSON.stringify(valor) : valor;
      }
      const r = await fetch(`${this.urlBase}activity/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceId: Number(codigoApi),
          documento: documento.replace(/\D/g, ""),
          tipo_documento: tipoDoc,
          ...paramsSerializados,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        return { ok: false, bruto: j, erro: `activity/create HTTP ${r.status}` };
      }

      const code = j?.code as string | undefined;
      const status = j?.status as string | undefined;

      // Resposta síncrona — output já veio
      if (j?.output && status && STATUS_CONCLUIDO.test(status)) {
        return { ok: true, bruto: j.output, codigo_externo: code, status_externo: status };
      }

      // Assíncrona — poll por até ~30s
      if (code) {
        const polled = await this.aguardarResultado(token, code);
        if (polled) return polled;

        const remade = await this.remake(token, code);
        if (remade) return remade;

        return {
          ok: false,
          bruto: j,
          codigo_externo: code,
          status_externo: status,
          erro: "timeout_consultando",
        };
      }

      return { ok: false, bruto: j, erro: "sem_code_nem_output" };
    } catch (e) {
      return { ok: false, bruto: null, erro: String(e) };
    }
  }

  private async aguardarResultado(
    token: string,
    code: string,
    tentativas = 10,
  ): Promise<ResultadoConsulta | null> {
    for (let i = 0; i < tentativas; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const r = await fetch(`${this.urlBase}activity/${code}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) continue;
      const j = await r.json().catch(() => null);
      const status = j?.status as string | undefined;
      if (j?.output && status && STATUS_CONCLUIDO.test(status)) {
        return { ok: true, bruto: j.output, codigo_externo: code, status_externo: status };
      }
      if (status && STATUS_ERRO.test(status)) {
        return {
          ok: false,
          bruto: j,
          codigo_externo: code,
          status_externo: status,
          erro: "erro_externo",
        };
      }
    }
    return null;
  }

  /** Refaz uma consulta com erro (1x) e faz um ciclo curto de polling. */
  private async remake(token: string, code: string): Promise<ResultadoConsulta | null> {
    const r = await fetch(`${this.urlBase}activity/${code}/remake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await this.aguardarResultado(token, code, 5);
  }
}

/** Factory: lê config + credencial via RPC service_role e devolve o provider pronto. */
export async function criarProvider(
  supabase: SupabaseClient,
  provedor = "motordecredito",
): Promise<ConsultaProvider> {
  const { data, error } = await supabase.rpc("ler_config_consulta", { p_provedor: provedor });
  if (error) throw new Error(`ler_config_consulta falhou: ${error.message}`);
  if (!data?.ok) throw new Error(`config indisponível: ${data?.erro ?? "desconhecido"}`);

  const cred = data.credencial as Credencial;
  if (!cred?.logonOrEmail || !cred?.password) {
    throw new Error("credencial inválida no vault");
  }
  return new ConsultaProvider(data.url_base as string, cred);
}
