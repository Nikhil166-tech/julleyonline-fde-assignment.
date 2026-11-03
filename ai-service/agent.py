import json
import re
import logging
import asyncio
import httpx
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple, Optional
from fastapi import HTTPException, status
from schemas import WorkspaceContext, ChatResponse, GenerationMeta
from config import settings
import tools

logger = logging.getLogger("ai_assistant")

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
            generatedAt=datetime.now(timezone.utc).isoformat(),
            generation=GenerationMeta(source="guardrail", model=None, fallbackUsed=False)
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
            generatedAt=datetime.now(timezone.utc).isoformat(),
            generation=GenerationMeta(source="guardrail", model=None, fallbackUsed=False)
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

    if any(k in msg for k in ["progress", "summary", "statistic", "overview", "metric", "breakdown", "status of board", "how is", "summarize my workspace"]):
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
    Serves as the reusable local response engine and automatic fallback.
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

async def call_gemini(
    message: str,
    context: WorkspaceContext,
    tool_results: Dict[str, Any],
    response_type: str
) -> Tuple[str, str]:
    """
    Attempts Gemini LLM generation with a bounded retry policy.
    Returns (answer_text, model_name).
    Raises Exception on failure.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("Missing GEMINI_API_KEY: Provider is not configured")

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
            # Enforce 3.5s timeout per candidate model using asyncio.to_thread
            def _generate():
                return client.models.generate_content(
                    model=candidate_model,
                    contents=prompt,
                    config={
                        "system_instruction": SYSTEM_INSTRUCTION,
                        "temperature": 0.2,
                    }
                )

            response = await asyncio.wait_for(asyncio.to_thread(_generate), timeout=3.5)

            if response and response.text and response.text.strip():
                return response.text.strip(), candidate_model
            else:
                raise ValueError(f"Empty or malformed model output received from '{candidate_model}'")
        except Exception as model_err:
            last_error = model_err
            err_str = str(model_err).lower()
            # Fast-fail non-retryable errors
            if any(k in err_str for k in ["api_key_invalid", "permission", "invalid argument", "not found"]):
                break
            continue

    raise last_error or RuntimeError("All candidate Gemini models failed to generate a response")

async def call_ollama(
    message: str,
    context: WorkspaceContext,
    tool_results: Dict[str, Any],
    response_type: str
) -> Tuple[str, str]:
    """
    Tier 2 LLM generator: Ollama Cloud API (e.g. gemma4:31b).
    Invoked automatically when Google Gemini is overloaded, rate-limited, or unavailable.
    """
    if not settings.OLLAMA_API_KEY:
        raise ValueError("OLLAMA_API_KEY is not configured")

    prompt = f"""User Question: {message}

Workspace Scope: {context.tenantName}
Active Board: {context.boardName or 'Entire Workspace'}
Server Timestamp: {context.currentTime}
Response Category: {response_type}

Verified Tool Results:
{json.dumps(tool_results, indent=2)}

Please answer the user question directly, concisely, and professionally in clean Markdown based STRICTLY on the tool results above."""

    url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/chat"
    headers = {
        "Authorization": f"Bearer {settings.OLLAMA_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": settings.OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            {"role": "user", "content": prompt}
        ],
        "stream": False
    }

    async with httpx.AsyncClient(timeout=5.0) as http_client:
        resp = await http_client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"Ollama API returned HTTP {resp.status_code}: {resp.text}")
        data = resp.json()
        content = data.get("message", {}).get("content", "").strip()
        if not content:
            raise ValueError(f"Empty content from Ollama model {settings.OLLAMA_MODEL}")
        return content, settings.OLLAMA_MODEL

async def ask_agent(message: str, context: WorkspaceContext) -> ChatResponse:
    """
    Main entry point for AI question answering.
    1. Checks intent guardrails (Security & Cross-Org isolation).
    2. Executes allowlisted read-only tools on authorized context.
    3. Resolves responseType and builds authoritative local baseline.
    4. Routes execution based on AI_RESPONSE_MODE:
       - 'auto': Attempt Gemini (Tier 1) -> Ollama (Tier 2) -> Local Engine (Tier 3).
       - 'local': Use deterministic local engine directly without external calls.
       - 'llm': Attempt Gemini, then Ollama; fail with 502 if both fail.
    """
    # 1. Guardrails Check (Fast deterministic pre-filter)
    guardrail_response = check_intent_guardrails(message, context)
    if guardrail_response:
        return guardrail_response

    # 2. Tool Execution
    tool_names = detect_tool_intents(message)
    tool_results = execute_tools(context, tool_names)
    response_type = resolve_response_type(message, tool_names)

    # 3. Compute authoritative deterministic baseline
    base_answer, structured_data, records_analyzed = synthesize_deterministic_response(
        message, context, tool_names, tool_results, response_type
    )

    mode = settings.effective_response_mode

    # 4A. Local Mode: Deterministic local response engine directly
    if mode == "local":
        return ChatResponse(
            responseType=response_type,
            answer=base_answer,
            structuredData=structured_data,
            toolsUsed=tool_names,
            recordsAnalyzed=records_analyzed,
            dataScope=context.tenantName,
            confidence="high",
            generatedAt=datetime.now(timezone.utc).isoformat(),
            generation=GenerationMeta(source="local", model=None, fallbackUsed=False)
        )

    # 4B. LLM-Only Mode: Must succeed via Gemini or Ollama, or fail with clear service error
    if mode == "llm":
        try:
            llm_text, model_used = await call_gemini(message, context, tool_results, response_type)
            return ChatResponse(
                responseType=response_type,
                answer=llm_text,
                structuredData=structured_data,
                toolsUsed=tool_names,
                recordsAnalyzed=records_analyzed,
                dataScope=context.tenantName,
                confidence="high",
                generatedAt=datetime.now(timezone.utc).isoformat(),
                generation=GenerationMeta(source="llm", model=model_used, fallbackUsed=False)
            )
        except Exception as gemini_err:
            logger.warning(f"[AI Agent] LLM mode: Gemini failed ({gemini_err}). Trying Ollama...")
            try:
                ollama_text, ollama_model = await call_ollama(message, context, tool_results, response_type)
                return ChatResponse(
                    responseType=response_type,
                    answer=ollama_text,
                    structuredData=structured_data,
                    toolsUsed=tool_names,
                    recordsAnalyzed=records_analyzed,
                    dataScope=context.tenantName,
                    confidence="high",
                    generatedAt=datetime.now(timezone.utc).isoformat(),
                    generation=GenerationMeta(source="llm", model=f"{ollama_model} (ollama)", fallbackUsed=False)
                )
            except Exception as ollama_err:
                logger.error(f"[AI Agent] LLM-only mode failed on both providers: {ollama_err}")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"LLM Provider Error: Gemini ({str(gemini_err)}) and Ollama ({str(ollama_err)}) both failed."
                )

    # 4C. Auto Mode (Default): Tier 1 (Gemini) -> Tier 2 (Ollama Cloud) -> Tier 3 (Local Deterministic Engine)
    gemini_err_name = "None"
    ollama_err_name = "None"

    # Tier 1: Attempt Gemini
    try:
        llm_text, model_used = await call_gemini(message, context, tool_results, response_type)
        return ChatResponse(
            responseType=response_type,
            answer=llm_text,
            structuredData=structured_data,
            toolsUsed=tool_names,
            recordsAnalyzed=records_analyzed,
            dataScope=context.tenantName,
            confidence="high",
            generatedAt=datetime.now(timezone.utc).isoformat(),
            generation=GenerationMeta(source="llm", model=model_used, fallbackUsed=False)
        )
    except Exception as gemini_err:
        gemini_err_name = type(gemini_err).__name__
        logger.warning(
            f"[AI Agent] Tier 1 (Gemini) failed ({gemini_err_name}: {gemini_err}). Attempting Tier 2 (Ollama Cloud)..."
        )

    # Tier 2: Attempt Ollama Cloud
    try:
        ollama_text, ollama_model = await call_ollama(message, context, tool_results, response_type)
        return ChatResponse(
            responseType=response_type,
            answer=ollama_text,
            structuredData=structured_data,
            toolsUsed=tool_names,
            recordsAnalyzed=records_analyzed,
            dataScope=context.tenantName,
            confidence="high",
            generatedAt=datetime.now(timezone.utc).isoformat(),
            generation=GenerationMeta(source="llm", model=f"{ollama_model} (ollama)", fallbackUsed=False)
        )
    except Exception as ollama_err:
        ollama_err_name = type(ollama_err).__name__
        logger.warning(
            f"[AI Agent] Tier 2 (Ollama) failed ({ollama_err_name}: {ollama_err}). Automatically falling back to Tier 3 (Local Deterministic Engine)."
        )

    # Tier 3: Local Deterministic Engine (Zero Downtime Fallback)
    return ChatResponse(
        responseType=response_type,
        answer=base_answer,
        structuredData=structured_data,
        toolsUsed=tool_names,
        recordsAnalyzed=records_analyzed,
        dataScope=context.tenantName,
        confidence="high",
        generatedAt=datetime.now(timezone.utc).isoformat(),
        generation=GenerationMeta(
            source="local",
            model=None,
            fallbackUsed=True,
            failureReason=f"Gemini: {gemini_err_name}, Ollama: {ollama_err_name}"
        )
    )
