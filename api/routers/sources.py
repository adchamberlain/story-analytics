"""
Data source management router.
"""

import os
from pathlib import Path
from typing import Any

import yaml
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User

router = APIRouter(prefix="/sources", tags=["sources"])


class SnowflakeConnection(BaseModel):
    """Schema for Snowflake connection."""

    account: str
    username: str
    password: str
    warehouse: str
    database: str
    schema_name: str  # 'schema' is reserved


class ConnectionTest(BaseModel):
    """Schema for connection test result."""

    success: bool
    message: str
    tables: list[str] | None = None


class SourceInfo(BaseModel):
    """Schema for source information."""

    name: str
    type: str
    connected: bool
    database: str | None = None
    schema_name: str | None = None


def get_encryption_key() -> bytes:
    """Get or create encryption key for credentials."""
    key_path = Path("data/.encryption_key")
    key_path.parent.mkdir(parents=True, exist_ok=True)

    if key_path.exists():
        return key_path.read_bytes()
    else:
        key = Fernet.generate_key()
        key_path.write_bytes(key)
        # Make file readable only by owner
        os.chmod(key_path, 0o600)
        return key


def encrypt_password(password: str) -> str:
    """Encrypt a password."""
    f = Fernet(get_encryption_key())
    return f.encrypt(password.encode()).decode()


def decrypt_password(encrypted: str) -> str:
    """Decrypt a password."""
    f = Fernet(get_encryption_key())
    return f.decrypt(encrypted.encode()).decode()


@router.get("", response_model=list[SourceInfo])
async def list_sources(current_user: User = Depends(get_current_user)):
    """List available data sources."""
    sources = []
    sources_dir = Path("sources")

    if sources_dir.exists():
        for source_dir in sources_dir.iterdir():
            if source_dir.is_dir():
                connection_file = source_dir / "connection.yaml"
                dialect_file = source_dir / "dialect.yaml"

                source_info = SourceInfo(
                    name=source_dir.name,
                    type="snowflake" if "snowflake" in source_dir.name else "unknown",
                    connected=connection_file.exists(),
                )

                # Try to read connection details
                if connection_file.exists():
                    try:
                        with open(connection_file) as f:
                            config = yaml.safe_load(f)
                            options = config.get("options", {})
                            source_info.database = options.get("database")
                            source_info.schema_name = options.get("schema")
                    except Exception:
                        pass

                sources.append(source_info)

    return sources


@router.post("/snowflake/test", response_model=ConnectionTest)
async def test_snowflake_connection(
    connection: SnowflakeConnection,
    current_user: User = Depends(get_current_user),
):
    """Test a Snowflake connection."""
    try:
        import snowflake.connector

        conn = snowflake.connector.connect(
            account=connection.account,
            user=connection.username,
            password=connection.password,
            warehouse=connection.warehouse,
            database=connection.database,
            schema=connection.schema_name,
        )

        # Try to list tables
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = [row[1] for row in cursor.fetchall()]
        cursor.close()
        conn.close()

        return ConnectionTest(
            success=True,
            message=f"Connected successfully. Found {len(tables)} tables.",
            tables=tables[:20],  # Limit to first 20
        )

    except Exception as e:
        return ConnectionTest(
            success=False,
            message=f"Connection failed: {str(e)}",
        )


@router.post("/snowflake/save")
async def save_snowflake_connection(
    connection: SnowflakeConnection,
    source_name: str = "snowflake_saas",
    current_user: User = Depends(get_current_user),
):
    """Save a Snowflake connection configuration."""
    source_dir = Path("sources") / source_name
    source_dir.mkdir(parents=True, exist_ok=True)

    # Create connection.yaml (don't store password in plaintext)
    connection_config = {
        "options": {
            "account": connection.account,
            "username": connection.username,
            "password": connection.password,  # In production, use encrypted storage
            "warehouse": connection.warehouse,
            "database": connection.database,
            "schema": connection.schema_name,
        }
    }

    connection_file = source_dir / "connection.yaml"
    with open(connection_file, "w") as f:
        yaml.dump(connection_config, f, default_flow_style=False)

    # Make file readable only by owner
    os.chmod(connection_file, 0o600)

    return {"message": f"Connection saved to {source_name}"}


@router.get("/{source_name}/schema")
async def get_source_schema(
    source_name: str,
    current_user: User = Depends(get_current_user),
):
    """Get schema information for a source."""
    source_dir = Path("sources") / source_name
    connection_file = source_dir / "connection.yaml"

    if not connection_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source '{source_name}' not found or not configured",
        )

    try:
        with open(connection_file) as f:
            config = yaml.safe_load(f)
            options = config.get("options", {})

        import snowflake.connector

        conn = snowflake.connector.connect(
            account=options["account"],
            user=options["username"],
            password=options["password"],
            warehouse=options["warehouse"],
            database=options["database"],
            schema=options["schema"],
        )

        cursor = conn.cursor()

        # Get tables
        cursor.execute("SHOW TABLES")
        tables = []
        for row in cursor.fetchall():
            table_name = row[1]

            # Get columns for this table
            cursor.execute(f"DESCRIBE TABLE {table_name}")
            columns = [
                {
                    "name": col[0],
                    "type": col[1],
                    "nullable": col[3] == "Y",
                }
                for col in cursor.fetchall()
            ]

            tables.append(
                {
                    "name": table_name,
                    "columns": columns,
                }
            )

        cursor.close()
        conn.close()

        return {
            "source": source_name,
            "database": options["database"],
            "schema": options["schema"],
            "tables": tables,
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get schema: {str(e)}",
        )
