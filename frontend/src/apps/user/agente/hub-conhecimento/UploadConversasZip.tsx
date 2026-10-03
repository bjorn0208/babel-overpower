import { useState, useRef } from "react";
import { toast } from "sonner";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";

interface BlocoExtraido {
  id: string;
  titulo: string;
  conteudo: string;
  fonte: string;
  selecionado: boolean;
  editado: boolean;
}

export function UploadConversasZip({ tenantId, agenteId, onBlocosAdicionados }: {
  tenantId: string;
  agenteId: string | null;
  onBlocosAdicionados: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [carregando, setCarregando] = useState(false);
  const [blocos, setBlocos] = useState<BlocoExtraido[]>([]);
  const [mostrando, setMostrando] = useState(false);

  // Extração roda no navegador (JSZip) — evita mandar o binário do ZIP pra
  // edge function, que tem ~150MB de memória e estourava com pastas grandes
  // (caso real: 86MB de conversas). Limite alto aqui é só sanidade do browser.
  const TAMANHO_MAXIMO_BYTES = 300 * 1024 * 1024; // 300MB
  const TAMANHO_MAXIMO_POR_ARQUIVO = 2 * 1024 * 1024; // 2MB por .txt

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip")) {
      toast.error("Selecione um arquivo .zip");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (file.size > TAMANHO_MAXIMO_BYTES) {
      toast.error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: 300MB.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setCarregando(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const blocosExtraidos: BlocoExtraido[] = [];
      let idx = 0;

      for (const [caminho, entrada] of Object.entries(zip.files)) {
        if (entrada.dir || !caminho.endsWith(".txt")) continue;

        const conteudoBruto = await entrada.async("string");
        const conteudo = conteudoBruto.trim().slice(0, TAMANHO_MAXIMO_POR_ARQUIVO);
        if (!conteudo) continue;

        const titulo = caminho.replace(/\.txt$/, "").split("/").pop() || "Conversa importada";
        blocosExtraidos.push({
          id: `bloco_${idx++}_${Date.now()}`,
          titulo,
          conteudo,
          fonte: `${file.name} / ${caminho}`,
          selecionado: false,
          editado: false,
        });
      }

      if (blocosExtraidos.length === 0) {
        toast.error("Nenhum arquivo .txt encontrado dentro do ZIP");
        return;
      }

      setBlocos(blocosExtraidos);
      setMostrando(true);
      toast.success(`${blocosExtraidos.length} blocos extraídos`);
    } catch (err) {
      toast.error(`Erro ao ler ZIP: ${(err as Error).message}`);
    } finally {
      setCarregando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleConfirmar = async () => {
    const selecionados = blocos.filter(b => b.selecionado);
    if (!selecionados.length) {
      toast.error("Selecione pelo menos um bloco");
      return;
    }

    setCarregando(true);
    try {
      const { data: resultado, error } = await supabase.functions.invoke("salvar-blocos-importados", {
        body: {
          tenantId,
          agenteId,
          blocos: selecionados.map(b => ({
            titulo: b.titulo,
            conteudo: b.conteudo,
            fonte: b.fonte,
          })),
        },
      });

      if (error) throw new Error(error.message || "Erro ao salvar blocos");

      toast.success(`${selecionados.length} blocos adicionados ao conhecimento`);
      setMostrando(false);
      setBlocos([]);
      onBlocosAdicionados();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!mostrando && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={carregando}
          style={{
            padding: "12px 16px",
            backgroundColor: "oklch(0.50 0.16 235)",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: carregando ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: 600,
            opacity: carregando ? 0.6 : 1,
          }}
        >
          {carregando ? "Processando..." : "📁 Importar conversas (ZIP)"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        onChange={handleUpload}
        style={{ display: "none" }}
      />

      {mostrando && blocos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px", backgroundColor: "oklch(0.12 0 0 / 0.3)", borderRadius: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {blocos.length} blocos encontrados — {blocos.filter(b => b.selecionado).length} selecionados
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => setBlocos(prev => prev.map(b => ({ ...b, selecionado: true })))}
                style={{
                  padding: "4px 10px",
                  backgroundColor: "transparent",
                  color: "oklch(0.98 0 0 / 0.7)",
                  border: "1px solid oklch(0.30 0 0)",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Selecionar todos
              </button>
              <button
                type="button"
                onClick={() => setBlocos(prev => prev.map(b => ({ ...b, selecionado: false })))}
                style={{
                  padding: "4px 10px",
                  backgroundColor: "transparent",
                  color: "oklch(0.98 0 0 / 0.7)",
                  border: "1px solid oklch(0.30 0 0)",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                Desmarcar todos
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {blocos.map((b, idx) => (
              <div
                key={b.id}
                style={{
                  padding: 12,
                  backgroundColor: "oklch(0.20 0 0)",
                  borderRadius: 4,
                  borderLeft: "3px solid " + (b.selecionado ? "oklch(0.68 0.14 290)" : "oklch(0.50 0 0)"),
                }}
              >
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={b.selecionado}
                    onChange={(e) => {
                      setBlocos(prev => prev.map((bl, i) =>
                        i === idx ? { ...bl, selecionado: e.target.checked } : bl
                      ));
                    }}
                  />
                  <input
                    type="text"
                    value={b.titulo}
                    onChange={(e) => {
                      setBlocos(prev => prev.map((bl, i) =>
                        i === idx ? { ...bl, titulo: e.target.value, editado: true } : bl
                      ));
                    }}
                    style={{
                      flex: 1,
                      padding: "4px 8px",
                      backgroundColor: "oklch(0.12 0 0)",
                      color: "white",
                      border: "1px solid oklch(0.30 0 0)",
                      borderRadius: 3,
                      fontSize: 12,
                    }}
                    placeholder="Título do bloco"
                  />
                </div>
                <textarea
                  value={b.conteudo}
                  onChange={(e) => {
                    setBlocos(prev => prev.map((bl, i) =>
                      i === idx ? { ...bl, conteudo: e.target.value, editado: true } : bl
                    ));
                  }}
                  style={{
                    width: "100%",
                    minHeight: 80,
                    padding: "8px",
                    backgroundColor: "oklch(0.12 0 0)",
                    color: "white",
                    border: "1px solid oklch(0.30 0 0)",
                    borderRadius: 3,
                    fontSize: 12,
                    fontFamily: "monospace",
                    resize: "vertical",
                  }}
                />
                <div style={{ fontSize: 10, color: "oklch(0.98 0 0 / 0.5)", marginTop: 4 }}>
                  {b.conteudo.length} caracteres • {b.fonte}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleConfirmar}
              disabled={carregando}
              style={{
                flex: 1,
                padding: "10px 16px",
                backgroundColor: "oklch(0.68 0.14 290)",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: carregando ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {carregando ? "Salvando..." : "✅ Confirmar e adicionar"}
            </button>
            <button
              onClick={() => setMostrando(false)}
              disabled={carregando}
              style={{
                padding: "10px 16px",
                backgroundColor: "oklch(0.40 0 0)",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: carregando ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
