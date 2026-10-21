# v6.8–v7.0: handigheidjes in de demo (slepen, ongedaan maken, vegen, recent, toetsenbord, commandobalk, selectie, voorbeeld,
# vervolgstap, link, tijdlijn, vastpinnen). Gebruik: python3 test/handig/golf1.py — eindigt met de regels OK/FOUT en exitcode 1 bij een FOUT.
import os, sys, threading,functools,http.server,socketserver,sys
from playwright.sync_api import sync_playwright
class S(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(('127.0.0.1',8775),functools.partial(S,directory=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
threading.Thread(target=srv.serve_forever,daemon=True).start()
U='http://127.0.0.1:8775/?demo=1&kaal=1&rol='
import os; OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots', 'handig') + os.sep; os.makedirs(OUT, exist_ok=True)
fouten=[]; res=[]
def ok(naam, v): res.append(('OK ' if v else 'FOUT ')+naam)
def kol(pg, sel): return pg.evaluate("(function(){var k=document.querySelector(%r);return k?k.closest('[data-sleepdoel]').getAttribute('data-sleepdoel'):null})()" % sel)
def muis(pg, sel, doel, dy=60):
    a=pg.locator(sel).first.bounding_box(); b=pg.locator(doel).first.bounding_box()
    pg.mouse.move(a['x']+12,a['y']+10); pg.mouse.down(); pg.mouse.move(a['x']+30,a['y']+25,steps=4)
    pg.mouse.move(b['x']+b['width']/2,b['y']+min(dy,b['height']/2),steps=12); pg.wait_for_timeout(100); pg.mouse.up(); pg.wait_for_timeout(1200)
def toastklik(pg, naam):
    try: pg.click('#toast.aan [data-toastactie]', timeout=4000); pg.wait_for_timeout(1200); return True
    except Exception: ok(naam+' (geen toast-knop; toast=%r)' % pg.inner_text('#toast')[:80], False); return False
def nieuw(b, rol, tel=False):
    c=b.new_context(viewport={'width':390,'height':844} if tel else {'width':1440,'height':900}, is_mobile=tel, has_touch=tel)
    pg=c.new_page(); pg.on('pageerror',lambda e:fouten.append(rol+': '+str(e)))
    pg.goto(U+rol); pg.wait_for_selector('nav' if tel else '#zijbalk'); pg.wait_for_load_state('networkidle'); return c,pg
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    # 1 + 6: ongedaan maken en toetsenbord op de pipeline (Lars)
    c,pg=nieuw(b,'lars'); pg.click('.zb-item[data-desk="pipeline"]'); pg.wait_for_selector('.bord .kaartje.sleepbaar')
    sel='[data-sleep="kans:k16"]'; van=kol(pg,sel); muis(pg, sel, '[data-sleepdoel="kans:lead"]')
    ok('1 slepen kans', kol(pg,sel)=='kans:lead'); ok('1 toast heeft Ongedaan maken', pg.locator('#toast.aan [data-toastactie]').count()==1)
    toastklik(pg,'1 ongedaan'); ok('1 ongedaan zet terug', kol(pg,sel)==van)
    pg.locator(sel).focus(); pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(1200); ok('6 ← verplaatst kans een kolom', kol(pg,sel)=='kans:lead'); ok('6 focus blijft op kaart', pg.evaluate("document.activeElement.getAttribute('data-sleep')")=='kans:k16')
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(1200); ok('6 → terug', kol(pg,sel)==van)
    pg.keyboard.press('Enter'); pg.wait_for_selector('.d-naam h2'); ok('6 Enter opent kans', True)
    # 5: recent bekeken (desktop zoekvak)
    pg.click('.zb-item[data-desk="contacten"]'); pg.wait_for_timeout(500); pg.click('#zbZoek'); pg.wait_for_timeout(300)
    ok('5 recent in zoekvak', pg.locator('#zbResultaten.aan a[data-crm-open="kans:k16"]').count()==1)
    ok('5 recent-rij in contacten', pg.locator('.recent-rij a[data-crm-open="kans:k16"]').count()==1)
    c.close()
    # 2: kandidaten per status (Iris)
    c,pg=nieuw(b,'iris'); pg.click('.zb-item[data-desk="bezetting"]'); pg.wait_for_selector('[data-bweergave="status"]'); pg.click('[data-bweergave="status"]'); pg.wait_for_selector('[data-sleepdoel^="kandidaat:"] .kaartje.sleepbaar')
    k=pg.locator('[data-sleepdoel="kandidaat:voorgesteld"] .kaartje.sleepbaar').first; kid=k.get_attribute('data-sleep'); sel='[data-sleep="%s"]'%kid
    muis(pg, sel, '[data-sleepdoel="kandidaat:gesprek"]'); ok('2 kandidaat naar gesprek', kol(pg,sel)=='kandidaat:gesprek')
    toastklik(pg,'2 ongedaan'); ok('2 ongedaan', kol(pg,sel)=='kandidaat:voorgesteld')
    pg.click(sel); pg.wait_for_timeout(600); ok('2 klik opent kandidaatvenster', pg.locator('#venster.aan').count()==1); pg.keyboard.press('Escape')
    pg.screenshot(path=OUT+'g1_kandidaten.png'); c.close()
    # 3: taak naar een andere dag (agenda desktop, Sophie)
    c,pg=nieuw(b,'sophie'); pg.click('.zb-item[data-desk="agenda"]'); pg.wait_for_selector('.dag .ai[data-sleep]')
    t=pg.locator('.dag .ai[data-sleep]').first; tid=t.get_attribute('data-sleep'); sel='.dag [data-sleep="%s"]'%tid; v=kol(pg,sel)
    import datetime; d=datetime.date.fromisoformat(v[5:])+datetime.timedelta(days=1); doel='[data-sleepdoel="taak:%s"]'%d.isoformat()
    muis(pg, sel, doel, 30); ok('3 taak naar volgende dag (agenda)', kol(pg,sel)=='taak:'+d.isoformat())
    pg.screenshot(path=OUT+'g1_agenda.png'); c.close()
    # 3 + 4: week op de telefoon en vegen (Femke)
    c,pg=nieuw(b,'femke',True); cdp=c.new_cdp_session(pg)
    pg.click('nav button[data-view="relaties"]'); pg.click('#crmTabs [data-crmtab="taken"]'); pg.click('[data-taakweergave="week"]'); pg.wait_for_selector('.weekblok [data-sleep^="taak:"]')
    r=pg.locator('.weekblok [data-sleep^="taak:"]').first; tid=r.get_attribute('data-sleep'); sel='.weekblok [data-sleep="%s"]'%tid; v=kol(pg,sel)
    blokken=pg.eval_on_selector_all('.weekblok','l=>l.map(e=>e.getAttribute("data-sleepdoel"))'); naar=blokken[blokken.index(v)+1] if blokken.index(v)+1<len(blokken) else blokken[blokken.index(v)-1]
    pg.locator(sel).scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    a=pg.locator(sel).bounding_box(); mb=pg.evaluate("document.querySelector('main').getBoundingClientRect().bottom"); x,y=a['x']+170,a['y']+15
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]}); pg.wait_for_timeout(500)
    for i in range(1,16): cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y+(mb-25-y)*i/15}]}); pg.wait_for_timeout(30)
    pg.wait_for_timeout(900)  # het scherm schuift aan de onderrand mee
    naar=pg.evaluate("SLEEP&&SLEEP.doel?SLEEP.doel.getAttribute('data-sleepdoel'):null")
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(1300)
    ok('3 week telefoon: taak naar andere dag via onderrand (%s → %s)'%(v,naar), naar is not None and naar!=v and kol(pg,sel)==naar)
    # 4: vegen in de lijst Vandaag (alle taken)
    pg.click('[data-taakweergave="alles"]'); pg.wait_for_selector('#crmInhoud .rij [data-taakklaar]')
    def veeg(rij, dx):
        rij.scroll_into_view_if_needed(); pg.wait_for_timeout(200); a=rij.bounding_box(); x,y=a['x']+a['width']/2,a['y']+a['height']/2
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        for i in range(1,11): cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+dx*i/10,'y':y}]}); pg.wait_for_timeout(16)
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(1200)
    rij=pg.locator('#crmInhoud .rij:has([data-taakklaar])').first; tid=rij.locator('[data-taakklaar]').get_attribute('data-taakklaar')
    veeg(rij, 150); ok('4 veeg rechts = afgevinkt', pg.locator('#crmInhoud [data-taakklaar="%s"]'%tid).count()==0 and 'Ongedaan' in pg.inner_text('#toast'))
    toastklik(pg,'4 ongedaan afvinken')
    rij=pg.locator('#crmInhoud .rij:has([data-taakklaar])').nth(3); tid=rij.locator('[data-taakklaar]').get_attribute('data-taakklaar')
    veeg(rij, -150); ok('4 veeg links = naar morgen (%s)' % pg.inner_text('#toast')[:60], 'morgen' in pg.inner_text('#toast').lower())
    ok('4 geen venster geopend door vegen', pg.locator('#venster.aan').count()==0)
    pg.screenshot(path=OUT+'g1_tel.png'); c.close()
srv.shutdown()
print('\n'.join(res)); print('pageerrors:', fouten or 'geen')
sys.exit(1 if any(r.startswith('FOUT') for r in res) or fouten else 0)
