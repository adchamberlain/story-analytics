"""Folders API: create, list, get, update, delete folders for chart organization."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import folder_storage
from ..services.chart_storage import list_charts

router = APIRouter(prefix="/folders", tags=["folders"])


class CreateFolderRequest(BaseModel):
    name: str
    parent_id: str | None = None


class UpdateFolderRequest(BaseModel):
    name: str | None = None
    parent_id: str | None = None


class FolderResponse(BaseModel):
    id: str
    name: str
    parent_id: str | None
    created_at: str
    updated_at: str


class FolderChartResponse(BaseModel):
    id: str
    title: str
    chart_type: str
    updated_at: str
    folder_id: str | None = None


@router.post("/", response_model=FolderResponse)
async def create_folder(request: CreateFolderRequest):
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty")

    folder = folder_storage.save_folder(name, request.parent_id)
    return FolderResponse(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


@router.get("/", response_model=list[FolderResponse])
async def get_folders():
    folders = folder_storage.list_folders()
    return [
        FolderResponse(
            id=f.id,
            name=f.name,
            parent_id=f.parent_id,
            created_at=f.created_at,
            updated_at=f.updated_at,
        )
        for f in folders
    ]


@router.get("/{folder_id}", response_model=FolderResponse)
async def get_folder(folder_id: str):
    folder = folder_storage.load_folder(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return FolderResponse(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


@router.put("/{folder_id}", response_model=FolderResponse)
async def update_folder(folder_id: str, request: UpdateFolderRequest):
    fields = {}
    if request.name is not None:
        fields["name"] = request.name.strip()
    if request.parent_id is not None:
        fields["parent_id"] = request.parent_id

    folder = folder_storage.update_folder(folder_id, **fields)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return FolderResponse(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
    )


@router.delete("/{folder_id}")
async def delete_folder(folder_id: str):
    if not folder_storage.delete_folder(folder_id):
        raise HTTPException(status_code=404, detail="Folder not found")
    return {"deleted": True}


@router.get("/{folder_id}/charts", response_model=list[FolderChartResponse])
async def get_folder_charts(folder_id: str):
    """List all charts assigned to this folder."""
    folder = folder_storage.load_folder(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    charts = list_charts()
    folder_charts = [
        FolderChartResponse(
            id=c.id,
            title=c.title,
            chart_type=c.chart_type,
            updated_at=c.updated_at,
            folder_id=c.folder_id,
        )
        for c in charts
        if c.folder_id == folder_id
    ]
    return folder_charts
