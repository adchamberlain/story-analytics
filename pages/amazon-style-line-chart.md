# Amazon-style line chart

```sql customer_signups_yoy
WITH monthly_signups AS (
  SELECT 
    DATE_TRUNC('month', signup_date) as signup_month,
    EXTRACT(year FROM signup_date) as signup_year,
    EXTRACT(month FROM signup_date) as month_num,
    COUNT(*) as new_customers
  FROM customers 
  WHERE signup_date >= '2024-01-01' 
    AND signup_date < '2026-01-01'
  GROUP BY 1, 2, 3
),
formatted_data AS (
  SELECT 
    signup_month,
    month_num,
    MONTHNAME(signup_month) as month_name,
    signup_year,
    new_customers
  FROM monthly_signups
)
SELECT 
  month_num,
  month_name,
  SUM(CASE WHEN signup_year = 2024 THEN new_customers ELSE 0 END) as signups_2024,
  SUM(CASE WHEN signup_year = 2025 THEN new_customers ELSE 0 END) as signups_2025
FROM formatted_data
GROUP BY month_num, month_name
ORDER BY month_num
```

This dashboard compares new customer signups between 2024 and 2025, showing monthly trends to help identify growth patterns and seasonal variations.

<LineChart
  data={customer_signups_yoy}
  x="month_name"
  y={["signups_2024", "signups_2025"]}
  title="New Customer Signups by Month"
  subtitle="Comparing 2024 vs 2025 performance"
/>

## Key Insights

<DataTable data={customer_signups_yoy} />

This visualization makes it easy to spot:
- **Growth trends**: Whether 2025 is outperforming 2024
- **Seasonal patterns**: Which months typically see higher signup activity
- **Performance gaps**: Specific months where there are significant differences between years

The line chart format allows you to quickly identify trends and compare performance at a glance, while the data table below provides exact numbers for deeper analysis.