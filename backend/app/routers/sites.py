from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import CellValue, ChangeHistory, Program, ProgramColumn, Site
from ..schemas import (
    CellUpdate,
    ColumnOut,
    ColumnStats,
    ComboStats,
    HistoryOut,
    ProgramOut,
    ProgramStatsOut,
    SiteCreate,
    SiteNumberUpdate,
    SiteRowOut,
    SitesListOut,
    StatCount,
)

router = APIRouter(prefix="/api/sites", tags=["sites"])


def _version_sort_key(version: str):
    parts = []
    for chunk in version.replace("-", ".").split("."):
        try:
            parts.append((0, int(chunk)))
        except ValueError:
            parts.append((1, chunk))
    return parts


def _get_program(db: Session, code: str) -> Program:
    program = (
        db.query(Program)
        .options(joinedload(Program.columns))
        .filter(Program.code == code)
        .first()
    )
    if not program:
        raise HTTPException(status_code=404, detail="Программа не найдена")
    return program


def _ordered_columns(program: Program) -> list[ProgramColumn]:
    return sorted(program.columns, key=lambda c: (c.sort_order, c.id))


def _version_column(columns: list[ProgramColumn]) -> ProgramColumn | None:
    return next((c for c in columns if c.is_version), None)


def _is_outdated_value(current: str | None, target: str | None) -> bool:
    if not target:
        return False
    if not current:
        return True
    return current.strip() != target.strip()


def _row_is_outdated(
    values: dict[str, str | None],
    columns: list[ProgramColumn],
    program: Program | None = None,
) -> bool:
    actuals = [c for c in columns if c.is_actual and (c.target_value or "").strip()]
    if not actuals:
        # fallback: только колонка версии (+ target_version программы)
        ver = _version_column(columns)
        if not ver:
            return False
        target = ver.target_value or (program.target_version if program else None)
        return _is_outdated_value(values.get(ver.key), target)
    return any(
        _is_outdated_value(values.get(c.key), c.target_value) for c in actuals
    )


def _cell_map(
    db: Session,
    site_id: int,
    columns: list[ProgramColumn],
    cells_by_site: dict[int, dict[int, str | None]] | None = None,
) -> dict[str, str | None]:
    if cells_by_site is not None:
        by_col = cells_by_site.get(site_id, {})
        return {col.key: by_col.get(col.id) for col in columns}
    col_ids = [c.id for c in columns]
    cells = (
        db.query(CellValue)
        .filter(CellValue.site_id == site_id, CellValue.column_id.in_(col_ids))
        .all()
        if col_ids
        else []
    )
    by_col = {c.column_id: c.value for c in cells}
    return {col.key: by_col.get(col.id) for col in columns}


def _load_cells_by_site(
    db: Session, columns: list[ProgramColumn]
) -> dict[int, dict[int, str | None]]:
    col_ids = [c.id for c in columns]
    if not col_ids:
        return {}
    result: dict[int, dict[int, str | None]] = {}
    for cell in db.query(CellValue).filter(CellValue.column_id.in_(col_ids)).all():
        result.setdefault(cell.site_id, {})[cell.column_id] = cell.value
    return result


def _known_values(db: Session, columns: list[ProgramColumn]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for col in columns:
        if not col.use_dropdown:
            result[col.key] = []
            continue
        values = {
            v
            for (v,) in db.query(CellValue.value)
            .filter(
                CellValue.column_id == col.id,
                CellValue.value.isnot(None),
                CellValue.value != "",
            )
            .distinct()
            .all()
            if v
        }
        if col.target_value:
            values.add(col.target_value.strip())
        sorted_vals = sorted(
            values,
            key=_version_sort_key if col.is_version else str.lower,
            reverse=col.is_version,
        )
        result[col.key] = sorted_vals
    return result


def _build_row(
    db: Session,
    site: Site,
    program: Program,
    columns: list[ProgramColumn],
    cells_by_site: dict[int, dict[int, str | None]] | None = None,
) -> SiteRowOut:
    values = _cell_map(db, site.id, columns, cells_by_site)
    return SiteRowOut(
        site_id=site.id,
        number=site.number,
        values=values,
        is_outdated=_row_is_outdated(values, columns, program),
    )


def _set_cells(
    db: Session,
    site: Site,
    program: Program,
    columns: list[ProgramColumn],
    values: dict[str, str | None],
    updated_by: str,
    note: str | None,
    set_update_date: bool,
) -> None:
    cols_by_key = {c.key: c for c in columns}
    any_changed = False

    for key, raw in values.items():
        col = cols_by_key.get(key)
        if not col:
            continue
        new_val = None if raw is None else str(raw).strip()
        if new_val == "":
            new_val = None
        if col.data_type == "bool" and new_val is not None:
            low = new_val.lower()
            if low in {"1", "true", "да", "yes", "+", "x"}:
                new_val = "+"
            elif low in {"0", "false", "нет", "no", "-"}:
                new_val = None
            else:
                new_val = "+" if new_val else None

        cell = (
            db.query(CellValue)
            .filter(CellValue.site_id == site.id, CellValue.column_id == col.id)
            .first()
        )
        old_val = cell.value if cell else None
        if old_val == new_val:
            continue
        any_changed = True
        if cell:
            cell.value = new_val
        else:
            db.add(CellValue(site_id=site.id, column_id=col.id, value=new_val))

        db.add(
            ChangeHistory(
                site_id=site.id,
                program_id=program.id,
                column_id=col.id,
                column_title=col.title,
                old_value=old_val,
                new_value=new_val,
                updated_by=updated_by,
                updated_at=datetime.utcnow(),
                note=note,
            )
        )

    # Дата обновления — при любом изменении ячеек с флагом set_update_date
    # (не только при смене версии: ПИ/патч тоже считаются обновлением)
    if set_update_date and any_changed:
        date_col = next(
            (
                c
                for c in columns
                if c.key in {"last_update", "date"}
                or "обновлен" in c.title.lower()
                or c.title.strip().lower() == "дата"
            ),
            None,
        )
        if date_col and date_col.key not in values:
            today = date.today().isoformat()
            cell = (
                db.query(CellValue)
                .filter(CellValue.site_id == site.id, CellValue.column_id == date_col.id)
                .first()
            )
            old_val = cell.value if cell else None
            if cell:
                cell.value = today
            else:
                db.add(CellValue(site_id=site.id, column_id=date_col.id, value=today))
            db.add(
                ChangeHistory(
                    site_id=site.id,
                    program_id=program.id,
                    column_id=date_col.id,
                    column_title=date_col.title,
                    old_value=old_val,
                    new_value=today,
                    updated_by=updated_by,
                    updated_at=datetime.utcnow(),
                    note="Автодата при обновлении",
                )
            )


@router.get("", response_model=SitesListOut)
def list_sites(
    program: str = Query(...),
    outdated_only: bool = Query(False),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
):
    prog = _get_program(db, program)
    columns = _ordered_columns(prog)
    sites = db.query(Site).order_by(Site.number).all()
    cells_by_site = _load_cells_by_site(db, columns)

    items: list[SiteRowOut] = []
    outdated_all = 0
    needle = q.strip().lower() if q and q.strip() else None

    for site in sites:
        row = _build_row(db, site, prog, columns, cells_by_site)
        if row.is_outdated:
            outdated_all += 1
        if outdated_only and not row.is_outdated:
            continue
        if needle:
            hay = " ".join([str(site.number), *[v or "" for v in row.values.values()]]).lower()
            if needle not in hay:
                continue
        items.append(row)

    return SitesListOut(
        program=ProgramOut.model_validate(prog),
        columns=[ColumnOut.model_validate(c) for c in columns],
        total=len(sites),
        outdated=outdated_all,
        items=items,
        known_values=_known_values(db, columns),
    )


@router.get("/stats", response_model=ProgramStatsOut)
def program_stats(program: str = Query(...), db: Session = Depends(get_db)):
    prog = _get_program(db, program)
    columns = _ordered_columns(prog)
    sites = db.query(Site).order_by(Site.number).all()
    cells_by_site = _load_cells_by_site(db, columns)

    focus = [c for c in columns if c.is_actual]
    if not focus:
        ver = _version_column(columns)
        if ver:
            focus = [ver]

    outdated = 0
    col_counters: dict[str, dict[str | None, int]] = {c.key: {} for c in focus}
    combo_counter: dict[tuple, int] = {}

    for site in sites:
        values = _cell_map(db, site.id, columns, cells_by_site)
        if _row_is_outdated(values, columns, prog):
            outdated += 1

        key_parts: list[str | None] = []
        for col in focus:
            norm = (values.get(col.key) or "").strip() or None
            key_parts.append(norm)
            bucket = col_counters[col.key]
            bucket[norm] = bucket.get(norm, 0) + 1
        if focus:
            tup = tuple(key_parts)
            combo_counter[tup] = combo_counter.get(tup, 0) + 1

    by_column: list[ColumnStats] = []
    for col in focus:
        target = (col.target_value or "").strip() or None
        counts = [
            StatCount(
                value=val,
                label="пусто" if val is None else val,
                count=cnt,
                is_target=bool(target and val == target),
            )
            for val, cnt in col_counters[col.key].items()
        ]
        counts.sort(key=lambda x: (x.value is None, -x.count, x.label))
        by_column.append(
            ColumnStats(
                key=col.key,
                title=col.title,
                target_value=target,
                counts=counts,
            )
        )

    has_targets = bool(focus) and all((c.target_value or "").strip() for c in focus)
    combinations: list[ComboStats] = []
    for key_tuple, cnt in combo_counter.items():
        vals = {col.key: key_tuple[i] for i, col in enumerate(focus)}
        label = " · ".join(
            f"{col.title}: {vals[col.key] if vals[col.key] is not None else '—'}"
            for col in focus
        )
        is_act = has_targets and all(
            vals[col.key] == (col.target_value or "").strip() for col in focus
        )
        combinations.append(
            ComboStats(label=label, values=vals, count=cnt, is_actual=is_act)
        )
    combinations.sort(key=lambda x: (-x.is_actual, -x.count, x.label))

    return ProgramStatsOut(
        program=ProgramOut.model_validate(prog),
        total=len(sites),
        outdated=outdated,
        actual=len(sites) - outdated,
        by_column=by_column,
        combinations=combinations,
    )


@router.post("", response_model=SiteRowOut, status_code=201)
def create_site(payload: SiteCreate, program: str = Query(...), db: Session = Depends(get_db)):
    prog = _get_program(db, program)
    columns = _ordered_columns(prog)

    if payload.number is None:
        max_num = db.query(Site.number).order_by(Site.number.desc()).first()
        number = (max_num[0] if max_num else 0) + 1
    else:
        number = payload.number

    if db.query(Site).filter(Site.number == number).first():
        raise HTTPException(status_code=409, detail=f"Участок № {number} уже существует")

    site = Site(number=number)
    db.add(site)
    db.flush()
    _set_cells(
        db,
        site,
        prog,
        columns,
        payload.values,
        payload.updated_by.strip(),
        "Создание участка",
        set_update_date=False,
    )
    db.commit()
    db.refresh(site)
    return _build_row(db, site, prog, columns)


@router.patch("/{site_id}", response_model=SiteRowOut)
def update_site_cells(
    site_id: int,
    payload: CellUpdate,
    program: str = Query(...),
    db: Session = Depends(get_db),
):
    prog = _get_program(db, program)
    columns = _ordered_columns(prog)
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")

    _set_cells(
        db,
        site,
        prog,
        columns,
        payload.values,
        payload.updated_by.strip(),
        payload.note,
        payload.set_update_date,
    )
    db.commit()
    return _build_row(db, site, prog, columns)


@router.patch("/{site_id}/number", response_model=SiteRowOut)
def update_site_number(
    site_id: int,
    payload: SiteNumberUpdate,
    program: str = Query(...),
    db: Session = Depends(get_db),
):
    prog = _get_program(db, program)
    columns = _ordered_columns(prog)
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")
    exists = db.query(Site).filter(Site.number == payload.number, Site.id != site_id).first()
    if exists:
        raise HTTPException(status_code=409, detail=f"Участок № {payload.number} уже есть")
    old = site.number
    site.number = payload.number
    db.add(
        ChangeHistory(
            site_id=site.id,
            program_id=prog.id,
            column_id=None,
            column_title="№ с/у",
            old_value=str(old),
            new_value=str(payload.number),
            updated_by=payload.updated_by.strip(),
            updated_at=datetime.utcnow(),
            note="Изменение номера участка",
        )
    )
    db.commit()
    return _build_row(db, site, prog, columns)


@router.delete("/{site_id}")
def delete_site(site_id: int, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")
    db.delete(site)
    db.commit()
    return {"ok": True}


@router.get("/{site_id}/history", response_model=list[HistoryOut])
def site_history(
    site_id: int,
    program: str = Query(...),
    db: Session = Depends(get_db),
):
    prog = _get_program(db, program)
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Участок не найден")
    return (
        db.query(ChangeHistory)
        .filter(ChangeHistory.site_id == site_id, ChangeHistory.program_id == prog.id)
        .order_by(ChangeHistory.updated_at.desc())
        .limit(100)
        .all()
    )


@router.post("/seed-empty")
def seed_empty_sites(count: int = Query(68, ge=1, le=200), db: Session = Depends(get_db)):
    created = 0
    for number in range(1, count + 1):
        if not db.query(Site).filter(Site.number == number).first():
            db.add(Site(number=number))
            created += 1
    db.commit()
    return {"created_sites": created, "total": count}
