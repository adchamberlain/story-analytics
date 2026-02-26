"""AI-assisted SQL generation router."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth_simple import get_current_user
from ..services.settings_storage import load_settings
from engine.llm.base import Message
from engine.llm.claude import get_provider

router = APIRouter(prefix="/ai", tags=["ai"])


class AiSqlRequest(BaseModel):
    messages: list[dict]  # [{role: "user"|"assistant", content: str}]
    dialect: str  # "snowflake" | "postgres" | "bigquery"
    schema_context: str  # Formatted schema info
    current_sql: str | None = None
    error_message: str | None = None


SYSTEM_PROMPT = """You are a SQL expert assistant. Generate SQL queries based on user requests.

Database dialect: {dialect}

Available schema:
{schema_context}

{current_sql_section}
{error_section}

Rules:
- Generate only valid {dialect} SQL
- Use the exact table and column names from the schema
- Always include appropriate LIMIT clauses for safety
- When showing SQL, wrap it in ```sql code blocks
- Explain your query briefly
- If the user says "fix" or asks about an error, analyze the error message and current SQL to provide a corrected query
"""

# Map settings provider names -> get_provider() convention
_PROVIDER_NAME_MAP = {
    "anthropic": "claude",
    "openai": "openai",
    "google": "gemini",
}


@router.post("/sql")
async def generate_sql(
    request: AiSqlRequest,
    user: dict = Depends(get_current_user),
):
    """Generate SQL using the configured AI provider."""
    settings = load_settings()

    if not settings.ai_provider:
        raise HTTPException(
            status_code=400,
            detail="No AI provider configured. Set one in Settings.",
        )

    key_map = {
        "anthropic": settings.anthropic_api_key,
        "openai": settings.openai_api_key,
        "google": settings.google_api_key,
    }
    api_key = key_map.get(settings.ai_provider)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"No API key configured for {settings.ai_provider}.",
        )

    # Build optional system prompt sections
    current_sql_section = ""
    if request.current_sql:
        current_sql_section = (
            f"Current SQL in editor:\n```sql\n{request.current_sql}\n```"
        )

    error_section = ""
    if request.error_message:
        error_section = f"Last query error:\n```\n{request.error_message}\n```"

    system = SYSTEM_PROMPT.format(
        dialect=request.dialect,
        schema_context=request.schema_context,
        current_sql_section=current_sql_section,
        error_section=error_section,
    )

    # Convert raw dicts to Message objects expected by the LLM provider
    messages = [
        Message(role=m["role"], content=m["content"]) for m in request.messages
    ]

    provider_name = _PROVIDER_NAME_MAP.get(
        settings.ai_provider, settings.ai_provider
    )
    provider = get_provider(provider_name)

    try:
        response = provider.generate(
            messages=messages,
            system_prompt=system,
        )
        return {"content": response.content}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI generation failed: {e}",
        )
