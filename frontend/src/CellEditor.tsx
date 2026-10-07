import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  api,
  formatDisplayValue,
  requireOperator,
  valuesEqual,
  type Column,
  type SiteRow,
} from './api'

type Props = {
  row: SiteRow
  column: Column
  programCode: string
  knownValues: string[]
  targetVersion: string | null
  actualColumns: Column[]
  onUpdated: (row: SiteRow) => void
  onError: (message: string) => void
}

type MenuPos = {
  top: number
  left: number
  width: number
  openUp: boolean
  maxHeight: number
}

/** ok = совпало и весь комплект актуальных ок; warn = совпало само, комплект нет; bad = не совпало */
function fieldStatus(
  column: Column,
  value: string | null,
  row: SiteRow,
  actualColumns: Column[],
  targetVersion: string | null,
): 'ok' | 'warn' | 'bad' | 'neutral' {
  const target =
    column.is_actual && column.target_value?.trim()
      ? column.target_value.trim()
      : column.is_version
        ? targetVersion?.trim() || null
        : null
  if (!target) return 'neutral'

  const selfOk = valuesEqual(value, target)
  if (!selfOk) return 'bad'

  const kit = actualColumns.length
    ? actualColumns
    : column.is_version && targetVersion
      ? [{ ...column, target_value: targetVersion, is_actual: true } as Column]
      : []

  if (kit.length === 0) return 'ok'

  const kitComplete = kit.every((c) =>
    valuesEqual(row.values[c.key], c.target_value),
  )
  return kitComplete ? 'ok' : 'warn'
}

export function CellEditor({
  row,
  column,
  programCode,
  knownValues,
  targetVersion,
  actualColumns,
  onUpdated,
  onError,
}: Props) {
  const value = row.values[column.key] ?? null
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const [pos, setPos] = useState<MenuPos | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const isVersion = column.is_version
  const status = fieldStatus(column, value, row, actualColumns, targetVersion)
  const badgeClass = status

  const options = Array.from(
    new Set(
      [
        ...knownValues,
        value,
        column.target_value,
        isVersion ? targetVersion : null,
      ].filter((v): v is string => Boolean(v && String(v).trim())),
    ),
  )

  const thisActual = column.is_actual ? column.target_value : null
  const showApplyAll = isVersion && actualColumns.length > 0

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null)
      return
    }
    const place = () => {
      const rect = btnRef.current!.getBoundingClientRect()
      const gap = 4
      const pad = 8
      const estimatedH = Math.min(280, 56 + options.length * 36 + (showApplyAll ? 44 : 0))
      const spaceBelow = window.innerHeight - rect.bottom - pad
      const spaceAbove = rect.top - pad
      const openUp = spaceBelow < estimatedH && spaceAbove > spaceBelow
      const maxHeight = Math.max(120, Math.min(280, openUp ? spaceAbove - gap : spaceBelow - gap))
      const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 16)
      let left = rect.left
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, rect.right - width)
      }
      if (left < 8) left = 8
      setPos({
        top: openUp ? rect.top - gap : rect.bottom + gap,
        left,
        width,
        openUp,
        maxHeight,
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, options.length, showApplyAll])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function save(next: string | null) {
    const normalized = next?.trim() ? next.trim() : null
    if ((value ?? null) === normalized) {
      setOpen(false)
      return
    }
    const operator = requireOperator()
    if (!operator) {
      onError('Для изменения нужно указать имя')
      return
    }
    setSaving(true)
    try {
      const updated = await api.updateCells(row.site_id, programCode, {
        values: { [column.key]: normalized },
        updated_by: operator,
        set_update_date: isVersion || Boolean(column.is_actual),
      })
      setOpen(false)
      onUpdated(updated)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  async function applyActuals() {
    if (actualColumns.length === 0) {
      onError('Нет актуальных колонок с заданными значениями')
      return
    }
    const operator = requireOperator()
    if (!operator) {
      onError('Для изменения нужно указать имя')
      return
    }
    setSaving(true)
    try {
      const values: Record<string, string | null> = {}
      for (const col of actualColumns) {
        values[col.key] = col.target_value
      }
      const updated = await api.updateCells(row.site_id, programCode, {
        values,
        updated_by: operator,
        set_update_date: true,
        note: 'Обновлено до актуальных значений',
      })
      setOpen(false)
      onUpdated(updated)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  if (column.data_type === 'bool') {
    return (
      <label
        className={`bool-cell${status === 'neutral' ? '' : ` ${status}`}`}
        onClick={(e) => e.stopPropagation()}
        title={
          status === 'warn'
            ? 'Частично — другие поля ещё не актуальны'
            : undefined
        }
      >
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={saving}
          onChange={(e) => void save(e.target.checked ? '+' : null)}
        />
      </label>
    )
  }

  if (!column.use_dropdown) {
    const display = (
      <button
        type="button"
        className={
          status !== 'neutral'
            ? `badge ${badgeClass} version-trigger`
            : 'plain-cell'
        }
        title={
          status === 'warn'
            ? 'Частично — другие поля ещё не актуальны'
            : status === 'ok'
              ? 'Актуально'
              : status === 'bad'
                ? 'Устарело'
                : undefined
        }
        onClick={() => setOpen(true)}
      >
        {formatDisplayValue(value, column.data_type)}
        {status !== 'neutral' ? <span className="caret">▾</span> : null}
      </button>
    )
    return (
      <div className="inline-edit" onClick={(e) => e.stopPropagation()}>
        {open ? (
          <input
            autoFocus
            value={draft}
            type={
              column.data_type === 'date'
                ? 'date'
                : column.data_type === 'number'
                  ? 'number'
                  : 'text'
            }
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save(draft)
            }}
          />
        ) : (
          display
        )}
      </div>
    )
  }

  const alreadyActual =
    showApplyAll &&
    actualColumns.every((c) => valuesEqual(row.values[c.key], c.target_value))

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            className={`version-menu portal${pos.openUp ? ' up' : ''}`}
            style={{
              position: 'fixed',
              top: pos.openUp ? 'auto' : pos.top,
              bottom: pos.openUp ? window.innerHeight - pos.top : 'auto',
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              zIndex: 1000,
            }}
          >
            {showApplyAll ? (
              <button
                type="button"
                className="btn primary version-actual"
                disabled={saving || alreadyActual}
                title={
                  alreadyActual
                    ? 'Уже актуально'
                    : `Проставить: ${actualColumns.map((c) => `${c.title} ${c.target_value}`).join(' · ')}`
                }
                onClick={() => void applyActuals()}
              >
                Актуальная
              </button>
            ) : null}
            {!isVersion && thisActual ? (
              <button
                type="button"
                className="btn primary version-actual"
                disabled={saving || valuesEqual(value, thisActual)}
                title={valuesEqual(value, thisActual) ? 'Уже актуально' : undefined}
                onClick={() => void save(thisActual)}
              >
                Актуальная: {thisActual}
              </button>
            ) : null}
            <div className="version-custom">
              <input
                value={draft}
                placeholder="Своё значение"
                type={column.data_type === 'date' ? 'date' : 'text'}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save(draft)
                }}
              />
              <button type="button" className="btn primary version-ok" onClick={() => void save(draft)}>
                Сохранить
              </button>
            </div>
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`version-option${opt === value ? ' current' : ''}${
                  opt === (column.target_value || (isVersion ? targetVersion : null))
                    ? ' target'
                    : ''
                }`}
                onClick={() => void save(opt)}
              >
                <span>{formatDisplayValue(opt, column.data_type)}</span>
                {opt === column.target_value || (isVersion && opt === targetVersion) ? (
                  <em>актуально</em>
                ) : null}
                {opt === value ? <em>сейчас</em> : null}
              </button>
            ))}
            {options.length === 0 ? (
              <div className="version-empty">Пока нет значений — введите своё выше</div>
            ) : null}
            {value ? (
              <button type="button" className="version-option" onClick={() => void save(null)}>
                Очистить
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null

  return (
    <div
      className={`version-cell${open ? ' open' : ''}`}
      ref={rootRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        type="button"
        className={`badge ${badgeClass} version-trigger`}
        disabled={saving}
        title={
          status === 'warn'
            ? 'Частично — другие поля ещё не актуальны'
            : status === 'ok'
              ? 'Актуально'
              : status === 'bad'
                ? 'Устарело'
                : undefined
        }
        onClick={() => setOpen((v) => !v)}
      >
        {saving ? '…' : formatDisplayValue(value, column.data_type)}
        <span className="caret">▾</span>
      </button>
      {menu}
    </div>
  )
}
