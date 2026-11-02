from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from schemas import WorkspaceContext, TaskItem, ActivityItem

def is_completed_column(col_name: str) -> bool:
    return any(term in col_name.lower() for term in ["done", "completed", "shipped", "finished", "closed"])

def get_tasks(
    context: WorkspaceContext,
    board_id: Optional[str] = None,
    column_name: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_name: Optional[str] = None,
    limit: int = 50
) -> Dict[str, Any]:
    """
    Tool 1: get_tasks
    Return authorized tasks matching criteria for the selected board or tenant.
    """
    tasks: List[TaskItem] = context.tasks
    filtered = []

    for t in tasks:
        if board_id and t.boardId != board_id:
            continue
        if column_name and t.columnName.lower() != column_name.lower():
            continue
        if priority and t.priority.upper() != priority.upper():
            continue
        if assignee_name and (not t.assigneeName or assignee_name.lower() not in t.assigneeName.lower()):
            continue
        filtered.append({
            "id": t.id,
            "title": t.title,
            "column": t.columnName,
            "priority": t.priority,
            "dueDate": t.dueDate,
            "assignee": t.assigneeName or "Unassigned",
            "description": t.description
        })
        if len(filtered) >= limit:
            break

    return {
        "tool": "get_tasks",
        "total_matched": len(filtered),
        "total_in_workspace": context.metrics.totalTasks,
        "is_truncated": context.isTruncated,
        "tasks": filtered
    }

def get_overdue_tasks(
    context: WorkspaceContext,
    board_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Tool 2: get_overdue_tasks
    Identify tasks with due dates strictly earlier than the server-provided current time.
    Clearly distinguishes past-due dates from completed status.
    """
    current_time_str = context.currentTime
    try:
        now = datetime.fromisoformat(current_time_str.replace("Z", "+00:00"))
    except Exception:
        now = datetime.now(timezone.utc)

    overdue = []
    completed_past_due = []

    for t in context.tasks:
        if board_id and t.boardId != board_id:
            continue
        if not t.dueDate:
            continue

        try:
            due = datetime.fromisoformat(t.dueDate.replace("Z", "+00:00"))
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            if now.tzinfo is None:
                now = now.replace(tzinfo=timezone.utc)
        except Exception:
            continue

        if due < now:
            task_info = {
                "id": t.id,
                "title": t.title,
                "column": t.columnName,
                "priority": t.priority,
                "dueDate": t.dueDate,
                "assignee": t.assigneeName or "Unassigned",
                "daysPastDue": max(1, (now - due).days)
            }
            if is_completed_column(t.columnName):
                completed_past_due.append(task_info)
            else:
                overdue.append(task_info)

    # Sort by urgency (URGENT -> HIGH -> MEDIUM -> LOW) and most overdue days
    priority_weights = {"URGENT": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
    overdue.sort(key=lambda x: (priority_weights.get(x["priority"], 0), x["daysPastDue"]), reverse=True)

    return {
        "tool": "get_overdue_tasks",
        "reference_time": current_time_str,
        "overdue_count": len(overdue),
        "completed_past_due_count": len(completed_past_due),
        "tasks": overdue
    }

def get_activity_logs(
    context: WorkspaceContext,
    limit: int = 20
) -> Dict[str, Any]:
    """
    Tool 3: get_activity_logs
    Use authorized activity history to describe recent changes.
    Includes actor display name, action, entity details, and timestamp.
    """
    acts = context.activities[:limit]
    formatted = []
    for a in acts:
        formatted.append({
            "id": a.id,
            "actor": a.actorName,
            "action": a.action,
            "details": a.details or {},
            "timestamp": a.createdAt
        })

    return {
        "tool": "get_activity_logs",
        "returned_records": len(formatted),
        "activities": formatted
    }

def get_board_summary(
    context: WorkspaceContext,
    board_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Tool 4: get_board_summary
    Provide accurate board statistics, including task counts grouped by column and priority.
    Computes numerical facts deterministically from authorized data.
    """
    target_board_name = context.boardName
    if not target_board_name and board_id:
        for b in context.boards:
            if b.id == board_id:
                target_board_name = b.name
                break

    # If filtering by specific board not pre-computed by context metrics:
    if board_id and board_id != context.boardId:
        board_tasks = [t for t in context.tasks if t.boardId == board_id]
        by_col: Dict[str, int] = {}
        by_prio: Dict[str, int] = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "URGENT": 0}
        completed = 0
        overdue = 0
        try:
            now = datetime.fromisoformat(context.currentTime.replace("Z", "+00:00"))
        except Exception:
            now = datetime.now(timezone.utc)

        for t in board_tasks:
            by_col[t.columnName] = by_col.get(t.columnName, 0) + 1
            by_prio[t.priority] = by_prio.get(t.priority, 0) + 1
            is_comp = is_completed_column(t.columnName)
            if is_comp:
                completed += 1
            if t.dueDate:
                try:
                    due = datetime.fromisoformat(t.dueDate.replace("Z", "+00:00"))
                    if due < now and not is_comp:
                        overdue += 1
                except Exception:
                    pass

        total = len(board_tasks)
        pending = max(0, total - completed)
        completion_pct = round((completed / total * 100), 1) if total > 0 else 0.0

        return {
            "tool": "get_board_summary",
            "board_id": board_id,
            "board_name": target_board_name or "Selected Board",
            "workspace": context.tenantName,
            "total_tasks": total,
            "pending_tasks": pending,
            "completed_tasks": completed,
            "overdue_tasks": overdue,
            "completion_percentage": completion_pct,
            "by_column": by_col,
            "by_priority": by_prio
        }

    # Otherwise use authoritative deterministic context metrics
    m = context.metrics
    completion_pct = round((m.completedTasks / m.totalTasks * 100), 1) if m.totalTasks > 0 else 0.0

    return {
        "tool": "get_board_summary",
        "board_id": context.boardId,
        "board_name": context.boardName or "All Workspace Boards",
        "workspace": context.tenantName,
        "total_tasks": m.totalTasks,
        "pending_tasks": m.pendingTasks,
        "completed_tasks": m.completedTasks,
        "overdue_tasks": m.overdueTasks,
        "unassigned_tasks": m.unassignedTasks,
        "completion_percentage": completion_pct,
        "by_column": m.byColumn,
        "by_priority": m.byPriority,
        "is_truncated": context.isTruncated
    }
