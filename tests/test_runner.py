"""
Test Runner with Infrastructure Checks

Provides utilities for:
1. Server health checks (waits for Evidence server to be ready)
2. Running tests with proper setup/teardown
3. Categorized test runs (smoke, component, full)
"""

import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import requests


@dataclass
class ServerStatus:
    """Status of the dev server."""
    running: bool
    url: str = "http://localhost:3001"
    error: str | None = None


def check_server(url: str = "http://localhost:3001", timeout: float = 5.0) -> ServerStatus:
    """Check if the dev server is running and responding."""
    try:
        response = requests.get(url, timeout=timeout)
        if response.status_code == 200:
            return ServerStatus(running=True, url=url)
        return ServerStatus(
            running=False,
            url=url,
            error=f"Server returned status {response.status_code}"
        )
    except requests.ConnectionError:
        return ServerStatus(running=False, url=url, error="Connection refused")
    except requests.Timeout:
        return ServerStatus(running=False, url=url, error="Connection timeout")
    except Exception as e:
        return ServerStatus(running=False, url=url, error=str(e))


def wait_for_server(
    url: str = "http://localhost:3001",
    max_wait: float = 60.0,
    check_interval: float = 2.0,
) -> ServerStatus:
    """Wait for the server to become ready."""
    start = time.time()
    last_status = None

    while time.time() - start < max_wait:
        status = check_server(url)
        last_status = status

        if status.running:
            return status

        print(f"  Waiting for server... ({status.error})")
        time.sleep(check_interval)

    return last_status or ServerStatus(running=False, url=url, error="Timeout waiting for server")


def start_server_background() -> subprocess.Popen | None:
    """
    Start the Evidence dev server in the background.
    Returns the process handle or None if failed.
    """
    project_root = Path(__file__).parent.parent

    try:
        # Start npm run dev in background
        process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=project_root,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,  # Detach from parent process group
        )

        # Give it a moment to start
        time.sleep(3)

        # Check if it's running
        if process.poll() is not None:
            # Process exited
            stdout, stderr = process.communicate()
            print(f"Server failed to start: {stderr.decode()}")
            return None

        return process

    except Exception as e:
        print(f"Failed to start server: {e}")
        return None


def ensure_server_running(
    auto_start: bool = False,
    url: str = "http://localhost:3001",
) -> tuple[bool, subprocess.Popen | None]:
    """
    Ensure the Evidence server is running.

    Args:
        auto_start: If True, attempt to start the server if not running
        url: Server URL to check

    Returns:
        Tuple of (is_running, server_process_or_none)
    """
    print("Checking Evidence server...")

    status = check_server(url)
    if status.running:
        print(f"  ✓ Server is running at {url}")
        return True, None

    print(f"  ✗ Server not running: {status.error}")

    if not auto_start:
        print("\n  To start the server, run: npm run dev")
        return False, None

    print("  Starting server...")
    process = start_server_background()

    if process is None:
        return False, None

    # Wait for it to be ready
    status = wait_for_server(url, max_wait=45)

    if status.running:
        print(f"  ✓ Server started at {url}")
        return True, process

    print(f"  ✗ Server failed to start: {status.error}")
    process.terminate()
    return False, None


def check_api_keys() -> dict[str, bool]:
    """Check which API keys are available."""
    keys = {
        "claude": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "openai": bool(os.environ.get("OPENAI_API_KEY")),
        "gemini": bool(os.environ.get("GOOGLE_API_KEY")),
    }
    return keys


def print_environment_status():
    """Print the current test environment status."""
    print("\n" + "=" * 60)
    print("TEST ENVIRONMENT STATUS")
    print("=" * 60)

    # Server
    status = check_server()
    server_icon = "✓" if status.running else "✗"
    print(f"\nEvidence Server: {server_icon} {'Running' if status.running else status.error}")

    # API Keys
    keys = check_api_keys()
    print("\nAPI Keys:")
    for provider, available in keys.items():
        icon = "✓" if available else "✗"
        print(f"  {provider.capitalize():10} {icon}")

    print("=" * 60 + "\n")

    return status.running, keys


if __name__ == "__main__":
    # When run directly, show status and optionally start server
    import argparse

    parser = argparse.ArgumentParser(description="Test environment manager")
    parser.add_argument("--start", action="store_true", help="Start server if not running")
    parser.add_argument("--wait", action="store_true", help="Wait for server to be ready")
    args = parser.parse_args()

    if args.start:
        running, process = ensure_server_running(auto_start=True)
        if running and process:
            print("\nServer started. Press Ctrl+C to stop.")
            try:
                process.wait()
            except KeyboardInterrupt:
                process.terminate()
    elif args.wait:
        status = wait_for_server()
        sys.exit(0 if status.running else 1)
    else:
        print_environment_status()
