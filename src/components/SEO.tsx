import { useEffect } from 'react'
import { absoluteImage, buildCanonical, seoDefaults } from '../seo'

type SEOProps = {
  title?: string
  description?: string
  path?: string
  image?: string
  type?: 'website' | 'article'
  noIndex?: boolean
}

function setMetaTag(name: string, content: string, attr: 'name' | 'property' = 'name') {
  const selector = attr === 'name' ? `meta[name="${name}"]` : `meta[property="${name}"]`
  let tag = document.head.querySelector<HTMLMetaElement>(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function setLink(rel: string, href: string) {
  const selector = `link[rel="${rel}"]`
  let link = document.head.querySelector<HTMLLinkElement>(selector)
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', rel)
    document.head.appendChild(link)
  }
  link.setAttribute('href', href)
}

function setStructuredData(id: string, json: Record<string, unknown>) {
  let script = document.head.querySelector<HTMLScriptElement>(`script#${id}`)
  if (!script) {
    script = document.createElement('script')
    script.id = id
    script.type = 'application/ld+json'
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify(json)
}

export function SEO({
  title,
  description,
  path = '/',
  image,
  type = 'website',
  noIndex = false,
}: SEOProps) {
  useEffect(() => {
    const resolvedTitle = title ? `${title} | ${seoDefaults.siteName}` : seoDefaults.title
    const resolvedDescription = description || seoDefaults.description
    const canonical = buildCanonical(path)
    const ogImage = absoluteImage(image)

    document.title = resolvedTitle
    setMetaTag('description', resolvedDescription)
    setMetaTag('robots', noIndex ? 'noindex,nofollow' : 'index,follow')
    setLink('canonical', canonical)

    setMetaTag('og:type', type, 'property')
    setMetaTag('og:site_name', seoDefaults.siteName, 'property')
    setMetaTag('og:title', resolvedTitle, 'property')
    setMetaTag('og:description', resolvedDescription, 'property')
    setMetaTag('og:url', canonical, 'property')
    setMetaTag('og:image', ogImage, 'property')
    setMetaTag('og:locale', seoDefaults.locale, 'property')

    setMetaTag('twitter:card', 'summary_large_image')
    setMetaTag('twitter:title', resolvedTitle)
    setMetaTag('twitter:description', resolvedDescription)
    setMetaTag('twitter:image', ogImage)

    setMetaTag('theme-color', '#D4AF37')
    setMetaTag('color-scheme', 'light')

    setStructuredData('seo-ld-json', {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: seoDefaults.siteName,
      url: seoDefaults.baseUrl,
      description: seoDefaults.description,
      applicationCategory: 'Game',
      operatingSystem: 'Web',
    })
  }, [title, description, path, image, type, noIndex])

  return null
}

