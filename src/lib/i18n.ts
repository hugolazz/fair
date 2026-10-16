import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import auth from '@/locales/fr/auth.json'
import common from '@/locales/fr/common.json'
import companies from '@/locales/fr/companies.json'
import events from '@/locales/fr/events.json'
import importer from '@/locales/fr/import.json'
import manual from '@/locales/fr/manual.json'
import prepare from '@/locales/fr/prepare.json'
import plan from '@/locales/fr/plan.json'
import exportsNs from '@/locales/fr/exports.json'
import settings from '@/locales/fr/settings.json'

export const defaultNS = 'common'

void i18n.use(initReactI18next).init({
  lng: 'fr',
  fallbackLng: 'fr',
  defaultNS,
  ns: [
    'common',
    'auth',
    'events',
    'companies',
    'settings',
    'import',
    'manual',
    'prepare',
    'plan',
    'exports',
  ],
  resources: {
    fr: {
      common,
      auth,
      events,
      companies,
      settings,
      import: importer,
      manual,
      prepare,
      plan,
      exports: exportsNs,
    },
  },
  interpolation: { escapeValue: false },
})

export { i18n }
