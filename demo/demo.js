/* Athena Assistent — demomodus (v4.3). Laadt de echte backend (backend/Code.gs) met fictieve gegevens in een verborgen iframe,
 * zodat de app zonder koppeling werkt. index.html laadt dit bestand alleen bij ?demo=1. Wijzigingen blijven in deze browsertab
 * (sessionStorage) tot "Opnieuw"; de echte koppeling in localStorage wordt niet aangeraakt.
 * Parameters: rol=<voornaam> (bekijk als), kaal=1 (zonder demobalk, voor screenshots), schaal=groot (v7.4: het profiel met verzonnen
 * gegevens op de schaal van de praktijk, demo/demo-groot.js; dat bewaart alleen zijn wijzigingen ten opzichte van de opnieuw opgebouwde basis,
 * en alleen voor dezelfde dag). v7.4 (iOS-review): bewaren ook bij visibilitychange naar hidden; lukt het bewaren niet (opslag vol), dan
 * gaat de oude stand weg en zegt de demobalk het, zodat herladen nooit stil een oudere stand terugzet. */
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
      if (v !== null && k === SLEUTEL && volGemeld) { volGemeld = false; if (meldTekst === OPSLAG_VOL) melding(''); }  // v7.4: het bewaren lukt weer
    } catch (e) {
      if (v === undefined || v === null) return '';
      // v7.4 (iOS-review): een mislukte setItem (QuotaExceededError; het quotum is per origin en gedeeld) liet de vorige stand staan, zodat
      // herladen stil een oudere stand terugzette. Liever geen stand dan een oude, en één keer een melding in de demobalk.
      try { sessionStorage.removeItem(k); } catch (e2) {}
      if (k === SLEUTEL && !volGemeld) { volGemeld = true; melding(OPSLAG_VOL); }
    }
    return '';
  }
  // v7.4 (iOS-review): korte melding in de demobalk (niet bij kaal=1); duur in ms, zonder duur blijft hij staan
  var meldTekst = '', meldTimer = null, volGemeld = false, OPSLAG_VOL = 'Wijzigingen worden niet bewaard (opslag vol).';
  function melding(tekst, duur) {
    meldTekst = tekst || ''; clearTimeout(meldTimer);
    var m = document.getElementById('demoMelding'); if (m) m.textContent = meldTekst;
    if (meldTekst && duur) meldTimer = setTimeout(function () { melding(''); }, duur);
  }
  function bekend(r) { return ROLLEN.some(function (x) { return x[0] === r; }); }
  var param = (location.search.match(/[?&]rol=([a-z]+)/) || [])[1] || '';
  var rol = bekend(param) ? param : bekend(sessie('athena_demo_rol')) ? sessie('athena_demo_rol') : 'sophie';
  sessie('athena_demo_rol', rol);
  var kaal = /[?&]kaal=1(&|$)/.test(location.search);
  var portaalModus = /[?&]t=[A-Za-z0-9]{8,80}(&|$)/.test(location.search);  // v5.1: de mail-link van een talent (?demo=1&t=<token>)
  var groot = /[?&]schaal=groot(&|$)/.test(location.search);  // v7.4: profiel op echte schaal (alleen via de url, zodat ?demo=1 altijd de gewone demo is)
  var klaar = null, opslaanTimer = null, gestopt = false, venster = null;
  // met versie: een sessie van een oudere demo wordt niet teruggezet; v7.4: het grote profiel heeft een eigen sleutel (andere vorm: alleen de wijzigingen)
  var SLEUTEL = groot ? 'athena_demo_groot_v7.4' : 'athena_demo_data_v4.3';
  var schaalParam = groot ? '&schaal=groot' : '';

  function haal(pad) {
    return fetch(pad, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('demo: ' + pad + ' niet gevonden'); return r.text(); });
  }
  // Code.gs en de nagebootste Apps Script-diensten draaien in een eigen venster: hun globale namen botsen dan niet met die van de app.
  function start() {
    if (klaar) return klaar;
    klaar = Promise.all([haal('demo/demo-backend.js'), haal('backend/Code.gs')].concat(groot ? [haal('demo/demo-groot.js')] : [])).then(function (t) {
      var f = document.createElement('iframe');
      f.title = 'demo-backend'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
      f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(f);
      var w = f.contentWindow;
      w.eval(t.join('\n;\n') + '\n;\n//# sourceURL=demo-backend-code.js');
      if (!groot) w.demoStart(sessie(SLEUTEL));
      else if (w.demoGrootStart(sessie(SLEUTEL)) === 'vernieuwd') {  // v7.4: demoGrootStart bouwt de basis en zet de bewaarde wijzigingen terug
        sessie(SLEUTEL, null);  // v7.4 (iOS-review): een stand van een andere dag past niet op de basis van vandaag
        melding('De demo is voor vandaag opnieuw opgebouwd.', 10000);
      }
      venster = w;
      return w;
    });
    klaar.catch(function () { klaar = null; });
    return klaar;
  }
  function bewaarNu() { clearTimeout(opslaanTimer); if (venster && !gestopt) sessie(SLEUTEL, groot ? venster.demoGrootExport() : venster.demoExport()); }  // v7.4: groot bewaart alleen de wijzigingen
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
  // v5.1: het talentportaal tegen dezelfde nagebootste backend; het token vervangt de koppelcode (zie demoPortaal in demo-backend.js)
  function portaal(fn, args, token) {
    return start().then(function (w) {
      var tekst = w.demoPortaal(fn, JSON.stringify(args || []), token);
      bewaar();
      return JSON.parse(tekst);
    });
  }
  function opnieuw() { gestopt = true; clearTimeout(opslaanTimer); sessie(SLEUTEL, null); location.reload(); }
  function wissel(nieuw) {
    bewaarNu();
    sessie('athena_demo_rol', nieuw);
    location.href = location.pathname + '?demo=1&rol=' + nieuw + (kaal ? '&kaal=1' : '') + schaalParam;  // v7.4: het profiel blijft bij een andere rol
  }
  function balk() {
    if (kaal || document.getElementById('demoBalk')) return;
    var st = document.createElement('style');
    st.textContent = '#demoBalk{position:fixed;z-index:60;right:calc(10px + env(safe-area-inset-right));bottom:calc(70px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:8px;' +
      'background:var(--paars-d);color:#fff;border-bottom:3px solid var(--oranje);border-radius:12px;padding:6px 8px 6px 12px;font-size:12px;font-weight:700;box-shadow:0 6px 18px rgba(36,26,40,.22);max-width:calc(100% - 20px);flex-wrap:wrap}' +
      '#demoMelding{flex-basis:100%}#demoMelding:empty{display:none}' +  // v7.4 (iOS-review): de melding op een eigen regel
      '#demoBalk select{font-size:13px;font-weight:700;border:0;border-radius:8px;padding:5px 6px;min-height:32px;max-width:170px;background:#fff;color:var(--inkt)}' +
      '#demoBalk button{font-size:12px;font-weight:800;border:1.5px solid rgba(255,255,255,.5);background:none;color:#fff;border-radius:8px;padding:5px 9px;min-height:32px;cursor:pointer}' +
      'body.desk #demoBalk{bottom:calc(14px + env(safe-area-inset-bottom));right:calc(14px + env(safe-area-inset-right))}' +
      '@media (max-width:359px){#demoBalk span{display:none}}';
    document.head.appendChild(st);
    var b = document.createElement('div'); b.id = 'demoBalk';
    if (portaalModus) {  // v5.1: in het portaal geen rolkeuze; terug naar de app als talentteam, dat ziet de bevestiging dan op het profiel
      b.innerHTML = '<span>Demo · zo ziet een talent de mail-link</span><button type="button">Naar de app</button><div id="demoMelding" role="status"></div>';
      b.querySelector('button').addEventListener('click', function () { bewaarNu(); location.href = location.pathname + '?demo=1&rol=' + (rol === 'sophie' ? 'iris' : rol) + schaalParam; });
      document.body.appendChild(b); melding(meldTekst);
      return;
    }
    var opties = ROLLEN.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === rol ? ' selected' : '') + '>' + r[1] + ' · ' + r[2] + '</option>'; }).join('');
    b.innerHTML = '<span>Demo · fictief' + (groot ? ' · groot' : '') + '</span><select aria-label="Bekijk als">' + opties + '</select><button type="button">Opnieuw</button><div id="demoMelding" role="status"></div>';  // v7.4
    b.querySelector('select').addEventListener('change', function () { wissel(this.value); });
    b.querySelector('button').addEventListener('click', function () { if (confirm('Alle wijzigingen in de demo wissen en opnieuw beginnen?')) opnieuw(); });
    document.body.appendChild(b); melding(meldTekst);  // v7.4: een melding van vóór de balk alsnog tonen
  }
  window.AthenaDemo = { run: run, portaal: portaal, rol: rol, opnieuw: opnieuw, groot: groot };
  window.addEventListener('pagehide', bewaarNu);  // iOS bevriest timers als de app naar de achtergrond gaat
  // v7.4 (iOS-review): bij wisselen van app komt op iOS meestal alleen visibilitychange; de timer van bewaar() staat dan stil
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') bewaarNu(); });
  if (document.body) balk(); else document.addEventListener('DOMContentLoaded', balk);
})();
