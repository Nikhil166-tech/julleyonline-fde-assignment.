# JulleyOnline AI Kanban Assistant Microservice

A lightweight, read-only FastAPI microservice powering natural-language question answering for JulleyOnline workspaces.

## Architecture & Security Boundaries

1. **Express as Sole Gateway:** The Python service is internal and never exposed to the public internet or the browser. It receives requests strictly from the authenticated Express backend.
2. **Zero Database Access:** The service does not connect to PostgreSQL. It operates purely on sanitized in-memory workspace context passed in request payloads.
3. **Four Allowlisted Read-Only Tools:**
   - `get_tasks`
   - `get_overdue_tasks`
   - `get_activity_logs`
   - `get_board_summary`
4. **Deterministic Aggregations:** Counts, distributions, and overdue statuses are computed deterministically. The LLM does not hallucinate statistics.

## Setup & Running

### 1. Install Dependencies
```bash
cd ai-service
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
# Optionally set GEMINI_API_KEY in .env
```

### 3. Run the Microservice
```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Or: py main.py
```

### 4. Run Automated Tests
```bash
pytest tests/
```
