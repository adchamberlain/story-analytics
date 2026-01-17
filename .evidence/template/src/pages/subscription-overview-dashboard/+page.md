# Subscription Overview Dashboard

A high-level overview of subscription metrics, including active subscriptions, MRR, ARPU, and subscription trends.

```sql active_subscriptions
SELECT COUNT(SUBSCRIPTION_ID) AS active_subscriptions FROM snowflake_saas.subscriptions WHERE CHURN_DATE IS NULL
```

<BigValue data={active_subscriptions} value="active_subscriptions" title="Active Subscriptions" fmt="num0" />

```sql monthly_recurring_revenue
SELECT SUM(MRR) AS total_mrr FROM snowflake_saas.subscriptions WHERE CHURN_DATE IS NULL
```

<BigValue data={monthly_recurring_revenue} value="total_mrr" title="Monthly Recurring Revenue" fmt="usd0" />

```sql average_revenue_per_user
SELECT AVG(MRR) AS arpu FROM snowflake_saas.subscriptions WHERE CHURN_DATE IS NULL
```

<BigValue data={average_revenue_per_user} value="arpu" title="Average Revenue Per User" fmt="usd" />

## Subscription Trends

```sql new_subscriptions_by_month
SELECT STRFTIME(START_DATE, '%Y-%m') AS subscription_month, COUNT(SUBSCRIPTION_ID) AS new_subscriptions FROM snowflake_saas.subscriptions GROUP BY subscription_month ORDER BY subscription_month
```

<LineChart data={new_subscriptions_by_month} x="subscription_month" y="new_subscriptions" title="New Subscriptions by Month" />

## Subscription Distribution

```sql subscription_distribution_by_plan
SELECT PLAN_TIER, COUNT(SUBSCRIPTION_ID) AS subscription_count FROM snowflake_saas.subscriptions GROUP BY PLAN_TIER ORDER BY subscription_count DESC
```

<BarChart data={subscription_distribution_by_plan} x="plan_tier" y="subscription_count" title="Subscription Distribution by Plan" />