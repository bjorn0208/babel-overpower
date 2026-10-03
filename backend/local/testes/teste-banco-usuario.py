"""Teste de gravação no banco: telas do usuário (Contratos, Financeiro) — depende do seed-demo.sql.
Uso: python3 backend/local/testes/teste-banco-usuario.py"""
import subprocess, time
from playwright.sync_api import sync_playwright
DB='supabase_db_sistemababel-local'
def sql(q): return subprocess.run(['docker','exec',DB,'psql','-U','postgres','-d','postgres','-Atc',q],capture_output=True,text=True).stdout.strip()
res,errs=[],[]
def chk(n,c): res.append(c); print(('PASS ' if c else 'FAIL ')+n)
def espera(q,alvo,t=20):
    fim=time.time()+t
    while time.time()<fim:
        if sql(q)==alvo: return True
        time.sleep(0.6)
    print('   obtido:',sql(q)); return False
U="(select id from auth.users where email='usuario@babel.local')"
sql(f"delete from multinivel_saques where user_id={U} and valor=60; delete from contratos where (dados_pagamento->>'valor')='1234'; update contas_a_receber set status='pendente',recebida_em=null where descricao='saldo · Saia Dália (demo)'")
sql(f"""delete from mentor_conversas where titulo='prova'; delete from memoria_dono where fato='Prova memória do dono';
with c as (insert into mentor_conversas(owner_id,titulo,canal) select id,'prova','mentor' from auth.users where email='usuario@babel.local' returning id)
insert into mentor_mensagens(conversa_id,papel,conteudo,criado_em) select id,'user','Prova pergunta mentor',now() from c union all select id,'assistant','Prova resposta mentor',now()+interval '5 seconds' from c;
update mentor_mensagens set criado_em=criado_em+interval '5 seconds' where conteudo='Prova resposta mentor';
insert into memoria_dono(owner_id,fato,categoria,ativa) select id,'Prova memória do dono','fato',true from auth.users where email='usuario@babel.local';""")
sql("set app.bypass_profile_guard='true'; update profiles set saldo_multinivel=500, multinivel_ativo=true where email='usuario@babel.local'")
sql("delete from perguntas_sem_resposta where pergunta='Prova dúvida do lead'; insert into perguntas_sem_resposta(tenant_id,pergunta,ocorrencias,resolvido) select id,'Prova dúvida do lead',7,false from auth.users where email='usuario@babel.local'")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and errs.append(m.text[:200])); pg.on('dialog',lambda d:d.accept())
    pg.add_init_script("try{if(!sessionStorage.getItem('__l')){localStorage.clear();sessionStorage.setItem('__l','1');}}catch(e){}")
    pg.goto('http://127.0.0.1:8090/app.html'); pg.wait_for_selector('#login:not(.hidden)')
    pg.fill('#em','usuario@babel.local'); pg.fill('#pw','Teste@123456'); pg.click('#go'); pg.wait_for_selector('#babelSair',timeout=60000); pg.wait_for_timeout(2500)
    J=pg.evaluate
    def go(v): J(f"document.querySelector('#dock [data-go={v}]').click()"); pg.wait_for_timeout(4000)
    def c(sel): J(f"document.querySelector('{sel}').click()"); pg.wait_for_timeout(600)
    t=lambda: pg.inner_text('#view')
    go('contratos'); chk('contratos vêm do banco','Rafael Souza' in t() and 'pede sua validação' in t())
    c('[data-act=contrtab][data-t=novo]'); pg.fill('#ctVal','1234,00'); J("(()=>{const m=document.getElementById('ctModel');if(m&&m.tagName==='SELECT'&&m.options.length)m.selectedIndex=0;})()")
    J("window.__babelEval('S').ctModel='Prova Contrato'"); J("(()=>{const m=document.getElementById('ctModel');if(m&&m.tagName!=='SELECT')m.value='Prova Contrato';})()")
    c('[data-act=ctsend]'); chk('novo contrato gravado',espera(f"select count(*) from contratos where tenant_id={U} and (dados_pagamento->>'valor')::numeric=1234",'1'))
    go('financeiro'); c('[data-act=fintab][data-t=cobr]'); chk('cobranças vêm do banco','Saia Dália (demo)' in t())
    cid=sql("select id from contas_a_receber where descricao='saldo · Saia Dália (demo)'")
    c(f'[data-act=finsel][data-id="{cid}"]'); c(f'[data-act=cobpago][data-id="{cid}"]'); chk('baixa manual grava',espera(f"select status from contas_a_receber where id='{cid}'",'recebida'))
    c('[data-act=fintab][data-t=baixas]'); print('   baixas:',t()[:400].replace(chr(10),' | ')); chk('baixas vêm do banco','Joana Alves' in t() and 'Joana · #0231 · Pix' not in t())
    go('socio'); sd=sql("select replace(to_char(saldo_multinivel,'FM999990.00'),'.',',') from profiles where email='usuario@babel.local'"); chk('sócio vem do banco (saldo real '+sd+')',sd in t())
    c('[data-act=socsaque]'); pg.fill('#soc_valor','60'); J("(()=>{const e=document.getElementById('soc_pixm');if(e)e.value='saque.prova@ex.com';})()"); c('[data-act=socsqgo]')
    chk('saque solicitado via RPC',espera(f"select count(*) from multinivel_saques where user_id={U} and valor=60 and status='pendente'",'1'))
    sql("delete from consultas_recargas where status='comprovante_enviado' and valor=80 and tenant_id="+U)
    go('consulta'); tipo=sql("select nome from consultas_tipos where ativo and deleted_at is null order by ordem limit 1")
    chk('tipos de consulta vêm do banco ('+tipo+')',tipo!='' and tipo in t())
    J("window.__babelEval('S').con.aba='carteira';window.__babelEval('render')()"); pg.wait_for_timeout(800)
    pid=sql("select id from consultas_pacotes where ativo and deleted_at is null and valor=80 limit 1")
    c(f'[data-act=conpac][data-id="{pid}"]')
    import base64,os
    png='/private/tmp/comp-prova.png'; open(png,'wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='))
    pg.set_input_files('#conCompFile',png); pg.wait_for_timeout(1200)
    c('[data-act=conenv]')
    chk('recarga gravada com comprovante no Storage',espera("select count(*) from consultas_recargas where tenant_id="+U+" and valor=80 and status='comprovante_enviado' and url_comprovante like 'http%consultas-anexos%'",'1'))
    go('mentor'); J("window.__babelEval('S').men.aba='historico';window.__babelEval('render')()"); pg.wait_for_timeout(600)
    chk('histórico do mentor vem do banco','Prova pergunta mentor' in t())
    J("window.__babelEval('S').men.aba='memoria';window.__babelEval('render')()"); pg.wait_for_timeout(600)
    chk('memórias do mentor vêm do banco','Prova memória do dono' in t())
    J("window.__babelEval('S').men.aba='historico';window.__babelEval('render')()"); pg.wait_for_timeout(600)
    c('[data-act=mensel]'); c('[data-act=menconf]'); c('[data-act=mendel]')
    chk('excluir conversa do mentor grava',espera("select count(*) from mentor_mensagens where conteudo like 'Prova%mentor%'",'0'))
    n0=int(sql("select count(*) from salas_reuniao where tenant_id="+U))
    go('reuniao'); c('[data-act=runova]'); pg.wait_for_timeout(2500)
    chk('nova reunião criada via RPC',espera("select count(*) from salas_reuniao where tenant_id="+U,str(n0+1)))
    sid=sql("select id from salas_reuniao where tenant_id="+U+" order by created_at desc limit 1")
    J("(()=>{const S=window.__babelEval('S');const s=S.reu.salas.find(x=>(x._dbid||x.id)==='"+sid+"');s.status='encerrada';S.reu.sessao=null;window.__babelEval('save')();})()")
    chk('encerrar reunião grava',espera(f"select status from salas_reuniao where id='{sid}'",'encerrada'))
    go('agente'); J("window.__babelEval('S').agentTab='regras';window.__babelEval('render')()"); pg.wait_for_timeout(600)
    J("(()=>{const S=window.__babelEval('S');S.perms[0]=0;S.onbName='Aurora Prova';window.__babelEval('render')();})()")
    chk('ajustes do agente gravados',espera("select nome_agente||'|'||(configuracao->'babel_os'->'perms'->>0) from agentes where user_id="+U+" order by created_at limit 1",'Aurora Prova|0'))
    J("(()=>{const S=window.__babelEval('S');S.onbName='Aurora';window.__babelEval('render')();})()"); pg.wait_for_timeout(1500)
    chk('dúvidas do agente vêm do banco','Prova dúvida do lead' in J("JSON.stringify(window.__babelEval('DUVIDAS'))"))
    sql("delete from campanhas where name='Campanha Prova'")
    go('campanha')
    J("""(()=>{const S=window.__babelEval('S');const c={id:'cpx',name:'Campanha Prova',type:'venda',status:'rascunho',objective:'teste',description:'',product_id:null,duration_mode:'vitalicia',starts_at:null,ends_at:null,window_start:'09:00',window_end:'18:00',weekdays:[1,2,3,4,5],skip_holidays:true,throttle_per_day:50,throttle_per_hour:10,desistance_silence_days:7,filters:{modo:'todos'},tipo_conteudo:'texto',mensagem_inicial:'oi',midia_url:null,meta:null,created_at:new Date().toISOString()};
      S.cmp.camps.unshift(c);S.cmp.fases.cpx=[];S.cmp.leads.cpx=[];window.__babelEval('save')();window.__babelEval('render')();})()""")
    chk('campanha nova gravada',espera("select count(*) from campanhas where name='Campanha Prova' and tenant_id="+U,'1'))
    ok=espera("select count(*)>0 from fases_campanha f join campanhas c on c.id=f.campaign_id where c.name='Campanha Prova'",'t')
    for _ in range(20):
        if J("(window.__babelEval('S').cmp.fases.cpx||[]).length")>0: break
        pg.wait_for_timeout(500)
    chk('fases criadas pelo banco chegam na tela',ok and J("(window.__babelEval('S').cmp.fases.cpx||[]).length")>0)
    cid=sql("select id from campanhas where name='Campanha Prova'"); lid=sql("select id from leads where tenant_id="+U+" and name='Bruno Lima' limit 1")
    sql(f"insert into leads_campanha(campaign_id,lead_id,phase,state) values('{cid}','{lid}','aguardando','ativo')")
    pg.reload(); pg.wait_for_selector('#babelSair',timeout=60000); pg.wait_for_timeout(3000); go('campanha')
    chk('lead da campanha vem do banco',J(f"(window.__babelEval('S').cmp.leads['{cid}']||[]).some(l=>l.lead.name==='Bruno Lima')"))
    fs=sql(f"select slug from fases_campanha where campaign_id='{cid}' order by order_index offset 1 limit 1")
    J(f"(()=>{{const S=window.__babelEval('S');const l=S.cmp.leads['{cid}'][0];l.phase='{fs}';window.__babelEval('save')();}})()")
    chk('mover lead de fase grava',espera(f"select phase from leads_campanha where campaign_id='{cid}'",fs))
    J(f"(()=>{{const S=window.__babelEval('S');S.cmp.camps=S.cmp.camps.filter(x=>x.id!=='{cid}');window.__babelEval('save')();}})()")
    chk('excluir campanha via RPC',espera(f"select count(*) from campanhas where id='{cid}' and deleted_at is null",'0'))
    b.close()
print('ERROS:',errs); print('TOTAL',sum(res),'/',len(res))
