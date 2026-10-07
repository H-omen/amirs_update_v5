from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Program(Base):
    __tablename__ = "programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    target_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_pi: Mapped[str | None] = mapped_column(String(50), nullable=True)

    columns: Mapped[list["ProgramColumn"]] = relationship(
        back_populates="program",
        cascade="all, delete-orphan",
        order_by="ProgramColumn.sort_order",
    )


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)

    cells: Mapped[list["CellValue"]] = relationship(
        back_populates="site", cascade="all, delete-orphan"
    )


class ProgramColumn(Base):
    __tablename__ = "program_columns"
    __table_args__ = (UniqueConstraint("program_id", "key", name="uq_program_column_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    program_id: Mapped[int] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    data_type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_version: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_actual: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    target_value: Mapped[str | None] = mapped_column(String(120), nullable=True)
    use_dropdown: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    program: Mapped["Program"] = relationship(back_populates="columns")
    cells: Mapped[list["CellValue"]] = relationship(
        back_populates="column", cascade="all, delete-orphan"
    )


class CellValue(Base):
    __tablename__ = "cell_values"
    __table_args__ = (UniqueConstraint("site_id", "column_id", name="uq_site_column"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), nullable=False)
    column_id: Mapped[int] = mapped_column(
        ForeignKey("program_columns.id", ondelete="CASCADE"), nullable=False
    )
    value: Mapped[str | None] = mapped_column(Text, nullable=True)

    site: Mapped["Site"] = relationship(back_populates="cells")
    column: Mapped["ProgramColumn"] = relationship(back_populates="cells")


class ChangeHistory(Base):
    __tablename__ = "change_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), nullable=False)
    program_id: Mapped[int] = mapped_column(
        ForeignKey("programs.id", ondelete="CASCADE"), nullable=False
    )
    column_id: Mapped[int | None] = mapped_column(
        ForeignKey("program_columns.id", ondelete="SET NULL"), nullable=True
    )
    column_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str] = mapped_column(String(100), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
