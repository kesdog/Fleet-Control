import { memo } from 'react'
import type { RasterViewport } from '../map/rasterProjection'
import type { ScreenPort } from '../map/ports'

const PORT_FILL = '#f2a62e'
const PORT_STROKE = '#17313b'
const HALO_RING = '#ffffff'

export const PortOverlay = memo(function PortOverlay({ ports, radius, viewport }: { ports: ScreenPort[]; radius: number; viewport: RasterViewport }) {
  if (!ports.length || !viewport.width || !viewport.height) return null
  return <svg className="port-overlay" aria-hidden="true" viewBox={`0 0 ${viewport.width} ${viewport.height}`}>
    {ports.map((port) => <g key={`${port.name}-${port.country}`}>
      <circle cx={port.x} cy={port.y} r={radius + 2} fill={HALO_RING} fillOpacity={0.9} />
      <circle cx={port.x} cy={port.y} r={radius} fill={PORT_FILL} stroke={PORT_STROKE} strokeWidth={1.5} />
    </g>)}
  </svg>
})
