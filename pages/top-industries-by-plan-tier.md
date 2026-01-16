# Customer Signups Over Time

```sql signups_by_month
SELECT 
    DATE_TRUNC('month', signup_date) as signup_month,
    COUNT(*) as new_customers
FROM customers
WHERE signup_date IS NOT NULL
GROUP BY DATE_TRUNC('month', signup_date)
ORDER BY signup_month
```

```sql signups_by_week
SELECT 
    DATE_TRUNC('week', signup_date) as signup_week,
    COUNT(*) as new_customers
FROM customers
WHERE signup_date IS NOT NULL
GROUP BY DATE_TRUNC('week', signup_date)
ORDER BY signup_week
```

```sql total_signups
SELECT 
    COUNT(*) as total_customers,
    MIN(signup_date) as first_signup,
    MAX(signup_date) as latest_signup
FROM customers
WHERE signup_date IS NOT NULL
```

## Overview
Track customer acquisition trends to understand growth patterns and identify seasonal variations in signups.

<DataTable data={total_signups} />

## Monthly Signup Trends

<LineChart 
    data={signups_by_month} 
    x="signup_month" 
    y="new_customers"
    title="New Customer Signups by Month"
/>

## Weekly Signup Trends

<LineChart 
    data={signups_by_week} 
    x="signup_week" 
    y="new_customers"
    title="New Customer Signups by Week"
/>

## Signup Data

<DataTable 
    data={signups_by_month}
    columns={[
        {id: "signup_month", title: "Month"},
        {id: "new_customers", title: "New Customers"}
    ]}
/>