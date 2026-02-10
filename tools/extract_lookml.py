#!/usr/bin/env python3
"""Extract LookML repository into Data Context format.

Usage:
    # Extract only (deterministic, no LLM)
    python tools/extract_lookml.py <repo_path> --output <output_dir>

    # Extract + enrich (extraction then LLM enrichment)
    python tools/extract_lookml.py <repo_path> --output <output_dir> --enrich

    # Enrich an already-extracted directory
    python tools/extract_lookml.py --enrich-only <extracted_dir>

    # Full pipeline: extract + enrich + convert to semantic.yaml
    python tools/extract_lookml.py <repo_path> --output <output_dir> --enrich --to-semantic mattermost

    # Convert already-enriched output to semantic.yaml
    python tools/extract_lookml.py --convert-to-semantic output/mattermost/enriched/ --source-name mattermost
"""

import argparse
import os
import sys
import time

# Support running as both `python tools/extract_lookml.py` and `python -m tools.extract_lookml`
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools.lookml_extractor.parser import parse_repo
from tools.lookml_extractor.mapper import map_to_data_context
from tools.lookml_extractor.output_writer import write_data_context
from tools.lookml_extractor.memo_writer import write_memo


def main():
    parser = argparse.ArgumentParser(
        description="Extract LookML repository into Data Context format."
    )
    parser.add_argument("repo_path", nargs="?", default=None, help="Path to LookML repository root")
    parser.add_argument("--output", "-o", default=None, help="Output directory for Data Context files")
    parser.add_argument("--memo", "-m", default=None, help="Path for review memo (default: <output>/REVIEW_MEMO.md)")
    parser.add_argument("--enrich", action="store_true", help="Run LLM enrichment after extraction")
    parser.add_argument("--enrich-only", metavar="DIR", default=None,
                        help="Enrich an already-extracted Data Context directory (no extraction)")
    parser.add_argument("--enrich-output", default=None,
                        help="Output directory for enriched files (default: <input>/enriched/)")
    parser.add_argument("--model", default="claude-sonnet-4-5-20250929",
                        help="Anthropic model for enrichment (default: claude-sonnet-4-5-20250929)")
    parser.add_argument("--to-semantic", metavar="SOURCE_NAME", default=None,
                        help="After enrichment, convert to semantic.yaml for this source name")
    parser.add_argument("--semantic-output", default=None,
                        help="Output path for semantic.yaml (default: sources/<source_name>/semantic.yaml)")
    parser.add_argument("--convert-to-semantic", metavar="DIR", default=None,
                        help="Convert an already-enriched Data Context directory to semantic.yaml (no extraction)")
    parser.add_argument("--source-name", default=None,
                        help="Source name for --convert-to-semantic (required with that flag)")
    args = parser.parse_args()

    # Mode: convert-to-semantic only
    if args.convert_to_semantic:
        if not args.source_name:
            parser.error("--source-name is required with --convert-to-semantic")
        _run_convert_to_semantic(args.convert_to_semantic, args.source_name, args.semantic_output)
        return

    # Mode: enrich-only (no extraction)
    if args.enrich_only:
        _run_enrich_only(args.enrich_only, args.enrich_output, args.model)
        if args.to_semantic:
            enrich_out = args.enrich_output or os.path.join(args.enrich_only, "enriched")
            _run_convert_to_semantic(enrich_out, args.to_semantic, args.semantic_output)
        return

    # Mode: extraction (with optional enrichment)
    if not args.repo_path:
        parser.error("repo_path is required unless using --enrich-only")
    if not args.output:
        parser.error("--output is required for extraction")

    memo_path = args.memo or f"{args.output}/REVIEW_MEMO.md"

    print(f"Parsing LookML repository: {args.repo_path}")
    t0 = time.time()

    # Step 1: Parse
    parsed = parse_repo(args.repo_path)
    t1 = time.time()
    print(f"  Parsed {len(parsed.views)} views, {len(parsed.explores)} explores in {t1 - t0:.1f}s")

    # Step 2: Map
    output = map_to_data_context(parsed)
    t2 = time.time()
    print(f"  Mapped {output.total_dimensions} dimensions, {output.total_measures} measures, {len(output.metrics)} metrics, {len(output.joins)} joins in {t2 - t1:.1f}s")

    # Step 3: Write YAML
    write_data_context(output, args.output)
    t3 = time.time()
    print(f"  Wrote Data Context to {args.output}/ in {t3 - t2:.1f}s")

    # Step 4: Write review memo
    write_memo(output, memo_path)
    print(f"  Wrote review memo to {memo_path}")

    # Summary
    print()
    print("=== Extraction Complete ===")
    print(f"  Tables:     {len(output.tables)}")
    print(f"  Dimensions: {output.total_dimensions}")
    print(f"  Measures:   {output.total_measures}")
    print(f"  Metrics:    {len(output.metrics)}")
    print(f"  Joins:      {len(output.joins)}")
    print(f"  Connection: {output.connection}")
    print(f"  Output:     {args.output}/")
    print(f"  Memo:       {memo_path}")

    # Step 5: Enrich (optional)
    if args.enrich:
        print()
        _run_enrich_only(args.output, args.enrich_output, args.model)

    # Step 6: Convert to semantic.yaml (optional)
    if args.to_semantic:
        print()
        # Use enriched output if enrichment ran, otherwise raw extraction
        if args.enrich:
            semantic_input = args.enrich_output or os.path.join(args.output, "enriched")
        else:
            semantic_input = args.output
        _run_convert_to_semantic(semantic_input, args.to_semantic, args.semantic_output)


def _run_enrich_only(input_dir: str, output_dir: str | None, model: str) -> None:
    """Run LLM enrichment on an already-extracted Data Context directory."""
    from tools.lookml_extractor.enricher import enrich_data_context

    print(f"=== LLM Enrichment ===")
    print(f"  Input:  {input_dir}/")
    print(f"  Model:  {model}")
    t0 = time.time()

    summary = enrich_data_context(input_dir, output_dir, model=model)

    elapsed = time.time() - t0
    enrich_out = output_dir or os.path.join(input_dir, "enriched")

    print()
    print("=== Enrichment Complete ===")
    print(f"  Domains processed:  {summary.domains_processed}")
    if summary.domains_failed:
        print(f"  Domains failed:     {summary.domains_failed} ({', '.join(summary.failed_domains)})")
    print(f"  Tables described:   {summary.tables_described}")
    print(f"  Measures described: {summary.measures_described}")
    print(f"  Dims described:     {summary.dimensions_described}")
    print(f"  Metrics renamed:    {summary.metrics_renamed}")
    print(f"  Derived metrics:    {summary.metrics_derived}")
    print(f"  Certified metrics:  {summary.metrics_certified}")
    print(f"  Glossary terms:     {summary.glossary_terms}")
    print(f"  Data quirks:        {summary.data_quirks}")
    print(f"  API time:           {summary.total_api_time_s:.1f}s")
    print(f"  Total time:         {elapsed:.1f}s")
    print(f"  Output:             {enrich_out}/")


def _run_convert_to_semantic(input_dir: str, source_name: str, output_path: str | None) -> None:
    """Convert enriched Data Context to SemanticLayer format."""
    from tools.lookml_extractor.semantic_converter import convert_data_context_to_semantic

    print(f"=== Semantic Layer Conversion ===")
    print(f"  Input:  {input_dir}/")
    print(f"  Source: {source_name}")
    t0 = time.time()

    sl = convert_data_context_to_semantic(input_dir, source_name, output_path)

    elapsed = time.time() - t0
    out = output_path or os.path.join("sources", source_name, "semantic.yaml")

    print()
    print("=== Conversion Complete ===")
    print(f"  Tables:        {len(sl.tables)}")
    print(f"  Relationships: {len(sl.relationships)}")
    print(f"  Key metrics:   {len(sl.business_context.key_metrics)}")
    print(f"  Glossary:      {len(sl.business_context.business_glossary)}")
    print(f"  Patterns:      {len(sl.query_patterns)}")
    print(f"  Time:          {elapsed:.1f}s")
    print(f"  Output:        {out}")


if __name__ == "__main__":
    main()
