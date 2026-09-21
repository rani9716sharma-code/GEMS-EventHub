import { vi } from 'vitest'
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn().mockImplementation(query=>({matches:false,media:query,onchange:null,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn(),dispatchEvent:vi.fn()}))})
window.scrollTo=vi.fn()
window.print=vi.fn()
window.HTMLElement.prototype.scrollIntoView=vi.fn()
