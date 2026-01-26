"""
CLI commands for semantic layer management.

Usage:
    python -m engine.cli.semantic generate [source_name] [--force] [--provider NAME]
    python -m engine.cli.semantic status [source_name]

Examples:
    # Generate semantic layer for snowflake_saas
    python -m engine.cli.semantic generate snowflake_saas

    # Check if semantic layer is stale
    python -m engine.cli.semantic status snowflake_saas

    # Force regeneration even if not stale
    python -m engine.cli.semantic generate snowflake_saas --force

    # Use a specific LLM provider
    python -m engine.cli.semantic generate snowflake_saas --provider openai
"""

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))


def cmd_generate(args):
    """Generate a semantic layer for a data source."""
    from engine.semantic_generator import SemanticGenerator

    source_name = args.source_name
    generator = SemanticGenerator(source_name)

    # Check staleness first
    is_stale, message = generator.check_staleness()

    if not is_stale and not args.force:
        print(f"[STATUS] {message}")
        print("[INFO] Semantic layer is up to date. Use --force to regenerate.")
        return 0

    print(f"[STATUS] {message}")
    print(f"[INFO] Generating semantic layer for: {source_name}")

    try:
        # Generate the semantic layer
        semantic_layer = generator.generate(provider_name=args.provider)

        # Save it
        output_path = generator.save(semantic_layer)

        print(f"\n[SUCCESS] Semantic layer generated successfully!")
        print(f"[OUTPUT] {output_path}")

        # Print summary
        print(f"\n[SUMMARY]")
        print(f"  Tables documented: {len(semantic_layer.tables)}")
        print(f"  Relationships found: {len(semantic_layer.relationships)}")
        print(f"  Query patterns: {len(semantic_layer.query_patterns)}")
        print(f"  Domain: {semantic_layer.business_context.domain}")

        return 0

    except Exception as e:
        print(f"[ERROR] Failed to generate semantic layer: {e}")
        import traceback

        traceback.print_exc()
        return 1


def cmd_status(args):
    """Check if a semantic layer exists and whether it's stale."""
    from engine.semantic_generator import SemanticGenerator
    from engine.semantic import SemanticLayer

    source_name = args.source_name
    generator = SemanticGenerator(source_name)

    is_stale, message = generator.check_staleness()

    semantic_path = (
        generator.config_loader.project_root
        / "sources"
        / source_name
        / "semantic.yaml"
    )

    print(f"[SOURCE] {source_name}")
    print(f"[PATH] {semantic_path}")

    if not semantic_path.exists():
        print(f"[STATUS] NOT FOUND")
        print(f"[INFO] Run 'python -m engine.cli.semantic generate {source_name}' to create")
        return 1

    # Load and show details
    try:
        semantic_layer = SemanticLayer.load(str(semantic_path))

        print(f"[STATUS] {'STALE' if is_stale else 'UP TO DATE'}")
        print(f"[MESSAGE] {message}")
        print(f"\n[DETAILS]")
        print(f"  Version: {semantic_layer.version}")
        print(f"  Generated: {semantic_layer.generated_at}")
        print(f"  Schema hash: {semantic_layer.schema_hash}")
        print(f"  Tables: {len(semantic_layer.tables)}")
        print(f"  Relationships: {len(semantic_layer.relationships)}")
        print(f"  Query patterns: {len(semantic_layer.query_patterns)}")
        print(f"  Domain: {semantic_layer.business_context.domain}")

        if semantic_layer.business_context.key_metrics:
            print(f"  Key metrics: {', '.join(semantic_layer.business_context.key_metrics)}")

        return 0 if not is_stale else 2  # Return 2 for stale (not an error, but not fully up to date)

    except Exception as e:
        print(f"[ERROR] Failed to load semantic layer: {e}")
        return 1


def cmd_show(args):
    """Display the semantic layer content."""
    from engine.semantic import SemanticLayer
    from engine.config_loader import get_config_loader

    source_name = args.source_name
    config_loader = get_config_loader()

    semantic_path = (
        config_loader.project_root / "sources" / source_name / "semantic.yaml"
    )

    if not semantic_path.exists():
        print(f"[ERROR] No semantic layer found for {source_name}")
        print(f"[INFO] Run 'python -m engine.cli.semantic generate {source_name}' to create")
        return 1

    try:
        semantic_layer = SemanticLayer.load(str(semantic_path))

        if args.format == "yaml":
            print(semantic_layer.to_yaml())
        else:  # prompt format
            print(semantic_layer.to_prompt_context())

        return 0

    except Exception as e:
        print(f"[ERROR] Failed to load semantic layer: {e}")
        return 1


def main():
    """Main entry point for semantic CLI."""
    load_dotenv()

    parser = argparse.ArgumentParser(
        description="Semantic layer management commands",
        prog="python -m engine.cli.semantic",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Generate command
    gen_parser = subparsers.add_parser(
        "generate",
        help="Generate a semantic layer for a data source",
    )
    gen_parser.add_argument(
        "source_name",
        nargs="?",
        default="snowflake_saas",
        help="Name of the data source (default: snowflake_saas)",
    )
    gen_parser.add_argument(
        "--force",
        "-f",
        action="store_true",
        help="Force regeneration even if not stale",
    )
    gen_parser.add_argument(
        "--provider",
        "-p",
        choices=["claude", "openai", "gemini"],
        help="LLM provider to use (default: claude)",
    )
    gen_parser.set_defaults(func=cmd_generate)

    # Status command
    status_parser = subparsers.add_parser(
        "status",
        help="Check semantic layer status (exists, stale, etc.)",
    )
    status_parser.add_argument(
        "source_name",
        nargs="?",
        default="snowflake_saas",
        help="Name of the data source (default: snowflake_saas)",
    )
    status_parser.set_defaults(func=cmd_status)

    # Show command
    show_parser = subparsers.add_parser(
        "show",
        help="Display the semantic layer content",
    )
    show_parser.add_argument(
        "source_name",
        nargs="?",
        default="snowflake_saas",
        help="Name of the data source (default: snowflake_saas)",
    )
    show_parser.add_argument(
        "--format",
        choices=["yaml", "prompt"],
        default="prompt",
        help="Output format (default: prompt)",
    )
    show_parser.set_defaults(func=cmd_show)

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        return 1

    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
