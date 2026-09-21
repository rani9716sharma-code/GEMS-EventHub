import { afterAll,afterEach,beforeAll,describe,it,expect,vi } from 'vitest'
import { render,screen,waitFor,cleanup,fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../src/auth/AuthContext'
import { ThemeProvider } from '../src/theme/ThemeContext'
import App from '../src/App'
import { startFixture } from './fixture.mjs'

let fixture:any
const nativeFetch=globalThis.fetch
const failures:string[]=[]
let consoleError:ReturnType<typeof vi.spyOn>
beforeAll(async()=>{
 fixture=await startFixture()
 globalThis.fetch=((input:any,options:any)=>nativeFetch(typeof input==='string'&&input.startsWith('/')?fixture.origin+input:input,options).then(response=>{if(response.status>=500)failures.push(`${input}: ${response.status}`);return response})) as typeof fetch
 consoleError=vi.spyOn(console,'error').mockImplementation((...args)=>failures.push(args.map(String).join(' ')))
})
afterEach(()=>{cleanup();sessionStorage.clear();localStorage.clear();expect(failures.splice(0)).toEqual([])})
afterAll(async()=>{consoleError.mockRestore();globalThis.fetch=nativeFetch;await fixture.stop()})
function page(path:string,role?:string){if(role)sessionStorage.setItem('gemsEventHubAuthToken',fixture.sessions[role].token);return render(<ThemeProvider><MemoryRouter initialEntries={[path]}><AuthProvider><App/></AuthProvider></MemoryRouter></ThemeProvider>)}
const cases:[string,string|undefined][]=[
 ...['/','/events','/gallery','/results','/verify','/contact','/login','/setup','/not-a-page'].map(path=>[path,undefined] as [string,undefined]),
 ...['','/explore','/registrations','/payments','/teams','/rankings','/activity','/results','/certificates','/notifications','/profile'].map(path=>['/student'+path,'Student'] as [string,string]),
 ...['','/events','/events/create','/teams','/scanner','/students','/students/search','/students/registration','/students/payment','/students/identity','/inbox','/notifications','/notifications/registered','/notifications/payment-pending','/notifications/team-leaders','/notifications/attendees-winners','/reports','/reports/registrations','/reports/payments','/reports/attendance','/reports/final'].map(path=>['/coordinator'+path,'Main Coordinator'] as [string,string]),
 ...['','/approvals','/calendar','/reports','/notifications','/reports/registrations','/reports/payments','/reports/attendance'].map(path=>['/hod'+path,'HOD'] as [string,string]),
 ...['','/events','/events/create','/students','/registrations','/users','/gallery','/departments','/library','/venues','/calendar','/reports','/rankings','/audit','/notifications','/settings'].map(path=>['/admin'+path,'Super Admin'] as [string,string]),
 ['/coordinator','Librarian'],['/coordinator/events/create','Librarian'],
]
describe('Real API route rendering',()=>{
 it.each(cases)('%s (%s) renders without component crashes',async(path,role)=>{
  page(path,role)
  await waitFor(()=>expect(document.body.textContent).not.toMatch(/Loading page…|Checking your session/))
  if(role)await screen.findByRole('navigation',{name:'Portal navigation'})
  await waitFor(()=>expect(document.body.textContent).not.toMatch(/Loading (?:EventHub|events|profile|students|payments|dashboard)/i))
  expect(document.querySelector('main')).not.toBeNull()
  expect(document.body.textContent).not.toMatch(/Something went wrong|API route not found|could not complete this request/i)
 })
})
it('theme toggles, persists and survives remount',async()=>{
 page('/contact');const toggle=await screen.findByRole('button',{name:'Switch to dark mode'});fireEvent.click(toggle)
 expect(document.documentElement.dataset.theme).toBe('dark');expect(localStorage.getItem('eventhubTheme')).toBe('dark')
 cleanup();page('/login');await screen.findByRole('button',{name:'Switch to light mode'});expect(document.documentElement.dataset.theme).toBe('dark')
 fireEvent.click(screen.getByRole('button',{name:'Switch to light mode'}));expect(document.documentElement.dataset.theme).toBe('light')
})
it('mobile portal menu supports Escape and restores scrolling',async()=>{
 page('/student','Student');const menu=await screen.findByRole('button',{name:'Open navigation'});fireEvent.click(menu)
 expect(menu.getAttribute('aria-expanded')).toBe('true');fireEvent.keyDown(document,{key:'Escape'});expect(menu.getAttribute('aria-expanded')).toBe('false');expect(document.body.style.overflow).not.toBe('hidden')
})
it('event control center opens operational tabs',async()=>{
 page(`/coordinator/events/${fixture.event.id}`,'Main Coordinator')
 await screen.findByRole('heading',{name:fixture.event.name})
 for(const label of ['Participants','Payments','Attendance','Results','Certificates','Reports']){
  const nav=document.querySelector('.control-nav')!;const button=Array.from(nav.querySelectorAll('button')).find(button=>button.textContent?.endsWith(label))!;fireEvent.click(button)
  await waitFor(()=>expect(document.body.textContent).not.toMatch(/Loading EventHub records|Loading report/i))
  expect(document.body.textContent).not.toMatch(/API route not found|Something went wrong/)
 }
})
it('invalid certificate gives actionable feedback',async()=>{
 page('/verify');await screen.findByRole('heading',{name:/verify/i})
 const input=document.querySelector('input')!;fireEvent.change(input,{target:{value:'invalid-certificate'}});fireEvent.submit(input.closest('form')!)
 await screen.findByText(/No certificate matches this ID/)
})

it('sign out unmounts the authenticated layout without a hook-order crash',async()=>{
 page('/student','Student');fireEvent.click(await screen.findByRole('button',{name:'Sign out'}))
 await screen.findByRole('button',{name:'Sign In'});expect(sessionStorage.getItem('gemsEventHubAuthToken')).toBeNull()
})
