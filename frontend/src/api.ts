export type Program = {
  id: number
  code: string
  name: string
  target_version: string | null
  target_pi: string | null
}

export type Column = {
  id: number
  key: string
  title: string
  data_type: 'text' | 'number' | 'date' | 'bool' | string
  sort_order: number
  is_version: boolean
  is_actual: boolean
  target_value: string | null
  use_dropdown: boolean
}

export type SiteRow = {
  site_id: number
  number: number
  values: Record<string, string | null>
  is_outdated: boolean
}

export type SitesList = {
  program: Program
  columns: Column[]
  total: number
  outdated: number
  items: SiteRow[]
  known_values: Record<string, string[]>
}

export type ProgramStats = {
  program: Program
  total: number
  outdated: number
  actual: number
  by_column: Array<{
    key: string
    title: string
    target_value: string | null
    counts: Array<{
      value: string | null
      label: string
      count: number
      is_target: boolean
    }>
  }>
  combinations: Array<{
    label: string
    values: Record<string, string | null>
    count: number
    is_actual: boolean
  }>
}

export type HistoryItem = {
  id: number
  column_title: string | null
  old_value: string | null
  new_value: string | null
  updated_by: string
  updated_at: string
  note: string | null
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? JSON.stringify(body)
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  getPrograms: () => request<Program[]>('/api/programs'),

  createProgram: (data: {
    name: string
    code?: string
    target_version?: string | null
    target_pi?: string | null
  }) =>
    request<Program>('/api/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateProgram: (
    code: string,
    data: { target_version?: string | null; target_pi?: string | null; name?: string },
  ) =>
    request<Program>(`/api/programs/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteProgram: (code: string) =>
    request<{ ok: boolean }>(`/api/programs/${code}`, { method: 'DELETE' }),

  getColumns: (code: string) => request<Column[]>(`/api/programs/${code}/columns`),

  createColumn: (
    code: string,
    data: {
      title: string
      key?: string
      data_type?: string
      is_version?: boolean
      is_actual?: boolean
      target_value?: string | null
      use_dropdown?: boolean
      sort_order?: number
    },
  ) =>
    request<Column>(`/api/programs/${code}/columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateColumn: (
    code: string,
    columnId: number,
    data: Partial<{
      title: string
      data_type: string
      is_version: boolean
      is_actual: boolean
      target_value: string | null
      use_dropdown: boolean
      sort_order: number
    }>,
  ) =>
    request<Column>(`/api/programs/${code}/columns/${columnId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteColumn: (code: string, columnId: number) =>
    request<{ ok: boolean }>(`/api/programs/${code}/columns/${columnId}`, { method: 'DELETE' }),

  reorderColumns: (code: string, columnIds: number[]) =>
    request<Column[]>(`/api/programs/${code}/columns/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column_ids: columnIds }),
    }),

  getSites: (program: string, opts?: { outdatedOnly?: boolean; q?: string }) => {
    const params = new URLSearchParams({ program })
    if (opts?.outdatedOnly) params.set('outdated_only', 'true')
    if (opts?.q) params.set('q', opts.q)
    return request<SitesList>(`/api/sites?${params}`)
  },

  getStats: (program: string) =>
    request<ProgramStats>(`/api/sites/stats?program=${encodeURIComponent(program)}`),

  updateCells: (
    siteId: number,
    program: string,
    payload: {
      values: Record<string, string | null>
      updated_by: string
      note?: string | null
      set_update_date?: boolean
    },
  ) =>
    request<SiteRow>(`/api/sites/${siteId}?program=${encodeURIComponent(program)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  updateSiteNumber: (siteId: number, program: string, number: number, updated_by: string) =>
    request<SiteRow>(`/api/sites/${siteId}/number?program=${encodeURIComponent(program)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, updated_by }),
    }),

  createSite: (
    program: string,
    payload: { number?: number | null; values?: Record<string, string | null>; updated_by: string },
  ) =>
    request<SiteRow>(`/api/sites?program=${encodeURIComponent(program)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  deleteSite: (siteId: number) =>
    request<{ ok: boolean }>(`/api/sites/${siteId}`, { method: 'DELETE' }),

  getHistory: (siteId: number, program: string) =>
    request<HistoryItem[]>(
      `/api/sites/${siteId}/history?program=${encodeURIComponent(program)}`,
    ),

  seedEmpty: (count = 68) =>
    request<{ created_sites: number; total: number }>(`/api/sites/seed-empty?count=${count}`, {
      method: 'POST',
    }),

  importFile: async (programCode: string, file: File) => {
    const form = new FormData()
    form.append('program_code', programCode)
    form.append('file', file)
    return request<{
      results: Array<{
        program_code: string
        created_sites: number
        updated_sites: number
        updated_states: number
        errors: string[]
      }>
    }>('/api/import', { method: 'POST', body: form })
  },

  exportFile: async (program: string, format: 'xlsx' | 'csv' = 'xlsx') => {
    const params = new URLSearchParams({ program, format })
    const res = await fetch(`/api/export?${params}`)
    const ct = (res.headers.get('content-type') || '').toLowerCase()

    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = body.detail ?? JSON.stringify(body)
      } catch {
        /* ignore */
      }
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
    }

    if (ct.includes('text/html') || ct.includes('application/json')) {
      throw new Error(
        'Сервер вернул не файл. Перезапустите приложение (start.bat) и попробуйте снова.',
      )
    }

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength < 32) {
      throw new Error('Пустой файл экспорта')
    }

    const cd = res.headers.get('Content-Disposition') ?? ''
    const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(cd)
    const plainMatch = /filename="?([^";]+)"?/i.exec(cd)
    let filename = utfMatch
      ? decodeURIComponent(utfMatch[1])
      : plainMatch?.[1] ?? `export.${format}`

    let mime = 'application/octet-stream'
    if (ct.includes('zip')) {
      mime = 'application/zip'
      if (!filename.toLowerCase().endsWith('.zip')) {
        filename = filename.replace(/\.(csv|xlsx)$/i, '') + '.zip'
      }
    } else if (ct.includes('csv') || filename.toLowerCase().endsWith('.csv')) {
      mime = 'text/csv;charset=utf-8'
    } else if (ct.includes('spreadsheet') || filename.toLowerCase().endsWith('.xlsx')) {
      mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }

    const blob = new Blob([buffer], { type: mime })
    const saved = await saveBlobInPlace(blob, filename)
    if (!saved) {
      throw new Error('Скачивание отменено')
    }
  },
}

/**
 * Скачивание без перехода со страницы.
 * Возвращает false, если пользователь отменил диалог сохранения.
 */
async function saveBlobInPlace(blob: Blob, filename: string): Promise<boolean> {
  const nav = window.navigator as Navigator & {
    msSaveOrOpenBlob?: (blob: Blob, name?: string) => boolean
  }

  if (typeof nav.msSaveOrOpenBlob === 'function') {
    nav.msSaveOrOpenBlob(blob, filename)
    return true
  }

  // Надёжный путь после async fetch: <a download> + blob:
  // showSaveFilePicker здесь нельзя — жест клика уже потерян, диалог
  // часто сразу AbortError и файл «не скачивается», хотя API ок.
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return true
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDisplayValue(value: string | null | undefined, dataType: string): string {
  if (value == null || value === '') return '—'
  if (dataType === 'date' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-')
    return `${d}.${m}.${y}`
  }
  return value
}

export function formatDateTimeRu(iso: string): string {
  try {
    const dt = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
    return dt.toLocaleString('ru-RU')
  } catch {
    return iso
  }
}

export function valuesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (a ?? '').trim() === (b ?? '').trim()
}

export function rowMatchesActuals(
  row: SiteRow,
  actualColumns: Column[],
): boolean {
  if (actualColumns.length === 0) return false
  return actualColumns.every((c) => valuesEqual(row.values[c.key], c.target_value))
}

const OPERATOR_KEY = 'amirs_operator_name'

export function getSavedOperator(): string {
  return localStorage.getItem(OPERATOR_KEY) ?? ''
}

export function saveOperator(name: string): void {
  localStorage.setItem(OPERATOR_KEY, name)
}

export function requireOperator(): string | null {
  let operator = getSavedOperator().trim()
  if (!operator) {
    const entered = window.prompt('Укажите, кто делает отметку:', '')
    if (!entered?.trim()) return null
    operator = entered.trim()
    saveOperator(operator)
  }
  return operator
}
