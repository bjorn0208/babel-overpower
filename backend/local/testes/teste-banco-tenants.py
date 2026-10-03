"""Teste de gravação no banco: Tenants (admin). Usa o estado do app (S.ten) + save(), como fazem os botões.
Uso: python3 backend/local/testes/teste-banco-tenants.py"""
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
        time.sleep(0.7)
    print('   obtido:',sql(q)); return False
EMAIL='novo.tenant.prova@babel.local'
sql(f"delete from auth.users where email='{EMAIL}'")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and errs.append(m.text[:200])); pg.on('dialog',lambda d:d.accept())
    pg.add_init_script("try{if(!sessionStorage.getItem('__l')){localStorage.clear();sessionStorage.setItem('__l','1');}}catch(e){}")
    pg.goto('http://127.0.0.1:8090/app.html'); pg.wait_for_selector('#login:not(.hidden)')
    pg.fill('#em','admin@babel.local'); pg.fill('#pw','Teste@123456'); pg.click('#go'); pg.wait_for_selector('#babelSair',timeout=30000); pg.wait_for_timeout(2500)
    J=pg.evaluate
    J("document.querySelector('#dock [data-go=tenants]').click()"); pg.wait_for_timeout(4000)
    chk('lista de tenants vem do banco','Dominic' in pg.inner_text('#view') and 'Mariana Costa' not in pg.inner_text('#view'))
    E="(f)=>{const S=window.__babelEval('S');f(S);window.__babelEval('save')();window.__babelEval('render')();}"
    def muda(js): J(f"({E})(S=>{{{js}}})"); pg.wait_for_timeout(300)
    muda("const t=S.ten.lista.find(x=>x.email==='usuario@babel.local');t.phone='+55 19 90000-0001';t.apelido='dominic.prova';")
    chk('editar perfil grava',espera("select phone||'|'||apelido from profiles where email='usuario@babel.local'",'+55 19 90000-0001|dominic.prova'))
    plano=sql("select nome from loja_planos order by ordem limit 1")
    muda(f"const t=S.ten.lista.find(x=>x.email==='usuario@babel.local');t.plano='{plano}';t.plano_status='ativa';t.conversas=0;t.max_conversas=777;t.data_expiracao='2026-12-31';")
    chk('ativar plano grava assinatura',espera("select a.plano_nome||'|'||a.max_conversas||'|'||a.status from assinaturas_usuario a join profiles p on p.id=a.user_id where p.email='usuario@babel.local'",f'{plano}|777|ativa'))
    muda("const t=S.ten.lista.find(x=>x.email==='usuario@babel.local');t.plano_status='cancelada';")
    for _ in range(6):
        pg.wait_for_timeout(1000); print('   sync:',pg.inner_text('#babelSync'), J("JSON.stringify(window.__babelEval('S').ten.lista.find(x=>x.email==='usuario@babel.local').plano_status)"))
    chk('inativar plano grava',espera("select a.status from assinaturas_usuario a join profiles p on p.id=a.user_id where p.email='usuario@babel.local'",'cancelada'))
    # criar pelo formulário real do app
    J("document.querySelector('[data-act=tnnovo]').click()"); pg.wait_for_timeout(800)
    pg.fill('#tnC_nome','Tenant Prova'); pg.fill('#tnC_email',EMAIL); pg.fill('#tnC_senha','Senha@12345')
    J("document.querySelector('[data-act=tncsave]').click()"); pg.wait_for_timeout(500)
    chk('criar tenant cria login no banco',espera(f"select count(*) from auth.users where email='{EMAIL}'",'1',120))
    chk('novo tenant consegue logar',espera(f"select count(*) from profiles where email='{EMAIL}'",'1'))
    J("document.querySelector('[data-act=tncclose]')&&document.querySelector('[data-act=tncclose]').click()"); pg.wait_for_timeout(500)
    muda(f"const t=S.ten.lista.find(x=>x.email==='{EMAIL}');t.status='excluido';t.is_active=false;t.excluido_em='2026-10-02';")
    chk('excluir tenant (soft) pela edge',espera(f"select deleted_at is not null from profiles where email='{EMAIL}'",'t',120))
    muda(f"const t=S.ten.lista.find(x=>x.email==='{EMAIL}');t.status='ativo';t.is_active=true;t.excluido_em='';")
    chk('restaurar tenant pela edge',espera(f"select deleted_at is null from profiles where email='{EMAIL}'",'t',120))
    b.close()
print('ERROS:',errs); print('TOTAL',sum(res),'/',len(res))
