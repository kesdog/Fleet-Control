# Backend

The v0.1.0 FastAPI backend initializes its SQLite schema during application startup.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

`GET /api/health` confirms the application and database are available.

Run checks with `pytest`, `ruff check .`, and `mypy app`.
