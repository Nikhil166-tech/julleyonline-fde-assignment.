import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    AI_SERVICE_TOKEN: str = "dev-ai-service-token-secret"
    GEMINI_API_KEY: Optional[str] = None
    AI_MODEL: str = "gemini-3.5-flash"
    FALLBACK_MODEL: str = "gemini-3.8-flash"
    OLLAMA_API_KEY: Optional[str] = None
    OLLAMA_BASE_URL: str = "https://ollama.com/api"
    OLLAMA_MODEL: str = "gemma4:31b"
    AI_RESPONSE_MODE: str = "auto"  # 'auto', 'local', 'llm'
    MOCK_LLM: bool = False
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    AI_MAX_CONTEXT_TASKS: int = 100
    AI_MAX_ACTIVITY_RECORDS: int = 30

    @property
    def effective_response_mode(self) -> str:
        """
        Resolves effective mode with backward compatibility.
        Precedence:
        1. If MOCK_LLM is True, force 'local'
        2. Otherwise use AI_RESPONSE_MODE ('auto', 'local', 'llm')
        """
        if self.MOCK_LLM:
            return "local"
        mode = (self.AI_RESPONSE_MODE or "auto").strip().lower()
        if mode in ["auto", "local", "llm"]:
            return mode
        return "auto"

settings = Settings()
