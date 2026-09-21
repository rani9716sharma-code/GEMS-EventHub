import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { API, useAuth } from '../auth/AuthContext'

type EventData={
  id:number
  category:string
}

type RegistrationSubject={
  student_id?:string
  name?:string
  department?:string
  team_name?:string
  team_code?:string
}

type Registration={
  id:number
  registration_type:'Individual'|'Team'
  student_id?:string|null
  team_id?:number|null
  status:string
  subject?:RegistrationSubject|null
}

type ResultRow={
  id:number
  student_id?:string|null
  team_id?:number|null
  award:string
  position?:number|null
  category?:string|null
  points_awarded:number
  published:number
  student_name?:string|null
  student_department?:string|null
  team_name?:string|null
  team_code?:string|null
}

type FormState={
  registration_id:string
  award:string
  position:string
  category:string
  points_awarded:string
}

const AWARDS=[
  {label:'1st Place',points:100,position:'1'},
  {label:'2nd Place',points:70,position:'2'},
  {label:'3rd Place',points:50,position:'3'},
  {label:'Finalist',points:30,position:''},
  {label:'Participation',points:10,position:''},
  {label:'Volunteer',points:15,position:''},
  {label:'Workshop Completion',points:15,position:''},
  {label:'Special Award',points:0,position:''}
]

function participantName(registration:Registration){
  if(registration.registration_type==='Team'){
    return registration.subject?.team_name ||
      registration.subject?.name ||
      `Team #${registration.team_id ?? registration.id}`
  }

  return registration.subject?.name ||
    registration.student_id ||
    `Student #${registration.id}`
}

function resultName(row:ResultRow){
  if(row.team_id){
    return row.team_name ||
      row.team_code ||
      `Team #${row.team_id}`
  }

  return row.student_name ||
    row.student_id ||
    'Individual participant'
}

export default function ResultsPanel({event}:{event:EventData}){
  const {token}=useAuth()

  const emptyForm=():FormState=>({
    registration_id:'',
    award:'',
    position:'',
    category:event.category || '',
    points_awarded:'0'
  })

  const [registrations,setRegistrations]=useState<Registration[]>([])
  const [rows,setRows]=useState<ResultRow[]>([])
  const [form,setForm]=useState<FormState>(emptyForm)
  const [editingId,setEditingId]=useState<number|null>(null)

  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [busyId,setBusyId]=useState<number|null>(null)

  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')

  const request=useCallback(async(
    path:string,
    options:RequestInit={}
  )=>{
    const headers:Record<string,string>={
      Authorization:`Bearer ${token}`
    }

    if(options.body){
      headers['Content-Type']='application/json'
    }

    const response=await fetch(`${API}${path}`,{
      ...options,
      headers:{
        ...headers,
        ...(options.headers || {})
      }
    })

    const data=await response.json().catch(()=>({}))

    if(!response.ok){
      throw new Error(data.error || 'Request failed.')
    }

    return data
  },[token])

  const load=useCallback(async()=>{
    setLoading(true)
    setError('')

    try{
      const data=await request(
        `/api/coordinator/results?event_id=${event.id}`
      )

      setRegistrations(data.registrations || [])
      setRows(data.rows || [])
    }catch(err){
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load results.'
      )
    }finally{
      setLoading(false)
    }
  },[event.id,request])

  useEffect(()=>{
    void load()
  },[load])

  const usedRegistrationIds=useMemo(()=>{
    const used=new Set<number>()

    registrations.forEach(registration=>{
      const exists=rows.some(row=>{
        if(registration.registration_type==='Individual'){
          return Boolean(
            registration.student_id &&
            row.student_id===registration.student_id
          )
        }

        return Boolean(
          registration.team_id &&
          row.team_id===registration.team_id
        )
      })

      if(exists) used.add(registration.id)
    })

    return used
  },[registrations,rows])

  const availableRegistrations=useMemo(
    ()=>registrations.filter(r=>!usedRegistrationIds.has(r.id)),
    [registrations,usedRegistrationIds]
  )

  const draftCount=rows.filter(
    r=>Number(r.published)!==1
  ).length

  const publishedCount=rows.filter(
    r=>Number(r.published)===1
  ).length

  function reset(){
    setEditingId(null)
    setForm(emptyForm())
  }

  function selectAward(value:string){
    const preset=AWARDS.find(x=>x.label===value)

    setForm(current=>({
      ...current,
      award:value,
      position:preset ? preset.position : current.position,
      points_awarded:preset
        ? String(preset.points)
        : current.points_awarded
    }))
  }

  async function save(e:FormEvent){
    e.preventDefault()
    setError('')
    setSuccess('')

    if(!editingId && !form.registration_id){
      setError('Choose a registered participant or team.')
      return
    }

    if(!form.award){
      setError('Choose an award.')
      return
    }

    setSaving(true)

    try{
      if(editingId){
        const data=await request(
          `/api/coordinator/results/${editingId}`,
          {
            method:'PATCH',
            body:JSON.stringify({
              award:form.award,
              position:form.position,
              category:form.category,
              points_awarded:Number(form.points_awarded || 0)
            })
          }
        )

        setSuccess(data.message || 'Draft result updated.')
      }else{
        const data=await request(
          '/api/coordinator/results',
          {
            method:'POST',
            body:JSON.stringify({
              event_id:event.id,
              registration_id:Number(form.registration_id),
              award:form.award,
              position:form.position,
              category:form.category,
              points_awarded:Number(form.points_awarded || 0)
            })
          }
        )

        setSuccess(data.message || 'Result saved as draft.')
      }

      reset()
      await load()
    }catch(err){
      setError(
        err instanceof Error
          ? err.message
          : 'Could not save result.'
      )
    }finally{
      setSaving(false)
    }
  }

  function edit(row:ResultRow){
    if(Number(row.published)===1) return

    setError('')
    setSuccess('')
    setEditingId(row.id)

    setForm({
      registration_id:'',
      award:row.award,
      position:row.position ? String(row.position) : '',
      category:row.category || event.category || '',
      points_awarded:String(row.points_awarded ?? 0)
    })

    document
      .getElementById('result-entry-form')
      ?.scrollIntoView({behavior:'smooth',block:'start'})
  }

  async function remove(row:ResultRow){
    if(Number(row.published)===1) return

    if(!window.confirm(
      `Delete draft result for ${resultName(row)}?`
    )) return

    setBusyId(row.id)
    setError('')
    setSuccess('')

    try{
      const data=await request(
        `/api/coordinator/results/${row.id}`,
        {method:'DELETE'}
      )

      if(editingId===row.id) reset()

      setSuccess(data.message || 'Draft result deleted.')
      await load()
    }catch(err){
      setError(
        err instanceof Error
          ? err.message
          : 'Could not delete result.'
      )
    }finally{
      setBusyId(null)
    }
  }

  async function publish(row:ResultRow){
    if(Number(row.published)===1) return

    if(!window.confirm(
      `Publish ${row.award} for ${resultName(row)}?\n\nPublished results become visible to the eligible student(s) and are locked in this workspace.`
    )) return

    setBusyId(row.id)
    setError('')
    setSuccess('')

    try{
      const data=await request(
        `/api/coordinator/results/${row.id}/publish`,
        {method:'POST'}
      )

      if(editingId===row.id) reset()

      setSuccess(data.message || 'Result published successfully.')
      await load()
    }catch(err){
      setError(
        err instanceof Error
          ? err.message
          : 'Could not publish result.'
      )
    }finally{
      setBusyId(null)
    }
  }

  if(loading){
    return (
      <div className="results-loading">
        <div>
          <strong>Loading Results & Winners</strong>
          <span>Checking registered participants and saved results.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="results-workspace">

      <div className="results-heading">
        <div>
          <span className="eyebrow">Official results</span>
          <h3>Results & Winners</h3>
          <p>
            Record verified individual or team results. Save as draft
            first and publish after final confirmation.
          </p>
        </div>

        <button
          type="button"
          className="button button-ghost"
          onClick={()=>void load()}
          disabled={saving || busyId!==null}
        >
          Refresh
        </button>
      </div>

      <div className="results-summary-grid">
        <article>
          <span>Eligible Registrations</span>
          <strong>{registrations.length}</strong>
          <small>Registered participants and teams</small>
        </article>

        <article>
          <span>Draft Results</span>
          <strong>{draftCount}</strong>
          <small>Editable before publishing</small>
        </article>

        <article>
          <span>Published</span>
          <strong>{publishedCount}</strong>
          <small>Visible in My Results</small>
        </article>
      </div>

      {error&&(
        <div className="form-alert error">{error}</div>
      )}

      {success&&(
        <div className="form-alert success">{success}</div>
      )}

      <div className="results-layout">

        <form
          id="result-entry-form"
          className="results-form-card"
          onSubmit={save}
        >
          <div className="results-card-heading">
            <div>
              <span className="eyebrow">
                {editingId ? 'Edit draft' : 'Result entry'}
              </span>

              <h4>
                {editingId
                  ? 'Update Draft Result'
                  : 'Add Result'}
              </h4>
            </div>

            {editingId&&(
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={reset}
              >
                Cancel
              </button>
            )}
          </div>

          {!editingId&&(
            <label className="results-field">
              <span>Registered participant / team</span>

              <select
                value={form.registration_id}
                onChange={e=>setForm(current=>({
                  ...current,
                  registration_id:e.target.value
                }))}
                required
              >
                <option value="">
                  Select participant or team
                </option>

                {availableRegistrations.map(registration=>(
                  <option
                    key={registration.id}
                    value={registration.id}
                  >
                    {registration.registration_type}
                    {' - '}
                    {participantName(registration)}
                    {' - '}
                    {registration.status}
                  </option>
                ))}
              </select>

              {!availableRegistrations.length&&(
                <small>
                  No unused eligible registrations are available.
                </small>
              )}
            </label>
          )}

          <div className="results-form-grid">
            <label className="results-field">
              <span>Award</span>

              <select
                value={form.award}
                onChange={e=>selectAward(e.target.value)}
                required
              >
                <option value="">Choose award</option>

                {AWARDS.map(item=>(
                  <option key={item.label} value={item.label}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="results-field">
              <span>Position</span>

              <input
                type="number"
                min="1"
                step="1"
                placeholder="Optional"
                value={form.position}
                onChange={e=>setForm(current=>({
                  ...current,
                  position:e.target.value
                }))}
              />
            </label>

            <label className="results-field">
              <span>Category</span>

              <input
                value={form.category}
                onChange={e=>setForm(current=>({
                  ...current,
                  category:e.target.value
                }))}
                placeholder="Result category"
              />
            </label>

            <label className="results-field">
              <span>Achievement Points</span>

              <input
                type="number"
                min="0"
                step="1"
                value={form.points_awarded}
                onChange={e=>setForm(current=>({
                  ...current,
                  points_awarded:e.target.value
                }))}
                required
              />
            </label>
          </div>

          <div className="results-form-note">
            <strong>Draft first</strong>
            <span>
              The result remains hidden from students until Publish
              is selected.
            </span>
          </div>

          <button
            type="submit"
            className="button button-primary results-save-button"
            disabled={
              saving ||
              (!editingId && !availableRegistrations.length)
            }
          >
            {saving
              ? 'Saving...'
              : editingId
                ? 'Update Draft'
                : 'Save Draft'}
          </button>
        </form>

        <div className="results-list-card">
          <div className="results-card-heading">
            <div>
              <span className="eyebrow">Official records</span>
              <h4>Saved Results</h4>
            </div>

            <span className="results-count">
              {rows.length} total
            </span>
          </div>

          {!rows.length ? (
            <div className="results-empty">
              <div className="results-empty-mark">R</div>
              <h4>No results added yet</h4>
              <p>
                Add a registered participant or team result and save
                it as a draft.
              </p>
            </div>
          ) : (
            <div className="results-table-wrap">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Participant / Team</th>
                    <th>Award</th>
                    <th>Position</th>
                    <th>Points</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map(row=>{
                    const published=Number(row.published)===1
                    const busy=busyId===row.id

                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{resultName(row)}</strong>
                          <span>
                            {row.team_id
                              ? `Team${row.team_code ? ` - ${row.team_code}` : ''}`
                              : row.student_department ||
                                row.student_id ||
                                'Individual'}
                          </span>
                        </td>

                        <td>
                          <strong>{row.award}</strong>
                          <span>
                            {row.category ||
                              event.category ||
                              'General'}
                          </span>
                        </td>

                        <td>
                          {row.position
                            ? `#${row.position}`
                            : '-'}
                        </td>

                        <td>
                          <strong>{row.points_awarded ?? 0}</strong>
                        </td>

                        <td>
                          <span
                            className={
                              published
                                ? 'results-status published'
                                : 'results-status draft'
                            }
                          >
                            {published ? 'Published' : 'Draft'}
                          </span>
                        </td>

                        <td>
                          {published ? (
                            <span className="results-locked">
                              Locked
                            </span>
                          ) : (
                            <div className="results-actions">
                              <button
                                type="button"
                                className="button button-ghost button-small"
                                disabled={busy}
                                onClick={()=>edit(row)}
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className="button button-primary button-small"
                                disabled={busy}
                                onClick={()=>void publish(row)}
                              >
                                {busy ? 'Working...' : 'Publish'}
                              </button>

                              <button
                                type="button"
                                className="results-delete-button"
                                disabled={busy}
                                onClick={()=>void remove(row)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
