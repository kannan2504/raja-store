/**
 * URL-safe slug helper matching backend and bulk-import logic.
 */
export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
