import sys
from playwright.sync_api import sync_playwright
S=sys.argv[1]; errs=[]; ok=[]
def chk(n,c):
    (ok if c else errs).append(n); print(('PASS ' if c else 'FAIL ')+n)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
    pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
    pg.on('console',lambda m: m.type=='error' and errs.append('console: '+m.text[:200]))
    pg.goto('http://127.0.0.1:8090/app.html'); pg.wait_for_selector('#login:not(.hidden)')
    pg.fill('#em','usuario@babel.local'); pg.fill('#pw','errada'); pg.click('#go')
    pg.wait_for_function("document.getElementById('err').textContent.length>0")
    chk('senha errada mostra erro', 'incorretos' in pg.inner_text('#err'))
    errs[:]=[e for e in errs if '400' not in e]  # 400 esperado da senha errada
    pg.fill('#pw','Teste@123456'); pg.click('#go')
    pg.wait_for_selector('#babelSair',timeout=20000); pg.wait_for_timeout(1500)
    n=pg.evaluate("document.body.innerText")
    chk('app carregado (botão Sair)', pg.is_visible('#babelSair'))
    pg.screenshot(path=S+'/f-inicio.png')
    for v,t in [('conversas','Conversas'),('clientes','Clientes'),('agenda','Agenda')]:
        pg.evaluate(f"document.querySelector('#dock [data-go={v}]').click()")
        pg.wait_for_timeout(2500); txt=pg.inner_text('body'); pg.screenshot(path=f'{S}/f-{v}.png')
        chk(v+' com dados do banco', {'conversas':'Lojinha','clientes':'Prova Do Banco','agenda':'Evento Prova Banco'}[v] in txt and 'Outro Tenant' not in txt)
    pg.reload(); pg.wait_for_selector('#babelSair',timeout=20000)
    chk('sessão mantida após reload', True)
    pg.wait_for_timeout(1500); pg.click('#babelSair',force=True); pg.wait_for_selector('#login:not(.hidden)',timeout=10000)
    chk('sair volta ao login', True)
    b.close()
print('ERROS:',[e for e in errs if not e.startswith(('senha','app','sess','sair'))])
