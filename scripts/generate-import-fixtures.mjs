// Génère les fichiers d'exemple « très sales » de tests/fixtures/import (pnpm fixtures).
// Les fichiers générés sont versionnés ; relancer le script les régénère à l'identique.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'

const out = join(import.meta.dirname, '..', 'tests', 'fixtures', 'import')
mkdirSync(out, { recursive: true })

const NBSP = ' '
const ZW = '​'

// --- 1. CSV très sale : BOM, CRLF, « ; », lignes vides, doublons, e-mails/URLs cassés, en-tête répété ---------
const dirty =
  [
    "Société;Site Web;N° Stand;Secteur d'activité;Contact;Fonction;E-mail",
    'Carrefour SA;WWW.Carrefour.com;stand B12;Retail;MARTIN Jean;Directeur Innovation;Jean.Martin@Carrefour.com',
    ';;;;;;',
    `  Carrefour  ;https://carrefour.com/fr/?utm_source=salon;B12;Distribution;Dr. Sophie Lefèvre;CIO;sophie.lefevre@carrefour.com`,
    'CARREFOUR Group;carrefour.com/;b12;N/A;-;-;-',
    '',
    'Fnac Darty;http://www.fnacdarty.com;N° 4A;Retail;jean-pierre DUPONT;Responsable digital;"Jean-Pierre Dupont <jp.dupont@fnacdarty.com>"',
    '"Dupont & Fils, SARL";<https://dupont-fils.fr>;hall 5 - C21;"Industrie',
    'et logistique";Madame Claire de la Roche;Directrice;mailto:claire@dupont-fils.fr',
    `Orange${NBSP};ORANGE.FR;D07;Télécom;Martin, Jean;DSI;jean@orange`,
    "Société;Site Web;N° Stand;Secteur d'activité;Contact;Fonction;E-mail",
    ';linkedin.com/company/acme;A01;SaaS;Alice Roy;CEO;alice@acme.io',
    'Acme Inc.;pas de site;A01;SaaS;Bob Stone;CTO;bob@acme.io; bob.stone@gmail.com',
    'ACME;contact@acme.io;A01;SaaS;;;',
    `Zalando${ZW};  www.zalando.fr  ;E3;Mode;Hans MÜLLER;Head of Retail Tech;HANS.MULLER@ZALANDO.FR`,
    'Zalando SE;zalando.fr;E3;Mode;Hans MÜLLER;Head of Retail Tech;hans.muller@zalando.fr',
    'Leroy Merlin;https://www.leroymerlin.fr/;F10;Bricolage;Léa Bernard;Chef de projet;lea.bernard@leroymerlin.fr',
    "L'Oréal (France);loreal.com;G02;Beauté;Paul Durand;Directeur e-commerce;p.durand@loreal.com",
    'LOREAL;https://www.loreal.com/fr;G02;Beauté;Paul Durand;;p.durand@loreal.com',
    ';;;;Contact sans société;Directeur;orphan@example.com',
    'Décathlon;decathlon.fr;H15;Sport;Nina PETIT;Product Owner;nina.petit@decathlon',
    'Total;;;;;;',
  ].join('\r\n') + '\r\n'
writeFileSync(join(out, 'participants-sale.csv'), '﻿' + dirty, 'utf8')

// --- 2. CSV « Excel français » en Windows-1252, prénom/nom séparés, téléphone ----------------------------
const w1252 = [
  'Raison sociale;Site internet;Stand;Activité;Prénom;Nom;Poste;Mail;Téléphone',
  'Société Générale;societegenerale.com;B3;Banque;éloïse;GARCIA;Responsable innovation;eloise.garcia@socgen.com;+33 6 12 34 56 78',
  'Crédit Agricole;credit-agricole.fr;B4;Banque;Thomas;Lemaire;Directeur;t.lemaire@ca-sa.fr;01.23.45.67.89',
  'Électricité de France (EDF);edf.fr;C9;Énergie;Zoé;Fabre;Chargée de mission;zoe.fabre@edf.fr;0612345678',
].join('\r\n')
const map1252 = { é: 0xe9, è: 0xe8, É: 0xc9, ï: 0xef, Ö: 0xd6, ç: 0xe7, ô: 0xf4, à: 0xe0 }
writeFileSync(
  join(out, 'participants-excel-fr-windows1252.csv'),
  Buffer.from([...w1252].map((c) => map1252[c] ?? c.charCodeAt(0))),
)

// --- 3. Copier-coller de tableur anglais (tabulations) --------------------------------------------------
writeFileSync(
  join(out, 'participants-paste-english.tsv'),
  [
    'Exhibitor Name\tWebsite\tBooth\tCategory\tFull Name\tTitle\tEmail',
    'Shopify Inc.\tshopify.com\tA10\tE-commerce\tJohn Smith\tVP Sales\tjohn.smith@shopify.com',
    'Salesforce\thttps://www.salesforce.com/eu\tA11\tCRM\tJane Doe\tAccount Executive\tjane.doe@salesforce.com',
    'Adyen N.V.\tadyen.com\tA12\tPayments\t\t\t',
  ].join('\n'),
)

// --- 4. xlsx : lignes vides en tête, nombres, dates, cellules vides -------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const colName = (i) => String.fromCharCode(65 + i)
function xlsx(rows) {
  const sheetRows = rows
    .map((cells, r) => {
      const cs = cells
        .map((v, c) => {
          if (v === null || v === '') return ''
          const ref = `${colName(c)}${r + 1}`
          return typeof v === 'number'
            ? `<c r="${ref}"><v>${v}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cs}</row>`
    })
    .join('')
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Exposants" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  }
  return Buffer.from(
    zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))),
  )
}
writeFileSync(
  join(out, 'participants.xlsx'),
  xlsx([
    [],
    [],
    ['Entreprise', 'Site', 'Stand', 'Secteur', 'Nom du contact', 'Poste', 'Email'],
    [
      'Amazon France',
      'www.amazon.fr',
      12,
      'E-commerce',
      'Marie Curie',
      'Directrice des ventes',
      'marie.curie@amazon.fr',
    ],
    [
      '  Cdiscount  ',
      'cdiscount.com',
      'B7',
      'E-commerce',
      'PASCAL Louis',
      'Acheteur',
      'louis.pascal@cdiscount.com',
    ],
    [],
    ['Veepee', 'veepee.com', 3, '', '', '', ''],
    [
      'Veepee SAS',
      'https://www.veepee.com/fr',
      3,
      'Mode',
      'Anne Lamy',
      'CMO',
      'anne.lamy@veepee.com',
    ],
    [null, 'sansnom.com', 9, '', 'Sans Société', '', 'x@sansnom.com'],
  ]),
)

// --- 5. 5 000 lignes sales, pseudo-aléatoires reproductibles -------------------------------------------------
let seed = 20261002
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
const pick = (a) => a[Math.floor(rnd() * a.length)]
const sectors = [
  'Retail',
  'E-commerce',
  'Paiement',
  'Logistique',
  'Mode',
  'N/A',
  '',
  'SaaS',
  'Marketing',
]
const firsts = [
  'Jean',
  'Marie',
  'léa',
  'PAUL',
  'Sophie',
  'Thomas',
  'Camille',
  'Nina',
  'Hugo',
  'Zoé',
]
const lasts = [
  'Martin',
  'BERNARD',
  'dupont',
  'Petit',
  'Durand',
  'Lefèvre',
  'Roy',
  'Garcia',
  'Fabre',
  'Lemaire',
]
const jobs = [
  'CEO',
  'CTO',
  'Directeur innovation',
  'Responsable digital',
  'Head of Retail Tech',
  '-',
  '',
]
const lines = ['Société;Site Web;Stand;Secteur;Contact;Poste;E-mail']
const companies = Array.from(
  { length: 4200 },
  (_, i) => `Entreprise${i} ${pick(['SAS', 'Group', 'France', 'Tech', 'Labs', 'SA'])}`,
)
for (let i = 0; i < 5000; i++) {
  const c = i < 4200 ? companies[i] : companies[Math.floor(rnd() * 4200)]
  const dom = c.split(' ')[0].toLowerCase()
  const name = rnd() < 0.15 ? c.toUpperCase() : rnd() < 0.1 ? `  ${c}  ` : c
  const site = pick([
    `www.${dom}.com`,
    `https://${dom}.com/`,
    `${dom}.fr`,
    'n/a',
    '',
    `HTTP://WWW.${dom.toUpperCase()}.COM/fr?utm=1`,
  ])
  const first = pick(firsts)
  const last = pick(lasts)
  const mail = rnd() < 0.1 ? `${first}.${last}@${dom}` : `${first}.${last}@${dom}.com`.toLowerCase()
  const contact =
    rnd() < 0.2 ? '' : rnd() < 0.3 ? `${last.toUpperCase()} ${first}` : `${first} ${last}`
  lines.push(
    [
      name,
      site,
      pick(['', `B${i % 99}`, `stand ${i % 50}A`, `Hall ${i % 7} - C${i % 40}`]),
      pick(sectors),
      contact,
      pick(jobs),
      contact ? mail : '',
    ].join(';'),
  )
  if (i % 400 === 0) lines.push(';;;;;;')
}
writeFileSync(join(out, 'participants-5000.csv'), '﻿' + lines.join('\r\n') + '\r\n', 'utf8')

console.log('Fixtures générées dans tests/fixtures/import/')
