"""
SQL Fixer - Post-LLM SQL corrections.

Catches and fixes common SQL generation issues that LLMs (especially non-Claude)
tend to produce, particularly around filter value quoting.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..models.chart import FilterSpec, FilterType


# Columns that are typically strings and need quoting when used in filters
STRING_FILTER_KEYWORDS = [
    "industry",
    "segment",
    "tier",
    "plan",
    "status",
    "type",
    "category",
    "region",
    "country",
    "state",
    "city",
    "name",
    "department",
    "team",
    "role",
    "level",
    "priority",
    "channel",
    "source",
    "provider",
]

# Columns that are numeric and should NOT have quotes
NUMERIC_FILTER_KEYWORDS = [
    "year",
    "month",
    "day",
    "quarter",
    "week",
    "id",
    "count",
    "number",
    "amount",
    "price",
    "quantity",
    "age",
]


class SQLFixer:
    """
    Fixes common SQL issues, particularly around filter value quoting.

    The main issue is that LLMs (especially OpenAI and Gemini) often forget
    to quote string filter values, producing SQL like:
        WHERE industry = ${inputs.industry_filter.value}

    Evidence substitutes the value directly, resulting in:
        WHERE industry = Finance

    Which causes "Binder Error: Referenced column 'Finance' not found in FROM clause!"

    The fix is to add quotes for string values:
        WHERE industry = '${inputs.industry_filter.value}'
    """

    @classmethod
    def fix_filter_quoting(cls, sql: str, filters: list["FilterSpec"]) -> str:
        """
        Fix missing quotes around string filter values in SQL.

        Args:
            sql: The SQL query
            filters: List of filter specs (to know which filters are dropdowns)

        Returns:
            SQL with corrected quoting
        """
        from ..models.chart import FilterType

        if not filters:
            return sql

        fixed_sql = sql

        for f in filters:
            if f.filter_type != FilterType.DROPDOWN:
                continue

            # Check if this filter is used in the SQL
            filter_pattern = f"${{inputs.{f.name}.value}}"
            if filter_pattern not in sql:
                continue

            # Determine if this should be a string or numeric filter
            is_string_filter = cls._is_string_filter(f, sql)

            if is_string_filter:
                # Check if quotes are already present
                # Pattern: = '${inputs.name.value}' or = "${inputs.name.value}"
                quoted_pattern = rf"=\s*['\"]?\${{inputs\.{re.escape(f.name)}\.value}}['\"]?"
                match = re.search(quoted_pattern, sql)

                if match:
                    matched_text = match.group(0)
                    # Check if it's already quoted
                    if not (matched_text.strip().startswith("= '") or
                            matched_text.strip().startswith("='") or
                            matched_text.strip().startswith('= "') or
                            matched_text.strip().startswith('="')):
                        # Not properly quoted - add quotes
                        unquoted = f"${{inputs.{f.name}.value}}"
                        quoted = f"'${{inputs.{f.name}.value}}'"
                        fixed_sql = fixed_sql.replace(f"= {unquoted}", f"= {quoted}")
                        fixed_sql = fixed_sql.replace(f"={unquoted}", f"= {quoted}")

        return fixed_sql

    @classmethod
    def _is_string_filter(cls, filter_spec: "FilterSpec", sql: str) -> bool:
        """
        Determine if a filter should use string quoting.

        Uses heuristics based on:
        1. The filter name
        2. The column it filters on (from SQL context)
        3. The options_column if available
        """
        # Check the filter name
        name_lower = filter_spec.name.lower()

        # Explicit string indicators
        for keyword in STRING_FILTER_KEYWORDS:
            if keyword in name_lower:
                return True

        # Explicit numeric indicators
        for keyword in NUMERIC_FILTER_KEYWORDS:
            if keyword in name_lower:
                return False

        # Check options_column if available
        if filter_spec.options_column:
            col_lower = filter_spec.options_column.lower()
            for keyword in STRING_FILTER_KEYWORDS:
                if keyword in col_lower:
                    return True
            for keyword in NUMERIC_FILTER_KEYWORDS:
                if keyword in col_lower:
                    return False

        # Look at SQL context - find what column is being compared
        # Pattern: column = ${inputs.filter_name.value}
        pattern = rf"(\w+)\s*=\s*\${{inputs\.{re.escape(filter_spec.name)}\.value}}"
        match = re.search(pattern, sql, re.IGNORECASE)
        if match:
            col_name = match.group(1).lower()
            for keyword in STRING_FILTER_KEYWORDS:
                if keyword in col_name:
                    return True
            for keyword in NUMERIC_FILTER_KEYWORDS:
                if keyword in col_name:
                    return False

        # Default: assume string (safer - quotes won't break numeric comparisons
        # in most cases, but missing quotes breaks string comparisons)
        return True
