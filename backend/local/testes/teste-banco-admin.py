"""Teste de gravação no banco: aplicativos, cargos, aparência, reuniões (admin) e interesse no jurídico (usuário → admin).
Uso: python3 backend/local/testes/teste-banco-admin.py"""
import subprocess, time
from playwright.sync_api import sync_playwright
DB='supabase_db_sistemababel-local'
def sql(q): return subprocess.run(['docker','exec',DB,'psql','-U','postgres','-d','postgres','-Atc',q],capture_output=True,text=True).stdout.strip()
res,errs=[],[]
def chk(n,c): res.append(c); print(('PASS ' if c else 'FAIL ')+n)
def espera(q,alvo,t=12):
    fim=time.time()+t
    while time.time()<fim:
        if sql(q)==alvo: return True
        time.sleep(0.5)
    print('   obtido:',sql(q)); return False
sql("delete from juridico_interesses")
def sessao(p,email):
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and errs.append(m.text[:200])); pg.on('dialog',lambda d:d.accept())
    pg.add_init_script("try{if(!sessionStorage.getItem('__l')){localStorage.clear();sessionStorage.setItem('__l','1');}}catch(e){}")
    pg.goto('http://127.0.0.1:8090/app.html'); pg.wait_for_selector('#login:not(.hidden)')
    pg.fill('#em',email); pg.fill('#pw','Teste@123456'); pg.click('#go'); pg.wait_for_selector('#babelSair',timeout=30000); pg.wait_for_timeout(2500)
    return b,pg
with sync_playwright() as p:
    b,pg=sessao(p,'usuario@babel.local'); J=pg.evaluate
    def go(v): J(f"document.querySelector('#dock [data-go={v}]').click()"); pg.wait_for_timeout(4000)
    go('juridico'); sid=sql("select id from juridico_servicos where deleted_at is null and is_active order by ordem limit 1")
    J(f"document.querySelector('[data-act=jurint][data-id=\"{sid}\"]').click()")
    chk('usuário registra interesse',espera(f"select count(*) from juridico_interesses where servico_id='{sid}'",'1'))
    b.close()
    b,pg=sessao(p,'admin@babel.local'); J=pg.evaluate
    go('dash'); nt=sql("select count(*) from profiles where system_role<>'platform_admin' and parent_user_id is null and deleted_at is null")
    txt=pg.inner_text('#view'); chk('dashboard com nº real de tenants ('+nt+')','Tenants ativos\n'+nt in txt or 'Tenants ativos '+nt in txt)
    chk('dashboard top tenants do banco','Dominic' in txt)
    go('controle'); chk('controle lista perfis do banco','Dominic' in pg.inner_text('#view') and 'Helena Braga' not in pg.inner_text('#view'))
    go('appsadm'); chk('aplicativos gravados',espera("select count(*)>=3 from loja_aplicativos",'t'))
    go('cargos'); chk('cargos gravados',espera("select count(*)>=3 from cargos where escopo<>'tenant'",'t'))
    go('apar'); chk('aparência gravada (linha ativa)',espera("select count(*) from branding_sistema where ativo",'1'))
    go('reunadm'); chk('config de reuniões gravada',espera("select count(*) from config_plataforma",'1'))
    pg.fill('#rmTeto','23'); J("document.querySelector('[data-act=rmsalvar]').click()")
    chk('edição de reuniões gravada',espera("select reuniao_limite_participantes from config_plataforma",'23'))
    go('juradm'); J("document.querySelector('[data-act=juradmtab][data-t=interessados]').click()"); pg.wait_for_timeout(800)
    chk('admin vê o interessado do banco','usuario@babel.local' in pg.inner_text('#view') or 'Dominic' in pg.inner_text('#view'))
    J("(()=>{const s=document.querySelector('[data-jstat]');s.value='contatado';s.dispatchEvent(new Event('change',{bubbles:true}));})()")
    chk('status do interessado gravado',espera(f"select status from juridico_interesses where servico_id='{sid}'",'contatado'))
    b.close()
print('ERROS:',errs); print('TOTAL',sum(res),'/',len(res))
