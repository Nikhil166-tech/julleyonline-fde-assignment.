import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from schemas import WorkspaceContext, TaskItem, ColumnItem, BoardItem, ActivityItem, Metrics
import agent

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
    assert "get_overdue_tasks" in resp.toolsUsed
    assert "Deploy Staging" in resp.answer
    assert "URGENT" in resp.answer

@pytest.mark.asyncio
async def test_agent_answers_activities(sample_context):
    resp = await agent.ask_agent("Summarize today's activities", sample_context)
    assert "get_activity_logs" in resp.toolsUsed
    assert "Bob" in resp.answer

@pytest.mark.asyncio
async def test_agent_answers_pending_tasks(sample_context):
    resp = await agent.ask_agent("Show tasks that are still pending", sample_context)
    assert "Deploy Staging" in resp.answer
    assert "In Progress" in resp.answer

@pytest.mark.asyncio
async def test_agent_answers_urgent_tasks(sample_context):
    resp = await agent.ask_agent("What are the most urgent tasks?", sample_context)
    assert "Deploy Staging" in resp.answer
    assert "URGENT" in resp.answer

@pytest.mark.asyncio
async def test_agent_answers_board_summary(sample_context):
    resp = await agent.ask_agent("Summarize a selected board's progress", sample_context)
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

    resp = await agent.ask_agent("Which tasks are overdue?", empty_context)
    assert "No overdue tasks were found" in resp.answer
