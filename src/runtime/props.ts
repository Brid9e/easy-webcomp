import type { PropDefinition, PropType } from './types'

export function attrNameFor(name: string, def: PropDefinition): string {
  return def.attr ?? name.replace(/([A-Z])/g, '-$1').toLowerCase()
}

export function isAttributeChannel(type: PropType): boolean {
  return type === 'string' || type === 'number' || type === 'boolean'
}

export function coerceAttr(raw: string | null, type: PropType): unknown {
  if (raw === null) return undefined
  if (type === 'boolean') return raw !== 'false'
  if (type === 'number') {
    const n = Number(raw)
    return Number.isNaN(n) ? undefined : n
  }
  return raw
}
