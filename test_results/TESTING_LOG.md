# Chart Pipeline Testing Log

This log tracks testing sessions, issues discovered, fixes applied, and improvements measured for each LLM provider.

---

## Session: 2026-01-23

### Test Suite: Comprehensive Chart Tests (30 tests)

Tests cover: chart types (Line, Bar, Area, BigValue, DataTable), complexity levels (Simple/Medium/Complex), features (filters, aggregations, time granularity), and natural language variations.

---

### OpenAI Provider

#### Initial Results
- **Date:** 2026-01-23 14:52
- **Pass Rate:** 26/30 (87%)
- **Failing Tests:**
  1. `09_multi_metric_comparison` - SQL syntax error (escaped newlines)
  2. `10_complex_filtered_analysis` - Monthly instead of weekly granularity
  3. `26_single_kpi_revenue` - No chart URL returned
  4. `28_ambiguous_metric` - No chart URL returned

#### Issues Identified

**Issue 1: JSON Parsing Error (Test 09)**
- **Symptom:** `Parser Error: syntax error at or near "\"`
- **Root Cause:** OpenAI outputs SQL with backslash-continuation (`\ `) for multi-line strings, which is invalid JSON escaping
- **Example:** `"sql": "SELECT \ \n   col"` instead of proper `\n` escaping

**Issue 2: Intent Misclassification (Tests 26, 28)**
- **Symptom:** No chart URL returned, pipeline never started
- **Root Cause:** OpenAI's LLM classified metric-focused questions as "data_question" instead of "chart_request"
- **Examples:**
  - "What's our total revenue? Just show me the number" → classified as "data_question"
  - "how are we doing with customers" → classified as "data_question"

#### Fixes Applied

**Fix 1: JSON Repair Enhancement** (`engine/chart_pipeline.py`)
```python
# Added backslash-continuation handling to _try_repair_json()
# Remove backslash followed by whitespace (line continuation)
fixed = re.sub(r'\\\s+', ' ', json_str)
```

**Fix 2: Intent Classification Prompt** (`engine/chart_conversation.py`)
- Clarified distinction between metric requests (chart_request) and system questions (data_question)
- Added explicit examples: "What's our revenue?" = chart_request, "What data do you have?" = data_question
- Added critical distinction section in prompt

#### Re-test Results
- **Date:** 2026-01-23 15:37
- **Pass Rate:** 29/30 (97%)
- **Improvement:** +3 tests (+10%)
- **Remaining Failure:**
  - `10_complex_filtered_analysis` - SQL correct (`DATE_TRUNC('week')`), but visual rendering shows monthly groupings. This appears to be an Evidence chart rendering issue, not a pipeline issue.

#### Summary
| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Tests Passed | 26/30 | 29/30 | +3 |
| Pass Rate | 87% | 97% | +10% |

---

### Claude Provider

#### Results (from previous session)
- **Date:** 2026-01-22 22:09
- **Pass Rate:** 29/30 (97%)
- **Failing Tests:**
  1. `10_complex_filtered_analysis` - Weekly granularity visual rendering issue (same as other providers)

#### Notes
- Claude had no provider-specific issues
- The same Evidence rendering issue affects all three providers

---

### Gemini Provider

#### Results
- **Date:** 2026-01-23 15:54
- **Pass Rate:** 29/30 (97%)
- **Failing Tests:**
  1. `10_complex_filtered_analysis` - Weekly granularity visual rendering issue (same as OpenAI)

#### Notes
- No Gemini-specific issues discovered
- All 30 tests ran without JSON parsing or intent classification errors
- The fixes applied for OpenAI (JSON repair, intent classification) benefited Gemini as well
- The only failure is the same Evidence rendering issue affecting all providers

#### Summary
| Metric | Result |
|--------|--------|
| Tests Passed | 29/30 |
| Pass Rate | 97% |

---

## Test Categories Reference

| Category | Tests | Description |
|----------|-------|-------------|
| Smoke Tests | 01-03 | Basic bar, line, BigValue |
| Core Chart Types | 04-10 | Multi-line, area, dual y-axis, filters |
| Natural Language | 11-15 | Questions, casual, minimal, verbose |
| Aggregations | 16-19 | Count distinct, min/max, percentages, top N |
| Time Granularity | 20-22 | Weekly, quarterly |
| Filter Variations | 23-24 | Dropdown, multiple filters |
| Edge Cases | 25-30 | KPIs, typos, ambiguous requests |

---

## Files Modified This Session

1. `engine/chart_pipeline.py` - JSON repair for backslash-continuation
2. `engine/chart_conversation.py` - Intent classification prompt improvement

---

## Next Steps

- [x] Run full test suite on Claude provider (29/30 - 97%)
- [x] Run full test suite on OpenAI provider (29/30 - 97%)
- [x] Run full test suite on Gemini provider (29/30 - 97%)
- [ ] Investigate Evidence rendering issue for weekly granularity (Test 10) - affects all providers
- [ ] Consider adding test for multi-line chart display (related to provider_comparison_results.md issues)

---

## Cross-Provider Summary

| Provider | Pass Rate | Failing Test |
|----------|-----------|--------------|
| Claude | 29/30 (97%) | Test 10 (weekly rendering) |
| OpenAI | 29/30 (97%) | Test 10 (weekly rendering) |
| Gemini | 29/30 (97%) | Test 10 (weekly rendering) |

**Key Finding:** All three providers achieve 97% pass rate. The single failing test (`10_complex_filtered_analysis`) is a visual rendering issue in Evidence, not a provider-specific problem. The SQL correctly uses `DATE_TRUNC('week')` but the chart displays monthly groupings.
