import uvicorn
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from schemas import ChatRequest, ChatResponse
from config import settings
from agent import ask_agent

app = FastAPI(
    title="JulleyOnline AI Kanban Assistant Microservice",
    version="1.0.0",
    description="Read-only, tenant-isolated AI question answering microservice for JulleyOnline."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    return {
        "status": "healthy",
        "service": "julleyonline-ai",
        "model": settings.AI_MODEL,
        "llmConfigured": bool(settings.GEMINI_API_KEY and not settings.MOCK_LLM)
    }

@app.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def chat_endpoint(
    payload: ChatRequest,
    x_service_token: str = Header(None, alias="X-Service-Token")
):
    # Verify service token authentication if configured
    if settings.AI_SERVICE_TOKEN:
        if not x_service_token or x_service_token != settings.AI_SERVICE_TOKEN:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized: Invalid or missing X-Service-Token"
            )

    try:
        response = await ask_agent(payload.message, payload.context)
        return response
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent execution failure: {str(exc)}"
        )

if __name__ == "__main__":
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
