# Fotos do modo celular (iPhone 13): início com a barra de baixo e a folha "Mais" com os apps.
import sys
from playwright.sync_api import sync_playwright
OUT=sys.argv[1] if len(sys.argv)>1 else '/private/tmp/claude-502'
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(**p.devices['iPhone 13']); pg=c.new_page()
    pg.goto('http://localhost:8080/',timeout=60000); pg.wait_for_selector('#login:not(.hidden)',timeout=60000)
    pg.fill('#em','usuario@babel.local'); pg.fill('#pw','Teste@123456'); pg.click('#go'); pg.wait_for_selector('#babelSair',timeout=120000); pg.wait_for_timeout(3000)
    pg.screenshot(path=OUT+'/cel-inicio.png')
    pg.click('#tabbar [data-act="sheet"]'); pg.wait_for_timeout(900)
    pg.screenshot(path=OUT+'/cel-mais.png')
    b.close()
print('ok')
