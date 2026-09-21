import { FormEvent, useEffect, useState } from 'react'
import { API, useAuth } from '../auth/AuthContext'

type GalleryItem = {
  id:number
  event_id:number
  type:string
  title:string
  url:string
  published:boolean
  created_at:string
  event_name:string
  event_date:string
  organizing_department:string
}

type EventOption = {
  id:number
  event_code:string
  name:string
  event_date:string
  organizing_department:string
  status:string
}

export default function AdminGalleryPage(){
  const {token}=useAuth()

  const [rows,setRows]=useState<GalleryItem[]>([])
  const [events,setEvents]=useState<EventOption[]>([])
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  const [eventId,setEventId]=useState('')
  const [type,setType]=useState('Photo')
  const [title,setTitle]=useState('')
  const [url,setUrl]=useState('')
  const [published,setPublished]=useState(true)

  async function load(){
    try{
      setError('')

      const r=await fetch(`${API}/api/admin/gallery`,{
        headers:{
          Authorization:`Bearer ${token}`
        },
        cache:'no-store'
      })

      const d=await r.json()

      if(!r.ok){
        throw new Error(d.error||'Unable to load gallery.')
      }

      setRows(d.rows||[])
      setEvents(d.events||[])

      if(!eventId && d.events?.length){
        setEventId(String(d.events[0].id))
      }

    }catch(e:any){
      setError(e.message)
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{
    if(token) load()
  },[token])

  async function submit(e:FormEvent){
    e.preventDefault()

    if(!eventId || !title.trim() || !url.trim()){
      setError('Event, title and media URL are required.')
      return
    }

    try{
      setSaving(true)
      setError('')
      setMessage('')

      const r=await fetch(`${API}/api/admin/gallery`,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          Authorization:`Bearer ${token}`
        },
        body:JSON.stringify({
          event_id:Number(eventId),
          type,
          title:title.trim(),
          url:url.trim(),
          published
        })
      })

      const d=await r.json()

      if(!r.ok){
        throw new Error(d.error||'Unable to save gallery item.')
      }

      setTitle('')
      setUrl('')
      setPublished(true)

      setMessage('Gallery item added successfully.')

      await load()

    }catch(e:any){
      setError(e.message)
    }finally{
      setSaving(false)
    }
  }

  async function togglePublish(item:GalleryItem){
    try{
      setError('')

      const r=await fetch(
        `${API}/api/admin/gallery/${item.id}`,
        {
          method:'PATCH',
          headers:{
            'Content-Type':'application/json',
            Authorization:`Bearer ${token}`
          },
          body:JSON.stringify({
            published:!item.published
          })
        }
      )

      const d=await r.json()

      if(!r.ok){
        throw new Error(d.error||'Unable to update gallery item.')
      }

      await load()

    }catch(e:any){
      setError(e.message)
    }
  }

  async function removeItem(item:GalleryItem){
    if(!window.confirm(`Delete "${item.title}" from gallery?`)){
      return
    }

    try{
      setError('')

      const r=await fetch(
        `${API}/api/admin/gallery/${item.id}`,
        {
          method:'DELETE',
          headers:{
            Authorization:`Bearer ${token}`
          }
        }
      )

      const d=await r.json()

      if(!r.ok){
        throw new Error(d.error||'Unable to delete gallery item.')
      }

      await load()

    }catch(e:any){
      setError(e.message)
    }
  }

  return (
    <section className="portal-page admin-gallery-page">

      <div className="admin-gallery-heading">
        <div>
          <span className="eyebrow">PUBLIC MEDIA</span>
          <h2>Gallery Management</h2>
          <p>
            Add official event photos, posters and videos.
            Only published items appear on the public website.
          </p>
        </div>
      </div>

      {error && (
        <div className="form-message error">
          {error}
        </div>
      )}

      {message && (
        <div className="form-message success">
          {message}
        </div>
      )}

      <div className="admin-gallery-layout">

        <form
          className="admin-gallery-form"
          onSubmit={submit}
        >

          <div>
            <span className="eyebrow">ADD MEDIA</span>
            <h3>New Gallery Item</h3>
          </div>

          <label>
            Event
            <select
              value={eventId}
              onChange={e=>setEventId(e.target.value)}
              required
            >
              <option value="">Select event</option>

              {events.map(event=>(
                <option
                  key={event.id}
                  value={event.id}
                >
                  {event.name} - {event.organizing_department}
                </option>
              ))}
            </select>
          </label>

          <label>
            Media Type
            <select
              value={type}
              onChange={e=>setType(e.target.value)}
            >
              <option>Photo</option>
              <option>Poster</option>
              <option>Video</option>
            </select>
          </label>

          <label>
            Title
            <input
              value={title}
              onChange={e=>setTitle(e.target.value)}
              placeholder="Example: Hackathon Final Round"
              required
            />
          </label>

          <label>
            Media URL
            <input
              value={url}
              onChange={e=>setUrl(e.target.value)}
              placeholder="https://... or /images/photo.jpg"
              required
            />
          </label>

          {url && type!=='Video' && (
            <div className="admin-gallery-preview">
              <img
                src={url}
                alt="Gallery preview"
                onError={e=>{
                  e.currentTarget.style.display='none'
                }}
              />
            </div>
          )}

          <label className="admin-gallery-check">
            <input
              type="checkbox"
              checked={published}
              onChange={e=>setPublished(e.target.checked)}
            />

            <span>
              Publish immediately
            </span>
          </label>

          <button
            type="submit"
            className="button button-primary"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Add Gallery Item'}
          </button>

        </form>

        <div className="admin-gallery-list">

          <div className="admin-gallery-list-head">
            <div>
              <span className="eyebrow">MEDIA LIBRARY</span>
              <h3>Gallery Items</h3>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={load}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="empty-premium">
              <h3>Loading gallery...</h3>
            </div>
          ) : rows.length===0 ? (
            <div className="empty-premium">
              <h3>No gallery items yet</h3>
              <p>
                Add the first official event photo, poster or video.
              </p>
            </div>
          ) : (
            <div className="admin-gallery-items">

              {rows.map(item=>(
                <article
                  key={item.id}
                  className="admin-gallery-item"
                >

                  <div className="admin-gallery-thumb">
                    {item.type==='Video' ? (
                      <div className="gallery-video-placeholder">
                        VIDEO
                      </div>
                    ) : (
                      <img
                        src={item.url}
                        alt={item.title}
                      />
                    )}
                  </div>

                  <div className="admin-gallery-item-copy">

                    <div className="admin-gallery-item-top">

                      <div>
                        <small>
                          {item.type} · {item.event_name}
                        </small>

                        <h4>
                          {item.title}
                        </h4>

                        <span>
                          {item.organizing_department}
                        </span>
                      </div>

                      <span
                        className={
                          item.published
                            ? 'gallery-status published'
                            : 'gallery-status draft'
                        }
                      >
                        {item.published
                          ? 'Published'
                          : 'Draft'}
                      </span>

                    </div>

                    <div className="admin-gallery-actions">

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={()=>togglePublish(item)}
                      >
                        {item.published
                          ? 'Unpublish'
                          : 'Publish'}
                      </button>

                      <button
                        type="button"
                        className="danger-button"
                        onClick={()=>removeItem(item)}
                      >
                        Delete
                      </button>

                    </div>

                  </div>

                </article>
              ))}

            </div>
          )}

        </div>

      </div>

    </section>
  )
}