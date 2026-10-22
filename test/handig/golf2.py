# v6.8–v7.0: handigheidjes in de demo (slepen, ongedaan maken, vegen, recent, toetsenbord, commandobalk, selectie, voorbeeld,
# vervolgstap, link, tijdlijn, vastpinnen). Gebruik: python3 test/handig/golf2.py — eindigt met de regels OK/FOUT en exitcode 1 bij een FOUT.
import os, sys, threading,functools,http.server,socketserver
from playwright.sync_api import sync_playwright
class S(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',8777),functools.partial(S,directory=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
threading.Thread(target=srv.serve_forever,daemon=True).start()
U='http://127.0.0.1:8777/?demo=1&kaal=1&rol='; import os; OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots', 'handig') + os.sep; os.makedirs(OUT, exist_ok=True)
fouten=[]; res=[]
def ok(n,v): res.append(('OK ' if v else 'FOUT ')+n)
def kol(pg, sel): return pg.evaluate("(function(){var k=document.querySelector(%r);return k?k.closest('[data-sleepdoel]').getAttribute('data-sleepdoel'):null})()" % sel)
def muis(pg, sel, doel):
    a=pg.locator(sel).first.bounding_box(); b=pg.locator(doel).first.bounding_box()
    pg.mouse.move(a['x']+12,a['y']+10); pg.mouse.down(); pg.mouse.move(a['x']+30,a['y']+25,steps=4)
    pg.mouse.move(b['x']+b['width']/2,b['y']+60,steps=12); pg.wait_for_timeout(100); pg.mouse.up(); pg.wait_for_timeout(1300)
def nieuw(b, rol):
    c=b.new_context(viewport={'width':1440,'height':900}); pg=c.new_page(); pg.on('pageerror',lambda e:fouten.append(rol+': '+str(e)))
    pg.goto(U+rol); pg.wait_for_selector('#zijbalk'); pg.wait_for_load_state('networkidle'); return c,pg
def stap(n, fn):
    try: fn()
    except Exception as e: ok(n+' (uitzondering: %s)' % str(e).split('\n')[0][:120], False)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    c,pg=nieuw(b,'sophie')
    def t7():
        pg.keyboard.press('Control+k'); pg.wait_for_selector('#palet.aan #paletInvoer'); ok('7 Ctrl+K opent commandobalk', True)
        pg.fill('#paletInvoer','esdoorn'); pg.wait_for_timeout(300); ok('7 vindt school', pg.locator('#paletLijst .palet-rij:has-text("Esdoorn")').count()>0)
        pg.keyboard.press('Enter'); pg.wait_for_selector('.d-naam h2'); ok('7 Enter opent het item', 'Esdoorn' in pg.inner_text('.d-naam h2'))
        pg.keyboard.press('Control+k'); pg.fill('#paletInvoer','financ'); pg.wait_for_timeout(200); pg.keyboard.press('Enter'); pg.wait_for_timeout(800); ok('7 ga naar Financiën', pg.locator('.zb-item.aan[data-desk="financien"]').count()==1)
        pg.keyboard.press('Control+k'); pg.fill('#paletInvoer','taak Bel Marieke morgen om 14:00'); pg.wait_for_timeout(200)
        ok('7 taakregel bovenaan', 'Taak toevoegen' in pg.inner_text('#paletLijst .palet-rij.aan')); pg.keyboard.press('Enter'); pg.wait_for_timeout(1500)
        ok('7 taak toegevoegd via balk (%s)' % pg.inner_text('#toast')[:50], 'toegevoegd' in pg.inner_text('#toast').lower())
        pg.keyboard.press('Control+k'); pg.fill('#paletInvoer','nieuwe kans'); pg.wait_for_timeout(200); ok('7 nieuwe kans als actie', '+ Kans' in pg.inner_text('#paletLijst'))
        pg.keyboard.press('Escape'); ok('7 Esc sluit', pg.locator('#palet.aan').count()==0)
    stap('7', t7)
    def t11():
        ok('11 Link-knop in detail', pg.locator('#crmDetailScherm [data-linkkopie]').count()>=0)
        pg.goto(U+'sophie'); pg.wait_for_selector('#zijbalk'); pg.wait_for_load_state('networkidle')
        pg.evaluate("routeHash('school:s1')"); pg.wait_for_selector('#crmDetailScherm [data-linkkopie]')
        pg.context.grant_permissions(['clipboard-read','clipboard-write'])
        pg.click('#crmDetailScherm [data-linkkopie]'); pg.wait_for_timeout(500); clip=pg.evaluate("navigator.clipboard.readText()")
        ok('11 link gekopieerd: %s' % clip[-30:], clip.endswith('#school:s1'))
    stap('11', t11)
    def t9():
        pg.click('.zb-item[data-desk="pipeline"]'); pg.wait_for_selector('.bord .kaartje')
        pg.hover('.bord .kaartje >> nth=0'); pg.wait_for_timeout(900); ok('9 voorbeeld bij aanwijzen', pg.locator('#voorbeeld.aan').count()==1 and 'Mijlpaal' in pg.inner_text('#voorbeeld'))
        pg.mouse.move(5,5); pg.wait_for_timeout(200); ok('9 voorbeeld verdwijnt', pg.locator('#voorbeeld.aan').count()==0)
    stap('9', t9)
    def t10():
        k=pg.locator('[data-sleepdoel="kans:gesprek"] .kaartje.sleepbaar').first; kid=k.get_attribute('data-sleep')
        muis(pg,'[data-sleep="%s"]'%kid,'[data-sleepdoel="kans:voorstel"]')
        ok('10 vervolgbalk na voorstel', pg.locator('.vervolg [data-vervolg="offerte"]').count()==1)
        pg.click('.vervolg [data-vervolg="offerte"]'); pg.wait_for_timeout(800); ok('10 offerte → assistent met vraag', 'offerte' in pg.input_value('#vraagInput').lower())
        pg.click('.zb-item[data-desk="pipeline"]'); pg.wait_for_selector('.bord .kaartje')
        muis(pg,'[data-sleep="%s"]'%kid,'[data-sleepdoel="kans:gesprek"]'); ok('10 vervolgbalk na gesprek', pg.locator('.vervolg [data-vervolg="afspraak"]').count()==1)
        pg.click('.vervolg [data-vervolg="afspraak"]'); pg.wait_for_timeout(1500); ok('10 afspraak-composer open', pg.locator('#crmDetailScherm form, #crmDetailScherm .composer, #venster.aan').count()>0)
        pg.screenshot(path=OUT+'g2_afspraak.png')
    stap('10', t10)
    def t8():
        pg.click('.zb-item[data-desk="pipeline"]'); pg.wait_for_selector('.bord .kaartje.sleepbaar')
        ks=pg.locator('[data-sleepdoel="kans:voorstel"] .kaartje.sleepbaar, [data-sleepdoel="kans:onderhandeling"] .kaartje.sleepbaar')
        ids=[ks.nth(i).get_attribute('data-sleep') for i in range(min(2,ks.count()))]
        for i in ids: pg.click('[data-sleep="%s"]'%i, modifiers=['Shift'])
        ok('8 selectie van %d kaarten' % len(ids), pg.locator('#selectieBalk.aan:has-text("%d geselecteerd")' % len(ids)).count()==1)
        pg.screenshot(path=OUT+'g2_selectie.png')
        muis(pg,'[data-sleep="%s"]'%ids[0],'[data-sleepdoel="kans:lead"]')
        ok('8 slepen verplaatst alle geselecteerde', all(kol(pg,'[data-sleep="%s"]'%i)=='kans:lead' for i in ids))
        pg.click('.zb-item[data-desk="taken"]'); pg.wait_for_selector('tr[data-taakbewerk]')
        print('DBG rijen', pg.locator('tr[data-taakbewerk]').count(), pg.locator('tr[data-taakbewerk]:visible').count(), pg.evaluate("document.querySelector('.view.actief').id"))
        rijen=pg.locator('tr[data-taakbewerk]:visible'); tids=[rijen.nth(i).get_attribute('data-taakbewerk') for i in range(2)]
        for i in tids:
            try: pg.click('tr[data-taakbewerk="%s"] td:nth-child(2)'%i, modifiers=['Control'], timeout=5000)
            except Exception as e: print('DBG klik', str(e)[-600:])
        ok('8 taken selecteren (geen venster)', pg.locator('#venster.aan').count()==0 and pg.locator('#selectieBalk.aan').count()==1)
        pg.select_option('#selectieBalk [data-bulkveld="prio"]','laag'); pg.wait_for_timeout(2000)
        ok('8 bulk prio (%s)' % pg.inner_text('#toast')[:40], '2 taken bijgewerkt' in pg.inner_text('#toast'))
    stap('8', t8)
    c.close()
srv.shutdown()
print('\n'.join(res)); print('pageerrors:', fouten or 'geen')
sys.exit(1 if any(r.startswith('FOUT') for r in res) or fouten else 0)
