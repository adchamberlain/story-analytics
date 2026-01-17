# Subscription Overview Dashboard

This dashboard provides an overview of subscription growth and revenue, broken down by plan tier and time period. It helps Sales, Marketing, and Finance teams understand key subscription metrics.

```sql total_active_subscriptions
SELECT COUNT(SUBSCRIPTION_ID) AS total_active_subscriptions FROM snowflake_saas.subscriptions WHERE CHURN_DATE IS NULL
```

<BigValue data={total_active_subscriptions} value="total_active_subscriptions" title="Total Active Subscriptions" fmt="num0" />

## Subscription Growth Trends

```sql new_subscriptions_by_month
SELECT STRFTIME(START_DATE, '%Y-%m') AS month, COUNT(SUBSCRIPTION_ID) AS new_subscriptions FROM snowflake_saas.subscriptions WHERE START_DATE >= DATE(DATE('now'), '-12 months') GROUP BY month ORDER BY month
```

<LineChart data={new_subscriptions_by_month} x="month" y="new_subscriptions" title="New Subscriptions Over Time" />

```sql mrr_trend_by_month
SELECT STRFTIME(START_DATE, '%Y-%m') AS month, SUM(MRR) AS total_mrr FROM snowflake_saas.subscriptions WHERE START_DATE >= DATE(DATE('now'), '-12 months') AND CHURN_DATE IS NULL GROUP BY month ORDER BY month
```

<LineChart data={mrr_trend_by_month} x="month" y="total_mrr" title="Monthly Recurring Revenue (MRR) Trend" />

## Revenue and Subscription Breakdown

```sql arpu_by_plan_tier
SELECT PLAN_TIER, AVG(MRR) AS average_revenue_per_user FROM snowflake_saas.subscriptions WHERE CHURN_DATE IS NULL GROUP BY PLAN_TIER ORDER BY average_revenue_per_user DESC
```

<BarChart data={arpu_by_plan_tier} x="plan_tier" y="average_revenue_per_user" title="Average Revenue Per User (ARPU) by Plan Tier" />

```sql subscription_distribution_by_plan_tier
SELECT PLAN_TIER, COUNT(SUBSCRIPTION_ID) AS subscription_count FROM snowflake_saas.subscriptions GROUP BY PLAN_TIER ORDER BY subscription_count DESC
```

<BarChart data={subscription_distribution_by_plan_tier} x="plan_tier" y="subscription_count" title="Subscription Distribution by Plan Tier" />