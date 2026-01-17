# Invoice Trends - Last 12 Months

This dashboard shows invoice trends over the last 12 months. It includes the total invoice amount, visualized as an area chart. This will help you understand how invoicing amounts are trending.

```sql invoice_summary
SELECT DATE_TRUNC('MONTH', INVOICE_DATE) AS MONTH,
       COUNT(*) AS INVOICE_COUNT
FROM ANALYTICS_POC.SAAS_DEMO.INVOICES
WHERE INVOICE_DATE >= DATEADD('MONTH', -12, CURRENT_DATE())
GROUP BY DATE_TRUNC('MONTH', INVOICE_DATE)
ORDER BY MONTH;```

<AreaChart
  data={invoice_summary}
  x="invoice_month"
  y="total_amount"
  title="Total Invoice Amount Over Time"
/>