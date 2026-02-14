# Advanced Chart Test Results

**Test Date:** 2026-02-07 16:12:41
**Total Test Cases:** 30
**Providers Tested:** claude
**Max Attempts per Test:** 3

---

## Executive Summary

| Provider | Tests Passed | Tests Failed | Infra Issues | Pass Rate |
|----------|--------------|--------------|--------------|-----------|
| Claude | 0/30 | 30/30 | 0 | ❌ 0% |

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
| 2 | Percentage of Total Calculation | Complex | BarChart | percentage calculation, proportion |
| 3 | Average vs Median Statistical Comparison | Complex | LineChart | statistical comparison, mean |
| 4 | Conditional Count Aggregation | Medium | BarChart | conditional count, filtered aggregation |
| 5 | Ratio Calculation Between Metrics | Complex | LineChart | ratio, derived metric |
| 6 | Year-to-Date Aggregation | Medium | BigValue | YTD, relative time |
| 7 | Month-over-Month Growth Rate | Complex | LineChart | MoM growth, percentage change |
| 8 | Last N Complete Months | Medium | BarChart | relative time period, complete months |
| 9 | Same Period Year Comparison | Complex | BarChart | period comparison, YoY |
| 10 | Trailing Moving Average | Complex | LineChart | moving average, smoothing |
| 11 | Vague Performance Question | Simple | Any | ambiguous, interpretive |
| 12 | Highly Colloquial Request | Simple | Any | informal language, slang |
| 13 | Request with Negation | Medium | BarChart | negation, exclusion |
| 14 | Implicit Comparison Request | Medium | Any | implicit comparison, interpretive |
| 15 | Compound Multi-Part Question | Complex | Any | compound request, multiple aspects |
| 16 | Multiple AND Filter Conditions | Complex | BarChart | multiple filters, AND logic |
| 17 | OR Filter Conditions | Complex | BarChart | OR logic, multiple values |
| 18 | Threshold-Based Filter | Medium | BarChart | threshold, greater than filter |
| 19 | Date Range Plus Category Filter | Complex | LineChart | date range, category filter |
| 20 | Grouped Comparison with Filter | Complex | BarChart | grouping, comparison |
| 21 | Potentially Empty Result Set | Medium | Any | edge case, no data scenario |
| 22 | Large Number Display | Simple | BigValue | formatting, large numbers |
| 23 | Periods with Zero Values | Medium | LineChart | zero values, sparse data |
| 24 | Single Data Point Request | Simple | BigValue | single value, latest only |
| 25 | Unicode and Special Characters | Simple | BarChart | unicode, robustness |
| 26 | Cohort-Style Customer Analysis | Complex | BarChart | cohort, customer lifecycle |
| 27 | Revenue Concentration Analysis | Complex | BarChart | pareto, concentration |
| 28 | Growth Source Breakdown | Complex | BarChart | growth analysis, decomposition |
| 29 | Customer Value Distribution | Medium | BarChart | distribution, bucketing |
| 30 | Churn Rate Trend | Complex | LineChart | churn, rate metric |

---

## Results by Test Case

| Test Case | Claude |
|-----------|----------|
| Cumulative Running Total | ❌ (0/3) |
| Percentage of Total Calculation | ❌ (0/3) |
| Average vs Median Statistical Comparison | ❌ (0/3) |
| Conditional Count Aggregation | ❌ (0/3) |
| Ratio Calculation Between Metrics | ❌ (0/3) |
| Year-to-Date Aggregation | ❌ (0/3) |
| Month-over-Month Growth Rate | ❌ (0/3) |
| Last N Complete Months | ❌ (0/3) |
| Same Period Year Comparison | ❌ (0/3) |
| Trailing Moving Average | ❌ (0/3) |
| Vague Performance Question | ❌ (0/3) |
| Highly Colloquial Request | ❌ (0/3) |
| Request with Negation | ❌ (0/3) |
| Implicit Comparison Request | ❌ (0/3) |
| Compound Multi-Part Question | ❌ (0/3) |
| Multiple AND Filter Conditions | ❌ (0/3) |
| OR Filter Conditions | ❌ (0/3) |
| Threshold-Based Filter | ❌ (0/3) |
| Date Range Plus Category Filter | ❌ (0/3) |
| Grouped Comparison with Filter | ❌ (0/3) |
| Potentially Empty Result Set | ❌ (0/3) |
| Large Number Display | ❌ (0/3) |
| Periods with Zero Values | ❌ (0/3) |
| Single Data Point Request | ❌ (0/3) |
| Unicode and Special Characters | ❌ (0/3) |
| Cohort-Style Customer Analysis | ❌ (0/3) |
| Revenue Concentration Analysis | ❌ (0/3) |
| Growth Source Breakdown | ❌ (0/3) |
| Customer Value Distribution | ❌ (0/3) |
| Churn Rate Trend | ❌ (0/3) |

---

## Detailed Results

### Claude Provider

#### Cumulative Running Total

**Request:** Show me a line chart of cumulative total revenue over time, where each point shows the running total up to that month

**Expected:** LineChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
WITH monthly_revenue AS ( SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) AS month, SUM(oi.PRICE + oi.FREIGHT_VALUE) AS monthly_revenue FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' GROUP BY DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) ) SELECT month, SUM(monthly_revenue) OVER (ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_revenue FROM monthly_revenue ORDER BY month
```

**QA Summary:** The dashboard appears to be completely blank or failed to load, showing no content, charts, or data visualizations.

**Critical Issues:**
- Dashboard is completely blank - no chart is displayed at all
- Missing required line chart visualization
- No data or content visible

**Screenshot:** [31_running_total_claude_3_20260207_144115.png](../qa_screenshots/advanced_tests/31_running_total_claude_3_20260207_144115.png)

---

#### Percentage of Total Calculation

**Request:** Create a bar chart showing each customer segment's percentage share of total revenue

**Expected:** BarChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
WITH state_revenue AS ( SELECT c.CUSTOMER_STATE, SUM(oi.PRICE + oi.FREIGHT_VALUE) as state_revenue FROM olist_ecommerce.customers c JOIN olist_ecommerce.orders o ON c.CUSTOMER_ID = o.CUSTOMER_ID JOIN olist_ecommerce.order_items oi ON o.ORDER_ID = oi.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' GROUP BY c.CUSTOMER_STATE ), total_revenue AS ( SELECT SUM(state_revenue) as total FROM state_revenue ) SELECT sr.CUSTOMER_STATE as customer_state, ROUND(100.0 * sr.state_revenue / tr.total, 2) as revenue_p...
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no visible content or visualizations.

**Critical Issues:**
- No visualization is displayed - the dashboard shows a blank white screen
- Missing required bar chart showing customer segment revenue percentages
- No data or content visible at all

**Screenshot:** [32_percentage_of_total_claude_3_20260207_144430.png](../qa_screenshots/advanced_tests/32_percentage_of_total_claude_3_20260207_144430.png)

---

#### Average vs Median Statistical Comparison

**Request:** Compare the average and median invoice amounts over the past year - I want to see if there are outliers skewing our averages

**Expected:** LineChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) AS month, ROUND(AVG(oi.PRICE + oi.FREIGHT_VALUE), 2) AS avg_invoice_amount, ROUND(MEDIAN(oi.PRICE + oi.FREIGHT_VALUE), 2) AS median_invoice_amount FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_PURCHASE_TIMESTAMP >= '2017-10-01' AND o.ORDER_PURCHASE_TIMESTAMP <= '2018-10-31' AND o.ORDER_STATUS = 'delivered' GROUP BY DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) ORDER BY month
```

**QA Summary:** The dashboard appears to be completely blank or failed to load, showing no visualizations, data, or content whatsoever.

**Critical Issues:**
- Dashboard is completely blank - no chart is visible
- Missing required line chart comparing average and median invoice amounts
- No data visualization present at all

**Screenshot:** [33_average_vs_median_comparison_claude_3_20260207_144739.png](../qa_screenshots/advanced_tests/33_average_vs_median_comparison_claude_3_20260207_144739.png)

---

#### Conditional Count Aggregation

**Request:** Show me the count of paid invoices vs unpaid invoices by month as a bar chart

**Expected:** BarChart | Complexity: Medium

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) AS month, CASE WHEN op.ORDER_ID IS NOT NULL THEN 'paid' ELSE 'unpaid' END AS payment_status, COUNT(DISTINCT o.ORDER_ID) AS invoice_count FROM olist_ecommerce.orders o LEFT JOIN olist_ecommerce.order_payments op ON o.ORDER_ID = op.ORDER_ID WHERE o.ORDER_PURCHASE_TIMESTAMP IS NOT NULL GROUP BY 1, 2 ORDER BY 1
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no content whatsoever.

**Critical Issues:**
- No visualization is displayed - the dashboard shows a completely blank/white screen
- Missing required bar chart that was specifically requested
- No data is visible for paid vs unpaid invoices

**Screenshot:** [34_count_with_condition_claude_3_20260207_145034.png](../qa_screenshots/advanced_tests/34_count_with_condition_claude_3_20260207_145034.png)

---

#### Ratio Calculation Between Metrics

**Request:** Show the ratio of new subscriptions to cancellations each month - values above 1 mean we're growing

**Expected:** LineChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
WITH monthly_metrics AS ( SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) as month, COUNT(CASE WHEN o.ORDER_STATUS = 'delivered' THEN 1 END) as new_subscriptions, COUNT(CASE WHEN o.ORDER_STATUS = 'canceled' THEN 1 END) as cancellations FROM olist_ecommerce.orders o WHERE o.ORDER_PURCHASE_TIMESTAMP >= '2017-10-01' AND o.ORDER_PURCHASE_TIMESTAMP <= '2018-10-31' GROUP BY DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) ) SELECT month, CASE WHEN cancellations > 0 THEN ROUND(CAST(new_subscripti...
```

**QA Summary:** The dashboard appears to be completely blank or failed to load, showing no chart or data visualization whatsoever.

**Critical Issues:**
- Chart is not displayed - the dashboard shows a blank/empty state
- Missing required elements - no line chart showing subscription to cancellation ratios
- No data is visible - cannot validate monthly breakdown, ratio calculations, or any other requirements

**Screenshot:** [35_ratio_between_metrics_claude_3_20260207_145337.png](../qa_screenshots/advanced_tests/35_ratio_between_metrics_claude_3_20260207_145337.png)

---

#### Year-to-Date Aggregation

**Request:** What's our year-to-date revenue? Show it as a big number

**Expected:** BigValue | Complexity: Medium

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT SUM(oi.PRICE + oi.FREIGHT_VALUE) as revenue FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' AND YEAR(o.ORDER_PURCHASE_TIMESTAMP) = 2018
```

**QA Summary:** The dashboard appears to be completely blank or not loading properly, showing no content whatsoever.

**Critical Issues:**
- Dashboard is completely blank - no visualization, data, or content is displayed
- Missing required BigValue chart showing year-to-date revenue
- No revenue data is shown

**Screenshot:** [36_year_to_date_claude_3_20260207_145709.png](../qa_screenshots/advanced_tests/36_year_to_date_claude_3_20260207_145709.png)

---

#### Month-over-Month Growth Rate

**Request:** Show me the month-over-month revenue growth rate as a line chart - I want to see the percentage change each month compared to the previous month

**Expected:** LineChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
WITH monthly_revenue AS ( SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) AS month, SUM(oi.PRICE + oi.FREIGHT_VALUE) AS revenue FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' AND o.ORDER_PURCHASE_TIMESTAMP >= '2017-10-01' AND o.ORDER_PURCHASE_TIMESTAMP <= '2018-10-31' GROUP BY 1 ) SELECT month, revenue, LAG(revenue) OVER (ORDER BY month) AS prev_month_revenue, ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDE...
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no content whatsoever.

**Critical Issues:**
- No visualization is displayed - the dashboard is completely blank
- Missing required line chart showing month-over-month revenue growth rate
- No data, axes, or any chart elements are visible

**Screenshot:** [37_month_over_month_growth_claude_3_20260207_150018.png](../qa_screenshots/advanced_tests/37_month_over_month_growth_claude_3_20260207_150018.png)

---

#### Last N Complete Months

**Request:** Show revenue for the last 6 complete months (not including the current partial month)

**Expected:** BarChart | Complexity: Medium

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) as month, SUM(oi.PRICE + oi.FREIGHT_VALUE) as revenue FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' AND DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) >= '2018-05-01' AND DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) <= '2018-10-01' GROUP BY DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) ORDER BY month
```

**QA Summary:** The dashboard appears to be completely blank or failed to load, showing no content whatsoever.

**Critical Issues:**
- No visualization is displayed - the dashboard is completely blank
- Missing required bar chart that should show revenue data
- No revenue data visible for any time period

**Screenshot:** [38_last_n_complete_months_claude_3_20260207_150322.png](../qa_screenshots/advanced_tests/38_last_n_complete_months_claude_3_20260207_150322.png)

---

#### Same Period Year Comparison

**Request:** Compare our Q4 revenue this year vs Q4 last year as a bar chart

**Expected:** BarChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT CAST(YEAR(o.ORDER_PURCHASE_TIMESTAMP) AS TEXT) || ' Q4' AS year_quarter, SUM(oi.PRICE + oi.FREIGHT_VALUE) AS revenue FROM olist_ecommerce.orders o JOIN olist_ecommerce.order_items oi ON o.ORDER_ID = oi.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' AND EXTRACT(QUARTER FROM o.ORDER_PURCHASE_TIMESTAMP) = 4 AND YEAR(o.ORDER_PURCHASE_TIMESTAMP) IN (2017, 2018) GROUP BY YEAR(o.ORDER_PURCHASE_TIMESTAMP) ORDER BY YEAR(o.ORDER_PURCHASE_TIMESTAMP)
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no content whatsoever.

**Critical Issues:**
- No visualization is displayed - the dashboard is completely blank
- Missing required bar chart comparing Q4 revenue year-over-year
- No data, labels, or any dashboard elements are visible

**Screenshot:** [39_same_period_comparison_claude_3_20260207_150621.png](../qa_screenshots/advanced_tests/39_same_period_comparison_claude_3_20260207_150621.png)

---

#### Trailing Moving Average

**Request:** Show me a 3-month trailing average of monthly revenue to smooth out the variations

**Expected:** LineChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
WITH monthly_revenue AS ( SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) AS month, SUM(oi.PRICE + oi.FREIGHT_VALUE) AS monthly_revenue FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' AND o.ORDER_PURCHASE_TIMESTAMP >= '2017-11-01' AND o.ORDER_PURCHASE_TIMESTAMP <= '2018-10-31' GROUP BY 1 ) SELECT month, AVG(monthly_revenue) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS trailing_3month_avg_...
```

**QA Summary:** The dashboard appears to be completely blank with no visible content, charts, or data displayed.

**Critical Issues:**
- No visualization is displayed - the dashboard is completely blank
- Missing required line chart showing 3-month trailing average of monthly revenue
- No revenue data visible

**Screenshot:** [40_trailing_average_claude_3_20260207_150933.png](../qa_screenshots/advanced_tests/40_trailing_average_claude_3_20260207_150933.png)

---

#### Vague Performance Question

**Request:** How's business doing lately?

**Expected:** Any | Complexity: Simple

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT SUM(oi.PRICE + oi.FREIGHT_VALUE) as total_revenue FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' AND o.ORDER_DELIVERED_CUSTOMER_DATE >= '2018-08-01' AND o.ORDER_DELIVERED_CUSTOMER_DATE <= '2018-10-31'
```

**QA Summary:** The dashboard appears to be completely blank or failed to load, showing no visualizations or data whatsoever.

**Critical Issues:**
- No visualization is displayed - the dashboard is completely empty
- No business-relevant metrics are shown (revenue, customers, or any other data)
- The dashboard fails to fulfill the basic requirement of showing "how business is doing"

**Screenshot:** [41_vague_performance_question_claude_3_20260207_151310.png](../qa_screenshots/advanced_tests/41_vague_performance_question_claude_3_20260207_151310.png)

---

#### Highly Colloquial Request

**Request:** yo whats the deal with our big spenders? who are they?

**Expected:** Any | Complexity: Simple

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
WITH customer_totals AS (SELECT c.CUSTOMER_UNIQUE_ID, SUM(oi.PRICE + oi.FREIGHT_VALUE) as total_revenue FROM olist_ecommerce.customers c JOIN olist_ecommerce.orders o ON c.CUSTOMER_ID = o.CUSTOMER_ID JOIN olist_ecommerce.order_items oi ON o.ORDER_ID = oi.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' GROUP BY c.CUSTOMER_UNIQUE_ID) SELECT CUSTOMER_UNIQUE_ID as customer_unique_id, total_revenue FROM customer_totals ORDER BY total_revenue DESC LIMIT 20
```

**QA Summary:** The dashboard appears to be completely blank or not loading properly, showing no visualization or data content.

**Critical Issues:**
- No visualization is displayed - the dashboard is completely blank
- Missing required elements - user requested information about big spenders/high-value customers but nothing is shown
- Broken visualization - no chart, table, or any data presentation is rendering

**Screenshot:** [42_colloquial_request_claude_3_20260207_151619.png](../qa_screenshots/advanced_tests/42_colloquial_request_claude_3_20260207_151619.png)

---

#### Request with Negation

**Request:** Show me revenue by segment but NOT including the Enterprise segment

**Expected:** BarChart | Complexity: Medium

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT c.CUSTOMER_STATE as customer_segment, SUM(oi.PRICE + oi.FREIGHT_VALUE) as revenue FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID JOIN olist_ecommerce.customers c ON o.CUSTOMER_ID = c.CUSTOMER_ID WHERE o.ORDER_STATUS = 'delivered' AND c.CUSTOMER_STATE != 'Enterprise' GROUP BY c.CUSTOMER_STATE ORDER BY revenue DESC
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no content whatsoever.

**Critical Issues:**
- No visualization is displayed - the dashboard is completely blank
- Missing required bar chart showing revenue by segment
- No data is visible at all

**Screenshot:** [43_negation_handling_claude_3_20260207_151921.png](../qa_screenshots/advanced_tests/43_negation_handling_claude_3_20260207_151921.png)

---

#### Implicit Comparison Request

**Request:** Are our subscription numbers getting better or worse?

**Expected:** Any | Complexity: Medium

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) AS month, COUNT(DISTINCT o.ORDER_ID) AS subscription_count FROM olist_ecommerce.orders o JOIN olist_ecommerce.order_items oi ON o.ORDER_ID = oi.ORDER_ID WHERE o.ORDER_PURCHASE_TIMESTAMP >= '2017-11-01' AND o.ORDER_PURCHASE_TIMESTAMP <= '2018-10-31' GROUP BY DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) ORDER BY month
```

**QA Summary:** The dashboard appears to be completely blank or failed to load, showing no visualization or data content.

**Critical Issues:**
- No visualization is displayed - the dashboard is completely blank
- Missing required elements - user requested subscription trend data but nothing is shown
- Broken visualization - the chart failed to render entirely

**Screenshot:** [44_implicit_comparison_claude_3_20260207_152226.png](../qa_screenshots/advanced_tests/44_implicit_comparison_claude_3_20260207_152226.png)

---

#### Compound Multi-Part Question

**Request:** Can you show me which industries bring in the most revenue and also how many customers we have in each?

**Expected:** Any | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT pct.PRODUCT_CATEGORY_NAME_ENGLISH as product_category_name_english, SUM(oi.PRICE + oi.FREIGHT_VALUE) as total_revenue, COUNT(DISTINCT c.CUSTOMER_UNIQUE_ID) as unique_customers FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.products p ON oi.PRODUCT_ID = p.PRODUCT_ID JOIN olist_ecommerce.product_category_translation pct ON p.PRODUCT_CATEGORY_NAME = pct.PRODUCT_CATEGORY_NAME JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID JOIN olist_ecommerce.customers c ON o.CUSTOMER_ID ...
```

**QA Summary:** The dashboard appears to be completely blank with no visible content, charts, or data displayed.

**Critical Issues:**
- No visualization is displayed - the dashboard is completely blank
- Missing industry breakdown data that was specifically requested
- Missing revenue data that was specifically requested

**Screenshot:** [45_compound_question_claude_3_20260207_152537.png](../qa_screenshots/advanced_tests/45_compound_question_claude_3_20260207_152537.png)

---

#### Multiple AND Filter Conditions

**Request:** Show revenue by month for Enterprise customers in the Technology industry only

**Expected:** BarChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) AS month, SUM(oi.PRICE + oi.FREIGHT_VALUE) AS revenue FROM olist_ecommerce.orders o JOIN olist_ecommerce.order_items oi ON o.ORDER_ID = oi.ORDER_ID JOIN olist_ecommerce.customers c ON o.CUSTOMER_ID = c.CUSTOMER_ID WHERE o.ORDER_STATUS = 'delivered' GROUP BY DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) ORDER BY month
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing only a white/empty screen with no visible content.

**Critical Issues:**
- Dashboard is completely blank - no chart, data, or visualizations are displayed
- Missing required bar chart showing revenue by month
- No data visible for Enterprise customers in Technology industry

**Screenshot:** [46_and_filter_conditions_claude_3_20260207_152846.png](../qa_screenshots/advanced_tests/46_and_filter_conditions_claude_3_20260207_152846.png)

---

#### OR Filter Conditions

**Request:** Show me total revenue for customers in either Healthcare OR Finance industries

**Expected:** BarChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT c.CUSTOMER_STATE as industry, SUM(oi.PRICE + oi.FREIGHT_VALUE) as revenue FROM olist_ecommerce.customers c JOIN olist_ecommerce.orders o ON c.CUSTOMER_ID = o.CUSTOMER_ID JOIN olist_ecommerce.order_items oi ON o.ORDER_ID = oi.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' GROUP BY c.CUSTOMER_STATE ORDER BY revenue DESC
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing only a white/empty screen with no visible content.

**Critical Issues:**
- Chart is not displayed - the dashboard shows a blank/empty screen
- No revenue data is visible
- Missing all required elements (the user requested total revenue for Healthcare OR Finance industries but nothing is shown)

**Screenshot:** [47_or_filter_conditions_claude_3_20260207_153145.png](../qa_screenshots/advanced_tests/47_or_filter_conditions_claude_3_20260207_153145.png)

---

#### Threshold-Based Filter

**Request:** List customers who have spent more than $5000 total

**Expected:** BarChart | Complexity: Medium

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT c.CUSTOMER_UNIQUE_ID as customer_unique_id, SUM(oi.PRICE + oi.FREIGHT_VALUE) as total_spend FROM olist_ecommerce.customers c JOIN olist_ecommerce.orders o ON c.CUSTOMER_ID = o.CUSTOMER_ID JOIN olist_ecommerce.order_items oi ON o.ORDER_ID = oi.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' GROUP BY c.CUSTOMER_UNIQUE_ID HAVING SUM(oi.PRICE + oi.FREIGHT_VALUE) > 5000 ORDER BY total_spend DESC
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no data, visualizations, or content.

**Critical Issues:**
- Dashboard is completely blank with no visible content
- No visualization is displayed (user requested a bar chart)
- No customer data is shown

**Screenshot:** [48_threshold_filter_claude_3_20260207_153529.png](../qa_screenshots/advanced_tests/48_threshold_filter_claude_3_20260207_153529.png)

---

#### Date Range Plus Category Filter

**Request:** Show me monthly subscription trends for just the Pro plan tier over the last 12 months with a date filter

**Expected:** LineChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) AS month, COUNT(DISTINCT o.ORDER_ID) AS subscription_count FROM olist_ecommerce.orders o JOIN olist_ecommerce.order_items oi ON o.ORDER_ID = oi.ORDER_ID JOIN olist_ecommerce.products p ON oi.PRODUCT_ID = p.PRODUCT_ID WHERE o.ORDER_PURCHASE_TIMESTAMP >= '${inputs.date_range.start}' AND o.ORDER_PURCHASE_TIMESTAMP <= '${inputs.date_range.end}' AND p.PRODUCT_CATEGORY_NAME = 'Pro' GROUP BY DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) ORDER BY ...
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no content whatsoever.

**Critical Issues:**
- Dashboard is completely blank - no chart, data, or interface elements are visible
- Missing required line chart visualization
- No subscription data displayed

**Screenshot:** [49_date_range_with_category_claude_3_20260207_153907.png](../qa_screenshots/advanced_tests/49_date_range_with_category_claude_3_20260207_153907.png)

---

#### Grouped Comparison with Filter

**Request:** Compare paid vs unpaid invoice amounts by customer segment, but only for invoices over $100

**Expected:** BarChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT c.CUSTOMER_STATE as customer_segment, CASE WHEN op.PAYMENT_VALUE > 0 THEN 'paid' ELSE 'unpaid' END as payment_status, SUM(op.PAYMENT_VALUE) as invoice_amount FROM olist_ecommerce.order_payments op JOIN olist_ecommerce.orders o ON op.ORDER_ID = o.ORDER_ID JOIN olist_ecommerce.customers c ON o.CUSTOMER_ID = c.CUSTOMER_ID WHERE op.PAYMENT_VALUE > 100 GROUP BY c.CUSTOMER_STATE, CASE WHEN op.PAYMENT_VALUE > 0 THEN 'paid' ELSE 'unpaid' END ORDER BY c.CUSTOMER_STATE, payment_status
```

**QA Summary:** The dashboard appears to be completely blank or failed to load, showing no content, charts, or data visualizations.

**Critical Issues:**
- Dashboard is completely blank - no chart is displayed when a bar chart was requested
- No paid/unpaid invoice comparison is visible
- No customer segments are shown

**Screenshot:** [50_grouped_comparison_filter_claude_3_20260207_154222.png](../qa_screenshots/advanced_tests/50_grouped_comparison_filter_claude_3_20260207_154222.png)

---

#### Potentially Empty Result Set

**Request:** Show me all cancelled subscriptions from yesterday

**Expected:** Any | Complexity: Medium

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT o.ORDER_ID as order_id, c.CUSTOMER_UNIQUE_ID as customer_id, c.CUSTOMER_STATE as customer_state, o.ORDER_PURCHASE_TIMESTAMP as order_date, o.ORDER_STATUS as status FROM olist_ecommerce.orders o JOIN olist_ecommerce.customers c ON o.CUSTOMER_ID = c.CUSTOMER_ID WHERE o.ORDER_STATUS = 'canceled' AND DATE(o.ORDER_PURCHASE_TIMESTAMP) = '2018-10-16' ORDER BY o.ORDER_PURCHASE_TIMESTAMP DESC
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no content, data, or interface elements.

**Critical Issues:**
- Dashboard is completely blank with no visible content, charts, or data
- No indication of what was searched for (cancelled subscriptions from yesterday)
- No graceful handling of the data request - appears to be a complete failure to load or render

**Screenshot:** [51_empty_result_handling_claude_3_20260207_154606.png](../qa_screenshots/advanced_tests/51_empty_result_handling_claude_3_20260207_154606.png)

---

#### Large Number Display

**Request:** What's the total sum of all invoice amounts ever? Show as a big number with proper formatting

**Expected:** BigValue | Complexity: Simple

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT SUM(oi.PRICE + oi.FREIGHT_VALUE) as total_invoice_amount FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_STATUS = 'delivered'
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing only a white/empty screen with no visible content.

**Critical Issues:**
- Dashboard is not displaying any content - completely blank screen
- Missing the required BigValue visualization showing total invoice amounts
- No data or numbers are visible at all

**Screenshot:** [52_large_number_formatting_claude_3_20260207_154935.png](../qa_screenshots/advanced_tests/52_large_number_formatting_claude_3_20260207_154935.png)

---

#### Periods with Zero Values

**Request:** Show cancelled subscriptions by month - there might be months with zero cancellations

**Expected:** LineChart | Complexity: Medium

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
WITH months AS (SELECT UNNEST(GENERATE_SERIES(DATE '2016-09-01', DATE '2018-10-31', INTERVAL '1 month'))::DATE AS month), cancelled_orders AS (SELECT DATE_TRUNC('month', ORDER_PURCHASE_TIMESTAMP) AS order_month, COUNT(*) AS cancelled_count FROM olist_ecommerce.orders WHERE ORDER_STATUS = 'canceled' GROUP BY DATE_TRUNC('month', ORDER_PURCHASE_TIMESTAMP)) SELECT m.month, COALESCE(co.cancelled_count, 0) AS cancelled_subscriptions FROM months m LEFT JOIN cancelled_orders co ON m.month = co.order_mon...
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no chart or data visualization whatsoever.

**Critical Issues:**
- Chart is not displayed - the dashboard shows a blank/empty screen
- No visualization is rendered despite the request for a line chart showing cancelled subscriptions by month
- Missing required elements - no chart, no data, no labels, no axes are visible

**Screenshot:** [53_zero_handling_claude_3_20260207_155239.png](../qa_screenshots/advanced_tests/53_zero_handling_claude_3_20260207_155239.png)

---

#### Single Data Point Request

**Request:** Just show me this month's revenue, nothing else

**Expected:** BigValue | Complexity: Simple

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT SUM(oi.PRICE + oi.FREIGHT_VALUE) as revenue FROM olist_ecommerce.order_items oi JOIN olist_ecommerce.orders o ON oi.ORDER_ID = o.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' AND DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) = DATE_TRUNC('month', '2018-10-01'::DATE)
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no content whatsoever.

**Critical Issues:**
- Dashboard is completely blank - no visualization, data, or content is displayed
- Missing required element: user requested "this month's revenue" but nothing is shown
- Broken visualization: the dashboard appears to have failed to render any content

**Screenshot:** [54_single_value_chart_claude_3_20260207_155607.png](../qa_screenshots/advanced_tests/54_single_value_chart_claude_3_20260207_155607.png)

---

#### Unicode and Special Characters

**Request:** Show revenue by segment — I want to see the breakdown please ??

**Expected:** BarChart | Complexity: Simple

**Result:** ❌ FAILED (0/3 attempts)

**Error:** [PIPELINE] 'utf-8' codec can't encode characters in position 116-117: surrogates not allowed

---

#### Cohort-Style Customer Analysis

**Request:** Show me average revenue per customer grouped by the month they became a customer

**Expected:** BarChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
WITH customer_acquisition AS (SELECT c.CUSTOMER_UNIQUE_ID, DATE_TRUNC('month', MIN(o.ORDER_PURCHASE_TIMESTAMP)) as acquisition_month FROM olist_ecommerce.customers c JOIN olist_ecommerce.orders o ON c.CUSTOMER_ID = o.CUSTOMER_ID WHERE o.ORDER_STATUS = 'delivered' GROUP BY c.CUSTOMER_UNIQUE_ID), customer_revenue AS (SELECT c.CUSTOMER_UNIQUE_ID, SUM(oi.PRICE + oi.FREIGHT_VALUE) as total_revenue FROM olist_ecommerce.customers c JOIN olist_ecommerce.orders o ON c.CUSTOMER_ID = o.CUSTOMER_ID JOIN oli...
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no chart, data, or visualizations whatsoever.

**Critical Issues:**
- No chart is displayed - the dashboard shows a blank white screen
- Missing all required elements: no customer cohorts/signup months visible, no revenue per customer metrics, no data periods shown
- The visualization is completely broken/not rendering

**Screenshot:** [56_cohort_style_analysis_claude_3_20260207_155913.png](../qa_screenshots/advanced_tests/56_cohort_style_analysis_claude_3_20260207_155913.png)

---

#### Revenue Concentration Analysis

**Request:** What percentage of our revenue comes from our top 20% of customers?

**Expected:** BarChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
WITH customer_revenue AS (SELECT c.CUSTOMER_UNIQUE_ID, SUM(oi.PRICE + oi.FREIGHT_VALUE) AS total_revenue FROM olist_ecommerce.customers c JOIN olist_ecommerce.orders o ON c.CUSTOMER_ID = o.CUSTOMER_ID JOIN olist_ecommerce.order_items oi ON o.ORDER_ID = oi.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' GROUP BY c.CUSTOMER_UNIQUE_ID), ranked_customers AS (SELECT *, NTILE(5) OVER (ORDER BY total_revenue DESC) AS quintile FROM customer_revenue), total_revenue_calc AS (SELECT SUM(total_revenue) AS overa...
```

**QA Summary:** The dashboard appears to be completely blank or failed to load, showing no visualizations, data, or content whatsoever.

**Critical Issues:**
- Dashboard is completely blank with no visible content, charts, or data
- Missing required visualization addressing customer revenue concentration
- No chart or analysis showing what percentage of revenue comes from top 20% of customers

**Screenshot:** [57_concentration_analysis_claude_3_20260207_160235.png](../qa_screenshots/advanced_tests/57_concentration_analysis_claude_3_20260207_160235.png)

---

#### Growth Source Breakdown

**Request:** Break down our revenue growth by customer segment - which segments are driving growth?

**Expected:** BarChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
SELECT c.CUSTOMER_STATE as customer_state, SUM(oi.PRICE + oi.FREIGHT_VALUE) as revenue FROM olist_ecommerce.customers c JOIN olist_ecommerce.orders o ON c.CUSTOMER_ID = o.CUSTOMER_ID JOIN olist_ecommerce.order_items oi ON o.ORDER_ID = oi.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' AND o.ORDER_PURCHASE_TIMESTAMP >= '2017-10-01' AND o.ORDER_PURCHASE_TIMESTAMP <= '2018-10-31' GROUP BY c.CUSTOMER_STATE ORDER BY revenue DESC
```

**QA Summary:** The dashboard appears to be completely blank or failed to load, showing no content, charts, or data visualizations.

**Critical Issues:**
- Dashboard is completely blank with no visible content
- No chart or visualization is displayed
- Missing all required elements (revenue data, customer segments, growth context, bar chart)

**Screenshot:** [58_growth_decomposition_claude_3_20260207_160541.png](../qa_screenshots/advanced_tests/58_growth_decomposition_claude_3_20260207_160541.png)

---

#### Customer Value Distribution

**Request:** Show me a distribution of customers by their total lifetime spending - bucket them into ranges like $0-1000, $1000-5000, $5000+

**Expected:** BarChart | Complexity: Medium

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
WITH customer_totals AS (SELECT c.CUSTOMER_UNIQUE_ID, COALESCE(SUM(oi.PRICE + oi.FREIGHT_VALUE), 0) as total_spend FROM olist_ecommerce.customers c LEFT JOIN olist_ecommerce.orders o ON c.CUSTOMER_ID = o.CUSTOMER_ID LEFT JOIN olist_ecommerce.order_items oi ON o.ORDER_ID = oi.ORDER_ID WHERE o.ORDER_STATUS = 'delivered' OR o.ORDER_STATUS IS NULL GROUP BY c.CUSTOMER_UNIQUE_ID) SELECT CASE WHEN total_spend = 0 THEN '$0' WHEN total_spend < 100 THEN '$1-100' WHEN total_spend < 300 THEN '$100-300' WHEN...
```

**QA Summary:** The dashboard appears to be completely blank or not loading, showing no visualizations, data, or content.

**Critical Issues:**
- Missing required elements: No bar chart or histogram is displayed
- Broken visualizations: No chart is rendering at all
- Missing data: No customer distribution data is shown

**Screenshot:** [59_customer_value_distribution_claude_3_20260207_160849.png](../qa_screenshots/advanced_tests/59_customer_value_distribution_claude_3_20260207_160849.png)

---

#### Churn Rate Trend

**Request:** Show me our subscription churn rate trend over the past year - cancellations divided by total active subscriptions each month

**Expected:** LineChart | Complexity: Complex

**Result:** ❌ FAILED (0/3 attempts)

**SQL Query:**
```sql
WITH monthly_spine AS (SELECT DATE_TRUNC('month', ORDER_PURCHASE_TIMESTAMP) AS month FROM olist_ecommerce.orders WHERE ORDER_PURCHASE_TIMESTAMP >= '2017-01-01' AND ORDER_PURCHASE_TIMESTAMP <= '2018-10-31' GROUP BY 1), active_subscriptions AS (SELECT m.month, COUNT(DISTINCT o.CUSTOMER_ID) AS active_count FROM monthly_spine m JOIN olist_ecommerce.orders o ON DATE_TRUNC('month', o.ORDER_PURCHASE_TIMESTAMP) <= m.month JOIN olist_ecommerce.customers c ON o.CUSTOMER_ID = c.CUSTOMER_ID WHERE o.ORDER_ST...
```

**QA Summary:** The dashboard appears to be completely blank or failed to load, showing no content whatsoever.

**Critical Issues:**
- Dashboard is completely blank with no visible content, charts, or data
- Missing required line chart visualization
- No churn rate data displayed

**Screenshot:** [60_churn_indicator_claude_3_20260207_161202.png](../qa_screenshots/advanced_tests/60_churn_indicator_claude_3_20260207_161202.png)

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

### 32_percentage_of_total: Percentage of Total Calculation

**Complexity:** Complex

**Chart Type:** BarChart

**Features:** percentage calculation, proportion

**Request:**
> Create a bar chart showing each customer segment's percentage share of total revenue

**Validation Criteria:**
- Bar chart is displayed
- Shows percentages (values roughly sum to 100%)
- Customer segments visible
- Values appear as percentages or proportions

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

### 34_count_with_condition: Conditional Count Aggregation

**Complexity:** Medium

**Chart Type:** BarChart

**Features:** conditional count, filtered aggregation

**Request:**
> Show me the count of paid invoices vs unpaid invoices by month as a bar chart

**Validation Criteria:**
- Bar chart is displayed
- Shows distinction between paid and unpaid
- Monthly grouping visible
- Two categories or colors represented

---

### 35_ratio_between_metrics: Ratio Calculation Between Metrics

**Complexity:** Complex

**Chart Type:** LineChart

**Features:** ratio, derived metric

**Request:**
> Show the ratio of new subscriptions to cancellations each month - values above 1 mean we're growing

**Validation Criteria:**
- Chart is displayed
- Shows ratio values (likely between 0-5 range)
- Monthly breakdown
- Values are ratios (not raw counts)

---

### 36_year_to_date: Year-to-Date Aggregation

**Complexity:** Medium

**Chart Type:** BigValue

**Features:** YTD, relative time

**Request:**
> What's our year-to-date revenue? Show it as a big number

**Validation Criteria:**
- Large number is displayed
- Shows revenue value
- Represents current year's data
- Has appropriate label

---

### 37_month_over_month_growth: Month-over-Month Growth Rate

**Complexity:** Complex

**Chart Type:** LineChart

**Features:** MoM growth, percentage change

**Request:**
> Show me the month-over-month revenue growth rate as a line chart - I want to see the percentage change each month compared to the previous month

**Validation Criteria:**
- Line chart is displayed
- Shows percentage or rate values
- Values can be positive or negative
- Monthly x-axis

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

### 39_same_period_comparison: Same Period Year Comparison

**Complexity:** Complex

**Chart Type:** BarChart

**Features:** period comparison, YoY

**Request:**
> Compare our Q4 revenue this year vs Q4 last year as a bar chart

**Validation Criteria:**
- Bar chart is displayed
- Shows comparison between two periods
- Q4 or quarterly context visible
- Two distinct time periods represented

---

### 40_trailing_average: Trailing Moving Average

**Complexity:** Complex

**Chart Type:** LineChart

**Features:** moving average, smoothing

**Request:**
> Show me a 3-month trailing average of monthly revenue to smooth out the variations

**Validation Criteria:**
- Line chart is displayed
- Line appears smoother than raw data would
- Revenue context visible
- Time-based x-axis

---

### 41_vague_performance_question: Vague Performance Question

**Complexity:** Simple

**Chart Type:** Any

**Features:** ambiguous, interpretive

**Request:**
> How's business doing lately?

**Validation Criteria:**
- Some visualization is displayed
- Shows business-relevant metric (revenue, customers, or similar)
- Interpretation is reasonable for 'business performance'

---

### 42_colloquial_request: Highly Colloquial Request

**Complexity:** Simple

**Chart Type:** Any

**Features:** informal language, slang

**Request:**
> yo whats the deal with our big spenders? who are they?

**Validation Criteria:**
- A visualization is displayed
- Shows customer or revenue data
- Identifies high-value customers in some way

---

### 43_negation_handling: Request with Negation

**Complexity:** Medium

**Chart Type:** BarChart

**Features:** negation, exclusion

**Request:**
> Show me revenue by segment but NOT including the Enterprise segment

**Validation Criteria:**
- Bar chart is displayed
- Shows customer segments
- Enterprise segment should be absent or filtered out
- Other segments visible

---

### 44_implicit_comparison: Implicit Comparison Request

**Complexity:** Medium

**Chart Type:** Any

**Features:** implicit comparison, interpretive

**Request:**
> Are our subscription numbers getting better or worse?

**Validation Criteria:**
- A visualization is displayed
- Shows subscription data over time
- Trend is visible (upward or downward)
- Enables answering the better/worse question

---

### 45_compound_question: Compound Multi-Part Question

**Complexity:** Complex

**Chart Type:** Any

**Features:** compound request, multiple aspects

**Request:**
> Can you show me which industries bring in the most revenue and also how many customers we have in each?

**Validation Criteria:**
- A visualization is displayed
- Shows industry breakdown
- Revenue data is present
- Customer count may also be shown (bonus)

---

### 46_and_filter_conditions: Multiple AND Filter Conditions

**Complexity:** Complex

**Chart Type:** BarChart

**Features:** multiple filters, AND logic

**Request:**
> Show revenue by month for Enterprise customers in the Technology industry only

**Validation Criteria:**
- Bar chart is displayed
- Shows monthly revenue
- Data appears filtered (subset of total)
- Context indicates Enterprise and/or Technology filter

---

### 47_or_filter_conditions: OR Filter Conditions

**Complexity:** Complex

**Chart Type:** BarChart

**Features:** OR logic, multiple values

**Request:**
> Show me total revenue for customers in either Healthcare OR Finance industries

**Validation Criteria:**
- Chart is displayed
- Shows revenue data
- Appears to include both industries
- May show combined total or breakdown

---

### 48_threshold_filter: Threshold-Based Filter

**Complexity:** Medium

**Chart Type:** BarChart

**Features:** threshold, greater than filter

**Request:**
> List customers who have spent more than $5000 total

**Validation Criteria:**
- Visualization shows customer data
- Customers appear to be high-value
- Revenue or spending amounts visible
- Appears to be filtered subset

---

### 49_date_range_with_category: Date Range Plus Category Filter

**Complexity:** Complex

**Chart Type:** LineChart

**Features:** date range, category filter, combined

**Request:**
> Show me monthly subscription trends for just the Pro plan tier over the last 12 months with a date filter

**Validation Criteria:**
- Line chart is displayed
- Shows subscription data
- Date filter is present
- Appears filtered to specific plan tier

---

### 50_grouped_comparison_filter: Grouped Comparison with Filter

**Complexity:** Complex

**Chart Type:** BarChart

**Features:** grouping, comparison, filter

**Request:**
> Compare paid vs unpaid invoice amounts by customer segment, but only for invoices over $100

**Validation Criteria:**
- Bar chart is displayed
- Shows paid/unpaid distinction
- Customer segments visible
- Appears to show filtered data

---

### 51_empty_result_handling: Potentially Empty Result Set

**Complexity:** Medium

**Chart Type:** Any

**Features:** edge case, no data scenario

**Request:**
> Show me all cancelled subscriptions from yesterday

**Validation Criteria:**
- Either shows data or gracefully handles no data
- No error or crash
- Clear indication of what was searched for

---

### 52_large_number_formatting: Large Number Display

**Complexity:** Simple

**Chart Type:** BigValue

**Features:** formatting, large numbers

**Request:**
> What's the total sum of all invoice amounts ever? Show as a big number with proper formatting

**Validation Criteria:**
- Large number displayed
- Number is formatted (K, M, or comma-separated)
- Readable format

---

### 53_zero_handling: Periods with Zero Values

**Complexity:** Medium

**Chart Type:** LineChart

**Features:** zero values, sparse data

**Request:**
> Show cancelled subscriptions by month - there might be months with zero cancellations

**Validation Criteria:**
- Chart is displayed
- Monthly breakdown visible
- Handles months with zero or low values
- No gaps or errors for zero-value periods

---

### 54_single_value_chart: Single Data Point Request

**Complexity:** Simple

**Chart Type:** BigValue

**Features:** single value, latest only

**Request:**
> Just show me this month's revenue, nothing else

**Validation Criteria:**
- Single value displayed (not a trend chart)
- Shows revenue
- Current month context

---

### 55_unicode_tolerance: Unicode and Special Characters

**Complexity:** Simple

**Chart Type:** BarChart

**Features:** unicode, robustness

**Request:**
> Show revenue by segment — I want to see the breakdown please ??

**Validation Criteria:**
- Chart displays despite unicode characters in request
- Shows revenue by segment
- No parsing errors

---

### 56_cohort_style_analysis: Cohort-Style Customer Analysis

**Complexity:** Complex

**Chart Type:** BarChart

**Features:** cohort, customer lifecycle

**Request:**
> Show me average revenue per customer grouped by the month they became a customer

**Validation Criteria:**
- Chart is displayed
- Shows customer cohorts or signup months
- Revenue per customer metric visible
- Multiple cohort periods shown

---

### 57_concentration_analysis: Revenue Concentration Analysis

**Complexity:** Complex

**Chart Type:** BarChart

**Features:** pareto, concentration

**Request:**
> What percentage of our revenue comes from our top 20% of customers?

**Validation Criteria:**
- Some visualization addressing concentration
- Shows customer revenue distribution
- May show percentage or pareto-style analysis

---

### 58_growth_decomposition: Growth Source Breakdown

**Complexity:** Complex

**Chart Type:** BarChart

**Features:** growth analysis, decomposition

**Request:**
> Break down our revenue growth by customer segment - which segments are driving growth?

**Validation Criteria:**
- Chart shows revenue by segment
- Growth or trend context visible
- Multiple segments compared
- Allows identifying growth drivers

---

### 59_customer_value_distribution: Customer Value Distribution

**Complexity:** Medium

**Chart Type:** BarChart

**Features:** distribution, bucketing

**Request:**
> Show me a distribution of customers by their total lifetime spending - bucket them into ranges like $0-1000, $1000-5000, $5000+

**Validation Criteria:**
- Bar chart or histogram displayed
- Shows customer counts
- Spending buckets or ranges visible
- Distribution pattern visible

---

### 60_churn_indicator: Churn Rate Trend

**Complexity:** Complex

**Chart Type:** LineChart

**Features:** churn, rate metric

**Request:**
> Show me our subscription churn rate trend over the past year - cancellations divided by total active subscriptions each month

**Validation Criteria:**
- Line chart is displayed
- Shows rate or percentage values
- Monthly breakdown
- Values appear as ratios (small decimals or percentages)

---
