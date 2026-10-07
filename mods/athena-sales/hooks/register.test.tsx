import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'athena-sales',
  component: 'Pane' as const,
  requestId: 'athena-sales',
  props: { title: 'Sales', isFocused: true, bodyColumns: 100, placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 }, view: {} },
  viewport: { columns: 120, rows: 50, docks: true },
}

const SALES = { command: 'sales', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }

const GEGENEREERD = '2026-10-07T07:45:00+02:00'
const SNAPSHOT = {
  gegenereerd: GEGENEREERD,
  leeg: false,
  fases: [
    { naam: 'Lead', aantal: 2, waarde: 0, zonder_waarde: 2 },
    { naam: 'Voorstel', aantal: 1, waarde: 2500, zonder_waarde: 0 },
  ],
  gesloten: { won: 1, lost: 1 },
  scholen: [
    { id: 10, naam: 'De Regenboog', eigenaar: 'Menno', laatste_contact: '2026-10-06', dagen_stil: 1,
      contact: ['Directeur: J. Jansen'],
      kansen: [{ id: 1, titel: 'Pilot groep 7', fase: 'Voorstel', waarde: 2500, dagen_stil: 10, verwachte_sluiting: '2026-10-10' },
               { id: 2, titel: 'Teamtraining', fase: 'Lead', waarde: null, dagen_stil: 1, verwachte_sluiting: null }],
      taken: [{ id: 100, titel: 'Bellen', vervaldatum: '2026-10-04', dagen_te_laat: 3 }] },
    { id: 12, naam: 'De Wilg', eigenaar: null, laatste_contact: '2026-10-05', dagen_stil: 2,
      contact: [], kansen: [{ id: 3, titel: 'Kennismaking', fase: 'Lead', waarde: null, dagen_stil: 2, verwachte_sluiting: null }],
      taken: [] },
  ],
}

type Ui = { find: (q: { type?: string; text?: string | RegExp }) => Promise<{ text: string; props: Record<string, unknown> } | undefined> }

/** Vindt een Text op patroon en faalt met het patroon in de melding als die er niet is. */
async function zie(ui: Ui, patroon: RegExp) {
  const el = await ui.find({ type: 'Text', text: patroon })
  expect(el?.text ?? `NIET GEVONDEN: ${patroon}`).toMatch(patroon)
  return el!
}

/** De wereld onder de mod: werkmap en paneel-open, die de testkit niet zelf invult. */
function mockWereld(on: On) {
  on('session.cwd', async () => ({ value: '/repo' }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
}

function mockSnapshot(on: On, tekst: string | null) {
  mockWereld(on)
  on('fs.read', async (_$, e) => {
    if (!e.path.endsWith('data/salespaneel.json')) throw new Error('onverwacht pad ' + e.path)
    if (tekst === null) return { deny: 'ENOENT' }
    return { value: tekst }
  })
}

test('weergave-wisselaar: 1/2/3 tonen vandaag, scholen en fases', async ($, on) => {
  mock.clock(on, { now: Date.parse(GEGENEREERD) + 60 * 60 * 1000 })
  mockSnapshot(on, JSON.stringify(SNAPSHOT))
  await $.command.run(SALES)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // Standaard: vandaag, met de drie groepen.
    await zie(ui, /Taken te laat of vandaag/)
    await zie(ui, /De Regenboog: Bellen \(3 dagen te laat\)/)
    await zie(ui, /De Wilg: 2 dagen stil, geen open taak/)
    await zie(ui, /Pilot groep 7 \(sluit over/)
    await ui.press({ key: 'w2' })
    await zie(ui, /De Regenboog: 2 kansen €2.500 \(\+1 onbekend\), 1 taken, 1 dag stil/)
    await ui.press({ key: 'j' })
    await zie(ui, /^> De Wilg/)
    await ui.press({ key: 'w3' })
    await zie(ui, /Lead: 2 kansen, onbekend \(2 zonder waarde\)/)
    expect(await ui.find({ type: 'Text', text: /gesloten: 1 won \/ 1 lost/ })).toBeDefined()
    await ui.press({ key: 'w1' })
    await ui.unmount()
  }
})

test('ouderdomsmerk: vers is dim, ouder dan een dag is rood en zegt gisteren', async ($, on) => {
  // De mock-klok loopt niet terug: per surface een vers snapshot, dan de klok 30 uur verder.
  const klok = mock.clock(on, { now: Date.parse(GEGENEREERD) + 2 * 60 * 60 * 1000 })
  let gegenereerd = GEGENEREERD
  mockWereld(on)
  on('fs.read', async () => ({ value: JSON.stringify({ ...SNAPSHOT, gegenereerd }) }))
  await $.command.run(SALES)
  for (const surface of ['terminal', 'desktop'] as const) {
    gegenereerd = new Date(klok.now() - 2 * 60 * 60 * 1000).toISOString()
    const tijd = gegenereerd.slice(11, 16)
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'r' })
    const vers = await zie(ui, new RegExp(`^snapshot van vandaag ${tijd}`))
    expect(vers.props.color).toBeUndefined()
    expect(vers.props.dimColor).toBe(true)
    await klok.set(klok.now() + 28 * 60 * 60 * 1000)
    await ui.press({ key: 'r' })
    const oud = await zie(ui, new RegExp(`^snapshot van gisteren ${tijd} — druk r`))
    expect(oud.props.color).toBe('red')
    await ui.unmount()
  }
})

test('ontbrekend, leeg en kapot snapshot vallen niet om', async ($, on) => {
  mock.clock(on, { now: Date.parse(GEGENEREERD) })
  let tekst: string | null = null
  mockWereld(on)
  on('fs.read', async () => (tekst === null ? { deny: 'ENOENT' } : { value: tekst }))
  await $.command.run(SALES)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await zie(ui, /^nog geen snapshot, druk r/)
  tekst = JSON.stringify({ ...SNAPSHOT, leeg: true, scholen: [], fases: [] })
  await ui.press({ key: 'r' })
  await zie(ui, /^snapshot is leeg/)
  tekst = JSON.stringify(SNAPSHOT)
  await ui.press({ key: 'r' })
  expect(await ui.find({ type: 'Text', text: /^snapshot is leeg/ })).toBeUndefined()
  tekst = '{ kapot'
  await ui.press({ key: 'r' })
  // Vorige stand blijft staan, met de waarschuwing erbij.
  await zie(ui, /^snapshot kapot/)
  await zie(ui, /Taken te laat of vandaag/)
  await ui.unmount()
})
