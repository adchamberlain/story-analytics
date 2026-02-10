#!/usr/bin/env python3
"""Extract LookML repository into Data Context format.

Usage:
    python tools/extract_lookml.py <repo_path> --output <output_dir>

Example:
    python tools/extract_lookml.py test_data/mattermost-looker/ --output output/mattermost/
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
    parser.add_argument("repo_path", help="Path to LookML repository root")
    parser.add_argument("--output", "-o", required=True, help="Output directory for Data Context files")
    parser.add_argument("--memo", "-m", default=None, help="Path for review memo (default: <output>/REVIEW_MEMO.md)")
    args = parser.parse_args()

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


if __name__ == "__main__":
    main()
