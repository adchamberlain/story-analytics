# Advanced Chart Test Results

**Test Date:** 2026-02-07 17:06:43
**Total Test Cases:** 3
**Providers Tested:** claude
**Max Attempts per Test:** 3

---

## Executive Summary

| Provider | Tests Passed | Tests Failed | Infra Issues | Pass Rate |
|----------|--------------|--------------|--------------|-----------|
| Claude | 2/3 | 1/3 | 0 | ⚠️ 67% |

---

## Test Categories

| Category | Test IDs | Description |
|----------|----------|-------------|
| Complex Aggregations | 31-35 | Running totals, percentages, statistical comparisons |
| Time Period Comparisons | 36-40 | YTD, MoM growth, trailing averages |
| Ambiguous Language | 41-45 | Vague questions, colloquial, negation |
| Multi-Condition Logic | 46-50 | AND/OR filters, thresholds, combined filters |
| Edge Cases | 51-55 | Empty results, large numbers, unicode |
| Advanced Analytics | 56-60 | Cohorts, concentration, churn rates |

---

## Test Cases Overview

| # | Test Case | Complexity | Chart Type | Features |
|---|-----------|------------|------------|----------|
| 1 | Cumulative Running Total | Complex | LineChart | cumulative sum, running total |
| 2 | Average vs Median Statistical Comparison | Complex | LineChart | statistical comparison, mean |
| 3 | Last N Complete Months | Medium | BarChart | relative time period, complete months |

---

## Results by Test Case

| Test Case | Claude |
|-----------|----------|
| Cumulative Running Total | ✅ (1/1) |
| Average vs Median Statistical Comparison | ✅ (1/1) |
| Last N Complete Months | ❌ (0/3) |

---

## Detailed Results

### Claude Provider

#### Cumulative Running Total

**Request:** Show me a line chart of cumulative total revenue over time, where each point shows the running total up to that month

**Expected:** LineChart | Complexity: Complex

**Result:** ✅ PASSED (1/1 attempts)

**SQL Query:**
```sql
WITH monthly_revenue AS (SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) AS month, SUM(oi.PRICE + oi.FREIGHT_VALUE) AS monthly_revenue FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' GROUP BY DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP)) SELECT month, SUM(monthly_revenue) OVER (ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_revenue FROM monthly_revenue ORDER BY month
```

**QA Summary:** The chart displays a line chart showing cumulative total revenue from September 2016 to August 2018, with values increasing monotonically from $0 to approximately $15M.

**Screenshot:** [31_running_total_claude_1_20260207_170406.png](../qa_screenshots/advanced_tests/31_running_total_claude_1_20260207_170406.png)

---

#### Average vs Median Statistical Comparison

**Request:** Compare the average and median invoice amounts over the past year - I want to see if there are outliers skewing our averages

**Expected:** LineChart | Complexity: Complex

**Result:** ✅ PASSED (1/1 attempts)

**SQL Query:**
```sql
SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) AS month, AVG(oi.PRICE + oi.FREIGHT_VALUE) AS avg_invoice_amount, MEDIAN(oi.PRICE + oi.FREIGHT_VALUE) AS median_invoice_amount FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' AND o.ORDER_PURCHASE_TIMESTAMP >= '2017-10-01' AND o.ORDER_PURCHASE_TIMESTAMP <= '2018-10-31' GROUP BY DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) ORDER BY month
```

**QA Summary:** The chart shows both average and median invoice amounts over time from October 2017 to July 2018, with the average consistently higher than the median, indicating the presence of outliers skewing the averages upward.

**Screenshot:** [33_average_vs_median_comparison_claude_1_20260207_170441.png](../qa_screenshots/advanced_tests/33_average_vs_median_comparison_claude_1_20260207_170441.png)

---

#### Last N Complete Months

**Request:** Show revenue for the last 6 complete months (not including the current partial month)

**Expected:** BarChart | Complexity: Medium

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) AS month, SUM(oi.PRICE + oi.FREIGHT_VALUE) AS revenue FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' AND DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) >= '2018-05-01' AND DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) <= '2018-10-01' GROUP BY DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) ORDER BY month
```

**QA Summary:** This chart shows an area chart displaying revenue data over approximately 3 months (May-July 2018), but it uses the wrong chart type and appears to show insufficient time period coverage.

**Critical Issues:**
- Wrong chart type: Shows area chart instead of requested bar chart
- Insufficient data period: Shows approximately 3 months instead of the requested 6 complete months
- Missing the primary visualization format the user specifically requested

**Screenshot:** [38_last_n_complete_months_claude_3_20260207_170629.png](../qa_screenshots/advanced_tests/38_last_n_complete_months_claude_3_20260207_170629.png)

---

## Appendix: Test Case Definitions

### 31_running_total: Cumulative Running Total

**Complexity:** Complex

**Chart Type:** LineChart

**Features:** cumulative sum, running total, time series

**Request:**
> Show me a line chart of cumulative total revenue over time, where each point shows the running total up to that month

**Validation Criteria:**
- Line chart is displayed
- Values are cumulative (each point >= previous point)
- Shows monotonically increasing trend
- Title indicates cumulative/running total

---

### 33_average_vs_median_comparison: Average vs Median Statistical Comparison

**Complexity:** Complex

**Chart Type:** LineChart

**Features:** statistical comparison, mean, median

**Request:**
> Compare the average and median invoice amounts over the past year - I want to see if there are outliers skewing our averages

**Validation Criteria:**
- Chart shows TWO distinct metrics
- Both average and median are represented
- Time-based x-axis
- Legend distinguishes the two metrics

---

### 38_last_n_complete_months: Last N Complete Months

**Complexity:** Medium

**Chart Type:** BarChart

**Features:** relative time period, complete months

**Request:**
> Show revenue for the last 6 complete months (not including the current partial month)

**Validation Criteria:**
- Bar chart is displayed
- Shows approximately 6 months of data
- Revenue values visible
- Most recent full month included

---
