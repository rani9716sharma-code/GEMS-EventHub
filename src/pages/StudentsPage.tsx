import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { API, useAuth } from '../auth/AuthContext'

type Student = {
  id: number
  student_id: string
  name: string
  department: string
  year: number
  semester: number | null
  batch: string | null
  roll_no: string | null
  barcode_value: string | null
  email: string | null
  phone: string | null
  status: 'Active' | 'Inactive' | 'Passed Out'
}

type Stats = {
  total: number
  active: number
  departments: { department: string; count: number }[]
  years: { year: number; count: number }[]
}

const departments = ['CSE', 'Civil', 'Mechanical', 'Electrical', 'EEE']
const blankStudent = {
  student_id: '', name: '', department: 'CSE', year: '1', semester: '1', batch: '', roll_no: '', barcode_value: '', email: '', phone: '', status: 'Active',
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { values.push(value.trim()); value = '' }
    else value += char
  }
  values.push(value.trim())
  return values
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']))
  })
}

export default function StudentsPage() {
  const { token, user } = useAuth()
  const [students, setStudents] = useState<Student[]>([])

  const [managedEvents,setManagedEvents] =
    useState<any[]>([])

  const [participantEvent,setParticipantEvent] =
    useState('')
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, departments: [], years: [] })
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [year, setYear] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [apiOnline, setApiOnline] = useState(true)
  const [notice, setNotice] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null)
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [form, setForm] = useState(blankStudent)
  const [createLogin, setCreateLogin] = useState(true)
  const [studentPassword, setStudentPassword] = useState('')
  const [confirmStudentPassword, setConfirmStudentPassword] = useState('')
  const [importRows, setImportRows] = useState<Record<string, string>[]>([])
  const [importName, setImportName] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  const departmentCounts = useMemo(() => Object.fromEntries(stats.departments.map((item) => [item.department, item.count])), [stats])

  const isCoordinator =
    user?.role === 'Main Coordinator' ||
    user?.role === 'Department Coordinator'

  const canEditStudents =
    user?.role === 'Super Admin'

  async function loadManagedEvents(){
    if(!isCoordinator || !token) return

    try{
      const res = await fetch(
        `${API}/api/events/manage`,
        {
          headers:{
            Authorization:`Bearer ${token}`
          }
        }
      )

      const body = await res.json()

      if(res.ok){
        setManagedEvents(body.rows || [])
      }

    }catch{}
  }

  useEffect(()=>{
    loadManagedEvents()
  },[token,user?.role])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (query.trim()) {
      params.set('q',query.trim())
    }

    if(
      isCoordinator &&
      participantEvent
    ){
      params.set(
        'event_id',
        participantEvent
      )
    }
    if (department) params.set('department', department)
    if (year) params.set('year', year)
    if (status) params.set('status', status)
    try {
      const [studentsRes, statsRes] = await Promise.all([
        fetch(`${API}/api/students?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/students/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (!studentsRes.ok || !statsRes.ok) throw new Error('API unavailable')
      const list = await studentsRes.json()
      const summary = await statsRes.json()
      setStudents(list.rows)
      setStats(summary)
      setApiOnline(true)
    } catch {
      setApiOnline(false)
      setStudents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(load, 180)
    return () => window.clearTimeout(timer)
  }, [
    query,
    department,
    year,
    status,
    token,
    participantEvent
  ])

  function openAddStudent() {
    setEditingStudentId(null)
    setForm(blankStudent)
    setCreateLogin(true)
    setStudentPassword('')
    setConfirmStudentPassword('')
    setNotice('')
    setShowAdd(true)
  }

  function openEditStudent(student: Student) {
    setEditingStudentId(student.student_id)
    setCreateLogin(false)
    setStudentPassword('')
    setConfirmStudentPassword('')

    setForm({
      student_id: student.student_id,
      name: student.name || '',
      department: student.department || 'CSE',
      year: String(student.year || 1),
      semester: student.semester ? String(student.semester) : '1',
      batch: student.batch || '',
      roll_no: student.roll_no || '',
      barcode_value: student.barcode_value || '',
      email: student.email || '',
      phone: student.phone || '',
      status: student.status || 'Active',
    })

    setNotice('')
    setShowAdd(true)
  }

  function closeStudentModal() {
    setShowAdd(false)
    setEditingStudentId(null)
    setForm(blankStudent)
    setCreateLogin(true)
    setStudentPassword('')
    setConfirmStudentPassword('')
  }

  async function saveStudent(event: FormEvent) {
    event.preventDefault()
    setNotice('')

    if (!editingStudentId && createLogin) {
      if (!form.email.trim()) {
        setNotice('Email is required to create the student login account.')
        return
      }

      if (studentPassword.length < 10) {
        setNotice('Password must be at least 10 characters.')
        return
      }

      if (studentPassword !== confirmStudentPassword) {
        setNotice('Password and Confirm Password do not match.')
        return
      }
    }
    try {
      const url = editingStudentId
        ? `${API}/api/students/${encodeURIComponent(editingStudentId)}`
        : `${API}/api/students`

      const res = await fetch(url, {
        method: editingStudentId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          editingStudentId
            ? form
            : {
                ...form,
                create_login: createLogin,
                password: createLogin ? studentPassword : '',
                confirm_password: createLogin ? confirmStudentPassword : ''
              }
        ),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || body.errors?.join(', ') || 'Could not add student')
      const wasEditing = Boolean(editingStudentId)

      closeStudentModal()

      setNotice(
        wasEditing
          ? `${body.student.name} was updated successfully.`
          : body.login_created
            ? `${body.student.name} was added and the Student login account is ready.`
            : `${body.student.name} was added successfully.`
      )

      load()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : editingStudentId
            ? 'Could not update student.'
            : 'Could not add student.'
      )
    }
  }

  async function deleteStudent(student: Student) {
    const confirmed = window.confirm(
      `Delete ${student.name} (${student.student_id}) permanently?

This should only be used for duplicate or incorrectly added student records.`
    )

    if (!confirmed) return

    setDeletingStudentId(student.student_id)
    setNotice('')

    try {
      const res = await fetch(
        `${API}/api/students/${encodeURIComponent(student.student_id)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const body = await res.json()

      if (!res.ok) {
        throw new Error(
          body.error || 'Could not delete student.'
        )
      }

      setNotice(
        body.message || `${student.name} was deleted successfully.`
      )

      await load()

    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not delete student.'
      )
    } finally {
      setDeletingStudentId(null)
    }
  }

  async function pickCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImportName(file.name)
    const text = await file.text()
    const rows = parseCsv(text)
    setImportRows(rows)
    setNotice(rows.length ? `${rows.length} student rows are ready for validation.` : 'No student rows were found in this CSV file.')
  }

  async function importStudents() {
    if (!importRows.length) return
    setImportBusy(true)
    try {
      const res = await fetch(`${API}/api/students/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ rows: importRows }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Import failed')
      setNotice(`Import complete: ${body.imported} added, ${body.duplicates} duplicates, ${body.invalid} invalid.`)
      setImportRows([])
      setImportName('')
      setShowImport(false)
      load()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Import failed.')
    } finally {
      setImportBusy(false)
    }
  }

  function downloadTemplate() {
    const csv = [
      'Student ID,Name,Department,Year,Semester,Batch,Roll No,Barcode Value,Email,Phone,Status',
      'STGEMS0001,Example Student,CSE,1,1,2026-29,CSE001,,student@example.com,,Active',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'GEMS-EventHub-Student-Import-Template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="students-page page-enter">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">
            {isCoordinator
              ? 'Event Participants'
              : 'Student Management'}
          </span>

          <h2>
            {isCoordinator
              ? 'Registered Students'
              : 'Student Directory'}
          </h2>

          <p className="muted">
            {isCoordinator
              ? 'View student details for events you are assigned to manage.'
              : 'One clean student master database for registration, payments, ID-card check-in, attendance and certificates.'}
          </p>
        </div>
        {canEditStudents && (
          <div className="heading-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setShowImport(true)}
            >
              ⇧ Import CSV
            </button>

            <button
              className="btn btn-primary"
              onClick={openAddStudent}
            >
              ＋ Add Student
            </button>
          </div>
        )}
      </div>

      {!apiOnline && (
        <div className="system-banner danger-banner">
          <strong>Student database API is offline.</strong>
          <span>Run <code>npm run dev</code> from the project folder. EventHub now starts the web app and local database API together.</span>
        </div>
      )}
      {notice && <div className="system-banner">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}

      <div className="student-stat-grid">
        <article className="student-stat featured"><span>Total Students</span><strong>{stats.total}</strong><small>{stats.active} active records</small></article>
        {departments.map((item) => (
          <button key={item} className={`student-stat department-stat ${department === item ? 'selected' : ''}`} onClick={() => setDepartment(department === item ? '' : item)}>
            <span>{item}</span><strong>{departmentCounts[item] || 0}</strong><small>View students →</small>
          </button>
        ))}
      </div>

      {isCoordinator && (
        <div className="coordinator-event-student-filter">
          <div>
            <span className="eyebrow">
              Assigned Event
            </span>

            <b>
              View registered participants
            </b>
          </div>

          <select
            value={participantEvent}
            onChange={e=>{
              setParticipantEvent(
                e.target.value
              )

              setDepartment('')
              setYear('')
              setStatus('')
            }}
          >
            <option value="">
              Department student directory
            </option>

            {managedEvents.map(event=>(
              <option
                key={event.id}
                value={event.id}
              >
                {event.event_code}
                {' • '}
                {event.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="directory-card">
        <div className="directory-toolbar">
          <label className="search-field"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, Student ID, roll no. or barcode" /></label>
          <select value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">All Departments</option>{departments.map((d) => <option key={d}>{d}</option>)}</select>
          <select value={year} onChange={(e) => setYear(e.target.value)}><option value="">All Years</option><option value="1">First Year</option><option value="2">Second Year</option><option value="3">Third Year</option></select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All Statuses</option><option>Active</option><option>Inactive</option><option>Passed Out</option></select>
          <button className="icon-btn" onClick={() => { setQuery(''); setDepartment(''); setYear(''); setStatus('') }} title="Clear filters">↻</button>
        </div>

        <div className="directory-meta"><strong>{loading ? 'Loading…' : `${students.length} records shown`}</strong><span>Search and filters update instantly.</span></div>

        <div className="student-table-wrap">
          <table className="student-table">
            <thead><tr><th>Student</th><th>ID / Roll</th><th>Department</th><th>Academic</th><th>Barcode</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {!loading && students.map((student) => (
                <tr key={student.student_id}>
                  <td><div className="student-identity"><div className="student-avatar">{student.name.slice(0, 1).toUpperCase()}</div><div><strong>{student.name}</strong><small>{student.email || 'No email on record'}</small></div></div></td>
                  <td><strong>{student.student_id}</strong><small>{student.roll_no || 'Roll no. not added'}</small></td>
                  <td><span className="dept-pill">{student.department}</span></td>
                  <td><strong>{['', 'First', 'Second', 'Third'][student.year]} Year</strong><small>{student.semester ? `Semester ${student.semester}` : 'Semester not set'}{student.batch ? ` • ${student.batch}` : ''}</small></td>
                  <td><span className={student.barcode_value ? 'barcode-ready' : 'barcode-missing'}>{student.barcode_value ? '✓ Linked' : 'Not linked'}</span></td>
                  <td><span className={`status-chip ${student.status.toLowerCase().replace(' ', '-')}`}>{student.status}</span></td>
                  <td>
                    {canEditStudents ? (
                    <div className="student-row-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => openEditStudent(student)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={deletingStudentId === student.student_id}
                        onClick={() => deleteStudent(student)}
                      >
                        {deletingStudentId === student.student_id
                          ? 'Deleting…'
                          : 'Delete'}
                      </button>
                    </div>
                    ) : (
                      <span className="coordinator-view-only">
                        View only
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && apiOnline && !students.length && <tr><td colSpan={7}><div className="empty-directory"><strong>No students found</strong><span>Import the college student list or add the first student manually.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <div className="modal-backdrop" onMouseDown={closeStudentModal}><div className="eventhub-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">{editingStudentId ? 'Update Record' : 'New Record'}</span>
            <h3>{editingStudentId ? 'Edit Student' : 'Add Student'}</h3>
          </div>
          <button onClick={closeStudentModal}>×</button>
        </div>
        <form className="student-form" onSubmit={saveStudent}>
          <label>
            Student ID *
            <input
              required
              value={form.student_id}
              disabled={Boolean(editingStudentId)}
              onChange={(e) => setForm({ ...form, student_id: e.target.value })}
              placeholder="e.g. STGEMS2418"
            />
            {editingStudentId && <small>Student ID cannot be changed after creation.</small>}
          </label>
          <label>Student Name *<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Department *<select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>{departments.map((d) => <option key={d}>{d}</option>)}</select></label>
          <label>Year *<select value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}><option value="1">First Year</option><option value="2">Second Year</option><option value="3">Third Year</option></select></label>
          <label>Semester<select value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })}>{[1,2,3,4,5,6].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label>Batch<input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} placeholder="2026-29" /></label>
          <label>Roll Number<input value={form.roll_no} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} /></label>
          <label>Barcode Value<input value={form.barcode_value} onChange={(e) => setForm({ ...form, barcode_value: e.target.value })} placeholder="Leave empty until scanned if unknown" /></label>
          <label>
            Email{!editingStudentId && createLogin ? ' *' : ''}
            <input
              type="email"
              required={!editingStudentId && createLogin}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="student@example.com"
            />
          </label>
          <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>

          {!editingStudentId && (
            <div className="form-span student-login-setup">
              <label className="student-login-toggle">
                <input
                  type="checkbox"
                  checked={createLogin}
                  onChange={(e) => setCreateLogin(e.target.checked)}
                />
                <span>
                  <strong>Create Student Login Account</strong>
                  <small>
                    Student can immediately sign in using Email or Student ID.
                  </small>
                </span>
              </label>
            </div>
          )}

          {!editingStudentId && createLogin && (
            <>
              <label>
                Password *
                <input
                  type="password"
                  required
                  minLength={10}
                  value={studentPassword}
                  onChange={(e) => setStudentPassword(e.target.value)}
                  placeholder="At least 10 characters"
                  autoComplete="new-password"
                />
              </label>

              <label>
                Confirm Password *
                <input
                  type="password"
                  required
                  minLength={10}
                  value={confirmStudentPassword}
                  onChange={(e) => setConfirmStudentPassword(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
              </label>
            </>
          )}

          <label>
            Status
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Passed Out">Passed Out</option>
            </select>
          </label>
          <div className="form-span info-note"><strong>College ID barcode:</strong> Student ID and barcode are stored separately. We will map the real encoded value after testing an actual college ID card.</div>
          <div className="form-actions form-span">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeStudentModal}
            >
              Cancel
            </button>

            <button className="btn btn-primary">
              {editingStudentId ? 'Save Changes' : 'Add Student'}
            </button>
          </div>
        </form>
      </div></div>}

      {showImport && <div className="modal-backdrop" onMouseDown={() => setShowImport(false)}><div className="eventhub-modal import-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header"><div><span className="eyebrow">Bulk Onboarding</span><h3>Import Students</h3></div><button onClick={() => setShowImport(false)}>×</button></div>
        <div className="import-steps"><span className="active">1 Template</span><span className={importRows.length ? 'active' : ''}>2 Upload</span><span className={importRows.length ? 'active' : ''}>3 Review</span><span>4 Import</span></div>
        <button className="template-download" onClick={downloadTemplate}><span>↓</span><div><strong>Download Student Import Template</strong><small>CSV opens directly in Excel, Numbers and Google Sheets.</small></div></button>
        <label className="drop-zone"><input type="file" accept=".csv,text/csv" onChange={pickCsv} /><strong>{importName || 'Choose your completed CSV file'}</strong><span>Drag-and-drop support will be added with the full XLSX importer.</span></label>
        {importRows.length > 0 && <div className="import-preview"><strong>{importRows.length} rows ready</strong><span>EventHub will validate Student ID, department, year, semester and duplicates before storing records.</span><div className="preview-head">{Object.keys(importRows[0]).slice(0, 6).map((key) => <span key={key}>{key}</span>)}</div></div>}
        <div className="form-actions"><button className="btn btn-secondary" onClick={() => setShowImport(false)}>Cancel</button><button disabled={!importRows.length || importBusy || !apiOnline} className="btn btn-primary" onClick={importStudents}>{importBusy ? 'Importing…' : `Import ${importRows.length || ''} Students`}</button></div>
      </div></div>}
    </section>
  )
}
