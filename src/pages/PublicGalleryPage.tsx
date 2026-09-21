import { useEffect, useMemo, useState } from 'react'
import { API } from '../auth/AuthContext'

type GalleryItem={
  id:number
  event_id:number
  type:string
  title:string
  url:string
  created_at:string
  event_name:string
  event_date:string
  organizing_department:string
}

export default function PublicGalleryPage(){
  const [rows,setRows]=useState<GalleryItem[]>([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('All')

  useEffect(()=>{
    let active=true

    async function load(){
      try{
        const r=await fetch(`${API}/api/gallery`,{
          cache:'no-store'
        })

        const d=await r.json()

        if(r.ok && active){
          setRows(d.rows||[])
        }

      }finally{
        if(active){
          setLoading(false)
        }
      }
    }

    load()

    return ()=>{
      active=false
    }
  },[])

  const filtered=useMemo(()=>{
    if(filter==='All') return rows

    return rows.filter(
      item=>item.type===filter
    )
  },[rows,filter])

  return (
    <main className="public-gallery-page">

      <section className="public-gallery-hero">
        <div className="container">
          <span className="eyebrow">
            CAMPUS MEMORIES
          </span>

          <h1>
            GEMS Event Gallery
          </h1>

          <p>
            Official photos, posters, videos and highlights
            from events at GEMS Polytechnic College.
          </p>
        </div>
      </section>

      <section className="container public-gallery-content">

        <div className="public-gallery-toolbar">

          {['All','Photo','Poster','Video'].map(item=>(
            <button
              key={item}
              type="button"
              className={
                filter===item
                  ? 'gallery-filter active'
                  : 'gallery-filter'
              }
              onClick={()=>setFilter(item)}
            >
              {item}
            </button>
          ))}

        </div>

        {loading ? (

          <div className="empty-premium">
            <h3>Loading Gallery</h3>
            <p>
              Loading official GEMS event media.
            </p>
          </div>

        ) : filtered.length===0 ? (

          <div className="empty-premium public-gallery-empty">
            <div className="public-gallery-empty-icon">
              G
            </div>

            <h3>
              Gallery Coming Soon
            </h3>

            <p>
              Official event photos and highlights will
              appear here once published by the college.
            </p>
          </div>

        ) : (

          <div className="public-gallery-grid">

            {filtered.map(item=>(
              <article
                key={item.id}
                className="public-gallery-card"
              >

                <div className="public-gallery-media">

                  {item.type==='Video' ? (
                    <video
                      src={item.url}
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt={item.title}
                      loading="lazy"
                    />
                  )}

                  <span className="public-gallery-type">
                    {item.type}
                  </span>

                </div>

                <div className="public-gallery-card-body">

                  <small>
                    {item.event_name}
                  </small>

                  <h3>
                    {item.title}
                  </h3>

                  <div>
                    <span>
                      {item.organizing_department}
                    </span>

                    {item.event_date && (
                      <span>
                        {new Date(item.event_date)
                          .toLocaleDateString(
                            'en-IN',
                            {
                              day:'2-digit',
                              month:'short',
                              year:'numeric'
                            }
                          )}
                      </span>
                    )}
                  </div>

                </div>

              </article>
            ))}

          </div>

        )}

      </section>

    </main>
  )
}