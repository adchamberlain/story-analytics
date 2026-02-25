"""API key management endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth_simple import get_current_user
from ..services.api_key_service import generate_api_key
from ..services.metadata_db import (
    create_api_key as db_create_api_key,
    list_api_keys,
    delete_api_key as db_delete_api_key,
)

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


class CreateKeyRequest(BaseModel):
    name: str = Field(..., examples=["My Script Key"], description="Human-readable name for the API key")
    scopes: str = Field("read", examples=["read", "read,write"], description="Comma-separated scopes")


class CreateKeyResponse(BaseModel):
    id: str
    name: str
    key: str = Field(..., description="Full API key (shown only once)")
    key_prefix: str
    scopes: str
    created_at: str


class ApiKeyListItem(BaseModel):
    id: str
    name: str
    key_prefix: str
    scopes: str
    last_used_at: str | None
    created_at: str
    expires_at: str | None


@router.post("/", response_model=CreateKeyResponse)
async def create_key(request: CreateKeyRequest, user: dict = Depends(get_current_user)):
    """Create a new API key. The full key is returned only once -- store it securely."""
    full_key, key_hash, key_prefix = generate_api_key()
    record = db_create_api_key(
        user_id=user["id"],
        name=request.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        scopes=request.scopes,
    )
    return CreateKeyResponse(
        id=record["id"],
        name=record["name"],
        key=full_key,
        key_prefix=key_prefix,
        scopes=record["scopes"],
        created_at=record["created_at"],
    )


@router.get("/", response_model=list[ApiKeyListItem])
async def list_keys(user: dict = Depends(get_current_user)):
    """List all API keys for the current user (prefix only, no secrets)."""
    return list_api_keys(user["id"])


@router.delete("/{key_id}")
async def revoke_key(key_id: str, user: dict = Depends(get_current_user)):
    """Revoke (delete) an API key."""
    deleted = db_delete_api_key(key_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"status": "deleted"}
