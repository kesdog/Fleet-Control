import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export const supportedLanguages = ['en', 'fr'] as const
export type SupportedLanguage = (typeof supportedLanguages)[number]
const storageKey = 'fleet-control-language'
// Read the saved choice before React renders, avoiding a visible language flash on startup.
const saved = localStorage.getItem(storageKey)
const language = supportedLanguages.includes(saved as SupportedLanguage) ? saved! : 'en'

// Import this module once from main.tsx before rendering components that call useTranslation.
void i18n.use(initReactI18next).init({
  lng: language,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  resources: {
    en: { translation: { app: { name: 'Fleet Control Center', version: 'Frontend foundation v0.9.0' }, actions: { import: 'Import vessel', retry: 'Retry connection' }, languages: { label: 'Language', en: 'English', fr: 'French' }, status: { label: 'API status', checking: 'Checking backend', connected: 'Backend connected', degraded: 'Backend degraded', unavailable: 'Backend unavailable', database: 'Database', cache: 'Telemetry cache', connectedValue: 'connected', unavailableValue: 'unavailable', initialized: 'initialized', notInitialized: 'not initialized' }, dashboard: { eyebrow: 'Operations workspace', title: 'Fleet view is ready for data controls.', description: 'Connect to the backend, then select vessels, telemetry, and replay controls in the next dashboard milestones.', mapTitle: 'Map workspace', mapDescription: 'Geographic trajectory rendering arrives in v0.11.0.', panelTitle: 'Control surface', panelDescription: 'Vessel, date range, metric, and playback controls arrive in v0.10.0.', emptyTitle: 'No vessel selected', emptyDescription: 'Import a vessel to begin building the fleet view.' }, errors: { title: 'The application could not be displayed.', description: 'Refresh the page to try again.' } } },
    fr: { translation: { app: { name: 'Centre de controle de flotte', version: 'Fondation front-end v0.9.0' }, actions: { import: 'Importer un navire', retry: 'Reessayer la connexion' }, languages: { label: 'Langue', en: 'Anglais', fr: 'Francais' }, status: { label: "Etat de l'API", checking: 'Verification du serveur', connected: 'Serveur connecte', degraded: 'Serveur degrade', unavailable: 'Serveur indisponible', database: 'Base de donnees', cache: 'Cache de telemetrie', connectedValue: 'connectee', unavailableValue: 'indisponible', initialized: 'initialise', notInitialized: 'non initialise' }, dashboard: { eyebrow: 'Espace operations', title: 'La vue flotte est prete pour les controles de donnees.', description: 'Connectez le serveur, puis selectionnez les navires, la telemetrie et les controles de lecture dans les prochaines versions.', mapTitle: 'Espace carte', mapDescription: 'Le rendu des trajectoires geographiques arrive en v0.11.0.', panelTitle: 'Surface de controle', panelDescription: 'Les controles de navire, periode, metrique et lecture arrivent en v0.10.0.', emptyTitle: 'Aucun navire selectionne', emptyDescription: 'Importez un navire pour creer la vue de flotte.' }, errors: { title: "L'application ne peut pas etre affichee.", description: 'Actualisez la page pour reessayer.' } } },
  },
})

// Keep the compact header choice available after a browser refresh.
i18n.on('languageChanged', (nextLanguage) => localStorage.setItem(storageKey, nextLanguage))
export default i18n
