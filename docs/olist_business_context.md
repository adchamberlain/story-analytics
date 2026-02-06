# Olist Business Context & Analytics Documentation

## Business Overview

Olist is Brazil's largest department store marketplace, connecting small and medium businesses (SMBs) to major Brazilian e-commerce channels (Mercado Livre, B2W, Via Varejo, etc.) through a single logistics and storefront platform. Sellers list products on Olist's unified catalog, and when a customer purchases on any partner marketplace, Olist handles the order orchestration while the seller handles fulfillment and shipping directly to the customer.

**Revenue model**: Olist earns a commission on each transaction (Gross Merchandise Value). The key business levers are:
1. **Seller acquisition** — more sellers = broader catalog = more GMV
2. **Order volume** — driven by marketplace traffic and conversion
3. **Average Order Value (AOV)** — higher-value products drive more revenue per transaction
4. **Repeat purchases** — currently very low (~3% repeat rate), a major growth opportunity
5. **Delivery experience** — on-time delivery directly impacts review scores and repeat rates

**Scale (Sep 2016 – Oct 2018)**:
- ~99,441 orders from ~96,096 unique customers
- ~3,095 active sellers across 23 of 27 Brazilian states
- ~32,951 products across 73 categories
- All transactions in Brazilian Real (BRL)

## Data Dictionary

### orders
The central fact table — one row per order. Contains the full order lifecycle timestamps.

| Column | Business Description |
|--------|---------------------|
| order_id | Unique order identifier (UUID) |
| customer_id | Per-order customer ID — NOT the unique customer identifier. Each order generates a new customer_id even for repeat buyers |
| order_status | Order lifecycle stage: created → approved → invoiced → shipped → delivered (or canceled/unavailable). **97% reach delivered.** |
| order_purchase_timestamp | When the customer placed the order — this is the primary time dimension for all order-level analysis |
| order_approved_at | When payment was approved. Null for some orders that were canceled before approval |
| order_delivered_carrier_date | When the seller handed the package to the carrier. Used to calculate shipping time |
| order_delivered_customer_date | When the customer received the package. Used to calculate total delivery time |
| order_estimated_delivery_date | Estimated delivery date shown to customer at purchase. Used to calculate on-time delivery rate |

### order_items
Line items within orders. One row per item. Most orders (87.6%) have a single item; max is 21.

| Column | Business Description |
|--------|---------------------|
| order_id | Foreign key to orders |
| order_item_id | Sequential item number within order (1-indexed) |
| product_id | Foreign key to products catalog |
| seller_id | Foreign key to sellers — identifies which seller fulfills this item |
| shipping_limit_date | Deadline for the seller to ship. Seller SLA compliance is tracked against this |
| price | Item selling price in BRL. Range: R$0.85 to R$6,735. Median: R$74.99. Mean: R$120.65. This is the core GMV component |
| freight_value | Shipping cost charged to customer in BRL. Range: R$0 to R$409.68. Median: R$16.26. When an order has multiple items from the same seller, freight is split across items |

### order_payments
Payment details — one row per payment method used. Orders can have multiple payments (e.g., credit card + voucher).

| Column | Business Description |
|--------|---------------------|
| order_id | Foreign key to orders |
| payment_sequential | Sequential payment number (1-indexed). Most orders have 1 payment |
| payment_type | Payment method: credit_card (73.9%), boleto (19%), voucher (5.5%), debit_card (1.5%), not_defined (<0.1%). Boleto is a Brazilian bank slip payment method — unique to Brazil |
| payment_installments | Number of installments for credit card payments (1-24). 50.6% pay in 1 installment. Installment culture is very common in Brazil |
| payment_value | Amount paid in BRL via this payment method |

### order_reviews
Customer reviews — one row per review. Bimodal distribution (mostly 5-star or 1-star).

| Column | Business Description |
|--------|---------------------|
| review_id | Unique review identifier |
| order_id | Foreign key to orders |
| review_score | Customer satisfaction rating (1-5). Mean: 4.09. Distribution: 5★=57.8%, 4★=19.3%, 3★=8.2%, 2★=3.2%, 1★=11.5% |
| review_comment_title | Optional review title in Portuguese. 88.3% null |
| review_comment_message | Optional review body in Portuguese. 58.7% null — most customers just leave a star rating |
| review_creation_date | When the review was submitted |
| review_answer_timestamp | When the review was processed/answered |

### customers
Customer dimension table. **Critical deduplication note below.**

| Column | Business Description |
|--------|---------------------|
| customer_id | Per-order customer identifier — a new ID is generated for each order. 99,441 values (= order count). Use this to join to orders |
| customer_unique_id | True unique customer identifier across all orders. 96,096 values. **Always use this for customer count and repeat purchase analysis** |
| customer_zip_code_prefix | 5-digit ZIP code prefix |
| customer_city | Customer city. Top: São Paulo, Rio de Janeiro, Belo Horizonte |
| customer_state | Two-letter Brazilian state code. Top: SP (42%), RJ (12.9%), MG (11.7%) |

### products
Product catalog — 32,951 products across 73 categories (in Portuguese).

| Column | Business Description |
|--------|---------------------|
| product_id | Unique product identifier |
| product_category_name | Category in Portuguese (join to translation table for English). 1.9% null |
| product_name_length | Character length of product name |
| product_description_length | Character length of description |
| product_photos_qty | Number of product photos (1-20). 51% have only 1 photo |
| product_weight_g | Product weight in grams — affects shipping cost |
| product_length_cm, product_height_cm, product_width_cm | Physical dimensions — affect shipping cost calculation |

### product_category_translation
Lookup table: 73 Portuguese category names → English equivalents.

### sellers
Seller dimension — 3,095 sellers across 23 of 27 Brazilian states.

| Column | Business Description |
|--------|---------------------|
| seller_id | Unique seller identifier |
| seller_zip_code_prefix | 5-digit ZIP code prefix |
| seller_city | Seller city. Top: São Paulo (22.4%) |
| seller_state | Two-letter Brazilian state code. Top: SP (59.7%), PR (11.3%), MG (7.9%). Seller concentration in SP is much higher than customer concentration (59.7% vs 42%) |

## Key Performance Indicators

These are the metrics the business actually tracks, with preferred names and definitions:

### Revenue KPIs
- **GMV (Gross Merchandise Value)** — `SUM(price)` from order_items. Excludes freight. The primary top-line revenue metric. Total dataset GMV: ~R$13.6M
- **Realized GMV** — GMV filtered to delivered orders only. Represents actual completed revenue
- **Total Revenue** — `SUM(price + freight_value)` from order_items. Includes shipping charges
- **Freight Revenue** — `SUM(freight_value)`. Tracks shipping revenue separately
- **AOV (Average Order Value)** — `GMV / COUNT(DISTINCT order_id)`. Dataset average: ~R$137. The business prefers "AOV" as the abbreviation
- **Revenue per Customer** — `GMV / COUNT(DISTINCT customer_unique_id)`. Measures monetization efficiency

### Volume KPIs
- **Orders** — `COUNT(DISTINCT order_id)` from orders table. Total: ~99,441
- **Delivered Orders** — Orders with status = 'delivered'. ~97% of total
- **Canceled Orders** — Orders with status = 'canceled'. ~0.6% of total
- **Items Sold** — `COUNT(*)` from order_items. Total: ~112,650
- **Items per Order** — `Items Sold / Orders`. Average: ~1.13
- **Active Sellers** — `COUNT(DISTINCT seller_id)` from order_items in the period
- **Active Products** — `COUNT(DISTINCT product_id)` sold in the period

### Customer KPIs
- **Unique Customers** — `COUNT(DISTINCT customer_unique_id)`. Always use customer_unique_id, not customer_id
- **Active Customers** — Unique customers with purchases in the period
- **Orders per Customer** — `Orders / Unique Customers`. Very low (~1.03) indicating minimal repeat purchases
- **Repeat Purchase Rate** — Percentage of customers with >1 order. Only ~3% — a key area for business improvement

### Delivery KPIs
- **Avg Delivery Days** — Average calendar days from order purchase to customer delivery
- **Avg Shipping Days** — Average calendar days from carrier handoff to customer delivery
- **On-Time Delivery Rate** — Percentage of delivered orders arriving on or before estimated delivery date. Dataset: ~63% on-time. **This is the most critical operational KPI**
- **Late Deliveries** — Count of orders arriving after estimated delivery date

### Customer Satisfaction KPIs
- **Avg Review Score** — Mean of review_score (1-5 scale). Dataset: 4.09
- **Review Count** — Total reviews submitted
- **5-Star Rate** — Percentage of reviews that are 5 stars. Dataset: 57.8%
- **1-Star Rate** — Percentage of 1-star reviews. Dataset: 11.5%
- **Positive Review Rate** — Reviews with score 4 or 5
- **Negative Review Rate** — Reviews with score 1 or 2

### Payment KPIs
- **Total Payment Value** — `SUM(payment_value)` across all payment methods
- **Credit Card Share** — Percentage of payment value from credit cards. ~74%
- **Avg Installments** — Average installment count for credit card payments
- **Boleto Revenue** — Payment value from boleto (bank slips), Brazil's alternative to credit cards

### Marketplace Health KPIs
- **GMV per Seller** — `GMV / Active Sellers`. Measures seller productivity
- **Items per Seller** — Measures seller activity level

## Business Rules

### Order Lifecycle
1. Orders progress through statuses: created → approved → invoiced → shipped → delivered
2. **Exclude canceled orders** from revenue and delivery metrics unless specifically analyzing cancellations
3. Use `order_purchase_timestamp` as the primary time dimension for all order analysis
4. Delivery time = `order_delivered_customer_date - order_purchase_timestamp` (total time from customer perspective)
5. Shipping time = `order_delivered_customer_date - order_delivered_carrier_date` (carrier transit time)
6. On-time = `order_delivered_customer_date <= order_estimated_delivery_date`

### Revenue Recognition
- GMV is recognized at order placement (order_purchase_timestamp), not at delivery
- Realized GMV filters to delivered orders only
- Price and freight are separate line-item level fields — always clarify whether "revenue" includes freight
- When reporting total order value, use `SUM(price + freight_value)` from order_items, not payment_value (which may differ due to vouchers/discounts)

### Customer Deduplication
- **customer_id is NOT unique across orders** — it is a per-order identifier (99,441 values = same as order count)
- **customer_unique_id IS the true unique identifier** (96,096 values)
- Always use customer_unique_id when counting unique customers or calculating repeat rates
- About 3,345 customers placed more than one order during the dataset period

### Freight Splitting
- When a single order contains multiple items from the same seller, the freight charge is split across items
- This means `freight_value` at the item level is a proportional allocation, not the full shipping cost
- For total freight per order, sum freight_value across all items: `SUM(freight_value) GROUP BY order_id`

### Payment Method Logic
- One order can have multiple payments (e.g., partial credit card + partial voucher)
- `payment_sequential` tracks the payment order within a single order
- Credit card payments can have installments (1-24); boleto/voucher/debit are always single payment
- Installment analysis should filter to `payment_type = 'credit_card'`

## Geographic & Market Context

### Currency
All monetary values are in **Brazilian Real (BRL, R$)**. No currency conversion is needed within the dataset.

### State Codes
Brazil uses two-letter state codes (similar to US). Key states in this dataset:
- **SP (São Paulo)** — 42% of customers, 59.7% of sellers. The economic center of Brazil
- **RJ (Rio de Janeiro)** — 12.9% of customers
- **MG (Minas Gerais)** — 11.7% of customers
- All 27 Brazilian states are represented in customer data, but only 23 have sellers

### Market Characteristics
- Brazil has a strong **installment culture** — buying on credit cards with 2-12 monthly installments is very common (not a sign of financial distress)
- **Boleto bancário** is a Brazilian bank slip payment method with no US equivalent — it's a common alternative for customers without credit cards
- Delivery distances can be very large (continental-size country) which affects shipping times and costs
- São Paulo dominance in both buying and selling reflects Brazil's economic concentration

## Metric Naming Conventions

The business team uses these preferred names:

| Concept | Preferred Name | Avoid |
|---------|---------------|-------|
| Total product value | **GMV** or **Gross Merchandise Value** | "sales", "total sales" |
| Revenue per order | **AOV** or **Average Order Value** | "avg order size", "basket size" |
| Completed revenue | **Realized GMV** | "net revenue", "confirmed revenue" |
| Product + freight | **Total Revenue** | "gross revenue" |
| Customer count | **Unique Customers** (using customer_unique_id) | "customers" (ambiguous — could be customer_id count) |
| Order count | **Orders** | "transactions" |
| Shipping charges | **Freight Revenue** | "shipping revenue" |
| Bank slip payments | **Boleto** | "bank transfer", "wire" |
| Review satisfaction | **Avg Review Score** | "NPS", "CSAT" (these are different metrics) |
| Delivery performance | **On-Time Delivery Rate** | "SLA compliance" |
| Seller output | **GMV per Seller** | "seller revenue" (Olist, not the seller, earns the commission) |

## Known Data Quality Issues

1. **customer_id vs customer_unique_id** — The most common analytical mistake. customer_id is per-order (99,441 values) and should NOT be used for unique customer counts. Always use customer_unique_id (96,096 values).

2. **Missing review comments** — 58.7% of reviews have no comment text, and 88.3% have no title. Review score is the only universally available satisfaction signal.

3. **Null product categories** — 1.9% of products have null `product_category_name`. Either exclude these from category analysis or label them "uncategorized."

4. **Freight splitting** — Freight values at the item level are allocated proportionally when multiple items ship from the same seller. Don't interpret item-level freight as the "shipping cost for that item."

5. **Duplicate review risk** — Some orders may have multiple reviews (the review_id is the primary key, not order_id). Use `review_id` for counting reviews or deduplicate by order_id if you want one review per order.

6. **Order status edge cases** — While 97% of orders are "delivered," about 0.6% are "canceled" and 2.4% are in other statuses (shipped, invoiced, processing, etc.). Always clarify whether your metric includes or excludes non-delivered orders.

7. **Date range gaps** — The data starts in September 2016 but early months have very few orders. October 2016 has only ~400 orders. Analysis periods should ideally start from January 2017 for meaningful trends.

8. **No product names** — The dataset includes product dimensions and category but no actual product names (anonymized). Product-level analysis is limited to category and physical attributes.

9. **Payment value vs item price discrepancy** — `SUM(payment_value)` may not exactly equal `SUM(price + freight_value)` for an order due to vouchers, discounts, or rounding. Use order_items for GMV/revenue calculations, order_payments for payment method analysis.
