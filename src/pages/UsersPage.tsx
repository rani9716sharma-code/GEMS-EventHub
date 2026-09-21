import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { API, AuthUser, UserRole, useAuth } from '../auth/AuthContext'

type UserRow = AuthUser & { created_at: string }

type BulkRow = {
  row_number: number
  name: string
  email: string
  college_id: string
  role: string
  department: string
  student_id: string
  password: string
  clientError?: string
}

type FailedRow = {
  row_number: number
  name?: string
  email?: string
  college_id?: string
  student_id?: string
  error: string
}

const roles: UserRole[] = [
  'HOD',
  'Main Coordinator',
  'Department Coordinator',
  'Librarian',
  'Student',
  'Super Admin'
]

const departments = ['CSE','Civil','Mechanical','Electrical','EEE']

function parseCsvLine(line: string){
  const values: string[] = []
  let current = ''
  let quoted = false

  for(let i = 0; i < line.length; i += 1){
    const char = line[i]

    if(char === '"'){
      if(quoted && line[i + 1] === '"'){
        current += '"'
        i += 1
      }else{
        quoted = !quoted
      }
    }else if(char === ',' && !quoted){
      values.push(current.trim())
      current = ''
    }else{
      current += char
    }
  }

  values.push(current.trim())
  return values
}

function validateBulkRow(row: BulkRow){
  if(!row.name) return 'Name is required.'
  if(!roles.includes(row.role as UserRole)) return 'Invalid role.'

  if(!row.email && !row.college_id && !row.student_id){
    return 'Email, College ID or Student ID is required.'
  }

  if(row.password.length < 10){
    return 'Password must be at least 10 characters.'
  }

  if(
    ['HOD','Main Coordinator','Department Coordinator','Librarian']
      .includes(row.role) &&
    !departments.includes(row.department)
  ){
    return 'Valid department is required.'
  }

  if(row.role === 'Student' && !row.student_id){
    return 'Student ID is required for Student accounts.'
  }

  return ''
}

export default function UsersPage(){
  const { token } = useAuth()

  const [rows,setRows] = useState<UserRow[]>([])
  const [show,setShow] = useState(false)
  const [showBulk,setShowBulk] = useState(false)

  const [error,setError] = useState('')
  const [message,setMessage] = useState('')
  const [role,setRole] = useState<UserRole>('Department Coordinator')

  const [bulkRows,setBulkRows] = useState<BulkRow[]>([])
  const [bulkFileName,setBulkFileName] = useState('')
  const [bulkBusy,setBulkBusy] = useState(false)
  const [bulkFailed,setBulkFailed] = useState<FailedRow[]>([])
  const [bulkImported,setBulkImported] = useState(0)

  async function load(){
    const res = await fetch(`${API}/api/users`, {
      headers:{Authorization:`Bearer ${token}`}
    })

    const data = await res.json()

    if(res.ok) setRows(data.rows)
    else setError(data.error)
  }

  useEffect(()=>{
    load()
  },[token])

  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    setError('')
    setMessage('')

    const f = new FormData(e.currentTarget)

    const body:any = {
      name:f.get('name'),
      email:f.get('email'),
      college_id:f.get('college_id'),
      role,
      department:f.get('department'),
      student_id:f.get('student_id'),
      password:f.get('password')
    }

    const res = await fetch(`${API}/api/users`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${token}`
      },
      body:JSON.stringify(body)
    })

    const data = await res.json()

    if(!res.ok){
      setError(data.error || 'Could not create user.')
      return
    }

    setMessage(`${data.user.name} can now sign in.`)
    setShow(false)
    ;(e.currentTarget as HTMLFormElement).reset()
    load()
  }

  async function toggle(user:UserRow){
    const res = await fetch(`${API}/api/users/${user.id}`,{
      method:'PATCH',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${token}`
      },
      body:JSON.stringify({active:!user.active})
    })

    const data = await res.json()

    if(!res.ok){
      setError(data.error)
      return
    }

    load()
  }

  async function resetPassword(user:UserRow){
    const password = window.prompt(
      `Enter a new temporary password for ${user.name} (minimum 10 characters):`
    )

    if(password === null) return

    if(password.length < 10){
      setError('Temporary password must be at least 10 characters.')
      return
    }

    setError('')
    setMessage('')

    const res = await fetch(
      `${API}/api/users/${user.id}/reset-password`,
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          Authorization:`Bearer ${token}`
        },
        body:JSON.stringify({password})
      }
    )

    const data = await res.json()

    if(!res.ok){
      setError(data.error || 'Could not reset password.')
      return
    }

    setMessage(
      `${user.name}'s password was reset. Existing sessions were signed out.`
    )
  }

  function downloadTemplate(){
    const csv = [
      'name,email,college_id,role,department,student_id,password',
      'Amit Kumar,amit@gpc.edu.in,FAC001,Department Coordinator,CSE,,Welcome@123',
      'Riya Singh,riya@gpc.edu.in,FAC002,HOD,Civil,,Welcome@123',
      'Student Example,student@gpc.edu.in,,Student,CSE,STGEMS24001,Welcome@123'
    ].join('\r\n')

    const blob = new Blob([csv],{type:'text/csv;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = 'GEMS-EventHub-User-Import-Template.csv'

    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    URL.revokeObjectURL(url)
  }

  async function chooseCsv(e:ChangeEvent<HTMLInputElement>){
    const file = e.target.files?.[0]

    setBulkRows([])
    setBulkFailed([])
    setBulkImported(0)
    setError('')
    setMessage('')

    if(!file){
      setBulkFileName('')
      return
    }

    if(!file.name.toLowerCase().endsWith('.csv')){
      setError('Please choose a CSV file.')
      e.target.value = ''
      return
    }

    setBulkFileName(file.name)

    const text = (await file.text()).replace(/^\uFEFF/,'')
    const lines = text
      .split(/\r?\n/)
      .filter(line=>line.trim().length > 0)

    if(lines.length < 2){
      setError('CSV must contain a header and at least one user row.')
      return
    }

    const headers = parseCsvLine(lines[0]).map(
      value=>value.trim().toLowerCase()
    )

    const required = [
      'name',
      'email',
      'college_id',
      'role',
      'department',
      'student_id',
      'password'
    ]

    const missing = required.filter(header=>!headers.includes(header))

    if(missing.length){
      setError(`CSV is missing columns: ${missing.join(', ')}`)
      return
    }

    const parsed: BulkRow[] = lines.slice(1).map((line,index)=>{
      const values = parseCsvLine(line)
      const record: Record<string,string> = {}

      headers.forEach((header,column)=>{
        record[header] = values[column]?.trim() || ''
      })

      const row: BulkRow = {
        row_number:index + 2,
        name:record.name || '',
        email:record.email || '',
        college_id:record.college_id || '',
        role:record.role || '',
        department:record.department || '',
        student_id:record.student_id || '',
        password:record.password || ''
      }

      row.clientError = validateBulkRow(row)

      return row
    })

    if(parsed.length > 1000){
      setError('Maximum 1000 users can be imported at one time.')
      return
    }

    setBulkRows(parsed)
  }

  async function importBulkUsers(){
    const validRows = bulkRows.filter(row=>!row.clientError)

    if(!validRows.length){
      setError('There are no valid rows to import.')
      return
    }

    if(!window.confirm(
      `Import ${validRows.length} valid user account(s)?`
    )){
      return
    }

    setBulkBusy(true)
    setError('')
    setMessage('')
    setBulkFailed([])
    setBulkImported(0)

    try{
      const res = await fetch(`${API}/api/users/bulk-import`,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          Authorization:`Bearer ${token}`
        },
        body:JSON.stringify({rows:validRows})
      })

      const data = await res.json()

      if(!res.ok){
        setError(data.error || 'Bulk import failed.')
        return
      }

      setBulkImported(Number(data.imported_count || 0))
      setBulkFailed(Array.isArray(data.failed) ? data.failed : [])

      setMessage(
        `${data.imported_count || 0} user(s) imported. ` +
        `${data.failed_count || 0} row(s) failed.`
      )

      await load()
    }catch{
      setError('Could not connect to the Bulk Import API.')
    }finally{
      setBulkBusy(false)
    }
  }

  const clientInvalid = bulkRows.filter(row=>row.clientError)
  const clientValid = bulkRows.filter(row=>!row.clientError)

  return <section className="portal-content">

    <div className="page-toolbar">
      <div>
        <span className="eyebrow">Security & permissions</span>
        <h2>User Management</h2>
        <p>
          Accounts are role-driven. Users no longer choose a portal when signing in.
        </p>
      </div>

      <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
        <button
          type="button"
          className="button"
          onClick={()=>{
            setShowBulk(v=>!v)
            setShow(false)
            setError('')
            setMessage('')
          }}
        >
          {showBulk ? 'Close Bulk Import' : 'Bulk Import'}
        </button>

        <button
          type="button"
          className="button button-primary"
          onClick={()=>{
            setShow(v=>!v)
            setShowBulk(false)
            setError('')
            setMessage('')
          }}
        >
          {show ? 'Close' : '+ Create User'}
        </button>
      </div>
    </div>

    {error &&
      <div className="form-alert error">{error}</div>
    }

    {message &&
      <div className="form-alert success">{message}</div>
    }

    {showBulk &&
      <div className="user-create-card">

        <div style={{
          display:'flex',
          justifyContent:'space-between',
          gap:'16px',
          alignItems:'flex-start',
          flexWrap:'wrap'
        }}>
          <div>
            <span className="eyebrow">CSV account provisioning</span>
            <h3 style={{marginTop:'6px'}}>Bulk Import Users</h3>
            <p>
              Create multiple login accounts while keeping the same
              role, Student Directory and password validation rules.
            </p>
          </div>

          <button
            type="button"
            className="button"
            onClick={downloadTemplate}
          >
            Download CSV Template
          </button>
        </div>

        <div className="form-grid" style={{marginTop:'18px'}}>
          <label>
            Choose CSV File
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={chooseCsv}
            />
          </label>
        </div>

        {bulkFileName &&
          <div className="form-note">
            Selected file: <strong>{bulkFileName}</strong>
          </div>
        }

        {bulkRows.length > 0 &&
          <>
            <div style={{
              display:'grid',
              gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',
              gap:'12px',
              margin:'18px 0'
            }}>
              <div className="data-table-card" style={{padding:'14px'}}>
                <small>Total Rows</small>
                <strong style={{display:'block',fontSize:'24px'}}>
                  {bulkRows.length}
                </strong>
              </div>

              <div className="data-table-card" style={{padding:'14px'}}>
                <small>Ready to Import</small>
                <strong style={{display:'block',fontSize:'24px'}}>
                  {clientValid.length}
                </strong>
              </div>

              <div className="data-table-card" style={{padding:'14px'}}>
                <small>Invalid</small>
                <strong style={{display:'block',fontSize:'24px'}}>
                  {clientInvalid.length}
                </strong>
              </div>

              {bulkImported > 0 &&
                <div className="data-table-card" style={{padding:'14px'}}>
                  <small>Imported</small>
                  <strong style={{display:'block',fontSize:'24px'}}>
                    {bulkImported}
                  </strong>
                </div>
              }
            </div>

            <div className="data-table-card">
              <div className="table-scroll">
                <table className="student-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Department</th>
                      <th>College / Student ID</th>
                      <th>Validation</th>
                    </tr>
                  </thead>

                  <tbody>
                    {bulkRows.map(row=>
                      <tr key={row.row_number}>
                        <td>{row.row_number}</td>
                        <td>
                          <strong>{row.name || 'Missing name'}</strong>
                          <small>{row.email || 'No email'}</small>
                        </td>
                        <td>{row.role || '-'}</td>
                        <td>{row.department || '-'}</td>
                        <td>{row.student_id || row.college_id || '-'}</td>
                        <td>
                          <span className={
                            `status-pill ${row.clientError ? 'gray' : 'green'}`
                          }>
                            {row.clientError || 'Ready'}
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{
              display:'flex',
              justifyContent:'flex-end',
              marginTop:'16px'
            }}>
              <button
                type="button"
                className="button button-primary"
                disabled={bulkBusy || clientValid.length === 0}
                onClick={importBulkUsers}
              >
                {bulkBusy
                  ? 'Importing...'
                  : `Import ${clientValid.length} Valid User(s)`
                }
              </button>
            </div>
          </>
        }

        {bulkFailed.length > 0 &&
          <div style={{marginTop:'20px'}}>
            <h3>Import Failures</h3>

            <div className="data-table-card">
              <div className="table-scroll">
                <table className="student-table">
                  <thead>
                    <tr>
                      <th>CSV Row</th>
                      <th>User</th>
                      <th>ID</th>
                      <th>Reason</th>
                    </tr>
                  </thead>

                  <tbody>
                    {bulkFailed.map((item,index)=>
                      <tr key={`${item.row_number}-${index}`}>
                        <td>{item.row_number}</td>
                        <td>{item.name || '-'}</td>
                        <td>
                          {item.student_id || item.college_id || '-'}
                        </td>
                        <td>{item.error}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        }

        <div className="form-note" style={{marginTop:'16px'}}>
          Student accounts must reference an existing Student ID from
          Student Directory. Passwords must contain at least 10 characters.
          Duplicate accounts are rejected by the server.
        </div>

      </div>
    }

    {show &&
      <form className="user-create-card" onSubmit={create}>
        <div className="form-grid">

          <label>
            Name
            <input name="name" required/>
          </label>

          <label>
            Official Email
            <input name="email" type="email"/>
          </label>

          <label>
            College ID
            <input name="college_id" placeholder="Faculty/staff ID"/>
          </label>

          <label>
            Role
            <select
              value={role}
              onChange={e=>setRole(e.target.value as UserRole)}
            >
              {roles.map(r=>
                <option key={r}>{r}</option>
              )}
            </select>
          </label>

          {['HOD','Main Coordinator','Department Coordinator']
            .includes(role) &&
            <label>
              Department
              <select name="department" required>
                {departments.map(d=>
                  <option key={d}>{d}</option>
                )}
              </select>
            </label>
          }

          {role === 'Student' &&
            <label>
              Existing Student ID
              <input
                name="student_id"
                required
                placeholder="STGEMS..."
              />
            </label>
          }

          <label>
            Temporary Password
            <input
              name="password"
              type="password"
              minLength={10}
              required
              placeholder="At least 10 characters"
            />
          </label>

        </div>

        <div className="form-note">
          Student accounts must be linked to an existing Student Directory record.
        </div>

        <button className="button button-primary">
          Create Account
        </button>
      </form>
    }

    <div className="data-table-card">
      <div className="table-scroll">
        <table className="student-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Department</th>
              <th>College / Student ID</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {rows.map(u=>
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <small>{u.email || 'No email'}</small>
                </td>

                <td>
                  <span className="status-pill blue">
                    {u.role}
                  </span>
                </td>

                <td>{u.department || '-'}</td>

                <td>
                  {u.student_id || u.college_id || '-'}
                </td>

                <td>
                  <span className={
                    `status-pill ${u.active ? 'green' : 'gray'}`
                  }>
                    {u.active ? 'Active' : 'Disabled'}
                  </span>
                </td>

                <td>
                  <div className="user-row-actions">
                    <button
                      className="table-action"
                      onClick={()=>toggle(u)}
                    >
                      {u.active ? 'Disable' : 'Enable'}
                    </button>

                    <button
                      className="table-action"
                      onClick={()=>resetPassword(u)}
                    >
                      Reset Password
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

  </section>
}