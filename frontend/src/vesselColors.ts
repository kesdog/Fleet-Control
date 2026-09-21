// Shared with the telemetry chart so each IMO keeps one recognizable color across views.
export const vesselColors = ['#0878a9', '#d16b2c', '#58853b', '#8c5aa8', '#b64e73', '#907321', '#247ba0', '#e63946', '#2a9d8f', '#6d597a', '#f4a261', '#3a86ff'] as const
const assignedColors = new Map<string, string>()

export function vesselColor(imo: string) {
  const assigned = assignedColors.get(imo)
  if (assigned) return assigned
  let hash = 0
  for (let index = 0; index < imo.length; index += 1) hash = (hash * 31 + imo.charCodeAt(index)) | 0
  return vesselColors[Math.abs(hash) % vesselColors.length]
}

export function setVesselColor(imo: string, color: string) { assignedColors.set(imo, color) }
