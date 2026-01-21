# Monthly Recurring Revenue (MRR) Analysis Dashboard

This dashboard provides executive leadership and finance teams with comprehensive insights into recurring revenue performance, tracking key drivers of MRR growth and decline over the past 12 months.

```sql current_total_mrr
SELECT SUM(MRR) as current_total_mrr 
FROM snowflake_saas.subscriptions 
WHERE START_DATE <= CURRENT_DATE 
  AND (CHURN_DATE IS NULL OR CHURN_DATE > CURRENT_DATE)
```

<BigValue data={current_total_mrr} value="current_total_mrr" title="Current Total MRR" fmt="usd0" />

## MRR Performance Trends

```sql mrr_trends_monthly
WITH monthly_snapshots AS (
  SELECT 
    DATE_TRUNC('month', d.month_date) as month,
    SUM(CASE WHEN s.START_DATE <= d.month_date 
             AND (s.CHURN_DATE IS NULL OR s.CHURN_DATE > d.month_date) 
        THEN s.MRR ELSE 0 END) as total_mrr
  FROM (
    SELECT CURRENT_DATE - INTERVAL (seq * 30) DAY as month_date
    FROM generate_series(0, 11) as t(seq)
  ) d
  CROSS JOIN snowflake_saas.subscriptions s
  GROUP BY DATE_TRUNC('month', d.month_date)
)
SELECT month, total_mrr
FROM monthly_snapshots
ORDER BY month
```

<LineChart data={mrr_trends_monthly} x="month" y="total_mrr" title="Total MRR Progression Over Time" />

## MRR Growth Drivers

```sql net_mrr_changes_monthly
WITH new_mrr AS (
  SELECT 
    DATE_TRUNC('month', START_DATE) as month, 
    SUM(MRR) as new_mrr 
  FROM snowflake_saas.subscriptions 
  WHERE START_DATE >= CURRENT_DATE - INTERVAL '12 months' 
  GROUP BY DATE_TRUNC('month', START_DATE)
), 
churned_mrr AS (
  SELECT 
    DATE_TRUNC('month', CHURN_DATE) as month, 
    SUM(MRR) as churned_mrr 
  FROM snowflake_saas.subscriptions 
  WHERE CHURN_DATE IS NOT NULL 
    AND CHURN_DATE >= CURRENT_DATE - INTERVAL '12 months' 
  GROUP BY DATE_TRUNC('month', CHURN_DATE)
), 
all_months AS (
  SELECT DISTINCT month 
  FROM (
    SELECT month FROM new_mrr 
    UNION 
    SELECT month FROM churned_mrr
  ) t
)
SELECT 
  am.month, 
  COALESCE(nm.new_mrr, 0) as new_mrr, 
  COALESCE(cm.churned_mrr, 0) as churned_mrr, 
  COALESCE(nm.new_mrr, 0) - COALESCE(cm.churned_mrr, 0) as net_mrr_change 
FROM all_months am 
LEFT JOIN new_mrr nm ON am.month = nm.month 
LEFT JOIN churned_mrr cm ON am.month = cm.month 
ORDER BY am.month
```

<LineChart data={net_mrr_changes_monthly} x="month" y={["new_mrr", "churned_mrr", "net_mrr_change"]} title="MRR Changes: New vs Churned vs Net" />

## MRR by Plan Type

```sql mrr_by_plan_breakdown
SELECT 
  PLAN_TIER as plan_tier, 
  SUM(MRR) as total_mrr,
  COUNT(*) as subscription_count,
  ROUND(SUM(MRR) / COUNT(*), 2) as avg_mrr_per_subscription
FROM snowflake_saas.subscriptions 
WHERE START_DATE <= CURRENT_DATE 
  AND (CHURN_DATE IS NULL OR CHURN_DATE > CURRENT_DATE)
GROUP BY PLAN_TIER 
ORDER BY total_mrr DESC
```

<BarChart data={mrr_by_plan_breakdown} x="plan_tier" y="total_mrr" title="MRR Contribution by Plan Tier" />

## Plan Performance Details

<DataTable data={mrr_by_plan_breakdown} />