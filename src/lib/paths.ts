/**
 * The website can be served from the root of a domain ("/") or from a sub-folder
 * (GitHub Pages project sites use "/<repository-name>/"). Vite exposes that folder
 * as import.meta.env.BASE_URL; these helpers add it where a plain "/..." would break.
 */
const base = import.meta.env.BASE_URL || '/'

/** Public file from the public/ folder, e.g. assetUrl('/assets/gems-logo.png'). */
export const assetUrl = (path: string) => base + path.replace(/^\//, '')

/** Address of a page in this app for use in a plain <a href>, e.g. appPath('/login'). */
export const appPath = (path: string) => base.replace(/\/$/, '') + (path.startsWith('/') ? path : `/${path}`)

/** Value for <BrowserRouter basename>. */
export const routerBase = base.replace(/\/$/, '') || undefined
