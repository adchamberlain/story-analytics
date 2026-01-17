# MRR Analysis Dashboard

This dashboard provides insights into Monthly Recurring Revenue (MRR) trends and the factors influencing its changes. It helps the finance team and executive leadership understand the company's revenue performance.

<BigValue data={monthly_mrr} value="total_mrr" title="Total MRR" />

## MRR Trends

```sql monthly_mrr
SELECT STRFTIME(start_date, '%Y-%m') AS month, SUM(mrr) AS total_mrr FROM snowflake_saas.subscriptions GROUP BY 1 ORDER BY 1
```

<LineChart data={monthly_mrr} x="month" y="total_mrr" title="Monthly MRR Trend" />

## MRR by Plan Tier

```sql mrr_by_plan
SELECT plan_tier, SUM(mrr) AS total_mrr FROM snowflake_saas.subscriptions GROUP BY 1 ORDER BY 2 DESC
```

<BarChart data={mrr_by_plan} x="plan_tier" y="total_mrr" title="MRR by Plan Tier" />

## Net MRR Change

```sql net_mrr_change
WITH new_mrr AS (SELECT STRFTIME(start_date, '%Y-%m') AS month, SUM(mrr) AS new_mrr FROM snowflake_saas.subscriptions WHERE start_date >= DATE_TRUNC('month', start_date) GROUP BY 1), churned_mrr AS (SELECT STRFTIME(churn_date, '%Y-%m') AS month, SUM(mrr) AS churned_mrr FROM snowflake_saas.subscriptions WHERE churn_date IS NOT NULL GROUP BY 1) SELECT COALESCE(new_mrr.month, churned_mrr.month) AS month, COALESCE(new_mrr.new_mrr, 0) - COALESCE(churned_mrr.churned_mrr, 0) AS net_mrr_change FROM new_mrr FULL OUTER JOIN churned_mrr ON new_mrr.month = churned_mrr.month ORDER BY 1
```

<LineChart data={net_mrr_change} x="month" y="net_mrr_change" title="Net MRR Change Over Time" />

## New MRR

```sql new_mrr
SELECT STRFTIME(start_date, '%Y-%m') AS month, SUM(mrr) AS new_mrr FROM snowflake_saas.subscriptions WHERE start_date >= DATE_TRUNC('month', start_date) GROUP BY 1 ORDER BY 1
```

## Churned MRR

```sql churned_mrr
SELECT STRFTIME(churn_date, '%Y-%m') AS month, SUM(mrr) AS churned_mrr FROM snowflake_saas.subscriptions WHERE churn_date IS NOT NULL GROUP BY 1 ORDER BY 1
```