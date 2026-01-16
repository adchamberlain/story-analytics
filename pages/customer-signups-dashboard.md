# Customer Signups Dashboard

```sql signups_by_month
SELECT
    DATE_TRUNC('month', signup_date) as signup_month,
    COUNT(*) as signups
FROM snowflake_saas.customers
WHERE signup_date IS NOT NULL
ORDER BY signup_month
```

## Monthly Customer Signups

<BarChart
    data={signups_by_month}
    x="signup_month"
    y="signups"
    title="Customer Signups by Month"
/>

## Detailed Signup Data

<DataTable data={signups_by_month} />