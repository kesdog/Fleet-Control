// Shared with the telemetry chart so each IMO keeps one recognizable color across views.
export const vesselColors = ['#0878a9', '#d16b2c', '#58853b', '#8c5aa8', '#b64e73', '#907321'] as const

export function vesselColor(imo: string) {
  let hash = 0
  for (let index = 0; index < imo.length; index += 1) hash = (hash * 31 + imo.charCodeAt(index)) | 0
  return vesselColors[Math.abs(hash) % vesselColors.length]
}
