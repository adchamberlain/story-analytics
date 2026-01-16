# Bar Chart Test 2

```sql signups_by_month
SELECT 
    DATE_TRUNC('month', signup_date) as month,
    COUNT(*) as new_signups
FROM snowflake_saas.customers
WHERE signup_date IS NOT NULL
GROUP BY DATE_TRUNC('month', signup_date)
ORDER BY month
```

## New Customer Signups Over Time

<BarChart 
    data={signups_by_month} 
    x="month" 
    y="new_signups"
    title="Monthly Customer Signups"
/>

<DataTable data={signups_by_month} />