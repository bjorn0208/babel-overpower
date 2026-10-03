# Mentor ouvindo de ponta a ponta, sem reconhecimento do navegador (como no iPhone):
# microfone falso (WAV com uma pergunta falada) → gravador do app → /api/ouvir (Whisper no Mac ou Groq) →
# texto no Mentor → resposta do cérebro com os dados reais do usuário.
# Uso: python3 teste-mentor-ouvido.py [arquivo.wav] [url]   (padrão: fala-mic.wav e http://localhost:8080)
import sys,time
from playwright.sync_api import sync_playwright
WAV=sys.argv[1] if len(sys.argv)>1 else '/private/tmp/claude-502/fala-mic.wav'
URL=sys.argv[2] if len(sys.argv)>2 else 'http://localhost:8080'
erros=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+WAV])
    c=b.new_context(viewport={'width':1280,'height':820},permissions=['microphone'])
    c.add_init_script('delete window.SpeechRecognition;delete window.webkitSpeechRecognition;window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;')
    pg=c.new_page();pg.on('pageerror',lambda e:erros.append('PE '+str(e)));pg.on('console',lambda m:m.type=='error' and erros.append('C '+m.text[:200]))
    pg.goto(URL+'/',timeout=90000);pg.wait_for_selector('#login:not(.hidden)',timeout=90000)
    pg.fill('#em','usuario@babel.local');pg.fill('#pw','Teste@123456');pg.click('#go');pg.wait_for_selector('#babelSair',timeout=180000);pg.wait_for_timeout(3000)
    J=pg.evaluate
    print('gravador ativo (sem SR):',J("window.__babelEval('Voice').avail()"),'| wake desligado:',J("window.__babelEval('Voice').wake()===false"))
    J("window.__babelEval('Mentor').openUI()");pg.wait_for_timeout(900)
    t0=time.time();J("window.__babelEval('Babel').listen()")
    txt='';fala=''
    while time.time()-t0<180:
        txt=J("(document.getElementById('mIn')||{}).value||''") or txt
        q=J("window.__babelEval('Mentor').lastQ||''")
        fala=J("(document.getElementById('mAns')||{}).innerText||''")
        if q and fala.strip():break
        pg.wait_for_timeout(500)
    print('ouvi:',repr(J("window.__babelEval('Mentor').lastQ||''")),'| em %.1f s'%(time.time()-t0))
    print('Mentor respondeu:',fala.strip()[:400])
    b.close()
print('ERROS:',erros)
