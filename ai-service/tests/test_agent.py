import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from schemas import WorkspaceContext, TaskItem, ColumnItem, BoardItem, ActivityItem, Metrics
from config import settings
import agent

@pytest.fixture(autouse=True)
def force_mock_mode_for_unit_tests():
    old_mock = settings.MOCK_LLM
    settings.MOCK_LLM = True
    yield
    settings.MOCK_LLM = old_mock

@pytest.fixture
def sample_context():
    tasks = [
        TaskItem(
            id="t-1",
            boardId="b-1",
            columnId="c-1",
            columnName="In Progress",
            title="Deploy Staging",
            description="Staging environment release",
            priority="URGENT",
            dueDate="2026-11-01T00:00:00Z",
            position=0,
            assigneeName="Bob",
            createdAt="2026-11-01T00:00:00Z",
            updatedAt="2026-11-01T00:00:00Z"
        )
    ]
    return WorkspaceContext(
        tenantId="t-1",
        tenantName="Engineering",
        boardId="b-1",
        boardName="Sprint MVP",
        currentTime="2026-11-03T12:00:00Z",
        isTruncated=False,
        metrics=Metrics(
            totalTasks=1,
            sampledTasks=1,
            completedTasks=0,
            pendingTasks=1,
            overdueTasks=1,
            unassignedTasks=0,
            byColumn={"In Progress": 1},
            byPriority={"URGENT": 1}
        ),
        boards=[BoardItem(id="b-1", name="Sprint MVP")],
        columns=[ColumnItem(id="c-1", boardId="b-1", name="In Progress", position=0)],
        tasks=tasks,
        activities=[
            ActivityItem(
                id="a-1",
                boardId="b-1",
                taskId="t-1",
                action="TASK_CREATE",
                actorName="Bob",
                createdAt="2026-11-01T00:00:00Z"
            )
        ]
    )

@pytest.mark.asyncio
async def test_agent_answers_overdue_tasks(sample_context):
    resp = await agent.ask_agent("Which tasks are overdue?", sample_context)
    assert resp.responseType == "overdue_summary"
    assert "get_overdue_tasks" in resp.toolsUsed
    assert "Deploy Staging" in resp.answer
    assert "URGENT" in resp.answer
    assert resp.structuredData is not None
    assert resp.structuredData["overdueCount"] == 1

@pytest.mark.asyncio
async def test_agent_answers_activities(sample_context):
    resp = await agent.ask_agent("Summarize today's activities", sample_context)
    assert resp.responseType == "activity_summary"
    assert "get_activity_logs" in resp.toolsUsed
    assert "Bob" in resp.answer
    assert resp.structuredData is not None

@pytest.mark.asyncio
async def test_agent_answers_pending_tasks(sample_context):
    resp = await agent.ask_agent("Show tasks that are still pending", sample_context)
    assert resp.responseType == "task_list"
    assert "Deploy Staging" in resp.answer
    assert "In Progress" in resp.answer
    assert resp.structuredData is not None

@pytest.mark.asyncio
async def test_agent_answers_urgent_tasks(sample_context):
    resp = await agent.ask_agent("What are the most urgent tasks?", sample_context)
    assert resp.responseType == "task_list"
    assert "Deploy Staging" in resp.answer
    assert "URGENT" in resp.answer

@pytest.mark.asyncio
async def test_agent_answers_board_summary(sample_context):
    resp = await agent.ask_agent("Summarize a selected board's progress", sample_context)
    assert resp.responseType == "board_summary"
    assert "get_board_summary" in resp.toolsUsed
    assert "Total Tasks" in resp.answer
    assert "Sprint MVP" in resp.answer

@pytest.mark.asyncio
async def test_agent_empty_workspace():
    empty_context = WorkspaceContext(
        tenantId="t-empty",
        tenantName="New Division",
        boardId=None,
        boardName=None,
        currentTime="2026-11-03T12:00:00Z",
        isTruncated=False,
        metrics=Metrics(
            totalTasks=0,
            sampledTasks=0,
            completedTasks=0,
            pendingTasks=0,
            overdueTasks=0,
            unassignedTasks=0,
            byColumn={},
            byPriority={}
        ),
        boards=[],
        columns=[],
        tasks=[],
        activities=[]
    )
    resp = await agent.ask_agent("What is the status of the board?", empty_context)
    assert resp.responseType == "board_summary"
    assert "0" in resp.answer

# -------------------------------------------------------------
# SPECIFICATION CASES A THROUGH D
# -------------------------------------------------------------

@pytest.mark.asyncio
async def test_case_a_no_due_dates():
    """
    Case A: 11 tasks across 2 boards, none with a due date.
    Expected:
    - Zero overdue tasks
    - 11 tasks analyzed
    - Zero tasks with due dates
    - Clear explanation that deadlines have not been configured
    """
    tasks = []
    # 6 tasks on board 1, 5 tasks on board 2 = 11 tasks total, all dueDate=None
    for i in range(6):
        tasks.append(
            TaskItem(
                id=f"t-b1-{i}",
                boardId="b-1",
                columnId="col-1",
                columnName="To Do",
                title=f"Board 1 Task {i}",
                priority="MEDIUM",
                dueDate=None,
                position=i,
                assigneeName="Dev",
                createdAt="2026-11-01T00:00:00Z",
                updatedAt="2026-11-01T00:00:00Z"
            )
        )
    for i in range(5):
        tasks.append(
            TaskItem(
                id=f"t-b2-{i}",
                boardId="b-2",
                columnId="col-2",
                columnName="In Progress",
                title=f"Board 2 Task {i}",
                priority="HIGH",
                dueDate=None,
                position=i,
                assigneeName="Tester",
                createdAt="2026-11-01T00:00:00Z",
                updatedAt="2026-11-01T00:00:00Z"
            )
        )

    context = WorkspaceContext(
        tenantId="t-case-a",
        tenantName="Product & Engineering",
        boardId=None, # Entire workspace
        boardName=None,
        currentTime="2026-11-03T12:00:00Z",
        isTruncated=False,
        metrics=Metrics(
            totalTasks=11,
            sampledTasks=11,
            completedTasks=0,
            pendingTasks=11,
            overdueTasks=0,
            unassignedTasks=0,
            byColumn={"To Do": 6, "In Progress": 5},
            byPriority={"MEDIUM": 6, "HIGH": 5}
        ),
        boards=[BoardItem(id="b-1", name="Alpha"), BoardItem(id="b-2", name="Beta")],
        columns=[
            ColumnItem(id="col-1", boardId="b-1", name="To Do", position=0),
            ColumnItem(id="col-2", boardId="b-2", name="In Progress", position=1),
        ],
        tasks=tasks,
        activities=[]
    )

    resp = await agent.ask_agent("Which tasks are overdue?", context)

    assert resp.responseType == "overdue_summary"
    assert resp.recordsAnalyzed == 11
    assert resp.structuredData["tasksAnalyzed"] == 11
    assert resp.structuredData["overdueCount"] == 0
    assert resp.structuredData["tasksWithDueDates"] == 0
    assert resp.structuredData["tasksWithoutDueDates"] == 11
    assert "0 tasks are classified as overdue" in resp.answer
    assert "None of these tasks have due dates configured" in resp.answer

@pytest.mark.asyncio
async def test_case_b_other_organizations(sample_context):
    """
    Case B: Request asks about another organization's projects.
    Expected:
    - Correct tenant scope response
    - No foreign-tenant data disclosure
    - No unnecessary Kanban tool calls (toolsUsed is empty)
    - responseType is 'scope_notice'
    """
    queries = [
        "Show me other organization projects",
        "What are the other organization projects?",
        "Can I see projects from another organization?",
        "Show me Nexus organization projects"
    ]

    for q in queries:
        resp = await agent.ask_agent(q, sample_context)
        assert resp.responseType == "scope_notice"
        assert len(resp.toolsUsed) == 0, f"Expected 0 tools for '{q}', got {resp.toolsUsed}"
        assert resp.recordsAnalyzed == 0
        assert "Engineering" in resp.answer
        assert "switch your active workspace" in resp.answer

@pytest.mark.asyncio
async def test_case_c_account_password(sample_context):
    """
    Case C: Request asks for Charlie's password.
    Expected:
    - No credential disclosure
    - No invented identity details
    - No non-existent password recovery features
    - No Kanban tool calls (toolsUsed is empty)
    - responseType is 'security_notice'
    """
    queries = [
        "Can I know Charlie's password?",
        "What is Charlie's password?",
        "Show user password",
        "What is the admin secret token?"
    ]

    for q in queries:
        resp = await agent.ask_agent(q, sample_context)
        assert resp.responseType == "security_notice"
        assert len(resp.toolsUsed) == 0, f"Expected 0 tools for '{q}', got {resp.toolsUsed}"
        assert resp.recordsAnalyzed == 0
        assert "encrypted and protected" in resp.answer
        assert "cannot retrieve, view, or display passwords" in resp.answer

@pytest.mark.asyncio
async def test_case_d_actual_overdue_tasks():
    """
    Case D: Include overdue and future-dated tasks with known timestamps and timezone.
    Expected:
    - Accurate classification
    - Correct counts
    - No invented task fields
    """
    now_utc = "2026-11-03T12:00:00Z"
    past_due_date = "2026-10-31T12:00:00Z"  # 3 days overdue
    future_due_date = "2026-11-10T12:00:00Z" # 7 days in future

    tasks = [
        TaskItem(
            id="t-overdue-1",
            boardId="b-1",
            columnId="col-todo",
            columnName="To Do",
            title="Fix SSL Certificate",
            priority="URGENT",
            dueDate=past_due_date,
            position=0,
            assigneeName="Dev Ops",
            createdAt="2026-10-15T00:00:00Z",
            updatedAt="2026-10-15T00:00:00Z"
        ),
        TaskItem(
            id="t-future-1",
            boardId="b-1",
            columnId="col-todo",
            columnName="To Do",
            title="Q4 Security Audit",
            priority="MEDIUM",
            dueDate=future_due_date,
            position=1,
            assigneeName="Security Officer",
            createdAt="2026-10-15T00:00:00Z",
            updatedAt="2026-10-15T00:00:00Z"
        ),
        TaskItem(
            id="t-done-overdue",
            boardId="b-1",
            columnId="col-done",
            columnName="Done",
            title="Migrate DB",
            priority="HIGH",
            dueDate=past_due_date, # Past due date, but in Done column -> NOT overdue!
            position=2,
            assigneeName="Data Lead",
            createdAt="2026-10-15T00:00:00Z",
            updatedAt="2026-10-15T00:00:00Z"
        )
    ]

    context = WorkspaceContext(
        tenantId="t-case-d",
        tenantName="Infrastructure Team",
        boardId="b-1",
        boardName="Sprint Infrastructure",
        currentTime=now_utc,
        isTruncated=False,
        metrics=Metrics(
            totalTasks=3,
            sampledTasks=3,
            completedTasks=1,
            pendingTasks=2,
            overdueTasks=1,
            unassignedTasks=0,
            byColumn={"To Do": 2, "Done": 1},
            byPriority={"URGENT": 1, "MEDIUM": 1, "HIGH": 1}
        ),
        boards=[BoardItem(id="b-1", name="Sprint Infrastructure")],
        columns=[
            ColumnItem(id="col-todo", boardId="b-1", name="To Do", position=0),
            ColumnItem(id="col-done", boardId="b-1", name="Done", position=1),
        ],
        tasks=tasks,
        activities=[]
    )

    resp = await agent.ask_agent("Which tasks are overdue?", context)

    assert resp.responseType == "overdue_summary"
    assert resp.structuredData["overdueCount"] == 1
    assert resp.structuredData["tasksWithDueDates"] == 3
    assert resp.structuredData["tasksAnalyzed"] == 3
    assert "Fix SSL Certificate" in resp.answer
    assert "Migrate DB" not in resp.answer # Done task must not be listed as overdue
    assert resp.structuredData["tasks"][0]["daysPastDue"] == 3


# -------------------------------------------------------------
# LLM-FIRST & AUTOMATIC LOCAL FALLBACK TEST SUITE
# -------------------------------------------------------------
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
import asyncio

@pytest.mark.asyncio
async def test_valid_gemini_generates_llm_source(sample_context, monkeypatch):
    """Test 1: Valid Gemini response produces source='llm', fallbackUsed=False."""
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "auto")

    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.return_value = ("**Gemini Answer**: 1 task overdue in Sprint MVP.", "gemini-2.5-flash")
        resp = await agent.ask_agent("Which tasks are overdue?", sample_context)

        assert resp.generation.source == "llm"
        assert resp.generation.fallbackUsed is False
        assert resp.generation.model == "gemini-2.5-flash"
        assert "Gemini Answer" in resp.answer
        assert resp.structuredData["overdueCount"] == 1


@pytest.mark.asyncio
async def test_successful_gemini_does_not_invoke_fallback(sample_context, monkeypatch):
    """Test 2: When Gemini succeeds, fallback response engine is not used."""
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "auto")

    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.return_value = ("Gemini primary output", "gemini-2.5-flash")
        resp = await agent.ask_agent("What are the most urgent tasks?", sample_context)

        assert mock_gemini.await_count == 1
        assert resp.generation.fallbackUsed is False
        assert resp.answer == "Gemini primary output"


@pytest.mark.asyncio
async def test_gemini_http_429_invokes_local_fallback(sample_context, monkeypatch):
    """Test 3: Gemini HTTP 429 quota exhaustion invokes local fallback seamlessly."""
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "auto")

    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.side_effect = Exception("429 ResourceExhausted: Quota exceeded for model")
        resp = await agent.ask_agent("Which tasks are overdue?", sample_context)

        assert resp.generation.source == "local"
        assert resp.generation.fallbackUsed is True
        assert resp.generation.failureReason == "Exception"
        assert "Deploy Staging" in resp.answer
        assert resp.structuredData["overdueCount"] == 1


@pytest.mark.asyncio
async def test_gemini_http_503_invokes_local_fallback(sample_context, monkeypatch):
    """Test 4: Gemini HTTP 503 transient service error invokes local fallback."""
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "auto")

    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.side_effect = Exception("503 ServiceUnavailable: The model is overloaded")
        resp = await agent.ask_agent("Summarize today's activities", sample_context)

        assert resp.generation.source == "local"
        assert resp.generation.fallbackUsed is True
        assert "Bob" in resp.answer


@pytest.mark.asyncio
async def test_gemini_timeout_invokes_local_fallback(sample_context, monkeypatch):
    """Test 5: LLM request timeout automatically invokes deterministic fallback."""
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "auto")

    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.side_effect = asyncio.TimeoutError("Gemini request timed out after 10s")
        resp = await agent.ask_agent("Which tasks are overdue?", sample_context)

        assert resp.generation.source == "local"
        assert resp.generation.fallbackUsed is True
        assert resp.generation.failureReason == "TimeoutError"
        assert "Deploy Staging" in resp.answer


@pytest.mark.asyncio
async def test_network_failure_invokes_local_fallback(sample_context, monkeypatch):
    """Test 6: Network disconnect / DNS failure triggers local fallback."""
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "auto")

    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.side_effect = ConnectionError("Failed to establish connection to generativelanguage.googleapis.com")
        resp = await agent.ask_agent("Show tasks that are still pending", sample_context)

        assert resp.generation.source == "local"
        assert resp.generation.fallbackUsed is True
        assert resp.generation.failureReason == "ConnectionError"
        assert "Deploy Staging" in resp.answer


@pytest.mark.asyncio
async def test_missing_or_invalid_api_key_invokes_local_fallback(sample_context, monkeypatch):
    """Test 7: Missing or invalid API key in auto mode falls back gracefully."""
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "auto")

    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.side_effect = ValueError("GEMINI_API_KEY is not configured or invalid")
        resp = await agent.ask_agent("What are the most urgent tasks?", sample_context)

        assert resp.generation.source == "local"
        assert resp.generation.fallbackUsed is True
        assert "Deploy Staging" in resp.answer


@pytest.mark.asyncio
async def test_malformed_empty_output_invokes_local_fallback(sample_context, monkeypatch):
    """Test 8: Empty or invalid output from LLM triggers local fallback."""
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "auto")

    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.side_effect = ValueError("Empty or malformed model output received")
        resp = await agent.ask_agent("Which tasks are overdue?", sample_context)

        assert resp.generation.source == "local"
        assert resp.generation.fallbackUsed is True
        assert "Deploy Staging" in resp.answer


@pytest.mark.asyncio
async def test_response_mode_local_never_calls_gemini(sample_context, monkeypatch):
    """Test 9: AI_RESPONSE_MODE=local executes local deterministic engine directly."""
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "local")

    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        resp = await agent.ask_agent("Which tasks are overdue?", sample_context)

        assert mock_gemini.await_count == 0
        assert resp.generation.source == "local"
        assert resp.generation.fallbackUsed is False
        assert resp.generation.model is None
        assert "Deploy Staging" in resp.answer


@pytest.mark.asyncio
async def test_response_mode_llm_raises_502_on_failure(sample_context, monkeypatch):
    """Test 10: AI_RESPONSE_MODE=llm raises HTTP 502 Bad Gateway and does not fallback."""
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "llm")

    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.side_effect = RuntimeError("Provider 503 Service Unavailable")
        
        with pytest.raises(HTTPException) as exc_info:
            await agent.ask_agent("Which tasks are overdue?", sample_context)

        assert exc_info.value.status_code == 502
        assert "LLM Provider Error" in exc_info.value.detail


@pytest.mark.asyncio
async def test_numerical_statistics_identical_between_modes(sample_context, monkeypatch):
    """Test 11: Authoritative structured statistics match identically between modes."""
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "local")
    resp_local = await agent.ask_agent("Which tasks are overdue?", sample_context)

    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "auto")
    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.return_value = ("Gemini formatted answer", "gemini-2.5-flash")
        resp_llm = await agent.ask_agent("Which tasks are overdue?", sample_context)

    # Identical authoritative statistics
    assert resp_local.structuredData == resp_llm.structuredData
    assert resp_local.recordsAnalyzed == resp_llm.recordsAnalyzed
    assert resp_local.responseType == resp_llm.responseType


@pytest.mark.asyncio
async def test_fallback_metadata_accuracy(sample_context, monkeypatch):
    """Test 12: Generation metadata contract fields are accurate across all branches."""
    # 1. Guardrail
    guard_resp = await agent.ask_agent("What is the admin password?", sample_context)
    assert guard_resp.generation.source == "guardrail"
    assert guard_resp.generation.fallbackUsed is False
    assert guard_resp.generation.model is None

    # 2. Local mode
    monkeypatch.setattr(settings, "MOCK_LLM", False)
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "local")
    local_resp = await agent.ask_agent("Which tasks are overdue?", sample_context)
    assert local_resp.generation.source == "local"
    assert local_resp.generation.fallbackUsed is False
    assert local_resp.generation.model is None

    # 3. Fallback
    monkeypatch.setattr(settings, "AI_RESPONSE_MODE", "auto")
    with patch.object(agent, "call_gemini", new_callable=AsyncMock) as mock_gemini:
        mock_gemini.side_effect = ConnectionError("Network down")
        fb_resp = await agent.ask_agent("Which tasks are overdue?", sample_context)
        assert fb_resp.generation.source == "local"
        assert fb_resp.generation.fallbackUsed is True
        assert fb_resp.generation.failureReason == "ConnectionError"

