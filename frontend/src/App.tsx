import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api,
  getSavedOperator,
  requireOperator,
  rowMatchesActuals,
  saveOperator,
  todayIso,
  type Program,
  type SiteRow,
  type SitesList,
} from './api'
import { CellEditor } from './CellEditor'
import { HistoryModal } from './HistoryModal'
import { SettingsModal } from './SettingsModal'
import { StatsModal } from './StatsModal'

export default function App() {
  const [programCode, setProgramCode] = useState('amirs')
  const [data, setData] = useState<SitesList | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [outdatedOnly, setOutdatedOnly] = useState(false)
  const [historyRow, setHistoryRow] = useState<SiteRow | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [operator, setOperator] = useState(getSavedOperator())
  const toastTimer = useRef<number | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }

  const ensureOperator = (): string | null => {
    const name = requireOperator()
    if (name) {
      setOperator(name)
      saveOperator(name)
    }
    return name
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const progs = await api.getPrograms()
      setPrograms(progs)
      const active = progs.find((p) => p.code === programCode)?.code ?? progs[0]?.code ?? null
      if (!active) {
        setData(null)
        return
      }
      if (active !== programCode) {
        setProgramCode(active)
        return
      }
      const sites = await api.getSites(active, {
        outdatedOnly,
        q: q.trim() || undefined,
      })
      setData(sites)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [programCode, outdatedOnly, q])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 200)
    return () => window.clearTimeout(t)
  }, [load])

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    }
  }, [])

  const currentProgram = programs.find((p) => p.code === programCode) ?? data?.program ?? null
  const versionCol = data?.columns.find((c) => c.is_version)
  const versionTarget =
    versionCol?.target_value ?? currentProgram?.target_version ?? null
  const actualColumns = (data?.columns ?? []).filter(
    (c) => c.is_actual && c.target_value && c.target_value.trim(),
  )

  function onUpdated(updated: SiteRow) {
    setData((prev) => {
      if (!prev) return prev
      const prevRow = prev.items.find((i) => i.site_id === updated.site_id)
      let outdated = prev.outdated
      if (prevRow) {
        if (prevRow.is_outdated && !updated.is_outdated) outdated = Math.max(0, outdated - 1)
        if (!prevRow.is_outdated && updated.is_outdated) outdated += 1
      }
      let items = prev.items.map((i) => (i.site_id === updated.site_id ? updated : i))
      if (outdatedOnly && !updated.is_outdated) {
        items = items.filter((i) => i.site_id !== updated.site_id)
      }
      const known_values = { ...prev.known_values }
      for (const [key, val] of Object.entries(updated.values)) {
        if (!val?.trim()) continue
        const list = known_values[key] ?? []
        if (!list.includes(val)) known_values[key] = [...list, val]
      }
      return { ...prev, items, outdated, known_values }
    })
    showToast(`Участок ${updated.number} обновлён`)
  }

  async function markActual(row: SiteRow) {
    if (actualColumns.length === 0) {
      showToast('В настройках отметьте колонки как «актуальные» и задайте значения')
      return
    }
    if (rowMatchesActuals(row, actualColumns)) {
      showToast('Уже актуально')
      return
    }
    const operatorName = ensureOperator()
    if (!operatorName) return
    const dateColumn = data?.columns.find(
      (c) =>
        c.key === 'last_update' ||
        c.key === 'date' ||
        /обновлен/i.test(c.title) ||
        c.title.trim().toLowerCase() === 'дата',
    )
    try {
      const values: Record<string, string | null> = {}
      for (const col of actualColumns) {
        values[col.key] = col.target_value
      }
      if (dateColumn && !(dateColumn.key in values)) {
        values[dateColumn.key] = todayIso()
      }
      const updated = await api.updateCells(row.site_id, programCode, {
        values,
        updated_by: operatorName,
        set_update_date: true,
        note: 'Обновлено до актуальных значений',
      })
      onUpdated(updated)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  async function deleteRow(row: SiteRow) {
    if (!window.confirm(`Удалить участок № ${row.number}? Строка удалится для всех программ.`)) {
      return
    }
    try {
      await api.deleteSite(row.site_id)
      setData((prev) => {
        if (!prev) return prev
        const removed = prev.items.find((i) => i.site_id === row.site_id)
        return {
          ...prev,
          items: prev.items.filter((i) => i.site_id !== row.site_id),
          total: Math.max(0, prev.total - 1),
          outdated:
            removed?.is_outdated ? Math.max(0, prev.outdated - 1) : prev.outdated,
        }
      })
      showToast(`Участок № ${row.number} удалён`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  async function editNumber(row: SiteRow) {
    const operatorName = ensureOperator()
    if (!operatorName) return
    const raw = window.prompt('Новый номер участка:', String(row.number))
    if (raw === null) return
    const number = Number(raw.trim())
    if (Number.isNaN(number)) {
      showToast('Неверный номер')
      return
    }
    try {
      const updated = await api.updateSiteNumber(row.site_id, programCode, number, operatorName)
      onUpdated(updated)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const actualSummary =
    actualColumns.length > 0
      ? actualColumns.map((c) => `${c.title}: ${c.target_value}`).join(' · ')
      : 'не заданы'

  const emptyHint =
    outdatedOnly || q.trim()
      ? 'Нет строк по текущему фильтру.'
      : 'Нет строк. Добавьте участок или импортируйте Excel в настройках.'

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Учёт версий на судебных участках</h1>
          <p>
            Актуальные значения {currentProgram?.name ?? '—'}:{' '}
            <strong>{actualSummary}</strong>
          </p>
        </div>
        <div className="tabs" role="tablist">
          {programs.map((p) => (
            <button
              key={p.code}
              type="button"
              role="tab"
              aria-selected={programCode === p.code}
              className={`tab${programCode === p.code ? ' active' : ''}`}
              onClick={() => {
                if (p.code === programCode) return
                setData(null)
                setProgramCode(p.code)
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </header>

      <div className="toolbar">
        <div className="stat">
          {data ? (
            <>
              Участков: {data.total}
              {versionTarget || actualColumns.length > 0 ? (
                <>
                  {' · '}
                  <span className="outdated">устарело: {data.outdated}</span>
                </>
              ) : null}
              {data.items.length !== data.total && (outdatedOnly || q.trim()) ? (
                <> · показано: {data.items.length}</>
              ) : null}
            </>
          ) : (
            '—'
          )}
        </div>
        {actualColumns.length > 0 ? (
          <div className="legend" title="Цвет актуальных полей">
            <span className="badge ok">актуально</span>
            <span className="badge warn">частично</span>
            <span className="badge bad">устарело</span>
          </div>
        ) : null}
        <input
          className="search"
          placeholder="Поиск по номеру и значениям…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="field operator-field">
          Кто отмечает
          <input
            value={operator}
            placeholder="Фамилия"
            onChange={(e) => {
              setOperator(e.target.value)
              saveOperator(e.target.value)
            }}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={outdatedOnly}
            onChange={(e) => setOutdatedOnly(e.target.checked)}
          />
          Только устаревшие
        </label>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
          Обновить
        </button>
        <button
          type="button"
          className="btn"
          disabled={!programCode || loading}
          onClick={() => setStatsOpen(true)}
        >
          Статистика
        </button>
        <button
          type="button"
          className="btn"
          disabled={!programCode || loading}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void api
              .exportFile(programCode, 'xlsx')
              .then(() => showToast('Файл скачан'))
              .catch((err) => showToast(err instanceof Error ? err.message : 'Ошибка экспорта'))
          }}
        >
          Экспорт
        </button>
        <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>
          Настройки
        </button>
      </div>

      <div className="table-wrap">
        {loading && !data ? <div className="loading">Загрузка…</div> : null}
        {error ? <div className="error">{error}</div> : null}
        {!error && data && data.items.length === 0 ? (
          <div className="empty">{emptyHint}</div>
        ) : null}
        {!error && data && data.items.length > 0 ? (
          <table className="sites">
            <thead>
              <tr>
                <th>№ с/у</th>
                {data.columns.map((col) => (
                  <th key={col.id}>
                    {col.title}
                    {col.is_actual && col.target_value ? (
                      <span className="th-target" title={`Актуальное: ${col.target_value}`}>
                        {' '}
                        → {col.target_value}
                      </span>
                    ) : null}
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => {
                const already = rowMatchesActuals(row, actualColumns)
                return (
                  <tr key={row.site_id} className={row.is_outdated ? 'row-outdated' : undefined}>
                    <td className="num">
                      <button
                        type="button"
                        className="plain-cell num-btn"
                        onClick={() => void editNumber(row)}
                        title="Изменить номер"
                      >
                        {row.number}
                      </button>
                    </td>
                    {data.columns.map((col) => (
                      <td key={col.id} className={col.key === 'db_path' ? 'path' : undefined}>
                        <CellEditor
                          row={row}
                          column={col}
                          programCode={programCode}
                          knownValues={data.known_values[col.key] ?? []}
                          targetVersion={versionTarget}
                          actualColumns={actualColumns}
                          onUpdated={onUpdated}
                          onError={showToast}
                        />
                      </td>
                    ))}
                    <td className="row-actions">
                      {actualColumns.length > 0 ? (
                        <button
                          type="button"
                          className="btn linkish actual"
                          title={already ? 'Уже актуально' : `Проставить: ${actualSummary}`}
                          disabled={already}
                          onClick={() => void markActual(row)}
                        >
                          Актуальная
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn linkish"
                        onClick={() => setHistoryRow(row)}
                      >
                        История
                      </button>
                      <button
                        type="button"
                        className="btn linkish danger"
                        onClick={() => void deleteRow(row)}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}
      </div>

      {statsOpen ? (
        <StatsModal programCode={programCode} onClose={() => setStatsOpen(false)} />
      ) : null}

      {historyRow ? (
        <HistoryModal
          row={historyRow}
          programCode={programCode}
          onClose={() => setHistoryRow(null)}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsModal
          programs={programs}
          currentProgramCode={programCode}
          onClose={() => setSettingsOpen(false)}
          onProgramCreated={(program) => {
            setProgramCode(program.code)
            showToast(`Добавлена программа «${program.name}»`)
          }}
          onProgramDeleted={(code) => {
            if (programCode === code) {
              setProgramCode(programs.find((p) => p.code !== code)?.code ?? '')
            }
            showToast('Программа удалена')
          }}
          onChanged={() => void load()}
        />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
