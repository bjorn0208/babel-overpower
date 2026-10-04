"""Teste de gravação no banco: o front novo (app.html) grava no Supabase LOCAL.
Uso: python3 backend/local/testes/teste-banco.py   (servidor em http://127.0.0.1:8090, usuários de usuarios-teste.sh)"""
import subprocess, time
from playwright.sync_api import sync_playwright

DB = 'supabase_db_sistemababel-local'
def sql(q):
    return subprocess.run(['docker', 'exec', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', q],
                          capture_output=True, text=True).stdout.strip()
res, errs = [], []
def chk(n, c):
    res.append(c); print(('PASS ' if c else 'FAIL ') + n)
def espera(q, alvo, t=8):
    fim = time.time() + t
    while time.time() < fim:
        if sql(q) == alvo: return True
        time.sleep(0.5)
    return False

def sessao(p, email):
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 900})
    pg.on('pageerror', lambda e: errs.append(email + ' pageerror: ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(email + ' console: ' + m.text[:200]))
    pg.on('dialog', lambda d: d.accept())
    pg.add_init_script("try{if(!sessionStorage.getItem('__l')){localStorage.clear();sessionStorage.setItem('__l','1');}}catch(e){}")
    pg.goto('http://127.0.0.1:8090/app.html'); pg.wait_for_selector('#login:not(.hidden)')
    pg.fill('#em', email); pg.fill('#pw', 'Teste@123456'); pg.click('#go')
    pg.wait_for_selector('#babelSair', timeout=30000); pg.wait_for_timeout(2500)
    return b, pg

def ir(pg, v):
    pg.evaluate(f"document.querySelector('#dock [data-go={v}]').click()"); pg.wait_for_timeout(4000)
def clica(pg, sel):
    pg.evaluate(f"document.querySelector('{sel}').click()"); pg.wait_for_timeout(400)

sql("delete from estoque_itens where nome='Item Prova Banco'; delete from eventos_agenda where titulo='Evento Prova Gravação'; delete from mensagens where content='Mensagem prova banco'")
# estoque é app do catálogo e some do dock sem instalação (ajustarAppsNoDock): instala p/ os 2 usuários do teste
sql("insert into aplicativos_instalados (user_id, aplicativo_id, aplicativo_slug) select u.id, la.id, la.slug from auth.users u cross join loja_aplicativos la where u.email in ('usuario@babel.local','teste@babel.com') and la.slug='estoque' and la.is_active on conflict (user_id, aplicativo_id) do nothing")
with sync_playwright() as p:
    # ----- usuário comum -----
    b, pg = sessao(p, 'usuario@babel.local')
    u = sql("select id from auth.users where email='usuario@babel.local'")
    ir(pg, 'notas')
    chk('notas de exemplo gravadas na 1ª carga', espera(f"select count(*)>=3 from notas_app where user_id='{u}' and deleted_at is null", 't'))
    ir(pg, 'estoque')
    chk('estoque de exemplo gravado', espera(f"select count(*)>0 from estoque_itens where tenant_id='{u}'", 't'))
    clica(pg, '[data-act=estqnovo]')
    pg.fill('#estq_nome', 'Item Prova Banco'); pg.fill('#estq_qtd', '7')
    clica(pg, '[data-act=estqsave]')
    chk('novo item de estoque no banco', espera(f"select quantidade from estoque_itens where nome='Item Prova Banco' and tenant_id='{u}'", '7'))
    ir(pg, 'agenda')
    clica(pg, '[data-act=evnew]'); pg.fill('#evT', 'Evento Prova Gravação'); clica(pg, '[data-act=evnewgo]')
    chk('novo compromisso no banco', espera(f"select count(*) from eventos_agenda where titulo='Evento Prova Gravação' and tenant_id='{u}'", '1'))
    ir(pg, 'conversas')
    pg.fill('#compose', 'Mensagem prova banco'); clica(pg, '[data-act=send]')
    chk('mensagem enviada no banco', espera("select count(*) from mensagens where content='Mensagem prova banco' and role='human'", '1'))
    ir(pg, 'empresa')
    clica(pg, '[data-act=empsave]')
    chk('empresa gravada', espera(f"select count(*) from empresas where user_id='{u}'", '1'))
    chk('indicador de gravação ok', '✓' in pg.inner_text('#babelSync'))
    pg.reload(); pg.wait_for_selector('#babelSair', timeout=30000); pg.wait_for_timeout(2500)
    ir(pg, 'estoque')
    chk('item volta do banco após recarregar', 'Item Prova Banco' in pg.inner_text('#view'))
    b.close()
    # ----- admin -----
    b, pg = sessao(p, 'admin@babel.local')
    ir(pg, 'nichos')
    chk('nichos de exemplo gravados (admin)', espera("select count(*)>=4 from nichos", 't'))
    clica(pg, '[data-act=nchtog]')
    chk('desativar nicho grava', espera("select count(*)>=1 from nichos where ativo=false", 't'))
    clica(pg, '[data-act=nchtog]')
    chk('reativar nicho grava', espera("select count(*) from nichos where ativo=false", '0'))
    ir(pg, 'lojaadm')
    chk('planos da loja gravados', espera("select count(*)>=4 from loja_planos", 't'))
    ir(pg, 'juradm')
    chk('serviços jurídicos gravados', espera("select count(*)>=3 from juridico_servicos", 't'))
    b.close()
    # ----- isolamento -----
    b, pg = sessao(p, 'teste@babel.com')
    ir(pg, 'estoque')
    chk('outro usuário não vê o estoque do primeiro', 'Item Prova Banco' not in pg.inner_text('#view'))
    b.close()

print('ERROS:', errs)
print('TOTAL', sum(res), '/', len(res))
