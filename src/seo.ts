const SITE_NAME = 'BoardBrawl'
const BASE_URL = import.meta.env.VITE_SITE_URL || 'http://localhost:5173'

export const seoDefaults = {
  siteName: SITE_NAME,
  baseUrl: BASE_URL.replace(/\/$/, ''),
  title: `${SITE_NAME} | The Ultimate Game Night Scorekeeper`,
  description:
    'Manage casual, multi-game tournaments for friends and family with live leaderboards, custom scoring, and rich player stats.',
  image: '/og-image.png',
  locale: 'en_US',
}

export function buildCanonical(path = '/') {
  const cleanedPath = path.startsWith('/') ? path : `/${path}`
  return `${seoDefaults.baseUrl}${cleanedPath}`
}

export function absoluteImage(path?: string) {
  const candidate = path || seoDefaults.image
  if (candidate.startsWith('http')) return candidate
  return `${seoDefaults.baseUrl}${candidate.startsWith('/') ? candidate : `/${candidate}`}`
}

