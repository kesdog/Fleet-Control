import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export const supportedLanguages = ['en', 'fr'] as const
export type SupportedLanguage = (typeof supportedLanguages)[number]
const storageKey = 'fleet-control-language'
// Read the saved choice before React renders, avoiding a visible language flash on startup.
const saved = localStorage.getItem(storageKey)
const language = supportedLanguages.includes(saved as SupportedLanguage) ? saved! : 'en'

const en = {
  app: { name: 'Fleet Control Center', version: 'Trajectory assets v0.14.0' },
  actions: { import: 'Import vessel', retry: 'Retry connection' },
  languages: { label: 'Language', en: 'English', fr: 'French' },
  status: { label: 'API status', checking: 'Checking backend', connected: 'Backend connected', degraded: 'Backend degraded', unavailable: 'Backend unavailable', database: 'Database', cache: 'Telemetry cache', connectedValue: 'connected', unavailableValue: 'unavailable', initialized: 'initialized', notInitialized: 'not initialized' },
  controls: { title: 'Data controls', vessel: 'Vessel', metric: 'Metric', start: 'Start', end: 'End', loading: 'Loading vessels', noMetrics: 'No metrics available', invalidRange: 'End must not precede start.' },
  dashboard: { eyebrow: 'Operations workspace', title: 'Inspect the fleet before plotting its course.', description: 'Select an imported vessel and metric to review available telemetry and its origin.', mapTitle: 'Map workspace', mapDescription: 'Geographic trajectory rendering for the selected vessel.', panelTitle: 'Vessel details', emptyTitle: 'No vessels available', emptyDescription: 'Import a vessel to begin.', loading: 'Loading fleet data', range: 'Available range', samples: 'Samples', availableMetrics: 'Available metrics', metricDetails: 'Metric details', unit: 'Unit', origin: 'Origin', sourceColumn: 'Source column', formula: 'Formula', basedOn: 'Based on', warning: 'Warning', measured: 'Measured', estimated: 'Estimated' },
  map: { loading: 'Loading world map', unavailable: 'Unable to load the map.', trajectoryUnavailable: 'Unable to load trajectory.', loadingTrajectory: 'Loading vessel trajectory', trajectoryLoaded: 'Trajectory loaded from the selected range.', worldView: 'World view. Select an imported vessel to plot its route.', reset: 'Reset world view', zoomIn: 'Zoom in', zoomOut: 'Zoom out', canvasLabel: 'Interactive world map', navigationHint: 'Drag to move | Scroll to zoom', position: 'Center: {{latitude}}, {{longitude}} | Zoom: {{zoom}}', trajectoryTooltip: '{{timestamp}} | {{value}} {{unit}}' },
  errors: { title: 'The application could not be displayed.', description: 'Refresh the page to try again.', fleet: 'Unable to load fleet data.', vessel: 'Unable to load vessel details.', retry: 'Retry' },
  metrics: { sog: 'Speed Over Ground', estimated_rpm: 'RPM', estimated_fuel_tpd: 'Fuel consumption', roll: 'Roll', pitch: 'Pitch', yaw: 'Yaw' },
}

const fr = {
  app: { name: 'Centre de controle de flotte', version: 'Trajectoires v0.14.0' },
  actions: { import: 'Importer un navire', retry: 'Reessayer la connexion' },
  languages: { label: 'Langue', en: 'Anglais', fr: 'Francais' },
  status: { label: "Etat de l'API", checking: 'Verification du serveur', connected: 'Serveur connecte', degraded: 'Serveur degrade', unavailable: 'Serveur indisponible', database: 'Base de donnees', cache: 'Cache de telemetrie', connectedValue: 'connectee', unavailableValue: 'indisponible', initialized: 'initialise', notInitialized: 'non initialise' },
  controls: { title: 'Controles des donnees', vessel: 'Navire', metric: 'Metrique', start: 'Debut', end: 'Fin', loading: 'Chargement des navires', noMetrics: 'Aucune metrique disponible', invalidRange: 'La fin doit suivre le debut.' },
  dashboard: { eyebrow: 'Espace operations', title: 'Inspectez la flotte avant de tracer sa route.', description: 'Selectionnez un navire importe et une metrique pour consulter la telemetrie et son origine.', mapTitle: 'Espace carte', mapDescription: 'Affichage de la trajectoire geographique du navire selectionne.', panelTitle: 'Details du navire', emptyTitle: 'Aucun navire disponible', emptyDescription: 'Importez un navire pour commencer.', loading: 'Chargement des donnees de flotte', range: 'Periode disponible', samples: 'Echantillons', availableMetrics: 'Metriques disponibles', metricDetails: 'Details de la metrique', unit: 'Unite', origin: 'Origine', sourceColumn: 'Colonne source', formula: 'Formule', basedOn: 'Basee sur', warning: 'Avertissement', measured: 'Mesuree', estimated: 'Estimee' },
  map: { loading: 'Chargement de la carte mondiale', unavailable: 'Impossible de charger la carte.', trajectoryUnavailable: 'Impossible de charger la trajectoire.', loadingTrajectory: 'Chargement de la trajectoire du navire', trajectoryLoaded: 'Trajectoire chargee pour la periode selectionnee.', worldView: 'Vue mondiale. Selectionnez un navire importe pour tracer sa route.', reset: 'Reinitialiser la vue mondiale', zoomIn: 'Zoomer', zoomOut: 'Dezoomer', canvasLabel: 'Carte mondiale interactive', navigationHint: 'Glissez pour deplacer | Defilez pour zoomer', position: 'Centre : {{latitude}}, {{longitude}} | Zoom : {{zoom}}', trajectoryTooltip: '{{timestamp}} | {{value}} {{unit}}' },
  errors: { title: "L'application ne peut pas etre affichee.", description: 'Actualisez la page pour reessayer.', fleet: 'Impossible de charger les donnees de flotte.', vessel: 'Impossible de charger les details du navire.', retry: 'Reessayer' },
  metrics: { sog: 'Vitesse sur le fond', estimated_rpm: 'RPM', estimated_fuel_tpd: 'Consommation de carburant', roll: 'Roulis', pitch: 'Tangage', yaw: 'Lacet' },
}

// Import this module once from main.tsx before rendering components that call useTranslation.
void i18n.use(initReactI18next).init({ lng: language, fallbackLng: 'en', interpolation: { escapeValue: false }, resources: { en: { translation: en }, fr: { translation: fr } } })
// Keep the compact header choice available after a browser refresh.
i18n.on('languageChanged', (nextLanguage) => localStorage.setItem(storageKey, nextLanguage))
export default i18n
