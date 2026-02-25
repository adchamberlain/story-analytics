"""CLI entry point for deploying Story Analytics to AWS.

Usage:
    python -m deploy.cli deploy --region us-east-1    # First deploy
    python -m deploy.cli update                       # Update code (rebuild + push)
    python -m deploy.cli status                       # Check deployment status
    python -m deploy.cli destroy                      # Tear down everything
"""

from __future__ import annotations

import argparse
import secrets
import sys

from deploy.aws import (
    DEFAULT_STACK_NAME,
    build_and_push_image,
    deploy_stack,
    destroy_stack,
    ensure_ecr_repo,
    get_stack_status,
    validate_credentials,
)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_deploy(args: argparse.Namespace) -> None:
    """Full deploy: ECR + Docker image + CloudFormation stack."""
    print("Deploying Story Analytics to AWS...\n")

    # 1. Validate credentials
    print("[1/5] Checking AWS credentials...")
    if not validate_credentials():
        print("\nERROR: AWS credentials not configured.")
        print("  Run `aws configure` or export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.")
        sys.exit(1)

    # 2. Create ECR repo (must exist before CloudFormation, which needs an image)
    print("\n[2/5] Ensuring ECR repository exists...")
    ecr_uri = ensure_ecr_repo(args.stack_name, args.region)

    # 3. Build and push Docker image (must be in ECR before App Runner starts)
    print("\n[3/5] Building and pushing Docker image...")
    build_and_push_image(args.region, ecr_uri)

    # 4. Deploy CloudFormation stack (S3, RDS, App Runner pointing at the image)
    db_password = args.db_password or secrets.token_urlsafe(16)
    print("\n[4/5] Deploying CloudFormation stack (this takes ~10 min for RDS)...")
    outputs = deploy_stack(
        args.stack_name,
        args.region,
        db_password,
        cpu=args.cpu,
        memory=args.memory,
        db_instance_class=args.db_instance_class,
    )

    if not outputs:
        print("\nERROR: Stack deployed but returned no outputs.")
        sys.exit(1)

    # 5. Print results
    app_url = outputs.get("AppUrl", "(unknown)")
    s3_bucket = outputs.get("S3BucketName", "(unknown)")
    rds_endpoint = outputs.get("RDSEndpoint", "(unknown)")

    print("\n[5/5] Deployment complete!\n")
    print("  App URL      :", app_url)
    print("  S3 Bucket    :", s3_bucket)
    print("  RDS Endpoint :", rds_endpoint)
    print("  DB Password  :", db_password, " (save this!)")
    print()
    print("  Note: App Runner may take a few minutes to start the first time.")
    print("  Visit the App URL above once the service is healthy.")


def cmd_update(args: argparse.Namespace) -> None:
    """Rebuild Docker image and push to ECR (App Runner auto-deploys)."""
    print("Updating Story Analytics...\n")

    # 1. Validate credentials
    print("[1/3] Checking AWS credentials...")
    if not validate_credentials():
        print("\nERROR: AWS credentials not configured.")
        sys.exit(1)

    # 2. Get existing stack outputs
    print("\n[2/3] Fetching stack info...")
    outputs = get_stack_status(args.stack_name, args.region)

    ecr_uri = outputs.get("ECRRepositoryUri", "")
    if not ecr_uri:
        print("\nERROR: ECRRepositoryUri not found. Is the stack deployed?")
        sys.exit(1)

    # 3. Rebuild and push image
    print("\n[3/3] Building and pushing Docker image...")
    build_and_push_image(args.region, ecr_uri)

    print("\nImage pushed. App Runner will auto-deploy the new version.")


def cmd_status(args: argparse.Namespace) -> None:
    """Check deployment status."""
    print("Story Analytics deployment status:\n")
    get_stack_status(args.stack_name, args.region)


def cmd_destroy(args: argparse.Namespace) -> None:
    """Tear down the entire deployment."""
    print("Destroying Story Analytics deployment...\n")

    # Safety prompt
    if not args.yes:
        answer = input(
            f"  This will PERMANENTLY DELETE the stack '{args.stack_name}' "
            f"and all its resources.\n"
            f"  Type 'yes' to confirm: "
        )
        if answer.strip().lower() != "yes":
            print("  Aborted.")
            return

    print("[1/2] Checking AWS credentials...")
    if not validate_credentials():
        print("\nERROR: AWS credentials not configured.")
        sys.exit(1)

    print("\n[2/2] Deleting stack...")
    destroy_stack(args.stack_name, args.region)

    print("\nAll resources deleted.")


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    """Build and return the argparse parser."""
    parser = argparse.ArgumentParser(
        prog="deploy",
        description="Deploy Story Analytics to AWS (App Runner + RDS + S3).",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Shared args
    def add_common(sub: argparse.ArgumentParser) -> None:
        sub.add_argument(
            "--stack-name",
            default=DEFAULT_STACK_NAME,
            help=f"CloudFormation stack name (default: {DEFAULT_STACK_NAME})",
        )
        sub.add_argument(
            "--region",
            default="us-east-1",
            help="AWS region (default: us-east-1)",
        )

    # deploy
    p_deploy = subparsers.add_parser("deploy", help="Deploy the full stack")
    add_common(p_deploy)
    p_deploy.add_argument(
        "--db-password",
        default=None,
        help="RDS master password (auto-generated if omitted)",
    )
    p_deploy.add_argument("--cpu", default="1024", help="App Runner CPU units (default: 1024)")
    p_deploy.add_argument("--memory", default="2048", help="App Runner memory in MB (default: 2048)")
    p_deploy.add_argument(
        "--db-instance-class",
        default="db.t4g.micro",
        help="RDS instance class (default: db.t4g.micro)",
    )
    p_deploy.set_defaults(func=cmd_deploy)

    # update
    p_update = subparsers.add_parser("update", help="Rebuild and push image (App Runner auto-deploys)")
    add_common(p_update)
    p_update.set_defaults(func=cmd_update)

    # status
    p_status = subparsers.add_parser("status", help="Check deployment status")
    add_common(p_status)
    p_status.set_defaults(func=cmd_status)

    # destroy
    p_destroy = subparsers.add_parser("destroy", help="Tear down the entire deployment")
    add_common(p_destroy)
    p_destroy.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Skip confirmation prompt",
    )
    p_destroy.set_defaults(func=cmd_destroy)

    return parser


def main() -> None:
    """CLI main entry point."""
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
