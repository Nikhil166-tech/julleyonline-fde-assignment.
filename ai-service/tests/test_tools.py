import pytest
from datetime import datetime, timedelta
import sys
import os

# Add parent directory to path so tests can import modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from schemas import WorkspaceContext, TaskItem, ColumnItem, BoardItem, ActivityItem, Metrics
import tools

@pytest.fixture
def sample_context():
    now_iso = "2026-11-03T12:00:00Z"
    past_due_iso = "2026-11-01T12:00:00Z"
    future_due_iso = "2026-11-05T12:00:00Z"

    tasks = [
        TaskItem(
            id="task-1",
            boardId="board-1",
            columnId="col-1",
            columnName="Backlog",
            title="Implement OAuth",
            description="Add Google sign-in",
            priority="HIGH",
            dueDate=past_due_iso, # Overdue
            position=0,
            assigneeName="Bob",
            createdAt="2026-11-01T00:00:00Z",
            updatedAt="2026-11-01T00:00:00Z"
        ),
        TaskItem(
            id="task-2",
            boardId="board-1",
            columnId="col-2",
            columnName="In Progress",
            title="Write documentation",
            description="Architecture specs",
            priority="URGENT",
            dueDate=future_due_iso,
            position=0,
            assigneeName="Charlie",
            createdAt="2026-11-01T00:00:00Z",
            updatedAt="2026-11-01T00:00:00Z"
        ),
        TaskItem(
            id="task-3",
            boardId="board-1",
            columnId="col-3",
            columnName="Done",
            title="Database Migration",
            description="Prisma initial schema",
            priority="MEDIUM",
            dueDate=past_due_iso, # Past due date, but in Done column!
            position=0,
            assigneeName="Alice",
            createdAt="2026-10-30T00:00:00Z",
            updatedAt="2026-11-01T00:00:00Z"
        )
    ]

    columns = [
        ColumnItem(id="col-1", boardId="board-1", name="Backlog", position=0),
        ColumnItem(id="col-2", boardId="board-1", name="In Progress", position=1),
        ColumnItem(id="col-3", boardId="board-1", name="Done", position=2)
    ]

    activities = [
        ActivityItem(
            id="act-1",
            boardId="board-1",
            taskId="task-1",
            action="TASK_CREATE",
            details={"title": "Implement OAuth"},
            actorName="Bob",
            createdAt="2026-11-01T00:00:00Z"
        ),
        ActivityItem(
            id="act-2",
            boardId="board-1",
            taskId="task-3",
            action="TASK_MOVE",
            details={"from": "In Progress", "to": "Done"},
            actorName="Alice",
            createdAt="2026-11-02T10:00:00Z"
        )
    ]

    metrics = Metrics(
        totalTasks=3,
        sampledTasks=3,
        completedTasks=1,
        pendingTasks=2,
        overdueTasks=1,
        unassignedTasks=0,
        byColumn={"Backlog": 1, "In Progress": 1, "Done": 1},
        byPriority={"HIGH": 1, "URGENT": 1, "MEDIUM": 1, "LOW": 0}
    )

    return WorkspaceContext(
        tenantId="tenant-1",
        tenantName="Engineering",
        boardId="board-1",
        boardName="Sprint Board",
        currentTime=now_iso,
        isTruncated=False,
        metrics=metrics,
        boards=[BoardItem(id="board-1", name="Sprint Board")],
        columns=columns,
        tasks=tasks,
        activities=activities
    )

def test_get_tasks_filters(sample_context):
    # Test all tasks
    all_res = tools.get_tasks(sample_context)
    assert all_res["total_matched"] == 3

    # Filter by priority
    urgent_res = tools.get_tasks(sample_context, priority="URGENT")
    assert urgent_res["total_matched"] == 1
    assert urgent_res["tasks"][0]["title"] == "Write documentation"

    # Filter by assignee
    bob_res = tools.get_tasks(sample_context, assignee_name="Bob")
    assert bob_res["total_matched"] == 1
    assert bob_res["tasks"][0]["id"] == "task-1"

def test_get_overdue_tasks_distinguishes_completed(sample_context):
    res = tools.get_overdue_tasks(sample_context)
    # task-1 is in Backlog and past due -> overdue
    # task-3 is in Done and past due -> completed_past_due (not active overdue)
    assert res["overdue_count"] == 1
    assert res["completed_past_due_count"] == 1
    assert res["tasks"][0]["id"] == "task-1"
    assert res["tasks"][0]["daysPastDue"] >= 1

def test_get_activity_logs(sample_context):
    res = tools.get_activity_logs(sample_context, limit=1)
    assert res["returned_records"] == 1
    assert res["activities"][0]["actor"] == "Bob"

def test_get_board_summary(sample_context):
    res = tools.get_board_summary(sample_context)
    assert res["total_tasks"] == 3
    assert res["pending_tasks"] == 2
    assert res["completed_tasks"] == 1
    assert res["overdue_tasks"] == 1
    assert res["completion_percentage"] == 33.3
    assert res["by_column"]["Backlog"] == 1
    assert res["by_priority"]["URGENT"] == 1
