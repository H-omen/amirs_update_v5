import { useEffect, useState } from 'react'
import { api, type ProgramStats } from './api'

type Props = {
  programCode: string
  onClose: () => void
}

export function StatsModal({ programCode, onClose }: Props) {
  const [data, setData] = useState<ProgramStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    void api
      .getStats(programCode)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
  }, [programCode])

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
        className="modal wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stats-title"
      >
        <h2 id="stats-title">
          Статистика{data ? ` · ${data.program.name}` : ''}
        </h2>
        <p className="sub">Сколько участков с какими версиями и значениями актуальных полей.</p>

        {error ? <p className="error">{error}</p> : null}
        {!data && !error ? <p className="loading">Загрузка…</p> : null}

        {data ? (
          <>
            <div className="stats-summary">
              <div className="stats-pill">
                Всего <strong>{data.total}</strong>
              </div>
              <div className="stats-pill ok">
                Актуально <strong>{data.actual}</strong>
              </div>
              <div className="stats-pill bad">
                Устарело <strong>{data.outdated}</strong>
              </div>
            </div>

            <div className="stats-grid">
              {data.by_column.map((col) => (
                <section key={col.key} className="stats-block">
                  <h3>
                    {col.title}
                    {col.target_value ? (
                      <span className="th-target"> → {col.target_value}</span>
                    ) : null}
                  </h3>
                  {col.counts.length === 0 ? (
                    <p className="empty">Нет данных</p>
                  ) : (
                    <table className="stats-table">
                      <thead>
                        <tr>
                          <th>Значение</th>
                          <th>Участков</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {col.counts.map((row) => {
                          const pct =
                            data.total > 0
                              ? Math.round((row.count / data.total) * 100)
                              : 0
                          return (
                            <tr
                              key={`${col.key}-${row.label}`}
                              className={row.is_target ? 'is-target' : undefined}
                            >
                              <td>
                                {row.label}
                                {row.is_target ? (
                                  <em className="stats-tag">актуально</em>
                                ) : null}
                              </td>
                              <td className="stats-count">{row.count}</td>
                              <td className="stats-bar-cell">
                                <div className="stats-bar" title={`${pct}%`}>
                                  <span style={{ width: `${pct}%` }} />
                                </div>
                                <span className="stats-pct">{pct}%</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </section>
              ))}
            </div>

            {data.combinations.length > 0 ? (
              <section className="stats-block">
                <h3>Сочетания</h3>
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Набор значений</th>
                      <th>Участков</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.combinations.map((row) => {
                      const pct =
                        data.total > 0
                          ? Math.round((row.count / data.total) * 100)
                          : 0
                      return (
                        <tr
                          key={row.label}
                          className={row.is_actual ? 'is-target' : undefined}
                        >
                          <td>
                            {row.label}
                            {row.is_actual ? (
                              <em className="stats-tag">актуально</em>
                            ) : null}
                          </td>
                          <td className="stats-count">{row.count}</td>
                          <td className="stats-bar-cell">
                            <div className="stats-bar" title={`${pct}%`}>
                              <span style={{ width: `${pct}%` }} />
                            </div>
                            <span className="stats-pct">{pct}%</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            ) : null}
          </>
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
