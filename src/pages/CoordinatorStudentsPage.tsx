import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

import { API } from '../lib/api'

type Student = {
  student_id: string
  name: string
  roll_no?: string | null
  barcode_value?: string | null
  department?: string | null
  year?: number | null
  semester?: number | null
  status?: string | null
  email?: string | null
  phone?: string | null
}

type StudentResponse = {
  rows: Student[]
  total: number
  page: number
  limit: number
  pages: number
  error?: string
}

export default function CoordinatorStudentsPage() {
  const { token, user } = useAuth()

  const [query, setQuery] = useState('')
  const [year, setYear] = useState('')
  const [status, setStatus] = useState('Active')

  const [rows, setRows] = useState<Student[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadStudents(
    requestedPage = 1,
    searchQuery = query,
    selectedYear = year,
    selectedStatus = status
  ) {
    if (!token) return

    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()

      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim())
      }

      if (selectedYear) {
        params.set('year', selectedYear)
      }

      if (selectedStatus) {
        params.set('status', selectedStatus)
      }

      params.set('page', String(requestedPage))
      params.set('limit', '25')

      const res = await fetch(
        `${API}/api/students?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data: StudentResponse = await res.json()

      if (!res.ok) {
        throw new Error(
          data.error || 'Student directory could not be loaded.'
        )
      }

      setRows(Array.isArray(data.rows) ? data.rows : [])
      setTotal(Number(data.total || 0))
      setPage(Number(data.page || 1))
      setPages(Math.max(1, Number(data.pages || 1)))
    } catch (err) {
      setRows([])
      setTotal(0)
      setError(
        err instanceof Error
          ? err.message
          : 'Student directory could not be loaded.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      void loadStudents(1, '', '', 'Active')
    }
  }, [token])

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    void loadStudents(1)
  }

  function clearFilters() {
    setQuery('')
    setYear('')
    setStatus('Active')
    void loadStudents(1, '', '', 'Active')
  }

  return (
    <div className="page-stack coordinator-students-page">
      <section className="page-hero compact">
        <div>
          <span className="eyebrow">
            Department Coordinator Workspace
          </span>

          <h2>Student Search</h2>

          <p>
            Search the Student Directory by Student ID, name,
            roll number or barcode.
            {user?.department
              ? ` Results are restricted to ${user.department}.`
              : ''}
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-mini-head">
          <div>
            <span className="eyebrow">Student Directory</span>
            <h3>Search Students</h3>
          </div>

          <strong>{total} student{total === 1 ? '' : 's'}</strong>
        </div>

        <form
          onSubmit={submitSearch}
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(260px, 2fr) minmax(130px, 0.7fr) minmax(150px, 0.8fr) auto auto',
            gap: '10px',
            alignItems: 'end',
            marginTop: '18px',
          }}
        >
          <label>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Student ID, name, roll no. or barcode"
            />
          </label>

          <label>
            Year
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
            >
              <option value="">All Years</option>
              <option value="1">1st Year</option>
              <option value="2">2nd Year</option>
              <option value="3">3rd Year</option>
            </select>
          </label>

          <label>
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>

          <button
            type="submit"
            className="button button-primary"
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>

          <button
            type="button"
            className="button button-ghost"
            onClick={clearFilters}
            disabled={loading}
          >
            Clear
          </button>
        </form>

        {error && (
          <div
            className="notice error"
            style={{ marginTop: '16px' }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            overflowX: 'auto',
            marginTop: '22px',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: '820px',
            }}
          >
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Roll Number</th>
                <th>Department</th>
                <th>Year</th>
                <th>Semester</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    No students found for the selected filters.
                  </td>
                </tr>
              ) : (
                rows.map((student) => (
                  <tr key={student.student_id}>
                    <td>{student.student_id}</td>
                    <td>{student.name || '—'}</td>
                    <td>{student.roll_no || '—'}</td>
                    <td>{student.department || '—'}</td>
                    <td>{student.year || '—'}</td>
                    <td>{student.semester || '—'}</td>
                    <td>{student.status || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginTop: '18px',
            }}
          >
            <button
              type="button"
              className="button button-ghost button-small"
              disabled={loading || page <= 1}
              onClick={() => void loadStudents(page - 1)}
            >
              Previous
            </button>

            <span>
              Page {page} of {pages}
            </span>

            <button
              type="button"
              className="button button-ghost button-small"
              disabled={loading || page >= pages}
              onClick={() => void loadStudents(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
