"""Teste de gravação no banco: Rifas (usuário). Manipula o estado do app (S.rif) + save(), como fazem os botões.
Uso: python3 backend/local/testes/teste-banco-rifas.py"""
import subprocess, time
from playwright.sync_api import sync_playwright
DB='supabase_db_sistemababel-local'
def sql(q): return subprocess.run(['docker','exec',DB,'psql','-U','postgres','-d','postgres','-Atc',q],capture_output=True,text=True).stdout.strip()
res,errs=[],[]
def chk(n,c): res.append(c); print(('PASS ' if c else 'FAIL ')+n)
def espera(q,alvo,t=25):
    fim=time.time()+t
    while time.time()<fim:
        if sql(q)==alvo: return True
        time.sleep(0.6)
    print('   obtido:',sql(q)); return False
U="(select id from auth.users where email='usuario@babel.local')"
sql(f"delete from pedidos_rifa where rifa_id in (select id from rifas where titulo='Rifa Prova'); delete from rifa_dividas where rifa_id in (select id from rifas where titulo='Rifa Prova'); delete from rifas where titulo='Rifa Prova'; delete from rifa_lista_disparo where phone='5541900000001'; delete from rifa_templates_mensagem where titulo='Modelo Prova'; delete from rifa_numeros_fixos where nome='Fixo Prova'")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and errs.append(m.text[:200])); pg.on('dialog',lambda d:d.accept())
    pg.add_init_script("try{if(!sessionStorage.getItem('__l')){localStorage.clear();sessionStorage.setItem('__l','1');}}catch(e){}")
    pg.goto('http://127.0.0.1:8090/app.html'); pg.wait_for_selector('#login:not(.hidden)')
    pg.fill('#em','usuario@babel.local'); pg.fill('#pw','Teste@123456'); pg.click('#go'); pg.wait_for_selector('#babelSair',timeout=90000); pg.wait_for_timeout(3000)
    J=pg.evaluate
    J("document.querySelector('#dock [data-go=rifas]').click()"); pg.wait_for_timeout(4000)
    def muda(js): J("(()=>{const S=window.__babelEval('S');"+js+";window.__babelEval('save')();})()"); pg.wait_for_timeout(300)
    muda("S.rif.rifas.unshift({id:'rx',titulo:'Rifa Prova',descricao:'teste',status:'ativa',metodo_sorteio:'plataforma',total_numeros:50,preco_numero_centavos:300,premio_principal:'Prêmio prova',premios_extras:[],promocoes:[],cotas_premiadas:[],max_por_pedido:10,minutos_reserva:30,data_sorteio_prevista:null,data_sorteio_efetiva:null,numero_sorteado:null,imagem_url:null,galeria:[],vendidos_count:0,chave_publica:'',created_at:new Date().toISOString()})")
    chk('rifa nova gravada',espera("select count(*) from rifas where titulo='Rifa Prova' and tenant_id="+U,'1'))
    for _ in range(20):
        if J("(window.__babelEval('S').rif.rifas.find(r=>r.id==='rx')||{}).chave_publica||''").count('-')==4: break
        pg.wait_for_timeout(500)
    muda("S.rif.pedidos.unshift({id:'px',rifa_id:'rx',nome:'Comprador Prova',phone:'5541911112222',numeros:[5,6],qtd_numeros:2,valor_centavos:600,status:'pago',origem:'manual',comprovante_url:null,chave_publica:'',created_at:new Date().toISOString(),pago_em:new Date().toISOString(),expira_em:null,motivo_rejeicao:null,divida_gerada_em:null,divida_dispensada_em:null,reembolsado_em:null,reembolso_centavos:null,numeros_reembolsados:[],motivo_reembolso:null})")
    chk('venda manual via RPC (reservar + confirmar)',espera("select status||'|'||array_to_string(numeros,',') from pedidos_rifa where nome='Comprador Prova'",'pago|5,6'))
    muda("S.rif.contatos.push({id:'cx',nome:'Contato Prova',phone:'5541900000001',marcado:true})")
    chk('contato da lista de disparo gravado',espera("select count(*) from rifa_lista_disparo where phone='5541900000001' and tenant_id="+U,'1'))
    muda("S.rif.tpl.push({id:'tx',categoria:'promocao',titulo:'Modelo Prova',mensagem:'oi {{titulo}}',tipo_conteudo:'texto'})")
    chk('modelo de mensagem gravado',espera("select count(*) from rifa_templates_mensagem where titulo='Modelo Prova'",'1'))
    muda("S.rif.fixos.push({id:'fx',metodo:'plataforma',numero:42,nome:'Fixo Prova',phone:'5541933334444',status:'ativo'})")
    chk('número fixo gravado',espera("select count(*) from rifa_numeros_fixos where nome='Fixo Prova'",'1'))
    muda("S.rif.cfg.chavePix='pix.prova@ex.com'")
    chk('configuração da rifa gravada',espera("select chave_pix from rifas_config_tenant where tenant_id="+U,'pix.prova@ex.com'))
    muda("const r=S.rif.rifas.find(x=>x.id==='rx');r.numero_sorteado=5")
    chk('sorteio via RPC sortear_rifa',espera("select numero_sorteado from rifas where titulo='Rifa Prova'",'5'))
    b.close()
print('ERROS:',errs); print('TOTAL',sum(res),'/',len(res))
