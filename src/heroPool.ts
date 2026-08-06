import raw from './resources/heroPool.json'

export interface Champion {
  id: string
  name: string
  alias: string
  icon: string | null
  keywords: string[]
}

export const ALL_CHAMPIONS: Champion[] = raw as Champion[]

export function championIconUrl(icon: string | null): string | null {
  if (!icon) return null
  return `${import.meta.env.BASE_URL}hero/${icon}`
}
