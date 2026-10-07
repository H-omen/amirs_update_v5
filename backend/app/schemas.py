from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProgramOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    target_version: str | None = None
    target_pi: str | None = None


class ProgramCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str | None = Field(default=None, max_length=50)
    target_version: str | None = None
    target_pi: str | None = None


class ProgramUpdate(BaseModel):
    target_version: str | None = None
    target_pi: str | None = None
    name: str | None = None


class ColumnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    title: str
    data_type: str
    sort_order: int
    is_version: bool
    is_actual: bool = False
    target_value: str | None = None
    use_dropdown: bool


class ColumnCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    key: str | None = None
    data_type: str = "text"
    is_version: bool = False
    is_actual: bool = False
    target_value: str | None = None
    use_dropdown: bool = True
    sort_order: int | None = None


class ColumnUpdate(BaseModel):
    title: str | None = None
    data_type: str | None = None
    is_version: bool | None = None
    is_actual: bool | None = None
    target_value: str | None = None
    use_dropdown: bool | None = None
    sort_order: int | None = None


class ColumnReorder(BaseModel):
    column_ids: list[int]


class SiteRowOut(BaseModel):
    site_id: int
    number: int
    values: dict[str, str | None]
    is_outdated: bool = False


class SitesListOut(BaseModel):
    program: ProgramOut
    columns: list[ColumnOut]
    total: int
    outdated: int
    items: list[SiteRowOut]
    known_values: dict[str, list[str]] = {}


class StatCount(BaseModel):
    value: str | None = None
    label: str
    count: int
    is_target: bool = False


class ColumnStats(BaseModel):
    key: str
    title: str
    target_value: str | None = None
    counts: list[StatCount]


class ComboStats(BaseModel):
    label: str
    values: dict[str, str | None]
    count: int
    is_actual: bool = False


class ProgramStatsOut(BaseModel):
    program: ProgramOut
    total: int
    outdated: int
    actual: int
    by_column: list[ColumnStats]
    combinations: list[ComboStats]


class CellUpdate(BaseModel):
    values: dict[str, str | None]
    updated_by: str = Field(min_length=1, max_length=100)
    note: str | None = None
    set_update_date: bool = True


class SiteCreate(BaseModel):
    number: int | None = None
    values: dict[str, str | None] = {}
    updated_by: str = Field(min_length=1, max_length=100)


class SiteNumberUpdate(BaseModel):
    number: int
    updated_by: str = Field(min_length=1, max_length=100)


class HistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    column_title: str | None
    old_value: str | None
    new_value: str | None
    updated_by: str
    updated_at: datetime
    note: str | None = None


class ImportResult(BaseModel):
    program_code: str
    created_sites: int
    updated_sites: int
    updated_states: int
    errors: list[str] = []


class ImportWorkbookResult(BaseModel):
    results: list[ImportResult]
