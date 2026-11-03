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
