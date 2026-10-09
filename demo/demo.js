/* Athena Assistent — demomodus (v4.3). Laadt de echte backend (backend/Code.gs) met fictieve gegevens in een verborgen iframe,
 * zodat de app zonder koppeling werkt. index.html laadt dit bestand alleen bij ?demo=1. Wijzigingen blijven in deze browsertab
 * (sessionStorage) tot "Opnieuw"; de echte koppeling in localStorage wordt niet aangeraakt.
 * Parameters: rol=<voornaam> (bekijk als), kaal=1 (zonder demobalk, voor screenshots). */
(function () {
  var ROLLEN = [
    ['sophie', 'Sophie de Graaf', 'management'], ['thomas', 'Thomas Verbeek', 'management'],
    ['yara', 'Yara El Amrani', 'teamlead consultancy'], ['lars', 'Lars Visser', 'onderwijsconsultant'], ['noor', 'Noor Hendriks', 'onderwijsconsultant'],
    ['bas', 'Bas Meijer', 'teamlead accountmanagement'], ['femke', 'Femke de Wit', 'accountmanager'], ['ruben', 'Ruben Smit', 'accountmanager'],
    ['iris', 'Iris Mulder', 'teamlead talent'], ['sem', 'Sem de Boer', 'talentscout']
  ];
  function sessie(k, v) {
    try {
      if (v === undefined) return sessionStorage.getItem(k) || '';
      if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v);
    } catch (e) {}
    return '';
  }
  function bekend(r) { return ROLLEN.some(function (x) { return x[0] === r; }); }
  var param = (location.search.match(/[?&]rol=([a-z]+)/) || [])[1] || '';
  var rol = bekend(param) ? param : bekend(sessie('athena_demo_rol')) ? sessie('athena_demo_rol') : 'sophie';
  sessie('athena_demo_rol', rol);
  var kaal = /[?&]kaal=1(&|$)/.test(location.search);
  var klaar = null, opslaanTimer = null, gestopt = false, venster = null;
  var SLEUTEL = 'athena_demo_data_v4.3';  // met versie: een sessie van een oudere demo wordt niet teruggezet

  function haal(pad) {
    return fetch(pad, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('demo: ' + pad + ' niet gevonden'); return r.text(); });
  }
  // Code.gs en de nagebootste Apps Script-diensten draaien in een eigen venster: hun globale namen botsen dan niet met die van de app.
  function start() {
    if (klaar) return klaar;
    klaar = Promise.all([haal('demo/demo-backend.js'), haal('backend/Code.gs')]).then(function (t) {
      var f = document.createElement('iframe');
      f.title = 'demo-backend'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
      f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(f);
      var w = f.contentWindow;
      w.eval(t[0] + '\n;\n' + t[1] + '\n;\n//# sourceURL=demo-backend-code.js');
      w.demoStart(sessie(SLEUTEL));
      venster = w;
      return w;
    });
    klaar.catch(function () { klaar = null; });
    return klaar;
  }
  function bewaarNu() { clearTimeout(opslaanTimer); if (venster && !gestopt) sessie(SLEUTEL, venster.demoExport()); }
  function bewaar() {
    clearTimeout(opslaanTimer);
    opslaanTimer = setTimeout(bewaarNu, 300);
  }
  function run(fn, args) {
    return start().then(function (w) {
      var tekst = w.demoRun(fn, JSON.stringify(args || []), 'demo-' + rol);
      bewaar();  // na elke aanroep (ook lezen kan iets bijwerken, zoals een migratie of melding)
      return JSON.parse(tekst);
    });
  }
  function opnieuw() { gestopt = true; clearTimeout(opslaanTimer); sessie(SLEUTEL, null); location.reload(); }
  function wissel(nieuw) {
    bewaarNu();
    sessie('athena_demo_rol', nieuw);
    location.href = location.pathname + '?demo=1&rol=' + nieuw + (kaal ? '&kaal=1' : '');
  }
  function balk() {
    if (kaal || document.getElementById('demoBalk')) return;
    var st = document.createElement('style');
    st.textContent = '#demoBalk{position:fixed;z-index:60;right:calc(10px + env(safe-area-inset-right));bottom:calc(70px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:8px;' +
      'background:var(--paars-d);color:#fff;border-bottom:3px solid var(--oranje);border-radius:12px;padding:6px 8px 6px 12px;font-size:12px;font-weight:700;box-shadow:0 6px 18px rgba(36,26,40,.22);max-width:calc(100% - 20px)}' +
      '#demoBalk select{font-size:13px;font-weight:700;border:0;border-radius:8px;padding:5px 6px;min-height:32px;max-width:170px;background:#fff;color:var(--inkt)}' +
      '#demoBalk button{font-size:12px;font-weight:800;border:1.5px solid rgba(255,255,255,.5);background:none;color:#fff;border-radius:8px;padding:5px 9px;min-height:32px;cursor:pointer}' +
      'body.desk #demoBalk{bottom:calc(14px + env(safe-area-inset-bottom));right:calc(14px + env(safe-area-inset-right))}' +
      '@media (max-width:359px){#demoBalk span{display:none}}';
    document.head.appendChild(st);
    var b = document.createElement('div'); b.id = 'demoBalk';
    var opties = ROLLEN.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === rol ? ' selected' : '') + '>' + r[1] + ' · ' + r[2] + '</option>'; }).join('');
    b.innerHTML = '<span>Demo · fictief</span><select aria-label="Bekijk als">' + opties + '</select><button type="button">Opnieuw</button>';
    b.querySelector('select').addEventListener('change', function () { wissel(this.value); });
    b.querySelector('button').addEventListener('click', function () { if (confirm('Alle wijzigingen in de demo wissen en opnieuw beginnen?')) opnieuw(); });
    document.body.appendChild(b);
  }
  window.AthenaDemo = { run: run, rol: rol, opnieuw: opnieuw };
  window.addEventListener('pagehide', bewaarNu);  // iOS bevriest timers als de app naar de achtergrond gaat
  if (document.body) balk(); else document.addEventListener('DOMContentLoaded', balk);
})();
