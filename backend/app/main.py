from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .database import Base, SessionLocal, engine
from .migrate import ensure_schema_patches, migrate_legacy_schema, seed_default_programs
from .routers import export_data, import_data, programs, sites

app = FastAPI(title="Учёт версий программ", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(programs.router)
app.include_router(sites.router)
app.include_router(import_data.router)
app.include_router(export_data.router)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_schema_patches(db)
        seed_default_programs(db)
        migrate_legacy_schema(db)
    finally:
        db.close()


STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@app.get("/api/health")
def health():
    return {"status": "ok"}


if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        # Не подменять API HTML-страницей (иначе «битый» Excel при скачивании)
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail=f"Нет такого API: /{full_path}")
        index = STATIC_DIR / "index.html"
        file_path = STATIC_DIR / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        if index.exists():
            return FileResponse(index)
        return {"message": "Frontend не собран. Запустите npm run build в папке frontend."}
