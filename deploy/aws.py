"""Core AWS deployment logic for Story Analytics.

Uses subprocess for Docker/AWS CLI commands and boto3 for CloudFormation.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

TEMPLATE_PATH = Path(__file__).parent / "cloudformation.yaml"
DEFAULT_STACK_NAME = "story-analytics"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(cmd: list[str], *, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    """Run a subprocess command with nice error handling."""
    try:
        return subprocess.run(
            cmd,
            check=check,
            capture_output=capture,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr or ""
        print(f"ERROR: command failed: {' '.join(cmd)}")
        if stderr:
            print(f"  {stderr.strip()}")
        raise


def _cfn_client(region: str):
    """Return a CloudFormation boto3 client for *region*."""
    return boto3.client("cloudformation", region_name=region)


def _ecr_client(region: str):
    """Return an ECR boto3 client for *region*."""
    return boto3.client("ecr", region_name=region)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate_credentials() -> bool:
    """Check that AWS credentials are configured and print account info.

    Returns True if valid, False otherwise.
    """
    try:
        result = _run(
            ["aws", "sts", "get-caller-identity"],
            capture=True,
        )
        identity = json.loads(result.stdout)
        print(f"  AWS Account : {identity['Account']}")
        print(f"  User/Role   : {identity['Arn']}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError, json.JSONDecodeError):
        return False


def build_and_push_image(region: str, repo_uri: str) -> None:
    """Build the production Docker image and push it to ECR.

    Parameters
    ----------
    region : str
        AWS region (e.g. ``us-east-1``).
    repo_uri : str
        Full ECR repository URI **without** the ``:tag`` suffix,
        e.g. ``123456789012.dkr.ecr.us-east-1.amazonaws.com/story-analytics``.
    """
    registry = repo_uri.rsplit("/", 1)[0]  # everything before the repo name

    # 1. Build
    print("\n  Building Docker image...")
    _run(["docker", "build", "-f", "Dockerfile.prod", "-t", "story-analytics:latest", "."])

    # 2. ECR login (piped: get-login-password | docker login --password-stdin)
    print("  Logging in to ECR...")
    _ecr_login(region, registry)

    # 3. Tag
    print("  Tagging image...")
    _run(["docker", "tag", "story-analytics:latest", f"{repo_uri}:latest"])

    # 4. Push
    print("  Pushing image to ECR...")
    _run(["docker", "push", f"{repo_uri}:latest"])

    print("  Image pushed successfully.")


def _ecr_login(region: str, registry: str) -> None:
    """Pipe ECR login password into ``docker login`` via two subprocesses."""
    pw_proc = subprocess.Popen(
        ["aws", "ecr", "get-login-password", "--region", region],
        stdout=subprocess.PIPE,
        text=True,
    )
    login_proc = subprocess.Popen(
        ["docker", "login", "--username", "AWS", "--password-stdin", registry],
        stdin=pw_proc.stdout,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    pw_proc.stdout.close()  # allow pw_proc to receive SIGPIPE
    stdout, stderr = login_proc.communicate()
    if login_proc.returncode != 0:
        print(f"ERROR: ECR login failed: {stderr.strip()}")
        sys.exit(1)


def deploy_stack(
    stack_name: str,
    region: str,
    db_password: str,
    *,
    cpu: str = "1024",
    memory: str = "2048",
    db_instance_class: str = "db.t4g.micro",
) -> dict[str, str]:
    """Create or update the CloudFormation stack and return its outputs.

    Parameters
    ----------
    stack_name : str
        CloudFormation stack name.
    region : str
        AWS region.
    db_password : str
        Master password for the RDS PostgreSQL instance.
    cpu, memory, db_instance_class : str
        Optional sizing overrides.

    Returns
    -------
    dict
        Stack outputs keyed by output key (e.g. ``AppUrl``, ``ECRRepositoryUri``).
    """
    cfn = _cfn_client(region)
    template_body = TEMPLATE_PATH.read_text()

    params = [
        {"ParameterKey": "AppName", "ParameterValue": stack_name},
        {"ParameterKey": "DBPassword", "ParameterValue": db_password},
        {"ParameterKey": "DBInstanceClass", "ParameterValue": db_instance_class},
        {"ParameterKey": "AppRunnerCpu", "ParameterValue": cpu},
        {"ParameterKey": "AppRunnerMemory", "ParameterValue": memory},
    ]

    # Decide create vs update
    action = _resolve_stack_action(cfn, stack_name)

    try:
        if action == "create":
            print(f"\n  Creating stack '{stack_name}' in {region}...")
            cfn.create_stack(
                StackName=stack_name,
                TemplateBody=template_body,
                Parameters=params,
                Capabilities=["CAPABILITY_NAMED_IAM"],
                OnFailure="DELETE",
            )
            waiter_name = "stack_create_complete"
        else:
            print(f"\n  Updating stack '{stack_name}' in {region}...")
            cfn.update_stack(
                StackName=stack_name,
                TemplateBody=template_body,
                Parameters=params,
                Capabilities=["CAPABILITY_NAMED_IAM"],
            )
            waiter_name = "stack_update_complete"
    except ClientError as exc:
        msg = str(exc)
        if "No updates are to be performed" in msg:
            print("  Stack is already up to date.")
            return _get_outputs(cfn, stack_name)
        raise

    # Wait with progress dots
    _wait_for_stack(cfn, stack_name, waiter_name)

    return _get_outputs(cfn, stack_name)


def get_stack_status(stack_name: str, region: str) -> dict[str, str]:
    """Return the current stack outputs (or exit with an error message).

    Returns
    -------
    dict
        Stack outputs keyed by output key.
    """
    cfn = _cfn_client(region)
    try:
        resp = cfn.describe_stacks(StackName=stack_name)
    except ClientError:
        print(f"ERROR: Stack '{stack_name}' not found in {region}.")
        sys.exit(1)

    stack = resp["Stacks"][0]
    status = stack["StackStatus"]
    print(f"  Stack: {stack_name}")
    print(f"  Status: {status}")
    print(f"  Region: {region}")

    outputs = {o["OutputKey"]: o["OutputValue"] for o in stack.get("Outputs", [])}
    if outputs:
        print("\n  Outputs:")
        for key, value in outputs.items():
            print(f"    {key}: {value}")

    return outputs


def destroy_stack(stack_name: str, region: str) -> None:
    """Delete the CloudFormation stack and clean up ECR images."""
    cfn = _cfn_client(region)

    # Clean up ECR images first (so stack delete doesn't fail on non-empty repo)
    _clean_ecr_images(stack_name, region)

    print(f"\n  Deleting stack '{stack_name}' in {region}...")
    try:
        cfn.delete_stack(StackName=stack_name)
    except ClientError as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)

    _wait_for_stack(cfn, stack_name, "stack_delete_complete")
    print("  Stack deleted.")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_stack_action(cfn, stack_name: str) -> str:
    """Return ``'create'`` or ``'update'`` depending on whether the stack exists."""
    try:
        resp = cfn.describe_stacks(StackName=stack_name)
        status = resp["Stacks"][0]["StackStatus"]
        if status in ("ROLLBACK_COMPLETE", "DELETE_COMPLETE"):
            # Stack exists but is in a terminal failed state — must recreate
            print(f"  Existing stack in {status} state; deleting before recreate...")
            cfn.delete_stack(StackName=stack_name)
            _wait_for_stack(cfn, stack_name, "stack_delete_complete")
            return "create"
        return "update"
    except ClientError:
        return "create"


def _wait_for_stack(cfn, stack_name: str, waiter_name: str) -> None:
    """Wait for a CloudFormation operation, printing dots for progress."""
    print("  Waiting", end="", flush=True)
    waiter = cfn.get_waiter(waiter_name)
    # Use a custom polling loop so we can print dots
    delay = 15  # seconds between polls
    max_attempts = 120  # up to 30 minutes
    for _ in range(max_attempts):
        print(".", end="", flush=True)
        time.sleep(delay)
        try:
            resp = cfn.describe_stacks(StackName=stack_name)
            status = resp["Stacks"][0]["StackStatus"]
        except ClientError:
            # Stack may have been deleted
            if "delete" in waiter_name:
                print(" done.")
                return
            raise
        if status.endswith("_COMPLETE"):
            print(" done.")
            return
        if status.endswith("_FAILED") or status == "ROLLBACK_COMPLETE":
            print(f" FAILED ({status})")
            _print_failure_events(cfn, stack_name)
            sys.exit(1)

    print(" TIMED OUT")
    sys.exit(1)


def _print_failure_events(cfn, stack_name: str) -> None:
    """Print the most recent failure events for debugging."""
    try:
        resp = cfn.describe_stack_events(StackName=stack_name)
        events = resp.get("StackEvents", [])
        print("\n  Recent failure events:")
        for event in events[:10]:
            status = event.get("ResourceStatus", "")
            if "FAILED" in status:
                reason = event.get("ResourceStatusReason", "unknown")
                resource = event.get("LogicalResourceId", "?")
                print(f"    {resource}: {reason}")
    except ClientError:
        pass


def _get_outputs(cfn, stack_name: str) -> dict[str, str]:
    """Extract outputs dict from a describe_stacks response."""
    resp = cfn.describe_stacks(StackName=stack_name)
    stack = resp["Stacks"][0]
    return {o["OutputKey"]: o["OutputValue"] for o in stack.get("Outputs", [])}


def _clean_ecr_images(stack_name: str, region: str) -> None:
    """Delete all images from the ECR repo so CloudFormation can delete it."""
    ecr = _ecr_client(region)
    repo_name = stack_name  # AppName == repo name in our template
    try:
        resp = ecr.list_images(repositoryName=repo_name)
        image_ids = resp.get("imageIds", [])
        if image_ids:
            print(f"  Cleaning up {len(image_ids)} ECR image(s)...")
            ecr.batch_delete_image(repositoryName=repo_name, imageIds=image_ids)
    except ClientError:
        # Repo may not exist yet — that's fine
        pass
