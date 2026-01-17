"""
Conversation router for chat interactions.
"""

import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Add parent directory to path for engine imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ..config import get_settings
from ..database import get_db
from ..dependencies import get_current_user
from ..models.dashboard import Dashboard
from ..models.session import ConversationSession
from ..models.user import User
from ..schemas.conversation import (
    ConversationListResponse,
    ConversationMessage,
    ConversationSessionResponse,
    ConversationSummary,
    MessageRequest,
    MessageResponse,
)

router = APIRouter(prefix="/conversation", tags=["conversation"])
settings = get_settings()


def generate_conversation_title(user_message: str, assistant_response: str, provider_name: str | None = None) -> str:
    """Use LLM to generate a short, descriptive title for the conversation."""
    try:
        from engine.llm.claude import get_provider
        from engine.llm.base import Message

        llm = get_provider(provider_name)

        prompt = f"""Generate a very short title (3-6 words max) for this conversation.
The title should be descriptive and easy to search for later.
Output ONLY the title, nothing else. No quotes, no punctuation at the end.

User: {user_message[:500]}
Assistant: {assistant_response[:500]}

Title:"""

        response = llm.generate(
            messages=[Message(role="user", content=prompt)],
            max_tokens=30,
            temperature=0.3,
        )

        # Clean up the title
        title = response.content.strip().strip('"\'').strip()
        # Limit length
        if len(title) > 60:
            title = title[:57] + "..."
        return title
    except Exception as e:
        # Fallback to simple truncation if LLM fails
        print(f"Failed to generate title: {e}")
        if len(user_message) <= 50:
            return user_message
        return user_message[:47] + "..."


def get_or_create_session(
    db: Session, user: User, session_id: int | None = None
) -> ConversationSession:
    """Get a specific session, the user's most recent session, or create a new one."""
    if session_id:
        # Get specific session (verify ownership)
        session = (
            db.query(ConversationSession)
            .filter(
                ConversationSession.id == session_id,
                ConversationSession.user_id == user.id,
            )
            .first()
        )
        if not session:
            return None  # Will be handled by caller
        return session

    # Get most recent session
    session = (
        db.query(ConversationSession)
        .filter(ConversationSession.user_id == user.id)
        .order_by(ConversationSession.updated_at.desc())
        .first()
    )

    if not session:
        session = ConversationSession(user_id=user.id, messages=[], phase="intent")
        db.add(session)
        db.commit()
        db.refresh(session)

    return session


def restore_manager_state(manager, session: ConversationSession, db: Session = None):
    """Restore ConversationManager state from database session."""
    from pathlib import Path
    from engine.conversation import ConversationPhase
    from engine.llm.base import Message

    # Restore messages
    manager.state.messages = [
        Message(role=m["role"], content=m["content"]) for m in session.messages
    ]

    # Restore phase
    try:
        manager.state.phase = ConversationPhase[session.phase.upper()]
    except KeyError:
        manager.state.phase = ConversationPhase.INTENT

    # Restore other state
    manager.state.intent = session.intent
    manager.state.target_dashboard = session.target_dashboard
    manager.state.original_request = session.original_request

    # Restore created_file and generated_markdown if in refinement phase with a linked dashboard
    if session.dashboard_id and db:
        dashboard = db.query(Dashboard).filter(Dashboard.id == session.dashboard_id).first()
        if dashboard and dashboard.file_path:
            file_path = Path(dashboard.file_path)
            if file_path.exists():
                manager.state.created_file = file_path
                manager.state.generated_markdown = file_path.read_text()
                manager.state.dashboard_title = dashboard.title


def save_manager_state(manager, session: ConversationSession):
    """Save ConversationManager state to database session."""
    session.messages = [
        {"role": m.role, "content": m.content} for m in manager.state.messages
    ]
    session.phase = manager.state.phase.name.lower()
    session.intent = manager.state.intent
    session.target_dashboard = manager.state.target_dashboard
    session.original_request = manager.state.original_request


@router.post("/message", response_model=MessageResponse)
async def send_message(
    request: MessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a message and get a response."""
    session = get_or_create_session(db, current_user, request.session_id)

    if request.session_id and not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    try:
        # Import engine components
        from engine.conversation import ConversationManager

        # Create conversation manager with user's preferred provider and restore state
        manager = ConversationManager(provider_name=current_user.preferred_provider)
        restore_manager_state(manager, session, db)

        # Track if this is the first message
        is_first_message = len(session.messages) == 0

        # Process the message (returns response string, modifies manager.state in place)
        response_text = manager.process_message(request.message)

        # Save updated state back to database
        save_manager_state(manager, session)
        db.commit()

        # Generate title using LLM after first exchange
        if is_first_message and not session.title:
            session.title = generate_conversation_title(request.message, response_text, current_user.preferred_provider)
            db.commit()

        # Check if a dashboard was created
        dashboard_url = None
        dashboard_created = False
        if manager.state.created_file:
            # File is at pages_dir/slug/+page.md, so get the parent directory name
            slug = manager.state.created_file.parent.name
            dashboard_url = f"{settings.evidence_base_url}/{slug}"
            dashboard_created = True

            # Also save to dashboards table
            title = manager.state.dashboard_title or slug
            existing_dashboard = (
                db.query(Dashboard)
                .filter(Dashboard.user_id == current_user.id, Dashboard.slug == slug)
                .first()
            )
            if not existing_dashboard:
                dashboard = Dashboard(
                    user_id=current_user.id,
                    slug=slug,
                    title=title,
                    file_path=str(manager.state.created_file),
                    original_request=manager.state.original_request,  # For scheduled QA
                )
                db.add(dashboard)
                db.commit()
                db.refresh(dashboard)
            else:
                # Update original_request if it wasn't set before
                if not existing_dashboard.original_request and manager.state.original_request:
                    existing_dashboard.original_request = manager.state.original_request
                    db.commit()
                dashboard = existing_dashboard

                # Link conversation to dashboard
                session.dashboard_id = dashboard.id

                # Update conversation title to match dashboard
                session.title = title
                db.commit()

        return MessageResponse(
            response=response_text,
            phase=session.phase,
            session_id=session.id,
            title=session.title,
            dashboard_url=dashboard_url,
            dashboard_created=dashboard_created,
        )

    except ImportError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Engine import error: {str(e)}. Make sure the engine module is available.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing message: {str(e)}",
        )


@router.get("/list", response_model=ConversationListResponse)
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all conversations for the current user."""
    sessions = (
        db.query(ConversationSession)
        .filter(ConversationSession.user_id == current_user.id)
        .order_by(ConversationSession.updated_at.desc())
        .all()
    )

    return ConversationListResponse(
        conversations=[
            ConversationSummary(
                id=s.id,
                title=s.title,
                phase=s.phase,
                message_count=len(s.messages) if s.messages else 0,
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
            for s in sessions
        ]
    )


@router.get("/{session_id}", response_model=ConversationSessionResponse)
async def get_conversation_by_id(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific conversation by ID."""
    session = (
        db.query(ConversationSession)
        .filter(
            ConversationSession.id == session_id,
            ConversationSession.user_id == current_user.id,
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    return ConversationSessionResponse(
        id=session.id,
        title=session.title,
        messages=[ConversationMessage(**m) for m in session.messages],
        phase=session.phase,
        intent=session.intent,
        target_dashboard=session.target_dashboard,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.get("", response_model=ConversationSessionResponse)
async def get_conversation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current (most recent) conversation session."""
    session = get_or_create_session(db, current_user)

    return ConversationSessionResponse(
        id=session.id,
        title=session.title,
        messages=[ConversationMessage(**m) for m in session.messages],
        phase=session.phase,
        intent=session.intent,
        target_dashboard=session.target_dashboard,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.post("/new", response_model=ConversationSessionResponse)
async def new_conversation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start a new conversation session."""
    # Create new session
    session = ConversationSession(user_id=current_user.id, messages=[], phase="intent")
    db.add(session)
    db.commit()
    db.refresh(session)

    return ConversationSessionResponse(
        id=session.id,
        title=session.title,
        messages=[],
        phase=session.phase,
        intent=session.intent,
        target_dashboard=session.target_dashboard,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


class RenameRequest(BaseModel):
    """Request to rename a conversation."""
    title: str


@router.patch("/{session_id}")
async def rename_conversation(
    session_id: int,
    request: RenameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rename a conversation."""
    session = (
        db.query(ConversationSession)
        .filter(
            ConversationSession.id == session_id,
            ConversationSession.user_id == current_user.id,
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    session.title = request.title
    db.commit()

    return {"message": "Conversation renamed", "title": request.title}


@router.delete("/{session_id}")
async def delete_conversation(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a specific conversation."""
    session = (
        db.query(ConversationSession)
        .filter(
            ConversationSession.id == session_id,
            ConversationSession.user_id == current_user.id,
        )
        .first()
    )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    db.delete(session)
    db.commit()

    return {"message": "Conversation deleted"}


@router.delete("")
async def clear_all_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear/delete all conversation sessions."""
    db.query(ConversationSession).filter(
        ConversationSession.user_id == current_user.id
    ).delete()
    db.commit()

    return {"message": "All conversations cleared"}
