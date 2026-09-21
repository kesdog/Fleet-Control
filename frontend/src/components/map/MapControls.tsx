import { Maximize, Minimize, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Props = { onReset: () => void; onZoomIn: () => void; onZoomOut: () => void; onFullscreen: () => void; fullscreen: boolean; fullscreenAvailable: boolean }

export function MapControls({ onReset, onZoomIn, onZoomOut, onFullscreen, fullscreen, fullscreenAvailable }: Props) {
  const { t } = useTranslation()
  return <div className="map-actions">
    <button type="button" aria-label={t('map.reset')} title={t('map.reset')} onClick={onReset}><RotateCcw aria-hidden="true" size={16} /></button>
    <button type="button" aria-label={t('map.zoomIn')} title={t('map.zoomIn')} onClick={onZoomIn}><ZoomIn aria-hidden="true" size={16} /></button>
    <button type="button" aria-label={t('map.zoomOut')} title={t('map.zoomOut')} onClick={onZoomOut}><ZoomOut aria-hidden="true" size={16} /></button>
    {fullscreenAvailable ? <button type="button" aria-label={fullscreen ? t('map.exitFullscreen') : t('map.enterFullscreen')} title={fullscreen ? t('map.exitFullscreen') : t('map.enterFullscreen')} onClick={onFullscreen}>{fullscreen ? <Minimize aria-hidden="true" size={16} /> : <Maximize aria-hidden="true" size={16} />}</button> : null}
  </div>
}
