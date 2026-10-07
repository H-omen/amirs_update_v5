import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..migrate import DEFAULT_COLUMNS
from ..models import CellValue, ChangeHistory, Program, ProgramColumn
from ..schemas import (
    ColumnCreate,
    ColumnOut,
    ColumnUpdate,
    ProgramCreate,
    ProgramOut,
    ProgramUpdate,
)

router = APIRouter(prefix="/api/programs", tags=["programs"])

_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

ALLOWED_TYPES = {"text", "number", "date", "bool"}


def _slugify(value: str) -> str:
    text = value.strip().lower().replace("ё", "е")
    out = []
    for ch in text:
        if ch in _TRANSLIT:
            out.append(_TRANSLIT[ch])
        elif "a" <= ch <= "z" or "0" <= ch <= "9":
            out.append(ch)
        elif ch in {" ", "-", "_", "."}:
            out.append("_")
    slug = re.sub(r"_+", "_", "".join(out)).strip("_")
    slug = re.sub(r"[^a-z0-9_]", "", unicodedata.normalize("NFKD", slug))
    return slug or "program"


def _get_program(db: Session, code: str) -> Program:
    program = db.query(Program).filter(Program.code == code).first()
    if not program:
        raise HTTPException(status_code=404, detail="Программа не найдена")
    return program


def _seed_default_columns(db: Session, program: Program) -> None:
    for idx, (key, title, data_type, is_version, use_dropdown, is_actual) in enumerate(
        DEFAULT_COLUMNS
    ):
        db.add(
            ProgramColumn(
                program_id=program.id,
                key=key,
                title=title,
                data_type=data_type,
                sort_order=idx * 10,
                is_version=is_version,
                use_dropdown=use_dropdown,
                is_actual=is_actual,
            )
        )


@router.get("", response_model=list[ProgramOut])
def list_programs(db: Session = Depends(get_db)):
    return db.query(Program).order_by(Program.id).all()


@router.post("", response_model=ProgramOut, status_code=201)
def create_program(payload: ProgramCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Укажите название программы")

    code = (payload.code or "").strip().lower() or _slugify(name)
    code = re.sub(r"[^a-z0-9_]", "", code.replace("-", "_"))
    if not code:
        raise HTTPException(status_code=400, detail="Некорректный код программы")
    if code in {"all", "api", "new"}:
        raise HTTPException(status_code=400, detail="Этот код зарезервирован")
    if db.query(Program).filter(Program.code == code).first():
        raise HTTPException(status_code=409, detail=f"Программа с кодом «{code}» уже есть")
    if db.query(Program).filter(Program.name == name).first():
        raise HTTPException(status_code=409, detail=f"Программа «{name}» уже есть")

    program = Program(
        code=code,
        name=name,
        target_version=(payload.target_version or "").strip() or None,
        target_pi=(payload.target_pi or "").strip() or None,
    )
    db.add(program)
    db.flush()
    _seed_default_columns(db, program)
    db.commit()
    db.refresh(program)
    return program


@router.get("/{program_code}", response_model=ProgramOut)
def get_program(program_code: str, db: Session = Depends(get_db)):
    return _get_program(db, program_code)


@router.patch("/{program_code}", response_model=ProgramOut)
def update_program(program_code: str, payload: ProgramUpdate, db: Session = Depends(get_db)):
    program = _get_program(db, program_code)
    if payload.target_version is not None:
        program.target_version = payload.target_version.strip() or None
    if payload.target_pi is not None:
        program.target_pi = payload.target_pi.strip() or None
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Название не может быть пустым")
        program.name = name
    db.commit()
    db.refresh(program)
    return program


@router.delete("/{program_code}")
def delete_program(program_code: str, db: Session = Depends(get_db)):
    from sqlalchemy import inspect, text

    program = _get_program(db, program_code)
    pid = program.id

    col_ids = [
        c.id
        for c in db.query(ProgramColumn).filter(ProgramColumn.program_id == pid).all()
    ]
    if col_ids:
        db.query(CellValue).filter(CellValue.column_id.in_(col_ids)).delete(
            synchronize_session=False
        )

    db.query(ChangeHistory).filter(ChangeHistory.program_id == pid).delete(
        synchronize_session=False
    )

    # Старые таблицы до миграции на гибкие колонки
    bind = db.get_bind()
    tables = set(inspect(bind).get_table_names())
    if "site_program_states" in tables:
        if "update_history" in tables:
            db.execute(
                text(
                    """
                    DELETE FROM update_history
                    WHERE state_id IN (
                        SELECT id FROM site_program_states WHERE program_id = :pid
                    )
                    """
                ),
                {"pid": pid},
            )
        db.execute(
            text("DELETE FROM site_program_states WHERE program_id = :pid"),
            {"pid": pid},
        )

    db.query(ProgramColumn).filter(ProgramColumn.program_id == pid).delete(
        synchronize_session=False
    )
    db.delete(program)
    db.commit()
    return {"ok": True}


@router.get("/{program_code}/columns", response_model=list[ColumnOut])
def list_columns(program_code: str, db: Session = Depends(get_db)):
    program = _get_program(db, program_code)
    return (
        db.query(ProgramColumn)
        .filter(ProgramColumn.program_id == program.id)
        .order_by(ProgramColumn.sort_order, ProgramColumn.id)
        .all()
    )


@router.post("/{program_code}/columns", response_model=ColumnOut, status_code=201)
def create_column(program_code: str, payload: ColumnCreate, db: Session = Depends(get_db)):
    program = _get_program(db, program_code)
    title = payload.title.strip()
    data_type = (payload.data_type or "text").strip().lower()
    if data_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Тип: text, number, date или bool")

    key = (payload.key or "").strip().lower() or _slugify(title)
    key = re.sub(r"[^a-z0-9_]", "", key.replace("-", "_"))
    if not key:
        raise HTTPException(status_code=400, detail="Некорректный ключ колонки")
    if db.query(ProgramColumn).filter(
        ProgramColumn.program_id == program.id, ProgramColumn.key == key
    ).first():
        raise HTTPException(status_code=409, detail=f"Колонка «{key}» уже есть")

    max_order = (
        db.query(ProgramColumn)
        .filter(ProgramColumn.program_id == program.id)
        .count()
    )
    sort_order = payload.sort_order if payload.sort_order is not None else max_order * 10

    if payload.is_version:
        db.query(ProgramColumn).filter(
            ProgramColumn.program_id == program.id, ProgramColumn.is_version.is_(True)
        ).update({"is_version": False})

    col = ProgramColumn(
        program_id=program.id,
        key=key,
        title=title,
        data_type=data_type,
        sort_order=sort_order,
        is_version=payload.is_version,
        is_actual=payload.is_actual,
        target_value=(payload.target_value or "").strip() or None,
        use_dropdown=payload.use_dropdown,
    )
    db.add(col)
    db.commit()
    db.refresh(col)
    return col


@router.patch("/{program_code}/columns/{column_id}", response_model=ColumnOut)
def update_column(
    program_code: str, column_id: int, payload: ColumnUpdate, db: Session = Depends(get_db)
):
    program = _get_program(db, program_code)
    col = (
        db.query(ProgramColumn)
        .filter(ProgramColumn.id == column_id, ProgramColumn.program_id == program.id)
        .first()
    )
    if not col:
        raise HTTPException(status_code=404, detail="Колонка не найдена")

    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Название колонки пустое")
        col.title = title
    if payload.data_type is not None:
        data_type = payload.data_type.strip().lower()
        if data_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail="Тип: text, number, date или bool")
        col.data_type = data_type
    if payload.use_dropdown is not None:
        col.use_dropdown = payload.use_dropdown
    if payload.sort_order is not None:
        col.sort_order = payload.sort_order
    if payload.is_version is not None:
        if payload.is_version:
            db.query(ProgramColumn).filter(
                ProgramColumn.program_id == program.id, ProgramColumn.is_version.is_(True)
            ).update({"is_version": False})
        col.is_version = payload.is_version
    if payload.is_actual is not None:
        col.is_actual = payload.is_actual
    if payload.target_value is not None:
        col.target_value = payload.target_value.strip() or None

    # Синхронизация для окраски устаревших
    if col.is_version and col.target_value is not None:
        program.target_version = col.target_value
    elif col.is_version and payload.target_value is not None and not col.target_value:
        program.target_version = None

    db.commit()
    db.refresh(col)
    return col


@router.delete("/{program_code}/columns/{column_id}")
def delete_column(program_code: str, column_id: int, db: Session = Depends(get_db)):
    program = _get_program(db, program_code)
    col = (
        db.query(ProgramColumn)
        .filter(ProgramColumn.id == column_id, ProgramColumn.program_id == program.id)
        .first()
    )
    if not col:
        raise HTTPException(status_code=404, detail="Колонка не найдена")
    db.delete(col)
    db.commit()
    return {"ok": True}
