import re,sys
TUNEL=(sys.argv[1] if len(sys.argv)>1 else re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',open('/private/tmp/babel-tunel.log').read()).group(0))
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    dev=p.devices['iPhone 13']; b=p.chromium.launch(); c=b.new_context(**dev); c.add_init_script('delete window.SpeechRecognition; delete window.webkitSpeechRecognition; window.SpeechRecognition=undefined; window.webkitSpeechRecognition=undefined;'); pg=c.new_page()
    pg.on('pageerror',lambda e:errs.append('PE '+str(e))); pg.on('console',lambda m:m.type=='error' and errs.append('C '+m.text[:160]))
    pg.goto(TUNEL+'/',timeout=60000); pg.wait_for_selector('#login:not(.hidden)',timeout=60000)
    pg.fill('#em','usuario@babel.local'); pg.fill('#pw','Teste@123456'); pg.click('#go'); pg.wait_for_selector('#babelSair',timeout=120000); pg.wait_for_timeout(4000)
    J=pg.evaluate
    print('seguro:',J('window.isSecureContext'),'| SR nativo:',J('!!(window.SpeechRecognition||window.webkitSpeechRecognition)'))
    print('voz instalada (wake desligado):',J("window.__babelEval('Voice').wake()===false"),'| avail:',J("window.__babelEval('Voice').avail()"))
    print('msg sem chave:',J("window.__babelEval('Voice').fixFor('nokey')[0]"),'| sem rede:',J("window.__babelEval('Voice').fixFor('offline')[0]"))
    print('cérebro/voz pelo próprio site:',J("window.__babelEval('S').cerebroUrl"),J("window.__babelEval('S').edgeUrl"))
    print('rodapé:',pg.is_visible('#babelSair'),pg.inner_text('#babelSync'))
    b.close()
print('ERROS:',errs)
