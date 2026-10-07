import { useEffect, useState, type FormEvent } from 'react'
import { api, requireOperator, type Column, type Program } from './api'

type Props = {
  programs: Program[]
  currentProgramCode: string
  onClose: () => void
  onChanged: () => void
  onProgramCreated?: (program: Program) => void
  onProgramDeleted?: (code: string) => void
}

const TYPE_LABELS: Record<string, string> = {
  text: 'Текст',
  number: 'Число',
  date: 'Дата',
  bool: 'Да/нет',
}

export function SettingsModal({
  programs,
  currentProgramCode,
  onClose,
  onChanged,
  onProgramCreated,
  onProgramDeleted,
}: Props) {
  const [list, setList] = useState(programs)
  const [columnsProgram, setColumnsProgram] = useState(currentProgramCode)
  const [columns, setColumns] = useState<Column[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Column | null>(null)
  const [importProgram, setImportProgram] = useState('all')
  const [exportProgram, setExportProgram] = useState(currentProgramCode || 'all')
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')

  const [colTitle, setColTitle] = useState('')
  const [colType, setColType] = useState('text')
  const [colVersion, setColVersion] = useState(false)
  const [colActual, setColActual] = useState(false)
  const [colTarget, setColTarget] = useState('')
  const [colDropdown, setColDropdown] = useState(true)

  useEffect(() => {
    setList(programs)
    if (!programs.find((p) => p.code === columnsProgram) && programs[0]) {
      setColumnsProgram(programs[0].code)
    }
  }, [programs, columnsProgram])

  useEffect(() => {
    if (!columnsProgram) {
      setColumns([])
      return
    }
    setEditingId(null)
    setEditDraft(null)
    void api
      .getColumns(columnsProgram)
      .then(setColumns)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка колонок'))
  }, [columnsProgram])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingId != null) cancelEdit()
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editingId])

  function startEdit(col: Column) {
    setEditingId(col.id)
    setEditDraft({ ...col })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft(null)
  }

  async function addProgram(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) {
      setError('Укажите название программы')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const created = await api.createProgram({
        name: newName.trim(),
        code: newCode.trim() || undefined,
      })
      setList((prev) => [...prev, created])
      setColumnsProgram(created.code)
      setNewName('')
      setNewCode('')
      setMessage(
        `Программа «${created.name}» добавлена. Отметьте колонки как «актуальные» и задайте значения.`,
      )
      onProgramCreated?.(created)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания')
    } finally {
      setBusy(false)
    }
  }

  async function removeProgram(code: string, name: string) {
    if (!window.confirm(`Удалить программу «${name}» со всеми колонками и данными?`)) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.deleteProgram(code)
      const next = list.filter((p) => p.code !== code)
      setList(next)
      if (columnsProgram === code) {
        setColumnsProgram(next[0]?.code ?? '')
      }
      onProgramDeleted?.(code)
      onChanged()
      setMessage(`Программа «${name}» удалена`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления')
    } finally {
      setBusy(false)
    }
  }

  async function addColumn(e: FormEvent) {
    e.preventDefault()
    if (!colTitle.trim() || !columnsProgram) return
    setBusy(true)
    setError(null)
    try {
      const created = await api.createColumn(columnsProgram, {
        title: colTitle.trim(),
        data_type: colType,
        is_version: colVersion,
        is_actual: colActual,
        target_value: colTarget.trim() || null,
        use_dropdown: colDropdown,
      })
      setColumns((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order))
      setColTitle('')
      setColVersion(false)
      setColActual(false)
      setColTarget('')
      setColDropdown(true)
      setMessage(`Колонка «${created.title}» добавлена`)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editDraft || !columnsProgram) return
    setBusy(true)
    setError(null)
    try {
      const updated = await api.updateColumn(columnsProgram, editDraft.id, {
        title: editDraft.title.trim(),
        data_type: editDraft.data_type,
        is_version: editDraft.is_version,
        is_actual: editDraft.is_actual,
        target_value: editDraft.target_value?.trim() || null,
        use_dropdown: editDraft.use_dropdown,
        sort_order: editDraft.sort_order,
      })
      setColumns((prev) =>
        prev
          .map((c) =>
            c.id === updated.id
              ? updated
              : updated.is_version && c.is_version
                ? { ...c, is_version: false }
                : c,
          )
          .sort((a, b) => a.sort_order - b.sort_order),
      )
      cancelEdit()
      setMessage('Колонка сохранена')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function moveColumn(col: Column, dir: -1 | 1) {
    const sorted = [...columns].sort(
      (a, b) => a.sort_order - b.sort_order || a.id - b.id,
    )
    const idx = sorted.findIndex((c) => c.id === col.id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= sorted.length) return

    const reordered = [...sorted]
    const [item] = reordered.splice(idx, 1)
    reordered.splice(j, 0, item)
    const next = reordered.map((c, i) => ({ ...c, sort_order: i * 10 }))
    const prev = columns
    setColumns(next)
    setError(null)
    setBusy(true)
    try {
      const updated = await api.reorderColumns(
        columnsProgram,
        next.map((c) => c.id),
      )
      setColumns(updated)
      onChanged()
    } catch (err) {
      setColumns(prev)
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function removeColumn(col: Column) {
    if (!window.confirm(`Удалить колонку «${col.title}» и все её значения?`)) return
    setBusy(true)
    try {
      await api.deleteColumn(columnsProgram, col.id)
      setColumns((prev) => prev.filter((c) => c.id !== col.id))
      if (editingId === col.id) cancelEdit()
      setMessage('Колонка удалена')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function doExport() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.exportFile(exportProgram, exportFormat)
      setMessage(
        exportFormat === 'csv' && exportProgram === 'all'
          ? 'Скачан ZIP с CSV по каждой программе'
          : 'Файл скачан',
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка экспорта'
      if (msg === 'Скачивание отменено') {
        setMessage(null)
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  async function doImport(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Выберите файл')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { results } = await api.importFile(importProgram, file)
      setMessage(
        `Импорт: ${results.map((r) => `${r.program_code} (${r.updated_states} строк)`).join(', ')}`,
      )
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка импорта')
    } finally {
      setBusy(false)
    }
  }

  async function addSite() {
    const operator = requireOperator()
    if (!operator) {
      setError('Укажите, кто делает отметку (поле на главной странице)')
      return
    }
    const raw = window.prompt('Номер участка (пусто = следующий):', '')
    if (raw === null) return
    const number = raw.trim() ? Number(raw.trim()) : undefined
    if (raw.trim() && Number.isNaN(number)) {
      setError('Неверный номер участка')
      return
    }
    const program = columnsProgram || currentProgramCode
    if (!program) {
      setError('Нет программы для добавления участка')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const created = await api.createSite(program, {
        number,
        updated_by: operator,
      })
      setMessage(`Добавлен участок № ${created.number}`)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const sortedColumns = [...columns].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  )
  const actualPreview = sortedColumns
    .filter((c) => c.is_actual && c.target_value)
    .map((c) => `${c.title}: ${c.target_value}`)
    .join(' · ')

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="modal wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <h2 id="settings-title">Настройки</h2>
        <p className="sub">
          Программы и колонки. Отметьте поля галочкой «Актуальное» и укажите нужное значение —
          кнопка «Актуальная» в таблице проставит их за один клик (дата обновления — сегодня).
        </p>

        <form className="settings-block" onSubmit={(e) => void addProgram(e)}>
          <strong>Добавить программу</strong>
          <div className="form-grid">
            <label className="field">
              Название
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </label>
            <label className="field">
              Код
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="авто"
              />
            </label>
          </div>
          <button type="submit" className="btn primary" disabled={busy}>
            Добавить программу
          </button>
        </form>

        <hr className="sep" />

        <div className="settings-block">
          <strong>Программы</strong>
          {list.map((p) => (
            <div className="program-row" key={p.code}>
              <span>
                {p.name} <code>{p.code}</code>
              </span>
              <button
                type="button"
                className="btn linkish danger"
                disabled={busy}
                onClick={() => void removeProgram(p.code, p.name)}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>

        <hr className="sep" />

        <div className="settings-block">
          <strong>Колонки и актуальные значения</strong>
          <label className="field">
            Программа
            <select
              value={columnsProgram}
              onChange={(e) => setColumnsProgram(e.target.value)}
            >
              {list.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {actualPreview ? (
            <p className="sub" style={{ margin: 0 }}>
              Кнопка «Актуальная» проставит: <strong>{actualPreview}</strong>
            </p>
          ) : (
            <p className="sub" style={{ margin: 0 }}>
              Актуальные поля ещё не заданы — откройте колонку, включите «Актуальное» и укажите
              значение.
            </p>
          )}

          <div className="columns-list">
            {sortedColumns.map((col, idx) => (
              <div
                key={col.id}
                className={`column-card${editingId === col.id ? ' editing' : ''}`}
              >
                {editingId === col.id && editDraft ? (
                  <div className="column-edit">
                    <label className="field">
                      Название
                      <input
                        value={editDraft.title}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, title: e.target.value })
                        }
                        autoFocus
                      />
                    </label>
                    <div className="form-grid">
                      <label className="field">
                        Тип
                        <select
                          value={editDraft.data_type}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, data_type: e.target.value })
                          }
                        >
                          <option value="text">Текст</option>
                          <option value="number">Число</option>
                          <option value="date">Дата</option>
                          <option value="bool">Да/нет</option>
                        </select>
                      </label>
                      <label className="field">
                        Актуальное значение
                        <input
                          value={editDraft.target_value ?? ''}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              target_value: e.target.value,
                            })
                          }
                          placeholder="например 1.7.9.5516 или дата патча"
                          type={editDraft.data_type === 'date' ? 'date' : 'text'}
                        />
                      </label>
                    </div>
                    <div className="column-flags">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={editDraft.use_dropdown}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              use_dropdown: e.target.checked,
                            })
                          }
                        />
                        Выпадающий список
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={editDraft.is_version}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              is_version: e.target.checked,
                              is_actual: e.target.checked
                                ? true
                                : editDraft.is_actual,
                            })
                          }
                        />
                        Колонка версии (основная)
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={editDraft.is_actual}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              is_actual: e.target.checked,
                            })
                          }
                        />
                        Актуальное (для кнопки «Актуальная» и цвета)
                      </label>
                    </div>
                    <div className="column-edit-actions">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy || !editDraft.title.trim()}
                        onClick={() => void saveEdit()}
                      >
                        Сохранить
                      </button>
                      <button type="button" className="btn" onClick={cancelEdit}>
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="column-view">
                    <div className="column-main">
                      <strong>{col.title}</strong>
                      <span className="column-meta">
                        {TYPE_LABELS[col.data_type] ?? col.data_type}
                        {col.use_dropdown ? ' · список' : ''}
                        {col.is_version ? ' · версия' : ''}
                        {col.is_actual ? ' · актуальное' : ''}
                        {col.is_actual && col.target_value
                          ? ` → ${col.target_value}`
                          : ''}
                      </span>
                    </div>
                    <div className="column-actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || idx === 0}
                        onClick={() => void moveColumn(col, -1)}
                        title="Выше"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || idx === sortedColumns.length - 1}
                        onClick={() => void moveColumn(col, 1)}
                        title="Ниже"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => startEdit(col)}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="btn linkish danger"
                        disabled={busy}
                        onClick={() => void removeColumn(col)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <form className="add-column-card" onSubmit={(e) => void addColumn(e)}>
            <strong>Новая колонка</strong>
            <div className="form-grid">
              <label className="field">
                Название
                <input
                  value={colTitle}
                  onChange={(e) => setColTitle(e.target.value)}
                  placeholder="например Патч"
                  required
                />
              </label>
              <label className="field">
                Тип
                <select value={colType} onChange={(e) => setColType(e.target.value)}>
                  <option value="text">Текст</option>
                  <option value="number">Число</option>
                  <option value="date">Дата</option>
                  <option value="bool">Да/нет</option>
                </select>
              </label>
              <label className="field full">
                Актуальное значение
                <input
                  value={colTarget}
                  onChange={(e) => setColTarget(e.target.value)}
                  type={colType === 'date' ? 'date' : 'text'}
                />
              </label>
            </div>
            <div className="column-flags">
              <label className="check">
                <input
                  type="checkbox"
                  checked={colDropdown}
                  onChange={(e) => setColDropdown(e.target.checked)}
                />
                Список
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={colVersion}
                  onChange={(e) => {
                    const on = e.target.checked
                    setColVersion(on)
                    if (on) setColActual(true)
                  }}
                />
                Версия (основная)
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={colActual}
                  onChange={(e) => setColActual(e.target.checked)}
                />
                Актуальное
              </label>
            </div>
            <button type="submit" className="btn primary" disabled={busy}>
              Добавить колонку
            </button>
          </form>
        </div>

        <hr className="sep" />

        <div className="settings-block">
          <strong>Участки</strong>
          <p className="sub" style={{ margin: 0 }}>
            Редкая операция — обычно участки появляются из импорта Excel.
          </p>
          <button
            type="button"
            className="btn"
            disabled={busy || !(columnsProgram || currentProgramCode)}
            onClick={() => void addSite()}
          >
            Добавить участок
          </button>
        </div>

        <hr className="sep" />

        <div className="settings-block">
          <strong>Экспорт</strong>
          <p className="sub" style={{ margin: 0 }}>
            Excel — листы по программам. CSV для одной программы; для всех — ZIP с отдельными
            CSV.
          </p>
          <div className="form-grid">
            <label className="field">
              Программа
              <select
                value={exportProgram}
                onChange={(e) => setExportProgram(e.target.value)}
              >
                <option value="all">Все программы</option>
                {list.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Формат
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'xlsx' | 'csv')}
              >
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">
                  {exportProgram === 'all' ? 'CSV (.zip)' : 'CSV (.csv)'}
                </option>
              </select>
            </label>
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void doExport()}
          >
            Скачать
          </button>
        </div>

        <hr className="sep" />

        <form className="settings-block" onSubmit={(e) => void doImport(e)}>
          <strong>Импорт Excel / CSV</strong>
          <label className="field">
            Куда
            <select value={importProgram} onChange={(e) => setImportProgram(e.target.value)}>
              <option value="all">Все листы по имени</option>
              {list.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <input
            type="file"
            accept=".xlsx,.xlsm,.csv,.tsv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button type="submit" className="btn primary" disabled={busy}>
            Импортировать
          </button>
        </form>

        {message ? <p style={{ color: 'var(--ok-text)' }}>{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
