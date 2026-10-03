/**
 * Teste do gerador de relatório PDF do commandbar (2026-08-02).
 *
 * Monta um roteiro parecido com o que a LLM manda (KPIs + gráfico + tabela +
 * texto + destaque), gera o PDF com a marca do tenant e salva local pra
 * conferência visual.
 *
 * Rodar: deno run -A supabase/functions/tests/gerar-pdf-relatorio.test.ts <saida.pdf>
 */
import { montarPdfRelatorio, type RelatorioPdf } from "../_shared/montar-pdf-relatorio.ts";

const saida = Deno.args[0] ?? "relatorio-teste.pdf";

const relatorio: RelatorioPdf = {
  titulo: "Relatório de Vendas — Julho/2026",
  subtitulo: "Mapa do Crédito · consolidado do mês",
  nome_empresa: "CM Soluções Consultoria",
  logo_url: null,
  banner_url: null,
  rodape: "CM Soluções Consultoria · gerado pelo Mentor",
  secoes: [
    {
      tipo: "kpis",
      titulo: "Panorama do mês",
      itens: [
        { rotulo: "Clientes fechados", valor: "56", nota: "+40% vs junho" },
        { rotulo: "Receita", valor: "R$ 24.780", nota: "ticket médio R$ 442" },
        { rotulo: "Leads novos", valor: "5.350" },
      ],
    },
    {
      tipo: "grafico_barras",
      titulo: "Fechamentos por mês",
      itens: [
        { rotulo: "Mar", valor: 21 },
        { rotulo: "Abr", valor: 28 },
        { rotulo: "Mai", valor: 34 },
        { rotulo: "Jun", valor: 40 },
        { rotulo: "Jul", valor: 56 },
      ],
    },
    {
      tipo: "tabela",
      titulo: "Produtos vendidos",
      colunas: ["Produto", "Qtd", "Preço", "Total"],
      linhas: [
        ["Mapa do Crédito — CPF", 38, "R$ 297", "R$ 11.286"],
        ["Mapa do Crédito PJ — 1 sócio", 14, "R$ 497", "R$ 6.958"],
        ["CPF de sócio adicional", 9, "R$ 324", "R$ 2.916"],
      ],
    },
    {
      tipo: "texto",
      titulo: "Leitura do período",
      texto:
        "Julho fechou com 56 contratos, 40% acima de junho e o melhor mês do ano. " +
        "O crescimento veio principalmente do produto PJ, que dobrou de volume após o reajuste de preço.\n" +
        "A taxa de conversão sobre leads novos ficou em 1,05% — estável, o que indica que o ganho veio de volume de topo, não de eficiência.",
    },
    {
      tipo: "lista",
      titulo: "Próximos passos sugeridos",
      itens: [
        "Recriar os links de pagamento com os valores novos",
        "Testar oferta de faixa 2-3 sócios (hoje sem produto cadastrado)",
        "Reaquecer os 428 leads marcados como desistiu",
      ],
    },
    {
      tipo: "destaque",
      texto: "Melhor mês do ano: 56 fechamentos e R$ 24.780 em receita.",
    },
  ],
};

const bytes = await montarPdfRelatorio(relatorio);
await Deno.writeFile(saida, bytes);
console.log(`PDF gerado: ${saida} · ${Math.round(bytes.length / 1024)} KB`);
