// v7.2: vaste klok voor test/tz_test.js. Gebruik: VASTE_DATUM=yyyy-MM-dd[THH:mm] node -r test/tz_klok.js <test.js>
// De datum is lokale tijd in de tijdzone van het proces (TZ=...). Zonder VASTE_DATUM doet dit bestand niets.
// Werking: Date wordt vervangen door een Proxy om de echte Date, die "nu" (new Date() zonder argumenten, Date.now(), Date())
// met een vaste afstand verschuift; alles tikt dus gewoon door. Dat gebeurt in het hoofdrealm én in elke vm-context die
// via vm.createContext ontstaat (node_rooktest.js en parser_test.js maken zo'n context met alleen console erin, zodat de
// eigen Date van die context vervangen moet worden: instanceof-checks over realms falen anders).
var vm = require('vm');
var VASTE = process.env.VASTE_DATUM || '';
var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(VASTE);
if (VASTE && !m) { console.log('FOUT tz_klok: VASTE_DATUM moet yyyy-MM-dd of yyyy-MM-ddTHH:mm zijn, niet ' + JSON.stringify(VASTE)); process.exit(2); }
if (m) {
  var vast = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] !== undefined ? Number(m[4]) : 10, Number(m[5] || 0)).getTime();
  var OFFSET = vast - Date.now();
  // Bouwt de nep-Date in het realm waar D (en Proxy/Reflect) vandaan komen; de broncode wordt ook als tekst in een vm-context gezet
  function maakKlok(D, offset) {
    var echtNow = D.now;
    var P = new Proxy(D, {
      construct: function (t, args, nt) { if (!args.length) args = [echtNow() + offset]; return Reflect.construct(t, args, nt === P ? t : nt); },
      apply: function (t, thisArg, args) { return String(new t(echtNow() + offset)); },  // Date() zonder new geeft een tekst
      get: function (t, k) { if (k === 'now') return function () { return echtNow() + offset; }; return Reflect.get(t, k); }
    });
    return P;
  }
  global.Date = maakKlok(Date, OFFSET);
  var echtCreate = vm.createContext;
  vm.createContext = function () {
    var ctx = echtCreate.apply(this, arguments);
    vm.runInContext('var __echteDate = Date; Date = (' + maakKlok.toString() + ')(__echteDate, ' + OFFSET + ');', ctx, { filename: 'tz_klok.js' });
    return ctx;
  };
}
module.exports = { vast: m ? VASTE : '', offset: m ? OFFSET : 0 };
