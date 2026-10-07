// Contract van de mod athena-sales: wat het paneel onthoudt in $.state.

/** Eén open kans van een school, zoals scripts/salespaneel_data.py die schrijft. */
export type Kans = {
  id: number | string | null
  titel: string
  fase: string
  /** Bedrag in euro, of null als Capsule geen waarde kent (telt als onbekend, niet als 0). */
  waarde: number | null
  dagen_stil: number | null
  verwachte_sluiting: string | null
}

/** Eén open taak van een school. */
export type Taak = {
  id: number | string | null
  titel: string
  vervaldatum: string | null
  dagen_te_laat: number
}

export type School = {
  id: number | string | null
  naam: string
  eigenaar: string | null
  laatste_contact: string | null
  dagen_stil: number | null
  /** Contactregels uit het about-veld van de party in Capsule. */
  contact: string[]
  kansen: Kans[]
  taken: Taak[]
}

export type FaseTotaal = {
  naam: string
  aantal: number
  waarde: number
  zonder_waarde: number
}

/** Het snapshotformaat: het enige dat mod en script van elkaar kennen. */
export type Snapshot = {
  /** ISO-tijdstip van de pull, met zone-offset. */
  gegenereerd: string
  leeg: boolean
  fases: FaseTotaal[]
  gesloten: { won: number; lost: number }
  scholen: School[]
}

/** De laatst gelezen stand: het snapshot (of de vorige bij een kapot bestand) en de fout. */
export type Stand = {
  snapshot: Snapshot | null
  fout: string | null
  gelezenOp: number
}

export type Weergave = 'vandaag' | 'scholen' | 'fases'

declare module 'claude-code' {
  interface PluginState {
    'athena-sales': {
      weergave: Weergave
      geselecteerd: number
      fase: string | null
      stand: Stand
    }
  }
}
