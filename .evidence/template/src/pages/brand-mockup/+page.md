# Story Analytics Brand Mockup

This dashboard demonstrates the new Datawrapper-minimal design system with Inter typography and refined Story blue palette.

---

## Key Metrics

```sql monthly_revenue
SELECT
    'January' as month, 125000 as revenue, 95000 as target UNION ALL
SELECT 'February', 142000, 100000 UNION ALL
SELECT 'March', 138000, 105000 UNION ALL
SELECT 'April', 156000, 110000 UNION ALL
SELECT 'May', 171000, 115000 UNION ALL
SELECT 'June', 189000, 120000
```

```sql kpis
SELECT
    189000 as total_revenue,
    2847 as active_users,
    0.073 as conversion_rate,
    42 as avg_session_min
```

<BigValue
    data={kpis}
    value="total_revenue"
    title="Monthly Revenue"
    fmt="usd0"
/>

<BigValue
    data={kpis}
    value="active_users"
    title="Active Users"
    fmt="num0"
/>

<BigValue
    data={kpis}
    value="conversion_rate"
    title="Conversion Rate"
    fmt="pct1"
/>

<BigValue
    data={kpis}
    value="avg_session_min"
    title="Avg Session"
    fmt="num0"
/>

---

## Revenue Trend

Monthly revenue performance vs target for H1 2024.

<LineChart
    data={monthly_revenue}
    x="month"
    y={["revenue", "target"]}
    title="Monthly Revenue vs Target"
/>

---

## Revenue by Category

```sql category_revenue
SELECT 'Enterprise' as category, 89000 as revenue UNION ALL
SELECT 'Professional', 52000 UNION ALL
SELECT 'Starter', 31000 UNION ALL
SELECT 'Free Trial', 17000
```

<BarChart
    data={category_revenue}
    x="category"
    y="revenue"
    title="Revenue by Plan Type"
/>

---

## Customer Growth

```sql customer_growth
SELECT 'Jan' as month, 1200 as new_customers, 980 as churned UNION ALL
SELECT 'Feb', 1350, 1020 UNION ALL
SELECT 'Mar', 1480, 1100 UNION ALL
SELECT 'Apr', 1620, 1150 UNION ALL
SELECT 'May', 1890, 1200 UNION ALL
SELECT 'Jun', 2150, 1280
```

<AreaChart
    data={customer_growth}
    x="month"
    y={["new_customers", "churned"]}
    title="Customer Acquisition vs Churn"
/>

---

## Top Accounts

```sql top_accounts
SELECT 'Acme Corp' as company, 'Enterprise' as plan, 24500 as mrr, '2023-03-15' as joined UNION ALL
SELECT 'TechStart Inc', 'Professional', 12800, '2023-06-22' UNION ALL
SELECT 'Global Services', 'Enterprise', 31200, '2022-11-08' UNION ALL
SELECT 'DataFlow Ltd', 'Professional', 8900, '2023-09-14' UNION ALL
SELECT 'CloudNine', 'Enterprise', 18700, '2023-01-30'
```

<DataTable
    data={top_accounts}
/>

---

## Color Palette Reference

```sql colors
SELECT '#7c9eff' as hex, 'Story Blue' as name, 'Primary brand color' as usage UNION ALL
SELECT '#6366f1', 'Indigo', 'Secondary / complementary' UNION ALL
SELECT '#10b981', 'Emerald', 'Positive / success' UNION ALL
SELECT '#64748b', 'Slate', 'Neutral / muted' UNION ALL
SELECT '#f43f5e', 'Rose', 'Negative / alerts' UNION ALL
SELECT '#8b5cf6', 'Violet', 'Accent'
```

<DataTable data={colors} />

---

*This mockup demonstrates the new Story Analytics design system. Typography: Inter. Style: Datawrapper-minimal.*
