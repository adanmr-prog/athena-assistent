# v6.8–v7.0: handigheidjes in de demo (slepen, ongedaan maken, vegen, recent, toetsenbord, commandobalk, selectie, voorbeeld,
# vervolgstap, link, tijdlijn, vastpinnen). Gebruik: python3 test/handig/golf3.py — eindigt met de regels OK/FOUT en exitcode 1 bij een FOUT.
import os, sys, threading,functools,http.server,socketserver
from playwright.sync_api import sync_playwright
class S(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',8779),functools.partial(S,directory=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
threading.Thread(target=srv.serve_forever,daemon=True).start()
U='http://127.0.0.1:8779/?demo=1&kaal=1&rol='; import os; OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots', 'handig') + os.sep; os.makedirs(OUT, exist_ok=True)
fouten=[]; res=[]
def ok(n,v): res.append(('OK ' if v else 'FOUT ')+n)
def stap(n, fn):
    try: fn()
    except Exception as e: ok(n+' (uitzondering: %s)' % str(e).split('\n')[0][:140], False)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    c=b.new_context(viewport={'width':1440,'height':900}); pg=c.new_page(); pg.on('pageerror',lambda e:fouten.append(str(e)))
    pg.goto(U+'femke'); pg.wait_for_selector('#zijbalk'); pg.wait_for_load_state('networkidle')
    def t12():
        pg.click('.zb-item[data-desk="projecten"]'); pg.click('[data-pweergave="tijdlijn"]'); pg.wait_for_selector('.tl-balk[data-tlbalk]')
        bal=pg.locator('.tl-balk[data-tlbalk]').first; pid=bal.get_attribute('data-tlbalk')
        voor=pg.evaluate("(function(t){return [t.start,t.eind]})(projectenLokaal(%r)[0])" % pid)
        pg.screenshot(path=OUT+'g3_tijdlijn.png')
        a=bal.bounding_box(); baan=pg.evaluate("document.querySelector('[data-tlbalk=\"%s\"]').parentNode.getBoundingClientRect().width" % pid)
        dag=baan/365.0
        # verschuiven: 14 dagen naar rechts
        x,y=a['x']+a['width']/2,a['y']+a['height']/2; pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+14*dag,y,steps=10); pg.mouse.up(); pg.wait_for_timeout(1500)
        na=pg.evaluate("(function(t){return [t.start,t.eind]})(projectenLokaal(%r)[0])" % pid)
        import datetime as D
        verw=[(D.date.fromisoformat(v)+D.timedelta(days=14)).isoformat() for v in voor]
        ok('12 balk verschuiven: %s → %s' % (voor, na), na==verw or abs((D.date.fromisoformat(na[0])-D.date.fromisoformat(voor[0])).days-14)<=1)
        ok('12 ongedaan-toast', pg.locator('#toast.aan [data-toastactie]').count()==1)
        pg.click('#toast.aan [data-toastactie]'); pg.wait_for_timeout(1500)
        ok('12 ongedaan zet datums terug', pg.evaluate("(function(t){return [t.start,t.eind]})(projectenLokaal(%r)[0])" % pid)==voor)
        # rechterrand: 10 dagen langer
        bal=pg.locator('[data-tlbalk="%s"]'%pid); a=bal.bounding_box(); x,y=a['x']+a['width']-4,a['y']+a['height']/2
        pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+10*dag,y,steps=8); pg.mouse.up(); pg.wait_for_timeout(1500)
        na2=pg.evaluate("(function(t){return [t.start,t.eind]})(projectenLokaal(%r)[0])" % pid)
        ok('12 rand verlengt alleen het eind: %s' % na2, na2[0]==voor[0] and na2[1]>voor[1])
        pg.click('[data-tlbalk="%s"] .tl-tekst'%pid); pg.wait_for_selector('.d-naam h2'); ok('12 klik opent project', True)
        pg.reload(); pg.wait_for_selector('#zijbalk'); pg.wait_for_load_state('networkidle')
    stap('12', t12)
    def t13():
        pg.evaluate("routeHash('school:s1')"); pg.wait_for_selector('#crmDetailScherm [data-pin]')
        pg.click('#crmDetailScherm [data-pin]'); pg.wait_for_timeout(400)
        ok('13 knop wordt Vastgepind', pg.get_attribute('#crmDetailScherm [data-pin]', 'aria-pressed') == 'true' and 'Vastgepind' in pg.get_attribute('#crmDetailScherm [data-pin]', 'title'))  # v7.1: icoonknop
        ok('13 in de zijbalk', pg.locator('#zbPins .zb-pin[data-crm-open="school:s1"]').count()==1)
        pg.click('.zb-item[data-desk="home"]'); pg.wait_for_timeout(500); pg.click('#zbPins .zb-pin'); pg.wait_for_selector('.d-naam h2'); ok('13 zijbalk-pin opent school', 'Esdoorn' in pg.inner_text('.d-naam h2'))
        pg.click('#crmDetailScherm [data-pin]'); pg.wait_for_timeout(300); ok('13 losmaken', pg.locator('#zbPins .zb-pin').count()==0)
        pg.screenshot(path=OUT+'g3_pin.png')
    stap('13', t13)
    c.close()
    c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True); pg=c.new_page(); pg.on('pageerror',lambda e:fouten.append('tel '+str(e)))
    pg.goto(U+'femke'); pg.wait_for_selector('nav'); pg.wait_for_load_state('networkidle')
    def t13b():
        pg.click('nav button[data-view="relaties"]'); pg.wait_for_selector('#crmInhoud [data-crm-open="school:s1"]'); pg.click('#crmInhoud [data-crm-open="school:s1"]'); pg.wait_for_selector('#crmDetailScherm [data-pin]')
        pg.click('#crmDetailScherm [data-pin]'); pg.wait_for_timeout(300)
        pg.click('nav button[data-view="vandaag"]'); pg.wait_for_timeout(600)
        ok('13 telefoon: pin bovenaan Vandaag', pg.locator('#vandaagPins a[data-crm-open="school:s1"]').is_visible())
        ok('13 telefoon: geen tijdlijn-chip', pg.evaluate("projectWeergaven().some(function(w){return w[0]==='tijdlijn'})")==False)
        pg.screenshot(path=OUT+'g3_tel.png')
    stap('13b', t13b)
srv.shutdown()
print('\n'.join(res)); print('pageerrors:', fouten or 'geen')
sys.exit(1 if any(r.startswith('FOUT') for r in res) or fouten else 0)
