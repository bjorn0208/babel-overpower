"""Teste de gravação no banco das telas do lote C2 (admin: financeiro, sócio, consulta).
Uso: python3 backend/local/testes/teste-banco-c2.py  (precisa de pedido/saque/recarga pendentes — ver bloco SEED)"""
import subprocess, time
from playwright.sync_api import sync_playwright
DB='supabase_db_sistemababel-local'
def sql(q): return subprocess.run(['docker','exec',DB,'psql','-U','postgres','-d','postgres','-Atc',q],capture_output=True,text=True).stdout.strip()
res,errs=[],[]
def chk(n,c): res.append(c); print(('PASS ' if c else 'FAIL ')+n)
def espera(q,alvo,t=10):
    fim=time.time()+t
    while time.time()<fim:
        if sql(q)==alvo: return True
        time.sleep(0.5)
    print('   obtido:',sql(q)); return False
# SEED: um pedido, um saque e uma recarga pendentes do usuario@babel.local
sql("""with u as (select id from auth.users where email='usuario@babel.local'), pl as (select id,nome,preco_mensal from loja_planos order by ordem limit 1)
insert into pedidos_compra(user_id,tipo,item_id,item_nome,item_preco,status) select u.id,'plano',pl.id,'Pedido Prova',pl.preco_mensal,'pendente' from u,pl;
with u as (select id from auth.users where email='usuario@babel.local') insert into multinivel_saques(user_id,valor,metodo,chave_pix,status) select id,77,'pix','prova@ex.com','pendente' from u;
insert into consultas_pacotes(nome,valor,credito,ativo,ordem) select 'Pacote Prova',80,90,true,9 where not exists(select 1 from consultas_pacotes where nome='Pacote Prova');
with u as (select id from auth.users where email='usuario@babel.local'), pk as (select id from consultas_pacotes where nome='Pacote Prova' limit 1)
insert into consultas_recargas(tenant_id,pacote_id,valor,credito,status) select u.id,pk.id,80,90,'comprovante_enviado' from u,pk;
delete from blocos_conhecimento where title='Prova RAG'; delete from multinivel_niveis where descricao='nivel prova';""")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and errs.append(m.text[:200])); pg.on('dialog',lambda d:d.accept())
    pg.add_init_script("try{if(!sessionStorage.getItem('__l')){localStorage.clear();sessionStorage.setItem('__l','1');}}catch(e){}")
    pg.goto('http://127.0.0.1:8090/app.html'); pg.wait_for_selector('#login:not(.hidden)')
    pg.fill('#em','admin@babel.local'); pg.fill('#pw','Teste@123456'); pg.click('#go'); pg.wait_for_selector('#babelSair',timeout=30000); pg.wait_for_timeout(2500)
    J=pg.evaluate
    def go(v): J(f"document.querySelector('#dock [data-go={v}]').click()"); pg.wait_for_timeout(4000)
    def c(sel): J(f"document.querySelector('{sel}').click()"); pg.wait_for_timeout(500)
    t=lambda: pg.inner_text('#view')
    go('finadm'); chk('pedido do banco aparece','Pedido Prova' in t())
    pid=sql("select id from pedidos_compra where item_nome='Pedido Prova' and status='pendente' order by created_at desc limit 1")
    print('   ids na tela:',J("[...document.querySelectorAll('[data-act=fapst][data-v=aprovado]')].map(b=>b.dataset.id).join(',')"),'| banco:',pid)
    c(f'[data-act=fapst][data-id="{pid}"][data-v=aprovado]'); chk('aprovar grava status',espera(f"select status from pedidos_compra where id='{pid}'",'aprovado'))
    sid=sql("select id from multinivel_saques where chave_pix='prova@ex.com' and status='pendente' order by created_at desc limit 1")
    c('[data-act=fatab][data-t=saques]'); c(f'[data-act=fasrec][data-id="{sid}"]'); chk('recusar saque via RPC',espera(f"select status from multinivel_saques where id='{sid}'",'recusado'))
    go('socioadm'); chk('níveis gravados',espera("select count(*)>=3 from multinivel_niveis",'t'))
    n0=int(sql("select count(*) from multinivel_niveis")); c('[data-act=sanovo]')
    chk('novo nível no banco',espera("select count(*) from multinivel_niveis",str(n0+1)))
    J("(()=>{const i=[...document.querySelectorAll('[data-saf=descricao]')].pop();i.value='nivel prova';i.dispatchEvent(new Event('change',{bubbles:true}));})()")
    chk('edição inline grava',espera("select count(*) from multinivel_niveis where descricao='nivel prova'",'1'))
    go('consadm'); chk('tipos de consulta gravados',espera("select count(*)>=3 from consultas_tipos where deleted_at is null",'t'))
    c('[data-act=catab][data-t=recargas]'); rid=sql("select id from consultas_recargas where status='comprovante_enviado' order by created_at desc limit 1")
    c(f'[data-act=caapr][data-id="{rid}"]'); chk('aprovar recarga via RPC',espera(f"select status from consultas_recargas where id='{rid}'",'aprovado'))
    rid2=sql("select id from consultas_recargas where status='comprovante_enviado' order by created_at desc limit 1")
    if rid2:
        c(f'[data-act=carec][data-id="{rid2}"]'); chk('recusar recarga grava',espera(f"select status from consultas_recargas where id='{rid2}'",'recusado'))
    c('[data-act=catab][data-t=api]'); pg.fill('#caProv','provprova'); pg.fill('#caUrl','https://api.prova'); pg.fill('#caToken','tok-123'); c('[data-act=caapisalvar]')
    chk('config da API gravada',espera("select provedor from consultas_config_api limit 1",'provprova'))
    c('[data-act=catab][data-t=rag]'); nid=sql("select id from nichos where ativo order by nome_exibicao limit 1"); pg.select_option('#caNicho',nid); pg.wait_for_timeout(800)
    pg.fill('#caRagT','Prova RAG'); pg.fill('#caRagC','conteudo prova'); c('[data-act=caragnovo]')
    chk('conhecimento de consulta gravado',espera(f"select count(*) from blocos_conhecimento where title='Prova RAG' and nicho_id='{nid}' and category='consulta'",'1'))
    for _ in range(20):
        if '✓' in pg.inner_text('#babelSync'): break
        pg.wait_for_timeout(500)
    print('   indicador:',pg.inner_text('#babelSync'))
    chk('indicador ok','✓' in pg.inner_text('#babelSync'))
    b.close()
print('ERROS:',errs); print('TOTAL',sum(res),'/',len(res))
