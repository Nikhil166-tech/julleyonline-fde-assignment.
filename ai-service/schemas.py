from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class TaskItem(BaseModel):
    id: str
    boardId: str
    columnId: str
    columnName: str
    title: str
    description: Optional[str] = ""
    priority: str
    dueDate: Optional[str] = None
    position: int
    assigneeName: Optional[str] = None
    createdAt: str
    updatedAt: str

class ColumnItem(BaseModel):
    id: str
    boardId: str
    name: str
    position: int

class BoardItem(BaseModel):
    id: str
    name: str

class ActivityItem(BaseModel):
    id: str
    boardId: str
    taskId: Optional[str] = None
    action: str
    details: Optional[Dict[str, Any]] = None
    actorName: str
    createdAt: str

class Metrics(BaseModel):
    totalTasks: int
    sampledTasks: int
    completedTasks: int
    pendingTasks: int
    overdueTasks: int
    unassignedTasks: int
    byColumn: Dict[str, int] = Field(default_factory=dict)
    byPriority: Dict[str, int] = Field(default_factory=dict)

class WorkspaceContext(BaseModel):
    tenantId: str
    tenantName: str
    boardId: Optional[str] = None
    boardName: Optional[str] = None
    currentTime: str
    isTruncated: bool = False
    metrics: Metrics
    boards: List[BoardItem] = Field(default_factory=list)
    columns: List[ColumnItem] = Field(default_factory=list)
    tasks: List[TaskItem] = Field(default_factory=list)
    activities: List[ActivityItem] = Field(default_factory=list)

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    context: WorkspaceContext

class ChatResponse(BaseModel):
    answer: str
    toolsUsed: List[str] = Field(default_factory=list)
    confidence: str = "high"
    generatedAt: str
