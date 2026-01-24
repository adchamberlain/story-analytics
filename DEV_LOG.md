# Development Log

This log captures development changes made during each session. Review this at the start of each session to understand recent context and continue where we left off.

---

## Session: 2026-01-24

### Focus: Architecture Review & Strategic Planning

**Context**: After several days of automated testing, visual quality of generated charts was disappointing compared to Tableau/Mode/Looker. Conducted comprehensive architecture review.

### Analysis Completed

1. **Reviewed current architecture**:
   - Evidence framework as rendering layer (markdown → components → ECharts)
   - Chart pipeline with 3-stage LLM process (Requirements → SQL → Assembly)
   - Design system via YAML config (`engine/styles/chart_defaults.yaml`)

2. **Reviewed test results**:
   - Standard tests: 97% pass rate across all providers (Claude, OpenAI, Gemini)
   - Advanced tests: 53-60% pass rate (complex analytics like MoM growth, conditional aggregation)
   - Single failing standard test is test data limitation, not code bug

3. **Identified core limitation**:
   - Evidence was designed for humans writing markdown, not LLMs generating dashboards
   - The indirection (LLM → Markdown → Evidence → ECharts) loses too much visual control
   - Single chart per page, no dashboard layouts, limited component API

### Decisions Made

**Recommendation**: Build custom React frontend with Plotly.js, replacing Evidence rendering layer while keeping SQL generation pipeline.

Key benefits:
- Full control over visual output (Tableau-quality possible)
- Multi-chart dashboard layouts
- LLM generates JSON spec directly (no markdown intermediary)
- Extensible to any chart type

### Files Created

| File | Purpose |
|------|---------|
| `DEV_PLAN.md` | Strategic architecture plan with implementation phases |
| `DEV_LOG.md` | This file - session-by-session development log |

### Files Modified

| File | Change |
|------|--------|
| `CLAUDE.md` | Added dev log workflow instructions |

### Next Steps

- [ ] Decide on Phase 1 implementation timeline
- [ ] Prototype JSON dashboard spec format
- [ ] Evaluate Plotly.js vs alternatives hands-on
- [ ] Design React component architecture

---

## Template for Future Sessions

```markdown
## Session: YYYY-MM-DD

### Focus: [Brief description]

### Changes Made

1. **[Category]**: Description of change
   - Details
   - Files affected

### Issues Encountered

- Issue description and resolution

### Decisions Made

- Decision and rationale

### Files Created/Modified

| File | Change |
|------|--------|
| `path/to/file` | Description |

### Next Steps

- [ ] Task 1
- [ ] Task 2
```
