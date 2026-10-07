import { useEffect, useState } from 'react'
import { api, formatDateTimeRu, type HistoryItem, type SiteRow } from './api'

type Props = {
  row: SiteRow
  programCode: string
  onClose: () => void
}

export function HistoryModal({ row, programCode, onClose }: Props) {
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api
      .getHistory(row.site_id, programCode)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
  }, [row.site_id, programCode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
      >
        <h2 id="history-title">История · участок № {row.number}</h2>
        {error ? <p className="error">{error}</p> : null}
        {items === null && !error ? <p className="loading">Загрузка…</p> : null}
        {items && items.length === 0 ? <p className="empty">Пока нет записей</p> : null}
        {items && items.length > 0 ? (
          <ul className="history-list">
            {items.map((h) => (
              <li key={h.id}>
                <div className="meta">
                  {formatDateTimeRu(h.updated_at)} · {h.updated_by}
                  {h.column_title ? ` · ${h.column_title}` : ''}
                </div>
                <div className="versions">
                  {h.old_value ?? '—'} → {h.new_value ?? '—'}
                </div>
                {h.note ? <div className="meta">{h.note}</div> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
