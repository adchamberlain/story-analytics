# Customer Signups Dashboard

```sql customer_signups_over_time
SELECT 
    DATE_TRUNC('month', signup_date) as signup_month,
    COUNT(*) as new_customers
FROM customers
WHERE signup_date IS NOT NULL
GROUP BY DATE_TRUNC('month', signup_date)
ORDER BY signup_month
```

<LineChart 
    data={customer_signups_over_time} 
    x="signup_month" 
    y="new_customers"
    title="New Customer Signups Over Time"
/>