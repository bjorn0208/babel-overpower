/* babel-banco.js — liga o estado do babel-os.html ao Supabase sem editar o babel-os.html.
   Carregado pelo app.html. Recebe do gancho { S, CONVS, EVENTS, save, render } e:
   - carrega do banco as coleções mapeadas (abaixo) e troca o conteúdo local;
   - a cada save() do app, compara com o último estado do banco e grava insert/update/delete;
   - intercepta push em mensagens de conversa e na agenda (essas telas não usam S).
   Em banco LOCAL vazio, o conteúdo de exemplo da tela é gravado como primeira carga. */
(function(){
'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid=v=>typeof v==='string'&&UUID.test(v);
const nulo=v=>v===''||v==null?null:v;
const num=v=>v===''||v==null||isNaN(Number(v))?null:Number(v);

/* ----- coleções: lista no estado S ↔ tabela ----- */
const COLECOES=[
  {nome:'notas',tabela:'notas_app',dono:'user_id',soft:true,
   get:S=>S.notes,
   deDb:r=>({id:r.id,title:r.titulo||'',body:r.conteudo||'',pin:!!r.cravada,layer:(r.posicao&&r.posicao.layer)||'me',at:(r.updated_at||r.created_at||'').slice(0,16)}),
   paraDb:o=>({titulo:o.title||'',conteudo:o.body||'',cravada:!!o.pin,posicao:{layer:o.layer||'me'}})},
  {nome:'textos',tabela:'arquivos_textos',dono:'user_id',soft:true,
   get:S=>S.txt&&S.txt.files,
   deDb:r=>({id:r.id,titulo:r.titulo||'',conteudo:r.conteudo||'',created:r.created_at,updated:r.updated_at}),
   paraDb:o=>({titulo:o.titulo||'',conteudo:o.conteudo||''})},
  {nome:'estoque',tabela:'estoque_itens',dono:'tenant_id',soft:true,
   get:S=>S.estq&&S.estq.itens,
   deDb:r=>({id:r.id,nome:r.nome,sku:r.sku,cat:r.categoria,qtd:r.quantidade||0,min:r.quantidade_minima||0}),
   paraDb:o=>({nome:o.nome,sku:nulo(o.sku),categoria:nulo(o.cat),quantidade:Math.max(0,parseInt(o.qtd,10)||0),quantidade_minima:Math.max(0,parseInt(o.min,10)||0)})},
  {nome:'nichos',tabela:'nichos',admin:true,semDelete:true,
   get:S=>S.nich&&S.nich.lista,
   deDb:r=>({id:r.id,slug:r.slug,nome:r.nome_exibicao,descricao:r.descricao,ativo:r.ativo!==false,tenants:0,blocos:0}),
   paraDb:o=>({slug:o.slug,nome_exibicao:o.nome,descricao:nulo(o.descricao),ativo:o.ativo!==false})},
  {nome:'juridico',tabela:'juridico_servicos',admin:true,
   get:S=>S.jur&&S.jur.servicos,
   deDb:r=>({id:r.id,nome:r.nome,descricao:r.descricao||'',preco:r.preco==null?null:Number(r.preco),ativo:r.is_active!==false,ordem:r.ordem||0,deleted_at:r.deleted_at}),
   paraDb:o=>({nome:o.nome,descricao:o.descricao||'',preco:num(o.preco),is_active:o.ativo!==false,ordem:parseInt(o.ordem,10)||0,deleted_at:o.deleted_at||null})}
];
const LOJA={loja_planos:o=>({nome:o.nome,descricao:o.descricao||'',preco_mensal:num(o.preco_mensal)||0,max_conversas:parseInt(o.max_conversas,10)||0,max_ciclos_por_conversa:parseInt(o.max_ciclos_por_conversa,10)||4,dias_expiracao:parseInt(o.dias_expiracao,10)||30,max_storage_mb:parseInt(o.max_storage_mb,10)||0,modelo_llm_id:ehUuid(o.modelo_llm_id)?o.modelo_llm_id:null,ordem:parseInt(o.ordem,10)||0,is_active:o.is_active!==false}),
  loja_pacotes_extra:o=>({nome:o.nome,descricao:o.descricao||'',conversas:parseInt(o.conversas,10)||0,preco:num(o.preco)||0,is_active:o.is_active!==false}),
  loja_implantacao:o=>({nome:o.nome,descricao:o.descricao||'',preco:num(o.preco)||0,is_active:o.is_active!==false}),
  loja_plus:o=>({nome:o.nome,descricao:o.descricao||'',preco:num(o.preco)||0,is_active:o.is_active!==false})};
Object.keys(LOJA).forEach(t=>COLECOES.push({nome:t,tabela:t,admin:true,
  get:S=>S.lojaadm&&S.lojaadm.listas&&S.lojaadm.listas[t],
  deDb:r=>Object.assign({},r,{preco_mensal:r.preco_mensal==null?undefined:Number(r.preco_mensal),preco:r.preco==null?undefined:Number(r.preco)}),
  paraDb:LOJA[t]}));

/* ----- lote C2 (admin): financeiro, parceiro, consulta ----- */
const perfilNome=r=>(r.profiles&&(r.profiles.full_name||r.profiles.email))||'Tenant';
COLECOES.push(
  {nome:'pedidos',tabela:'pedidos_compra',admin:true,naoSemear:true,semInsert:true,semDelete:true,select:'*,profiles(full_name,email)',filtro:q=>q.eq('status','pendente'),
   get:S=>S.finadm&&S.finadm.pedidos,deDb:r=>Object.assign({},r,{_nome:perfilNome(r),profiles:undefined}),paraDb:o=>({status:o.status})},
  {nome:'saques',tabela:'multinivel_saques',admin:true,naoSemear:true,semInsert:true,semDelete:true,select:'*,profiles(full_name,email)',filtro:q=>q.eq('status','pendente'),
   get:S=>S.finadm&&S.finadm.saques,deDb:r=>Object.assign({},r,{_nome:perfilNome(r),profiles:undefined}),paraDb:o=>({status:o.status})},
  {nome:'niveis',tabela:'multinivel_niveis',admin:true,
   get:S=>S.socioadm&&S.socioadm.niveis,deDb:r=>Object.assign({},r,{valor:Number(r.valor)}),
   paraDb:o=>({nivel:parseInt(o.nivel,10)||1,tipo_produto:o.tipo_produto,tipo_valor:o.tipo_valor,valor:Number(o.valor)||0,descricao:o.descricao||'',is_active:o.is_active!==false})},
  {nome:'ctipos',tabela:'consultas_tipos',admin:true,soft:true,
   get:S=>S.consadm&&S.consadm.tipos,deDb:r=>Object.assign({},r,{custo:Number(r.custo),sale_api:r.sale_api==null?null:Number(r.sale_api)}),
   paraDb:o=>({nome:o.nome,descricao:o.descricao||'',codigo_api:o.codigo_api||'',categoria:o.categoria||'',tipo_doc:o.tipo_doc||'cpf',custo:Number(o.custo)||0,sale_api:num(o.sale_api),ativo:o.ativo!==false,ordem:parseInt(o.ordem,10)||0,deleted_at:o.deleted_at||null})},
  {nome:'cpacotes',tabela:'consultas_pacotes',admin:true,soft:true,
   get:S=>S.consadm&&S.consadm.pacotes,deDb:r=>Object.assign({},r,{valor:Number(r.valor),credito:Number(r.credito)}),
   paraDb:o=>({nome:o.nome,valor:Number(o.valor),credito:Number(o.credito),ativo:o.ativo!==false,ordem:parseInt(o.ordem,10)||0,deleted_at:o.deleted_at||null})},
  {nome:'crecargas',tabela:'consultas_recargas',admin:true,naoSemear:true,semInsert:true,semDelete:true,select:'*,profiles(full_name,email)',
   get:S=>S.consadm&&S.consadm.recargas,deDb:r=>Object.assign({},r,{_nome:perfilNome(r),profiles:undefined,valor:Number(r.valor),credito:Number(r.credito)}),
   paraDb:o=>({status:o.status})},
  {nome:'crag',tabela:'blocos_conhecimento',admin:true,naoSemear:true,filtro:q=>q.eq('category','consulta').eq('escopo','nicho').eq('ativo',true).is('deleted_at',null),
   get:S=>S.consadm&&S.consadm.rag,deDb:r=>({id:r.id,nicho_id:r.nicho_id,title:r.title,content:r.content,category:r.category,escopo:r.escopo,tipo:r.tipo,ativo:r.ativo,deleted_at:r.deleted_at}),
   paraDb:o=>({nicho_id:o.nicho_id,title:o.title,content:o.content,category:'consulta',escopo:'nicho',tipo:o.tipo||'resposta',ativo:o.ativo!==false,deleted_at:o.deleted_at||null})}
);
// leituras de apoio (não gravam): nomes de tenants/nichos, rede e KPIs do sócio, config da API
const EXTRAS=[
  {get:S=>S.consadm,async ler(){const [t,n,c]=await Promise.all([sb.from('profiles').select('id,full_name,email').neq('system_role','platform_admin').is('deleted_at',null).order('full_name').limit(500),
      sb.from('nichos').select('id,nome_exibicao').eq('ativo',true).order('nome_exibicao'),sb.from('consultas_config_api').select('*').limit(1)]);
    return {tenants:(t.data||[]).map(p=>({id:p.id,nome:p.full_name||p.email})),nichos:(n.data||[]).map(x=>({id:x.id,nome:x.nome_exibicao})),config:(c.data||[])[0]||null};},
   aplicar(S,d){S.consadm.tenants=d.tenants;S.consadm.nichos=d.nichos;if(!d.nichos.some(x=>x.id===S.consadm.nicho))S.consadm.nicho='';
     if(d.config){S.consadm.config=d.config;cfgSnap=json(cfgLinha(d.config));}else{S.consadm.config={id:'',provedor:'',url_base:'',secret_nome:'',ativo:false};cfgSnap=json(cfgLinha(S.consadm.config));}}},
  {get:S=>S.socioadm,async ler(){const mes=new Date();mes.setDate(1);mes.setHours(0,0,0,0);
    const [me,soc,ind,com]=await Promise.all([sb.from('profiles').select('referral_code').eq('id',uid).single(),
      sb.from('profiles').select('id,full_name,email,referral_code').eq('multinivel_ativo',true).limit(1000),
      sb.from('profiles').select('referred_by').not('referred_by','is',null).limit(5000),
      sb.from('multinivel_comissoes').select('beneficiario_id,valor_comissao,status,created_at').limit(5000)]);
    const C=com.data||[],I=ind.data||[];const pendMes=C.filter(x=>x.status==='pendente'&&new Date(x.created_at)>=mes);
    return {referral_code:(me.data&&me.data.referral_code)||'',kpi:{socios:(soc.data||[]).length,indicados:I.length,pendentes:pendMes.length,valor_pendente:pendMes.reduce((a,x)=>a+Number(x.valor_comissao||0),0)},
      rede:(soc.data||[]).map(p=>({id:p.id,nome:p.full_name||p.email,email:p.email,codigo:p.referral_code,indicados:I.filter(x=>x.referred_by===p.id).length,comissoes:C.filter(x=>x.beneficiario_id===p.id).reduce((a,x)=>a+Number(x.valor_comissao||0),0)}))};},
   aplicar(S,d){Object.assign(S.socioadm,d);}}
];
const extraPend=new Map();
const cfgLinha=c=>({provedor:c.provedor||'',url_base:c.url_base||'',secret_nome:c.secret_nome||'',ativo:!!c.ativo});
let cfgSnap=null;
async function sincronizarConfigApi(){const A=ctx.S.consadm;if(!admin||!A||!A.config||cfgSnap===null)return;
  const linha=cfgLinha(A.config),j=json(linha);if(j===cfgSnap)return;
  const r=A.config.id?await sb.from('consultas_config_api').update(Object.assign({atualizado_em:new Date().toISOString()},linha)).eq('id',A.config.id)
    :await sb.from('consultas_config_api').insert(linha).select('id').single();
  if(r.error){falha('gravar consultas_config_api',r.error);return;}if(!A.config.id&&r.data)A.config.id=r.data.id;cfgSnap=j;}
function aplicarExtras(){let m=false;for(const [x,d] of extraPend){if(x.get(ctx.S)){x.aplicar(ctx.S,d);extraPend.delete(x);m=true;}}return m;}


/* ----- admin: aplicativos, cargos, aparência, reuniões, interessados do jurídico ----- */
const TIPOLOGIAS=['atendimento','mentor','face_cliente','admin','rifas'];
COLECOES.push(
  {nome:'apps',tabela:'loja_aplicativos',admin:true,
   get:S=>S.apps&&S.apps.lista,deDb:r=>Object.assign({},r,{preco_mensal:r.preco_mensal==null?null:Number(r.preco_mensal)}),
   paraDb:o=>({slug:o.slug,nome:o.nome,descricao:o.descricao||'',icone:o.icone||'',categoria:o.categoria||'',preco_mensal:num(o.preco_mensal),is_active:o.is_active!==false,ordem:parseInt(o.ordem,10)||0,publico_alvo:o.publico_alvo||'interno'})},
  {nome:'cargos',tabela:'cargos',admin:true,filtro:q=>q.neq('escopo','tenant'),
   get:S=>S.cargos&&S.cargos.lista,deDb:r=>Object.assign({},r),
   paraDb:o=>{const esc=o.escopo==='nicho'&&ehUuid(o.nicho_id)?'nicho':'global';
     return {escopo:esc,nicho_id:esc==='nicho'?o.nicho_id:null,tenant_id:null,nome:o.nome||'Cargo',tipologia:TIPOLOGIAS.includes(o.tipologia)?o.tipologia:'atendimento',
       objetivo_principal:o.objetivo_principal||o.nome||'—',regras_livres:o.regras_livres||null,canal_atuacao:['interno','externo','ambos'].includes(o.canal_atuacao)?o.canal_atuacao:'ambos',
       modelo_llm_padrao:o.modelo_llm_padrao||null,ativo:o.ativo!==false,ordem:parseInt(o.ordem,10)||0,descricao:o.descricao||null};}},
  {nome:'interesses',tabela:'juridico_interesses',admin:true,naoSemear:true,semInsert:true,semDelete:true,select:'*,profiles(full_name,email,phone)',
   get:S=>S.juradm&&S.juradm.leads,
   deDb:r=>({id:r.id,servicoId:r.servico_id,status:r.status||'novo',criado:r.created_at,obs:r.observacao||'',perfil:{full_name:r.profiles&&r.profiles.full_name,email:r.profiles&&r.profiles.email,phone:r.profiles&&r.profiles.phone}}),
   paraDb:o=>({status:o.status})}
);
// objetos únicos (uma linha por tabela): aparência e configuração de reuniões
const UNICOS=[
  {nome:'branding',tabela:'branding_sistema',admin:true,filtro:q=>q.eq('ativo',true),get:S=>S.apar&&S.apar.brand,
   linha:b=>({nome_produto:b.nome_produto||'Babel',nome_curto:b.nome_curto||'',logo_url:/^data:/.test(b.logo_url||'')?null:(b.logo_url||null),favicon_url:/^data:/.test(b.favicon_url||'')?null:(b.favicon_url||null),
     cor_fundo:b.cor_fundo||null,cor_acento:b.cor_acento_1||null,cor_acento_secundaria:b.cor_acento_2||null,mensagem_login_titulo:b.mensagem_login_titulo||null,mensagem_login_sub:b.mensagem_login_sub||null,
     login_form_titulo:b.login_form_titulo||null,login_form_subtitulo:b.login_form_subtitulo||null,login_copyright:b.login_copyright||null,login_features:b.login_features||[],ativo:true}),
   aplicar:(S,r)=>{const b=S.apar.brand;Object.assign(b,{nome_produto:r.nome_produto,nome_curto:r.nome_curto,logo_url:r.logo_url,favicon_url:r.favicon_url,cor_fundo:r.cor_fundo,cor_acento_1:r.cor_acento,cor_acento_2:r.cor_acento_secundaria,
     mensagem_login_titulo:r.mensagem_login_titulo,mensagem_login_sub:r.mensagem_login_sub,login_form_titulo:r.login_form_titulo,login_form_subtitulo:r.login_form_subtitulo,login_copyright:r.login_copyright,login_features:r.login_features||b.login_features});}},
  {nome:'reunioes',tabela:'config_plataforma',admin:true,get:S=>S.reunadm,
   linha:o=>({reuniao_limite_participantes:Math.min(50,Math.max(2,parseInt(o.teto,10)||10)),reuniao_aviso_ativo:!!o.aviso,reuniao_aviso_limiar:parseInt(o.limiar,10)||0}),
   aplicar:(S,r)=>{Object.assign(S.reunadm,{teto:r.reuniao_limite_participantes??S.reunadm.teto,aviso:!!r.reuniao_aviso_ativo,limiar:r.reuniao_aviso_limiar??S.reunadm.limiar});}}
];
const unico={};
/* ----- Filtro isPublic: oculta campos sensíveis quando acesso sem auth ----- */
const CAMPOS_SENSIVEIS=['cpf','cnpj','phone','email','telefone','celular','documento','pix_chave','chave_pix'];
function filtroPublico(row){if(!row||typeof row!=='object')return row;const out={};for(const k of Object.keys(row)){if(CAMPOS_SENSIVEIS.includes(k.toLowerCase()))continue;out[k]=row[k];}return out;}
function aplicarFiltroPublico(rows,isPublic){if(!isPublic)return rows;if(Array.isArray(rows))return rows.map(filtroPublico);return filtroPublico(rows);}

async function carregarUnico(u){let q=sb.from(u.tabela).select('*');if(u.filtro)q=u.filtro(q);const {data,error}=await q.limit(1);
  if(error){falha('ler '+u.tabela,error);return;}unico[u.nome]={row:data[0]||null,id:data[0]?data[0][u.chaveId||'id']:null,snap:null,pend:!!data[0]};}
async function sincronizarUnico(u){const st=unico[u.nome];if(!st)return false;const o=u.get(ctx.S);if(!o)return false;
  if(st.pend){u.aplicar(ctx.S,st.row);st.pend=false;st.snap=json(u.linha(o));return true;}
  if(st.snap===null){st.snap=json(u.linha(o));if(st.id||!LOCAL)return false;} // banco local sem linha: grava o padrão da tela
  if(u.admin&&!admin)return false;
  const linha=u.linha(o),j=json(linha);if(j===st.snap&&st.id)return false;
  const k=u.chaveId||'id';const r=st.id?await sb.from(u.tabela).update(linha).eq(k,st.id):await sb.from(u.tabela).insert(linha).select(k).single();
  if(r.error){falha('gravar '+u.tabela,r.error);return false;}if(!st.id)st.id=r.data[k];st.snap=j;return false;}
// vínculos aplicativo ↔ nicho (S.apps.vinculos = {idLocalDoApp: [ids de nicho]})
let vincSnap=null;
async function sincronizarVinculos(){const A=ctx.S.apps;if(!admin||!A||!A.vinculos||!carregado.apps)return;
  if(vincSnap===null){const {data,error}=await sb.from('aplicativos_nicho').select('aplicativo_id,nicho_id');if(error){falha('ler aplicativos_nicho',error);return;}
    vincSnap=new Set(data.map(v=>v.aplicativo_id+'|'+v.nicho_id));
    // traz do banco para a tela (chave = id local do app)
    A.lista.forEach(a=>{const db=a._dbid||a.id;const ns=data.filter(v=>v.aplicativo_id===db).map(v=>v.nicho_id);if(ns.length)A.vinculos[a.id]=ns;});return;}
  const quero=new Set();A.lista.forEach(a=>{const db=a._dbid||(ehUuid(a.id)?a.id:null);if(!db)return;(A.vinculos[a.id]||[]).filter(ehUuid).forEach(n=>quero.add(db+'|'+n));});
  for(const k of quero)if(!vincSnap.has(k)){const [aplicativo_id,nicho_id]=k.split('|');const {error}=await sb.from('aplicativos_nicho').insert({aplicativo_id,nicho_id});if(error)falha('vincular nicho',error);else vincSnap.add(k);}
  for(const k of [...vincSnap])if(!quero.has(k)){const [aplicativo_id,nicho_id]=k.split('|');if(!A.lista.some(a=>(a._dbid||a.id)===aplicativo_id))continue;
    const {error}=await sb.from('aplicativos_nicho').delete().eq('aplicativo_id',aplicativo_id).eq('nicho_id',nicho_id);if(error)falha('desvincular nicho',error);else vincSnap.delete(k);}}
// usuário: "Tenho interesse" no jurídico (S.jur.interesses = ids de serviço)
let intSnap=null;
async function sincronizarInteresses(){const J=ctx.S.jur;if(!J||!Array.isArray(J.interesses))return;
  const ids=J.interesses.map(i=>{const s=(J.servicos||[]).find(x=>x.id===i);return s?(s._dbid||(ehUuid(s.id)?s.id:null)):(ehUuid(i)?i:null);}).filter(Boolean);
  if(intSnap===null){const {data,error}=await sb.from('juridico_interesses').select('servico_id').eq('user_id',uid);if(error){falha('ler juridico_interesses',error);return;}intSnap=new Set(data.map(x=>x.servico_id));}
  for(const sid of ids)if(!intSnap.has(sid)){const {error}=await sb.from('juridico_interesses').insert({user_id:uid,servico_id:sid,status:'novo'});if(error)falha('registrar interesse',error);else intSnap.add(sid);}}


/* ----- fontes só de leitura: substituem constantes de exemplo do babel-os.html (lidas via __babelEval) ----- */
const DIA=864e5;
const iniciais2=n=>(n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join('');
async function contar(q){const {count,error}=await q;if(error)throw error;return count||0;}
const FONTES=[
  {alvos:['CTR_PERFIS','CTR_ASSIN','CTR_CUSTOS'],async ler(){
    const [p,a,c]=await Promise.all([sb.from('profiles').select('id,full_name,apelido,email,is_active,system_role').is('parent_user_id',null).is('deleted_at',null).limit(1000),
      sb.from('assinaturas_usuario').select('user_id,plano_nome,status,data_expiracao,conversas_usadas,max_conversas').limit(1000),
      sb.from('custos_llm_dia').select('*').gte('dia',new Date(Date.now()-30*DIA).toISOString().slice(0,10)).limit(5000)]);
    for(const r of [p,a,c])if(r.error)throw r.error;
    return [p.data.map(x=>Object.assign({},x,{system_role:x.system_role==='platform_admin'?'platform_admin':'tenant'})),
      a.data.map(x=>Object.assign({},x,{dias:x.data_expiracao?Math.round((new Date(x.data_expiracao)-Date.now())/DIA):null})),
      c.data.map(x=>Object.assign({},x,{custo_usd:Number(x.custo_usd||0),custo_byok_usd:Number(x.custo_byok_usd||0)}))];}},
  {alvos:['DB_KPI','DB_TEN'],async ler(){
    const desde=d=>new Date(Date.now()-d*DIA).toISOString();
    const ten=sb.from('profiles').select('id',{count:'exact',head:true}).neq('system_role','platform_admin').is('parent_user_id',null).is('deleted_at',null);
    const ag=sb.from('agentes').select('id',{count:'exact',head:true}).eq('is_active',true);
    const msgs=d=>{let q=sb.from('mensagens').select('id',{count:'exact',head:true});if(d)q=q.gte('created_at',desde(d));return contar(q);};
    const custo=async d=>{let q=sb.from('custos_llm_dia').select('custo_usd');if(d)q=q.gte('dia',desde(d).slice(0,10));const {data,error}=await q.limit(10000);if(error)throw error;return Math.round(data.reduce((x,r)=>x+Number(r.custo_usd||0),0));};
    const [nt,na,m7,m30,m90,mt,c7,c30,c90,ct,perf,conv,ass]=await Promise.all([contar(ten),contar(ag),msgs(7),msgs(30),msgs(90),msgs(0),custo(7),custo(30),custo(90),custo(0),
      sb.from('profiles').select('id,full_name,apelido,email,is_active,deleted_at').neq('system_role','platform_admin').is('parent_user_id',null).limit(1000),
      sb.from('conversas').select('tenant_id,mensagens(count)').limit(5000),
      sb.from('assinaturas_usuario').select('user_id,plano_nome,status,conversas_usadas,max_conversas').limit(1000)]);
    const porTen={};(conv.data||[]).forEach(c=>{porTen[c.tenant_id]=(porTen[c.tenant_id]||0)+((c.mensagens&&c.mensagens[0]&&c.mensagens[0].count)||0);});
    const kpi={'7d':{tenants:nt,agentes:na,msgs:m7,custo:c7,pts:7},'30d':{tenants:nt,agentes:na,msgs:m30,custo:c30,pts:30},'90d':{tenants:nt,agentes:na,msgs:m90,custo:c90,pts:12},'total':{tenants:nt,agentes:na,msgs:mt,custo:ct,pts:24}};
    const tenL=(perf.data||[]).map(p=>{const a=(ass.data||[]).find(x=>x.user_id===p.id);const nome=p.apelido||p.full_name||p.email;
      return {id:p.id,av:iniciais2(nome),nome,plano:a?(a.plano_nome||'plano')+' · '+(a.conversas_usadas||0)+'/'+(a.max_conversas||0):'sem plano',tokens:porTen[p.id]||0,status:p.deleted_at?'excluido':(p.is_active===false?'inativo':'ativo')};});
    return [kpi,tenL];}}
];

/* ----- Curadoria (admin) ----- */
const CU_CAMPO={blocos_conhecimento:'content',blocos_comportamento:'instrucao',blocos_meta:'corpo',blocos_gatilho:'nome_trigger',blocos_procedurais:'nome_procedimento',
  blocos_humanizacao:'regra',blocos_variacao:'instrucao',diretriz_bolha_blocos:'contexto',regras_operacionais_blocos:'regra',anti_padroes:'situacao',emocao_blocos:'corpo',
  prova_social_blocos:'depoimento',manipulacao_blocos:'resposta_padrao',acao_pausa_blocos:'mensagem_retorno'};
// colunas obrigatórias de cada gaveta (só no insert; o editor da curadoria só mexe no texto e no escopo)
const CU_OBRIG={blocos_conhecimento:t=>({title:t.slice(0,80),tipo:'resposta',category:'curadoria'}),blocos_comportamento:t=>({situacao_descricao:t,origem:'plataforma'}),
  blocos_meta:()=>({tag:'planejar_turno'}),blocos_gatilho:t=>({exemplo_frase:t,acao_disparada:'notificar_humano',condicao_tipo:'frase'}),blocos_procedurais:()=>({}),
  blocos_humanizacao:()=>({categoria:'geral',contexto_uso:'geral'}),blocos_variacao:t=>({nome_variation:t.slice(0,60)}),diretriz_bolha_blocos:()=>({}),
  regras_operacionais_blocos:()=>({categoria:'pausa',contexto:'curadoria'}),anti_padroes:()=>({acao_correta:'(definir na curadoria)',origem:'admin_curadoria'}),
  emocao_blocos:()=>({emocao:'neutra'}),prova_social_blocos:()=>({autor:'(sem autor)'}),manipulacao_blocos:()=>({tipo:'prompt_injection',severidade:'aviso'}),acao_pausa_blocos:t=>({gatilho_descricao:t})};
let cuTenNicho={}; // tenant → nicho (para gravar bloco no escopo nicho/tenant do tenant impersonado)
function cuEscopo(tab,o){const ten=ctx&&ctx.S&&ctx.S.cur&&ctx.S.cur.tenant;const tid=ehUuid(ten)?ten:null,nid=o.nicho_id||(tid&&cuTenNicho[tid])||null;
  if(o.escopo==='nicho'&&ehUuid(nid))return {escopo:'nicho',nicho_id:nid,tenant_id:null};
  if(o.escopo==='tenant'&&tab!=='blocos_conhecimento'&&ehUuid(o.tenant_id||tid))return {escopo:'tenant',nicho_id:null,tenant_id:o.tenant_id||tid};
  return {escopo:'global',nicho_id:null,tenant_id:null};}
Object.keys(CU_CAMPO).forEach(tab=>COLECOES.push({nome:'cu_'+tab,tabela:tab,admin:true,naoSemear:true,filtro:q=>q.limit(300),
  get:S=>S.cur&&S.cur.blocos&&S.cur.blocos[tab],
  deDb:r=>({id:r.id,conteudo:r[CU_CAMPO[tab]]||'(sem texto)',escopo:r.escopo||'global',nicho_id:r.nicho_id||null,tenant_id:r.tenant_id||null}),
  paraDb:o=>Object.assign({[CU_CAMPO[tab]]:o.conteudo||''},cuEscopo(tab,o)),
  extraInsert:o=>Object.assign({ativo:true,embedding_status:'pendente'},CU_OBRIG[tab](String(o.conteudo||'')))}));
const CU_ST_CAND={pendente:'pendente',aprovado:'aprovado',recusado:'rejeitado'},CU_ST_ACAO={pendente:'pendente',cancelada:'cancelado',executada:'executado'};
COLECOES.push(
  {nome:'cu_avisos',tabela:'avisos_curadoria',admin:true,naoSemear:true,semInsert:true,semDelete:true,filtro:q=>q.is('deleted_at',null).is('arquivado_em',null).order('criado_em',{ascending:false}).limit(50),
   get:S=>S.cur&&S.cur.avisos,deDb:r=>({id:r.id,sev:r.severidade||'info',titulo:r.titulo,texto:r.mensagem,acao:r.acao_sugerida_tipo||'',lido_em:r.lido_em,arquivado_em:r.arquivado_em,em:r.criado_em}),
   paraDb:o=>({lido_em:o.lido_em||null,arquivado_em:o.arquivado_em||null})},
  {nome:'cu_candidatos',tabela:'candidatos_bloco',admin:true,naoSemear:true,semInsert:true,semDelete:true,filtro:q=>q.in('status',['pendente','pending']).order('criado_em',{ascending:false}).limit(100),
   get:S=>S.cur&&S.cur.cn&&S.cur.cn.candidatos,deDb:r=>({id:r.id,texto:r.excerto,origem:(r.categoria_sugerida||r.tipo_sugerido||'candidato')+' · '+(r.num_leads_independentes||1)+' lead(s)',status:'pendente'}),
   paraDb:o=>({status:CU_ST_CAND[o.status]||'pendente'}),
   atualizar:(o,id,l)=>sb.from('candidatos_bloco').update(Object.assign({},l,l.status!=='pendente'?{decided_at:new Date().toISOString(),decided_by:uid}:{})).eq('id',id)},
  {nome:'cu_recursos',tabela:'recursos_ativacao_curadoria',admin:true,naoSemear:true,semInsert:true,semDelete:true,filtro:q=>q.order('ordem'),
   get:S=>S.cur&&S.cur.recursos,
   deDb:r=>({id:r.id,chave:r.chave_recurso,nome:r.nome_comercial,desc:r.descricao_longa||r.descricao_curta,custo:Number(r.custo_estimado_mes_brl||0),ativo:r.status==='ativo',bloqueado:r.status==='bloqueado'?(r.motivo_bloqueio||'bloqueado'):'',deps:(r.dependencias_chaves||[]).join(', ')||'—',cron:r.cron_nome||''}),
   paraDb:o=>({ativo:!!o.ativo}),
   atualizar:async o=>{const r=await sb.rpc(o.ativo?'ativar_recurso_curadoria':'pausar_recurso_curadoria',{p_chave:o.chave});if(!r.error&&r.data&&r.data.ok===false)return {error:{message:r.data.erro||r.data.motivo||'recusado'}};return r;}},
  {nome:'cu_chamadas',tabela:'config_chamadas_llm',chave:'chave',admin:true,naoSemear:true,semInsert:true,semDelete:true,filtro:q=>q.is('deleted_at',null).order('chave'),
   get:S=>S.cur&&S.cur.chamadas,
   deDb:r=>({id:r.chave,nome:r.nome,descricao:r.descricao||'',modelo:r.modelo,temperatura:Number(r.temperatura??0.7),max_tokens:r.max_tokens||800,prompt:r.prompt_template||'',gavetas:Array.isArray(r.gavetas_ativas)?r.gavetas_ativas:[],versao:r.versao||1,hist:[]}),
   paraDb:o=>({nome:o.nome,descricao:o.descricao||'',modelo:o.modelo,temperatura:Number(o.temperatura),max_tokens:parseInt(o.max_tokens,10)||800,prompt_template:o.prompt||'',gavetas_ativas:o.gavetas||[]})},
  {nome:'cu_crons',admin:true,naoSemear:true,semInsert:true,semDelete:true,
   ler:async()=>{const {data,error}=await sb.rpc('listar_jobs_com_historico');if(error)throw error;return data||[];},
   get:S=>S.cur&&S.cur.crons,deDb:r=>({id:r.nome,chave:r.nome,edge:r.descricao||'',cat:r.categoria||'manutencao',cron:r.cron_expr||'',ativo:!!r.ativo}),paraDb:o=>({ativo:!!o.ativo}),
   atualizar:async o=>{const r=await sb.rpc('togglar_job',{p_nome:o.chave,p_ativo:!!o.ativo});if(!r.error&&r.data&&r.data.ok===false)return {error:{message:r.data.erro||'recusado'}};return r;}},
  {nome:'cu_acoes',tabela:'acoes_agendadas',admin:true,naoSemear:true,semInsert:true,semDelete:true,
   ler:async()=>{const {data,error}=await sb.from('acoes_agendadas').select('*').gte('scheduled_at',new Date(Date.now()-2*DIA).toISOString()).order('scheduled_at').limit(200);if(error)throw error;
     const ids=[...new Set(data.map(r=>r.lead_id).filter(Boolean))];const nomes={};if(ids.length){const l=await sb.from('leads').select('id,name').in('id',ids);(l.data||[]).forEach(x=>{nomes[x.id]=x.name;});}
     return data.map(r=>Object.assign({},r,{leads:{name:nomes[r.lead_id]}}));},
   get:S=>S.cur&&S.cur.acoes,
   deDb:r=>({id:r.id,tipo:r.action_type,lead:(r.leads&&r.leads.name)||'lead',meta:r.node_name||r.template||'',mensagem:(r.carga&&(r.carga.mensagem||r.carga.texto))||r.template||'',quando:new Date(r.scheduled_at).getTime(),status:r.status==='cancelado'?'cancelada':r.status==='executado'?'executada':'pendente',carga:r.carga||{}}),
   paraDb:o=>({status:CU_ST_ACAO[o.status]||'pendente'})},
  {nome:'cu_tools',tabela:'ferramentas_dinamicas',admin:true,naoSemear:true,semInsert:true,semDelete:true,filtro:q=>q.order('nome_tool'),
   get:S=>S.cur&&S.cur.tools,deDb:r=>({id:r.id,nome:r.nome_tool,descricao:r.descricao,schema:JSON.stringify(r.schema_zod||{}),ativo:r.ativo!==false,cargos:[]}),paraDb:o=>({ativo:!!o.ativo})},
  {nome:'cu_gatilhos',tabela:'blocos_gatilho',admin:true,naoSemear:true,semInsert:true,semDelete:true,filtro:q=>q.is('deleted_at',null).order('created_at',{ascending:false}).limit(200),
   get:S=>S.cur&&S.cur.gatilhos,deDb:r=>({id:r.id,nome:r.nome_trigger,escopo:r.escopo||'global',ativo:r.ativo!==false}),paraDb:o=>({ativo:!!o.ativo})}
);
// emoções: mapa_emocao_afeto (chave = emocao)
let emoSnap=null,emoPend=null;
async function carregarEmocoes(){const {data,error}=await sb.from('mapa_emocao_afeto').select('emocao,valencia');if(error){falha('ler mapa_emocao_afeto',error);return;}emoPend=data;}
async function sincronizarEmocoes(){const C=ctx.S.cur;if(!admin||!C||!C.emo||emoPend===null&&emoSnap===null)return false;
  if(emoPend){const p=emoPend;emoPend=null;if(p.length){Object.keys(C.emo).forEach(k=>delete C.emo[k]);p.forEach(r=>{C.emo[r.emocao]=Number(r.valencia);});
      try{const L=window.__babelEval('CU_EMO');L.splice(0,L.length,...p.map(r=>r.emocao));}catch(e){}emoSnap=json(C.emo);return true;}
    emoSnap=LOCAL?'{}':json(C.emo);} // banco local vazio: grava o mapa padrão da tela
  const j=json(C.emo);if(j===emoSnap)return false;const antes=JSON.parse(emoSnap);
  const linhas=Object.keys(C.emo).filter(k=>antes[k]!==C.emo[k]).map(k=>({emocao:k,valencia:C.emo[k],ativacao:0.5}));
  if(linhas.length){const {error}=await sb.from('mapa_emocao_afeto').upsert(linhas,{onConflict:'emocao'});if(error){falha('gravar mapa_emocao_afeto',error);return false;}}
  emoSnap=j;return false;}
// tenants impersonáveis, cargos e modelos da curadoria vêm do banco
FONTES.push({alvos:['CU_TEN','CU_CARGOS','CU_MOD'],async ler(){
  const [t,c,m,n]=await Promise.all([sb.from('profiles').select('id,full_name,email,nicho_id').neq('system_role','platform_admin').is('parent_user_id',null).is('deleted_at',null).limit(500),
    sb.from('cargos').select('id,nome,tipologia,objetivo_principal,modelo_llm_padrao,canal_atuacao').neq('escopo','tenant').limit(200),
    sb.from('modelos_llm').select('slug,nome').eq('is_active',true).limit(200),sb.from('nichos').select('id,nome_exibicao')]);
  const nn={};(n.data||[]).forEach(x=>{nn[x.id]=x.nome_exibicao;});cuTenNicho={};(t.data||[]).forEach(x=>{cuTenNicho[x.id]=x.nicho_id;});
  const mods=(m.data||[]).map(x=>({id:x.slug,nome:x.nome}));
  return [(t.data||[]).map(x=>({id:x.id,nome:x.full_name||x.email,nicho:nn[x.nicho_id]||'sem nicho'})),
    (c.data||[]).map(x=>({id:x.id,nome:x.nome,tipologia:x.tipologia,objetivo:x.objetivo_principal,modelo:x.modelo_llm_padrao||'',canal:x.canal_atuacao||''})),
    mods.length?mods:null];}});


/* ----- Usuário: contratos (contratos) e financeiro (contas_a_receber) ----- */
const CT_ST={pendente:['enviado · não abriu','lua'],aguardando_validacao:['pede sua validação','ciano'],assinado:['assinado','mute'],rejeitado:['rejeitado','mute']};
const dm=iso=>{const d=new Date(iso);return String(d.getDate()).padStart(2,'0')+'/'+['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d.getMonth()];};
let finDados=null,cobSnap=null;const cobIds=new Set();
async function carregarFinanceiro(){
  const desde=new Date(Date.now()-30*DIA).toISOString();
  const [k,r,l]=await Promise.all([sb.from('contratos').select('id,conversa_id,lead_id,nome_template,titulo,status,assinado_em,created_at,dados_pagamento,url_selfie,url_documento,url_assinatura').eq('tenant_id',uid).order('created_at',{ascending:false}).limit(300),
    sb.from('contas_a_receber').select('*').eq('tenant_id',uid).is('deleted_at',null).or('status.eq.pendente,recebida_em.gte.'+desde).order('vencimento').limit(1000),
    sb.from('leads').select('id,name,dados_ficha').eq('tenant_id',uid).limit(2000)]);
  for(const x of [k,r,l])if(x.error){falha('ler financeiro',x.error);return;}
  finDados={contratos:k.data,receber:r.data,leads:l.data};}
function aplicarFinanceiro(){if(!finDados)return;const F=finDados;finDados=null;const E=window.__babelEval;
  const nomeLead=id=>{const l=F.leads.find(x=>x.id===id);if(!l)return 'Cliente';const c=l.dados_ficha&&l.dados_ficha.codigo;return l.name+(c?' · '+c:'');};
  const convDe=(cv,lid)=>{const c=ctx.CONVS.find(x=>x.uuid===cv)||null;return c?c.id:null;};
  try{const K=E('CONTRACTS');K.splice(0,K.length,...F.contratos.map(r=>{const st=CT_ST[r.status]||CT_ST.pendente,dp=r.dados_pagamento||{};
    return {id:r.id,who:nomeLead(r.lead_id),val:Number(dp.valor||dp.total||0),parc:Number(dp.parcelas||1),when:r.assinado_em?'assinado '+dm(r.assinado_em):'enviado '+dm(r.created_at),st:st[0],tok:st[1],
      provas:[r.url_selfie&&'selfie',r.url_documento&&'documento',r.url_assinatura&&'assinatura'].filter(Boolean),conv:convDe(r.conversa_id),modelo:r.nome_template||r.titulo||'Contrato'};}));}catch(e){falha('contratos',e);}
  try{const hoje=new Date();hoje.setHours(0,0,0,0);const C=E('COBR'),pend=F.receber.filter(r=>r.status==='pendente');
    C.splice(0,C.length,...pend.map(r=>{const v=new Date(r.vencimento+'T00:00:00'),dd=Math.round((v-hoje)/DIA);cobIds.add(r.id);
      return {id:r.id,who:nomeLead(r.lead_id),what:r.descricao,val:Number(r.valor),due:dd===0?'hoje':dd<0?'venceu '+dm(v):dm(v),tok:dd<=0?(dd<0?'lua':'ciano'):'mute',st:dd===0?'vence hoje':dd<0?'atrasou '+(-dd)+' dia'+(dd===-1?'':'s'):'vence '+dm(v),conv:null};}));
    const rec=F.receber.filter(r=>r.status==='recebida'&&r.recebida_em);
    const B=E('BAIXAS');B.splice(0,B.length,...rec.sort((a,b)=>b.recebida_em.localeCompare(a.recebida_em)).slice(0,8).map(r=>['ouro',nomeLead(r.lead_id),dm(r.recebida_em)+' · R$ '+Number(r.valor).toLocaleString('pt-BR',{minimumFractionDigits:2}),'dinheiro entrou']));
    const BX=E('BX0');BX.splice(0,BX.length,...rec.sort((a,b)=>b.recebida_em.localeCompare(a.recebida_em)).map(r=>{const dia=Math.floor((Date.now()-new Date(r.recebida_em))/DIA);
      return {id:r.id,who:nomeLead(r.lead_id)+' · '+String(r.descricao||'').replace(/ \(demo\)$/,''),when:dia===0?'hoje '+new Date(r.recebida_em).toTimeString().slice(0,5):dia===1?'ontem':dm(r.recebida_em),val:Number(r.valor),day:dia};}));
    const FI=E('FITA');const dias=Array(30).fill(0);rec.forEach(r=>{const k=29-Math.floor((Date.now()-new Date(r.recebida_em))/DIA);if(k>=0&&k<30)dias[k]+=Number(r.valor);});FI.splice(0,FI.length,...dias.map(Math.round));}catch(e){falha('financeiro',e);}}
// baixa manual (S.cobSt[id]='pago') → contas_a_receber.status='recebida'
async function sincronizarCobrancas(){const st=ctx.S.cobSt||{};const pagos=Object.keys(st).filter(id=>st[id]==='pago'&&cobIds.has(id));
  if(cobSnap===null){cobSnap=new Set(pagos);return;}
  for(const id of pagos)if(!cobSnap.has(id)){const {error}=await sb.from('contas_a_receber').update({status:'recebida',recebida_em:new Date().toISOString()}).eq('id',id);if(error)falha('dar baixa',error);else cobSnap.add(id);}
  for(const id of [...cobSnap])if(!pagos.includes(id)){const {error}=await sb.from('contas_a_receber').update({status:'pendente',recebida_em:null}).eq('id',id);if(error)falha('desfazer baixa',error);else cobSnap.delete(id);}}
// contrato novo (CONTRACTS.unshift no "Enviar") → contratos
function ligarContratos(){let K;try{K=window.__babelEval('CONTRACTS');}catch(e){return;}const orig=K.unshift;
  K.unshift=function(...ks){const r=orig.apply(this,ks);ks.forEach(k=>{if(ehUuid(k.id))return;fila=fila.then(async()=>{const cv=ctx.CONVS.find(c=>c.id===k.conv);let lead=null;
      if(cv&&cv.uuid){const q=await sb.from('conversas').select('lead_id').eq('id',cv.uuid).single();lead=q.data&&q.data.lead_id;}
      const {data,error}=await sb.from('contratos').insert({tenant_id:uid,conversa_id:cv&&cv.uuid||null,lead_id:lead,nome_template:k.modelo||'Contrato',titulo:(k.modelo||'Contrato')+' · '+String(k.who||'').split(' · ')[0],
        status:'pendente',origem:'manual_template',dados_pagamento:{valor:k.val,parcelas:k.parc}}).select('id').single();
      if(error){falha('gravar contrato',error);return;}k._dbid=data.id;status('salvo no banco ✓');});});return r;};}


/* ----- Usuário: Parceiro (perfil multinível, comissões, saques, rede) ----- */
COLECOES.push({nome:'soc_saques',tabela:'multinivel_saques',dono:'user_id',naoSemear:true,semDelete:true,filtro:q=>q.order('created_at',{ascending:false}).limit(200),
  get:S=>S.socio&&S.socio.saques,deDb:r=>({id:r.id,valor:Number(r.valor),pix:r.chave_pix||'',st:r.status,em:(r.created_at||'').slice(0,10)}),
  paraDb:o=>({valor:Number(o.valor)}),atualizar:async()=>({error:null}), // saque só é criado (RPC); status muda no admin
  inserir:async o=>{const {data,error}=await sb.rpc('solicitar_saque',{p_valor:Number(o.valor),p_chave_pix:o.pix||null});return {data:data?{id:data}:null,error};}});
let socPend=null,socSnap=null;
async function carregarSocio(){try{
  const [p,c,r,cfg]=await Promise.all([sb.from('profiles').select('full_name,email,referral_code,saldo_multinivel,multinivel_ativo,chave_pix,tipo_pessoa,document,cnpj,razao_social').eq('id',uid).single(),
    sb.from('multinivel_comissoes').select('id,origem_id,nivel,valor_base,percentual,valor_comissao,created_at').eq('beneficiario_id',uid).order('created_at',{ascending:false}).limit(300),
    sb.rpc('get_minha_rede',{p_owner_id:uid}),sb.from('config_plataforma').select('saque_regras_ativo,saque_dia_semana,saque_hora_inicio,saque_hora_fim,saque_valor_minimo').limit(1)]);
  if(p.error)throw p.error;
  const origens=[...new Set((c.data||[]).map(x=>x.origem_id).filter(Boolean))];const nomes={};
  if(origens.length){const o=await sb.from('profiles').select('id,full_name,email').in('id',origens);(o.data||[]).forEach(x=>{nomes[x.id]=x.full_name||x.email;});}
  socPend={perfil:p.data,coms:(c.data||[]).map(x=>({id:x.id,origem:nomes[x.origem_id]||'indicado',nivel:x.nivel,base:Number(x.valor_base||0),perc:Number(x.percentual||0),valor:Number(x.valor_comissao||0),em:(x.created_at||'').slice(0,10)})),
    inds:(r.data||[]).map(x=>({id:x.id,nome:x.full_name||x.email,email:x.email,sub:Number(x.sub_indicados||0),socio:!!x.multinivel_ativo,em:(x.created_at||'').slice(0,10)})),cfg:(cfg.data||[])[0]||null};
}catch(e){falha('ler sócio',e);}}
const socLinha=P=>({full_name:P.nome||'',chave_pix:P.pix||null,tipo_pessoa:P.tipo||'pf',document:P.doc||null,cnpj:P.cnpj||null,razao_social:P.razao||null});
async function sincronizarSocio(){const Sc=ctx.S.socio;if(!Sc||(!socPend&&socSnap===null))return false;
  if(socPend){const d=socPend;socPend=null;const p=d.perfil;
    Object.assign(Sc.perfil,{nome:p.full_name||p.email,email:p.email,code:p.referral_code||'',saldo:Number(p.saldo_multinivel||0),ativo:!!p.multinivel_ativo,pix:p.chave_pix||'',tipo:p.tipo_pessoa||'pf',doc:p.document||'',cnpj:p.cnpj||'',razao:p.razao_social||''});
    Sc.coms.splice(0,Sc.coms.length,...d.coms);Sc.inds.splice(0,Sc.inds.length,...d.inds);
    if(d.cfg)Sc.regras={ativo:!!d.cfg.saque_regras_ativo,dia:d.cfg.saque_dia_semana??0,ini:d.cfg.saque_hora_inicio||'00:00',fim:d.cfg.saque_hora_fim||'23:59',min:Number(d.cfg.saque_valor_minimo||0)};
    socSnap=json(socLinha(Sc.perfil));return true;}
  const l=socLinha(Sc.perfil),j=json(l);if(j===socSnap)return false;
  const {error}=await sb.from('profiles').update(l).eq('id',uid);if(error){falha('salvar cadastro de sócio',error);return false;}socSnap=j;return false;}


/* ----- Usuário: Consulta (tipos, saldo, histórico, extrato, pacotes; recarga com comprovante) ----- */
let conPend=null;
async function carregarConsulta(){try{
  const [t,sd,q,m,pk]=await Promise.all([sb.from('consultas_tipos').select('*').eq('ativo',true).is('deleted_at',null).order('ordem'),
    sb.from('consultas_saldo').select('saldo').eq('tenant_id',uid).maybeSingle(),
    sb.from('consultas').select('*').eq('tenant_id',uid).is('deleted_at',null).order('created_at',{ascending:false}).limit(300),
    sb.from('consultas_carteira_mov').select('*').eq('tenant_id',uid).order('created_at',{ascending:false}).limit(300),
    sb.from('consultas_pacotes').select('*').eq('ativo',true).is('deleted_at',null).order('ordem')]);
  for(const x of [t,q,m,pk])if(x.error)throw x.error;
  conPend={tipos:t.data.map(r=>({id:r.id,nome:r.nome,descricao:r.descricao||'',codigo:r.codigo_api,tipo_doc:r.tipo_doc,custo:Number(r.custo),ativo:true,ordem:r.ordem||0,settings:r.settings_api||null})),
    saldo:Number((sd.data&&sd.data.saldo)||0),
    consultas:q.data.map(r=>({id:r.id,tipo_id:r.tipo_id,chave:r.chave_publica,origem:r.origem||'manual',tipo_doc:r.tipo_doc,documento:r.documento,status:r.status,custo:r.custo==null?null:Number(r.custo),preco:r.preco==null?null:Number(r.preco),
      dados:r.dados_cliente,resultado:r.resultado,pdf:r.pdf_url,titulo:r.titulo,em:r.created_at,lead:null,erro:r.erro_motivo})),
    movs:m.data.map(r=>({id:r.id,tipo:r.tipo,valor:Number(r.valor),saldo:Number(r.saldo_apos),em:r.created_at})),
    pacotes:pk.data.map(r=>({id:r.id,nome:r.nome,valor:Number(r.valor),credito:Number(r.credito),ativo:true,ordem:r.ordem||0}))};
}catch(e){falha('ler consulta',e);}}
function aplicarConsulta(){const C=ctx.S.con;if(!C||!conPend)return false;const d=conPend;conPend=null;
  ['tipos','consultas','movs','pacotes'].forEach(k=>{if(Array.isArray(C[k]))C[k].splice(0,C[k].length,...d[k]);else C[k]=d[k];});C.saldo=d.saldo;return true;}
async function subirArquivo(bucket,pasta,url){ // data: URL (FileReader do app) → Storage; devolve URL pública (ou o caminho, se o bucket for privado)
  if(!/^data:/.test(url))return url;const r=await fetch(url);const blob=await r.blob();const ext=(blob.type.split('/')[1]||'bin').replace('jpeg','jpg').replace(/[^a-z0-9]/g,'');
  const path=uid+'/'+pasta+'/'+Date.now()+'.'+ext;const {error}=await sb.storage.from(bucket).upload(path,blob,{contentType:blob.type,upsert:false});if(error)throw error;
  const {data}=sb.storage.from(bucket).getPublicUrl(path);return data&&data.publicUrl||path;}
function ouvirRecargaConsulta(){ // "Enviar comprovante" não guarda a recarga no estado: captura antes do app limpar o formulário
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act="conenv"]');if(!b||!ctx.S.con)return;const C=ctx.S.con;
    const pac=(C.pacotes||[]).find(p=>p.id===C.pacSel);const el=document.getElementById('conCompUrl');const url=((el&&el.value)||C.compUrl||'').trim();if(!pac||!url||!ehUuid(pac.id))return;
    fila=fila.then(async()=>{let link;try{link=await subirArquivo('consultas-anexos','recargas',url);}catch(e){falha('enviar comprovante',e);return;}
      const {error}=await sb.from('consultas_recargas').insert({tenant_id:uid,pacote_id:pac.id,valor:pac.valor,credito:pac.credito,url_comprovante:link,status:'comprovante_enviado'});
      if(error)falha('enviar recarga',error);else status('salvo no banco ✓');});},true);}


/* ----- Usuário: Mentor (histórico mentor_mensagens; memórias memoria_dono) ----- */
COLECOES.push(
  {nome:'men_hist',tabela:'mentor_mensagens',naoSemear:true,semInsert:true,
   ler:async()=>{const c=await sb.from('mentor_conversas').select('id').eq('owner_id',uid).eq('canal','mentor');if(c.error)throw c.error;const ids=c.data.map(x=>x.id);if(!ids.length)return [];
     const m=await sb.from('mentor_mensagens').select('id,papel,conteudo,criado_em').in('conversa_id',ids).in('papel',['user','assistant']).order('criado_em').order('id').limit(500);if(m.error)throw m.error;return m.data;},
   get:S=>S.men&&S.men.hist,deDb:r=>({id:r.id,papel:r.papel==='user'?'usuario':'assistente',texto:r.conteudo||'',em:r.criado_em}),paraDb:()=>({})},
  {nome:'men_mem',tabela:'memoria_dono',dono:'owner_id',naoSemear:true,semInsert:true,filtro:q=>q.eq('ativa',true).order('atualizado_em',{ascending:false}),
   get:S=>S.men&&S.men.mem,deDb:r=>({id:r.id,tipo:r.categoria||'fato',texto:r.fato,em:r.atualizado_em||r.criado_em}),paraDb:()=>({}),
   apagar:id=>sb.from('memoria_dono').update({ativa:false}).eq('id',id)}
);


/* ----- Usuário: Reunião (salas_reuniao; criar = RPC criar_sala_agora / agendar_reuniao) ----- */
COLECOES.push({nome:'reu_salas',tabela:'salas_reuniao',naoSemear:true,semDelete:true,filtro:q=>q.is('deleted_at',null).in('status',['agendada','ao_vivo','encerrada']).order('created_at',{ascending:false}).limit(100),
  get:S=>S.reu&&S.reu.salas,deDb:r=>({id:r.id,titulo:r.titulo,status:r.status,chave_publica:r.chave_publica,agendada_para:r.agendada_para,duracao_min:r.duracao_min}),
  paraDb:o=>({status:o.status}),
  atualizar:(o,id,l)=>sb.from('salas_reuniao').update(Object.assign({status:l.status},l.status==='encerrada'?{encerrada_em:new Date().toISOString()}:{})).eq('id',id),
  inserir:async o=>{const teto=(ctx.S.reu&&ctx.S.reu.teto)||10,max=Math.min(50,Math.max(2,teto));
    const r=o.status==='agendada'?await sb.rpc('agendar_reuniao',{p_titulo:o.titulo,p_agendada_para:o.agendada_para,p_duracao_min:o.duracao_min||60,p_max:max,p_exige_aprovacao:false})
      :await sb.rpc('criar_sala_agora',{p_titulo:o.titulo||'Reunião rápida',p_max:max,p_exige_aprovacao:false});
    if(r.error)return r;if(r.data&&r.data.chave_publica)o.chave_publica=r.data.chave_publica;return {data:{id:r.data&&r.data.sala_id},error:r.data&&r.data.sala_id?null:{message:'sala não criada'}};}});
let reuPend=null;
async function carregarReuniao(){const c=await sb.from('config_plataforma').select('reuniao_limite_participantes').limit(1);if(!c.error&&c.data[0])reuPend={teto:c.data[0].reuniao_limite_participantes};}
function aplicarReuniao(){const R=ctx.S.reu;if(!R||!reuPend)return false;R.teto=reuPend.teto||R.teto;reuPend=null;return true;}


/* ----- Usuário: Agente (agentes: nome, tom, pausado; ajustes da tela em configuracao.babel_os) + dúvidas (perguntas_sem_resposta) ----- */
const AG_CHAVES=['perms','rulesX','hours','teto','tetoMes','apres','taught','prodsX','prodFix','prodDel','nsabe','matrix'];
let agRow=null,agPend=false,agSnap=null,duvPend=null;
async function carregarAgente(){try{const [a,d]=await Promise.all([sb.from('agentes').select('id,nome_agente,tom_agente,is_active,configuracao').eq('user_id',uid).order('created_at').limit(1),
    sb.from('perguntas_sem_resposta').select('pergunta,contexto,ocorrencias').eq('tenant_id',uid).eq('resolvido',false).order('ocorrencias',{ascending:false}).limit(20)]);
  if(a.error)throw a.error;agRow=a.data[0]||null;agPend=!!agRow;duvPend=d.error?null:d.data;}catch(e){falha('ler agente',e);}}
const agLinha=S=>({nome_agente:S.onbName||'Aurora',tom_agente:S.tone||null,is_active:!S.paused,babel_os:AG_CHAVES.reduce((o,k)=>{if(S[k]!==undefined)o[k]=S[k];return o;},{})});
async function sincronizarAgente(){const S=ctx.S;if(!agRow)return false;
  if(agPend){agPend=false;const c=(agRow.configuracao&&agRow.configuracao.babel_os)||{};S.onbName=agRow.nome_agente||S.onbName;if(agRow.tom_agente)S.tone=agRow.tom_agente;S.paused=agRow.is_active===false;
    AG_CHAVES.forEach(k=>{if(c[k]!==undefined)S[k]=c[k];});agSnap=json(agLinha(S));return true;}
  const l=agLinha(S),j=json(l);if(j===agSnap)return false;
  const cfg=Object.assign({},agRow.configuracao||{},{babel_os:l.babel_os});
  const {error}=await sb.from('agentes').update({nome_agente:l.nome_agente,tom_agente:l.tom_agente,is_active:l.is_active,configuracao:cfg}).eq('id',agRow.id);
  if(error){falha('salvar agente',error);return false;}agRow.configuracao=cfg;agSnap=j;return false;}
function aplicarDuvidas(){if(!duvPend||!duvPend.length){duvPend=null;return;}try{const D=window.__babelEval('DUVIDAS');D.splice(0,D.length,...duvPend.map(r=>[(r.ocorrencias||1)+'×','"'+r.pergunta+'"',r.contexto||'']));}catch(e){}duvPend=null;}


/* ----- Usuário: Campanha (campanhas; fases criadas pelo trigger campanhas_popular_fases; leads_campanha no quadro) ----- */
const hm=t=>t?String(t).slice(0,5):null;
const cpFase=r=>({id:r.id,slug:r.slug,label:r.label||r.slug,order_index:r.order_index,instruction:r.instruction||r.description||'',is_final_positive:!!r.is_final_positive});
const cpLead=(r,nomes)=>({id:r.id,lead:nomes[r.lead_id]||{name:'Lead',phone:''},state:r.state||'ativo',phase:r.phase||'aguardando',attempt_count:r.attempt_count||0,last_contact_at:r.last_contact_at,entered_at:r.entered_at,exit_reason:r.exit_reason,exited_at:r.closed_at,archived_at:r.archived_at});
COLECOES.push({nome:'cmp_camps',tabela:'campanhas',dono:'tenant_id',naoSemear:true,filtro:q=>q.is('deleted_at',null).order('created_at',{ascending:false}).limit(200),
  get:S=>S.cmp&&S.cmp.camps,
  deDb:r=>({id:r.id,name:r.name,type:r.type,status:r.status||'rascunho',objective:r.objective||'',description:r.description||'',product_id:r.product_id,duration_mode:r.duration_mode,starts_at:r.starts_at,ends_at:r.ends_at,
    window_start:hm(r.window_start),window_end:hm(r.window_end),weekdays:r.weekdays||[],skip_holidays:!!r.skip_holidays,throttle_per_day:r.throttle_per_day,throttle_per_hour:r.throttle_per_hour,desistance_silence_days:r.desistance_silence_days,
    filters:r.filters||{modo:'todos'},tipo_conteudo:r.tipo_conteudo||'texto',mensagem_inicial:r.mensagem_inicial||'',midia_url:r.midia_url,meta:null,created_at:r.created_at}),
  paraDb:o=>({name:o.name||'Campanha',type:o.type||'venda',status:o.status||'rascunho',objective:o.objective||'—',description:o.description||'',product_id:ehUuid(o.product_id)?o.product_id:null,
    duration_mode:['prazo','periodica','vitalicia'].includes(o.duration_mode)?o.duration_mode:'vitalicia',starts_at:o.starts_at||undefined,ends_at:o.ends_at||null,window_start:o.window_start||'09:00',window_end:o.window_end||'20:00',
    weekdays:o.weekdays&&o.weekdays.length?o.weekdays:[1,2,3,4,5],skip_holidays:!!o.skip_holidays,throttle_per_day:o.throttle_per_day||null,throttle_per_hour:o.throttle_per_hour||null,desistance_silence_days:o.desistance_silence_days||7,filters:o.filters||{modo:'todos'},
    tipo_conteudo:o.midia_url&&!/^data:/.test(o.midia_url)?(o.tipo_conteudo||'texto'):'texto',mensagem_inicial:o.mensagem_inicial||null,midia_url:o.midia_url&&!/^data:/.test(o.midia_url)?o.midia_url:null}),
  apagar:id=>sb.rpc('excluir_campanha',{p_campaign_id:id}),
  depoisInserir:async(o,id)=>{const {data}=await sb.from('fases_campanha').select('*').eq('campaign_id',id).order('order_index');const F=ctx.S.cmp.fases;if(data&&data.length)F[o.id]=data.map(cpFase);}});
let cmpPend=null;const cmpLeadSnap=new Map();
async function carregarCampanhaExtras(){try{const [f,l]=await Promise.all([sb.from('fases_campanha').select('*').order('order_index').limit(2000),sb.from('leads_campanha').select('*').is('archived_at',null).limit(5000)]);
  if(f.error||l.error)throw f.error||l.error;const ids=[...new Set(l.data.map(x=>x.lead_id))];const nomes={};
  if(ids.length){const q=await sb.from('leads').select('id,name,phone').in('id',ids.slice(0,1000));(q.data||[]).forEach(x=>{nomes[x.id]={name:x.name||'Lead',phone:x.phone||''};});}
  const fases={},leads={};f.data.forEach(r=>{(fases[r.campaign_id]=fases[r.campaign_id]||[]).push(cpFase(r));});l.data.forEach(r=>{(leads[r.campaign_id]=leads[r.campaign_id]||[]).push(cpLead(r,nomes));});
  cmpPend={fases,leads};}catch(e){falha('ler campanhas',e);}}
const cmpLeadLinha=l=>({phase:l.phase,state:l.state,exit_reason:l.exit_reason||null,archived_at:l.archived_at||null});
async function sincronizarCampanha(){const C=ctx.S.cmp;if(!C||(!cmpPend&&!cmpLeadSnap.size&&!carregado.cmp_camps))return false;
  if(cmpPend){const d=cmpPend;cmpPend=null;C.fases=d.fases;C.leads=d.leads;Object.values(d.leads).flat().forEach(l=>cmpLeadSnap.set(l.id,json(cmpLeadLinha(l))));return true;}
  for(const arr of Object.values(C.leads||{}))for(const l of arr){if(!cmpLeadSnap.has(l.id))continue;const li=cmpLeadLinha(l),j=json(li);if(j===cmpLeadSnap.get(l.id))continue;
    const extra=li.state!=='ativo'&&JSON.parse(cmpLeadSnap.get(l.id)).state==='ativo'?{closed_at:new Date().toISOString()}:{};
    const {error}=await sb.from('leads_campanha').update(Object.assign({},li,extra)).eq('id',l.id);if(error){falha('mover lead da campanha',error);continue;}cmpLeadSnap.set(l.id,j);}
  return false;}


/* ----- Usuário: Rifas ----- */
const semData=u=>u&&!/^data:/.test(u)?u:null;
async function subirLista(bucket,pasta,lista){const out=[];for(const u of (lista||[]))out.push(/^data:/.test(u)?await subirArquivo(bucket,pasta,u):u);return out;}
const rfRifaDb=id=>{const r=(ctx.S.rif&&ctx.S.rif.rifas||[]).find(x=>x.id===id);return r?(r._dbid||(ehUuid(r.id)?r.id:null)):(ehUuid(id)?id:null);};
async function rpcOk(nome,args){const r=await sb.rpc(nome,args);if(r.error)return r;if(r.data&&r.data.ok===false)return {error:{message:r.data.erro||r.data.motivo||'recusado'}};return r;}
COLECOES.push(
  {nome:'rf_rifas',tabela:'rifas',dono:'tenant_id',soft:true,naoSemear:true,
   ler:async()=>{const [r,p]=await Promise.all([sb.from('rifas').select('*').eq('tenant_id',uid).is('deleted_at',null).order('created_at',{ascending:false}).limit(200),
       sb.from('pedidos_rifa').select('rifa_id,qtd_numeros,status').eq('tenant_id',uid).in('status',['pago','reservado','aguardando_validacao']).limit(10000)]);
     if(r.error)throw r.error;const v={};(p.data||[]).forEach(x=>{if(x.status==='pago')v[x.rifa_id]=(v[x.rifa_id]||0)+x.qtd_numeros;});return r.data.map(x=>Object.assign({},x,{_vend:v[x.id]||0}));},
   get:S=>S.rif&&S.rif.rifas,
   deDb:r=>({id:r.id,titulo:r.titulo,descricao:r.descricao||'',status:r.status||'rascunho',metodo_sorteio:r.metodo_sorteio||'plataforma',total_numeros:r.total_numeros,preco_numero_centavos:r.preco_numero_centavos,premio_principal:r.premio_principal,
     premios_extras:r.premios_extras||[],promocoes:r.promocoes||[],cotas_premiadas:r.cotas_premiadas||[],max_por_pedido:r.max_numeros_por_pedido||20,minutos_reserva:r.minutos_reserva||30,data_sorteio_prevista:r.data_sorteio_prevista,
     data_sorteio_efetiva:r.sorteada_em,numero_sorteado:r.numero_sorteado,imagem_url:r.imagem_url,galeria:r.galeria_urls||[],vendidos_count:r._vend||0,chave_publica:r.chave_publica,created_at:r.created_at,ganhador_nome:r.ganhador_nome}),
   antes:async o=>{if(/^data:/.test(o.imagem_url||''))o.imagem_url=await subirArquivo('rifas-anexos','capas',o.imagem_url);if((o.galeria||[]).some(u=>/^data:/.test(u)))o.galeria=await subirLista('rifas-anexos','galeria',o.galeria);},
   paraDb:o=>({titulo:o.titulo||'Rifa',descricao:o.descricao||'',premio_principal:o.premio_principal||o.titulo||'Prêmio',total_numeros:parseInt(o.total_numeros,10)||100,preco_numero_centavos:Math.max(1,parseInt(o.preco_numero_centavos,10)||100),
     promocoes:o.promocoes||[],cotas_premiadas:o.cotas_premiadas||[],premios_extras:o.premios_extras||[],status:o.status||'rascunho',metodo_sorteio:o.metodo_sorteio||'plataforma',data_sorteio_prevista:o.data_sorteio_prevista||null,
     minutos_reserva:Math.min(1440,Math.max(5,parseInt(o.minutos_reserva,10)||30)),max_numeros_por_pedido:Math.min(1000,Math.max(1,parseInt(o.max_por_pedido,10)||20)),imagem_url:semData(o.imagem_url),galeria_urls:(o.galeria||[]).filter(u=>!/^data:/.test(u)),
     numero_sorteado:o.numero_sorteado??null}),
   atualizar:async(o,id,l,antes)=>{if(antes.numero_sorteado==null&&l.numero_sorteado!=null){const r=await rpcOk('sortear_rifa',{p_rifa:id,p_numero_manual:l.numero_sorteado,p_numeros_manuais:null});if(r.error)return r;}
     const x=Object.assign({},l);delete x.numero_sorteado;return sb.from('rifas').update(x).eq('id',id);},
   depoisInserir:async(o,id)=>{const {data}=await sb.from('rifas').select('chave_publica').eq('id',id).single();if(data)o.chave_publica=data.chave_publica;}},
  {nome:'rf_pedidos',tabela:'pedidos_rifa',dono:'tenant_id',naoSemear:true,semDelete:true,filtro:q=>q.order('created_at',{ascending:false}).limit(2000),
   get:S=>S.rif&&S.rif.pedidos,
   deDb:r=>({id:r.id,rifa_id:r.rifa_id,nome:r.nome,phone:r.phone,numeros:r.numeros||[],qtd_numeros:r.qtd_numeros,valor_centavos:r.valor_centavos,status:r.status,origem:r.origem||'link',comprovante_url:r.comprovante_url,chave_publica:r.chave_publica,created_at:r.created_at,
     pago_em:r.pago_em,expira_em:r.expira_em,motivo_rejeicao:r.motivo_rejeicao,divida_gerada_em:r.divida_gerada_em,divida_dispensada_em:r.divida_dispensada_em,reembolsado_em:r.reembolsado_em,reembolso_centavos:r.reembolso_centavos,numeros_reembolsados:r.numeros_reembolsados||[],motivo_reembolso:r.motivo_reembolso}),
   paraDb:o=>({status:o.status,motivo_rejeicao:o.motivo_rejeicao||null,divida_gerada_em:o.divida_gerada_em||null,divida_dispensada_em:o.divida_dispensada_em||null,reembolsado_em:o.reembolsado_em||null,numeros_reembolsados:o.numeros_reembolsados||[],motivo_reembolso:o.motivo_reembolso||null}),
   inserir:async o=>{const rid=rfRifaDb(o.rifa_id);const rf=(ctx.S.rif.rifas||[]).find(x=>(x._dbid||x.id)===rid);if(!rid||!rf||!ehUuid(rf.chave_publica))return {error:{message:'a rifa ainda não está no banco'}};
     const r=await rpcOk('reservar_numeros_rifa_publico',{p_token:rf.chave_publica,p_nome:o.nome,p_phone:o.phone||'',p_qtd:o.qtd_numeros||(o.numeros||[]).length,p_numeros:(o.numeros||[]).length?o.numeros:null,p_origem:'manual'});if(r.error)return r;
     const q=await sb.from('pedidos_rifa').select('id').eq('chave_publica',r.data.pedido_token).single();if(q.error)return q;
     if(o.status==='pago'){const c=await rpcOk('confirmar_pagamento_pedido_rifa',{p_pedido:q.data.id,p_aprovar:true,p_motivo:null});if(c.error)return c;}
     return {data:{id:q.data.id},error:null};},
   atualizar:async(o,id,l,antes)=>{
     if(l.reembolsado_em&&!antes.reembolsado_em)return rpcOk('rifa_reembolsar_pedido',{p_pedido:id,p_numeros:l.numeros_reembolsados&&l.numeros_reembolsados.length?l.numeros_reembolsados:null,p_motivo:l.motivo_reembolso||null});
     if(l.divida_gerada_em&&!antes.divida_gerada_em)return rpcOk('rifa_decidir_reserva_vencida',{p_pedido:id,p_decisao:'divida'});
     if(l.divida_dispensada_em&&!antes.divida_dispensada_em)return rpcOk('rifa_decidir_reserva_vencida',{p_pedido:id,p_decisao:'sem_divida'});
     if(l.status!==antes.status&&['pago','rejeitado'].includes(l.status)&&['reservado','aguardando_validacao'].includes(antes.status))
       return rpcOk('confirmar_pagamento_pedido_rifa',{p_pedido:id,p_aprovar:l.status==='pago',p_motivo:l.motivo_rejeicao||null});
     return sb.from('pedidos_rifa').update({status:l.status,motivo_rejeicao:l.motivo_rejeicao}).eq('id',id);}},
  {nome:'rf_fixos',tabela:'rifa_numeros_fixos',dono:'tenant_id',naoSemear:true,get:S=>S.rif&&S.rif.fixos,
   deDb:r=>({id:r.id,metodo:r.metodo_sorteio,numero:r.numero,nome:r.nome,phone:r.phone,status:r.status||'ativo'}),paraDb:o=>({metodo_sorteio:o.metodo||'plataforma',numero:parseInt(o.numero,10)||0,nome:o.nome||'—',phone:o.phone||null,status:o.status==='pendente'?'pendente':'ativo'})},
  {nome:'rf_dividas',tabela:'rifa_dividas',dono:'tenant_id',naoSemear:true,semInsert:true,get:S=>S.rif&&S.rif.dividas,
   deDb:r=>({id:r.id,rifa_id:r.rifa_id,nome:r.nome,phone:r.phone,numero:r.numero,origem:r.origem,valor_centavos:r.valor_centavos,pago:!!r.pago,sorteio_em:r.sorteio_em}),paraDb:o=>({valor_centavos:Math.max(0,parseInt(o.valor_centavos,10)||0),pago:!!o.pago})},
  {nome:'rf_contatos',tabela:'rifa_lista_disparo',dono:'tenant_id',naoSemear:true,get:S=>S.rif&&S.rif.contatos,
   deDb:r=>({id:r.id,nome:r.nome||'',phone:r.phone,marcado:r.marcado!==false}),paraDb:o=>({nome:o.nome||null,phone:String(o.phone||'').replace(/\D/g,''),marcado:o.marcado!==false})},
  {nome:'rf_ag',tabela:'rifa_agendamentos_disparo',dono:'tenant_id',naoSemear:true,get:S=>S.rif&&S.rif.ag,
   deDb:r=>({id:r.id,horario:r.horario,tipo_conteudo:r.tipo_conteudo,mensagem:r.mensagem||'',midia_url:r.midia_url,descanso_min_segundos:r.descanso_min_segundos??20,descanso_max_segundos:r.descanso_max_segundos??90,limite_diario:r.limite_diario,
     janela_inicio:r.janela_inicio,janela_fim:r.janela_fim,contatos_ids:r.contatos_ids,ativo:r.ativo!==false,teste_em:r.teste_em,teste_phone:r.teste_phone,atualizado_em:r.atualizado_em}),
   antes:async o=>{if(/^data:/.test(o.midia_url||''))o.midia_url=await subirArquivo('rifas-anexos','disparos',o.midia_url);},
   paraDb:o=>({horario:o.horario||'09:00:00',tipo_conteudo:['foto','texto','video','foto_texto'].includes(o.tipo_conteudo)?o.tipo_conteudo:'texto',mensagem:o.mensagem||'',midia_url:semData(o.midia_url),descanso_min_segundos:parseInt(o.descanso_min_segundos,10)||0,
     descanso_max_segundos:Math.max(parseInt(o.descanso_min_segundos,10)||0,parseInt(o.descanso_max_segundos,10)||0),limite_diario:o.limite_diario>0?parseInt(o.limite_diario,10):null,janela_inicio:o.janela_inicio||null,janela_fim:o.janela_fim||null,
     contatos_ids:(o.contatos_ids||[]).filter(ehUuid),ativo:o.ativo!==false})},
  {nome:'rf_tpl',tabela:'rifa_templates_mensagem',dono:'tenant_id',naoSemear:true,get:S=>S.rif&&S.rif.tpl,
   deDb:r=>({id:r.id,categoria:r.categoria,titulo:r.titulo,mensagem:r.mensagem,tipo_conteudo:r.tipo_conteudo||'texto',midia_url:r.midia_url}),
   paraDb:o=>({categoria:['alerta','atualizacao','promocao'].includes(o.categoria)?o.categoria:'atualizacao',titulo:o.titulo||'Modelo',mensagem:o.mensagem||'',tipo_conteudo:['foto','texto','video','foto_texto'].includes(o.tipo_conteudo)?o.tipo_conteudo:'texto',midia_url:semData(o.midia_url)})}
);
// configuração da rifa (rifas_config_tenant, 1 linha por tenant)
UNICOS.push({nome:'rf_cfg',tabela:'rifas_config_tenant',usuario:true,filtro:q=>q.eq('tenant_id',uid),get:S=>S.rif&&S.rif.cfg,
  linha:c=>({tenant_id:uid,agente_pode_vender:c.agentePodeVender!==false,postar_status_ativo:!!c.postarStatus,bom_dia_rifa_ativo:!!c.bomDiaRifa,chave_pix:c.chavePix||null,bom_dia_mensagem_saudacao:c.bomDiaSaud||null,
    bom_dia_mensagem_followup:c.bomDiaFup||null,disparos_pausados:!!c.pausados,disparos_telefone_teste:c.telTeste||null}),
  aplicar:(S,r)=>{Object.assign(S.rif.cfg,{agentePodeVender:r.agente_pode_vender!==false,postarStatus:!!r.postar_status_ativo,bomDiaRifa:!!r.bom_dia_rifa_ativo,chavePix:r.chave_pix||'',bomDiaSaud:r.bom_dia_mensagem_saudacao||'',bomDiaFup:r.bom_dia_mensagem_followup||'',pausados:!!r.disparos_pausados,telTeste:r.disparos_telefone_teste||''});},
  chaveId:'tenant_id'});


/* ----- Usuário: Equipe — convite cria a conta pelo edge convidar-membro (o formulário ganha e-mail e senha inicial) ----- */
function ouvirConviteEquipe(){
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act="invite"]');if(!b)return;
    setTimeout(()=>{const n=document.getElementById('ivName');if(!n||document.getElementById('ivEmail'))return;const campo=(document.getElementById('ivTel')||n).closest('.field')||n.parentElement;
      const senha=Math.random().toString(36).slice(2,6)+'@'+Math.random().toString(36).slice(2,8).toUpperCase();
      const box=document.createElement('div');box.className='split even';box.style.margin='0';
      box.innerHTML='<div class="field"><label for="ivEmail">E-mail (login)</label><input class="in" id="ivEmail" type="email" placeholder="nome@empresa.com" autocomplete="off"></div>'
        +'<div class="field"><label for="ivSenha">Senha inicial</label><input class="in mono" id="ivSenha" value="'+senha+'" autocomplete="off"></div>';
      campo.parentElement.insertBefore(box,campo.nextSibling);},0);});
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act="invitego"]');if(!b)return;
    const g=id=>((document.getElementById(id)||{}).value||'').trim();const nome=g('ivName'),email=g('ivEmail').toLowerCase(),senha=g('ivSenha');
    if(!nome||!email)return; // sem e-mail: o app segue só com o convite local (como antes)
    const apelido=nome.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.+|\.+$/g,'').slice(0,32)||'membro';
    fila=fila.then(async()=>{status('criando acesso de '+nome+'…');const r=await edge('convidar-membro',{nome,email,senha,apelido});
      if(r.erro){falha('convidar '+email+': '+r.erro,r.erro);return;}status('acesso criado ✓ · '+email+' / '+senha);});},true);}


/* ----- Tenants (admin): senha, canais Z-API/Instagram, impersonar ----- */
const CAN_ZAPI=['is_active','zapi_instance_id','zapi_token','zapi_security_token','zapi_api_url','whatsapp_phone','url_foto_perfil','chip_maturity_tier','chip_connected_since','chip_observacao','max_messages_per_hour_override'];
const CAN_IG=['is_active','ig_account_id','ig_token','ig_username'];
let canPend=null;const canSnap={};
async function carregarCanais(){const {data,error}=await sb.from('canais').select('user_id,type,'+CAN_ZAPI.join(',')+','+CAN_IG.filter(k=>k!=='is_active').join(',')).in('type',['whatsapp','instagram']).limit(2000);
  if(error){falha('ler canais',error);return;}canPend=data;}
const canLinha=(f,keys)=>{const o={};keys.forEach(k=>{let v=f[k];if(v===''||v===undefined)v=null;if(k==='max_messages_per_hour_override'&&v!=null)v=parseInt(v,10)||null;o[k]=v;});return o;};
async function sincronizarCanais(){const T=ctx.S.ten;if(!admin||!T||!T.canais||!tnOk)return;
  const idDe=l=>l._dbid||(ehUuid(l.id)?l.id:null);
  if(canPend){const d=canPend;canPend=null;T.lista.forEach(l=>{const id=idDe(l);if(!id)return;const z=d.find(x=>x.user_id===id&&x.type==='whatsapp'),g=d.find(x=>x.user_id===id&&x.type==='instagram');
      if(z||g){T.canais[l.id]=T.canais[l.id]||{};if(z)T.canais[l.id].zapi=canLinha(z,CAN_ZAPI);if(g)T.canais[l.id].insta=canLinha(g,CAN_IG);}
      canSnap[id+'|whatsapp']=z?json(canLinha(z,CAN_ZAPI)):null;canSnap[id+'|instagram']=g?json(canLinha(g,CAN_IG)):null;});return;}
  for(const l of T.lista){const id=idDe(l);if(!id)continue;const c=T.canais[l.id];if(!c)continue;
    for(const [tipo,f,keys] of [['whatsapp',c.zapi,CAN_ZAPI],['instagram',c.insta,CAN_IG]]){if(!f)continue;const li=canLinha(f,keys),j=json(li),k=id+'|'+tipo;if(canSnap[k]===j)continue;
      const ex=await sb.from('canais').select('id').eq('user_id',id).eq('type',tipo).maybeSingle();
      const r=ex.data&&ex.data.id?await sb.from('canais').update(li).eq('id',ex.data.id):await sb.from('canais').insert(Object.assign({user_id:id,type:tipo},li));
      if(r.error){falha('salvar canal '+tipo,r.error);continue;}canSnap[k]=j;}}}
function ouvirTenantsExtras(){
  // redefinir senha: lê o campo antes do app limpar o formulário
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act="tnsengo"]');if(!b||!ctx.S.ten)return;
    const v=((document.getElementById('tnSenVal')||{}).value||'');const t=(ctx.S.ten.lista||[]).find(x=>x.id===ctx.S.ten.det);if(v.length<6||!t)return;const id=t._dbid||t.id;if(!ehUuid(id))return;
    fila=fila.then(async()=>{const r=await edge('admin-redefinir-senha',{user_id:id,nova_senha:v});if(r.erro)falha('redefinir senha: '+r.erro,r.erro);else status('senha redefinida ✓');});},true);
  // impersonar: troca a sessão nesta aba (guarda a do admin para voltar)
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act="tnimp"]');if(!b||!admin)return;
    const t=(ctx.S.ten&&ctx.S.ten.lista||[]).find(x=>x.id===b.dataset.id);const id=t?(t._dbid||t.id):b.dataset.id;if(!ehUuid(id))return;e.stopPropagation();
    status('entrando como '+((t&&t.nome)||'tenant')+'…');
    edge('impersonate-user',{target_user_id:id,motivo:'curadoria/admin'}).then(async r=>{if(r.erro){falha('impersonar: '+r.erro,r.erro);return;}
      const {data:{session}}=await sb.auth.getSession();if(session)sessionStorage.setItem('babel_admin_backup',JSON.stringify({access_token:session.access_token,refresh_token:session.refresh_token}));
      const x=await sb.auth.setSession({access_token:r.data.access_token,refresh_token:r.data.refresh_token});if(x.error){falha('impersonar',x.error);return;}
      try{localStorage.removeItem(window.__babelEval('KEY'));}catch(e){}location.reload();});},true);}


/* ----- Curadoria: Pacotes de conhecimento (+ blocos, Loja e liberação por RPC) ----- */
let pkPend=null,pkNichos=[];const pkSnap=new Map();
async function carregarPacotes(){try{
  const [p,b,n]=await Promise.all([sb.from('pacotes_conhecimento').select('*').eq('origem','admin').is('deleted_at',null).order('ordem').limit(300),
    sb.from('pacotes_conhecimento_blocos').select('id,pacote_id,titulo,conteudo,ativo').is('deleted_at',null).limit(5000),sb.from('nichos').select('id,nome_exibicao')]);
  if(p.error||b.error)throw p.error||b.error;pkNichos=n.data||[];
  const lojaIds=p.data.map(x=>x.loja_aplicativo_id).filter(Boolean);const loja={};
  if(lojaIds.length){const l=await sb.from('loja_aplicativos').select('id,preco_mensal,is_active').in('id',lojaIds);(l.data||[]).forEach(x=>{loja[x.id]=x;});}
  const uso={};for(const x of p.data){const u=await sb.rpc('admin_uso_pacote',{p_pacote_id:x.id});uso[x.id]=(u.data||[]).filter(r=>r.instalado).map(r=>r.tenant_id);}
  pkPend=p.data.map(x=>{const lj=loja[x.loja_aplicativo_id];return {id:x.id,nome:x.nome,descricao:x.descricao||'',nicho:(pkNichos.find(n=>n.id===x.nicho_id)||{}).nome_exibicao||'Todos os nichos',ativo:x.ativo!==false,
    loja:{publicado:!!(lj&&lj.is_active),preco:lj&&lj.preco_mensal!=null?Number(lj.preco_mensal):null},instalados:uso[x.id]||[],
    blocos:b.data.filter(k=>k.pacote_id===x.id).map(k=>({id:k.id,conteudo:k.conteudo,ativo:k.ativo!==false,_titulo:k.titulo}))};});
}catch(e){falha('ler pacotes',e);}}
const pkLinha=o=>({nome:o.nome,descricao:o.descricao||'',nicho_id:(pkNichos.find(n=>n.nome_exibicao===o.nicho)||{}).id||null,ativo:o.ativo!==false});
async function sincronizarPacotes(){const C=ctx.S.cur;if(!admin||!C||!Array.isArray(C.pacotes))return false;
  if(pkPend){C.pacotes.splice(0,C.pacotes.length,...pkPend);pkPend.forEach(o=>pkSnap.set(o.id,JSON.parse(json(o))));pkPend=null;return true;}
  if(!pkSnap.size&&!carregado.__pk){carregado.__pk=true;if(!LOCAL)return false;}
  const vivos=new Set();
  for(const o of C.pacotes){let id=o._dbid||(ehUuid(o.id)&&pkSnap.has(o.id)?o.id:null);const agora=JSON.parse(json(o));
    if(!id){const r=await sb.from('pacotes_conhecimento').insert(Object.assign({origem:'admin'},pkLinha(agora))).select('id').single();if(r.error){falha('criar pacote',r.error);continue;}
      id=o._dbid=r.data.id;pkSnap.set(id,{nome:'',descricao:'',nicho:'',ativo:true,loja:{publicado:false,preco:null},instalados:[],blocos:[]});}
    vivos.add(id);const antes=pkSnap.get(id);
    if(json(pkLinha(agora))!==json(pkLinha(antes))){const r=await sb.from('pacotes_conhecimento').update(pkLinha(agora)).eq('id',id);if(r.error){falha('salvar pacote',r.error);continue;}}
    // blocos do pacote
    const bAntes=new Map((antes.blocos||[]).map(b=>[b._dbid||b.id,b]));
    for(const b of o.blocos||[]){const bid=b._dbid||(ehUuid(b.id)&&bAntes.has(b.id)?b.id:null);
      if(!bid){const r=await sb.from('pacotes_conhecimento_blocos').insert({pacote_id:id,titulo:(b.conteudo||'Bloco').slice(0,80),conteudo:b.conteudo||'—',ativo:b.ativo!==false,modo:'relevancia'}).select('id').single();
        if(r.error){falha('criar bloco do pacote',r.error);continue;}b._dbid=r.data.id;continue;}
      const a=bAntes.get(bid);bAntes.delete(bid);if(a&&(a.conteudo!==b.conteudo||a.ativo!==b.ativo)){const r=await sb.from('pacotes_conhecimento_blocos').update({conteudo:b.conteudo,ativo:b.ativo!==false}).eq('id',bid);if(r.error)falha('salvar bloco do pacote',r.error);}}
    for(const bid of bAntes.keys())if(ehUuid(bid)){const r=await sb.from('pacotes_conhecimento_blocos').update({deleted_at:new Date().toISOString()}).eq('id',bid);if(r.error)falha('excluir bloco do pacote',r.error);}
    // Loja e liberação manual
    if(json(agora.loja)!==json(antes.loja)){const r=await sb.rpc('admin_publicar_pacote_loja',{p_pacote_id:id,p_preco_mensal:agora.loja.preco,p_publicado:!!agora.loja.publicado});if(r.error){falha('publicar na Loja',r.error);continue;}}
    const ti=new Set(antes.instalados||[]),tn=new Set((agora.instalados||[]).filter(ehUuid));
    for(const t of tn)if(!ti.has(t)){const r=await sb.rpc('admin_liberar_pacote_tenant',{p_pacote_id:id,p_tenant_id:t,p_liberar:true});if(r.error)falha('liberar pacote',r.error);}
    for(const t of ti)if(!tn.has(t)){const r=await sb.rpc('admin_liberar_pacote_tenant',{p_pacote_id:id,p_tenant_id:t,p_liberar:false});if(r.error)falha('revogar pacote',r.error);}
    const novo=JSON.parse(json(o));novo.blocos=(o.blocos||[]).map(b=>Object.assign({},b,{id:b._dbid||b.id}));pkSnap.set(id,novo);}
  for(const id of [...pkSnap.keys()])if(!vivos.has(id)){const r=await sb.from('pacotes_conhecimento').update({deleted_at:new Date().toISOString()}).eq('id',id);if(!r.error)pkSnap.delete(id);}
  return false;}
/* ----- Curadoria: Produtos (agentes.fluxo.produtos) e dossiê da Conversa, do tenant impersonado ----- */
let cuTenCarregado=null;const prodSnap={};const prodAgente={};
async function carregarTenantCuradoria(tid){const C=ctx.S.cur;
  const [a,l]=await Promise.all([sb.from('agentes').select('id,fluxo').eq('user_id',tid).order('created_at').limit(1),sb.from('leads').select('id,name,phone,email,dados_ficha').eq('tenant_id',tid).is('deleted_at',null).order('updated_at',{ascending:false}).limit(100)]);
  if(a.data&&a.data[0]){prodAgente[tid]=a.data[0];const L=((a.data[0].fluxo||{}).produtos||[]).map((p,i)=>({id:p.id||('p'+i),nome:p.nome||'',preco:Number(p.preco||0),unidade:p.unidade||'',categoria:p.categoria||'',descricao:p.descricao||'',ativo:p.ativo!==false}));
    C.produtos[tid]=L;prodSnap[tid]=json(L);}else C.produtos[tid]=[];
  const ids=(l.data||[]).map(x=>x.id);let mem=[],afe=[],cre=[];
  if(ids.length){const [m,e,c]=await Promise.all([sb.from('memoria_lead').select('lead_id,fato,categoria,modulo').in('lead_id',ids).eq('ativa',true).limit(1000),
      sb.from('estado_afetivo_lead').select('lead_id,valencia,resumo_humor,atualizado_em').in('lead_id',ids).limit(1000),
      sb.from('conversas').select('id,lead_id').in('lead_id',ids).limit(1000)]);mem=m.data||[];afe=e.data||[];
    const cv=(c.data||[]);if(cv.length){const k=await sb.from('crenca_conversa').select('conversation_id,resumo_agente,estilo_lead').in('conversation_id',cv.map(x=>x.id));cre=(k.data||[]).map(x=>Object.assign({},x,{lead_id:(cv.find(y=>y.id===x.conversation_id)||{}).lead_id}));}}
  try{const CL=window.__babelEval('CU_LEADS');CL[tid]=(l.data||[]).map(x=>{const ms=mem.filter(m=>m.lead_id===x.id),af=afe.find(a=>a.lead_id===x.id),cr=cre.find(c=>c.lead_id===x.id);
    return {id:x.id,nome:x.name||'Lead',fone:x.phone||'',email:x.email||'',ficha:(x.dados_ficha&&(x.dados_ficha.resumo||x.dados_ficha.codigo))||'—',
      curta:ms.filter(m=>m.modulo!=='longo').slice(0,5).map(m=>m.fato),longa:ms.filter(m=>m.modulo==='longo').slice(0,5).map(m=>m.fato),
      crenca:cr?(cr.resumo_agente||cr.estilo_lead||'—'):'—',afeto:af?((af.resumo_humor||'humor')+' ('+(Number(af.valencia)>=0?'+':'')+Number(af.valencia||0).toFixed(1)+')'):'—'};});}catch(e){}
  return true;}
async function sincronizarCuradoriaTenant(){const C=ctx.S.cur;if(!admin||!C)return false;const tid=C.tenant;let mudou=false;
  if(ehUuid(tid)&&cuTenCarregado!==tid){cuTenCarregado=tid;try{mudou=await carregarTenantCuradoria(tid);}catch(e){falha('ler tenant na curadoria',e);}}
  for(const t of Object.keys(prodSnap)){const L=C.produtos[t];if(!L||!prodAgente[t])continue;const j=json(L);if(j===prodSnap[t])continue;
    const fl=Object.assign({},prodAgente[t].fluxo||{},{produtos:L.map(p=>({id:p.id,nome:p.nome,preco:Number(p.preco)||0,unidade:p.unidade,categoria:p.categoria,descricao:p.descricao,ativo:p.ativo!==false}))});
    const r=await sb.from('agentes').update({fluxo:fl}).eq('id',prodAgente[t].id);if(r.error){falha('salvar produtos do agente',r.error);continue;}prodAgente[t].fluxo=fl;prodSnap[t]=j;}
  return mudou;}


/* ----- Dashboard (admin): séries reais de crescimento de tenants e custo LLM (substitui dbSerie) e saúde do motor ----- */
let dashSeries=null;
FONTES.push({alvos:[],async ler(){
  const [p,c]=await Promise.all([sb.from('profiles').select('created_at').neq('system_role','platform_admin').is('parent_user_id',null).order('created_at').limit(10000),
    sb.from('custos_llm_dia').select('dia,custo_usd').order('dia').limit(10000)]);
  dashSeries={tenants:(p.data||[]).map(x=>new Date(x.created_at).getTime()),custos:(c.data||[]).map(x=>({t:new Date(x.dia+'T12:00:00').getTime(),v:Number(x.custo_usd||0)}))};return [];}});
function instalarSeriesDashboard(){if(!dashSeries)return;const D=dashSeries;
  const serie=(tipo,pts)=>{pts=Math.max(2,pts|0);const fim=Date.now(),passo=(tipo&&pts)?DIA*Math.max(1,Math.round(({7:7,30:30,12:90,24:365}[pts]||pts)/pts)):DIA;const out=[];
    for(let i=pts-1;i>=0;i--){const ate=fim-i*passo;out.push(tipo==='cresc'?D.tenants.filter(t=>t<=ate).length:Math.round(D.custos.filter(c=>c.t<=ate&&c.t>ate-passo).reduce((a,c)=>a+c.v,0)));}
    return out;};
  try{const f=window.__babelEval('(function(fn){dbSerie=fn;})');f(serie);}catch(e){falha('séries do dashboard',e);}}


/* ----- Tempo real: mensagens e conversas novas aparecem sem recarregar (TODO-REALTIME) ----- */
const hhmm=d=>String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const RT_ROLE={user:'cl',assistant:'ag',human:'ag',system:'me'};
let rtCanal=null,rtRender=null;
function rtDesenhar(){clearTimeout(rtRender);rtRender=setTimeout(()=>{try{ctx.render();}catch(e){}},250);}
function ligarTempoReal(){if(rtCanal||!sb.channel)return;if((window.BABEL_CONFIG||{}).proxy)return; // repasse HTTP não leva websocket
  rtCanal=sb.channel('babel-conversas-'+uid)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'mensagens'},p=>{const m=p.new;if(!m||m.deleted_at)return;
      if(m.role==='human'&&m.sender_id===uid)return; // a própria mensagem enviada por esta tela
      const c=ctx.CONVS.find(x=>x.uuid===m.conversation_id);if(!c)return;
      Array.prototype.push.call(c.msgs,[RT_ROLE[m.role]||'cl',m.content||'',hhmm(new Date(m.created_at||Date.now()))]);
      if(m.role==='user'){c.sub='nova mensagem · agora';}rtDesenhar();})
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'conversas',filter:'tenant_id=eq.'+uid},async p=>{const v=p.new;if(!v||ctx.CONVS.some(x=>x.uuid===v.id))return;
      let nome='Contato novo';if(v.lead_id){const l=await sb.from('leads').select('name').eq('id',v.lead_id).maybeSingle();if(l.data&&l.data.name)nome=l.data.name;}
      const id='c'+Date.now().toString(36);const c={id,uuid:v.id,tok:'mute',word:'chegou agora',who:nome,sub:v.titulo||'conversa nova',canal:v.channel||'WhatsApp',
        ficha:{ini:nome.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(),nome,tags:[],comprou:'—',compras:'0',paga:'—',mem:[]},msgs:[]};
      Array.prototype.push.call(ctx.CONVS,c);ligarMsgs(c);rtDesenhar();})
    .subscribe();}


/* ----- Motor do agente (chat e simulador da Curadoria): ragentic-processar-inline em modo_teste ----- */
const motorSessao={};
async function motorConversa(aba){if(motorSessao[aba])return motorSessao[aba];const id=crypto.randomUUID();
  const r=await sb.from('mentor_conversas').insert({id,owner_id:uid,titulo:aba==='simulador'?'Simulador — teste de conversa':'Chat da curadoria',canal:'curadoria'}).select('id').single();
  if(r.error)throw r.error;motorSessao[aba]=id;return id;}
window.BabelMotor={
  async perguntar(texto,o){o=o||{};const t0=Date.now();const conversa_id=await motorConversa(o.aba||'chat');
    const {data,error}=await sb.functions.invoke('ragentic-processar-inline',{body:{conversa_id,mensagem:texto,canal:'curadoria',modo_teste:true,
      contexto_curadoria:{aba_ativa:o.aba||'chat',tenant_id:ehUuid(o.tenant)?o.tenant:null,cargo_alvo:o.cargo||null,modelo:o.modelo||null}}});
    if(error){let m=error.message;try{const j=await error.context.json();if(j&&j.error)m=j.error;}catch(e){}throw new Error(m);}
    if(!data||data.ok===false||data.error)throw new Error((data&&data.error)||'erro no motor');
    return {texto:data.mensagem||'(sem resposta)',modelo:data.modelo||null,latencia:((Date.now()-t0)/1000).toFixed(1)};},
  novaConversa(aba){delete motorSessao[aba||'chat'];}
};


/* ----- Endereços do cérebro e da voz: fora do localhost usam o próprio site (/cerebro, /voz) ----- */
function ajustarServidoresLocais(){const C=window.BABEL_CONFIG||{},S=ctx.S;if(!C.cerebroUrl)return;
  const padrao=u=>!u||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(u)||/\/cerebro\/?$|\/voz\/?$/.test(u);
  if(padrao(S.cerebroUrl))S.cerebroUrl=C.cerebroUrl;if(padrao(S.edgeUrl))S.edgeUrl=C.vozUrl;}


/* ----- Cérebro com login: o Mentor lê os dados reais de quem pergunta (o cérebro consulta o banco com o token da sessão) ----- */
function ligarCerebroComLogin(){if(window.__cerebroLogin)return;window.__cerebroLogin=true;const f0=window.fetch.bind(window);
  window.fetch=async function(u,o){try{const url=typeof u==='string'?u:(u&&u.url)||'';const base=cerebroBase();
    if(base&&url.indexOf(base+'/api/')===0&&sb){const {data}=await sb.auth.getSession();const tk=data&&data.session&&data.session.access_token;
      if(tk){o=Object.assign({},o||{});const h=new Headers(o.headers||(typeof u!=='string'&&u.headers)||{});h.set('Authorization','Bearer '+tk);h.set('apikey',(window.BABEL_CONFIG||{}).supabaseKey||'');o.headers=h;}}}catch(e){}
    return f0(u,o);};}

/* ----- Ouvido do Mentor -----
   Dois caminhos: o reconhecimento do navegador (Chrome/Android: rápido e com "olá Babel") e o gravador universal,
   que grava em WAV 16 kHz e manda para /api/ouvir no cérebro — lá a Groq transcreve (com chave) ou o Whisper local
   do Mac (sem chave). Sem reconhecimento no navegador (iPhone, Firefox) → gravador direto. Se o reconhecimento do
   navegador falhar (rede, serviço bloqueado, erro), troca sozinho para o gravador e guarda a escolha neste aparelho
   (Ajustes › Voz › Ouvido do Mentor desfaz). ----- */
const OUVIR_KEY='babel_ouvir';
const ouvirPref=()=>{try{return localStorage.getItem(OUVIR_KEY)||'';}catch(e){return '';}};
const ouvirSalvar=v=>{try{if(v)localStorage.setItem(OUVIR_KEY,v);else localStorage.removeItem(OUVIR_KEY);}catch(e){}};
const AudioCtx=window.AudioContext||window.webkitAudioContext;
let ouvidoGravador=false,ctxAudio=null,vOriginal=null;
// um contexto de áudio só, destravado no primeiro toque (o iPhone exige gesto)
function audioCtx(){if(!ctxAudio&&AudioCtx){try{ctxAudio=new AudioCtx();}catch(e){}}if(ctxAudio&&ctxAudio.state==='suspended'){try{ctxAudio.resume();}catch(e){}}return ctxAudio;}
['pointerdown','touchend','keydown'].forEach(ev=>document.addEventListener(ev,()=>{try{audioCtx();}catch(e){}},{capture:true,passive:true}));
function wavDe(partes,sr){let n=0;partes.forEach(p=>{n+=p.length;});const alvo=16000,r=sr/alvo,len=Math.max(0,Math.floor(n/r)),pcm=new Int16Array(len);
  const tudo=new Float32Array(n);let o=0;partes.forEach(p=>{tudo.set(p,o);o+=p.length;});
  let pico=0;for(let i=0;i<n;i++){const v=Math.abs(tudo[i]);if(v>pico)pico=v;}const ganho=pico>0.01?Math.min(8,0.9/pico):1;if(ganho!==1)for(let i=0;i<n;i++)tudo[i]*=ganho;
  for(let i=0;i<len;i++){const a=Math.floor(i*r),b=Math.min(n,Math.max(a+1,Math.floor((i+1)*r)));let s=0;for(let j=a;j<b;j++)s+=tudo[j];const v=Math.max(-1,Math.min(1,s/(b-a)));pcm[i]=v<0?v*0x8000:v*0x7fff;}
  const buf=new ArrayBuffer(44+len*2),dv=new DataView(buf),w=(p,t)=>{for(let k=0;k<t.length;k++)dv.setUint8(p+k,t.charCodeAt(k));};
  w(0,'RIFF');dv.setUint32(4,36+len*2,true);w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,alvo,true);dv.setUint32(28,alvo*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);w(36,'data');dv.setUint32(40,len*2,true);
  new Int16Array(buf,44,len).set(pcm);return new Blob([buf],{type:'audio/wav'});}
function cerebroBase(){return String(ctx.S.cerebroUrl||(window.BABEL_CONFIG||{}).cerebroUrl||'http://localhost:3078').replace(/\/+$/,'');}
async function transcreverWav(blob){
  if(!blob||blob.size<8000)return {ok:false,why:'vazio'}; // menos de ~0,25 s
  let r;try{const ac=new AbortController();const t=setTimeout(()=>ac.abort(),60000);r=await fetch(cerebroBase()+'/api/ouvir',{method:'POST',headers:{'Content-Type':'audio/wav'},body:blob,signal:ac.signal});clearTimeout(t);}catch(e){return {ok:false,why:'offline'};}
  let j=null;try{j=await r.json();}catch(e){}
  if(r.status===503)return {ok:false,why:/whisper|ouvido|3079/i.test(JSON.stringify(j||''))?'semouvido':'offline'};
  if(!r.ok)return {ok:false,why:'err'};
  const txt=String((j&&(j.texto||j.text))||'').trim();return txt?{ok:true,texto:txt,fonte:j.fonte||''}:{ok:false,why:'vazio'};}
// grava até o silêncio (1,5 s depois de falar), 20 s no máximo; sem fala em 7 s = "não ouvi"
function gravar(o){const st={fim:false};const a=audioCtx();
  if(!a||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){setTimeout(()=>o.onEnd(null,'gravador'),0);return {parar(){}}; }
  navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false,channelCount:1}}).then(stream=>{
    if(st.fim){stream.getTracks().forEach(t=>t.stop());return;}
    try{if(a.state==='suspended')a.resume();}catch(e){}
    const src=a.createMediaStreamSource(stream),proc=a.createScriptProcessor(4096,1,1),partes=[],t0=Date.now();let falou=false,ultima=Date.now();
    proc.onaudioprocess=e=>{if(st.fim)return;const d=e.inputBuffer.getChannelData(0);partes.push(new Float32Array(d));let q=0;for(let i=0;i<d.length;i+=8)q+=d[i]*d[i];const rms=Math.sqrt(q/(d.length/8));
      if(o.onLevel)o.onLevel(Math.min(1,rms*6));if(rms>0.015){falou=true;ultima=Date.now();}const agora=Date.now();
      if(falou&&agora-ultima>1500)st.parar('auto');else if(agora-t0>20000)st.parar('auto');else if(!falou&&agora-t0>7000)st.parar('nospeech');};
    src.connect(proc);proc.connect(a.destination);
    st.parar=why=>{if(st.fim)return;st.fim=true;try{proc.disconnect();src.disconnect();}catch(e){}stream.getTracks().forEach(t=>t.stop());if(o.onLevel)o.onLevel(0);
      if(why==='cancel'||why==='nospeech'||!partes.length){o.onEnd(null,why==='cancel'?'cancel':'nospeech');return;}
      o.onEnd(wavDe(partes,a.sampleRate),why);};
  }).catch(e=>{const n=(e&&e.name)||'';st.fim=true;o.onEnd(null,/NotAllowed|Security/i.test(n)?'denied':/NotFound|Overconstrained/i.test(n)?'nodev':/NotReadable/i.test(n)?'busy':'err');});
  return {parar(why){if(st.parar)st.parar(why);else if(!st.fim){st.fim=true;o.onEnd(null,why==='cancel'?'cancel':'nospeech');}}};}
function esferas(v){try{[window.__babelEval('Mentor').sp,window.__babelEval('HomeSphere').sp].forEach(sp=>{if(sp)sp.voice=Math.max(sp.voice*0.6||0,v);});}catch(e){}}
function rotuloMentor(t){try{const L=document.getElementById('mLbl');if(L)L.textContent=t;const i=document.getElementById('mIn');if(i&&t)i.placeholder=t;}catch(e){}}
const MSG_OUVIR={semouvido:['O ouvido do Mentor está desligado','no Mac, ligue pelo iniciar-babel · escreva enquanto isso'],offline:['Sem conexão com o cérebro','confira se o Mac está ligado e o iniciar-babel rodando · escreva enquanto isso'],
  vazio:['Não entendi','fale de novo, mais perto do microfone'],gravador:['Este navegador não grava áudio','atualize o navegador · escreva'],insecure:['O microfone precisa de HTTPS','abra o endereço https do Babel ou o http://localhost:8080'],
  denied:['Microfone bloqueado','libere o microfone para este site nas permissões do navegador e recarregue'],nospeech:['Não ouvi nada','toque no microfone e fale logo em seguida'],nodev:['Nenhum microfone encontrado','confira se há um conectado'],busy:['Microfone em uso por outro app','feche Zoom, Meet ou Teams e tente de novo']};
function usarGravador(){if(ouvidoGravador)return true;let V,B;try{V=window.__babelEval('Voice');B=window.__babelEval('Babel');}catch(e){return false;}if(!V)return false;
  if(!vOriginal)vOriginal={listen:V.listen,stopListen:V.stopListen,avail:V.avail,wake:V.wake,wakeResume:V.wakeResume,stopWake:V.stopWake,fixFor:V.fixFor};
  ouvidoGravador=true;
  try{V.wantWake=false;if(V._stopRec)V._stopRec();B.wakeOn=false;}catch(e){}
  const temMic=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&AudioCtx);
  V.fixFor=why=>MSG_OUVIR[why]||vOriginal.fixFor.call(V,why);
  V.avail=()=>temMic&&window.isSecureContext;
  V.wake=()=>false;V.wakeResume=()=>{};V.stopWake=()=>{V.wantWake=false;try{B.wakeOn=false;}catch(e){}};
  let atual=null;
  const fim=(o,why)=>{atual=null;V.want=null;V.mode='idle';try{V._sync();}catch(e){}esferas(0);if(o&&o.onStop){try{o.onStop(why||'done');}catch(e){}}};
  V.listen=function(o){o=o||{};if(atual)return;
    if(!window.isSecureContext){if(o.onStop)o.onStop('insecure');return;}
    if(!temMic){if(o.onStop)o.onStop('gravador');return;}
    V.want='listen';V.mode='listen';try{V._sync();}catch(e){}
    const sess={o};atual=sess;rotuloMentor('Ouvindo… fale e aguarde um instante');
    sess.g=gravar({onLevel:esferas,onEnd:async(blob,why)=>{if(atual!==sess)return;
      if(!blob){fim(o,why==='cancel'?'toggle':why);return;}
      rotuloMentor('Transcrevendo…');try{if(o.onText)o.onText('…',false);}catch(e){}
      const r=await transcreverWav(blob);if(atual!==sess)return;
      if(!r.ok){try{if(o.onText)o.onText('',false);}catch(e){}fim(o,r.why);return;}
      try{if(o.onText)o.onText(r.texto,true);}catch(e){}const cbF=o.onFinal;fim(o,'done');try{if(cbF)cbF(r.texto);}catch(e){}}});};
  // tocar de novo no microfone = enviar o que já foi falado; sair da tela = descartar
  V.stopListen=function(why){const s=atual;if(!s){V.want=null;V.mode='idle';return;}s.g.parar(why==='toggle'||why==='auto'||why==='done'?'enviar':'cancel');};
  return true;}
function usarNavegador(){if(!ouvidoGravador||!vOriginal)return;let V;try{V=window.__babelEval('Voice');}catch(e){return;}Object.assign(V,vOriginal);ouvidoGravador=false;envolverReconhecimento();}
// reconhecimento do navegador com plano B: se falhar, troca para o gravador e escuta de novo
const TROCA_OUVIDO=['network','busy','err','norec','service-not-allowed','language-not-supported','bad-grammar','audio-capture-sr'];
function envolverReconhecimento(){let V;try{V=window.__babelEval('Voice');}catch(e){return;}if(!V||!V.SR)return;
  const listenSR=vOriginal&&vOriginal.listen?vOriginal.listen:V.listen;
  V.listen=function(o){o=o||{};const stop0=o.onStop;
    return listenSR.call(V,Object.assign({},o,{onStop:why=>{
      const trocar=!ouvidoGravador&&ouvirPref()!=='navegador'&&(TROCA_OUVIDO.includes(why)||(why==='denied'&&V.micOk));
      if(trocar&&usarGravador()){ouvirSalvar('servidor');
        try{window.__babelEval('toast')('Ouvido trocado para o Mac','o reconhecimento do navegador falhou ('+why+') · fale de novo');}catch(e){}
        if(stop0){try{stop0('toggle');}catch(e){}}
        rotuloMentor('Ouvido trocado para o Mac · fale de novo');
        setTimeout(()=>{try{window.__babelEval('Babel').listen();}catch(e){}},500);return;}
      if(stop0)stop0(why);}}));};}
function instalarOuvido(){let V;try{V=window.__babelEval('Voice');}catch(e){return;}if(!V)return;
  if(!V.SR)instalarSaidaIOS();
  if(!V.SR||ouvirPref()==='servidor'){usarGravador();return;}
  if(!vOriginal)vOriginal={listen:V.listen,stopListen:V.stopListen,avail:V.avail,wake:V.wake,wakeResume:V.wakeResume,stopWake:V.stopWake,fixFor:V.fixFor};
  envolverReconhecimento();}
// Ajustes › Voz › Ouvido do Mentor: escolher o caminho e testar
async function testarOuvido(){const st=document.getElementById('ouvirSt'),diz=t=>{if(st)st.textContent=t;};
  let info=null;try{const r=await fetch(cerebroBase()+'/api/info');info=await r.json();}catch(e){}
  if(!info){diz('cérebro fora do ar · ligue pelo iniciar-babel');return;}
  if(info.stt==='desligado'){diz('o ouvido do Mac está desligado · ligue pelo iniciar-babel');return;}
  diz('gravando… fale uma frase');const t0=Date.now();
  gravar({onLevel:esferas,onEnd:async(blob,why)=>{if(!blob){diz(MSG_OUVIR[why]?MSG_OUVIR[why][0]:'não gravou ('+why+')');return;}
    diz('transcrevendo…');const r=await transcreverWav(blob);
    diz(r.ok?'ouvi: "'+r.texto+'" · '+((Date.now()-t0)/1000).toFixed(1)+' s · '+(r.fonte==='groq'?'Groq':'Whisper no Mac'):(MSG_OUVIR[r.why]||['falhou'])[0]);}});}
function ouvirAjustes(){document.addEventListener('change',e=>{const t=e.target;if(!t||t.id!=='ouvirModo')return;const v=t.value;ouvirSalvar(v);
    if(v==='servidor')usarGravador();else usarNavegador();
    try{window.__babelEval('toast')('Ouvido do Mentor',v==='servidor'?'pelo Mac (Whisper)':v==='navegador'?'pelo navegador':'automático');}catch(e){}});
  document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('[data-act="ouvirteste"]');if(a)testarOuvido();});}
function instalarSaidaIOS(){let E;try{E=window.__babelEval('Edge');}catch(e){return;}
  // iOS: a saída de áudio só destrava num toque → um AudioContext único, destravado no 1º toque, usado pela voz do Jarvis
  const A=window.AudioContext||window.webkitAudioContext;let ctxVoz=null;
  const destravar=()=>{try{if(!ctxVoz&&A)ctxVoz=new A();if(ctxVoz&&ctxVoz.state==='suspended')ctxVoz.resume();const b=ctxVoz.createBuffer(1,1,22050);const s0=ctxVoz.createBufferSource();s0.buffer=b;s0.connect(ctxVoz.destination);s0.start(0);}catch(e){}
    try{const au=new Audio('data:audio/mp4;base64,AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAAhmcmVlAAAAAG1kYXQ=');au.muted=true;au.play().catch(()=>{});}catch(e){}};
  ['touchend','click'].forEach(ev=>document.addEventListener(ev,destravar,{once:true,capture:true}));
  if(E&&A){E.stop=function(){cancelAnimationFrame(this.raf);if(this.src){try{this.src.onended=null;this.src.stop();}catch(e){}this.src=null;}}; // não fecha o contexto destravado
    E.say=async function(text){this.stop();const tn=this.tune()||{};const r=await fetch(this.url()+'/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:String(text).slice(0,1800),voice:this.voice(),rate:tn.rate,pitch:tn.pitch})});
      if(!r.ok)throw new Error('edge '+r.status);const ab=await r.arrayBuffer();if(!ctxVoz)ctxVoz=new A();if(ctxVoz.state==='suspended'){try{await ctxVoz.resume();}catch(e){}}
      const bufA=await new Promise((ok,ko)=>ctxVoz.decodeAudioData(ab,ok,ko));const src=this.src=ctxVoz.createBufferSource();src.buffer=bufA;const an=ctxVoz.createAnalyser();an.fftSize=512;src.connect(an);an.connect(ctxVoz.destination);
      const arr=new Uint8Array(an.frequencyBinCount);const loop=()=>{an.getByteTimeDomainData(arr);let q=0;for(let i=0;i<arr.length;i++){const v=(arr[i]-128)/128;q+=v*v;}const rms=Math.min(1,Math.sqrt(q/arr.length)*3);
        [window.__babelEval('Mentor').sp,window.__babelEval('HomeSphere').sp,window.__ag].forEach(sp=>{if(sp)sp.voice=Math.max(sp.voice||0,rms);});this.raf=requestAnimationFrame(loop);};
      return new Promise(res=>{src.onended=()=>{cancelAnimationFrame(this.raf);this.src=null;res();};src.start();loop();});};}
}

const fonteDados=new Map();
function aplicarFontes(){for(const [f,vals] of fonteDados){f.alvos.forEach((nome,i)=>{let alvo;try{alvo=window.__babelEval(nome);}catch(e){return;}const v=vals[i];
    if(v==null)return; // sem dados no banco: mantém o exemplo
    if(Array.isArray(alvo))alvo.splice(0,alvo.length,...v);else if(alvo&&typeof alvo==='object'){Object.keys(alvo).forEach(k=>delete alvo[k]);Object.assign(alvo,v);}});}
  fonteDados.clear();}


/* ----- Tenants (admin): perfis + assinatura; criar/excluir/restaurar pelas edges do admin ----- */
const senhasNovas={}; // e-mail → senha digitada no formulário de criação (o app limpa o formulário ao criar)
function ouvirCriacaoTenant(){ // registrado em ligar(): o document.open() do app.html remove ouvintes antigos
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act="tncsave"]');if(!b)return;
    const em=document.getElementById('tnC_email'),pw=document.getElementById('tnC_senha');if(em&&pw&&em.value.trim())senhasNovas[em.value.trim().toLowerCase()]=pw.value;},true);}
const TN_PERFIL=o=>({full_name:o.nome||'',email:o.email||'',phone:o.phone||null,cargo:o.cargo||null,cnpj:o.cnpj||null,tipo_pessoa:o.tipo_pessoa||null,chave_pix:o.chave_pix||null,apelido:o.apelido||null,is_active:o.is_active!==false});
const TN_PLANO=o=>({plano:o.plano||'',plano_status:o.plano_status||'',data_expiracao:o.data_expiracao||'',max_conversas:o.max_conversas||0,conversas:o.conversas||0});
let tnPend=null,tnSnap=new Map(),tnOk=false;
async function carregarTenants(){
  const [p,a]=await Promise.all([sb.from('profiles').select('id,full_name,email,phone,cargo,cnpj,tipo_pessoa,chave_pix,apelido,is_active,created_at,deleted_at').neq('system_role','platform_admin').is('parent_user_id',null).order('created_at',{ascending:false}).limit(1000),
    sb.from('assinaturas_usuario').select('user_id,plano_nome,status,max_conversas,conversas_usadas,data_expiracao').limit(1000)]);
  if(p.error||a.error){falha('ler tenants',p.error||a.error);return;}
  tnPend=p.data.map(r=>{const s=a.data.find(x=>x.user_id===r.id);const exp=s&&s.data_expiracao?s.data_expiracao.slice(0,10):'';
    return {id:r.id,nome:r.full_name||r.email,email:r.email||'',phone:r.phone||'',cargo:r.cargo||'',cnpj:r.cnpj||'',tipo_pessoa:r.tipo_pessoa||'pf',chave_pix:r.chave_pix||'',apelido:r.apelido||'',is_active:r.is_active!==false,
      plano:s?(s.plano_nome||'—'):'—',plano_status:s?s.status:'',plano_expirado:!!(s&&(s.status!=='ativa'||(exp&&new Date(exp)<new Date()))),max_conversas:s?s.max_conversas||0:0,conversas:s?s.conversas_usadas||0:0,
      data_expiracao:exp,status:r.deleted_at?'excluido':(r.is_active===false?'inativo':'ativo'),created:(r.created_at||'').slice(0,10),apresentacao:false,excluido_em:r.deleted_at?r.deleted_at.slice(0,10):'',degustacao_ate:''};});
  tnOk=true;}
async function edge(nome,body,tentativa=1){const {data,error}=await sb.functions.invoke(nome,{body});
  // 546/5xx: a função estourou o tempo na primeira execução (fria) — tenta de novo
  if(error&&tentativa<3&&/non-2xx|546|50\d|Failed to fetch/i.test(error.message||'')){const st=error.context&&error.context.status;if(!st||st>=500){await new Promise(r=>setTimeout(r,2500*tentativa));return edge(nome,body,tentativa+1);}}
  if(error){let m=error.message;try{const t=await error.context.text();const j=JSON.parse(t);if(j&&j.error)m=j.error;}catch(e){}return {erro:m};}
  if(data&&data.error)return {erro:data.error};return {data};}
async function gravarPlano(id,o,antes){
  if(o.plano_status==='ativa'&&(o.plano!==antes.plano||o.data_expiracao!==antes.data_expiracao||o.max_conversas!==antes.max_conversas||antes.plano_status!=='ativa')){
    const {data:pl,error:e1}=await sb.from('loja_planos').select('id,nome,preco_mensal,max_conversas,max_ciclos_por_conversa,dias_expiracao,max_storage_mb').eq('nome',o.plano).limit(1).maybeSingle();
    if(e1||!pl){falha('plano "'+o.plano+'" não existe na loja',e1||'');return false;}
    const exp=o.data_expiracao?new Date(o.data_expiracao+'T23:59:00').toISOString():new Date(Date.now()+(pl.dias_expiracao||30)*DIA).toISOString();
    const {error}=await sb.from('assinaturas_usuario').upsert({user_id:id,plano_id:pl.id,plano_nome:pl.nome,status:'ativa',max_conversas:o.max_conversas||pl.max_conversas,max_ciclos_por_conversa:pl.max_ciclos_por_conversa,
      max_storage_bytes:(pl.max_storage_mb||0)*1048576,preco:pl.preco_mensal,conversas_usadas:0,data_inicio:new Date().toISOString(),data_expiracao:exp,observacao:'Ativado manualmente pelo admin'},{onConflict:'user_id'});
    if(error){falha('ativar plano',error);return false;}return true;}
  if(o.plano_status!==antes.plano_status&&o.plano_status!=='ativa'){const {error}=await sb.from('assinaturas_usuario').update({status:'cancelada'}).eq('user_id',id);if(error){falha('inativar plano',error);return false;}return true;}
  if(o.conversas===0&&antes.conversas!==0){const {error}=await sb.from('assinaturas_usuario').update({conversas_usadas:0,data_inicio:new Date().toISOString()}).eq('user_id',id);if(error){falha('zerar contador',error);return false;}}
  return true;}
async function sincronizarTenants(){const T=ctx.S.ten;if(!admin||!tnOk||!T||!Array.isArray(T.lista))return false;
  if(tnPend){T.lista.splice(0,T.lista.length,...tnPend);tnPend.forEach(o=>tnSnap.set(o.id,JSON.parse(json(o))));tnPend=null;return true;}
  for(const o of T.lista){if(emVoo.has(o))continue;const id=o._dbid||(ehUuid(o.id)?o.id:null);
    if(!id||!tnSnap.has(id)){ // novo tenant: cria login + perfil pela edge
      const senha=senhasNovas[(o.email||'').toLowerCase()];if(!senha||!o.email)continue;
      emVoo.add(o);const r=await edge('admin-ativar-cliente',{email:o.email,password:senha,full_name:o.nome,company_name:o.nome});emVoo.delete(o);
      if(r.erro){falha('criar tenant: '+r.erro,r.erro);delete senhasNovas[(o.email||'').toLowerCase()];continue;}
      delete senhasNovas[(o.email||'').toLowerCase()];o._dbid=r.data.user_id;
      const base={nome:o.nome,email:o.email,phone:'',cargo:'',cnpj:'',tipo_pessoa:'pf',chave_pix:'',apelido:'',is_active:true,plano:'—',plano_status:'',data_expiracao:'',max_conversas:0,conversas:0,excluido_em:''};
      tnSnap.set(o._dbid,base);}
    const dbid=o._dbid||o.id,antes=tnSnap.get(dbid);if(!antes)continue;
    const agora=JSON.parse(json(o)); // foto antes de gravar: mudanças feitas durante a gravação ficam para a próxima rodada
    const pf=TN_PERFIL(agora),pa=TN_PERFIL(antes);const mud={};Object.keys(pf).forEach(k=>{if(json(pf[k])!==json(pa[k]))mud[k]=pf[k];});
    if(Object.keys(mud).length){const {error}=await sb.from('profiles').update(mud).eq('id',dbid);if(error){falha('salvar tenant',error);continue;}}
    if(json(TN_PLANO(agora))!==json(TN_PLANO(antes))){if(!await gravarPlano(dbid,agora,antes))continue;}
    if((agora.excluido_em||'')!==(antes.excluido_em||'')){const r=await edge('admin-excluir-tenant',{tenant_id:dbid,acao:agora.excluido_em?'excluir':'restaurar'});if(r.erro){falha('excluir/restaurar: '+r.erro,r.erro);continue;}}
    tnSnap.set(dbid,agora);}
  return false;}

/* ----- Gestão (S.ges ↔ gestao_*): o estado usa os nomes reais das colunas. Ids nascem uuid na tela (gsUid/gxId)
   e vão no insert, então as referências entre tabelas valem dos dois lados. Apagar = deleted_at (não há DELETE).
   Só carrega para quem tem papel na Gestão (admin da plataforma ou gestao_acessos). ----- */
let gesOk=false;
const uuid4=()=>{try{if(crypto.randomUUID)return crypto.randomUUID();}catch(e){}const b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);};
const GES_REFS=['cliente_id','indicador_id','venda_id','impl_id','atend_id','reuniao_id','indicacao_id','vendedor_id','origem_id','chamado_id'];
// id que não é uuid (import estável, conteúdo antigo do navegador): vira uuid e o antigo fica em id_origem
function gesMigrarId(o){if(!o||ehUuid(o.id)||o._dbid)return;const G=ctx.S.ges,velho=o.id,novo=uuid4();o.id=novo;if(velho!=null&&o.id_origem==null)o.id_origem=String(velho);
  if(!G||velho==null)return;
  Object.keys(G).forEach(k=>{const L=G[k];if(Array.isArray(L))L.forEach(x=>{if(x&&typeof x==='object')GES_REFS.forEach(f=>{if(x[f]===velho)x[f]=novo;});});});
  if(G.indAberto===velho)G.indAberto=novo;const U=G.ui||{};['implAberto','progAberto','supAberto','chAberto'].forEach(k=>{if(U[k]===velho)U[k]=novo;});}
function colGes(nome,tabela,campo,cols,o){return Object.assign({nome,tabela,ges:true,soft:true,naoSemear:true,
  get:S=>S.ges&&S.ges._e1&&Array.isArray(S.ges[campo])?S.ges[campo]:null,
  filtro:q=>q.order('criado_em',{ascending:true}),
  antes:gesMigrarId,
  deDb:r=>Object.assign({},r),
  paraDb:x=>{const l={};if(ehUuid(x.id))l.id=x.id;for(const k of cols)if(k in x)l[k]=x[k]===''||x[k]===undefined?null:x[k];return l;},
  inserir:(x,ins)=>sb.from(tabela).upsert(ins,{onConflict:'id'}).select('id').single()},o||{});}
COLECOES.push(
  colGes('ges_clientes','gestao_clientes','clientes',['id_origem','profile_id','nome','email','telefone','fechamento','implementacao','setup','mensalidade','inicio_cobranca','situacao','suporte','implementador','obs','extras','link_drive','deleted_at']),
  colGes('ges_vendedores','gestao_vendedores','vendedores',['id_origem','nome','codigo','whatsapp','email','tipo','ativo','extras','deleted_at']),
  colGes('ges_indicadores','gestao_indicadores','indicadores',['id_origem','codigo','extras','deleted_at']),
  colGes('ges_vendas','gestao_vendas','vendas',['id_origem','vendedor_id','vendedor_nome','data_venda','plano','setup','cliente_id','cliente_nome','empresa','nicho','whatsapp','email','status','origem','obs','indicacao_id','comprovante','anexos','extras','deleted_at']),
  colGes('ges_indicacoes','gestao_indicacoes','indicacoes',['id_origem','indicador_id','referrer_name','referrer_code','lead_nome','lead_whatsapp','lead_email','empresa','nicho','melhor_horario','data_preferida','status','necessidade','obs','origem','responsavel','inicio','inicio_hora','iniciado_em','enviado_vendas_em','venda_id','tentativas','dias','data_indicacao','extras','deleted_at']),
  colGes('ges_parcelas','gestao_parcelas','parcelas',['id_origem','cliente_id','descricao','valor','vencimento','pago_em','extras','deleted_at']),
  colGes('ges_mensalidades','gestao_mensalidades','mensalidades',['id_origem','cliente_id','n','pago_em','valor_recebido','extras','deleted_at']),
  colGes('ges_funcionarios','gestao_funcionarios','funcionarios',['id_origem','nome','cargo','whatsapp','email','ativo','area','extras','deleted_at']),
  colGes('ges_impl','gestao_implementacoes','implementacoes',['id_origem','cliente_id','cliente_nome','venda_id','status','responsavel','programador','suporte_responsavel','enviado_em','inicio','inicio_hora','iniciado_em','concluido_em','enviado_prog_em','prog_iniciado_em','prog_concluido_em','prog_inicio','prog_inicio_hora','validacao_desde','validado_em','call_validacao','call_validacao_hora','ultima_volta','obs_final','suporte_auto','suporte_removido','oculto_prog','oculto_impl','tentativas','dias','retornos','extras','deleted_at']),
  colGes('ges_impl_reu','gestao_impl_reunioes','implReunioes',['id_origem','impl_id','area','cliente_id','data','hora','responsavel','tipo','status','resumo','motivo','remarcada_para','origem_id','extras','deleted_at']),
  colGes('ges_sup_atend','gestao_suporte_atend','suporteAtend',['id_origem','cliente_id','cliente_nome','impl_id','enviado_em','status','responsavel','suporte_responsavel','inicio','inicio_hora','concluido_em','obs_final','origem','tentativas','dias','retornos','extras','deleted_at']),
  colGes('ges_reunioes','gestao_reunioes','reunioes',['id_origem','cliente_id','atend_id','data','hora','responsavel','tipo','status','resumo','motivo','remarcada_para','origem_id','extras','deleted_at']),
  colGes('ges_tarefas','gestao_tarefas','tarefas',['id_origem','titulo','descricao','responsavel','prazo','prioridade','area','status','bloqueio','cliente_id','impl_id','reuniao_id','origem_key','concluido_em','extras','deleted_at']),
  colGes('ges_reu_equipe','gestao_reunioes_equipe','reunioesEquipe',['id_origem','titulo','tipo','data','hora','duracao','participantes','pauta','ata','status','motivo','extras','deleted_at']),
  // acessos: id = id do perfil; remover = deleted_at; voltar a dar acesso = upsert
  colGes('ges_acessos','gestao_acessos','acessos',['papeis','pessoa','extras','deleted_at'],{extraInsert:()=>({por_id:uid})}),
  colGes('ges_pedidos','gestao_acesso_pedidos','pedidos',['deleted_at'],{semInsert:true,filtro:q=>q.order('pedido_em',{ascending:true})}),
  // histórico de pagamentos: o gatilho do banco escreve; a tela só lê
  colGes('ges_paglog','gestao_pagamentos_log','paglog',[],{soft:false,semInsert:true,semDelete:true,antes:null,filtro:q=>q.order('em',{ascending:false}).limit(500),
    deDb:r=>Object.assign({},r,{por:r.por===uid?'você':(r.por?'alguém do time':null)}),atualizar:()=>({error:null})}));

/* chamados: só por RPC (abrir · mudar · registrar); a linha do tempo quem escreve é o banco */
const CH_CAMPOS=['status','responsavel','prioridade','categoria','causa','solucao','resultado'];
let chPend=null,chSnap=new Map(),evVistos=new Set(),chOk=false;
const chFoto=c=>{const o={};CH_CAMPOS.forEach(k=>{o[k]=c[k]==null||c[k]===''?null:c[k];});return o;};
async function lerChamados(){const [c,e]=await Promise.all([sb.from('gestao_chamados').select('*').is('deleted_at',null).order('numero').limit(2000),sb.from('gestao_chamado_eventos').select('*').order('aconteceu_em').limit(5000)]);
  if(c.error){falha('ler gestao_chamados',c.error);return null;}if(e.error)falha('ler gestao_chamado_eventos',e.error);return {ch:c.data,ev:e.error?[]:e.data};}
function guardarChamados(d){chSnap=new Map(d.ch.map(c=>[c.id,chFoto(c)]));evVistos=new Set(d.ev.map(x=>x.id));chOk=true;}
async function sincronizarChamados(){const G=ctx.S.ges;if(!gesOk||!chOk||chPend||!G||!G._e2||!Array.isArray(G.chamados))return false;
  let mexeu=false;const novos={};
  for(const c of G.chamados){if(!c||c.deleted_at||c._erro)continue;
    if(!chSnap.has(c.id)){if(c._dbid)continue;if(!ehUuid(c.cliente_id)){c._erro=true;continue;}
      const r=await sb.rpc('gestao_chamado_abrir',{p_cliente_id:c.cliente_id,p_titulo:c.titulo||'',p_relato:c.relato||'',p_canal:c.canal||'outro',p_relatado_por:c.relatado_por||null,p_categoria:c.categoria||'outro',p_prioridade:c.prioridade||'media',p_responsavel:c.responsavel||null,p_atend_id:ehUuid(c.atend_id)?c.atend_id:null});
      if(r.error){c._erro=true;falha('abrir chamado',r.error);continue;}c._dbid=r.data;novos[c.id]=r.data;mexeu=true;continue;}
    const f=chFoto(c),s=chSnap.get(c.id),mud={},motivo=c._motivo||null;delete c._motivo;
    CH_CAMPOS.forEach(k=>{if(f[k]!==s[k])mud[k]=f[k];});if(!Object.keys(mud).length)continue;
    // reabrir: o banco limpa causa/solução/resultado sozinho; só o status vai
    if((s.status==='resolvido'||s.status==='nao_resolvido')&&'status' in mud&&mud.status!=='resolvido'&&mud.status!=='nao_resolvido')Object.keys(mud).forEach(k=>{if(k!=='status')delete mud[k];});
    const r=await sb.rpc('gestao_chamado_mudar',{p_chamado:c.id,p_mudancas:mud,p_motivo:motivo});if(r.error)falha('mudar chamado',r.error);mexeu=true;}
  for(const ev of (G.chamadoEventos||[])){if(!ev||evVistos.has(ev.id)||ev._env||(ev.tipo!=='nota_interna'&&ev.tipo!=='contato_cliente'))continue;
    const cid=novos[ev.chamado_id]||ev.chamado_id;if(!chSnap.has(cid)&&!novos[ev.chamado_id])continue;ev._env=true;
    const r=await sb.rpc('gestao_chamado_registrar',{p_chamado:cid,p_tipo:ev.tipo,p_texto:ev.texto||'',p_aconteceu_em:ev.aconteceu_em||null});if(r.error)falha('registrar no chamado',r.error);mexeu=true;}
  if(!mexeu)return false;
  const d=await lerChamados();if(!d)return false;const U=G.ui||{};if(U.chAberto&&novos[U.chAberto])U.chAberto=novos[U.chAberto];
  G.chamados.splice(0,G.chamados.length,...d.ch);if(!Array.isArray(G.chamadoEventos))G.chamadoEventos=[];G.chamadoEventos.splice(0,G.chamadoEventos.length,...d.ev);guardarChamados(d);return true;}
/* config (equipe do suporte, rodízio): uma linha por chave */
let cfgPendG=null,cfgSnapG=null;
async function lerConfigGestao(){const {data,error}=await sb.from('gestao_config').select('chave,valor').is('deleted_at',null);if(error){falha('ler gestao_config',error);return;}
  const o={};data.forEach(r=>{o[r.chave]=r.valor;});cfgPendG=o;}
async function sincronizarConfigGestao(){const G=ctx.S.ges;if(!gesOk||!cfgSnapG||cfgPendG||!G||!G._e2||!G.config||typeof G.config!=='object')return;
  for(const k of Object.keys(G.config)){const v=G.config[k]==null?{}:G.config[k],j=json(v);if(cfgSnapG.get(k)===j)continue;
    const {error}=await sb.from('gestao_config').upsert({chave:k,valor:v,deleted_at:null},{onConflict:'chave'});if(error){falha('gravar gestao_config',error);continue;}cfgSnapG.set(k,j);}}
/* atividade babel: consumo real (tokens e leads) por cliente e mês */
let atvPend=null;
async function lerAtividade(){const fim=new Date(),ini=new Date(fim.getFullYear(),fim.getMonth()-17,1),m=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  const {data,error}=await sb.rpc('gestao_atividade_uso',{p_de:m(ini),p_ate:m(fim)});if(error){falha('ler atividade da gestão',error);return;}
  atvPend=(data||[]).map(r=>({cliente_id:r.cliente_id,mes:r.competencia,tokens:Number(r.tokens_final)||0,leads:Number(r.leads_final)||0}));}
/* nomes de quem tem acesso ou pediu (as tabelas só guardam o id do perfil) */
const perfisNomes=new Map();
async function lerNomesAcessos(){const [a,p]=await Promise.all([sb.from('gestao_acessos').select('id').is('deleted_at',null),sb.from('gestao_acesso_pedidos').select('id').is('deleted_at',null)]);
  const ids=[...new Set([].concat(a.data||[],p.data||[]).map(x=>x.id))];if(!ids.length)return;
  const {data,error}=await sb.rpc('gestao_perfis',{p_ids:ids});if(error){falha('ler nomes dos acessos',error);return;}(data||[]).forEach(r=>perfisNomes.set(r.id,r.nome||'Sem nome'));}
async function carregarGestao(){try{const r=await Promise.all([lerChamados(),lerConfigGestao(),lerAtividade(),lerNomesAcessos()]);if(r[0])chPend=r[0];}catch(e){falha('carregar gestão',e);}}
function aplicarGestao(){const G=ctx.S.ges;if(!gesOk||!G||!G._e2)return false;let mudou=false;
  if(chPend&&Array.isArray(G.chamados)){G.chamados.splice(0,G.chamados.length,...chPend.ch);if(!Array.isArray(G.chamadoEventos))G.chamadoEventos=[];G.chamadoEventos.splice(0,G.chamadoEventos.length,...chPend.ev);guardarChamados(chPend);chPend=null;mudou=true;}
  if(cfgPendG){G.config=Object.assign({},cfgPendG);cfgSnapG=new Map(Object.keys(cfgPendG).map(k=>[k,json(cfgPendG[k]==null?{}:cfgPendG[k])]));cfgPendG=null;mudou=true;}
  if(atvPend){G.atividade=atvPend;atvPend=null;mudou=true;}
  if(perfisNomes.size)[G.acessos,G.pedidos].forEach(L=>(L||[]).forEach(a=>{const n=perfisNomes.get(a&&a.id);if(n&&a._nome!==n){a._nome=n;mudou=true;}}));
  return mudou;}
// a tela da Gestão gera ids uuid (o banco usa uuid; o mesmo id vale aqui e lá)
function instalarIdsGestao(){try{window.__babelEval('gsUid=function(){return window.BabelBanco.uuid();}');}catch(e){falha('ids da gestão',e);}}
window.BabelGestao={async buscarPerfis(q){const {data,error}=await sb.rpc('gestao_buscar_perfis',{p_q:q});if(error)throw error;return (data||[]).map(r=>({id:r.id,nome:r.nome}));}};

/* ----- Produtos (S.prod): produtos · produto_conhecimento · produto_midias. Ids uuid nascem na tela e vão no insert.
   Depois de gravar, pede ao sincronizar-blocos para reindexar o agente (igual ao app antigo). ----- */
let prodSujo=false,prodIdsCache=null;const midUrl=new Map();
const PROD_COLS=['nome','slug','descricao_curta','palavras_chave','prazo_entrega','garantia','ativo','ordem','preco_centavos','entrada_centavos','max_parcelas','valor_parcela_cravado_centavos','parcelas_oferecidas'];
async function idsProdutos(){if(prodIdsCache)return prodIdsCache;const {data,error}=await sb.from('produtos').select('id').eq('user_id',uid);if(error)throw error;prodIdsCache=data.map(r=>r.id);return prodIdsCache;}
const marcaProd=r=>{if(!r.error)prodSujo=true;return r;};
const caminhoMidia=u=>{const m=String(u||'').match(/\/object\/public\/produto-midias\/(.+)$/);return m?decodeURIComponent(m[1].split('?')[0]):null;};
COLECOES.push(
  {nome:'prod_lista',tabela:'produtos',dono:'user_id',naoSemear:true,get:S=>S.prod&&S.prod.lista,
   filtro:q=>q.order('ordem',{ascending:true}),
   deDb:r=>{const o={id:r.id};PROD_COLS.forEach(k=>{o[k]=r[k];});return o;},
   paraDb:o=>{const l={};if(ehUuid(o.id))l.id=o.id;PROD_COLS.forEach(k=>{if(k in o)l[k]=o[k]===''?null:o[k];});if(!l.nome)l.nome='Novo produto';if(!(l.max_parcelas>=1))l.max_parcelas=1;return l;},
   depoisInserir:()=>{prodSujo=true;},
   atualizar:async(o,dbid,linha)=>marcaProd(await sb.from('produtos').update(linha).eq('id',dbid)),
   apagar:async id=>marcaProd(await sb.from('produtos').delete().eq('id',id))},
  {nome:'prod_con',tabela:'produto_conhecimento',naoSemear:true,get:S=>S.prod&&S.prod.con,
   ler:async()=>{const ids=await idsProdutos();if(!ids.length)return [];const {data,error}=await sb.from('produto_conhecimento').select('*').in('produto_id',ids).order('ordem');if(error)throw error;return data;},
   deDb:r=>({id:r.id,produto_id:r.produto_id,tipo:r.tipo||'conhecimento',titulo:r.titulo||'',conteudo:r.conteudo||'',ordem:r.ordem||0}),
   paraDb:o=>Object.assign(ehUuid(o.id)?{id:o.id}:{},{produto_id:o.produto_id,tipo:o.tipo||'conhecimento',titulo:o.titulo||'',conteudo:o.conteudo||'',ordem:Number(o.ordem)||0}),
   depoisInserir:()=>{prodSujo=true;},
   atualizar:async(o,dbid,linha)=>marcaProd(await sb.from('produto_conhecimento').update(linha).eq('id',dbid)),
   apagar:async id=>marcaProd(await sb.from('produto_conhecimento').delete().eq('id',id))},
  {nome:'prod_mid',tabela:'produto_midias',naoSemear:true,get:S=>S.prod&&S.prod.mid,
   ler:async()=>{const ids=await idsProdutos();if(!ids.length)return [];const {data,error}=await sb.from('produto_midias').select('*').in('produto_id',ids).order('ordem');if(error)throw error;return data;},
   deDb:r=>{midUrl.set(r.id,r.arquivo_url);return {id:r.id,produto_id:r.produto_id,arquivo_url:r.arquivo_url,arquivo_nome:r.arquivo_nome||'',arquivo_tipo:r.arquivo_tipo||'',descricao:r.descricao||'',ordem:r.ordem||0};},
   paraDb:o=>Object.assign(ehUuid(o.id)?{id:o.id}:{},{produto_id:o.produto_id,arquivo_url:o.arquivo_url,arquivo_nome:o.arquivo_nome||null,arquivo_tipo:o.arquivo_tipo||null,descricao:o.descricao||null,ordem:Number(o.ordem)||0}),
   depoisInserir:(o,id)=>{midUrl.set(id,o.arquivo_url);prodSujo=true;},
   atualizar:async(o,dbid,linha)=>marcaProd(await sb.from('produto_midias').update(linha).eq('id',dbid)),
   apagar:async id=>{const c=caminhoMidia(midUrl.get(id));if(c){const r=await sb.storage.from('produto-midias').remove([c]);if(r.error)console.warn('babel-banco: arquivo da mídia ficou no storage',r.error);}return marcaProd(await sb.from('produto_midias').delete().eq('id',id));}});
async function subirMidiaProduto(file,produtoId){const ext=(String(file.name||'').split('.').pop()||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,6)||'bin';
  const path=uid+'/'+produtoId+'/'+Date.now()+'.'+ext,{error}=await sb.storage.from('produto-midias').upload(path,file,{contentType:file.type||undefined,upsert:false});
  if(error){falha('enviar mídia do produto',error);throw error;}return sb.storage.from('produto-midias').getPublicUrl(path).data.publicUrl;}
async function reindexarAgente(){if(!prodSujo)return;prodSujo=false;
  try{const {data}=await sb.from('agentes_usuario').select('id').eq('user_id',uid).limit(1);const id=data&&data[0]&&data[0].id;if(id){const r=await sb.functions.invoke('sincronizar-blocos',{body:{agente_id:id}});if(r.error)console.warn('babel-banco: reindexar agente',r.error);}}
  catch(e){console.warn('babel-banco: reindexar agente',e);}}

/* ----- telas do admin: quem não é admin da plataforma não vê nem abre (Gestão fica para quem tem papel nela) ----- */
const TELAS_ADMIN=['nichos','lojaadm','appsadm','juradm','gestao','curadoria','dash','reunadm','apar','cargos','controle','finadm','socioadm','consadm','tenants'];
function ajustarNavPorPapel(){if(admin)return;let NAV,V;try{NAV=window.__babelEval('NAV');V=window.__babelEval('V');}catch(e){return;}
  const fora=TELAS_ADMIN.filter(t=>!(t==='gestao'&&gesOk));
  for(let i=NAV.length-1;i>=0;i--)if(fora.indexOf(NAV[i][0])>=0)NAV.splice(i,1);
  fora.forEach(t=>{V[t]=()=>'<div class="pg"><div class="tile" style="padding:40px;text-align:center;margin-top:20px"><h3>Área do administrador</h3><p class="sub">Esta tela é só para a equipe da plataforma.</p><div class="acts" style="justify-content:center;margin-top:12px"><button class="btn pri sm" data-go="inicio">Voltar ao início</button></div></div></div>';});
  if(fora.indexOf(ctx.S.view)>=0)ctx.S.view='inicio';}

/* ----- LGPD: exportar os dados da conta e pedir a exclusão (RPCs do banco) ----- */
async function exportarDados(){try{const {data,error}=await sb.rpc('exportar_meus_dados');if(error)throw error;
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='babel-meus-dados.json';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},1000);return true;}
  catch(e){falha('exportar dados',e);return false;}}
async function pedirExclusao(){const {error}=await sb.rpc('solicitar_exclusao_conta');if(error){falha('pedir exclusão da conta',error);return false;}return true;}

/* ----- Loja Babel (S.lojab): plano do dono (assinaturas_usuario), pacotes/plus/implantação ativos, PIX da plataforma,
   catálogo de aplicativos (RPC apps_visiveis_para_tenant) e instalados (aplicativos_instalados). Pedido = comprovante no
   bucket comprovantes + RPC criar_pedido_loja. App do catálogo só aparece no dock depois de instalado (igual ao app antigo). ----- */
let lbPend=null,navBase=null;
async function idDono(){const p=await sb.from('profiles').select('parent_user_id').eq('id',uid).maybeSingle();return (p.data&&p.data.parent_user_id)||uid;}
async function carregarLojaBabel(){try{const dono=await idDono();
  const [pl,pe,pu,im,cf,ap]=await Promise.all([
    sb.from('assinaturas_usuario').select('plano_nome,status,max_conversas,conversas_usadas,data_expiracao').eq('user_id',dono).eq('status','ativa').order('created_at',{ascending:false}).limit(1),
    sb.from('loja_pacotes_extra').select('id,nome,conversas,descricao').eq('is_active',true).order('preco'),
    sb.from('loja_plus').select('id,nome,descricao').eq('is_active',true).order('preco'),
    sb.from('loja_implantacao').select('id,nome,descricao').eq('is_active',true).order('preco'),
    sb.from('config_plataforma').select('pix_key').limit(1),
    sb.rpc('apps_visiveis_para_tenant')]);
  [['plano',pl],['pacotes',pe],['plus',pu],['implantação',im],['aplicativos',ap]].forEach(([n,r])=>{if(r.error)falha('ler loja · '+n,r.error);});
  lbPend={plano:(pl.data||[])[0]||null,pacotes:pe.data||[],plus:pu.data||[],impl:im.data||[],pix:(((cf.data||[])[0])||{}).pix_key||'',
    apps:(ap.data||[]).filter(a=>a.is_active!==false).sort((a,b)=>(a.ordem||0)-(b.ordem||0)).map(a=>({id:a.id,slug:a.slug,nome:a.nome,descricao:a.descricao||'',categoria:a.categoria||''}))};}
  catch(e){falha('carregar loja babel',e);}}
function aplicarLojaBabel(){const L=ctx.S.lojab;if(!L||!lbPend)return false;Object.assign(L,lbPend);lbPend=null;return true;}
COLECOES.push({nome:'lb_instalados',tabela:'aplicativos_instalados',dono:'user_id',naoSemear:true,get:S=>S.lojab&&S.lojab.instalados,
  deDb:r=>({id:r.id,aplicativo_id:r.aplicativo_id,aplicativo_slug:r.aplicativo_slug}),
  paraDb:o=>Object.assign(ehUuid(o.id)?{id:o.id}:{},{aplicativo_id:o.aplicativo_id,aplicativo_slug:o.aplicativo_slug})});
// dock: tira os aplicativos do catálogo que a pessoa não instalou (os "core", fora do catálogo, ficam sempre)
function ajustarAppsNoDock(){if(admin)return false;const L=ctx.S.lojab;if(!L||!Array.isArray(L.apps)||!L.apps.length)return false;let NAV;try{NAV=window.__babelEval('NAV');}catch(e){return false;}
  if(!navBase)navBase=NAV.slice();const inst=new Set((L.instalados||[]).map(i=>i.aplicativo_slug)),cat=new Set(L.apps.map(a=>a.slug));
  const novo=navBase.filter(x=>!cat.has(x[0])||inst.has(x[0]));if(novo.length===NAV.length&&novo.every((x,i)=>x===NAV[i]))return false;NAV.splice(0,NAV.length,...novo);return true;}
async function pedirCompraLoja(tipo,itemId,file){const ext=(String(file.name||'').split('.').pop()||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'bin';
  const caminho=uid+'/'+Date.now()+'.'+ext,up=await sb.storage.from('comprovantes').upload(caminho,file,{contentType:file.type||undefined,upsert:false});
  if(up.error){falha('enviar comprovante',up.error);throw up.error;}
  const {data,error}=await sb.rpc('criar_pedido_loja',{p_tipo:tipo,p_item_id:itemId,p_comprovante_url:caminho});if(error){falha('criar pedido da loja',error);throw error;}return data;}

/* ----- Chat Treino: conversa de teste (channel 'teste' + lead de teste) com o agente do tenant pelo motor em modo_teste
   (não dispara Z-API); correções em chat_treino_correcoes; Mentor de Humanização pelo edge chat-treino-analisar. ----- */
let trAgente=null;
const erroEdge=async(error)=>{let m=error&&error.message;try{const j=await error.context.json();if(j&&j.error)m=j.error;}catch(e){}return new Error(m||'erro no servidor');};
window.BabelTreino={
  async agente(){if(trAgente)return trAgente;const {data,error}=await sb.from('agentes_usuario').select('id,nome_agente,is_active').eq('user_id',uid).order('is_active',{ascending:false}).order('updated_at',{ascending:false}).limit(1);
    if(error)throw error;trAgente=(data||[])[0]||null;return trAgente;},
  async novaSessao(produtoId){const ag=await this.agente();if(!ag)throw new Error('sem agente');const phone='__chat_teste_'+uid.slice(0,8)+'_'+Date.now()+'__';
    const l=await sb.from('leads').insert({tenant_id:uid,agente_id:ag.id,phone,name:'Lead de Teste',nome_exibicao:'Lead de Teste',dados_ficha:{},tags:['lead_de_teste']}).select('id').single();if(l.error)throw l.error;
    const c=await sb.from('conversas').insert({tenant_id:uid,agente_id:ag.id,phone,channel:'teste',status:'ativa',agent_enabled:true,lead_id:l.data.id,produto_foco_id:ehUuid(produtoId)?produtoId:null}).select('id').single();if(c.error)throw c.error;
    return {conversa_id:c.data.id,lead_id:l.data.id};},
  async enviar(conversaId,texto){const ag=await this.agente();if(!ag)throw new Error('sem agente');
    const {data,error}=await sb.functions.invoke('ragentic-processar-inline',{body:{agente_id:ag.id,phone:'__chat_teste__',message:texto,conversation_id:conversaId,modo_teste:true}});
    if(error)throw await erroEdge(error);if(data&&data.error)throw new Error(data.error);
    const brutas=Array.isArray(data&&data.mensagens)&&data.mensagens.length?data.mensagens:(data&&data.reply?[data.reply]:[]);
    return {bolhas:brutas.map(b=>typeof b==='string'?b:(b&&(b.texto||b.content||b.text))||'').filter(Boolean),trace:(data&&data.trace)||{}};},
  async focar(conversaId,produtoId){const {error}=await sb.from('conversas').update({produto_foco_id:ehUuid(produtoId)?produtoId:null}).eq('id',conversaId);if(error)throw error;},
  async corrigir(conversaId,textoOriginal,textoCorrigido,sugestao){
    const m=await sb.from('mensagens').select('id').eq('conversation_id',conversaId).in('role',['assistant','human']).eq('content',textoOriginal).is('deleted_at',null).order('created_at',{ascending:false}).limit(1);
    const mid=m.data&&m.data[0]&&m.data[0].id;if(!mid)throw new Error('não achei esta resposta no banco');
    if(!textoCorrigido&&!sugestao){const {error}=await sb.from('chat_treino_correcoes').delete().eq('mensagem_id',mid);if(error)throw error;return;}
    const dono=await idDono();
    const {error}=await sb.from('chat_treino_correcoes').upsert({tenant_id:dono,conversa_id:conversaId,mensagem_id:mid,texto_original:textoOriginal,texto_corrigido:textoCorrigido||null,sugestao:sugestao||null,criado_por:uid,updated_at:new Date().toISOString()},{onConflict:'mensagem_id'});
    if(error)throw error;},
  async analisar(conversaId){const {data,error}=await sb.functions.invoke('chat-treino-analisar',{body:{conversa_id:conversaId}});if(error)throw await erroEdge(error);if(!data||data.error)throw new Error((data&&data.error)||'análise sem resposta');return data;},
  async sessoes(){const ag=await this.agente();if(!ag)return [];
    const {data,error}=await sb.from('conversas').select('id,updated_at').eq('agente_id',ag.id).eq('channel','teste').neq('status','encerrada').order('updated_at',{ascending:false}).limit(20);if(error)throw error;
    const ids=(data||[]).map(c=>c.id),ult={};
    if(ids.length){const m=await sb.from('mensagens').select('conversation_id,content,role,created_at').in('conversation_id',ids).eq('role','user').is('deleted_at',null).order('created_at',{ascending:false}).limit(200);
      (m.data||[]).forEach(x=>{if(!ult[x.conversation_id])ult[x.conversation_id]=String(x.content||'').slice(0,80);});}
    return (data||[]).filter(c=>ult[c.id]).map(c=>({id:c.id,updated_at:c.updated_at,preview:ult[c.id]}));},
  async abrir(conversaId){const [m,c,k]=await Promise.all([
      sb.from('mensagens').select('role,content,created_at').eq('conversation_id',conversaId).is('deleted_at',null).order('created_at',{ascending:true}).limit(200),
      sb.from('conversas').select('lead_id,produto_foco_id').eq('id',conversaId).maybeSingle(),
      sb.from('chat_treino_correcoes').select('texto_original,texto_corrigido,sugestao').eq('conversa_id',conversaId)]);
    if(m.error)throw m.error;const corr={};(k.data||[]).forEach(x=>{corr[x.texto_original]={texto_corrigido:x.texto_corrigido,sugestao:x.sugestao};});
    const msgs=(m.data||[]).filter(x=>x.role==='user'||x.role==='assistant'||x.role==='human').map(x=>x.role==='user'?{k:'eu',t:x.content||''}:{k:'ag',t:x.content||'',corr:corr[x.content]||null});
    return {msgs,lead_id:c.data&&c.data.lead_id,produto_foco_id:c.data&&c.data.produto_foco_id};},
  async apagar(conversaId,leadId){const agora=new Date().toISOString();
    const a=await sb.from('conversas').update({status:'encerrada'}).eq('id',conversaId);if(a.error)throw a.error;
    await sb.from('mensagens').update({deleted_at:agora}).eq('conversation_id',conversaId).is('deleted_at',null);
    if(ehUuid(leadId))await sb.from('leads').update({deleted_at:agora}).eq('id',leadId);}
};

/* ----- Cargos do agente (S.cargag): RPC cargos_visiveis_tenant (globais + nicho + do tenant; só os do tenant gravam),
   catálogo ferramentas_dinamicas e vínculos cargo_ferramentas (chave dupla, sincronizado à parte). ----- */
const agcCampos=cr=>(Array.isArray(cr)?cr:[]).map(c=>typeof c==='string'?{chave:c,descricao:'',obrigatorio:false}:{chave:(c&&(c.chave||c.nome))||'',descricao:(c&&c.descricao)||'',obrigatorio:!!(c&&c.obrigatorio)});
COLECOES.push({nome:'agc_cargos',tabela:'cargos',naoSemear:true,semDelete:true,get:S=>S.cargag&&S.cargag.lista,
  ler:async()=>{const {data,error}=await sb.rpc('cargos_visiveis_tenant',{p_incluir_inativos:true});if(error)throw error;return (data||[]).filter(c=>c.tipologia!=='mentor');},
  deDb:r=>({id:r.id,nome:r.nome||'',tipologia:r.tipologia||'atendimento',escopo:r.escopo||'tenant',ativo:r.ativo!==false,ordem:r.ordem||0,canal_atuacao:r.canal_atuacao||'ambos',objetivo_principal:r.objetivo_principal||'',regras_livres:r.regras_livres||'',campos_rastreio:agcCampos(r.campos_rastreio),tenant_id:r.tenant_id||null}),
  paraDb:o=>Object.assign(ehUuid(o.id)?{id:o.id}:{},{nome:o.nome||'Novo cargo',ativo:o.ativo!==false,ordem:Number(o.ordem)||0,canal_atuacao:o.canal_atuacao||'ambos',objetivo_principal:o.objetivo_principal||'',regras_livres:o.regras_livres||'',campos_rastreio:o.campos_rastreio||[]}),
  extraInsert:()=>({tipologia:'atendimento',escopo:'tenant',tenant_id:uid}),
  atualizar:async(o,dbid,linha)=>o.escopo==='tenant'?sb.from('cargos').update(linha).eq('id',dbid):{error:null}});
let agcFerrPend=null,agcLinksPend=null,agcLinksSnap=null;
async function carregarCargosAgente(){try{const [f,l]=await Promise.all([
    sb.from('ferramentas_dinamicas').select('id,nome_tool,descricao,escopo,precisa_aprovacao,tenant_id').eq('ativo',true).or('tenant_id.is.null,tenant_id.eq.'+uid).order('nome_tool'),
    sb.from('cargo_ferramentas').select('cargo_id,ferramenta_id,ordem,obrigatoria')]);
  if(f.error)falha('ler ferramentas',f.error);else agcFerrPend=f.data||[];
  if(l.error)falha('ler ferramentas dos cargos',l.error);else agcLinksPend=l.data||[];}catch(e){falha('carregar cargos do agente',e);}}
function aplicarCargosAgente(){const C=ctx.S.cargag;if(!C)return false;let m=false;
  if(agcFerrPend){C.ferr=agcFerrPend;agcFerrPend=null;m=true;}
  if(agcLinksPend){C.links=agcLinksPend.map(x=>({cargo_id:x.cargo_id,ferramenta_id:x.ferramenta_id,ordem:x.ordem||0,obrigatoria:!!x.obrigatoria}));agcLinksSnap=new Set(C.links.map(x=>x.cargo_id+'|'+x.ferramenta_id));agcLinksPend=null;m=true;}
  return m;}
async function sincronizarLinksCargos(){const C=ctx.S.cargag;if(!C||!agcLinksSnap||agcLinksPend||!Array.isArray(C.links))return;
  const agora=new Set(C.links.map(x=>x.cargo_id+'|'+x.ferramenta_id));
  for(const x of C.links){const k=x.cargo_id+'|'+x.ferramenta_id;if(agcLinksSnap.has(k)||!ehUuid(x.cargo_id)||!ehUuid(x.ferramenta_id))continue;
    const {error}=await sb.from('cargo_ferramentas').insert({cargo_id:x.cargo_id,ferramenta_id:x.ferramenta_id,ordem:x.ordem||0,obrigatoria:!!x.obrigatoria});if(error){falha('ligar ferramenta ao cargo',error);continue;}agcLinksSnap.add(k);}
  for(const k of [...agcLinksSnap]){if(agora.has(k))continue;const [c,f]=k.split('|');const {error}=await sb.from('cargo_ferramentas').delete().eq('cargo_id',c).eq('ferramenta_id',f);if(error){falha('desligar ferramenta do cargo',error);continue;}agcLinksSnap.delete(k);}}

/* ----- estado da sincronização ----- */
let sb,ctx,uid,admin=false,LOCAL=false;
const snap={},pend={},carregado={},emVoo=new Set();
let timer=null,fila=Promise.resolve(),erros=0,interno=false;
function status(t,ruim){const el=document.getElementById('babelSync');if(el){el.textContent=t;el.style.color=ruim?'#ff6d7a':'#7fa8dc';}}
function falha(onde,e){erros++;console.error('babel-banco',onde,e);status('erro ao gravar · '+onde,true);}
const json=o=>JSON.stringify(o);

async function carregarColecao(c){try{await carregarColecao0(c);}catch(e){falha('carregar '+(c.tabela||c.nome),e);}}
async function carregarColecao0(c){
  if(c.ler){try{const rows=await c.ler();pend[c.nome]=rows.map(c.deDb);snap[c.nome]=new Map(rows.map(r=>{const o=c.deDb(r);return [o.id,json(c.paraDb(o))];}));carregado[c.nome]=true;}catch(e){falha('ler '+c.nome,e);}return;}
  let q=sb.from(c.tabela).select(c.select||'*');
  if(c.filtro)q=c.filtro(q);
  if(c.dono)q=q.eq(c.dono,uid);
  if(c.soft)q=q.is('deleted_at',null);
  const {data,error}=await q.limit(1000);
  if(error){falha('ler '+c.tabela,error);return;}
  pend[c.nome]=data.map(c.deDb);
  snap[c.nome]=new Map(data.map(r=>{const o=c.deDb(r);return [o.id,json(c.paraDb(o))];}));
  carregado[c.nome]=true;
}
// aplica o que veio do banco quando a tela já criou o seu contêiner (as telas inicializam sob demanda)
function aplicarPendentes(){let mudou=false;
  for(const c of COLECOES){const arr=c.get(ctx.S);if(!arr||!pend[c.nome])continue;const vindo=pend[c.nome];delete pend[c.nome];
    if(vindo.length||!LOCAL||c.naoSemear){arr.splice(0,arr.length,...vindo);mudou=true;}
    // banco local vazio: mantém o exemplo da tela, que será gravado no próximo sincronizar()
  }
  return mudou;}

async function sincronizarColecao(c){
  if(!carregado[c.nome]||pend[c.nome])return;
  const arr=c.get(ctx.S);if(!arr)return;
  if(c.admin&&!admin)return;
  if(c.ges&&!gesOk)return;
  const S0=snap[c.nome];const vistos=new Set();
  for(const o of arr){
    if(!o||emVoo.has(o))continue;
    if(c.antes){try{await c.antes(o);}catch(e){falha('preparar '+c.nome,e);continue;}}
    const linha=c.paraDb(o);
    // id do banco fica em o._dbid (o id local da tela não muda, então o DOM nunca fica com id velho)
    const dbid=o._dbid||(ehUuid(o.id)||c.chave?o.id:null);
    if(!dbid||!S0.has(dbid)){ // novo, ou id de um banco antigo guardado no localStorage
      if(c.semInsert)continue;
      emVoo.add(o);
      const ins=Object.assign({},linha,c.extraInsert?c.extraInsert(o,linha):{});if(c.dono)ins[c.dono]=uid;
      const {data,error}=c.inserir?await c.inserir(o,ins):await sb.from(c.tabela).insert(ins).select('id').single();
      emVoo.delete(o);
      if(error){falha('inserir em '+c.tabela,error);continue;}
      o._dbid=data.id;if(c.depoisInserir){try{await c.depoisInserir(o,data.id);}catch(e){falha('após inserir '+c.nome,e);}}
      S0.set(data.id,json(linha));vistos.add(data.id);continue;
    }
    vistos.add(dbid);
    const j=json(linha);
    if(S0.get(dbid)!==j){
      const {error}=c.atualizar?await c.atualizar(o,dbid,linha,JSON.parse(S0.get(dbid)||'{}')):await sb.from(c.tabela).update(linha).eq(c.chave||'id',dbid);
      if(error){falha('atualizar '+c.tabela,error);continue;}
      S0.set(dbid,j);
    }
  }
  if(c.semDelete)return;
  for(const id of [...S0.keys()]){if(vistos.has(id))continue;
    const r=c.apagar?await c.apagar(id):c.soft?await sb.from(c.tabela).update({deleted_at:new Date().toISOString()}).eq('id',id):await sb.from(c.tabela).delete().eq('id',id);
    if(r.error){falha('apagar em '+c.tabela,r.error);continue;}
    S0.delete(id);}
}

/* empresa: objeto único por usuário */
const EMP_CAMPOS=['nome','cnpj','descricao','data_inicio','tipo_presenca','endereco','bairro','cep','cidade','estado','whatsapp','site','instagram','facebook','tiktok','youtube','missao','valores','logo_url','banner_url'];
let empSnap=null,empId=null,empPend=null,empOk=false;
const empLinha=E=>{const r={};EMP_CAMPOS.forEach(k=>{let v=E[k];if(k==='data_inicio')v=v||null;else if(k==='tipo_presenca')v=['fisica','digital','ambos'].includes(v)?v:'digital';else v=v==null?'':String(v);
  if((k==='logo_url'||k==='banner_url')&&String(v).startsWith('data:'))v='';r[k]=v;});if(!r.nome)r.nome='Minha empresa';return r;};
async function carregarEmpresa(){const {data,error}=await sb.from('empresas').select('*').eq('user_id',uid).limit(1);
  if(error){falha('ler empresas',error);return;}empOk=true;
  if(data[0]){empId=data[0].id;empPend=data[0];empSnap=json(empLinha(data[0]));}}
async function sincronizarEmpresa(){const E=ctx.S.empresa;if(!empOk||!E)return;
  if(empPend){EMP_CAMPOS.forEach(k=>{if(empPend[k]!=null)E[k]=empPend[k];});empPend=null;return 'mudou';}
  const linha=empLinha(E),j=json(linha);if(j===empSnap)return;
  const r=empId?await sb.from('empresas').update(linha).eq('id',empId):await sb.from('empresas').insert(Object.assign({user_id:uid},linha)).select('id').single();
  if(r.error){falha('gravar empresas',r.error);return;}if(!empId)empId=r.data.id;empSnap=j;}

/* agenda: cancelamentos ficam em S.evOff */
let evOffSnap=null;
async function sincronizarAgenda(){const off=(ctx.S.evOff||[]).filter(ehUuid);
  if(evOffSnap===null){evOffSnap=new Set(off);return;}
  for(const id of off)if(!evOffSnap.has(id)){const {error}=await sb.from('eventos_agenda').update({status:'cancelado'}).eq('id',id);if(error)falha('cancelar evento',error);else evOffSnap.add(id);}
  for(const id of [...evOffSnap])if(!off.includes(id)){const {error}=await sb.from('eventos_agenda').update({status:'pendente'}).eq('id',id);if(error)falha('reabrir evento',error);else evOffSnap.delete(id);}}

function sincronizar(){clearTimeout(timer);timer=setTimeout(()=>{fila=fila.then(async()=>{
  status('salvando…');const e0=erros;let mudou=aplicarPendentes();if(aplicarExtras())mudou=true;if(aplicarGestao())mudou=true;if(aplicarLojaBabel())mudou=true;if(aplicarCargosAgente())mudou=true;
  for(const c of COLECOES)await sincronizarColecao(c);
  if(await sincronizarEmpresa()==='mudou')mudou=true;
  await sincronizarAgenda();
  await sincronizarConfigApi();
  for(const u of UNICOS)if(await sincronizarUnico(u))mudou=true;
  await sincronizarVinculos();
  await sincronizarInteresses();
  await sincronizarCobrancas();
  if(await sincronizarSocio())mudou=true;
  if(aplicarConsulta())mudou=true;
  if(aplicarReuniao())mudou=true;
  if(await sincronizarAgente())mudou=true;
  if(await sincronizarCampanha())mudou=true;
  if(await sincronizarTenants())mudou=true;
  await sincronizarCanais();
  if(await sincronizarPacotes())mudou=true;
  if(await sincronizarCuradoriaTenant())mudou=true;
  if(await sincronizarEmocoes())mudou=true;
  await sincronizarConfigGestao();
  if(await sincronizarChamados())mudou=true;
  await reindexarAgente();
  await sincronizarLinksCargos();
  if(ajustarAppsNoDock())mudou=true;
  if(erros===e0)status('salvo no banco ✓');
  interno=true;try{ctx.save();}finally{interno=false;}if(mudou)setTimeout(()=>ctx.render(),0);
}).catch(e=>falha('sincronizar',e));},500);}

/* ----- conversas e agenda: interceptar push ----- */
function horaParaData(day,h){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+(Number(day)||0));d.setMinutes(Math.round((Number(h)||9)*60));return d;}
function ligarMsgs(c){if(!c||!c.msgs||c.msgs.__babel)return;const orig=c.msgs.push;
  Object.defineProperty(c.msgs,'__babel',{value:true});
  c.msgs.push=function(...ms){const r=orig.apply(this,ms);
    ms.forEach(m=>{const k=Array.isArray(m)?m[0]:m.k,t=Array.isArray(m)?m[1]:m.t;if(k!=='you'||!t)return;
      fila=fila.then(async()=>{if(!c.uuid){await criarConversa(c);if(!c.uuid)return;}
        const {error}=await sb.from('mensagens').insert({conversation_id:c.uuid,role:'human',content:String(t),sender_id:uid});
        if(error)falha('gravar mensagem',error);else status('salvo no banco ✓');});});
    return r;};}
async function criarConversa(c){const nome=(c.ficha&&c.ficha.nome)||String(c.who||'Contato').split(' · ')[0];
  const l=await sb.from('leads').insert({tenant_id:uid,name:nome,canal_externo:c.canal||'WhatsApp',location:'atendimento'}).select('id').single();
  if(l.error){falha('criar lead',l.error);return;}
  const v=await sb.from('conversas').insert({tenant_id:uid,lead_id:l.data.id,channel:String(c.canal||'whatsapp').toLowerCase(),status:'ativa',titulo:c.sub||'conversa nova'}).select('id').single();
  if(v.error){falha('criar conversa',v.error);return;}c.uuid=v.data.id;}
function ligarCore(){
  ctx.CONVS.forEach(ligarMsgs);
  const cp=ctx.CONVS.push;ctx.CONVS.push=function(...cs){const r=cp.apply(this,cs);cs.forEach(c=>{ligarMsgs(c);fila=fila.then(()=>criarConversa(c));});return r;};
  const ep=ctx.EVENTS.push;ctx.EVENTS.push=function(...es){const r=ep.apply(this,es);
    es.forEach(e=>{if(ehUuid(e.id))return;fila=fila.then(async()=>{const ini=horaParaData(e.day,e.h),fim=new Date(ini.getTime()+(Number(e.d)||30)*6e4);
      const {data,error}=await sb.from('eventos_agenda').insert({tenant_id:uid,criado_por:uid,titulo:String(e.t||'Compromisso').slice(0,200),descricao:e.s||'',tipo:'compromisso',inicio_em:ini.toISOString(),fim_em:fim.toISOString(),status:'pendente',origem:'manual'}).select('id').single();
      if(error){falha('gravar evento',error);return;}
      const velho=e.id;e.id=data.id;if(ctx.S.evOff)ctx.S.evOff=ctx.S.evOff.map(x=>x===velho?data.id:x);status('salvo no banco ✓');interno=true;try{ctx.save();}finally{interno=false;}});});
    return r;};
}

window.BabelBanco={
  // chamado pelo app.html depois do login, antes de abrir o app
  async preparar(cliente){sb=cliente;LOCAL=/127\.0\.0\.1|localhost/.test(sb.supabaseUrl||location.hostname);
    const {data:{user}}=await sb.auth.getUser();uid=user.id;
    const p=await sb.from('profiles').select('system_role').eq('id',uid).single();
    admin=!p.error&&['platform_admin','admin','super_admin'].includes(p.data.system_role);
    window.BabelRPC=(fn,args)=>sb.rpc(fn,args);
    gesOk=admin;if(!admin){try{const g=await sb.rpc('gestao_tem_algum_papel');gesOk=!g.error&&g.data===true;}catch(e){}}
    await Promise.all(COLECOES.filter(c=>c.ges?gesOk:(!c.admin||admin||!c.naoSemear)).map(carregarColecao).concat([carregarEmpresa(),carregarFinanceiro(),carregarSocio(),carregarConsulta(),carregarReuniao(),carregarAgente(),carregarCampanhaExtras(),carregarLojaBabel(),carregarCargosAgente()],gesOk?[carregarGestao()]:[],UNICOS.filter(u=>!u.admin||admin).map(carregarUnico),admin?[carregarTenants(),carregarEmocoes(),carregarCanais(),carregarPacotes()]:[],
      admin?EXTRAS.map(x=>x.ler().then(d=>extraPend.set(x,d)).catch(e=>falha('ler apoio',e))):[],
      admin?FONTES.map(f=>f.ler().then(d=>fonteDados.set(f,d)).catch(e=>falha('ler painel',e))):[]));},
  // chamado pelo gancho dentro do babel-os.html
  ligar(c){ctx=c;instalarIdsGestao();try{if(!c.S.prod)window.__babelEval('pdInit')();if(!c.S.lojab)window.__babelEval('lbInit')();}catch(e){console.error('iniciar produtos/loja',e);}try{ajustarNavPorPapel();}catch(e){console.error('nav por papel',e);}try{ligarCerebroComLogin();}catch(e){console.error('cérebro com login',e);}try{instalarOuvido();ouvirAjustes();}catch(e){console.error('ouvido do mentor',e);}try{ajustarServidoresLocais();}catch(e){}try{setTimeout(ligarTempoReal,1500);}catch(e){}try{instalarSeriesDashboard();}catch(e){}ouvirCriacaoTenant();ouvirRecargaConsulta();ouvirConviteEquipe();ouvirTenantsExtras();try{aplicarFontes();}catch(e){falha('fontes',e);}try{aplicarFinanceiro();ligarContratos();}catch(e){falha('financeiro',e);}try{aplicarDuvidas();}catch(e){}ligarCore();aplicarPendentes();sincronizar();},
  aoSalvar(){if(ctx&&!interno)sincronizar();},
  get admin(){return admin;},
  get gestao(){return gesOk;},
  uuid:uuid4,
  subirMidiaProduto,
  pedirCompraLoja,
  atualizarDock(){try{if(ajustarAppsNoDock())window.__babelEval('renderNav')();}catch(e){}},
  exportarDados,
  pedirExclusao
};
})();
