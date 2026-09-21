import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { API, useAuth } from '../auth/AuthContext'

const categories = ['College Event','Department Event','Library Event','Sports Event','Cultural Event','Technical Event','Workshop & Seminar']
const departments = ['CSE','Civil','Mechanical','Electrical','EEE']
const venues = ['Auditorium','Seminar Hall','Classroom','Computer Lab','Library Hall','Sports Ground']
const steps = ['Basic Details','Registration','Payment','Eligibility','Venue & Schedule','Coordinators','Review']

const categoryOptions = [
  'College Event',
  'Department Event',
  'Library Event',
  'Sports Event',
  'Cultural Event',
  'Technical Event',
  'Workshop & Seminar',
  'Competition',
  'Hackathon',
  'Training Program',
  'Guest Lecture',
  'Industrial Visit'
]

const scopeOptions = [
  'Department',
  'College',
  'Library',
  'Inter Department',
  'Inter College',
  'State Level',
  'National Level',
  'External'
]

const organizerOptions = [
  'CSE',
  'Civil',
  'Mechanical',
  'Electrical',
  'EEE',
  'Library',
  'Training & Placement Cell',
  'Sports Committee',
  'Cultural Committee',
  'NSS',
  'Innovation Cell',
  'Entrepreneurship Cell',
  'External Organization'
]

function listValue(value:any):string[] {
  if (Array.isArray(value)) return value.map(String)

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {}

    if (value.trim()) {
      return value
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
    }
  }

  return []
}

function dateTimeValue(value:any) {
  if (!value) return ''
  return String(value).replace(' ', 'T').slice(0, 16)
}

type CoordinatorRow={
  id:number
  name:string
  role:string
  department?:string|null
}

type Draft = {
  name:string; description:string; category:string; custom_category:string; organizing_department:string; custom_organizing_department:string; event_scope:string; custom_event_scope:string;
  event_date:string; start_time:string; end_time:string; venue:string; capacity:string;
  registration_open:string; registration_deadline:string; participation_type:'Individual'|'Team'|'Both'; team_min:string; team_max:string;
  allow_student_teams:boolean; allow_coordinator_teams:boolean; team_name_required:boolean; member_approval_required:boolean; coordinator_team_approval_required:boolean; allow_member_replacement:boolean; one_team_per_student:boolean; team_fee_mode:'Per Student'|'Per Team';
  payment_type:'Free'|'Paid'; fee:string; online_payment:boolean; offline_payment:boolean;
  eligible_departments:string[]; eligible_years:string[]; eligible_semesters:string[]; rules:string; prizes:string; requirements:string; contact_info:string; registration_approval_required:boolean; poster_url:string;
}

function dateToDisplay(value:string){
  const datePart = value.split('T')[0]
  if(!datePart) return ''
  const parts = datePart.split('-')
  if(parts.length !== 3) return ''
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function displayToDate(value:string){
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if(!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])

  const test = new Date(year, month - 1, day)

  if(
    test.getFullYear() !== year ||
    test.getMonth() !== month - 1 ||
    test.getDate() !== day
  ){
    return null
  }

  return `${match[3]}-${match[2]}-${match[1]}`
}

export default function CreateEventPage(){
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const editId = Number(searchParams.get('edit') || 0)
  const isEditing = Number.isInteger(editId) && editId > 0

  const [step,setStep] = useState(0)
  const [saving,setSaving] = useState(false)
  const [loadingEvent,setLoadingEvent] = useState(false)
  const [editingStatus,setEditingStatus] = useState('')
  const [error,setError] = useState('')
  const [registrationOpenDisplay,setRegistrationOpenDisplay] = useState('')
  const [registrationDeadlineDisplay,setRegistrationDeadlineDisplay] = useState('')
  const [coordinators,setCoordinators] = useState<CoordinatorRow[]>([])
  const [departmentCoordinatorIds,setDepartmentCoordinatorIds] = useState<number[]>([])
  const [venueDepartment,setVenueDepartment] = useState('')
  const [venueType,setVenueType] = useState('Auditorium')
  const [venueRoom,setVenueRoom] = useState('')

  function buildVenue(
    department:string,
    type:string,
    room:string
  ){
    const parts:string[] = []

    if(type.trim()){
      parts.push(type.trim())
    }

    if(department.trim()){
      parts.push(
        department
          .trim()
          .replace(/\s+Department$/i,'')
      )
    }

    if(room.trim()){
      parts.push(room.trim())
    }

    return parts.join(' - ')
  }
  const [draft,setDraft] = useState<Draft>({
    name:'',description:'',category:'Department Event',custom_category:'',organizing_department:user?.department || 'CSE',custom_organizing_department:'',event_scope:user?.role==='Librarian'?'Library':'Department',custom_event_scope:'',
    event_date:'',start_time:'',end_time:'',venue:'Auditorium',capacity:'',registration_open:'',registration_deadline:'',participation_type:'Individual',team_min:'2',team_max:'4',allow_student_teams:true,allow_coordinator_teams:true,team_name_required:true,member_approval_required:true,coordinator_team_approval_required:true,allow_member_replacement:true,one_team_per_student:true,team_fee_mode:'Per Student',
    payment_type:'Free',fee:'',online_payment:false,offline_payment:false,eligible_departments:departments,eligible_years:['1','2','3'],eligible_semesters:[],rules:'',prizes:'',requirements:'',contact_info:'',registration_approval_required:true,poster_url:''
  })


  useEffect(() => {
    if (!token) return

    async function loadCoordinators() {
      try {
        const department =
          draft.organizing_department === 'Other / Custom'
            ? draft.custom_organizing_department.trim()
            : draft.organizing_department

        const params = new URLSearchParams()

        if (draft.event_scope === 'Department' && department) {
          params.set('department',department)
        }

        const res = await fetch(
          `${API}/api/events/coordinators?${params}`,
          {
            headers:{
              Authorization:`Bearer ${token}`
            }
          }
        )

        const data = await res.json()

        if (!res.ok) {
          throw new Error(
            data.error || 'Could not load coordinators.'
          )
        }

        setCoordinators(data.rows || [])

      } catch (e) {
        console.error(e)
      }
    }

    loadCoordinators()

  },[
    token,
    draft.event_scope,
    draft.organizing_department,
    draft.custom_organizing_department
  ])


  useEffect(() => {
    if (!isEditing || !token) return

    let cancelled = false

    async function loadExistingEvent() {
      setLoadingEvent(true)
      setError('')

      try {
        const res = await fetch(
          `${API}/api/events/${editId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Could not load event.')
        }

        if (cancelled) return

        const event = data.event

        setDepartmentCoordinatorIds(
          (data.department_coordinators || [])
            .map((x:any)=>Number(x.id))
            .filter(Number.isInteger)
        )

        const knownCategory = categoryOptions.includes(event.category)
        const knownScope = scopeOptions.includes(event.event_scope)
        const knownOrganizer = organizerOptions.includes(
          event.organizing_department
        )

        setEditingStatus(event.status || '')

        setDraft({
          name: event.name || '',
          description: event.description || '',

          category: knownCategory
            ? event.category
            : 'Other / Custom',

          custom_category: knownCategory
            ? ''
            : event.category || '',

          organizing_department: knownOrganizer
            ? event.organizing_department
            : 'Other / Custom',

          custom_organizing_department: knownOrganizer
            ? ''
            : event.organizing_department || '',

          event_scope: knownScope
            ? event.event_scope
            : 'Other / Custom',

          custom_event_scope: knownScope
            ? ''
            : event.event_scope || '',

          event_date: event.event_date || '',
          start_time: event.start_time || '',
          end_time: event.end_time || '',
          venue: event.venue || '',
          capacity:
            event.capacity === null ||
            event.capacity === undefined
              ? ''
              : String(event.capacity),

          registration_open:
            dateTimeValue(event.registration_open),

          registration_deadline:
            dateTimeValue(event.registration_deadline),

          participation_type:
            event.participation_type || 'Individual',

          team_min:
            event.team_min == null
              ? '2'
              : String(event.team_min),

          team_max:
            event.team_max == null
              ? '4'
              : String(event.team_max),

          allow_student_teams:
            Boolean(event.allow_student_teams),

          allow_coordinator_teams:
            Boolean(event.allow_coordinator_teams),

          team_name_required:
            event.team_name_required === undefined
              ? true
              : Boolean(event.team_name_required),

          member_approval_required:
            event.member_approval_required === undefined
              ? true
              : Boolean(event.member_approval_required),

          coordinator_team_approval_required:
            event.coordinator_team_approval_required === undefined
              ? true
              : Boolean(event.coordinator_team_approval_required),

          allow_member_replacement:
            event.allow_member_replacement === undefined
              ? true
              : Boolean(event.allow_member_replacement),

          one_team_per_student:
            event.one_team_per_student === undefined
              ? true
              : Boolean(event.one_team_per_student),

          team_fee_mode:
            event.team_fee_mode === 'Per Team'
              ? 'Per Team'
              : 'Per Student',

          payment_type:
            event.payment_type === 'Paid'
              ? 'Paid'
              : 'Free',

          fee:
            event.fee == null
              ? ''
              : String(event.fee),

          online_payment:
            Boolean(event.online_payment),

          offline_payment:
            Boolean(event.offline_payment),

          eligible_departments:
            listValue(event.eligible_departments),

          eligible_years:
            listValue(event.eligible_years),

          eligible_semesters:
            listValue(event.eligible_semesters),

          rules: event.rules || '',
          prizes: event.prizes || '',
          requirements: event.requirements || '',
          contact_info: event.contact_info || '',
          registration_approval_required: event.registration_approval_required === undefined ? true : Boolean(event.registration_approval_required),
          poster_url: event.poster_url || ''
        })

      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : 'Could not load event.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingEvent(false)
        }
      }
    }

    loadExistingEvent()

    return () => {
      cancelled = true
    }

  }, [editId, isEditing, token])

  const selectedDepartment =
    draft.organizing_department === 'Other / Custom'
      ? draft.custom_organizing_department.trim()
      : draft.organizing_department

  const isDepartmentEvent =
    draft.event_scope === 'Department' ||
    draft.category === 'Department Event'

  const visibleDepartmentCoordinators = useMemo(
    () =>
      coordinators.filter(c =>
        c.role === 'Department Coordinator' &&
        (
          !isDepartmentEvent ||
          c.department === selectedDepartment
        )
      ),
    [
      coordinators,
      isDepartmentEvent,
      selectedDepartment
    ]
  )

  useEffect(()=>{
    if (!isDepartmentEvent) return

    setDepartmentCoordinatorIds(prev =>
      prev.filter(id =>
        visibleDepartmentCoordinators.some(
          c => c.id === id
        )
      )
    )
  },[
    isDepartmentEvent,
    selectedDepartment,
    visibleDepartmentCoordinators.length
  ])

  function toggleDepartmentCoordinator(id:number) {
    setDepartmentCoordinatorIds(prev =>
      prev.includes(id)
        ? prev.filter(x=>x!==id)
        : [...prev,id]
    )
  }

  const progress = useMemo(()=>Math.round(((step+1)/steps.length)*100),[step])
  function set<K extends keyof Draft>(key:K,value:Draft[K]){ setDraft(prev=>({...prev,[key]:value})) }
  function toggle(key:'eligible_departments'|'eligible_years'|'eligible_semesters',value:string){
    setDraft(prev=>({...prev,[key]:prev[key].includes(value)?prev[key].filter(x=>x!==value):[...prev[key],value]}))
  }
  function validateStep(){
    if(step===0 && (!draft.name.trim() || !draft.category.trim())) return 'Enter the event name and category.'
    if(step===0 && draft.category==='Other / Custom' && !draft.custom_category.trim()) return 'Enter the custom event category.'
    if(step===0 && draft.event_scope==='Other / Custom' && !draft.custom_event_scope.trim()) return 'Enter the custom event scope.'
    if(step===0 && draft.organizing_department==='Other / Custom' && !draft.custom_organizing_department.trim()) return 'Enter the custom organizing department / unit.'
    if(step===0 && !draft.event_scope.trim()) return 'Enter or select the event scope.'
    if(step===0 && !draft.organizing_department.trim()) return 'Enter or select the organizing department / unit.'
    if(step===1 && draft.capacity && Number(draft.capacity)<1) return 'Capacity must be at least 1.'
    if(step===1 && draft.participation_type!=='Individual' && (Number(draft.team_min)<2 || Number(draft.team_max)<Number(draft.team_min))) return 'Enter a valid team size.'
    if(step===2 && draft.payment_type==='Paid' && (!(Number(draft.fee)>0) || (!draft.online_payment && !draft.offline_payment))) return 'Enter the fee and enable at least one payment method.'
    if(step===4 && (!draft.event_date || !draft.start_time || !draft.venue)) return 'Event date, start time and venue are required.'
    return ''
  }
  function next(){ const message=validateStep(); if(message){setError(message);return} setError(''); setStep(s=>Math.min(steps.length-1,s+1)) }
  function back(){setError('');setStep(s=>Math.max(0,s-1))}

  function handlePoster(file?: File) {
    if (!file) return

    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ]

    if (!allowed.includes(file.type)) {
      setError('Poster must be JPG, PNG or WebP.')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Poster must be 2 MB or smaller.')
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      const value = String(reader.result || '')
      set('poster_url', value)
      setError('')
    }

    reader.onerror = () => {
      setError('Could not read poster image.')
    }

    reader.readAsDataURL(file)
  }

  async function save(submit:boolean){
    const message=validateStep(); if(message){setError(message);return}
    setSaving(true); setError('')
    try{
      const targetUrl = isEditing
        ? `${API}/api/events/${editId}`
        : `${API}/api/events`

      const res=await fetch(targetUrl,{method:isEditing?'PATCH':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({
        ...draft,
        department_coordinator_ids:departmentCoordinatorIds,
        category:draft.category==='Other / Custom'?draft.custom_category.trim():draft.category,
        event_scope:draft.event_scope==='Other / Custom'?draft.custom_event_scope.trim():draft.event_scope,
        organizing_department:draft.organizing_department==='Other / Custom'?draft.custom_organizing_department.trim():draft.organizing_department,
        registration_mode:draft.participation_type==='Individual'?'Individual':'Team',capacity:draft.capacity?Number(draft.capacity):null,fee:draft.payment_type==='Paid'?Number(draft.fee):0,team_min:draft.participation_type!=='Individual'?Number(draft.team_min):null,team_max:draft.participation_type!=='Individual'?Number(draft.team_max):null})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error || data.errors?.[0] || 'Event could not be saved.')
      if(submit && !isEditing && ['Department Coordinator','Librarian'].includes(user?.role || '')){
        const submitRes=await fetch(`${API}/api/events/${data.event.id}/submit`,{method:'POST',headers:{Authorization:`Bearer ${token}`}})
        const submitData=await submitRes.json(); if(!submitRes.ok) throw new Error(submitData.error || 'Event was saved but could not be submitted.')
      }
      navigate(user?.role==='Super Admin'?'/admin/events':'/coordinator/events',{replace:true})
    }catch(e){setError(e instanceof Error?e.message:'Event could not be saved.')}finally{setSaving(false)}
  }

  return <section className="portal-content event-wizard-page">
    <div className="page-toolbar"><div><span className="eyebrow">Event management</span><h2>{isEditing?'Edit Event':'Create Event'}</h2><p>{isEditing?`Update the existing event details. Current status: ${editingStatus || 'Loading…'}`:['Department Coordinator','Librarian'].includes(user?.role || '')
    ? 'Create the event and submit it to your HOD for approval.'
    : 'Create and manage the event. HOD approval is not required for your role.'}</p></div><Link className="button button-ghost" to={user?.role==='Super Admin'?'/admin/events':'/coordinator/events'}>Cancel</Link></div>
    <div className="wizard-shell">
      <aside className="wizard-steps"><div className="wizard-progress"><span style={{width:`${progress}%`}}/></div>{steps.map((name,i)=><button key={name} type="button" className={i===step?'active':i<step?'done':''} onClick={()=>i<=step&&setStep(i)}><span>{i<step?'✓':i+1}</span><div><b>{name}</b><small>{i===step?'Current step':i<step?'Completed':'Next'}</small></div></button>)}</aside>
      <div className="wizard-card">
        <div className="wizard-card-head"><span>Step {step+1} of {steps.length}</span><h3>{steps[step]}</h3></div>
        {error && <div className="form-alert error">{error}</div>}
        {loadingEvent && <div className="form-alert">Loading existing event details…</div>}

        {step===0 && <div className="wizard-form two-col">
          <label className="wide">Event Name<input value={draft.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. GEMS CodeSprint 2026" autoFocus/></label>
          <label>Category
            <select
              value={draft.category}
              onChange={e=>{
                set('category',e.target.value)
                if(e.target.value!=='Other / Custom') set('custom_category','')
              }}
            >
              {categories.map(x=><option key={x} value={x}>{x}</option>)}
              <option value="Competition">Competition</option>
              <option value="Hackathon">Hackathon</option>
              <option value="Training Program">Training Program</option>
              <option value="Guest Lecture">Guest Lecture</option>
              <option value="Industrial Visit">Industrial Visit</option>
              <option value="Other / Custom">Other / Custom</option>
            </select>
          </label>

          <label>Scope
            <select
              disabled={user?.role==='Librarian'}
              value={draft.event_scope}
              onChange={e=>{
                set('event_scope',e.target.value)
                if(e.target.value!=='Other / Custom') set('custom_event_scope','')
              }}
            >
              <option value="Department">Department</option>
              <option value="College">College</option>
              <option value="Library">Library</option>
              <option value="Inter Department">Inter Department</option>
              <option value="Inter College">Inter College</option>
              <option value="State Level">State Level</option>
              <option value="National Level">National Level</option>
              <option value="External">External</option>
              <option value="Other / Custom">Other / Custom</option>
            </select>
          </label>

          {draft.category==='Other / Custom' && (
            <label>
              Custom Category
              <input
                value={draft.custom_category}
                onChange={e=>set('custom_category',e.target.value)}
                placeholder="Type event category"
              />
            </label>
          )}

          {draft.event_scope==='Other / Custom' && (
            <label>
              Custom Scope
              <input
                value={draft.custom_event_scope}
                onChange={e=>set('custom_event_scope',e.target.value)}
                placeholder="e.g. Open to Polytechnic Colleges"
              />
            </label>
          )}

          <label className={
            draft.category==='Other / Custom' ||
            draft.event_scope==='Other / Custom'
              ? ''
              : 'wide'
          }>
            Organizing Department / Unit

            <select
              value={draft.organizing_department}
              disabled={['Department Coordinator','Librarian'].includes(user?.role || '')}
              onChange={e=>{
                set('organizing_department',e.target.value)
                if(e.target.value!=='Other / Custom'){
                  set('custom_organizing_department','')
                }
              }}
            >
              {departments.map(x=><option key={x} value={x}>{x}</option>)}
              <option value="Library">Library</option>
              <option value="Training & Placement Cell">Training & Placement Cell</option>
              <option value="Sports Committee">Sports Committee</option>
              <option value="Cultural Committee">Cultural Committee</option>
              <option value="NSS">NSS</option>
              <option value="Innovation Cell">Innovation Cell</option>
              <option value="Entrepreneurship Cell">Entrepreneurship Cell</option>
              <option value="External Organization">External Organization</option>
              <option value="Other / Custom">Other / Custom</option>
            </select>
          </label>

          {draft.organizing_department==='Other / Custom' && (
            <label className="wide">
              Custom Organizing Department / Unit
              <input
                value={draft.custom_organizing_department}
                onChange={e=>set('custom_organizing_department',e.target.value)}
                placeholder="Type department, cell, club, institute, company, etc."
              />
            </label>
          )}

          <div className="wide event-poster-upload-panel">
            <div className="event-poster-upload-head">
              <div>
                <span className="field-title">Event Poster</span>
                <p>Upload JPG, PNG or WebP. Maximum 2 MB. Recommended 16:9.</p>
              </div>
            </div>

            {draft.poster_url ? (
              <div className="event-poster-preview-wrap">
                <img
                  className="event-poster-preview"
                  src={draft.poster_url}
                  alt="Event poster preview"
                />

                <div className="event-poster-actions">
                  <label className="button button-ghost event-poster-file-button">
                    Change Poster
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={e=>{
                        handlePoster(e.target.files?.[0])
                        e.currentTarget.value=''
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={()=>set('poster_url','')}
                  >
                    Remove Poster
                  </button>
                </div>
              </div>
            ) : (
              <label className="event-poster-dropzone">
                <strong>Upload Event Poster</strong>
                <span>Click to choose an image</span>
                <small>JPG / PNG / WebP • max 2 MB</small>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e=>{
                    handlePoster(e.target.files?.[0])
                    e.currentTarget.value=''
                  }}
                />
              </label>
            )}
          </div>

          <label className="wide">Description<textarea rows={6} value={draft.description} onChange={e=>set('description',e.target.value)} placeholder="Tell students what the event is about, what they will do, and why they should join."/></label>
        </div>}

        {step===1 && <div className="wizard-form two-col">
          <div className="wide">
            <span className="field-title">Participation Type</span>
            <div className="choice-grid three-choice">
              {(['Individual','Team','Both'] as Draft['participation_type'][]).map(type=><button type="button" key={type} className={draft.participation_type===type?'choice-card active':'choice-card'} onClick={()=>set('participation_type',type)}><b>{type}</b><span>{type==='Individual'?'Single student registration':type==='Team'?'Students participate as a team':'Allow both individual and team entries'}</span></button>)}
            </div>
          </div>
          <label>Capacity<input type="number" min="1" value={draft.capacity} onChange={e=>set('capacity',e.target.value)} placeholder="Leave blank for unlimited"/></label>
          <div className="wide approval-choice-panel"><div><b>Student Registration Approval</b><p>Choose whether student registrations need coordinator approval or should be accepted directly.</p></div><div className="choice-grid"><button type="button" className={draft.registration_approval_required?'choice-card active':'choice-card'} onClick={()=>set('registration_approval_required',true)}><b>Approval Required</b><span>Student registers → coordinator approves → payment (if paid) → confirmed</span></button><button type="button" className={!draft.registration_approval_required?'choice-card active':'choice-card'} onClick={()=>set('registration_approval_required',false)}><b>Direct Registration</b><span>Eligible student is accepted immediately; paid events go straight to payment.</span></button></div></div>
          <label>
            Registration Opens
            <div className="registration-datetime-fields">
              <input
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/YYYY"
                value={registrationOpenDisplay}
                onChange={e=>{
                  let value=e.target.value
                    .replace(/[^\d/]/g,'')
                    .slice(0,10)

                  const digits=value.replace(/\//g,'')

                  if(digits.length <= 2){
                    value=digits
                  }else if(digits.length <= 4){
                    value=`${digits.slice(0,2)}/${digits.slice(2)}`
                  }else{
                    value=`${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4,8)}`
                  }

                  setRegistrationOpenDisplay(value)

                  const parsed=displayToDate(value)

                  if(parsed){
                    set(
                      'registration_open',
                      `${parsed}T${draft.registration_open.split('T')[1] || '00:00'}`
                    )
                  }else if(value===''){
                    set('registration_open','')
                  }
                }}
                aria-label="Registration opening date DD/MM/YYYY"
              />
              <input
                type="time"
                value={draft.registration_open.split('T')[1] || ''}
                onChange={e=>set(
                  'registration_open',
                  `${draft.registration_open.split('T')[0] || ''}T${e.target.value}`
                )}
                aria-label="Registration opening time"
              />
            </div>
          </label>

          <label>
            Registration Deadline
            <div className="registration-datetime-fields">
              <input
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/YYYY"
                value={registrationDeadlineDisplay}
                onChange={e=>{
                  let value=e.target.value
                    .replace(/[^\d/]/g,'')
                    .slice(0,10)

                  const digits=value.replace(/\//g,'')

                  if(digits.length <= 2){
                    value=digits
                  }else if(digits.length <= 4){
                    value=`${digits.slice(0,2)}/${digits.slice(2)}`
                  }else{
                    value=`${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4,8)}`
                  }

                  setRegistrationDeadlineDisplay(value)

                  const parsed=displayToDate(value)

                  if(parsed){
                    set(
                      'registration_deadline',
                      `${parsed}T${draft.registration_deadline.split('T')[1] || '00:00'}`
                    )
                  }else if(value===''){
                    set('registration_deadline','')
                  }
                }}
                aria-label="Registration deadline date DD/MM/YYYY"
              />
              <input
                type="time"
                value={draft.registration_deadline.split('T')[1] || ''}
                onChange={e=>set(
                  'registration_deadline',
                  `${draft.registration_deadline.split('T')[0] || ''}T${e.target.value}`
                )}
                aria-label="Registration deadline time"
              />
            </div>
          </label>
          {draft.participation_type!=='Individual' && <>
            <label>Minimum Team Size<input type="number" min="2" value={draft.team_min} onChange={e=>set('team_min',e.target.value)}/></label>
            <label>Maximum Team Size<input type="number" min="2" value={draft.team_max} onChange={e=>set('team_max',e.target.value)}/></label>
            <div className="wide team-rule-panel">
              <div><b>Team Creation & Control</b><small>Choose how students and coordinators can build teams.</small></div>
              <label><input type="checkbox" checked={draft.allow_student_teams} onChange={e=>set('allow_student_teams',e.target.checked)}/> Students can create teams</label>
              <label><input type="checkbox" checked={draft.allow_coordinator_teams} onChange={e=>set('allow_coordinator_teams',e.target.checked)}/> Coordinators can create teams for students</label>
              <label className="team-control-option"><input type="checkbox" checked={draft.team_name_required} onChange={e=>set('team_name_required',e.target.checked)}/> Team name required</label>
              <label><input type="checkbox" checked={draft.member_approval_required} onChange={e=>set('member_approval_required',e.target.checked)}/> Invited members must accept</label>
              <label><input type="checkbox" checked={draft.coordinator_team_approval_required} onChange={e=>set('coordinator_team_approval_required',e.target.checked)}/> Coordinator approval required</label>
              <label className="team-control-option"><input type="checkbox" checked={draft.allow_member_replacement} onChange={e=>set('allow_member_replacement',e.target.checked)}/> Allow member replacement before event lock</label>
              <label className="team-control-option"><input type="checkbox" checked={draft.one_team_per_student} onChange={e=>set('one_team_per_student',e.target.checked)}/> One student can join only one team in this event</label>
            </div>
          </>}
          <div className="wizard-tip wide">For team competitions, a student can create a team and invite members by Student ID. Coordinators can review, correct and approve teams.</div>
        </div>}

        {step===2 && <div className="wizard-form">
          <div className="choice-grid"><button type="button" className={draft.payment_type==='Free'?'choice-card active':'choice-card'} onClick={()=>set('payment_type','Free')}><b>Free Event</b><span>No payment required</span></button><button type="button" className={draft.payment_type==='Paid'?'choice-card active':'choice-card'} onClick={()=>set('payment_type','Paid')}><b>Paid Event</b><span>Online and/or offline collection</span></button></div>
          {draft.payment_type==='Paid' && <div className="two-col"><label>Fee (₹)<input type="number" min="1" value={draft.fee} onChange={e=>set('fee',e.target.value)} placeholder="200"/></label>{draft.participation_type!=='Individual'&&<label>Team Fee Basis<select value={draft.team_fee_mode} onChange={e=>set('team_fee_mode',e.target.value as Draft['team_fee_mode'])}><option>Per Student</option><option>Per Team</option></select></label>}<div className="payment-options"><b>Accepted payment methods</b><label><input type="checkbox" checked={draft.online_payment} onChange={e=>set('online_payment',e.target.checked)}/> Online payment</label><label><input type="checkbox" checked={draft.offline_payment} onChange={e=>set('offline_payment',e.target.checked)}/> Offline payment to coordinator</label></div></div>}
        </div>}

        {step===3 && <div className="wizard-form">
          <fieldset><legend>Eligible Departments</legend><div className="chip-select">{departments.map(x=><button type="button" key={x} className={draft.eligible_departments.includes(x)?'selected':''} onClick={()=>toggle('eligible_departments',x)}>{x}</button>)}</div></fieldset>
          <fieldset><legend>Eligible Years</legend><div className="chip-select">{['1','2','3'].map(x=><button type="button" key={x} className={draft.eligible_years.includes(x)?'selected':''} onClick={()=>toggle('eligible_years',x)}>{['First Year','Second Year','Third Year'][Number(x)-1]}</button>)}</div></fieldset>
          <fieldset><legend>Eligible Semesters <small>(optional)</small></legend><div className="chip-select">{['1','2','3','4','5','6'].map(x=><button type="button" key={x} className={draft.eligible_semesters.includes(x)?'selected':''} onClick={()=>toggle('eligible_semesters',x)}>Sem {x}</button>)}</div></fieldset>
          <label>Rules & Regulations<textarea rows={6} value={draft.rules} onChange={e=>set('rules',e.target.value)} placeholder="Participation rules, disqualification rules, discipline, submission rules, judging rules..."/></label>
          <label>Requirements / What to Bring<textarea rows={4} value={draft.requirements} onChange={e=>set('requirements',e.target.value)} placeholder="Laptop, college ID, software, documents, dress code, materials..."/></label>
          <label>Prizes / Benefits<textarea rows={4} value={draft.prizes} onChange={e=>set('prizes',e.target.value)} placeholder="Prizes, certificates, benefits, awards..."/></label>
          <label>Contact / Help Information<textarea rows={3} value={draft.contact_info} onChange={e=>set('contact_info',e.target.value)} placeholder="Coordinator name, room, phone/help desk instructions..."/></label>
        </div>}

        {step===4 && <div className="wizard-form two-col">
          <label>Event Date<input type="date" value={draft.event_date} onChange={e=>set('event_date',e.target.value)}/></label>
          <label>
            Venue Type
            <select
              value={venueType}
              onChange={e=>{
                const type=e.target.value
                setVenueType(type)
                set(
                  'venue',
                  buildVenue(venueDepartment,type,venueRoom)
                )
              }}
            >
              {venues.map(x=><option key={x}>{x}</option>)}
            </select>
          </label>

          <label>
            Department / Area
            <select
              value={venueDepartment}
              onChange={e=>{
                const department=e.target.value
                setVenueDepartment(department)
                set(
                  'venue',
                  buildVenue(department,venueType,venueRoom)
                )
              }}
            >
              <option value="">Select Department / Area</option>
              <option value="CSE Department">CSE Department</option>
              <option value="Civil Department">Civil Department</option>
              <option value="Mechanical Department">Mechanical Department</option>
              <option value="Electrical Department">Electrical Department</option>
              <option value="EEE Department">EEE Department</option>
              <option value="Central">Central / Common</option>
              <option value="Library">Library</option>
              <option value="Outdoor">Outdoor</option>
            </select>
          </label>

          <label>
            Room Number / Location
            <input
              type="text"
              value={venueRoom}
              placeholder="Example: 204"
              onChange={e=>{
                const roomNumber=e.target.value
                setVenueRoom(roomNumber)
                set(
                  'venue',
                  buildVenue(
                    venueDepartment,
                    venueType,
                    roomNumber
                  )
                )
              }}
            />
          </label>

          <div className="venue-preview">
            <span>Selected Venue</span>
            <strong>{draft.venue || 'Not selected'}</strong>
          </div>
          <label>Start Time<input type="time" value={draft.start_time} onChange={e=>set('start_time',e.target.value)}/></label>
          <label>End Time<input type="time" value={draft.end_time} onChange={e=>set('end_time',e.target.value)}/></label>
          <label className="wide">Prizes / Recognition<textarea rows={4} value={draft.prizes} onChange={e=>set('prizes',e.target.value)} placeholder="Winner prizes, certificates, recognition, etc."/></label>
          <div className="wizard-tip wide">Venue clash detection will be connected after the core event lifecycle is verified.</div>
        </div>}

        {step===5 && (
          <div className="wizard-form coordinator-step">

            <div className="coordinator-step-heading">
              <div>
                <span className="eyebrow">
                  Department Coordinators
                </span>

                <h3>
                  {isDepartmentEvent
                    ? `${selectedDepartment || 'Department'} Coordinators`
                    : 'Available Department Coordinators'}
                </h3>

                <p>
                  {isDepartmentEvent
                    ? `Only Department Coordinators from ${selectedDepartment || 'the selected department'} are shown for this Department Event.`
                    : 'Select the Department Coordinators who will manage this event.'}
                </p>
              </div>

              <span className="selected-coordinator-count">
                {departmentCoordinatorIds.length} selected
              </span>
            </div>

            {isDepartmentEvent && !selectedDepartment ? (
              <div className="form-alert">
                Select the organizing department first.
              </div>
            ) : visibleDepartmentCoordinators.length === 0 ? (
              <div className="empty-state compact">
                <div className="empty-icon">◎</div>
                <h3>No Department Coordinator found</h3>
                <p>
                  No active Department Coordinator account exists for
                  {selectedDepartment
                    ? ` ${selectedDepartment}`
                    : ' this event'}.
                </p>
              </div>
            ) : (
              <div className="coordinator-selection-grid">
                {visibleDepartmentCoordinators.map(coordinator=>{
                  const selected =
                    departmentCoordinatorIds.includes(
                      coordinator.id
                    )

                  return (
                    <button
                      key={coordinator.id}
                      type="button"
                      className={
                        selected
                          ? 'coordinator-select-card selected'
                          : 'coordinator-select-card'
                      }
                      onClick={()=>
                        toggleDepartmentCoordinator(
                          coordinator.id
                        )
                      }
                    >
                      <span className="coordinator-avatar">
                        {coordinator.name
                          .slice(0,1)
                          .toUpperCase()}
                      </span>

                      <span className="coordinator-card-copy">
                        <b>{coordinator.name}</b>
                        <small>
                          {coordinator.department}
                          {' • '}
                          Department Coordinator
                        </small>
                      </span>

                      <span className="coordinator-check">
                        {selected ? '✓' : '+'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="wizard-tip">
              The event creator remains the system owner internally.
              Student registration and event operations can be handled
              by the selected Department Coordinator(s).
            </div>

          </div>
        )}

        {step===6 && <div className="review-grid">
          <Review title="Event" rows={[["Name",draft.name],["Category",draft.category==='Other / Custom'?draft.custom_category:draft.category],["Scope",draft.event_scope==='Other / Custom'?draft.custom_event_scope:draft.event_scope],["Organizing Unit",draft.organizing_department==='Other / Custom'?draft.custom_organizing_department:draft.organizing_department]]}/>
          <Review title="Registration" rows={[["Participation",draft.participation_type],["Capacity",draft.capacity||'Unlimited'],["Deadline",draft.registration_deadline||'Not set'],["Team size",draft.participation_type!=='Individual'?`${draft.team_min}–${draft.team_max}`:'—'],["Student approval",draft.registration_approval_required?'Coordinator approval required':'Direct registration']]}/>
          <Review title="Payment" rows={[["Type",draft.payment_type],["Fee",draft.payment_type==='Paid'?`₹${draft.fee}`:'—'],["Methods",draft.payment_type==='Paid'?[draft.online_payment?'Online':'',draft.offline_payment?'Offline':''].filter(Boolean).join(' + '):'Not required'],["Team fee",draft.payment_type==='Paid'&&draft.participation_type!=='Individual'?draft.team_fee_mode:'—']]}/>
          <Review title="Schedule" rows={[["Date",draft.event_date||'Not set'],["Time",`${draft.start_time||'—'}${draft.end_time?` – ${draft.end_time}`:''}`],["Venue",draft.venue]]}/>
          <Review
            title="Coordinators"
            rows={[
              [
                "Department",
                selectedDepartment || "—"
              ],
              [
                "Assigned",
                visibleDepartmentCoordinators
                  .filter(c =>
                    departmentCoordinatorIds.includes(c.id)
                  )
                  .map(c=>c.name)
                  .join(', ') || 'None selected'
              ]
            ]}
          />
          <Review title="Eligibility" rows={[["Departments",draft.eligible_departments.join(', ')||'None'],["Years",draft.eligible_years.map(x=>`Year ${x}`).join(', ')||'None']]}/>
          <Review
      title="Approval"
      rows={
        isEditing
          ? [
              ["Current", editingStatus || "Loading…"],
              ["Action", "Save changes"],
              ["Status after save", editingStatus || "Unchanged"]
            ]
          : ['Super Admin','Main Coordinator'].includes(user?.role || '')
            ? [
                ["Current", "New Event"],
                ["Next", "Approved automatically"],
                ["After approval", "Ready to publish"]
              ]
            : [
                ["Current", "Draft"],
                ["Next", "Submit to HOD"],
                ["After approval", "Ready to publish"]
              ]
      }
    />
        </div>}

        <div className="wizard-actions"><button className="button button-ghost" type="button" onClick={back} disabled={step===0}>Back</button><div>{step===steps.length-1?(isEditing?<button className="button button-primary" disabled={saving} onClick={()=>save(false)}>{saving?'Saving…':'Save Changes'}</button>:['Department Coordinator','Librarian'].includes(user?.role || '')?<><button className="button button-ghost" disabled={saving} onClick={()=>save(false)}>Save Draft</button><button className="button button-primary" disabled={saving} onClick={()=>save(true)}>{saving?'Saving…':'Submit to HOD'}</button></>:<button className="button button-primary" disabled={saving} onClick={()=>save(false)}>{saving?'Saving…':'Create Approved Event'}</button>):<button className="button button-primary" type="button" onClick={next}>Continue</button>}</div></div>
      </div>
    </div>
  </section>
}

function Review({title,rows}:{title:string,rows:string[][]}){return <article className="review-card"><h4>{title}</h4>{rows.map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b></div>)}</article>}
