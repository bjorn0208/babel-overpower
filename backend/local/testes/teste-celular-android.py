import re,sys
TUNEL=(sys.argv[1] if len(sys.argv)>1 else re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',open('/private/tmp/babel-tunel.log').read()).group(0))
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(**p.devices['Pixel 7']); pg=c.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and errs.append(m.text[:160]))
    pg.goto(TUNEL+'/',timeout=60000); pg.wait_for_selector('#login:not(.hidden)',timeout=60000)
    pg.fill('#em','usuario@babel.local'); pg.fill('#pw','Teste@123456'); pg.click('#go'); pg.wait_for_selector('#babelSair',timeout=120000); pg.wait_for_timeout(3000)
    J=pg.evaluate
    print('Android: SR nativo:',J("!!window.__babelEval('Voice').SR"),'| listen original (não trocado):','gr' not in J("String(window.__babelEval('Voice').listen)").split('(')[0] and 'kickListen' in J("String(window.__babelEval('Voice').listen)"))
    b.close()
print('ERROS:',errs)
