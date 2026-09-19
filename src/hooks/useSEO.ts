import { useEffect } from 'react';

export interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogType?: 'website' | 'product' | 'article';
  ogImage?: string;
  noIndex?: boolean;
  jsonLd?: Record<string, any> | Array<Record<string, any>>;
}

const SITE_NAME = 'Raja Store';
const DEFAULT_URL = 'https://raja-store.vercel.app';

function setMetaTag(attributeName: 'name' | 'property', attributeValue: string, content: string | null) {
  let element = document.querySelector(`meta[${attributeName}="${attributeValue}"]`) as HTMLMetaElement | null;
  if (!content) {
    if (element) {
      element.remove();
    }
    return;
  }
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attributeName, attributeValue);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setLinkTag(rel: string, href: string | null) {
  let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!href) {
    if (element) {
      element.remove();
    }
    return;
  }
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

export function useSEO({
  title,
  description,
  canonical,
  ogType = 'website',
  ogImage,
  noIndex = false,
  jsonLd,
}: SEOProps) {
  useEffect(() => {
    // 1. Page Title
    const formattedTitle = title
      ? (title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`)
      : SITE_NAME;
    document.title = formattedTitle;

    // 2. Meta description
    if (description) {
      setMetaTag('name', 'description', description);
    }

    // 3. Robots
    if (noIndex) {
      setMetaTag('name', 'robots', 'noindex, nofollow');
    } else {
      setMetaTag('name', 'robots', 'index, follow');
    }

    // 4. Canonical URL
    const canonicalUrl = canonical || (typeof window !== 'undefined' ? window.location.href.split('?')[0] : DEFAULT_URL);
    setLinkTag('canonical', canonicalUrl);

    // 5. Open Graph
    setMetaTag('property', 'og:site_name', SITE_NAME);
    setMetaTag('property', 'og:title', formattedTitle);
    if (description) {
      setMetaTag('property', 'og:description', description);
    }
    setMetaTag('property', 'og:type', ogType);
    setMetaTag('property', 'og:url', canonicalUrl);
    if (ogImage) {
      setMetaTag('property', 'og:image', ogImage);
    }

    // 6. Twitter Cards
    setMetaTag('name', 'twitter:card', ogImage ? 'summary_large_image' : 'summary');
    setMetaTag('name', 'twitter:title', formattedTitle);
    if (description) {
      setMetaTag('name', 'twitter:description', description);
    }
    if (ogImage) {
      setMetaTag('name', 'twitter:image', ogImage);
    }

    // 7. Structured Data (JSON-LD)
    const scriptId = 'seo-dynamic-json-ld';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (jsonLd) {
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.id = scriptId;
        scriptEl.type = 'application/ld+json';
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = JSON.stringify(jsonLd);
    } else if (scriptEl) {
      scriptEl.remove();
    }

    // Cleanup JSON-LD on unmount or route change
    return () => {
      const el = document.getElementById(scriptId);
      if (el) {
        el.remove();
      }
    };
  }, [title, description, canonical, ogType, ogImage, noIndex, jsonLd ? JSON.stringify(jsonLd) : null]);
}
