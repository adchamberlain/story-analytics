# SaaS Dashboard

```sql customers
SELECT * FROM snowflake_saas.customers
LIMIT 10
```

## Customer Preview

<DataTable data={customers} />

## Customers by Industry

```sql industry_breakdown
SELECT
    industry,
    COUNT(*) as customer_count,
    AVG(employee_count) as avg_employees
FROM snowflake_saas.customers
GROUP BY industry
ORDER BY customer_count DESC
```

<BarChart
    data={industry_breakdown}
    x="industry"
    y="customer_count"
    title="Customers by Industry"
/>

## Customers by Plan Tier

```sql plan_breakdown
SELECT
    plan_tier,
    COUNT(*) as customer_count
FROM snowflake_saas.customers
GROUP BY plan_tier
ORDER BY customer_count DESC
```

<BarChart
    data={plan_breakdown}
    x="plan_tier"
    y="customer_count"
    title="Customers by Plan"
/>
