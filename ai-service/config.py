import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    AI_SERVICE_TOKEN: str = "dev-ai-service-token-secret"
    GEMINI_API_KEY: Optional[str] = None
    AI_MODEL: str = "gemini-3.5-flash"
    FALLBACK_MODEL: str = "gemini-3.8-flash"
    MOCK_LLM: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    AI_MAX_CONTEXT_TASKS: int = 100
    AI_MAX_ACTIVITY_RECORDS: int = 30

settings = Settings()
