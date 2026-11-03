import json
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple, Optional
from schemas import WorkspaceContext, ChatResponse
from config import settings
import tools

SYSTEM_INSTRUCTION = """You are the JulleyOnline AI Kanban Assistant.
You are a read-only, factual assistant operating within an enterprise multi-tenant Kanban system.

STRICT ENTERPRISE GUIDELINES:
1. Answer the user's question directly and professionally. Provide a useful conclusion first.
2. Rely strictly on the verified workspace context and tool outputs provided. Never guess or fabricate task counts, dates, names, or percentages.
3. Differentiate verified facts from inferences. If data is missing (e.g. tasks lack due dates), state that clearly without implying deadlines are being monitored.
4. If a task or board belongs to another tenant/organization, do NOT fabricate or speculate. Explain that access is confined to the active tenant workspace.
5. NEVER reveal passwords, credential hashes, JWTs, or secrets. Passwords cannot be retrieved or displayed.
6. Do NOT invent password reset pages, recovery features, or administrative actions that do not exist.
7. Format answers cleanly in Markdown. Do not leak raw asterisks or unformatted code.
8. Keep responses concise, objective, and executive-ready.
"""

def check_intent_guardrails(message: str, context: WorkspaceContext) -> Optional[ChatResponse]:
    """
    Evaluates queries against security, credential, and multi-tenant authorization boundaries.
    Executes BEFORE any tool calling or LLM inference.
    """
    msg = message.strip().lower()

    # Guardrail 1: Credential and Password Protection (Case C)
    password_pattern = r"\b(password|passwords|credential|credentials|secret|secrets|api_key|hash|private_key|token)\b"
    if re.search(password_pattern, msg) and any(verb in msg for verb in ["know", "what is", "get", "show", "give", "tell", "reveal", "find", "can i"]):
        return ChatResponse(
            responseType="security_notice",
            answer="User passwords and authentication credentials are encrypted and protected by strict system access controls. The AI Assistant cannot retrieve, view, or display passwords for any account.\n\nAll user credentials remain securely safeguarded within the JulleyOnline authentication boundary.",
            structuredData={
                "noticeType": "security_notice",
                "title": "Security & Credential Protection",
                "status": "blocked",
                "reason": "Credentials and passwords are not accessible via workspace APIs."
            },
            toolsUsed=[],
            recordsAnalyzed=0,
            dataScope=context.tenantName,
            confidence="high",
            generatedAt=datetime.now(timezone.utc).isoformat()
        )

    # Guardrail 2: Cross-Organization / Out-of-Scope Isolation (Case B)
    scope_pattern = r"\b(other\s+(organization|org|company|orgs)|different\s+(organization|org)|another\s+(organization|org)|outside\s+this\s+org|nexus\s+organization|other\s+organization\s+projects)\b"
    if re.search(scope_pattern, msg) or ("organization" in msg and any(w in msg for w in ["other", "another", "foreign", "different"])):
        return ChatResponse(
            responseType="scope_notice",
            answer=f"You are currently authorized in the **{context.tenantName}** workspace. The AI Assistant operates strictly within your active workspace boundary and cannot query or display projects from other organizations.\n\nTo view boards or projects belonging to another organization, please switch your active workspace using the workspace selector in the top navigation bar (provided your account holds authorized membership).",
            structuredData={
                "noticeType": "scope_notice",
                "title": "Workspace Scope Boundary",
                "status": "restricted",
                "activeWorkspace": context.tenantName,
                "reason": "Cross-organization data access requires switching active workspace context."
            },
            toolsUsed=[],
            recordsAnalyzed=0,
            dataScope=context.tenantName,
            confidence="high",
            generatedAt=datetime.now(timezone.utc).isoformat()
        )

    return None

def detect_tool_intents(message: str) -> List[str]:
    """
    Analyzes user message to determine relevant read-only tools to execute.
    """
    msg = message.lower()
    tools_to_run = []

    if any(k in msg for k in ["overdue", "past due", "late", "deadline passed", "due date"]):
        tools_to_run.append("get_overdue_tasks")

    if any(k in msg for k in ["activit", "recent change", "history", "who did what", "audit", "today", "log"]):
        tools_to_run.append("get_activity_logs")

    if any(k in msg for k in ["progress", "summary", "statistic", "overview", "metric", "breakdown", "status of board", "how is"]):
        tools_to_run.append("get_board_summary")

    if any(k in msg for k in ["pending", "in progress", "backlog", "todo", "to do", "urgent", "priority", "task", "assigned", "work completed", "done", "show tasks"]):
        if "get_tasks" not in tools_to_run:
            tools_to_run.append("get_tasks")

    if not tools_to_run:
        # Default to board summary and task list for general inquiries
        tools_to_run = ["get_board_summary", "get_tasks"]

    return tools_to_run

def execute_tools(context: WorkspaceContext, tool_names: List[str]) -> Dict[str, Any]:
    """
    Executes specified allowlisted read-only tools.
    """
    results = {}
    board_id = context.boardId

    for name in tool_names:
        if name == "get_tasks":
            results["tasks"] = tools.get_tasks(context, board_id=board_id)
        elif name == "get_overdue_tasks":
            results["overdue"] = tools.get_overdue_tasks(context, board_id=board_id)
        elif name == "get_activity_logs":
            results["activities"] = tools.get_activity_logs(context, limit=20)
        elif name == "get_board_summary":
            results["summary"] = tools.get_board_summary(context, board_id=board_id)

    return results

def resolve_response_type(message: str, tool_names: List[str]) -> str:
    """
    Resolves an explicit response category for frontend widget presentation.
    """
    msg = message.lower()
    if "get_overdue_tasks" in tool_names or any(w in msg for w in ["overdue", "past due", "late"]):
        return "overdue_summary"
    if "get_activity_logs" in tool_names or any(w in msg for w in ["activit", "audit", "history", "recent"]):
        return "activity_summary"
    if "get_board_summary" in tool_names or any(w in msg for w in ["progress", "overview", "metric", "breakdown", "summary"]):
        return "board_summary"
    if "get_tasks" in tool_names or any(w in msg for w in ["task", "pending", "urgent", "priority"]):
        return "task_list"
    return "general_answer"

def synthesize_deterministic_response(
    message: str,
    context: WorkspaceContext,
    tool_names: List[str],
    tool_results: Dict[str, Any],
    response_type: str
) -> Tuple[str, Dict[str, Any], int]:
    """
    Constructs deterministic, grounded responses and structured data payloads.
    Guarantees consistent, testable enterprise answers for offline mode and tests.
    """
    msg = message.lower()
    workspace_name = context.tenantName
    board_name = context.boardName or "Entire Workspace"

    # 1. Overdue Summary (Case A & Case D)
    if response_type == "overdue_summary":
        overdue_data = tool_results.get("overdue") or tools.get_overdue_tasks(context, context.boardId)
        tasks = overdue_data.get("tasks", [])
        total_in_scope = overdue_data.get("total_tasks_in_scope", len(context.tasks))
        with_due_dates = overdue_data.get("tasks_with_due_dates", 0)
        without_due_dates = overdue_data.get("tasks_without_due_dates", max(0, total_in_scope - with_due_dates))

        structured_data = {
            "tasksAnalyzed": total_in_scope,
            "overdueCount": len(tasks),
            "tasksWithDueDates": with_due_dates,
            "tasksWithoutDueDates": without_due_dates,
            "tasks": tasks,
            "hasDueDates": with_due_dates > 0
        }

        # Case A: No tasks have due dates configured
        if with_due_dates == 0:
            answer = (
                f"Analyzed **{total_in_scope} task(s)** across **{board_name}**. None of these tasks have due dates configured. "
                f"As a result, **0 tasks are classified as overdue**.\n\n"
                f"*Note: Deadlines must be assigned to tasks before overdue tracking can take effect.*"
            )
            return answer, structured_data, total_in_scope

        # Case D: Tasks with due dates exist
        if not tasks:
            answer = (
                f"Analyzed **{total_in_scope} task(s)** in **{board_name}** ({with_due_dates} with due dates). "
                f"There are currently **0 overdue tasks**. All scheduled cards are on track or completed."
            )
            return answer, structured_data, total_in_scope

        lines = [
            f"Found **{len(tasks)} overdue task(s)** in **{board_name}** ({total_in_scope} total tasks analyzed, {with_due_dates} with due dates):\n"
        ]
        for t in tasks:
            lines.append(
                f"- **{t['title']}** — Priority: `{t['priority']}` | Column: `{t['column']}` | Assignee: `{t['assignee']}` | Overdue by: **{t['daysPastDue']} day(s)** (Due: {t['dueDate']})"
            )
        lines.append("\n*Recommendation: Address urgent and high-priority overdue cards first to keep the sprint on schedule.*")
        return "\n".join(lines), structured_data, total_in_scope

    # 2. Activity Summary
    if response_type == "activity_summary":
        act_data = tool_results.get("activities") or tools.get_activity_logs(context, 20)
        acts = act_data.get("activities", [])
        structured_data = {
            "returnedRecords": len(acts),
            "activities": acts
        }

        if not acts:
            answer = f"No recent activity records have been logged in **{workspace_name}**."
            return answer, structured_data, 0

        lines = [f"Showing the **{len(acts[:10])} most recent action(s)** in **{workspace_name}**:\n"]
        for a in acts[:10]:
            action_desc = a['action'].replace('_', ' ').capitalize()
            lines.append(f"- **{a['actor']}** performed `{action_desc}` at *{a['timestamp']}*")
        return "\n".join(lines), structured_data, len(acts)

    # 3. Board Summary
    if response_type == "board_summary":
        summary = tool_results.get("summary") or tools.get_board_summary(context, context.boardId)
        total = summary.get("total_tasks", len(context.tasks))
        comp = summary.get("completed_tasks", 0)
        pending = summary.get("pending_tasks", 0)
        pct = summary.get("completion_percentage", 0.0)

        structured_data = summary

        lines = [
            f"**Workspace:** {workspace_name} | **Board:** {board_name}\n",
            f"- **Total Tasks:** {total}",
            f"- **Completed:** {comp} ({pct}%)",
            f"- **Pending:** {pending}",
            f"- **Overdue:** {summary.get('overdue_tasks', 0)}",
            f"- **Unassigned:** {summary.get('unassigned_tasks', 0)}\n",
            "**Column Distribution:**"
        ]
        for col, count in summary.get("by_column", {}).items():
            lines.append(f"- `{col}`: **{count}** card(s)")

        lines.append("\n**Priority Distribution:**")
        for prio, count in summary.get("by_priority", {}).items():
            lines.append(f"- `{prio}`: **{count}** task(s)")

        return "\n".join(lines), structured_data, total

    # 4. Task List (Urgent, Pending, Completed, General)
    if response_type == "task_list":
        if "completed" in msg or "work completed" in msg:
            filtered = [t for t in context.tasks if tools.is_completed_column(t.columnName)]
            title_prefix = "Completed Work"
        elif "urgent" in msg or "priority" in msg:
            filtered = [t for t in context.tasks if t.priority in ["URGENT", "HIGH"] and not tools.is_completed_column(t.columnName)]
            title_prefix = "Urgent & High-Priority Tasks"
        else:
            filtered = [t for t in context.tasks if not tools.is_completed_column(t.columnName)]
            title_prefix = "Pending Tasks"

        structured_tasks = [
            {
                "id": t.id,
                "title": t.title,
                "priority": t.priority,
                "column": t.columnName,
                "assignee": t.assigneeName or "Unassigned",
                "dueDate": t.dueDate
            }
            for t in filtered[:15]
        ]

        structured_data = {
            "totalTasks": len(filtered),
            "tasks": structured_tasks,
            "filterType": title_prefix
        }

        if not filtered:
            answer = f"There are currently 0 tasks matching **{title_prefix}** in **{workspace_name}**."
            return answer, structured_data, 0

        lines = [f"Found **{len(filtered)} {title_prefix.lower()}** in **{board_name}**:\n"]
        for t in structured_tasks:
            due_str = f" | Due: {t['dueDate']}" if t['dueDate'] else ""
            lines.append(f"- **[{t['priority']}] {t['title']}** — Column: `{t['column']}` | Assignee: `{t['assignee']}`{due_str}")

        if len(filtered) > 15:
            lines.append(f"\n*...and {len(filtered) - 15} additional task(s).*")

        return "\n".join(lines), structured_data, len(filtered)

    # 5. General Answer Fallback
    summary = tool_results.get("summary") or tools.get_board_summary(context, context.boardId)
    total = summary.get("total_tasks", len(context.tasks))
    answer = f"The active workspace **{workspace_name}** contains **{total} task(s)** across **{len(context.columns)} column(s)**."
    return answer, summary, total

async def ask_agent(message: str, context: WorkspaceContext) -> ChatResponse:
    """
    Main entry point for AI question answering.
    1. Checks intent guardrails (Security & Cross-Org isolation).
    2. Identifies & executes allowlisted read-only tools.
    3. Resolves responseType and builds structured enterprise output.
    """
    # 1. Guardrails Check (Fast deterministic pre-filter)
    guardrail_response = check_intent_guardrails(message, context)
    if guardrail_response:
        return guardrail_response

    # 2. Tool Execution
    tool_names = detect_tool_intents(message)
    tool_results = execute_tools(context, tool_names)
    response_type = resolve_response_type(message, tool_names)

    # Compute baseline structured data & records analyzed
    base_answer, structured_data, records_analyzed = synthesize_deterministic_response(
        message, context, tool_names, tool_results, response_type
    )

    # 3. Live Google Gemini Invocation (if configured and not in mock mode)
    if settings.GEMINI_API_KEY and not settings.MOCK_LLM:
        try:
            from google import genai
            client = genai.Client(api_key=settings.GEMINI_API_KEY)

            prompt = f"""User Question: {message}

Active Workspace: {context.tenantName}
Selected Board: {context.boardName or 'All Workspace Boards'}
Server Timestamp: {context.currentTime}
Response Category: {response_type}

Verified Tool Results:
{json.dumps(tool_results, indent=2)}

Please answer the user question directly, concisely, and professionally in clean Markdown based STRICTLY on the tool results above."""

            models_to_try = [settings.AI_MODEL]
            if settings.FALLBACK_MODEL and settings.FALLBACK_MODEL not in models_to_try:
                models_to_try.append(settings.FALLBACK_MODEL)

            last_error = None
            for candidate_model in models_to_try:
                try:
                    response = client.models.generate_content(
                        model=candidate_model,
                        contents=prompt,
                        config={
                            "system_instruction": SYSTEM_INSTRUCTION,
                            "temperature": 0.2,
                        }
                    )

                    if response and response.text:
                        return ChatResponse(
                            responseType=response_type,
                            answer=response.text.strip(),
                            structuredData=structured_data,
                            toolsUsed=tool_names,
                            recordsAnalyzed=records_analyzed,
                            dataScope=context.tenantName,
                            confidence="high",
                            generatedAt=datetime.now(timezone.utc).isoformat()
                        )
                except Exception as model_err:
                    last_error = model_err
                    print(f"[AI Agent] Model '{candidate_model}' invocation failed: {model_err}. Trying fallback...")

            if last_error:
                print(f"[AI Agent] All candidate models failed ({last_error}), falling back to deterministic engine.")
        except Exception as err:
            print(f"[AI Agent] Gemini call failed, falling back to deterministic engine: {err}")

    # 4. Deterministic Grounded Engine (Used for tests, offline mode, and API fallback)
    return ChatResponse(
        responseType=response_type,
        answer=base_answer,
        structuredData=structured_data,
        toolsUsed=tool_names,
        recordsAnalyzed=records_analyzed,
        dataScope=context.tenantName,
        confidence="high",
        generatedAt=datetime.now(timezone.utc).isoformat()
    )
