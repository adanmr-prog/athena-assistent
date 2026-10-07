// athena-sales: salespaneel in Claude Code. Leest data/salespaneel.json
// (geschreven door scripts/salespaneel_data.py) en toont per school de open
// kansen en taken. Weet niets van Capsule, alleen van het snapshotformaat.
import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface, UiPressArgument } from 'claude-code'

import type { Kans, School, Snapshot, Stand, Taak, Weergave } from '../types'

const PLUGIN = 'athena-sales'
const PANE = 'athena-sales'
const SNAPSHOT_PAD = 'data/salespaneel.json'
const DAG_MS = 24 * 60 * 60 * 1000
const VANDAAG_DAGEN = 7 // "Vandaag" kijkt zeven dagen vooruit en terug

const weergave = atom({ plugin: 'athena-sales', key: 'weergave' } as const, 'vandaag' as Weergave)
const geselecteerd = atom({ plugin: 'athena-sales', key: 'geselecteerd' } as const, 0)
const fase = atom({ plugin: 'athena-sales', key: 'fase' } as const, null as string | null)
const stand = atom({ plugin: 'athena-sales', key: 'stand' } as const, {
  snapshot: null,
  fout: null,
  gelezenOp: 0,
} as Stand)

type Engine = EngineInterface

/** Leest het snapshot één keer; bij een kapot bestand blijft de vorige stand staan. */
async function laadSnapshot($: Engine): Promise<void> {
  const nu = await $.clock.now()
  const cwd = await $.session.cwd()
  const pad = `${cwd}/${SNAPSHOT_PAD}`
  let tekst: string
  try {
    const gelezen = await $.fs.read(pad)
    tekst = typeof gelezen === 'string' ? gelezen : ''
  } catch {
    await update($, stand, s => ({ ...s, fout: 'nog geen snapshot, druk r', gelezenOp: nu }))
    return
  }
  let snapshot: Snapshot
  try {
    snapshot = controleer(JSON.parse(tekst))
  } catch (e) {
    const reden = e instanceof Error ? e.message : String(e)
    await update($, stand, s => ({ ...s, fout: `snapshot kapot (${reden}), vorige stand blijft staan`, gelezenOp: nu }))
    return
  }
  await update($, stand, () => ({ snapshot, fout: null, gelezenOp: nu }))
  await update($, geselecteerd, () => 0)
}

/** Minimale vormcontrole: liever een duidelijke fout dan een paneel dat half tekent. */
function controleer(x: unknown): Snapshot {
  if (!x || typeof x !== 'object') throw new Error('geen object')
  const s = x as Partial<Snapshot>
  if (typeof s.gegenereerd !== 'string') throw new Error('gegenereerd ontbreekt')
  if (!Array.isArray(s.scholen)) throw new Error('scholen ontbreekt')
  if (!Array.isArray(s.fases)) throw new Error('fases ontbreekt')
  return {
    gegenereerd: s.gegenereerd,
    leeg: Boolean(s.leeg),
    fases: s.fases,
    gesloten: s.gesloten ?? { won: 0, lost: 0 },
    scholen: s.scholen,
  }
}

function euro(bedrag: number | null): string {
  if (bedrag === null || bedrag === undefined) return 'onbekend'
  return '€' + Math.round(bedrag).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function dagen(n: number | null): string {
  if (n === null || n === undefined) return 'geen contact'
  if (n === 0) return 'vandaag'
  if (n === 1) return '1 dag stil'
  return `${n} dagen stil`
}

/** Ouderdomsmerk: tekst en of het rood moet (ouder dan een dag). */
export function ouderdom(gegenereerd: string, nu: number): { tekst: string; oud: boolean } {
  const t = Date.parse(gegenereerd)
  const tijd = gegenereerd.length >= 16 ? gegenereerd.slice(11, 16) : gegenereerd
  if (Number.isNaN(t)) return { tekst: `snapshot van ${gegenereerd} — druk r`, oud: true }
  const leeftijd = nu - t
  const oud = leeftijd > DAG_MS
  const dagenOud = Math.floor(leeftijd / DAG_MS)
  const wanneer = dagenOud <= 0 ? 'vandaag' : dagenOud === 1 ? 'gisteren' : `${dagenOud} dagen geleden`
  return { tekst: oud ? `snapshot van ${wanneer} ${tijd} — druk r` : `snapshot van ${wanneer} ${tijd}`, oud }
}

function dagenTot(datum: string | null, nu: number): number | null {
  if (!datum) return null
  const t = Date.parse(datum)
  return Number.isNaN(t) ? null : Math.floor((t - nu) / DAG_MS)
}

type VandaagRegel = { school: School; tekst: string }

/** De drie groepen van "Vandaag" (zie de spec): taken, aangeraakt zonder vervolg, sluiting nabij. */
export function vandaagGroepen(snapshot: Snapshot, nu: number): { kop: string; regels: VandaagRegel[] }[] {
  const taken: VandaagRegel[] = []
  const zonderVervolg: VandaagRegel[] = []
  const sluiting: VandaagRegel[] = []
  for (const school of snapshot.scholen) {
    for (const taak of school.taken) {
      const over = dagenTot(taak.vervaldatum, nu)
      if (taak.dagen_te_laat > 0) taken.push({ school, tekst: `${taak.titel} (${taak.dagen_te_laat} dagen te laat)` })
      else if (over !== null && over <= 0) taken.push({ school, tekst: `${taak.titel} (vandaag)` })
    }
    if (school.taken.length === 0 && school.dagen_stil !== null && school.dagen_stil <= VANDAAG_DAGEN && school.kansen.length > 0) {
      zonderVervolg.push({ school, tekst: `${dagen(school.dagen_stil)}, geen open taak` })
    }
    for (const kans of school.kansen) {
      const over = dagenTot(kans.verwachte_sluiting, nu)
      if (over !== null && over <= VANDAAG_DAGEN) {
        sluiting.push({ school, tekst: `${kans.titel} (${over < 0 ? 'sluiting verstreken' : over === 0 ? 'sluit vandaag' : `sluit over ${over} dagen`})` })
      }
    }
  }
  return [
    { kop: 'Taken te laat of vandaag', regels: taken },
    { kop: 'Aangeraakt zonder vervolgactie', regels: zonderVervolg },
    { kop: 'Sluiting binnen 7 dagen', regels: sluiting },
  ]
}

function scholenInFase(snapshot: Snapshot, gekozen: string | null): School[] {
  if (!gekozen) return snapshot.scholen
  return snapshot.scholen.filter(s => s.kansen.some(k => k.fase === gekozen))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sales', description: 'Salespaneel: open kansen en taken per school' })
    return next(e)
  })

  on('command.run', { command: 'sales' }, async $ => {
    await laadSnapshot($)
    await $.ui.open({ id: PANE, title: 'Sales', focus: true })
    return { text: 'Salespaneel geopend. Toetsen: 1/2/3 weergave, j/k regel, f fase, r ververs, v/m/n actie.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [huidig, sel, gekozenFase, st] = await Promise.all([
      read($, weergave), read($, geselecteerd), read($, fase), read($, stand),
    ])
    const nu = await $.clock.now()
    const snapshot = st.snapshot

    const verversen = () => laadSnapshot($)
    const wissel = (naar: Weergave) => update($, weergave, () => naar).then(() => update($, geselecteerd, () => 0))
    const volgendeFase = () => {
      if (!snapshot) return
      const namen = snapshot.fases.map(f => f.naam)
      return update($, fase, f => {
        const i = f === null ? -1 : namen.indexOf(f)
        return i + 1 >= namen.length ? null : (namen[i + 1] ?? null)
      }).then(() => update($, geselecteerd, () => 0))
    }

    // Welke scholen staan in de lijst, zodat j/k en v/m/n weten waar ze op werken.
    let regels: { school: School; tekst: string; kop?: string }[] = []
    if (snapshot) {
      if (huidig === 'vandaag') {
        for (const groep of vandaagGroepen(snapshot, nu)) {
          for (const r of groep.regels) regels.push({ ...r, kop: groep.kop })
        }
      } else if (huidig === 'scholen') {
        regels = scholenInFase(snapshot, gekozenFase).map(school => ({ school, tekst: '' }))
      }
    }
    const max = Math.max(0, regels.length - 1)
    const idx = Math.min(sel, max)
    const gekozen = regels[idx]?.school ?? null
    const schuif = (d: number) => update($, geselecteerd, i => Math.max(0, Math.min(max, i + d)))

    const actie = (soort: 'voorstel' | 'mail' | 'notitie') => (_p: UiPressArgument) => {
      if (!gekozen) return
      const tekst = soort === 'voorstel'
        ? `Maak een samenwerkingsvoorstel voor ${gekozen.naam}.`
        : soort === 'mail'
          ? `Schrijf een opvolgmail voor ${gekozen.naam} in de huisstijl.`
          : `Maak een gespreksnotitie voor ${gekozen.naam}.`
      void $.prompt.fill({ text: tekst })
    }

    const kop = (
      <Box flexDirection="row" gap={1}>
        <Button key="w1" hotkey="1" plain onPress={() => wissel('vandaag')}>vandaag</Button>
        <Button key="w2" hotkey="2" plain onPress={() => wissel('scholen')}>scholen</Button>
        <Button key="w3" hotkey="3" plain onPress={() => wissel('fases')}>fases</Button>
        <Button key="f" hotkey="f" plain onPress={() => volgendeFase()}>{gekozenFase ? `fase: ${gekozenFase}` : 'fase: alle'}</Button>
        <Button key="r" hotkey="r" plain onPress={() => verversen()}>ververs</Button>
      </Box>
    )
    const acties = (
      <Box flexDirection="row" gap={1}>
        <Button key="k" hotkey="k" plain onPress={() => schuif(-1)}>omhoog</Button>
        <Button key="j" hotkey="j" plain onPress={() => schuif(1)}>omlaag</Button>
        <Button key="v" hotkey="v" plain onPress={actie('voorstel')}>voorstel</Button>
        <Button key="m" hotkey="m" plain onPress={actie('mail')}>mail</Button>
        <Button key="n" hotkey="n" plain onPress={actie('notitie')}>notitie</Button>
      </Box>
    )

    if (!snapshot) {
      return (
        <Box flexDirection="column">
          {kop}
          <Text key="melding" color="red">{st.fout ?? 'nog geen snapshot, druk r'}</Text>
        </Box>
      )
    }

    const merk = ouderdom(snapshot.gegenereerd, nu)
    const kinderen: JSX.Element[] = []
    kinderen.push(<Text key="ouderdom" color={merk.oud ? 'red' : undefined} dimColor={!merk.oud}>{merk.tekst}</Text>)
    if (st.fout) kinderen.push(<Text key="fout" color="red">{st.fout}</Text>)

    if (snapshot.leeg) {
      kinderen.push(<Text key="leeg" color="yellow">snapshot is leeg: geen kansen en geen taken in de export (dat is iets anders dan nul open kansen)</Text>)
    } else if (huidig === 'fases') {
      const totaalZonder = snapshot.fases.reduce((n, f) => n + f.zonder_waarde, 0)
      kinderen.push(<Text key="fases-kop" bold>Fase-totalen</Text>)
      for (const f of snapshot.fases) {
        kinderen.push(
          <Text key={`fase-${f.naam}`}>
            {`${f.naam}: ${f.aantal} kansen, ${f.zonder_waarde >= f.aantal ? 'onbekend' : euro(f.waarde)}`}{f.zonder_waarde > 0 ? ` (${f.zonder_waarde} zonder waarde)` : ''}
          </Text>,
        )
      }
      kinderen.push(<Text key="fases-voet" dimColor>{`${totaalZonder} kansen zonder waarde, gesloten: ${snapshot.gesloten.won} won / ${snapshot.gesloten.lost} lost`}</Text>)
    } else if (huidig === 'vandaag') {
      if (regels.length === 0) kinderen.push(<Text key="niets" dimColor>niets voor vandaag</Text>)
      let vorigeKop = ''
      regels.forEach((r, i) => {
        if (r.kop !== vorigeKop) {
          vorigeKop = r.kop ?? ''
          kinderen.push(<Text key={`kop-${vorigeKop}`} bold>{vorigeKop}</Text>)
        }
        kinderen.push(<Text key={`v-${i}`} inverse={i === idx}>{`${i === idx ? '>' : ' '} ${r.school.naam}: ${r.tekst}`}</Text>)
      })
    } else {
      if (regels.length === 0) kinderen.push(<Text key="niets" dimColor>geen scholen in deze fase</Text>)
      regels.forEach((r, i) => {
        const s = r.school
        const waarde = s.kansen.reduce((n, k) => n + (k.waarde ?? 0), 0)
        const onbekend = s.kansen.filter(k => k.waarde === null).length
        kinderen.push(
          <Text key={`s-${i}`} inverse={i === idx}>
            {`${i === idx ? '>' : ' '} ${s.naam}: ${s.kansen.length} kansen ${euro(waarde)}${onbekend ? ` (+${onbekend} onbekend)` : ''}, ${s.taken.length} taken, ${dagen(s.dagen_stil)}`}
          </Text>,
        )
      })
    }

    // Detail van de geselecteerde school.
    if (gekozen && !snapshot.leeg && huidig !== 'fases') {
      kinderen.push(<Text key="detail-kop" bold>{`${gekozen.naam}${gekozen.eigenaar ? ` · ${gekozen.eigenaar}` : ''} · ${dagen(gekozen.dagen_stil)}`}</Text>)
      gekozen.kansen.forEach((k: Kans, i: number) => kinderen.push(
        <Text key={`dk-${i}`}>{`  ${k.fase}: ${k.titel}, ${euro(k.waarde)}${k.verwachte_sluiting ? `, sluiting ${k.verwachte_sluiting}` : ''}, ${dagen(k.dagen_stil)}`}</Text>,
      ))
      gekozen.taken.forEach((t: Taak, i: number) => kinderen.push(
        <Text key={`dt-${i}`} color={t.dagen_te_laat > 0 ? 'red' : undefined}>{`  taak: ${t.titel}${t.vervaldatum ? `, ${t.vervaldatum}` : ''}${t.dagen_te_laat > 0 ? ` (${t.dagen_te_laat} dagen te laat)` : ''}`}</Text>,
      ))
      gekozen.contact.forEach((c: string, i: number) => kinderen.push(<Text key={`dc-${i}`} dimColor>{`  ${c}`}</Text>))
    }

    return (
      <Box flexDirection="column">
        {kop}
        {kinderen}
        {acties}
      </Box>
    )
  })
}

