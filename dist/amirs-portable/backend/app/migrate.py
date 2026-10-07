"""Миграция со старой схемы (site_program_states) на гибкие колонки."""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from .models import CellValue, Program, ProgramColumn


def _as_iso(value) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()[:10]
    text = str(value).strip()
    return text[:10] if text else None


# key, title, data_type, is_version, use_dropdown, is_actual
AMIRS_COLUMNS = [
    ("version", "Версия базы", "text", True, True, True),
    ("pi_number", "ПИ №", "number", False, True, True),
    ("last_update", "Дата обновления", "date", False, True, False),
    ("address", "Адрес", "text", False, True, False),
    ("backup_info", "Рез. копия", "text", False, True, False),
    ("check_date", "Проверка", "date", False, True, False),
    ("ip", "IP", "text", False, True, False),
    ("archiving", "Архивация", "bool", False, True, False),
    ("db_path", "Расположение базы", "text", False, True, False),
]

SUDIMOST_COLUMNS = [
    ("version", "Версия базы", "text", True, True, True),
    ("check_date", "Патч", "date", False, True, True),
    ("last_update", "Дата", "date", False, True, False),
    ("address", "Адрес", "text", False, True, False),
    ("backup_info", "Готовность", "text", False, True, False),
]

DEFAULT_COLUMNS = [
    ("version", "Версия базы", "text", True, True, True),
    ("last_update", "Дата обновления", "date", False, True, False),
    ("address", "Адрес", "text", False, True, False),
]


def _table_exists(db: Session, name: str) -> bool:
    return inspect(db.get_bind()).has_table(name)


def ensure_schema_patches(db: Session) -> None:
    bind = db.get_bind()
    if not inspect(bind).has_table("programs"):
        return
    prog_cols = {c["name"] for c in inspect(bind).get_columns("programs")}
    if "target_pi" not in prog_cols:
        db.execute(text("ALTER TABLE programs ADD COLUMN target_pi VARCHAR(50)"))

    if inspect(bind).has_table("program_columns"):
        col_cols = {c["name"] for c in inspect(bind).get_columns("program_columns")}
        if "is_actual" not in col_cols:
            db.execute(
                text(
                    "ALTER TABLE program_columns ADD COLUMN is_actual BOOLEAN NOT NULL DEFAULT 0"
                )
            )
        if "target_value" not in col_cols:
            db.execute(
                text("ALTER TABLE program_columns ADD COLUMN target_value VARCHAR(120)")
            )
    db.commit()


def _ensure_columns_for_program(db: Session, program: Program) -> dict[str, ProgramColumn]:
    existing = {
        c.key: c
        for c in db.query(ProgramColumn).filter(ProgramColumn.program_id == program.id).all()
    }
    if existing:
        return existing

    template = DEFAULT_COLUMNS
    if program.code == "amirs":
        template = AMIRS_COLUMNS
    elif program.code == "sudimost":
        template = SUDIMOST_COLUMNS

    created: dict[str, ProgramColumn] = {}
    for idx, (key, title, data_type, is_version, use_dropdown, is_actual) in enumerate(template):
        col = ProgramColumn(
            program_id=program.id,
            key=key,
            title=title,
            data_type=data_type,
            sort_order=idx * 10,
            is_version=is_version,
            use_dropdown=use_dropdown,
            is_actual=is_actual,
            target_value=None,
        )
        db.add(col)
        created[key] = col
    db.flush()
    return created


def _migrate_actual_targets(db: Session) -> None:
    """Проставляет is_actual/target_value из program.target_* и шаблонов."""
    for program in db.query(Program).all():
        cols = {
            c.key: c
            for c in db.query(ProgramColumn)
            .filter(ProgramColumn.program_id == program.id)
            .all()
        }
        if not cols:
            continue

        # Defaults by program type if nothing marked yet
        any_actual = any(c.is_actual for c in cols.values())
        if not any_actual:
            if program.code == "amirs":
                if "version" in cols:
                    cols["version"].is_actual = True
                if "pi_number" in cols:
                    cols["pi_number"].is_actual = True
            elif program.code == "sudimost":
                if "version" in cols:
                    cols["version"].is_actual = True
                if "check_date" in cols:
                    cols["check_date"].is_actual = True
            else:
                if "version" in cols:
                    cols["version"].is_actual = True

        # Copy legacy program-level targets into column target_value once
        if "version" in cols and program.target_version:
            if not cols["version"].target_value:
                cols["version"].target_value = program.target_version
                cols["version"].is_actual = True
        if "pi_number" in cols and program.target_pi:
            if not cols["pi_number"].target_value:
                cols["pi_number"].target_value = program.target_pi
                cols["pi_number"].is_actual = True

        # Sync program.target_version from version column for coloring compatibility
        ver = cols.get("version")
        if ver and ver.target_value:
            program.target_version = ver.target_value


def _set_cell(db: Session, site_id: int, column: ProgramColumn, value: str | None) -> None:
    if value is None or value == "":
        return
    cell = (
        db.query(CellValue)
        .filter(CellValue.site_id == site_id, CellValue.column_id == column.id)
        .first()
    )
    if cell:
        if not cell.value:
            cell.value = value
    else:
        db.add(CellValue(site_id=site_id, column_id=column.id, value=value))


def migrate_legacy_schema(db: Session) -> None:
    programs = db.query(Program).all()
    for program in programs:
        _ensure_columns_for_program(db, program)
    db.flush()
    _migrate_actual_targets(db)
    db.flush()

    if not _table_exists(db, "site_program_states"):
        db.commit()
        return

    rows = db.execute(
        text(
            """
            SELECT s.id AS site_id, s.number, s.address, s.ip,
                   p.code AS program_code,
                   st.version, st.pi_number, st.last_update, st.backup_info,
                   st.check_date, st.archiving, st.db_path
            FROM sites s
            JOIN site_program_states st ON st.site_id = s.id
            JOIN programs p ON p.id = st.program_id
            """
        )
    ).mappings().all()

    programs_by_code = {p.code: p for p in db.query(Program).all()}
    columns_by_program: dict[int, dict[str, ProgramColumn]] = {}
    for program in programs_by_code.values():
        columns_by_program[program.id] = {
            c.key: c
            for c in db.query(ProgramColumn)
            .filter(ProgramColumn.program_id == program.id)
            .all()
        }

    for row in rows:
        program = programs_by_code.get(row["program_code"])
        if not program:
            continue
        cols = columns_by_program.get(program.id, {})
        site_id = row["site_id"]

        mapping = {
            "version": row["version"],
            "pi_number": None if row["pi_number"] is None else str(row["pi_number"]),
            "last_update": _as_iso(row["last_update"]),
            "address": row["address"],
            "backup_info": row["backup_info"],
            "check_date": _as_iso(row["check_date"]),
            "ip": row["ip"],
            "archiving": "+" if row["archiving"] else None,
            "db_path": row["db_path"],
        }
        for key, value in mapping.items():
            col = cols.get(key)
            if col and value not in (None, ""):
                _set_cell(db, site_id, col, str(value))

    db.commit()


def seed_default_programs(db: Session) -> None:
    defaults = [
        ("amirs", "Амирс", "1.7.9.5516"),
        ("sudimost", "Судимость", "3.9.0.5"),
    ]
    for code, name, target in defaults:
        existing = db.query(Program).filter(Program.code == code).first()
        if not existing:
            db.add(Program(code=code, name=name, target_version=target))
    db.commit()
