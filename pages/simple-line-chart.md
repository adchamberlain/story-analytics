# Simple Line Chart

## Customer Signups by Month (2025)

```sql signups_by_month
SELECT 
    DATE_TRUNC('month', signup_date) as month,
    COUNT(*) as signups
FROM customers
WHERE YEAR(signup_date) = 2025
GROUP BY DATE_TRUNC('month', signup_date)
ORDER BY month
```

```sql total_signups_2025
SELECT 
    COUNT(*) as total_signups
FROM customers
WHERE YEAR(signup_date) = 2025
```

<BarChart 
    data={signups_by_month} 
    x="month" 
    y="signups"
    title="Customer Signups by Month (2025)"
    subtitle="Monthly customer acquisition trends"
/>

## Key Insights

<BigValue 
    data={total_signups_2025} 
    value="total_signups"
    title="Total Signups in 2025"
/>

## Monthly Signup Details

<DataTable data={signups_by_month} />