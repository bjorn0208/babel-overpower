// @ts-nocheck
/**
 * TopbarCuradoria — barra superior do app Curadoria.
 * Inclui: marca, tabs das seções, botão ⌘K e seletor de tenant.
 * BannerImpersonacao — banner laranja exibido quando impersonando tenant.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/bundle/bundle-shared";
import { ABAS } from "../dados/abas";
import { TENANT_UNIVERSO, type AbaId, type TenantImpersonado } from "../dados/tipos";
import { iconeAba } from "./command-palette";

// ─── Topbar ───────────────────────────────────────────────────────────────────

export interface TopbarProps {
  abaId: AbaId;
  onAba: (id: AbaId) => void;
  onPaleta: () => void;
  tenantImpersonado: TenantImpersonado;
  onTenant: (t: TenantImpersonado) => void;
  avisosNaoLidos: number;
  tenants: TenantImpersonado[];
}

export function TopbarCuradoria({
  abaId,
  onAba,
  onPaleta,
  tenantImpersonado,
  onTenant,
  avisosNaoLidos,
  tenants,
}: TopbarProps) {
  const ehUniverso = tenantImpersonado.id === TENANT_UNIVERSO.id;
  const [tenantAberto, setTenantAberto] = useState(false);
  const refTenant = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (refTenant.current && !refTenant.current.contains(e.target as Node)) {
        setTenantAberto(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div
      style={{
        height: 48,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        padding: "0 18px",
        gap: 12,
        flexShrink: 0,
      }}
    >
      {/* Marca do app */}
      <div className="row gap-2" style={{ flexShrink: 0 }}>
        <div
          className="row center"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "linear-gradient(135deg, var(--os-acento-1-soft), var(--os-acento-2-soft))",
          }}
        >
          <Icon name="brain" size={12} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: 0.1 }}>
          <span className="os-aurora-text">Curadoria</span>
        </span>
      </div>

      {/* Tabs das seções */}
      <div
        className="tabs"
        style={{
          marginLeft: 8,
          flex: 1,
          minWidth: 0,
          overflowX: "auto",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {ABAS.filter(
          (a) => a.secao === "avisos" || a.secao === "operacao" || a.secao === "control_plane",
        ).map((a) => {
          const ativo = abaId === a.id;
          return (
            <span
              key={a.id}
              className={`tab ${ativo ? "tab-on" : ""}`}
              style={{
                padding: "5px 10px",
                fontSize: 12,
                gap: 5,
                flex: "0 0 auto",
                whiteSpace: "nowrap",
              }}
              onClick={() => onAba(a.id)}
              title={a.atalho ? `⌘${a.atalho}` : a.label}
            >
              <Icon name={iconeAba(a.icone)} size={11} />
              {a.label}
              {a.id === "avisos" && avisosNaoLidos > 0 && (
                <span className="badge badge-err" style={{ fontSize: 9, padding: "1px 5px" }}>
                  {avisosNaoLidos}
                </span>
              )}
              {a.badge && a.id !== "avisos" && (
                <span
                  className={a.destaque ? "badge badge-aurora" : "badge badge-info"}
                  style={{ fontSize: 9, padding: "1px 5px" }}
                >
                  {a.badge}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Botão ⌘K */}
      <button
        className="btn btn-ghost btn-icon btn-sm"
        onClick={onPaleta}
        title="Buscar (⌘K)"
        style={{ flexShrink: 0, opacity: 0.7 }}
      >
        <Icon name="search" size={13} />
      </button>

      {/* Seletor de tenant */}
      <div ref={refTenant} style={{ position: "relative", flexShrink: 0 }}>
        <button
          className="btn btn-ghost btn-sm"
          style={
            !ehUniverso
              ? {
                  background: "oklch(0.65 0.24 25 / 0.12)",
                  borderColor: "oklch(0.65 0.24 25 / 0.3)",
                  color: "oklch(0.82 0.20 25)",
                  opacity: 1,
                }
              : { opacity: 0.75 }
          }
          onClick={() => setTenantAberto((v) => !v)}
          title={ehUniverso ? "Selecionar tenant" : `Impersonando ${tenantImpersonado.nome}`}
        >
          <Icon name={ehUniverso ? "users" : "user"} size={12} />
          <span
            style={{
              fontSize: 11,
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {ehUniverso ? "Universo" : tenantImpersonado.nome}
          </span>
          <Icon name="chevronDown" size={10} />
        </button>

        {tenantAberto && (
          <div
            className="os-card"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              width: 240,
              zIndex: 100,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "6px 12px 6px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="muted tiny">Impersonar tenant</div>
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto", padding: 4 }}>
              {[TENANT_UNIVERSO, ...tenants].map((t) => {
                const sel = t.id === tenantImpersonado.id;
                return (
                  <button
                    key={t.id}
                    className="btn btn-ghost"
                    style={{
                      width: "100%",
                      justifyContent: "flex-start",
                      height: 32,
                      padding: "0 8px",
                      borderRadius: 6,
                      gap: 8,
                      background: sel ? "rgba(255,255,255,0.07)" : undefined,
                    }}
                    onClick={() => {
                      onTenant(t);
                      setTenantAberto(false);
                    }}
                  >
                    <div
                      className="row center"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: t.avatar_cor ?? "var(--os-acento-1-soft)",
                        fontSize: 9,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {t.nome.slice(0, 1).toUpperCase()}
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        flex: 1,
                        textAlign: "left",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.nome}
                    </span>
                    {sel && <Icon name="check" size={11} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BannerImpersonacao ───────────────────────────────────────────────────────

export interface BannerImpersonacaoProps {
  tenant: TenantImpersonado;
  onSair: () => void;
}

export function BannerImpersonacao({ tenant, onSair }: BannerImpersonacaoProps) {
  return (
    <div
      style={{
        height: 28,
        background: "oklch(0.65 0.24 25 / 0.12)",
        borderBottom: "1px solid oklch(0.65 0.24 25 / 0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        flexShrink: 0,
      }}
    >
      <Icon name="alert" size={11} />
      <span className="small" style={{ color: "oklch(0.82 0.20 25)" }}>
        Impersonando <b className="mono">{tenant.nome}</b> · RLS aplicada via JWT
      </span>
      <button
        className="btn btn-ghost btn-sm"
        style={{ height: 20, padding: "0 8px", fontSize: 11, color: "oklch(0.82 0.20 25)" }}
        onClick={onSair}
      >
        sair
      </button>
    </div>
  );
}
