import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_TEMPLATES,
  CSV_FIELDS,
  CUSTOM_TEMPLATE,
  buildCsv,
  safeCell,
  toCsv,
  type CsvTemplate,
} from '@shared/exports/csv.ts'
import { applyFilters } from '@shared/exports/select.ts'
import { NO_FILTERS } from '@shared/exports/types.ts'
import { sampleData } from './fixtures'

const template = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!

function parse(csv: string, delimiter = ',') {
  const r = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), {
    header: true,
    delimiter,
    skipEmptyLines: true,
  })
  expect(r.errors).toEqual([])
  return r
}

describe('écriture CSV (RFC 4180)', () => {
  it('met entre guillemets les séparateurs, guillemets et retours à la ligne', () => {
    const csv = toCsv([['a', 'b,c', 'd"e', 'f\ng']], ',', false)
    expect(csv).toBe('a,"b,c","d""e","f\ng"\r\n')
  })

  it('séparateur point-virgule et BOM UTF-8 facultatif', () => {
    expect(toCsv([['a', 'b;c']], ';', true)).toBe('\uFEFFa;"b;c"\r\n')
    expect(toCsv([['a', 'b,c']], ';', false)).toBe('a;b,c\r\n') // la virgule n'a plus rien de spécial
  })
})

describe('injection de formules', () => {
  it('neutralise =, @ et +/- suivis de texte', () => {
    expect(safeCell('=SOMME(A1)')).toBe("'=SOMME(A1)")
    expect(safeCell('@cmd')).toBe("'@cmd")
    expect(safeCell('-2+3')).toBe("'-2+3")
    expect(safeCell('+cmd|calc')).toBe("'+cmd|calc")
  })

  it('laisse intacts les numéros de téléphone, nombres négatifs et textes ordinaires', () => {
    expect(safeCell('+33 6 12 34 56 78')).toBe('+33 6 12 34 56 78')
    expect(safeCell('+1 (555) 123-4567')).toBe('+1 (555) 123-4567')
    expect(safeCell('-12')).toBe('-12')
    expect(safeCell('Carrefour')).toBe('Carrefour')
    expect(safeCell('')).toBe('')
  })
})

describe('modèle HubSpot', () => {
  const { csv, rows, skippedOptOut } = buildCsv(sampleData(), template('hubspot'))
  const parsed = parse(csv)

  it('a les en-têtes attendus par HubSpot', () => {
    expect(parsed.meta.fields).toEqual([
      'First Name',
      'Last Name',
      'Email',
      'Phone Number',
      'Job Title',
      'Company Name',
      'Company Domain Name',
      'Website URL',
      'City',
      'Country/Region',
      'Lead Status',
      'Lifecycle Stage',
    ])
  })

  it('une ligne par contact ; les contacts désinscrits et les entreprises sans contact sont exclus', () => {
    expect(rows).toBe(3) // Jean Martin, Alice Durand, Mallory (Paula est désinscrite)
    expect(skippedOptOut).toBe(1)
    expect(parsed.data.map((r) => r['Email'])).toEqual([
      'jean.martin@carrefour.com',
      'alice@decathlon.com',
      'm@zalando.com',
    ])
    expect(csv).not.toContain('paula@carrefour.com')
  })

  it('reprend les données du contact et de l’entreprise', () => {
    const jean = parsed.data[0]!
    expect(jean).toMatchObject({
      'First Name': 'Jean',
      'Last Name': 'Martin',
      'Phone Number': '+33 6 12 34 56 78',
      'Job Title': 'Directeur innovation',
      'Company Name': 'Carrefour',
      'Company Domain Name': 'carrefour.com',
      'Website URL': 'https://carrefour.com',
      'Lifecycle Stage': 'lead',
    })
  })

  it('convertit le statut fair en statut HubSpot (dernière rencontre de l’entreprise)', () => {
    const byEmail = Object.fromEntries(parsed.data.map((r) => [r['Email'], r['Lead Status']]))
    expect(byEmail['jean.martin@carrefour.com']).toBe('IN_PROGRESS') // dernière rencontre : à relancer
    expect(byEmail['alice@decathlon.com']).toBe('IN_PROGRESS')
    expect(byEmail['m@zalando.com']).toBe('ATTEMPTED_TO_CONTACT') // manqué
  })

  it('échappe correctement virgules et guillemets dans les valeurs', () => {
    const alice = parsed.data[1]!
    expect(alice['Last Name']).toBe('Durand, Dupont')
    expect(alice['Job Title']).toBe('Head of "Digital"')
  })

  it('neutralise une tentative d’injection de formule', () => {
    const mallory = parsed.data[2]!
    expect(mallory['First Name']!.startsWith("'=HYPERLINK")).toBe(true)
    expect(mallory['Job Title']).toBe("'-2+3")
  })
})

describe('modèle Salesforce', () => {
  const parsed = parse(buildCsv(sampleData(), template('salesforce')).csv)

  it('a les en-têtes d’un import de leads Salesforce', () => {
    expect(parsed.meta.fields).toEqual([
      'First Name',
      'Last Name',
      'Company',
      'Title',
      'Email',
      'Phone',
      'Website',
      'City',
      'Country',
      'Industry',
      'Lead Source',
      'Status',
      'Rating',
      'Description',
    ])
  })

  it('statut, note (Hot / Warm / Cold) et source = le salon', () => {
    const jean = parsed.data.find((r) => r['Email'] === 'jean.martin@carrefour.com')!
    expect(jean).toMatchObject({
      Company: 'Carrefour',
      Status: 'Working - Contacted',
      Rating: 'Hot',
      'Lead Source': 'Tech For Retail 2027',
    })
    expect(parsed.data.find((r) => r['Email'] === 'alice@decathlon.com')!.Rating).toBe('Warm')
    expect(parsed.data.find((r) => r['Email'] === 'm@zalando.com')!.Rating).toBe('Cold')
  })

  it('met les notes dans « Description »', () => {
    const jean = parsed.data.find((r) => r['Email'] === 'jean.martin@carrefour.com')!
    expect(jean['Description']).toBe(
      '12/05/2027 : Décideur présent, budget validé T3 – très intéressé par l’offre « caisse mobile ».',
    )
  })
})

describe('modèle personnalisé', () => {
  it('suit les colonnes, valeurs constantes et correspondances choisies', () => {
    const custom: CsvTemplate = {
      ...CUSTOM_TEMPLATE,
      delimiter: ',',
      bom: false,
      columns: [
        { header: 'Société', source: { field: 'company.name' } },
        { header: 'Origine', source: { value: 'Salon' } },
        { header: 'Niveau', source: { field: 'target.priority' }, map: { A: 'Chaud', B: 'Tiède' } },
        { header: 'Statut CRM', source: { field: 'meeting.status' }, map: { done: 'Gagné' } },
      ],
    }
    const parsed = parse(buildCsv(sampleData(), custom).csv)
    expect(parsed.meta.fields).toEqual(['Société', 'Origine', 'Niveau', 'Statut CRM'])
    const carrefour = parsed.data.find((r) => r['Société'] === 'Carrefour')!
    expect(carrefour).toMatchObject({
      Origine: 'Salon',
      Niveau: 'Chaud',
      'Statut CRM': 'follow_up',
    }) // pas de correspondance → valeur brute
    expect(parsed.data.find((r) => r['Société'] === 'Zalando')!.Niveau).toBe('C') // idem
  })

  it('le modèle par défaut garde les entreprises sans contact et écrit en UTF-8 avec BOM', () => {
    const { csv, rows } = buildCsv(sampleData(), CUSTOM_TEMPLATE)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain(';')
    expect(rows).toBe(3 + 3) // 3 contacts + Fnac, Amazon, Leroy Merlin (sans contact)
    const parsed = parse(csv, ';')
    expect(parsed.data.map((r) => r['Entreprise'])).toContain('Amazon France')
  })

  it('peut inclure les contacts désinscrits si on le demande', () => {
    const { csv } = buildCsv(sampleData(), { ...template('hubspot'), excludeOptOut: false })
    expect(csv).toContain('paula@carrefour.com')
  })

  it('une source inconnue donne une colonne vide, sans planter', () => {
    const t: CsvTemplate = {
      ...CUSTOM_TEMPLATE,
      bom: false,
      columns: [
        { header: 'X', source: { field: 'nope' } },
        { header: 'Nom', source: { field: 'company.name' } },
      ],
    }
    const parsed = parse(buildCsv(sampleData(), t).csv, ';')
    expect(parsed.data[0]!['X']).toBe('')
  })
})

describe('filtres appliqués au CSV', () => {
  it('ne garde que les contacts des entreprises retenues', () => {
    const data = applyFilters(sampleData(), { ...NO_FILTERS, priorities: ['A'] })
    const parsed = parse(buildCsv(data, template('hubspot')).csv)
    expect(parsed.data.map((r) => r['Company Name'])).toEqual(['Carrefour'])
  })
})

describe('champs disponibles', () => {
  it('chaque champ a une clé unique et un libellé', () => {
    const keys = CSV_FIELDS.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(CSV_FIELDS.every((f) => f.label.length > 0)).toBe(true)
  })

  it('tous les champs des modèles fournis existent', () => {
    const keys = new Set(CSV_FIELDS.map((f) => f.key))
    for (const t of [...BUILTIN_TEMPLATES, CUSTOM_TEMPLATE]) {
      for (const c of t.columns)
        if ('field' in c.source) expect(keys.has(c.source.field)).toBe(true)
    }
  })
})
