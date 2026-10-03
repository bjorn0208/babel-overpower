import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Camera,
  ChevronDown,
  ChevronRight,
  Clock,
  Crown,
  Globe,
  Image as ImageIcon,
  MapPin,
  MapPinned,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  Shuffle,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Avaliacao {
  id: string;
  empresa_id: string;
  usuario_id: string;
  estrelas: number;
  comentario: string | null;
  criado_em: string;
  atualizado_em: string;
}

interface Titulo {
  id: string;
  nome: string;
  mensalidade: number | null;
  descricao: string | null;
  ordem: number | null;
}

interface CidadeDb {
  id: string;
  nome: string;
  estado_id: string;
}
interface EstadoDb {
  id: string;
  nome: string;
  regiao_id: string;
}
interface RegiaoDb {
  id: string;
  nome: string;
}

interface Cidade {
  id: string;
  nome: string;
}
interface Estado {
  id: string;
  nome: string;
  cidades: Cidade[];
}
interface Regiao {
  id: string;
  nome: string;
  estados: Estado[];
}

interface Nicho {
  id: string;
  nome: string;
}

interface Empresa {
  id: string;
  nome: string;
  nicho_id: string | null;
  categoria: string | null;
  telefone: string | null;
  website: string | null;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  cidade_id: string | null;
  estado_id: string | null;
  regiao_id: string | null;
  abrangencia: string | null;
  horario: unknown[] | null;
  descricao: string | null;
  foto_perfil: string | null;
  criado_em: string;
  criado_por: string | null;
  nicho_nome?: string | null;
  estado_nome?: string | null;
  cidade_nome?: string | null;
}

interface Foto {
  id: string;
  empresa_id: string;
  url: string;
  principal: boolean;
}

// Retorno das edges buscar-empresa-google / detalhar-empresa-google
// (busca no Google Maps pra tela "Adicionar empresa" — 2026-09-01).
interface CandidatoGoogle {
  nome: string;
  telefone: string | null;
  endereco: string | null;
  site: string | null;
  avaliacao_google: number | null;
  num_avaliacoes_google: number | null;
  google_place_id: string;
  foto_url: string | null;
}
interface DetalheGoogle {
  nome: string | null;
  telefone: string | null;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  categoria: string | null;
  site: string | null;
  avaliacao_google: number | null;
  num_avaliacoes_google: number | null;
  google_place_id: string;
  imagens: string[];
}

const ABRANGENCIAS = ["Local", "Regional", "Nacional", "Mundial"];

// UF (sigla que o ViaCEP devolve) → nome oficial do estado (como está salvo
// em reino_estados.nome) — achar estado por UF nunca deu match de verdade
// (comparava nome cheio com a sigla de 2 letras) e o fallback por "includes"
// casava sigla errada por acidente ("SP" batia dentro de "eSPírito Santo").
// Achado testando a busca do Google, 2026-09-01.
const UF_PARA_ESTADO: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

const BANNER_PADRAO =
  "https://llsdqtbtuyuqxvepmniy.supabase.co/storage/v1/object/public/reino/padrao/banner-reino.jpeg?v=2";

// Tira acento pra busca não depender de digitar certinho ("sao paulo" tem
// que achar "São Paulo") — achado 2026-09-01, Theus reportou busca "não
// achando nada": comparação era case-insensitive mas sensível a acento.
function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function waLink(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  const sem55 = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${sem55}`;
}

// Endereço clicável → busca no Google Maps (não precisa de coordenada nem
// place_id salvo — o Maps resolve o texto sozinho).
function mapsLink(partes: Array<string | null | undefined>): string {
  const texto = partes.filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}`;
}

// Empresas recomendadas por nicho (pedido Theus 2026-09-01: "um Uber
// precisa de pneu, então motorista de app tem como recomendada uma
// borracharia, uma mecânica"). Casado por NOME do nicho (não por id —
// produção e local têm ids diferentes pros mesmos nichos) contra os
// nichos reais cadastrados (`reino_nichos`, união do que existe local +
// produção em 2026-09-01). Não é bidirecional por regra — cada linha
// reflete quem o DONO daquele nicho provavelmente precisa por perto.
const NICHOS_COMPLEMENTARES: Record<string, string[]> = {
  "Academia e Fitness": ["Nutrição", "Fisioterapia", "Beleza e Estética", "Saúde e Bem-estar"],
  "Açougue": ["Mercado e Padaria", "Mercearia", "Restaurante", "Adega e Distribuidora"],
  "Adega e Distribuidora": ["Restaurante", "Eventos e Festas", "Açougue", "Mercearia"],
  "Advocacia": ["Contabilidade", "Consultoria Financeira", "Imobiliária", "Seguros"],
  "Agro e Veterinária": ["Pet Shop", "Agronegócio", "Materiais de Construção"],
  "Agronegócio": ["Agro e Veterinária", "Transportes e Logística", "Contabilidade"],
  "Arquitetura": ["Construção Civil", "Engenharia", "Design", "Materiais de Construção"],
  "Assistência Técnica": ["Eletrônicos", "Telefonia", "Tecnologia e Informática"],
  "Auto Elétrica": ["Oficina Mecânica", "Auto Peças", "Funilaria e Pintura", "Transportes e Logística"],
  "Auto Peças": ["Oficina Mecânica", "Auto Elétrica", "Funilaria e Pintura", "Transportes e Logística"],
  "Barbearia": ["Beleza e Estética", "Salão de Beleza", "Moda e Vestuário"],
  "Beleza e Estética": ["Salão de Beleza", "Barbearia", "Nutrição", "Academia e Fitness"],
  "Cafeteria": ["Mercado e Padaria", "Pizzaria", "Lanchonete", "Eventos e Festas"],
  "Calçados": ["Moda e Vestuário", "Presentes e Decoração"],
  "Clínica Médica": ["Farmacia", "Drogaria", "Odontologia", "Fisioterapia", "Nutrição"],
  "Construção Civil": ["Materiais de Construção", "Arquitetura", "Engenharia", "Reformas e Reparos"],
  "Consultoria Financeira": ["Contabilidade", "Advocacia", "Seguros", "Financeiro e Crédito"],
  "Contabilidade": ["Consultoria Financeira", "Advocacia", "Financeiro e Crédito"],
  "Design": ["Marketing e Publicidade", "Arquitetura", "Fotografia"],
  "Drogaria": ["Farmacia", "Clínica Médica", "Saúde e Bem-estar"],
  "Educação e Cursos": ["Escola e Creche", "Papelaria", "Tecnologia e Informática"],
  "Eletrônicos": ["Assistência Técnica", "Telefonia", "Tecnologia e Informática"],
  "Engenharia": ["Construção Civil", "Arquitetura", "Materiais de Construção"],
  "Escola e Creche": ["Educação e Cursos", "Papelaria", "Nutrição"],
  "Eventos e Festas": ["Fotografia", "Presentes e Decoração", "Cafeteria", "Restaurante", "Adega e Distribuidora"],
  "Farmacia": ["Drogaria", "Clínica Médica", "Nutrição"],
  "Financeiro e Crédito": ["Consultoria Financeira", "Contabilidade", "Seguros"],
  "Fisioterapia": ["Clínica Médica", "Academia e Fitness", "Nutrição"],
  "Fotografia": ["Eventos e Festas", "Design", "Marketing e Publicidade"],
  "Funilaria e Pintura": ["Oficina Mecânica", "Auto Peças", "Auto Elétrica"],
  "Hotel e Pousada": ["Turismo e Viagens", "Restaurante", "Eventos e Festas"],
  "IA": ["Tecnologia e Informática", "Marketing e Publicidade", "Consultoria Financeira"],
  "Imobiliária": ["Advocacia", "Construção Civil", "Reformas e Reparos", "Seguros"],
  "Jardinagem e Paisagismo": ["Construção Civil", "Materiais de Construção", "Reformas e Reparos"],
  "Lanchonete": ["Pizzaria", "Cafeteria", "Restaurante", "Mercado e Padaria"],
  "Marketing e Publicidade": ["Design", "Fotografia", "Tecnologia e Informática"],
  "Materiais de Construção": ["Construção Civil", "Reformas e Reparos", "Arquitetura", "Engenharia"],
  "Mercado e Padaria": ["Açougue", "Mercearia", "Cafeteria", "Supermercado"],
  "Mercearia": ["Mercado e Padaria", "Açougue", "Supermercado"],
  "Moda e Vestuário": ["Calçados", "Beleza e Estética", "Presentes e Decoração"],
  "Nutrição": ["Academia e Fitness", "Clínica Médica", "Fisioterapia"],
  "Odontologia": ["Clínica Médica", "Saúde e Bem-estar"],
  "Oficina Mecânica": ["Auto Peças", "Auto Elétrica", "Funilaria e Pintura", "Transportes e Logística"],
  "Papelaria": ["Educação e Cursos", "Escola e Creche", "Presentes e Decoração"],
  "Pet Shop": ["Agro e Veterinária"],
  "Pizzaria": ["Lanchonete", "Cafeteria", "Restaurante"],
  "Presentes e Decoração": ["Eventos e Festas", "Fotografia", "Moda e Vestuário"],
  "Psicologia": ["Clínica Médica", "Saúde e Bem-estar", "Nutrição"],
  "Reformas e Reparos": ["Construção Civil", "Materiais de Construção", "Jardinagem e Paisagismo", "Imobiliária"],
  "Restaurante": ["Lanchonete", "Cafeteria", "Eventos e Festas", "Adega e Distribuidora"],
  "Salão de Beleza": ["Beleza e Estética", "Barbearia", "Moda e Vestuário"],
  "Saúde e Bem-estar": ["Clínica Médica", "Nutrição", "Fisioterapia", "Psicologia"],
  "Seguros": ["Advocacia", "Consultoria Financeira", "Financeiro e Crédito", "Imobiliária"],
  "Serviços de Limpeza": ["Construção Civil", "Reformas e Reparos", "Imobiliária"],
  "Supermercado": ["Açougue", "Mercearia", "Mercado e Padaria"],
  "Tecnologia e Informática": ["Assistência Técnica", "Eletrônicos", "Telefonia", "Marketing e Publicidade", "IA"],
  "Telefonia": ["Eletrônicos", "Assistência Técnica", "Tecnologia e Informática"],
  "Transportes e Logística": ["Oficina Mecânica", "Auto Peças", "Auto Elétrica", "Funilaria e Pintura"],
  "Turismo e Viagens": ["Hotel e Pousada", "Transportes e Logística", "Eventos e Festas"],
};

export default function Reino() {
  const nav = useNavigate();
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [regioes, setRegioes] = useState<Regiao[]>([]);
  const [estadosDb, setEstadosDb] = useState<EstadoDb[]>([]);
  const [cidadesDb, setCidadesDb] = useState<CidadeDb[]>([]);
  const [nichos, setNichos] = useState<Nicho[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // estado do acordeao
  const [regiaoAberta, setRegiaoAberta] = useState<string | null>(null);
  const [estadoAberto, setEstadoAberto] = useState<string | null>(null);
  const [mostrarTopo, setMostrarTopo] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // filtros de busca - busca automática ao alterar filtros
  const [fNicho, setFNicho] = useState<string>("");
  const [fEstado, setFEstado] = useState<string>("");
  const [fCidade, setFCidade] = useState<string>("");
  const [buscaTexto, setBuscaTexto] = useState<string>("");

  // modais
  const [formAbertoPara, setFormAbertoPara] = useState<Estado | null>(null);
  const [editandoEmpresa, setEditandoEmpresa] = useState<Empresa | null>(null);
  const [empresaDetalhe, setEmpresaDetalhe] = useState<Empresa | null>(null);

  // Vitrine — 1 empresa em destaque por setor (região), filtrável por estado
  // (pedido Theus 2026-09-01). Guarda a escolha em state pra não sortear de
  // novo a cada re-render (só troca quando o usuário pede ou o setor ainda
  // não tinha empresa sorteada).
  const [estadoVitrine, setEstadoVitrine] = useState<Record<string, string>>({});
  const [empresaVitrine, setEmpresaVitrine] = useState<Record<string, string>>({});
  
  // sidebar e animação
  const [sidebarHover, setSidebarHover] = useState<string | null>(null);
  // Cada função é uma aba de verdade agora — troca a tela inteira, não é
  // mais scroll-jump nem modal (pedido Theus 2026-09-01). "inicio" = busca
  // + Geografia juntos, o resto é página própria.
  const [abaAtiva, setAbaAtiva] = useState<
    "inicio" | "vitrine" | "hierarquia" | "cadastrar" | "listas"
  >("inicio");
  const [ratingModal, setRatingModal] = useState<{ empresa: Empresa; avaliacao?: Avaliacao } | null>(null);
  const [ratingEstrela, setRatingEstrela] = useState(0);
  const [hoverEstrela, setHoverEstrela] = useState(0);
  const [ratingComentario, setRatingComentario] = useState("");

  const cidadesDoEstado = (estadoId: string) =>
    cidadesDb.filter((c) => c.estado_id === estadoId);

  const carregarAvaliacoes = async () => {
    try {
      const { data } = await (supabase as any).from("reino_avaliacoes").select("*");
      if (data) setAvaliacoes(data);
    } catch (e) {
      console.error("Erro ao carregar avaliações:", e);
    }
  };

  // PostgREST corta em 1000 linhas por padrão (max_rows do projeto) —
  // reino_cidades tem 5571 registros reais. Um select() direto vinha
  // incompleto e sumia cidade de estado que caísse depois da linha 1000 na
  // ordem física da tabela (achado 2026-09-01 — só aparecia em produção,
  // local nunca passou de 5 cidades de teste). Pagina até trazer tudo.
  const buscarTodasLinhas = async (tabela: string) => {
    const linhas: any[] = [];
    const tamanhoPagina = 1000;
    let inicio = 0;
    while (true) {
      const { data, error } = await (supabase as any)
        .from(tabela)
        .select("*")
        .range(inicio, inicio + tamanhoPagina - 1);
      if (error) return { data: null, error };
      linhas.push(...(data ?? []));
      if (!data || data.length < tamanhoPagina) break;
      inicio += tamanhoPagina;
    }
    return { data: linhas, error: null };
  };

  const carregarDados = async () => {
    try {
      const [tit, reg, est, cid, nic, emp, fot] = await Promise.all([
        supabase.from("reino_titulos").select("*") as any,
        supabase.from("reino_regioes").select("*").order("nome") as any,
        supabase.from("reino_estados").select("*") as any,
        buscarTodasLinhas("reino_cidades"),
        supabase.from("reino_nichos").select("*").order("nome") as any,
        supabase.from("reino_empresas").select("*").order("nome") as any,
        supabase.from("reino_empresa_fotos").select("*") as any,
      ]);

      if (tit.error || reg.error || est.error || cid.error || nic.error || emp.error) {
        setErro("Não foi possível carregar os dados do Reino.");
        return;
      }

      const nichoMap = new Map((nic.data ?? []).map((n: any) => [n.id, n.nome]));
      const estadoMap = new Map((est.data ?? []).map((e: EstadoDb) => [e.id, e.nome]));
      const cidadeMap = new Map((cid.data ?? []).map((c: CidadeDb) => [c.id, c.nome]));

      const empresasCompleta: Empresa[] = ((emp.data ?? []) as any[]).map((em) => ({
        ...em,
        horario: (em.horario ?? null) as unknown[] | null,
        nicho_nome: em.nicho_id ? nichoMap.get(em.nicho_id) ?? null : null,
        estado_nome: em.estado_id ? estadoMap.get(em.estado_id) ?? null : null,
        cidade_nome: em.cidade_id ? cidadeMap.get(em.cidade_id) ?? null : null,
      }));

      const ordemRegioes = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];
      const regioesOrdenadas = [...(reg.data ?? [])].sort(
        (a, b) => ordemRegioes.indexOf(a.nome) - ordemRegioes.indexOf(b.nome),
      );

      const arvore: Regiao[] = regioesOrdenadas.map((r: RegiaoDb) => ({
        ...r,
        estados: (est.data ?? [])
          .filter((e: EstadoDb) => e.regiao_id === r.id)
          .map((e: EstadoDb) => ({
            ...e,
            cidades: (cid.data ?? []).filter((c: CidadeDb) => c.estado_id === e.id),
          })),
      }));

      setTitulos([...(tit.data ?? [])].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99)));
      setRegioes(arvore);
      setEstadosDb(est.data ?? []);
      setCidadesDb(cid.data ?? []);
      setNichos((nic.data ?? []) as Nicho[]);
      setEmpresas(empresasCompleta);
      setFotos(fot.data ?? []);
      await carregarAvaliacoes();
      setErro(null);
    } catch {
      setErro("Erro inesperado ao carregar o Reino.");
    }
  };

  // Efeito único de montagem — antes havia DOIS useEffect quase idênticos
  // (título + scroll + carregarDados + assinatura realtime), cada um abrindo
  // o MESMO canal "reino-realtime": o segundo tentava dar `.on()` num canal
  // já `.subscribe()`ado pelo primeiro e derrubava a página inteira (React
  // sem error boundary = tela preta). Achado testando local, 2026-09-01.
  useEffect(() => {
    document.title = "Reino";

    const onScroll = () => setMostrarTopo((mainRef.current?.scrollTop ?? 0) > 400);
    mainRef.current?.addEventListener("scroll", onScroll);

    carregarDados().finally(() => setCarregando(false));
    supabase.auth.getUser().then(({ data }) => setUsuarioId(data.user?.id ?? null));

    const tabelasReino = [
      "reino_titulos",
      "reino_regioes",
      "reino_estados",
      "reino_cidades",
      "reino_nichos",
      "reino_empresas",
      "reino_empresa_fotos",
      "reino_avaliacoes",
    ];

    let tempo: ReturnType<typeof setTimeout> | null = null;
    const reagir = () => {
      if (tempo) clearTimeout(tempo);
      tempo = setTimeout(() => carregarDados(), 400);
    };

    const canal = supabase.channel("reino-realtime");
    tabelasReino.forEach((tabela) => {
      canal.on("postgres_changes", { event: "*", schema: "public", table: tabela }, reagir);
    });
    canal.subscribe();

    return () => {
      mainRef.current?.removeEventListener("scroll", onScroll);
      if (tempo) clearTimeout(tempo);
      supabase.removeChannel(canal);
    };
  }, []);

  const toggleRegiao = (id: string) =>
    setRegiaoAberta((a) => (a === id ? null : id));
  const toggleEstado = (id: string) =>
    setEstadoAberto((a) => (a === id ? null : id));
  const limiteEstados = (r: Regiao) =>
    regiaoAberta === r.id ? r.estados : r.estados.slice(0, 3);

  const estadoRegiaoId = (estado: Estado): string | null => {
    for (const r of regioes) {
      if (r.estados.some((e) => e.id === estado.id)) return r.id;
    }
    return null;
  };

  const limparBusca = () => {
    setFNicho(""); setFEstado(""); setFCidade(""); setBuscaTexto("");
  };

  const buscaAtiva = !!(fNicho || fEstado || fCidade || buscaTexto.trim());

  const resultadoBusca: Empresa[] = (() => {
    return empresas.filter((e) => {
      if (fNicho && e.nicho_id !== fNicho) return false;
      if (fEstado && e.estado_id !== fEstado) return false;
      if (fCidade && e.cidade_id !== fCidade) return false;
      if (buscaTexto.trim()) {
        const t = normalizarTexto(buscaTexto.trim());
        const alvo = normalizarTexto(
          `${e.nome} ${e.categoria ?? ""} ${e.nicho_nome ?? ""} ${e.cidade_nome ?? ""} ${e.estado_nome ?? ""} ${e.descricao ?? ""}`,
        );
        if (!alvo.includes(t)) return false;
      }
      return true;
    });
  })();

  // Categorias já usadas por alguma empresa cadastrada — vira lista no
  // formulário (pedido Theus 2026-09-01) pra não duplicar grafia
  // ("Advogado" vs "advogado") por digitação livre.
  const categoriasExistentes = Array.from(
    new Set(empresas.map((e) => e.categoria).filter((c): c is string => !!c)),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const empresasDoSetor = (regiaoId: string, estadoId: string) =>
    empresas.filter(
      (e) => e.regiao_id === regiaoId && (!estadoId || e.estado_id === estadoId),
    );

  const sortearEmpresaSetor = (regiaoId: string, estadoId: string) => {
    const pool = empresasDoSetor(regiaoId, estadoId);
    const escolhida = pool.length
      ? pool[Math.floor(Math.random() * pool.length)].id
      : "";
    setEmpresaVitrine((prev) => ({ ...prev, [regiaoId]: escolhida }));
  };

  // Sorteia 1 empresa por setor assim que a Geografia carrega — só pros
  // setores que ainda não tinham escolha (não resorteia à toa a cada
  // atualização de dados via realtime).
  useEffect(() => {
    regioes.forEach((r) => {
      if (empresaVitrine[r.id] === undefined) sortearEmpresaSetor(r.id, estadoVitrine[r.id] ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regioes, empresas]);

  const fotosDaEmpresa = (empresaId: string) =>
    fotos.filter((f) => f.empresa_id === empresaId);
  const fotoPrincipal = (empresaId: string) => {
    const daEmpresa = fotosDaEmpresa(empresaId);
    return daEmpresa.find((f) => f.principal) ?? daEmpresa[0];
  };

  const atualizarEmpresa = (editada: Empresa) => {
    setEmpresas((prev) =>
      prev.map((e) => (e.id === editada.id ? editada : e)),
    );
  };

  // --- Helpers para sidebar e ratings ---
  const getMediaEstrelas = (empresaId: string): number => {
    const avs = avaliacoes.filter((a) => a.empresa_id === empresaId);
    if (avs.length === 0) return 0;
    return Number((avs.reduce((s, a) => s + a.estrelas, 0) / avs.length).toFixed(1));
  };
  const getTotalAvaliacoes = (empresaId: string): number =>
    avaliacoes.filter((a) => a.empresa_id === empresaId).length;

  // Empresas recomendadas pra quem tá vendo esta (pedido Theus 2026-09-01):
  // casa pelo nicho complementar (NICHOS_COMPLEMENTARES) e prioriza
  // proximidade — mesma cidade primeiro, senão mesmo estado, no máximo 6.
  const empresasRecomendadas = (empresa: Empresa): Empresa[] => {
    const complementares = empresa.nicho_nome ? NICHOS_COMPLEMENTARES[empresa.nicho_nome] ?? [] : [];
    if (complementares.length === 0) return [];
    const candidatas = empresas.filter(
      (e) => e.id !== empresa.id && e.nicho_nome && complementares.includes(e.nicho_nome),
    );
    const mesmaCidade = empresa.cidade_id ? candidatas.filter((e) => e.cidade_id === empresa.cidade_id) : [];
    const mesmoEstado = empresa.estado_id
      ? candidatas.filter((e) => e.estado_id === empresa.estado_id && !mesmaCidade.includes(e))
      : [];
    const resto = candidatas.filter((e) => !mesmaCidade.includes(e) && !mesmoEstado.includes(e));
    return [...mesmaCidade, ...mesmoEstado, ...resto].slice(0, 6);
  };

  const sidebarItens = [
    { id: "inicio", icone: Search, label: "Início", descricao: "Buscar e navegar por região" },
    { id: "vitrine", icone: Sparkles, label: "Vitrine", descricao: "1 empresa em destaque por setor" },
    { id: "hierarquia", icone: Crown, label: "Hierarquia", descricao: "Títulos e nobreza do Reino" },
    { id: "cadastrar", icone: Plus, label: "Cadastrar", descricao: "Nova empresa no Reino" },
    { id: "listas", icone: MapPinned, label: "Gerenciar", descricao: "Nichos, estados e cidades" },
  ] as const;

  // --- Rating modal handlers ---
  const abrirRating = async (empresa: Empresa) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const existente = avaliacoes.find((a) => a.empresa_id === empresa.id && a.usuario_id === user.id);
    setRatingEstrela(existente?.estrelas || 0);
    setRatingComentario(existente?.comentario || "");
    setRatingModal({ empresa, avaliacao: existente });
  };

  const salvarRating = async (estrelas: number, comentario: string) => {
    if (!ratingModal) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    try {
      if (ratingModal.avaliacao) {
        await (supabase as any).from("reino_avaliacoes")
          .update({ estrelas, comentario })
          .eq("id", ratingModal.avaliacao.id);
      } else {
        await (supabase as any).from("reino_avaliacoes")
          .insert({ empresa_id: ratingModal.empresa.id, usuario_id: user.id, estrelas, comentario });
      }
      await carregarAvaliacoes();
      setRatingModal(null);
      setRatingEstrela(0);
      setRatingComentario("");
    } catch (e) {
      console.error("Erro ao salvar avaliação:", e);
    }
  };

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        overflow: "hidden",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
        background:
          "radial-gradient(1200px 600px at 20% -10%, oklch(0.4 0.2 280 / 0.5), transparent 60%), linear-gradient(180deg, #17131f 0%, #0e0c14 100%)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "rgba(14,12,20,0.9)",
          backdropFilter: "blur(10px)",
          position: "relative",
          zIndex: 20,
        }}
      >
        <button
          onClick={() => nav("/")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 12,
            padding: "8px 14px",
            color: "#fff",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <ArrowLeft size={15} />
          Babel
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Crown size={26} style={{ color: "#f5c76a" }} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>
            Reino
          </h1>
        </div>
      </header>

      <div style={{ display: "flex", height: "calc(100vh - 57px)" }}>
        {/* Sidebar esquerda - apenas ícones, expande ao hover */}
        <aside
          onMouseEnter={() => setSidebarHover("aberta")}
          onMouseLeave={() => setSidebarHover(null)}
          style={{
            width: sidebarHover ? 260 : 72,
            minWidth: sidebarHover ? 260 : 72,
            transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            background: "rgba(14,12,20,0.95)",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            flexDirection: "column",
            padding: "16px 8px",
            gap: 8,
            overflow: "hidden",
            zIndex: 10,
          }}
        >
          {sidebarItens.map((item) => {
            const ativa = abaAtiva === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setAbaAtiva(item.id);
                  mainRef.current?.scrollTo({ top: 0 });
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: sidebarHover ? 12 : 0,
                  padding: "14px 12px",
                  borderRadius: 12,
                  background: ativa ? "rgba(245,199,106,0.12)" : "transparent",
                  border: ativa ? "1px solid rgba(245,199,106,0.35)" : "1px solid transparent",
                  color: "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                  justifyContent: sidebarHover ? "flex-start" : "center",
                }}
                title={item.descricao}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: ativa ? "linear-gradient(135deg,#f5c76a,#e0a33c)" : "rgba(245,199,106,0.15)",
                    color: ativa ? "#17131f" : "#f5c76a",
                    flexShrink: 0,
                  }}
                >
                  <item.icone size={18} />
                </span>
                {sidebarHover && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{item.label}</span>
                    <span style={{ fontSize: 11.5, opacity: 0.55 }}>{item.descricao}</span>
                  </div>
                )}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 10.5, opacity: 0.35, textAlign: "center", padding: "8px 4px" }}>
            Reino v1.0
          </div>
        </aside>

        {/* Conteúdo principal */}
        <main
          ref={mainRef}
          style={{
            flex: 1,
            overflowY: "auto",
            scrollBehavior: "smooth",
            maxWidth: sidebarHover ? "calc(100% - 260px)" : "calc(100% - 72px)",
            margin: "0 auto",
            padding: "24px 32px 80px",
            transition: "max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {carregando && (
            <p style={{ opacity: 0.6, textAlign: "center", padding: 60 }}>
              Carregando o Reino…
            </p>
          )}

          {erro && !carregando && (
            <p style={{ opacity: 0.7, textAlign: "center", padding: 60 }}>{erro}</p>
          )}

          {!carregando && !erro && abaAtiva === "inicio" && (
            <>
              {/* Barra de busca estilo Google */}
              <section
                id="busca"
                style={{
                  marginBottom: 28,
                  scrollMarginTop: 16,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, flex: "1 1 260px",
                    background: "transparent", border: "1px solid rgba(245,199,106,0.55)",
                    borderRadius: 12, padding: "0 12px",
                  }}>
                    <Search size={14} style={{ color: "#f5c76a" }} />
                    <input
                      value={buscaTexto}
                      onChange={(e) => setBuscaTexto(e.target.value)}
                      placeholder="Buscar por nome, categoria, cidade…"
                      style={{
                        flex: 1, background: "transparent", border: "none", outline: "none",
                        color: "#fff", fontSize: 13.5, padding: "11px 0",
                      }}
                    />
                    {buscaTexto && (
                      <button
                        onClick={() => setBuscaTexto("")}
                        title="Limpar busca"
                        style={{ background: "transparent", border: "none", color: "#fff", opacity: 0.5, cursor: "pointer", display: "grid", placeItems: "center" }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <SelectFiltro
                    valor={fNicho}
                    onChange={(v) => { setFNicho(v); setFCidade(""); }}
                    placeholder="Nicho (ex: Advocacia)"
                    icone={<Building2 size={14} />}
                  >
                    {nichos.map((n) => (
                      <option key={n.id} value={n.id}>{n.nome}</option>
                    ))}
                  </SelectFiltro>

                  <SelectFiltro
                    valor={fEstado}
                    onChange={(v) => { setFEstado(v); setFCidade(""); }}
                    placeholder="Estado"
                    icone={<MapPinned size={14} />}
                  >
                    {estadosDb.map((e) => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </SelectFiltro>

                  <SelectFiltro
                    valor={fCidade}
                    onChange={setFCidade}
                    placeholder="Cidade"
                    icone={<MapPin size={14} />}
                    disabled={!fEstado}
                  >
                    {fEstado &&
                      cidadesDoEstado(fEstado).map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                  </SelectFiltro>

                  <button
                    onClick={limparBusca}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 12,
                      padding: "11px 22px",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    <X size={16} />
                    Limpar
                  </button>
              </div>

              <p style={{ fontSize: 11.5, opacity: 0.55, margin: "10px 0 0 2px" }}>
                Ex.: Advocacia — São Paulo — São Paulo — pesquisar. Digite também
                texto livre para filtrar por nome/descrição.
              </p>
            </section>

            {/* Resultados — só aparece com filtro ativo (achado 2026-09-01:
                a busca filtrava certo, mas o resultado só aparecia lá
                dentro da Geografia, escondido atrás de accordion fechado —
                por isso Theus achava que "a busca não achava nada". Agora
                aparece na hora, logo abaixo da barra.) */}
            {buscaAtiva && (
              <section id="resultados-busca" style={{ marginBottom: 32, scrollMarginTop: 16 }}>
                <h2 style={{ fontSize: 15, margin: "0 0 12px", opacity: 0.85, display: "flex", alignItems: "center", gap: 8 }}>
                  <Search size={15} style={{ color: "#f5c76a" }} />
                  {resultadoBusca.length === 0
                    ? "Nenhuma empresa encontrada"
                    : `${resultadoBusca.length} ${resultadoBusca.length === 1 ? "empresa encontrada" : "empresas encontradas"}`}
                </h2>

                {resultadoBusca.length === 0 && (
                  <p style={{ fontSize: 12.5, opacity: 0.55, padding: "10px 2px" }}>
                    Ninguém bateu com esse filtro. Confere se o nome/categoria tá certo, ou tenta um termo mais curto.
                  </p>
                )}

                {resultadoBusca.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {resultadoBusca.map((e) => (
                      <CardEmpresaCompacta
                        key={e.id}
                        empresa={e}
                        foto={fotoPrincipal(e.id)}
                        mediaEstrelas={getMediaEstrelas(e.id)}
                        totalAvaliacoes={getTotalAvaliacoes(e.id)}
                        onClick={() => setEmpresaDetalhe(e)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Geografia + Empresas (acordeão) */}
            <section id="geografia" style={{ scrollMarginTop: 16 }}>
              <h2
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 18,
                  margin: "0 0 6px",
                  opacity: 0.9,
                }}
              >
                <MapPin size={18} style={{ color: "#f5c76a" }} />
                Geografia & Empresas
              </h2>
              <p style={{ fontSize: 12.5, opacity: 0.55, margin: "0 0 16px" }}>
                Clique em uma região para expandir os estados e ver as empresas.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {regioes.map((r) => {
                  const aberta = regiaoAberta === r.id;
                  return (
                    <div
                      key={r.id}
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 16,
                        overflow: "hidden",
                      }}
                    >
                      <button
                        onClick={() => toggleRegiao(r.id)}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "16px 18px",
                          background: "transparent",
                          border: "none",
                          color: "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {aberta ? (
                          <ChevronDown size={18} style={{ color: "#f5c76a" }} />
                        ) : (
                          <ChevronRight size={18} style={{ color: "#f5c76a" }} />
                        )}
                        <span style={{ fontWeight: 800, fontSize: 16, flex: 1 }}>
                          {r.nome}
                        </span>
                        <span style={{ fontSize: 12, opacity: 0.55 }}>
                          {r.estados.length} estados
                        </span>
                      </button>

                      {aberta && (
                        <div
                          style={{
                            padding: "4px 18px 18px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          {limiteEstados(r).map((e) => {
                            // Estrelas = ranking de recomendação (pedido Theus
                            // 2026-09-01): melhor avaliada aparece primeiro;
                            // sem avaliação nenhuma cai pro fim, por nome.
                            const lista = empresas
                              .filter((em) => em.estado_id === e.id)
                              .sort((a, b) => {
                                const diff = getMediaEstrelas(b.id) - getMediaEstrelas(a.id);
                                return diff !== 0 ? diff : a.nome.localeCompare(b.nome, "pt-BR");
                              });
                            return (
                              <div
                                key={e.id}
                                style={{
                                  background: "rgba(0,0,0,0.22)",
                                  border: "1px solid rgba(255,255,255,0.07)",
                                  borderRadius: 12,
                                  overflow: "hidden",
                                }}
                              >
                                <button
                                  onClick={() => toggleEstado(e.id)}
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "11px 14px",
                                    background: "transparent",
                                    border: "none",
                                    color: "#fff",
                                    cursor: "pointer",
                                    textAlign: "left",
                                  }}
                                >
                                  {estadoAberto === e.id ? (
                                    <ChevronDown size={15} style={{ color: "#e0a33c" }} />
                                  ) : (
                                    <ChevronRight size={15} style={{ color: "#e0a33c" }} />
                                  )}
                                  <span style={{ fontWeight: 600, flex: 1 }}>{e.nome}</span>
                                  <span style={{ fontSize: 11.5, opacity: 0.55 }}>
                                    {lista.length}{" "}
                                    {lista.length === 1 ? "empresa" : "empresas"}
                                  </span>
                                </button>

                                {estadoAberto === e.id && (
                                  <div style={{ padding: "2px 14px 14px" }}>
                                    <button
                                      onClick={() => setFormAbertoPara(e)}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        background: "linear-gradient(135deg,#f5c76a,#e0a33c)",
                                        border: "none",
                                        borderRadius: 10,
                                        padding: "8px 12px",
                                        color: "#17131f",
                                        fontWeight: 700,
                                        fontSize: 12.5,
                                        cursor: "pointer",
                                        marginBottom: 10,
                                      }}
                                    >
                                      <Plus size={14} />
                                      Cadastrar empresa
                                    </button>

                                    {lista.length === 0 && (
                                      <p style={{ fontSize: 12.5, opacity: 0.5, margin: 0 }}>
                                        Nenhuma empresa cadastrada neste estado.
                                      </p>
                                    )}

                                    {lista.length > 0 && (
                                      <div
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 8,
                                        }}
                                      >
                                        {lista.map((em) => (
                                          <div
                                            key={em.id}
                                            onClick={() => setEmpresaDetalhe(em)}
                                            style={{
                                              background: "rgba(255,255,255,0.04)",
                                              border: "1px solid rgba(255,255,255,0.08)",
                                              borderRadius: 10,
                                              padding: "10px 12px",
                                              cursor: "pointer",
                                            }}
                                          >
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                              <Building2 size={15} style={{ color: "#f5c76a" }} />
                                              <span style={{ fontWeight: 700, fontSize: 13 }}>{em.nome}</span>
                                              {em.nicho_nome && (
                                                <span
                                                  style={{
                                                    fontSize: 10.5,
                                                    opacity: 0.75,
                                                    background: "rgba(255,255,255,0.1)",
                                                    padding: "2px 8px",
                                                    borderRadius: 8,
                                                  }}
                                                >
                                                  {em.nicho_nome}
                                                </span>
                                              )}
                                              {getTotalAvaliacoes(em.id) > 0 && (
                                                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                                  <LinhaEstrelas nota={getMediaEstrelas(em.id)} tamanho={11} />
                                                  <span style={{ fontSize: 10.5, opacity: 0.6 }}>
                                                    {getMediaEstrelas(em.id).toFixed(1)}
                                                  </span>
                                                </span>
                                              )}
                                              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); setEditandoEmpresa(em); }}
                                                  style={{
                                                    background: "rgba(245,199,106,0.15)",
                                                    border: "1px solid rgba(245,199,106,0.4)",
                                                    borderRadius: 8,
                                                    padding: "4px 9px",
                                                    color: "#f5c76a",
                                                    fontSize: 11.5,
                                                    fontWeight: 700,
                                                    cursor: "pointer",
                                                  }}
                                                >
                                                  Editar
                                                </button>
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {!aberta && r.estados.length > 3 && (
                            <p style={{ fontSize: 11.5, opacity: 0.5, margin: 0 }}>
                              e mais {r.estados.length - 3} estados…
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
            </>
          )}

          {!carregando && !erro && abaAtiva === "vitrine" && (
            <>
            {/* Vitrine — 1 empresa em destaque por setor (região), com
                filtro de estado pra trocar (pedido Theus 2026-09-01) */}
            <section id="vitrine" style={{ scrollMarginTop: 16 }}>
              <h2
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 18,
                  margin: "0 0 6px",
                  opacity: 0.9,
                }}
              >
                <Sparkles size={18} style={{ color: "#f5c76a" }} />
                Vitrine
              </h2>
              <p style={{ fontSize: 12.5, opacity: 0.55, margin: "0 0 16px" }}>
                Uma empresa em destaque por setor. Escolha o estado pra trocar, ou puxe outra ao acaso.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 14,
                }}
              >
                {regioes.map((r) => {
                  const estadoSel = estadoVitrine[r.id] ?? "";
                  const empresaId = empresaVitrine[r.id];
                  const empresa = empresaId ? empresas.find((e) => e.id === empresaId) : undefined;
                  const foto = empresa ? fotoPrincipal(empresa.id) : undefined;
                  return (
                    <div
                      key={r.id}
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 16,
                        padding: 14,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{r.nome}</span>
                        <button
                          onClick={() => sortearEmpresaSetor(r.id, estadoSel)}
                          title="Puxar outra empresa"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            background: "rgba(245,199,106,0.12)",
                            border: "1px solid rgba(245,199,106,0.4)",
                            borderRadius: 8,
                            padding: "5px 9px",
                            color: "#f5c76a",
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          <Shuffle size={12} /> Trocar
                        </button>
                      </div>

                      <SelectFiltro
                        valor={estadoSel}
                        onChange={(v) => {
                          setEstadoVitrine((prev) => ({ ...prev, [r.id]: v }));
                          sortearEmpresaSetor(r.id, v);
                        }}
                        placeholder="Todos os estados"
                        icone={<MapPinned size={13} />}
                        crescer={false}
                      >
                        {r.estados.map((e) => (
                          <option key={e.id} value={e.id}>{e.nome}</option>
                        ))}
                      </SelectFiltro>

                      {!empresa && (
                        <p style={{ fontSize: 12, opacity: 0.5, textAlign: "center", padding: "18px 4px", margin: 0 }}>
                          Nenhuma empresa cadastrada {estadoSel ? "neste estado" : "nesta região"} ainda.
                        </p>
                      )}

                      {empresa && (
                        <CardEmpresaCompacta
                          empresa={empresa}
                          foto={foto}
                          mediaEstrelas={getMediaEstrelas(empresa.id)}
                          totalAvaliacoes={getTotalAvaliacoes(empresa.id)}
                          onClick={() => setEmpresaDetalhe(empresa)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {!carregando && !erro && abaAtiva === "hierarquia" && (
          <PainelHierarquia titulos={titulos} onAtualizado={() => carregarDados()} />
        )}

        {!carregando && !erro && abaAtiva === "cadastrar" && (
          <FormEmpresa
            pagina
            estado={{ id: "", nome: "", cidades: [] }}
            nichos={nichos}
            estadosDb={estadosDb}
            cidadesDb={cidadesDb}
            categorias={categoriasExistentes}
            onClose={() => setAbaAtiva("inicio")}
            onSalvo={(empresa) => {
              setEmpresas((prev) => [...prev, empresa]);
              setAbaAtiva("inicio");
              carregarDados();
            }}
          />
        )}

        {!carregando && !erro && abaAtiva === "listas" && (
          <GerenciarListas
            nichos={nichos}
            estadosDb={estadosDb}
            cidadesDb={cidadesDb}
            regioes={regioes}
            onAtualizado={() => carregarDados()}
          />
        )}
      </main>

      {mostrarTopo && (
        <button
          onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "linear-gradient(135deg,#f5c76a,#e0a33c)",
            border: "none",
            borderRadius: 50,
            padding: "10px 14px",
            cursor: "pointer",
            color: "#17131f",
            fontWeight: 800,
            fontSize: 13,
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          }}
        >
          Topo ↑
        </button>
      )}

      {formAbertoPara && !editandoEmpresa && (
        <FormEmpresa
          estado={formAbertoPara}
          nichos={nichos}
          estadosDb={estadosDb}
          cidadesDb={cidadesDb}
          categorias={categoriasExistentes}
          onClose={() => setFormAbertoPara(null)}
          onSalvo={(empresa) => {
            setEmpresas((prev) => [...prev, empresa]);
            setFormAbertoPara(null);
            const rid = estadoRegiaoId(formAbertoPara!);
            if (rid) setRegiaoAberta(rid);
            setEstadoAberto(formAbertoPara!.id);
            carregarDados();
          }}
        />
      )}

      {editandoEmpresa && (
        <FormEmpresa
          estado={{ id: editandoEmpresa.estado_id ?? "", nome: editandoEmpresa.estado_nome ?? "Estado", cidades: [] }}
          nichos={nichos}
          estadosDb={estadosDb}
          cidadesDb={cidadesDb}
          categorias={categoriasExistentes}
          empresaInicial={editandoEmpresa}
          onClose={() => setEditandoEmpresa(null)}
          onSalvo={(editada) => {
            atualizarEmpresa(editada);
            setEditandoEmpresa(null);
            carregarDados();
          }}
        />
      )}

      {empresaDetalhe && (
        <DetalheEmpresa
          empresa={empresaDetalhe}
          fotos={fotosDaEmpresa(empresaDetalhe.id)}
          avaliacoes={avaliacoes.filter((a) => a.empresa_id === empresaDetalhe.id)}
          usuarioId={usuarioId}
          onAvaliar={() => abrirRating(empresaDetalhe)}
          recomendadas={empresasRecomendadas(empresaDetalhe)}
          fotoPrincipal={fotoPrincipal}
          getMediaEstrelas={getMediaEstrelas}
          getTotalAvaliacoes={getTotalAvaliacoes}
          onSelecionarRecomendada={(e) => setEmpresaDetalhe(e)}
          onEditar={() => {
            setEditandoEmpresa(empresaDetalhe);
            setEmpresaDetalhe(null);
          }}
          onClose={() => setEmpresaDetalhe(null)}
          onAtualizado={() => carregarDados()}
        />
      )}

      {/* Modal de Avaliação */}
      {ratingModal && (
        <div
          onClick={() => setRatingModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            display: "grid",
            placeItems: "center",
            zIndex: 200,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#17131f",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 18,
              padding: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Avaliar {ratingModal.empresa.nome}</h3>
              <button
                onClick={() => setRatingModal(null)}
                style={{ background: "transparent", border: "none", color: "#fff", opacity: 0.5, cursor: "pointer", fontSize: 22, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <p style={{ fontSize: 13.5, opacity: 0.65, marginBottom: 20 }}>
              Sua avaliação ajuda outros usuários a escolherem o melhor serviço.
              Recomendado avaliar depois de já ter consumido o produto ou vivido a experiência.
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
              {[1, 2, 3, 4, 5].map((estrela) => (
                <button
                  key={estrela}
                  onClick={() => setRatingEstrela(estrela)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 4,
                    color: ratingEstrela >= estrela ? "#f5c76a" : "rgba(255,255,255,0.2)",
                    transition: "transform 0.1s, color 0.1s",
                  }}
                  onMouseEnter={() => setHoverEstrela(estrela)}
                  onMouseLeave={() => setHoverEstrela(0)}
                >
                  <Star size={36} fill={ratingEstrela >= estrela || hoverEstrela >= estrela ? "currentColor" : "none"} />
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12.5, opacity: 0.7, marginBottom: 8 }}>
                Comentário (opcional)
              </label>
              <textarea
                value={ratingComentario}
                onChange={(e) => setRatingComentario(e.target.value)}
                placeholder="Como foi sua experiência?"
                style={{
                  width: "100%",
                  minHeight: 80,
                  padding: "12px 14px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  color: "#fff",
                  fontSize: 13.5,
                  fontFamily: "inherit",
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setRatingModal(null)}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 10,
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (ratingEstrela > 0) {
                    salvarRating(ratingEstrela, ratingComentario);
                  }
                }}
                disabled={ratingEstrela === 0}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: ratingEstrela > 0 ? "linear-gradient(135deg,#f5c76a,#e0a33c)" : "rgba(255,255,255,0.05)",
                  border: "none",
                  borderRadius: 10,
                  color: ratingEstrela > 0 ? "#17131f" : "rgba(255,255,255,0.3)",
                  fontWeight: 700,
                  fontSize: 13.5,
                  cursor: ratingEstrela > 0 ? "pointer" : "not-allowed",
                }}
              >
                Salvar avaliação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

// Card compacto de empresa — usado na Vitrine e nos Resultados da busca
// (extraído 2026-09-01 pra não duplicar o mesmo JSX nos dois lugares).
function CardEmpresaCompacta({
  empresa,
  foto,
  mediaEstrelas = 0,
  totalAvaliacoes = 0,
  onClick,
}: {
  empresa: Empresa;
  foto?: Foto;
  mediaEstrelas?: number;
  totalAvaliacoes?: number;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          position: "relative",
          aspectRatio: "16/9",
          overflow: "hidden",
          background: "linear-gradient(135deg,#2a2440,#17131f)",
        }}
      >
        <img
          src={foto ? foto.url : BANNER_PADRAO}
          alt={empresa.nome}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{empresa.nome}</div>
        {totalAvaliacoes > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
            <LinhaEstrelas nota={mediaEstrelas} tamanho={11} />
            <span style={{ fontSize: 10.5, opacity: 0.6 }}>
              {mediaEstrelas.toFixed(1)} ({totalAvaliacoes})
            </span>
          </div>
        )}
        {empresa.nicho_nome && (
          <span
            style={{
              display: "inline-block",
              marginTop: 6,
              fontSize: 10.5,
              background: "rgba(245,199,106,0.15)",
              color: "#f5c76a",
              padding: "2px 8px",
              borderRadius: 8,
            }}
          >
            {empresa.nicho_nome}
          </span>
        )}
        {empresa.cidade_nome && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 11.5, opacity: 0.7 }}>
            <MapPin size={11} />
            {empresa.cidade_nome}{empresa.estado_nome ? `, ${empresa.estado_nome}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function SelectFiltro({
  valor,
  onChange,
  placeholder,
  children,
  icone,
  disabled,
  crescer = true,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
  icone?: React.ReactNode;
  disabled?: boolean;
  crescer?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "transparent",
        border: "1px solid rgba(245,199,106,0.55)",
        borderRadius: 12,
        padding: "0 12px",
        minWidth: 180,
        // crescer=false: em container column (ex. card da Vitrine), flex:1
        // esticaria o select pra ocupar a ALTURA toda do card (o eixo
        // principal do flex vira vertical) — achado testando 2026-09-01.
        flex: crescer ? 1 : "0 0 auto",
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      {icone && <span style={{ color: "#f5c76a", display: "grid", placeItems: "center" }}>{icone}</span>}
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: valor ? "#fff" : "#cfc8a8",
          fontSize: 13.5,
          padding: "11px 0",
          cursor: "pointer",
        }}
      >
        <option value="" style={{ color: "#000" }}>{placeholder}</option>
        {children}
      </select>
    </div>
  );
}

function DetalheEmpresa({
  empresa,
  fotos,
  avaliacoes,
  usuarioId,
  onAvaliar,
  recomendadas,
  fotoPrincipal,
  getMediaEstrelas,
  getTotalAvaliacoes,
  onSelecionarRecomendada,
  onClose,
  onEditar,
  onAtualizado,
}: {
  empresa: Empresa;
  fotos: Foto[];
  avaliacoes: Avaliacao[];
  usuarioId: string | null;
  onAvaliar: () => void;
  recomendadas: Empresa[];
  fotoPrincipal: (empresaId: string) => Foto | undefined;
  getMediaEstrelas: (empresaId: string) => number;
  getTotalAvaliacoes: (empresaId: string) => number;
  onSelecionarRecomendada: (empresa: Empresa) => void;
  onClose: () => void;
  onEditar?: () => void;
  onAtualizado?: () => void;
}) {
  const principal = fotos.find((f) => f.principal) ?? fotos[0];
  const [definindo, setDefinindo] = useState<string | null>(null);

  // Ordenado mais recente primeiro; a avaliação do próprio usuário (se
  // houver) vem sempre no topo, com destaque (pedido Theus 2026-09-01).
  const avaliacoesOrdenadas = [...avaliacoes].sort((a, b) => {
    if (a.usuario_id === usuarioId) return -1;
    if (b.usuario_id === usuarioId) return 1;
    return b.criado_em.localeCompare(a.criado_em);
  });
  const mediaEstrelas = avaliacoes.length
    ? avaliacoes.reduce((s, a) => s + a.estrelas, 0) / avaliacoes.length
    : 0;
  const minhaAvaliacao = avaliacoes.find((a) => a.usuario_id === usuarioId);

  // Foto de capa (a que aparece no card do painel) — não é a "foto de
  // perfil"/logo do formulário, é qual das fotos da galeria vira destaque.
  const definirPrincipal = async (fotoId: string) => {
    if (fotoId === principal?.id) return;
    setDefinindo(fotoId);
    try {
      await (supabase as any).from("reino_empresa_fotos").update({ principal: false }).eq("empresa_id", empresa.id);
      await (supabase as any).from("reino_empresa_fotos").update({ principal: true }).eq("id", fotoId);
      onAtualizado?.();
    } finally {
      setDefinindo(null);
    }
  };
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#17131f",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 18,
        }}
      >
        <div
          style={{
            height: 200,
            background: "linear-gradient(135deg,#2a2440,#17131f)",
            position: "relative",
          }}
        >
          {principal ? (
            <img src={principal.url} alt={empresa.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <img src={BANNER_PADRAO} alt="Reino" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "rgba(0,0,0,0.5)",
              border: "none",
              borderRadius: 50,
              padding: 8,
              cursor: "pointer",
              color: "#fff",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 22, flex: 1 }}>{empresa.nome}</h2>
            {onEditar && (
              <button
                onClick={onEditar}
                style={{
                  background: "rgba(245,199,106,0.15)",
                  border: "1px solid rgba(245,199,106,0.4)",
                  borderRadius: 8,
                  padding: "6px 12px",
                  color: "#f5c76a",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Editar
              </button>
            )}
          </div>
          {empresa.nicho_nome && (
            <span
              style={{
                display: "inline-block",
                marginTop: 8,
                fontSize: 12,
                background: "rgba(245,199,106,0.15)",
                color: "#f5c76a",
                padding: "4px 10px",
                borderRadius: 8,
              }}
            >
              {empresa.nicho_nome}
            </span>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <LinhaEstrelas nota={mediaEstrelas} tamanho={16} />
            <span style={{ fontSize: 13, opacity: 0.75 }}>
              {avaliacoes.length > 0
                ? `${mediaEstrelas.toFixed(1)} (${avaliacoes.length} ${avaliacoes.length === 1 ? "avaliação" : "avaliações"})`
                : "Ainda sem avaliação"}
            </span>
            <button
              onClick={onAvaliar}
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: minhaAvaliacao ? "transparent" : "linear-gradient(135deg,#f5c76a,#e0a33c)",
                border: minhaAvaliacao ? "1px solid rgba(245,199,106,0.5)" : "none",
                borderRadius: 10,
                padding: "7px 14px",
                color: minhaAvaliacao ? "#f5c76a" : "#17131f",
                fontWeight: 700,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              <Star size={13} />
              {minhaAvaliacao ? "Editar sua avaliação" : "Avaliar"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            {empresa.categoria && (<InfoLinha icone={<Building2 size={15} />} texto={empresa.categoria} />)}
            {empresa.endereco && (
              <InfoLinha icone={<MapPinned size={15} />}
                texto={[empresa.endereco, empresa.bairro, empresa.cidade_nome, empresa.estado_nome, empresa.cep]
                  .filter(Boolean).join(", ")}
                href={mapsLink([empresa.endereco, empresa.bairro, empresa.cidade_nome, empresa.estado_nome])}
              />
            )}
            {empresa.telefone && <InfoLinha icone={<Phone size={15} />} texto={empresa.telefone} href={waLink(empresa.telefone)} />}
            {empresa.website && <InfoLinha icone={<Globe size={15} />} texto={empresa.website} href={empresa.website} />}
            {empresa.horario && empresa.horario.length > 0 && (
              <InfoLinha icone={<Clock size={15} />} texto="Veja os horários de funcionamento" />
            )}
          </div>

          {empresa.descricao && (
            <>
              <h3 style={{ fontSize: 15, margin: "18px 0 6px" }}>Sobre</h3>
              <p style={{ fontSize: 13.5, opacity: 0.85, margin: 0, lineHeight: 1.5 }}>{empresa.descricao}</p>
            </>
          )}

          {fotos.length > 1 && (
            <>
              <h3 style={{ fontSize: 15, margin: "18px 0 4px" }}>Fotos</h3>
              <p style={{ fontSize: 11.5, opacity: 0.55, margin: "0 0 10px" }}>
                Clique numa foto pra deixar ela de capa no card do painel.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
                {fotos.map((f) => {
                  const ehPrincipal = f.id === principal?.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => void definirPrincipal(f.id)}
                      disabled={!!definindo}
                      title={ehPrincipal ? "Foto de capa atual" : "Tornar foto de capa"}
                      style={{
                        position: "relative", padding: 0, border: ehPrincipal ? "2px solid #f5c76a" : "2px solid transparent",
                        borderRadius: 10, cursor: definindo ? "default" : "pointer", background: "none",
                        opacity: definindo && definindo !== f.id ? 0.6 : 1,
                      }}
                    >
                      <img src={f.url} alt="Foto" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 8, display: "block" }} />
                      {ehPrincipal && (
                        <span style={{
                          position: "absolute", top: 4, right: 4, background: "#f5c76a", color: "#17131f",
                          borderRadius: 999, width: 20, height: 20, display: "grid", placeItems: "center",
                        }}>
                          <Star size={12} fill="#17131f" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Avaliações — estrelas + comentário de quem já usou (pedido
              Theus 2026-09-01). Sem nome de quem avaliou: reino_avaliacoes
              é global (cruza tenants) e a RLS de profiles não libera ler
              perfil de gente de outro tenant — mostrar só estrelas/comentário
              evita essa barreira sem precisar mexer em RLS de fora do Reino. */}
          <h3 style={{ fontSize: 15, margin: "18px 0 4px" }}>
            Avaliações {avaliacoes.length > 0 && `(${avaliacoes.length})`}
          </h3>
          {avaliacoesOrdenadas.length === 0 && (
            <p style={{ fontSize: 12.5, opacity: 0.55, margin: "0 0 4px" }}>
              Ninguém avaliou ainda. Já usou? Seja o primeiro.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 4 }}>
            {avaliacoesOrdenadas.map((a) => (
              <div
                key={a.id}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: a.usuario_id === usuarioId ? "1px solid rgba(245,199,106,0.4)" : "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <LinhaEstrelas nota={a.estrelas} tamanho={13} />
                  <span style={{ fontSize: 11, opacity: 0.5 }}>
                    {a.usuario_id === usuarioId ? "Sua avaliação · " : ""}
                    {new Date(a.criado_em).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {a.comentario && (
                  <p style={{ fontSize: 13, opacity: 0.85, margin: "6px 0 0", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                    {a.comentario}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Empresas recomendadas — negócio complementar por perto
              (pedido Theus 2026-09-01: "Uber precisa de pneu, então tem
              como recomendada uma borracharia, uma mecânica"). Casado por
              nicho complementar (NICHOS_COMPLEMENTARES) + proximidade. */}
          {recomendadas.length > 0 && (
            <>
              <h3 style={{ fontSize: 15, margin: "18px 0 4px" }}>Empresas recomendadas</h3>
              <p style={{ fontSize: 11.5, opacity: 0.55, margin: "0 0 10px" }}>
                Negócios que combinam com {empresa.nicho_nome ?? "esta empresa"}, perto dela.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                {recomendadas.map((r) => (
                  <CardEmpresaCompacta
                    key={r.id}
                    empresa={r}
                    foto={fotoPrincipal(r.id)}
                    mediaEstrelas={getMediaEstrelas(r.id)}
                    totalAvaliacoes={getTotalAvaliacoes(r.id)}
                    onClick={() => onSelecionarRecomendada(r)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Fileira de estrelas somente leitura — usada no card compacto, no
// detalhe da empresa e em cada avaliação individual.
function LinhaEstrelas({ nota, tamanho = 13 }: { nota: number; tamanho?: number }) {
  const inteira = Math.floor(nota);
  const meia = nota - inteira >= 0.5;
  return (
    <span style={{ display: "flex", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={tamanho}
          style={{ color: "#f5c76a" }}
          fill={i <= inteira || (i === inteira + 1 && meia) ? "#f5c76a" : "none"}
        />
      ))}
    </span>
  );
}

function InfoLinha({
  icone,
  texto,
  href,
}: {
  icone: React.ReactNode;
  texto: string;
  href?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, opacity: 0.9 }}>
      <span style={{ width: 18, color: "#f5c76a", display: "grid", placeItems: "center" }}>{icone}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" style={{ color: "#8ab4f8", textDecoration: "none" }}>{texto}</a>
      ) : (
        <span>{texto}</span>
      )}
    </div>
  );
}

function FormEmpresa({
  estado,
  EstadoInject,
  nichos,
  estadosDb,
  cidadesDb,
  categorias,
  empresaInicial,
  onClose,
  onSalvo,
  pagina,
}: {
  estado: Estado;
  EstadoInject?: (estado: Estado) => string | null;
  nichos: Nicho[];
  estadosDb: EstadoDb[];
  cidadesDb: CidadeDb[];
  categorias: string[];
  empresaInicial?: Empresa | null;
  onClose: () => void;
  onSalvo: (empresa: Empresa) => void;
  // true = renderiza como aba/página própria (sem overlay fixo). Usado só
  // pela aba "Cadastrar" da sidebar — editar continua sempre como modal
  // (pedido Theus 2026-09-01: cada função vira aba, mas editar é ação
  // contextual em cima de uma empresa, não uma página fixa).
  pagina?: boolean;
}) {
  const [nome, setNome] = useState(empresaInicial?.nome ?? "");
  const [nichoId, setNichoId] = useState(empresaInicial?.nicho_id ?? "");
  const [categoria, setCategoria] = useState(empresaInicial?.categoria ?? "");
  const [endereco, setEndereco] = useState(empresaInicial?.endereco ?? "");
  const [bairro, setBairro] = useState(empresaInicial?.bairro ?? "");
  const [cidadeId, setCidadeId] = useState(empresaInicial?.cidade_id ?? "");
  const [estadoId, setEstadoId] = useState(
    empresaInicial?.estado_id ?? estado.id,
  );
  const [cep, setCep] = useState(empresaInicial?.cep ?? "");
  const [telefone, setTelefone] = useState(empresaInicial?.telefone ?? "");
  const [website, setWebsite] = useState(empresaInicial?.website ?? "");
  const [abrangencia, setAbrangencia] = useState(empresaInicial?.abrangencia ?? "");
  const [descricao, setDescricao] = useState(empresaInicial?.descricao ?? "");
  const [fotoPerfil, setFotoPerfil] = useState<File | null>(null);
  const [galeria, setGaleria] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const editando = !!empresaInicial;

  const cidades = cidadesDb.filter((c) => c.estado_id === estadoId);

  // Busca CEP via ViaCEP
  const buscarCep = async (cepNumeros: string) => {
    try {
      setMsg("Buscando CEP…");
      const resp = await fetch(`https://viacep.com.br/ws/${cepNumeros}/json/`);
      const data = await resp.json();
      if (!data.erro) {
        setEndereco(data.logradouro || "");
        setBairro(data.bairro || "");
        // Acha o estado pela SIGLA (via mapa UF→nome), não por comparar nome
        // cheio com sigla — aí sim dá pra achar a cidade dentro dele por nome.
        const nomeEstado = UF_PARA_ESTADO[String(data.uf ?? "").toUpperCase()];
        const estadoEncontrado = nomeEstado
          ? estadosDb.find((e) => e.nome.toLowerCase() === nomeEstado.toLowerCase())
          : undefined;
        const cidadeEncontrada = estadoEncontrado
          ? cidadesDb.find(
              (c) => c.estado_id === estadoEncontrado.id && c.nome.toLowerCase() === data.localidade.toLowerCase(),
            )
          : undefined;
        if (cidadeEncontrada) {
          setCidadeId(cidadeEncontrada.id);
          setEstadoId(cidadeEncontrada.estado_id);
        } else if (estadoEncontrado) {
          setEstadoId(estadoEncontrado.id);
        }
        setMsg("Endereço preenchido automaticamente!");
        setTimeout(() => setMsg(null), 3000);
      } else {
        setMsg("CEP não encontrado");
        setTimeout(() => setMsg(null), 3000);
      }
    } catch (e) {
      console.error("Erro ao buscar CEP:", e);
      setMsg("Erro ao buscar CEP");
      setTimeout(() => setMsg(null), 3000);
    }
  };

  // Busca no Google Maps (buscar-empresa-google/detalhar-empresa-google —
  // mesma API/chave RapidAPI que a PABX usa em prospectar/enriquecer).
  // Digita o nome, escolhe um resultado, a ficha vem preenchida (endereço,
  // telefone, fotos) sem salvar — dono edita/tira imagem à vontade antes do
  // "Salvar empresa". Pedido Theus, 2026-09-01.
  const [buscaGoogleAberta, setBuscaGoogleAberta] = useState(false);
  const [buscaGoogleTexto, setBuscaGoogleTexto] = useState("");
  const [buscandoGoogle, setBuscandoGoogle] = useState(false);
  const [resultadosGoogle, setResultadosGoogle] = useState<CandidatoGoogle[]>([]);
  const [importandoPlaceId, setImportandoPlaceId] = useState<string | null>(null);
  const debounceGoogle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceGoogle.current) clearTimeout(debounceGoogle.current);
    if (!buscaGoogleAberta || buscaGoogleTexto.trim().length < 3) { setResultadosGoogle([]); return; }
    debounceGoogle.current = setTimeout(() => {
      setBuscandoGoogle(true);
      supabase.functions.invoke("buscar-empresa-google", { body: { query: buscaGoogleTexto.trim() } })
        .then(({ data, error }) => {
          if (error || data?.erro) { setMsg(data?.erro || "Erro ao buscar no Google."); return; }
          setResultadosGoogle((data?.candidatos ?? []) as CandidatoGoogle[]);
        })
        .finally(() => setBuscandoGoogle(false));
    }, 450);
    return () => { if (debounceGoogle.current) clearTimeout(debounceGoogle.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaGoogleTexto, buscaGoogleAberta]);

  // URL de foto (Google CDN, permite CORS) → File — reaproveita 100% do
  // upload/preview/remover que já existem em UploadFoto/UploadGaleria.
  const urlParaFile = async (url: string, nome: string): Promise<File | null> => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return new File([blob], nome, { type: blob.type || "image/jpeg" });
    } catch {
      return null;
    }
  };

  // Casa a categoria vinda do Google com um nicho já cadastrado — nome
  // exato bate direto ("Supermercado" → nicho "Supermercado"); senão tenta
  // por inclusão de palavra. Sem isso o campo Nicho ficava sempre vazio
  // (achado 2026-09-01: 0 de 3 empresas de teste tinham nicho_id — a busca
  // por nicho nunca encontrava nada).
  const casarNicho = (categoriaGoogle: string, lista: Nicho[]): string | null => {
    const alvo = categoriaGoogle.trim().toLowerCase();
    if (!alvo) return null;
    const exato = lista.find((n) => n.nome.toLowerCase() === alvo);
    if (exato) return exato.id;
    const parcial = lista.find(
      (n) => alvo.includes(n.nome.toLowerCase()) || n.nome.toLowerCase().includes(alvo),
    );
    return parcial?.id ?? null;
  };

  const escolherResultadoGoogle = async (c: CandidatoGoogle) => {
    setImportandoPlaceId(c.google_place_id);
    setMsg("Importando dados do Google…");
    try {
      const { data, error } = await supabase.functions.invoke("detalhar-empresa-google", {
        body: { google_place_id: c.google_place_id },
      });
      if (error || data?.erro) { setMsg(data?.erro || "Erro ao importar do Google."); return; }
      const d = data as DetalheGoogle;

      setNome(d.nome ?? c.nome);
      if (d.categoria) {
        setCategoria(d.categoria);
        const nichoAchado = casarNicho(d.categoria, nichos);
        if (nichoAchado) setNichoId(nichoAchado);
      }
      if (d.telefone) setTelefone(d.telefone);
      if (d.site) setWebsite(d.site);
      if (d.endereco) setEndereco(d.endereco);
      if (d.bairro) setBairro(d.bairro);
      if (d.cep) {
        const digitos = d.cep.replace(/\D/g, "");
        setCep(digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos);
        await buscarCep(digitos); // reaproveita achar cidade_id/estado_id certos
      }

      const arquivos = (await Promise.all(
        (d.imagens ?? []).map((url, i) => urlParaFile(url, `google-${i}.jpg`)),
      )).filter((f): f is File => f !== null);
      if (arquivos.length) {
        setFotoPerfil(arquivos[0]);
        setGaleria(arquivos.slice(1));
      }

      setBuscaGoogleAberta(false);
      setBuscaGoogleTexto("");
      setResultadosGoogle([]);
      setMsg("Dados do Google importados — confere e edita antes de salvar.");
      setTimeout(() => setMsg(null), 4000);
    } finally {
      setImportandoPlaceId(null);
    }
  };

  const uploadImagem = async (file: File, caminho: string): Promise<string> => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${caminho}.${ext}`;
    const { error } = await supabase.storage.from("reino").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: pub } = supabase.storage.from("reino").getPublicUrl(path);
    return pub.publicUrl;
  };

  const salvar = async () => {
    if (!nome.trim()) { setMsg("Informe o nome da empresa."); return; }
    setSalvando(true);
    setMsg(null);
    try {
      const regiaoDoEstado = estadosDb.find((e) => e.id === estadoId)?.regiao_id
        ?? (empresaInicial ? null : (EstadoInject ? EstadoInject(estado) : null));

      const payload: any = {
        nome: nome.trim(),
        nicho_id: nichoId || null,
        categoria: categoria.trim() || null,
        telefone: telefone.trim() || null,
        website: website.trim() || null,
        endereco: endereco.trim() || null,
        bairro: bairro.trim() || null,
        cep: cep.trim() || null,
        cidade_id: cidadeId || null,
        estado_id: estadoId || null,
        regiao_id: regiaoDoEstado,
        abrangencia: abrangencia || null,
        descricao: descricao.trim() || null,
      };

      let data: any;
      let error: any;

      if (editando && empresaInicial) {
        if (fotoPerfil) {
          const url = await uploadImagem(fotoPerfil, `empresas/${empresaInicial.id}/perfil`);
          payload.foto_perfil = url;
        }
        const res = await supabase.from("reino_empresas").update(payload).eq("id", empresaInicial.id).select().single() as any;
        data = res.data; error = res.error;

        if (!error && data.id) {
          // nova foto de perfil => grava na galeria e marca como principal
          if (fotoPerfil) {
            await (supabase as any).from("reino_empresa_fotos").update({ principal: false }).eq("empresa_id", data.id);
            await supabase.from("reino_empresa_fotos").insert({ empresa_id: data.id, url: payload.foto_perfil, principal: true });
          }
          // salva novas fotos de galeria
          for (const f of galeria) {
            const url = await uploadImagem(f, `empresas/${data.id}/galeria/${crypto.randomUUID()}`);
            await supabase.from("reino_empresa_fotos").insert({ empresa_id: data.id, url, principal: false });
          }
        }
      } else {
        const baseId = crypto.randomUUID();
        let fotoPerfilUrl: string | null = null;
        if (fotoPerfil) {
          fotoPerfilUrl = await uploadImagem(fotoPerfil, `empresas/${baseId}/perfil`);
        }
        payload.foto_perfil = fotoPerfilUrl;
        const res = await supabase.from("reino_empresas").insert(payload).select().single() as any;
        data = res.data; error = res.error;

        if (!error && fotoPerfilUrl && data.id) {
          await supabase.from("reino_empresa_fotos").insert({ empresa_id: data.id, url: fotoPerfilUrl, principal: true });
        }
        for (const f of galeria) {
          const url = await uploadImagem(f, `empresas/${data.id}/galeria/${crypto.randomUUID()}`);
          await supabase.from("reino_empresa_fotos").insert({ empresa_id: data.id, url, principal: false });
        }
      }

      if (error) throw error;
      const empresaSalva: Empresa = { ...data, horario: data.horario ?? null };

      const nichoMap = new Map(nichos.map((n) => [n.id, n.nome]));
      const cidadeMap = new Map(cidadesDb.map((c) => [c.id, c.nome]));
      const finalEmpresa: Empresa = {
        ...empresaSalva,
        nicho_nome: empresaSalva.nicho_id ? nichoMap.get(empresaSalva.nicho_id) ?? null : null,
        cidade_nome: empresaSalva.cidade_id ? cidadeMap.get(empresaSalva.cidade_id) ?? null : null,
        estado_nome: estadosDb.find((e) => e.id === estadoId)?.nome ?? null,
      };
      onSalvo(finalEmpresa);
    } catch (e: any) {
      setMsg(e?.message || "Erro ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      style={
        pagina
          ? { width: "100%" }
          : {
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              display: "grid",
              placeItems: "center",
              zIndex: 100,
              padding: 20,
            }
      }
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: pagina ? "none" : "92vh",
          overflowY: pagina ? "visible" : "auto",
          margin: pagina ? "0 auto" : 0,
          background: "#17131f",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 18,
          padding: "22px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{editando ? "Editar empresa" : "Cadastrar empresa"}</h3>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, padding: 6, color: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <X size={16} />
          </button>
        </div>
        <p style={{ fontSize: 12.5, opacity: 0.6, margin: "0 0 4px" }}>
          {editando
            ? `Editando "${empresaInicial?.nome}".`
            : estado.nome
              ? `Estado: ${estado.nome}. Preencha como no Google Meu Negócio.`
              : "Busque no Google ou preencha como no Google Meu Negócio."}
        </p>

        {/* Fotos */}
        <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <UploadFoto
            label="Foto de perfil"
            arquivo={fotoPerfil}
            onChange={setFotoPerfil}
            icone={<Camera size={18} />}
          />
          <UploadGaleria arquivos={galeria} onChange={setGaleria} />
        </div>

        <Campo label="Nome do negócio *" valor={nome} onChange={setNome} placeholder="Ex.: Escritório Silva Advocacia" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SelectBlock label="Nicho" valor={nichoId} onChange={setNichoId} placeholder="Selecione o nicho">
            {nichos.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
          </SelectBlock>
          <Campo label="Categoria" valor={categoria} onChange={setCategoria} placeholder="Ex.: Advogado" listId="reino-categorias" />
          <datalist id="reino-categorias">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {/* CEP primeiro — preenchimento automático via ViaCEP */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Campo
            label="CEP *"
            valor={cep}
            onChange={(v) => {
              const digits = v.replace(/\D/g, "").slice(0, 8);
              const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
              setCep(formatted);
              if (digits.length === 8) buscarCep(digits);
            }}
            placeholder="00000-000"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={() => setBuscaGoogleAberta((a) => !a)}
            disabled={salvando}
            style={{
              alignSelf: "flex-end",
              height: 44,
              padding: "0 16px",
              background: "linear-gradient(135deg,#4285f4,#1a73e8)",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontWeight: 700,
              fontSize: 12.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
            title="Buscar a empresa no Google e importar nome, endereço, telefone e fotos"
          >
            <Globe size={14} /> Buscar no Google
          </button>
        </div>

        {buscaGoogleAberta && (
          <div style={{ marginTop: 10, background: "rgba(66,133,244,0.08)", border: "1px solid rgba(66,133,244,0.35)", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Search size={14} style={{ color: "#8ab4f8", flexShrink: 0 }} />
              <input
                autoFocus
                value={buscaGoogleTexto}
                onChange={(e) => setBuscaGoogleTexto(e.target.value)}
                placeholder="Nome da empresa (ex.: Padaria Pão de Açúcar)"
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "#fff", fontSize: 13.5, padding: "6px 0",
                }}
              />
              {buscandoGoogle && <span style={{ fontSize: 11, opacity: 0.6 }}>buscando…</span>}
            </div>

            {resultadosGoogle.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {resultadosGoogle.map((c) => (
                  <button
                    key={c.google_place_id}
                    type="button"
                    disabled={!!importandoPlaceId}
                    onClick={() => escolherResultadoGoogle(c)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "#fff",
                      opacity: importandoPlaceId && importandoPlaceId !== c.google_place_id ? 0.5 : 1,
                    }}
                  >
                    {c.foto_url
                      ? <img src={c.foto_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                      : <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />}
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.nome}
                      </span>
                      <span style={{ display: "block", fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.endereco || "sem endereço"}{c.avaliacao_google ? ` · ★ ${c.avaliacao_google}` : ""}
                      </span>
                    </span>
                    {importandoPlaceId === c.google_place_id && <span style={{ fontSize: 11, opacity: 0.7, flexShrink: 0 }}>importando…</span>}
                  </button>
                ))}
              </div>
            )}
            {!buscandoGoogle && buscaGoogleTexto.trim().length >= 3 && resultadosGoogle.length === 0 && (
              <p style={{ fontSize: 11.5, opacity: 0.5, margin: "8px 0 0" }}>Nada encontrado no Google.</p>
            )}
          </div>
        )}

        <Campo label="Endereço (rua e número)" valor={endereco} onChange={setEndereco} placeholder="Ex.: Av. Paulista, 1000" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Campo label="Bairro" valor={bairro} onChange={setBairro} placeholder="Bela Vista" />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11.5, opacity: 0.6 }}>Cidade / Estado</label>
            <div style={{ display: "flex", gap: 8 }}>
              <SelectBlock style={{ flex: 1 }} label="Cidade" valor={cidadeId} onChange={setCidadeId} placeholder="Selecione a cidade">
                {cidades.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </SelectBlock>
              <SelectBlock style={{ flex: 1 }} label="Estado" valor={estadoId} onChange={(v) => { setEstadoId(v); setCidadeId(""); }}>
                {estadosDb.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </SelectBlock>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Campo label="Telefone" valor={telefone} onChange={setTelefone} placeholder="(11) 99999-9999" />
          <Campo label="Website" valor={website} onChange={setWebsite} placeholder="www.exemplo.com.br" />
        </div>

        <SelectBlock label="Abrangência" valor={abrangencia} onChange={setAbrangencia} placeholder="Selecione a abrangência">
          {ABRANGENCIAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </SelectBlock>

        <Campo label="Descrição" valor={descricao} onChange={setDescricao} placeholder="Descreva o negócio…" textarea />

        {msg && <p style={{ fontSize: 12.5, color: "#ffb3b3", margin: "8px 0 0" }}>{msg}</p>}

        <button
          onClick={salvar}
          disabled={salvando}
          style={{
            marginTop: 18,
            width: "100%",
            background: "linear-gradient(135deg,#f5c76a,#e0a33c)",
            border: "none",
            borderRadius: 12,
            padding: "12px",
            color: "#17131f",
            fontWeight: 800,
            fontSize: 14,
            cursor: salvando ? "default" : "pointer",
            opacity: salvando ? 0.6 : 1,
          }}
        >
          {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Salvar empresa"}
        </button>
      </div>
    </div>
  );
}

function UploadFoto({
  label,
  arquivo,
  onChange,
  icone,
}: {
  label: string;
  arquivo: File | null;
  onChange: (f: File | null) => void;
  icone: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: 110,
        height: 110,
        borderRadius: 14,
        border: "2px dashed rgba(255,255,255,0.2)",
        cursor: "pointer",
        overflow: "hidden",
        background: "rgba(255,255,255,0.03)",
        position: "relative",
      }}
    >
      <input
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {arquivo ? (
        <>
          <img src={URL.createObjectURL(arquivo)} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <button
            onClick={(e) => { e.preventDefault(); onChange(null); }}
            style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 50, padding: 4, cursor: "pointer", color: "#fff" }}
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <>
          <span style={{ color: "#f5c76a", display: "grid", placeItems: "center" }}>{icone}</span>
          <span style={{ fontSize: 11, textAlign: "center", opacity: 0.7, padding: "0 4px" }}>{label}</span>
        </>
      )}
    </label>
  );
}

function UploadGaleria({
  arquivos,
  onChange,
}: {
  arquivos: File[];
  onChange: (f: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button
        onClick={() => ref.current?.click()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: 110,
          height: 110,
          borderRadius: 14,
          border: "2px dashed rgba(255,255,255,0.2)",
          cursor: "pointer",
          background: "rgba(255,255,255,0.03)",
          color: "#fff",
        }}
      >
        <ImageIcon size={18} style={{ color: "#f5c76a" }} />
        <span style={{ fontSize: 11, opacity: 0.7 }}>Galeria</span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => onChange([...arquivos, ...(Array.from(e.target.files ?? []))])}
      />
      {arquivos.map((f, i) => (
        <div key={i} style={{ position: "relative", width: 110, height: 110 }}>
          <img src={URL.createObjectURL(f)} alt="Foto" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 14 }} />
          <button
            onClick={() => onChange(arquivos.filter((_, idx) => idx !== i))}
            style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 50, padding: 4, cursor: "pointer", color: "#fff" }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Campo({
  label,
  valor,
  onChange,
  placeholder,
  textarea,
  listId,
  style,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  listId?: string;
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "10px 12px",
    color: "#fff",
    fontSize: 13.5,
    boxSizing: "border-box",
    fontFamily: "inherit",
    resize: "vertical",
  };
  return (
    <label style={{ display: "block", marginTop: 14, ...style }}>
      <span style={{ fontSize: 12, opacity: 0.65, display: "block", marginBottom: 6 }}>{label}</span>
      {textarea ? (
        <textarea value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ ...base, minHeight: 64 }} />
      ) : (
        <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} list={listId} style={base} />
      )}
    </label>
  );
}

function SelectBlock({
  label,
  valor,
  onChange,
  placeholder,
  children,
  style,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <label style={{ display: "block", marginTop: 14, ...style }}>
      <span style={{ fontSize: 12, opacity: 0.65, display: "block", marginBottom: 6 }}>{label}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "transparent",
          border: "1px solid rgba(245,199,106,0.55)",
          borderRadius: 10,
          padding: "10px 12px",
          color: "#fff",
          fontSize: 13.5,
          outline: "none",
        }}
      >
        <option value="" style={{ color: "#000" }}>{placeholder || "—"}</option>
        {children}
      </select>
    </label>
  );
}

// Aba própria de Hierarquia (2026-09-01, pedido Theus) — antes o botão da
// sidebar não fazia nada; a seção da página só mostrava nome+mensalidade,
// sem jeito de ver ou editar o que cada título significa.
function PainelHierarquia({
  titulos,
  onAtualizado,
}: {
  titulos: Titulo[];
  onAtualizado: () => void;
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [descricaoEdicao, setDescricaoEdicao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const abrirEdicao = (t: Titulo) => {
    setEditandoId(t.id);
    setDescricaoEdicao(t.descricao ?? "");
  };

  const salvarDescricao = async (id: string) => {
    setSalvando(true);
    try {
      await (supabase as any).from("reino_titulos").update({ descricao: descricaoEdicao.trim() || null }).eq("id", id);
      setEditandoId(null);
      onAtualizado();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
          <Crown size={18} style={{ color: "#f5c76a" }} /> Hierarquia do Reino
        </h3>
      </div>
      <p style={{ fontSize: 12.5, opacity: 0.6, margin: "0 0 18px" }}>
        {titulos.length} títulos da nobreza. Clique em "Editar" pra escrever o que cada um significa.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {titulos.map((t, i) => (
            <div key={t.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14,
                  color: "#17131f", background: i < 3 ? "linear-gradient(135deg,#f5c76a,#e0a33c)" : "rgba(255,255,255,0.12)", flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{t.nome}</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    {t.mensalidade ? `R$ ${t.mensalidade.toLocaleString("pt-BR")}/mês` : "—"}
                  </div>
                </div>
                {editandoId !== t.id && (
                  <button
                    onClick={() => abrirEdicao(t)}
                    style={{
                      background: "rgba(245,199,106,0.15)", border: "1px solid rgba(245,199,106,0.4)", borderRadius: 8,
                      padding: "5px 11px", color: "#f5c76a", fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    {t.descricao ? "Editar" : "+ Descrição"}
                  </button>
                )}
              </div>

              {editandoId === t.id ? (
                <div style={{ marginTop: 10 }}>
                  <textarea
                    autoFocus
                    value={descricaoEdicao}
                    onChange={(e) => setDescricaoEdicao(e.target.value)}
                    placeholder="O que esse título dá direito? Benefícios, condições…"
                    style={{
                      width: "100%", minHeight: 70, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => setEditandoId(null)}
                      style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 12, cursor: "pointer" }}
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={salvando}
                      onClick={() => void salvarDescricao(t.id)}
                      style={{
                        background: "linear-gradient(135deg,#f5c76a,#e0a33c)", border: "none", borderRadius: 8, padding: "6px 14px",
                        color: "#17131f", fontSize: 12, fontWeight: 700, cursor: salvando ? "default" : "pointer", opacity: salvando ? 0.6 : 1,
                      }}
                    >
                      {salvando ? "Salvando…" : "Salvar"}
                    </button>
                  </div>
                </div>
              ) : t.descricao ? (
                <p style={{ fontSize: 12.5, opacity: 0.8, margin: "10px 0 0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{t.descricao}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
  );
}

function GerenciarListas({
  nichos,
  estadosDb,
  cidadesDb,
  regioes,
  onAtualizado,
}: {
  nichos: Nicho[];
  estadosDb: EstadoDb[];
  cidadesDb: CidadeDb[];
  regioes: Regiao[];
  onAtualizado: () => void;
}) {
  const [aba, setAba] = useState<"nichos" | "estados" | "cidades">("nichos");

  return (
    <div style={{ width: "100%", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Gerenciar listas personalizadas</h3>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          {(["nichos", "estados", "cidades"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              style={{
                background: aba === a ? "linear-gradient(135deg,#f5c76a,#e0a33c)" : "transparent",
                border: "1px solid rgba(245,199,106,0.5)",
                borderRadius: 10,
                padding: "8px 14px",
                color: aba === a ? "#17131f" : "#f5c76a",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {a}
            </button>
          ))}
        </div>

        {aba === "nichos" && (
          <ListaEditor
            titulo="Nichos"
            colunas={({ nome }: any) => [nome]}
            itens={nichos.map((n) => ({ id: n.id, nome: n.nome }))}
            tabela="reino_nichos"
            onChange={() => onAtualizado()}
          />
        )}

        {aba === "estados" && (
          <ListaEditor
            titulo="Estados"
            colunas={(e: any) => [
              e.nome,
              regioes.find((r) => r.id === e.regiao_id)?.nome ?? "—",
            ]}
            cabecalho={["Estado", "Região"]}
            itens={estadosDb.map((e) => ({ id: e.id, regiao_id: e.regiao_id, nome: e.nome }))}
            tabela="reino_estados"
            onChange={() => onAtualizado()}
          />
        )}

        {aba === "cidades" && (
          <ListaEditor
            titulo="Cidades"
            colunas={(c: any) => [
              c.nome,
              estadosDb.find((e) => e.id === c.estado_id)?.nome ?? "—",
            ]}
            cabecalho={["Cidade", "Estado"]}
            itens={cidadesDb.map((c) => ({ id: c.id, estado_id: c.estado_id, nome: c.nome }))}
            tabela="reino_cidades"
            onChange={() => onAtualizado()}
          />
        )}
      </div>
  );
}

function ListaEditor({
  titulo,
  itens,
  colunas,
  cabecalho,
  tabela,
  onChange,
}: {
  titulo: string;
  itens: { id: string; nome: string }[];
  colunas: (item: any) => string[];
  cabecalho?: string[];
  tabela: string;
  onChange: () => void;
}) {
  const [novoNome, setNovoNome] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNome, setEditandoNome] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const adicionar = async () => {
    if (!novoNome.trim()) return;
    if (tabela === "reino_estados") {
      const { data: reg } = await (supabase as any).from("reino_regioes").select("id").limit(1);
      await (supabase as any).from(tabela).insert({ nome: novoNome.trim(), regiao_id: reg?.data?.[0]?.id ?? null });
    } else if (tabela === "reino_cidades") {
      const { data: est } = await (supabase as any).from("reino_estados").select("id").limit(1);
      await (supabase as any).from(tabela).insert({ nome: novoNome.trim(), estado_id: est?.data?.[0]?.id ?? null });
    } else {
      await (supabase as any).from(tabela).insert({ nome: novoNome.trim() });
    }
    setNovoNome("");
    onChange();
  };

  const renomear = async (id: string) => {
    if (!editandoNome.trim()) return;
    await (supabase as any).from(tabela).update({ nome: editandoNome.trim() }).eq("id", id);
    setEditandoId(null);
    setMsg(null);
    onChange();
  };

  const remover = async (id: string) => {
    await (supabase as any).from(tabela).delete().eq("id", id);
    onChange();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        <input
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          placeholder={`Novo ${titulo.toLowerCase()}…`}
          style={{
            flex: 1,
            background: "transparent",
            border: "1px solid rgba(245,199,106,0.55)",
            borderRadius: 10,
            padding: "10px 12px",
            color: "#fff",
            fontSize: 13.5,
            outline: "none",
          }}
        />
        <button
          onClick={adicionar}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "linear-gradient(135deg,#f5c76a,#e0a33c)",
            border: "none",
            borderRadius: 10,
            padding: "0 16px",
            color: "#17131f",
            fontWeight: 700,
            fontSize: 13.5,
            cursor: "pointer",
          }}
        >
          <Plus size={15} />
          Adicionar
        </button>
      </div>
      {msg && <p style={{ fontSize: 12, color: "#ffb3b3", margin: "6px 0 0" }}>{msg}</p>}
      <p style={{ fontSize: 11, opacity: 0.5, margin: "6px 0 14px" }}>
        {itens.length} {titulo.toLowerCase()} cadastrados. Estado novo fica na 1ª região; cidade nova no 1º estado.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {itens.map((it) => {
          const cols = colunas(it);
          const estaEditando = editandoId === it.id;
          return (
            <div
              key={it.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                border: "1px solid rgba(245,199,106,0.3)",
                borderRadius: 10,
                padding: "8px 12px",
              }}
            >
              {estaEditando ? (
                <input
                  value={editandoNome}
                  onChange={(e) => setEditandoNome(e.target.value)}
                  autoFocus
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#fff",
                    fontSize: 13.5,
                  }}
                />
              ) : (
                <div style={{ flex: 1, display: "flex", gap: 8 }}>
                  <span style={{ color: "#fff", fontWeight: 600 }}>{cols[0]}</span>
                  {cols[1] && cols[1] !== "—" && (
                    <span style={{ color: "#f5c76a", opacity: 0.6, fontSize: 12 }}>{cols[1]}</span>
                  )}
                </div>
              )}
              {estaEditando ? (
                <button
                  onClick={() => renomear(it.id)}
                  style={{ background: "transparent", border: "none", color: "#f5c76a", cursor: "pointer", display: "grid", placeItems: "center" }}
                >
                  <Save size={15} />
                </button>
              ) : (
                <button
                  onClick={() => { setEditandoId(it.id); setEditandoNome(it.nome); }}
                  style={{ background: "transparent", border: "none", color: "#cfc8a8", cursor: "pointer", display: "grid", placeItems: "center" }}
                >
                  <Pencil size={14} />
                </button>
              )}
              <button
                onClick={() => remover(it.id)}
                style={{ background: "transparent", border: "none", color: "#ff8a8a", cursor: "pointer", display: "grid", placeItems: "center" }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}


