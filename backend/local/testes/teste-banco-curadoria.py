"""Teste de gravação no banco: Curadoria (admin).
Uso: python3 backend/local/testes/teste-banco-curadoria.py  (insere dados de prova próprios e limpa no início)"""
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
ADM="(select id from auth.users where email='admin@babel.local')"
USR="(select id from auth.users where email='usuario@babel.local')"
print(sql(f"""
delete from avisos_curadoria where titulo like 'Prova%'; delete from candidatos_bloco where excerto like 'Prova%'; delete from recursos_ativacao_curadoria where chave_recurso='prova_recurso';
delete from config_chamadas_llm where chave='prova_chamada'; delete from acoes_agendadas where template='prova'; delete from anti_padroes where situacao like 'Prova%';
delete from mapa_emocao_afeto where emocao in ('prova_emocao');
insert into avisos_curadoria(autor_tipo,criado_por,severidade,titulo,mensagem,escopo) values('humano',{ADM},'critico','Prova aviso','mensagem prova','global');
insert into candidatos_bloco(tenant_id,excerto,status,tipo_sugerido) select {USR},'Prova candidato','pendente','conhecimento';
insert into recursos_ativacao_curadoria(chave_recurso,nome_comercial,descricao_curta,categoria,tipo,status,custo_estimado_mes_brl,ordem) values('prova_recurso','Prova Recurso','desc','motor','feature_motor','pausado',33,1);
insert into config_chamadas_llm(chave,nome,modelo,temperatura,max_tokens,prompt_template,escopo,versao) values('prova_chamada','Prova chamada','google/gemini-2.5-flash',0.7,800,'prompt prova','global',1);
insert into acoes_agendadas(action_type,scheduled_at,status,template,tenant_id,carga) select 'followup',now()+interval '3 hours','pendente','prova',{USR},'{{"mensagem":"oi prova"}}';
select 'seed ok';"""))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1500,'height':950})
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and errs.append(m.text[:200])); pg.on('dialog',lambda d:d.accept())
    pg.add_init_script("try{if(!sessionStorage.getItem('__l')){localStorage.clear();sessionStorage.setItem('__l','1');}}catch(e){}")
    pg.goto('http://127.0.0.1:8090/app.html'); pg.wait_for_selector('#login:not(.hidden)')
    pg.fill('#em','admin@babel.local'); pg.fill('#pw','Teste@123456'); pg.click('#go'); pg.wait_for_selector('#babelSair',timeout=60000); pg.wait_for_timeout(2500)
    J=pg.evaluate
    def c(sel): J(f"document.querySelector('{sel}').click()"); pg.wait_for_timeout(600)
    t=lambda: pg.inner_text('#view')
    J("document.querySelector('#dock [data-go=curadoria]').click()"); pg.wait_for_timeout(4500)
    c('[data-act=cuaba][data-t=avisos]'); chk('aviso vem do banco','Prova aviso' in t())
    c('[data-act=cuavlido]'); chk('marcar lido grava',espera("select lido_em is not null from avisos_curadoria where titulo='Prova aviso'",'t'))
    c('[data-act=cuavarq]'); chk('arquivar grava',espera("select arquivado_em is not null from avisos_curadoria where titulo='Prova aviso'",'t'))
    c('[data-act=cuaba][data-t=blocos]'); c('[data-act=cugav][data-t=anti_padroes]'); c('[data-act=cublesc][data-t=todos]'); c('[data-act=cublnovo]')
    pg.fill('#cuBlTxt','Prova anti-padrão: nunca prometer prazo'); c('[data-act=cublsalvar]')
    chk('novo bloco gravado na gaveta',espera("select count(*) from anti_padroes where situacao='Prova anti-padrão: nunca prometer prazo' and origem='admin_curadoria'",'1'))
    c('[data-act=cubled]'); pg.fill('#cuBlTxt','Prova anti-padrão editado'); c('[data-act=cublsalvar]')
    chk('editar bloco grava',espera("select count(*) from anti_padroes where situacao='Prova anti-padrão editado'",'1'))
    c('[data-act=cubled]'); c('[data-act=cubldel]'); chk('excluir bloco grava',espera("select count(*) from anti_padroes where situacao like 'Prova%'",'0'))
    c('[data-act=cuaba][data-t=empatia]'); c('[data-act=cuemo][data-e=raiva][data-v="0.5"]')
    chk('valência de emoção gravada',espera("select valencia from mapa_emocao_afeto where emocao='raiva'",'0.5'))
    c('[data-act=cuaba][data-t=chamadas]'); chk('chamada vem do banco','Prova chamada' in t() or 'prova_chamada' in t())
    pg.fill('#cuChTemp','0.3'); c('[data-act=cuchsalvar]'); chk('salvar chamada grava',espera("select temperatura::float from config_chamadas_llm where chave='prova_chamada'",'0.3'))
    c('[data-act=cuaba][data-t=crossnicho]'); c('[data-act=cucntab][data-t=candidatos]'); chk('candidato vem do banco','Prova candidato' in t())
    c('[data-act=cucand][data-v=recusado]'); chk('recusar candidato grava',espera("select status from candidatos_bloco where excerto='Prova candidato'",'rejeitado'))
    c('[data-act=cuaba][data-t=recursos]'); chk('recurso vem do banco','Prova Recurso' in t())
    c('[data-act=curectog]'); chk('ativar recurso via RPC',espera("select status from recursos_ativacao_curadoria where chave_recurso='prova_recurso'",'ativo'))
    c('[data-act=cuaba][data-t=crons]'); chk('aba crons abre (RPC listar_jobs)','Nenhum job' in t() or 'Execuções' in t() or '·' in t())
    J("(()=>{const s=document.getElementById('cuTenant');const o=[...s.options].find(x=>x.text.startsWith('Dominic'));s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));})()"); pg.wait_for_timeout(800)
    chk('tenants impersonáveis vêm do banco','Impersonando' in t() and 'Dominic' in t())
    c('[data-act=cuaba][data-t=acompanhamentos]'); c('[data-act=cuaccanc]'); chk('cancelar ação agendada grava',espera("select status from acoes_agendadas where template='prova'",'cancelado'))
    for _ in range(10):
        if '✓' in pg.inner_text('#babelSync'): break
        pg.wait_for_timeout(500)
    print('   indicador:',pg.inner_text('#babelSync'))
    b.close()
print('ERROS:',errs); print('TOTAL',sum(res),'/',len(res))
