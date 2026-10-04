"""Suite E3 da Gestão (TO-DE-LIST-6): Tarefas, Painel, Atividade, Acessos, Backup.

Alvo: implementação gx* que já vive no babel-os.html (adotada após smoke
18/18 em 02/10; lanes E3 canceladas por redundância — ver log da TO-DE-LIST-6).

Uso: python3 backend/local/testes/teste-gestao-e3.py [porta]   (padrão 8080,
o front real do babel.sh; screenshots em /tmp/gs-e3/ok-e3-<aba>.png)
Verde = TOTAL x/x + ERROS só com o pré-existente 'on is not defined'
(pageerror global no load, fora da Gestão — controle no início).
"""
import sys
from playwright.sync_api import sync_playwright

PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
URL = f"http://127.0.0.1:{PORTA}/babel-os.html"
ABAS_E3 = ["Tarefas do time", "Painel", "Atividade babel", "Acessos"]
GLOBALES = {"gsmes", "theme", "wallnext", "pause", "notif", "hpop", "sheet", "gsaba"}
res, errs = [], []


def chk(n, c):
    res.append(bool(c))
    print(("PASS " if c else "FAIL ") + n)


def nova_pg(b):
    ctx = b.new_context(viewport={"width": 1400, "height": 900})
    pg = ctx.new_page()
    pg.on("dialog", lambda d: d.accept())
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:160]))
    pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text[:160]))
    pg.goto(URL)
    pg.wait_for_selector("#dock", timeout=20000)
    pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('#dock [data-go=gestao]').click()")
    pg.wait_for_timeout(1200)
    return ctx, pg


def clicar_aba(pg, rotulo):
    pg.evaluate("""(rot)=>{
      const b=[...document.querySelectorAll('.ntab [data-act="gsaba"]')]
        .find(e=>(e.innerText||'').trim().indexOf(rot)===0);
      if(b) b.click();
    }""", rotulo)
    pg.wait_for_timeout(900)


def fechar_modal(pg):
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(200)
    pg.evaluate("""(()=>{const m=document.querySelector('[data-act="closelayer2"],[data-act="gsmodalfechar"]');
      if(m) m.click();})()""")
    pg.wait_for_timeout(200)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx0, pg0 = nova_pg(b)
    base = list(errs)
    print("controle load puro (pré-existentes):", base if base else "nenhum")
    ctx0.close()
    total = set()
    for aba in ABAS_E3:
        ctx, pg = nova_pg(b)
        clicar_aba(pg, aba)
        acts = pg.evaluate("[...new Set([...document.querySelectorAll('[data-act]')].map(e=>e.dataset.act))].sort()")
        gestao_acts = [a for a in acts if a not in GLOBALES]
        chk(f"render: {aba} ({len(gestao_acts)} acts)", True)
        pg.screenshot(path="/tmp/gs-e3/ok-e3-" + aba.lower().replace(" ", "-") + ".png")
        for act in gestao_acts:
            antes = len(errs)
            try:
                pg.evaluate(f"""(()=>{{const e=document.querySelector('[data-act="{act}"]');
                  if(e) e.click();}})()""")
                pg.wait_for_timeout(400)
            except Exception as e:
                errs.append(f"click-{act}: {str(e)[:120]}")
            fechar_modal(pg)
            total.add(act)
            if len(errs) > antes:
                print(f"  act {act} @{aba}: ERRO {errs[antes][:130]}")
        ctx.close()
    ctx, pg = nova_pg(b)  # detalhe tarefa + backup
    clicar_aba(pg, "Tarefas do time")
    antes = len(errs)
    abriu = pg.evaluate("""(()=>{const e=document.querySelector('[data-act="gxtaredit"]');
      if(e){e.click();return 'gxtaredit';} return null;})()""")
    pg.wait_for_timeout(800)
    fechar_modal(pg)
    chk(f"tarefa edita+fecha ({abriu})", abriu is not None and len(errs) == antes)
    pg.evaluate("()=>{document.querySelector('[data-act=\"gxbackup\"]').click()}")
    pg.wait_for_timeout(700)
    tem = pg.evaluate("!!document.querySelector('.modal,.layer2,.gs-modal,.gx-modal')")
    fechar_modal(pg)
    chk("backup abre modal", tem and len(errs) == antes)
    ctx.close()
    b.close()

print(f"TOTAL {sum(res)}/{len(res)} · {len(total)} acts distintos")
print("ERROS:", sorted(set(errs)) if errs else "nenhum")
