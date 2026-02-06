-- ============================================================================
-- OLIST BRAZILIAN E-COMMERCE SQL QUERIES
-- Compiled from real SQL analysis projects on Kaggle, GitHub, and Medium
-- ============================================================================
--
-- This file contains real SQL queries used by analysts to explore the Olist
-- Brazilian e-commerce dataset. These queries represent actual business logic
-- and analytical patterns used in production analytics.
--
-- Dataset: Brazilian E-Commerce Public Dataset by Olist (Kaggle)
-- Period: September 2016 - September 2018
-- Scale: ~100,000 orders across 9 tables
--
-- Sources:
-- - https://github.com/rachelleperez/Olist-Brazilian-Ecommerce-/blob/master/olist_sql.sql
-- - https://github.com/nabeel-io/olist_database_analysis
-- - https://github.com/lewagon-data/olist_full_sql
-- - Multiple Medium articles and Kaggle notebooks (see end for full list)
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: BASIC DATASET STATISTICS
-- Understanding the scale and scope of the data
-- ----------------------------------------------------------------------------

-- Total unique customers
-- Source: Common baseline metric across all Olist analyses
SELECT COUNT(DISTINCT customer_unique_id) as total_customers
FROM customers
INNER JOIN orders USING(customer_id);
-- Expected: ~96,096 customers

-- Total orders (with duplicate check)
-- Source: Data validation pattern from rachelleperez/Olist-Brazilian-Ecommerce
SELECT COUNT(order_id) as total_order_count,
       COUNT(DISTINCT order_id) as unique_order_count
FROM orders;
-- If counts match, no duplicates exist
-- Expected: ~99,441 orders

-- Total sellers
-- Source: Seller performance analysis baseline
SELECT COUNT(DISTINCT seller_id) as total_sellers
FROM sellers
INNER JOIN order_items USING(seller_id);
-- Expected: ~3,095 sellers

-- Order status distribution
-- Source: Understanding order lifecycle for filtering
SELECT DISTINCT order_status, COUNT(*) as order_count
FROM orders
GROUP BY order_status
ORDER BY order_count DESC;
-- Common statuses: delivered, shipped, canceled, processing, unavailable, etc.


-- ----------------------------------------------------------------------------
-- SECTION 2: REVENUE & GMV ANALYSIS
-- Critical business metric: How GMV is calculated in Olist analyses
-- ----------------------------------------------------------------------------

-- Total revenue (excluding canceled orders)
-- Source: Multiple Medium articles on Olist revenue analysis
-- Business logic: Only count delivered/completed orders for revenue
SELECT SUM(payment_value) as total_revenue
FROM orders o
INNER JOIN order_payments op USING(order_id)
WHERE o.order_status <> 'canceled';
-- Expected: ~R$ 15.4-15.9 million

-- Alternative revenue calculation using order items
-- Source: Product-level revenue analysis pattern
SELECT SUM(price + freight_value) as total_gmv
FROM orders o
INNER JOIN order_items oi USING(order_id)
WHERE o.order_status = 'delivered';
-- Note: GMV can be defined as price only, or price + freight depending on business definition

-- Monthly revenue trend (time series)
-- Source: Common time series pattern for executive dashboards
-- Business logic: Use DATE_TRUNC or EXTRACT to group by month
SELECT
    DATE_TRUNC('month', o.order_purchase_timestamp) as month,
    SUM(op.payment_value) as monthly_revenue,
    COUNT(DISTINCT o.order_id) as order_count
FROM orders o
INNER JOIN order_payments op USING(order_id)
WHERE o.order_status <> 'canceled'
GROUP BY DATE_TRUNC('month', o.order_purchase_timestamp)
ORDER BY month;
-- Shows Q2 2018 had highest revenue, Q3 2016 had lowest

-- Quarterly revenue with year-over-year comparison
-- Source: Executive reporting pattern
SELECT
    EXTRACT(YEAR FROM o.order_purchase_timestamp) as year,
    EXTRACT(QUARTER FROM o.order_purchase_timestamp) as quarter,
    SUM(op.payment_value) as quarterly_revenue,
    COUNT(DISTINCT o.order_id) as orders
FROM orders o
INNER JOIN order_payments op USING(order_id)
WHERE o.order_status <> 'canceled'
GROUP BY
    EXTRACT(YEAR FROM o.order_purchase_timestamp),
    EXTRACT(QUARTER FROM o.order_purchase_timestamp)
ORDER BY year, quarter;


-- ----------------------------------------------------------------------------
-- SECTION 3: PRODUCT CATEGORY ANALYSIS
-- Understanding which product categories drive revenue
-- ----------------------------------------------------------------------------

-- Revenue by product category (top to bottom)
-- Source: Product performance analysis across multiple projects
-- Business insight: bed_bath_table is consistently the top category
SELECT
    p.product_category_name,
    t.product_category_name_english,
    SUM(oi.price) as category_revenue,
    COUNT(DISTINCT oi.order_id) as orders,
    AVG(oi.price) as avg_order_value
FROM orders o
INNER JOIN order_items oi USING(order_id)
INNER JOIN products p USING(product_id)
LEFT JOIN product_category_name_translation t ON p.product_category_name = t.product_category_name
WHERE o.order_status = 'delivered'
GROUP BY p.product_category_name, t.product_category_name_english
ORDER BY category_revenue DESC
LIMIT 20;
-- Top categories: bed_bath_table (~R$1.69M), health_beauty, computers_accessories

-- Average order value (AOV) by category
-- Source: Pricing strategy analysis
-- Business insight: computers has high AOV, bed_bath_table has low AOV but high volume
SELECT
    t.product_category_name_english,
    AVG(oi.price) as avg_item_price,
    COUNT(*) as item_count,
    SUM(oi.price) as total_revenue
FROM order_items oi
INNER JOIN orders o USING(order_id)
INNER JOIN products p USING(product_id)
LEFT JOIN product_category_name_translation t ON p.product_category_name = t.product_category_name
WHERE o.order_status = 'delivered'
GROUP BY t.product_category_name_english
ORDER BY avg_item_price DESC;

-- Product category with freight costs
-- Source: Logistics cost analysis by category
SELECT
    t.product_category_name_english,
    SUM(oi.price) as product_revenue,
    SUM(oi.freight_value) as total_freight,
    SUM(oi.freight_value) / SUM(oi.price) as freight_ratio,
    AVG(oi.freight_value) as avg_freight_per_item
FROM order_items oi
INNER JOIN orders o USING(order_id)
INNER JOIN products p USING(product_id)
LEFT JOIN product_category_name_translation t ON p.product_category_name = t.product_category_name
WHERE o.order_status = 'delivered'
GROUP BY t.product_category_name_english
ORDER BY total_freight DESC;


-- ----------------------------------------------------------------------------
-- SECTION 4: CUSTOMER GEOGRAPHY ANALYSIS
-- Understanding where customers are located and which regions drive revenue
-- ----------------------------------------------------------------------------

-- Revenue by customer state
-- Source: Geographic performance analysis
-- Business insight: São Paulo (SP) dominates with ~46% of customers
SELECT
    c.customer_state,
    COUNT(DISTINCT c.customer_unique_id) as customers,
    COUNT(DISTINCT o.order_id) as orders,
    SUM(op.payment_value) as state_revenue,
    AVG(op.payment_value) as avg_order_value
FROM customers c
INNER JOIN orders o USING(customer_id)
INNER JOIN order_payments op USING(order_id)
WHERE o.order_status <> 'canceled'
GROUP BY c.customer_state
ORDER BY state_revenue DESC;
-- Top states: SP (São Paulo), RJ (Rio de Janeiro), MG (Minas Gerais)
-- SP + RJ account for >50% of customer base

-- Customer concentration by city (top 20)
-- Source: Targeting and logistics optimization
SELECT
    c.customer_city,
    c.customer_state,
    COUNT(DISTINCT c.customer_unique_id) as customers,
    SUM(op.payment_value) as city_revenue
FROM customers c
INNER JOIN orders o USING(customer_id)
INNER JOIN order_payments op USING(order_id)
WHERE o.order_status <> 'canceled'
GROUP BY c.customer_city, c.customer_state
ORDER BY customers DESC
LIMIT 20;


-- ----------------------------------------------------------------------------
-- SECTION 5: PAYMENT METHOD ANALYSIS
-- Understanding how customers prefer to pay
-- ----------------------------------------------------------------------------

-- Payment method distribution
-- Source: Payment analysis across multiple projects
-- Business insight: Credit card dominates at 76%, boleto at 18%
SELECT
    payment_type,
    COUNT(DISTINCT order_id) as orders,
    COUNT(*) as payment_count,
    SUM(payment_value) as total_value,
    AVG(payment_value) as avg_payment_value,
    AVG(payment_installments) as avg_installments
FROM order_payments op
INNER JOIN orders o USING(order_id)
WHERE o.order_status <> 'canceled'
GROUP BY payment_type
ORDER BY orders DESC;
-- Payment types: credit_card (~76.5K orders), boleto (~19.8K), voucher (~3.9K), debit_card (~1.5K)

-- Revenue by payment type
-- Source: Financial performance analysis
-- Business insight: Credit card generates ~75% of total revenue
SELECT
    payment_type,
    SUM(payment_value) as revenue,
    SUM(payment_value) * 100.0 / (SELECT SUM(payment_value) FROM order_payments) as revenue_pct
FROM order_payments
GROUP BY payment_type
ORDER BY revenue DESC;

-- Credit card installment analysis
-- Source: Understanding customer payment preferences
-- Business insight: Most customers pay in 1 installment
SELECT
    payment_installments,
    COUNT(DISTINCT order_id) as orders,
    AVG(payment_value) as avg_order_value
FROM order_payments
WHERE payment_type = 'credit_card'
GROUP BY payment_installments
ORDER BY payment_installments;

-- Average order value by payment type
-- Source: Pricing and payment strategy
SELECT
    payment_type,
    AVG(payment_value) as avg_order_value,
    COUNT(DISTINCT order_id) as order_count
FROM order_payments op
INNER JOIN orders o USING(order_id)
WHERE o.order_status = 'delivered'
GROUP BY payment_type
ORDER BY avg_order_value DESC;
-- Credit card AOV: ~R$162.70, Voucher AOV: ~R$62.33


-- ----------------------------------------------------------------------------
-- SECTION 6: DELIVERY PERFORMANCE ANALYSIS
-- Critical operational metrics for logistics
-- ----------------------------------------------------------------------------

-- On-time delivery rate
-- Source: Logistics KPI analysis
-- Business logic: Compare actual delivery date vs estimated delivery date
-- Business insight: ~63% of orders delivered on time
SELECT
    COUNT(*) as total_delivered_orders,
    SUM(CASE
        WHEN order_delivered_customer_date <= order_estimated_delivery_date
        THEN 1 ELSE 0
    END) as on_time_deliveries,
    SUM(CASE
        WHEN order_delivered_customer_date <= order_estimated_delivery_date
        THEN 1 ELSE 0
    END) * 100.0 / COUNT(*) as on_time_pct
FROM orders
WHERE order_status = 'delivered'
    AND order_delivered_customer_date IS NOT NULL;

-- Average delivery time (purchase to delivery)
-- Source: Operational metrics
-- PostgreSQL syntax (use DATEDIFF for SQL Server)
SELECT
    AVG(order_delivered_customer_date - order_purchase_timestamp) as avg_delivery_time,
    MIN(order_delivered_customer_date - order_purchase_timestamp) as min_delivery_time,
    MAX(order_delivered_customer_date - order_purchase_timestamp) as max_delivery_time
FROM orders
WHERE order_status = 'delivered'
    AND order_delivered_customer_date IS NOT NULL;

-- Delivery performance by state
-- Source: Geographic logistics analysis
SELECT
    c.customer_state,
    COUNT(*) as deliveries,
    AVG(EXTRACT(EPOCH FROM (o.order_delivered_customer_date - o.order_purchase_timestamp))/86400) as avg_delivery_days,
    SUM(CASE
        WHEN o.order_delivered_customer_date <= o.order_estimated_delivery_date
        THEN 1 ELSE 0
    END) * 100.0 / COUNT(*) as on_time_pct
FROM orders o
INNER JOIN customers c USING(customer_id)
WHERE o.order_status = 'delivered'
    AND o.order_delivered_customer_date IS NOT NULL
GROUP BY c.customer_state
ORDER BY deliveries DESC;

-- Late delivery analysis with delay days
-- Source: Service quality monitoring
SELECT
    order_id,
    customer_id,
    order_estimated_delivery_date,
    order_delivered_customer_date,
    EXTRACT(DAY FROM (order_delivered_customer_date - order_estimated_delivery_date)) as days_late
FROM orders
WHERE order_status = 'delivered'
    AND order_delivered_customer_date > order_estimated_delivery_date
ORDER BY days_late DESC
LIMIT 100;


-- ----------------------------------------------------------------------------
-- SECTION 7: CUSTOMER SATISFACTION & REVIEW ANALYSIS
-- Understanding customer feedback and its drivers
-- ----------------------------------------------------------------------------

-- Overall review score distribution
-- Source: Customer satisfaction analysis
-- Business insight: Average review score is ~4.09/5.0, 56.55% give 5 stars
SELECT
    review_score,
    COUNT(*) as review_count,
    COUNT(*) * 100.0 / (SELECT COUNT(*) FROM reviews) as pct_of_reviews
FROM reviews
GROUP BY review_score
ORDER BY review_score DESC;

-- Average review score by product category
-- Source: Product quality insights
SELECT
    t.product_category_name_english,
    AVG(r.review_score) as avg_review_score,
    COUNT(r.review_id) as review_count,
    SUM(CASE WHEN r.review_score >= 4 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as positive_review_pct
FROM reviews r
INNER JOIN orders o USING(order_id)
INNER JOIN order_items oi USING(order_id)
INNER JOIN products p USING(product_id)
LEFT JOIN product_category_name_translation t ON p.product_category_name = t.product_category_name
GROUP BY t.product_category_name_english
HAVING COUNT(r.review_id) >= 100  -- Filter for categories with sufficient reviews
ORDER BY avg_review_score DESC;

-- Review score vs delivery performance
-- Source: Understanding drivers of satisfaction
-- Business insight: Late delivery strongly correlates with poor reviews
SELECT
    CASE
        WHEN order_delivered_customer_date <= order_estimated_delivery_date THEN 'On Time'
        WHEN order_delivered_customer_date > order_estimated_delivery_date THEN 'Late'
        ELSE 'Unknown'
    END as delivery_status,
    AVG(r.review_score) as avg_review_score,
    COUNT(*) as order_count
FROM orders o
INNER JOIN reviews r USING(order_id)
WHERE o.order_status = 'delivered'
    AND o.order_delivered_customer_date IS NOT NULL
GROUP BY
    CASE
        WHEN order_delivered_customer_date <= order_estimated_delivery_date THEN 'On Time'
        WHEN order_delivered_customer_date > order_estimated_delivery_date THEN 'Late'
        ELSE 'Unknown'
    END;

-- Review response lag (time between delivery and review)
-- Source: Customer engagement analysis
SELECT
    AVG(EXTRACT(EPOCH FROM (r.review_creation_date - o.order_delivered_customer_date))/86400) as avg_days_to_review,
    MIN(EXTRACT(EPOCH FROM (r.review_creation_date - o.order_delivered_customer_date))/86400) as min_days,
    MAX(EXTRACT(EPOCH FROM (r.review_creation_date - o.order_delivered_customer_date))/86400) as max_days
FROM orders o
INNER JOIN reviews r USING(order_id)
WHERE o.order_status = 'delivered'
    AND o.order_delivered_customer_date IS NOT NULL
    AND r.review_creation_date IS NOT NULL;


-- ----------------------------------------------------------------------------
-- SECTION 8: SELLER PERFORMANCE ANALYSIS
-- Identifying top sellers and performance patterns
-- ----------------------------------------------------------------------------

-- Top sellers by revenue
-- Source: Seller ranking analysis
SELECT
    s.seller_id,
    s.seller_state,
    COUNT(DISTINCT oi.order_id) as orders,
    SUM(oi.price) as revenue,
    AVG(oi.price) as avg_order_value
FROM sellers s
INNER JOIN order_items oi USING(seller_id)
INNER JOIN orders o USING(order_id)
WHERE o.order_status = 'delivered'
GROUP BY s.seller_id, s.seller_state
ORDER BY revenue DESC
LIMIT 50;

-- Seller performance with review scores
-- Source: Quality and revenue correlation analysis
-- Business insight: Sellers with review scores 4-5 have highest orders and revenue
SELECT
    s.seller_id,
    s.seller_state,
    COUNT(DISTINCT oi.order_id) as orders,
    SUM(oi.price) as revenue,
    AVG(r.review_score) as avg_review_score
FROM sellers s
INNER JOIN order_items oi USING(seller_id)
INNER JOIN orders o USING(order_id)
INNER JOIN reviews r USING(order_id)
WHERE o.order_status = 'delivered'
GROUP BY s.seller_id, s.seller_state
HAVING COUNT(DISTINCT oi.order_id) >= 10  -- Minimum order threshold
ORDER BY revenue DESC
LIMIT 50;

-- Seller geographic distribution
-- Source: Marketplace coverage analysis
SELECT
    seller_state,
    COUNT(DISTINCT seller_id) as seller_count,
    SUM(revenue) as state_seller_revenue
FROM (
    SELECT
        s.seller_state,
        s.seller_id,
        SUM(oi.price) as revenue
    FROM sellers s
    INNER JOIN order_items oi USING(seller_id)
    INNER JOIN orders o USING(order_id)
    WHERE o.order_status = 'delivered'
    GROUP BY s.seller_state, s.seller_id
) seller_revenues
GROUP BY seller_state
ORDER BY seller_count DESC;


-- ----------------------------------------------------------------------------
-- SECTION 9: FREIGHT/SHIPPING COST ANALYSIS
-- Understanding logistics costs
-- ----------------------------------------------------------------------------

-- Freight value analysis by state
-- Source: Logistics cost optimization
-- Business insight: Freight costs increase with distance
SELECT
    s.seller_state,
    COUNT(*) as shipments,
    AVG(oi.freight_value) as avg_freight,
    SUM(oi.freight_value) as total_freight,
    AVG(oi.freight_value) / NULLIF(AVG(oi.price), 0) as freight_to_price_ratio
FROM order_items oi
INNER JOIN sellers s USING(seller_id)
INNER JOIN orders o USING(order_id)
WHERE o.order_status = 'delivered'
GROUP BY s.seller_state
ORDER BY avg_freight DESC;

-- Freight cost vs delivery time
-- Source: Cost/speed tradeoff analysis
-- Business insight: Higher freight correlates with faster delivery
SELECT
    CASE
        WHEN oi.freight_value < 10 THEN '< R$10'
        WHEN oi.freight_value < 20 THEN 'R$10-20'
        WHEN oi.freight_value < 30 THEN 'R$20-30'
        ELSE 'R$30+'
    END as freight_bucket,
    AVG(EXTRACT(EPOCH FROM (o.order_delivered_customer_date - o.order_purchase_timestamp))/86400) as avg_delivery_days,
    COUNT(*) as order_count
FROM order_items oi
INNER JOIN orders o USING(order_id)
WHERE o.order_status = 'delivered'
    AND o.order_delivered_customer_date IS NOT NULL
GROUP BY
    CASE
        WHEN oi.freight_value < 10 THEN '< R$10'
        WHEN oi.freight_value < 20 THEN 'R$10-20'
        WHEN oi.freight_value < 30 THEN 'R$20-30'
        ELSE 'R$30+'
    END
ORDER BY avg_delivery_days;

-- Product dimensions vs freight cost
-- Source: Logistics pricing analysis
-- Business insight: Size and weight drive freight costs
SELECT
    CASE
        WHEN p.product_weight_g < 500 THEN 'Light (<500g)'
        WHEN p.product_weight_g < 2000 THEN 'Medium (500g-2kg)'
        WHEN p.product_weight_g < 5000 THEN 'Heavy (2-5kg)'
        ELSE 'Very Heavy (5kg+)'
    END as weight_category,
    AVG(oi.freight_value) as avg_freight,
    COUNT(*) as item_count
FROM order_items oi
INNER JOIN products p USING(product_id)
INNER JOIN orders o USING(order_id)
WHERE o.order_status = 'delivered'
    AND p.product_weight_g IS NOT NULL
GROUP BY
    CASE
        WHEN p.product_weight_g < 500 THEN 'Light (<500g)'
        WHEN p.product_weight_g < 2000 THEN 'Medium (500g-2kg)'
        WHEN p.product_weight_g < 5000 THEN 'Heavy (2-5kg)'
        ELSE 'Very Heavy (5kg+)'
    END
ORDER BY avg_freight;


-- ----------------------------------------------------------------------------
-- SECTION 10: CUSTOMER COHORT & RETENTION ANALYSIS
-- Understanding repeat purchase behavior
-- ----------------------------------------------------------------------------

-- Customer first order date (cohort definition)
-- Source: Cohort analysis foundation
-- Business logic: The "birth date" of each customer for cohort grouping
CREATE VIEW customer_cohorts AS
SELECT
    c.customer_unique_id,
    MIN(o.order_purchase_timestamp) as first_order_date,
    DATE_TRUNC('month', MIN(o.order_purchase_timestamp)) as cohort_month
FROM customers c
INNER JOIN orders o USING(customer_id)
GROUP BY c.customer_unique_id;

-- Repeat purchase rate
-- Source: Retention analysis
-- Business insight: Only ~3% of customers are repeat buyers (97% one-time)
SELECT
    COUNT(DISTINCT customer_unique_id) as total_customers,
    SUM(CASE WHEN order_count > 1 THEN 1 ELSE 0 END) as repeat_customers,
    SUM(CASE WHEN order_count > 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT customer_unique_id) as repeat_rate
FROM (
    SELECT
        c.customer_unique_id,
        COUNT(DISTINCT o.order_id) as order_count
    FROM customers c
    INNER JOIN orders o USING(customer_id)
    WHERE o.order_status <> 'canceled'
    GROUP BY c.customer_unique_id
) customer_orders;

-- Customer lifetime value (first 6 months)
-- Source: CLV analysis from rachelleperez/Olist-Brazilian-Ecommerce
-- Business logic: Track spending in first 6 months from first order
SELECT
    cc.customer_unique_id,
    cc.first_order_date,
    cc.first_order_date + INTERVAL '182.5 day' as six_month_cutoff,
    COUNT(DISTINCT o.order_id) as orders_in_first_6mo,
    SUM(op.payment_value) as total_spent_first_6mo
FROM customer_cohorts cc
INNER JOIN customers c USING(customer_unique_id)
INNER JOIN orders o USING(customer_id)
INNER JOIN order_payments op USING(order_id)
WHERE o.order_purchase_timestamp < cc.first_order_date + INTERVAL '182.5 day'
    AND o.order_status <> 'canceled'
GROUP BY cc.customer_unique_id, cc.first_order_date;

-- Monthly cohort retention
-- Source: Cohort retention analysis pattern
-- Business logic: Track how many customers from each cohort remain active
WITH customer_first_purchase AS (
    SELECT
        c.customer_unique_id,
        MIN(DATE_TRUNC('month', o.order_purchase_timestamp)) as cohort_month
    FROM customers c
    INNER JOIN orders o USING(customer_id)
    WHERE o.order_status <> 'canceled'
    GROUP BY c.customer_unique_id
),
customer_monthly_activity AS (
    SELECT
        c.customer_unique_id,
        DATE_TRUNC('month', o.order_purchase_timestamp) as activity_month
    FROM customers c
    INNER JOIN orders o USING(customer_id)
    WHERE o.order_status <> 'canceled'
    GROUP BY c.customer_unique_id, DATE_TRUNC('month', o.order_purchase_timestamp)
)
SELECT
    cfp.cohort_month,
    cma.activity_month,
    EXTRACT(MONTH FROM age(cma.activity_month, cfp.cohort_month)) as months_since_cohort,
    COUNT(DISTINCT cfp.customer_unique_id) as active_customers
FROM customer_first_purchase cfp
INNER JOIN customer_monthly_activity cma ON cfp.customer_unique_id = cma.customer_unique_id
GROUP BY cfp.cohort_month, cma.activity_month
ORDER BY cfp.cohort_month, cma.activity_month;


-- ----------------------------------------------------------------------------
-- SECTION 11: TIME SERIES & TREND ANALYSIS
-- Understanding temporal patterns in orders and revenue
-- ----------------------------------------------------------------------------

-- Daily order volume
-- Source: Operational planning and trend analysis
SELECT
    DATE(order_purchase_timestamp) as order_date,
    COUNT(DISTINCT order_id) as orders,
    SUM(CASE WHEN order_status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
    SUM(CASE WHEN order_status = 'canceled' THEN 1 ELSE 0 END) as canceled_orders
FROM orders
GROUP BY DATE(order_purchase_timestamp)
ORDER BY order_date;

-- Day of week patterns
-- Source: Understanding weekly seasonality
-- Business insight: Helps with inventory and staffing planning
SELECT
    EXTRACT(DOW FROM order_purchase_timestamp) as day_of_week,
    TO_CHAR(order_purchase_timestamp, 'Day') as day_name,
    COUNT(DISTINCT order_id) as orders,
    AVG(COUNT(DISTINCT order_id)) OVER () as avg_orders
FROM orders
WHERE order_status <> 'canceled'
GROUP BY EXTRACT(DOW FROM order_purchase_timestamp), TO_CHAR(order_purchase_timestamp, 'Day')
ORDER BY day_of_week;

-- Month-over-month growth
-- Source: Business performance tracking
WITH monthly_stats AS (
    SELECT
        DATE_TRUNC('month', order_purchase_timestamp) as month,
        COUNT(DISTINCT order_id) as orders,
        SUM(payment_value) as revenue
    FROM orders o
    INNER JOIN order_payments op USING(order_id)
    WHERE o.order_status <> 'canceled'
    GROUP BY DATE_TRUNC('month', order_purchase_timestamp)
)
SELECT
    month,
    orders,
    revenue,
    LAG(orders) OVER (ORDER BY month) as prev_month_orders,
    LAG(revenue) OVER (ORDER BY month) as prev_month_revenue,
    (orders - LAG(orders) OVER (ORDER BY month)) * 100.0 / LAG(orders) OVER (ORDER BY month) as order_growth_pct,
    (revenue - LAG(revenue) OVER (ORDER BY month)) * 100.0 / LAG(revenue) OVER (ORDER BY month) as revenue_growth_pct
FROM monthly_stats
ORDER BY month;


-- ----------------------------------------------------------------------------
-- SECTION 12: ADVANCED BUSINESS LOGIC QUERIES
-- Complex analytical patterns found in real Olist projects
-- ----------------------------------------------------------------------------

-- Order complexity analysis (items per order)
-- Source: Operations planning and fulfillment complexity
SELECT
    items_per_order,
    COUNT(*) as order_count,
    AVG(total_order_value) as avg_order_value
FROM (
    SELECT
        o.order_id,
        COUNT(oi.order_item_id) as items_per_order,
        SUM(oi.price + oi.freight_value) as total_order_value
    FROM orders o
    INNER JOIN order_items oi USING(order_id)
    WHERE o.order_status = 'delivered'
    GROUP BY o.order_id
) order_stats
GROUP BY items_per_order
ORDER BY items_per_order;

-- Multi-seller order analysis
-- Source: Marketplace coordination complexity
-- Business insight: Orders with multiple sellers require coordination
SELECT
    seller_count_per_order,
    COUNT(*) as orders,
    AVG(total_value) as avg_order_value
FROM (
    SELECT
        o.order_id,
        COUNT(DISTINCT oi.seller_id) as seller_count_per_order,
        SUM(oi.price) as total_value
    FROM orders o
    INNER JOIN order_items oi USING(order_id)
    WHERE o.order_status = 'delivered'
    GROUP BY o.order_id
) multi_seller
GROUP BY seller_count_per_order
ORDER BY seller_count_per_order;

-- Customer-Seller distance analysis (using geolocation)
-- Source: Logistics optimization research
-- Business insight: Distance drives shipping cost and delivery time
SELECT
    CASE
        WHEN distance_km < 100 THEN '< 100km'
        WHEN distance_km < 500 THEN '100-500km'
        WHEN distance_km < 1000 THEN '500-1000km'
        ELSE '1000km+'
    END as distance_bucket,
    AVG(freight_value) as avg_freight,
    AVG(delivery_days) as avg_delivery_days,
    COUNT(*) as order_count
FROM (
    SELECT
        oi.order_id,
        oi.freight_value,
        EXTRACT(EPOCH FROM (o.order_delivered_customer_date - o.order_purchase_timestamp))/86400 as delivery_days,
        -- Haversine formula for distance (simplified)
        -- In production, join with geolocation table and calculate actual distance
        111 * SQRT(
            POW(cg.geolocation_lat - sg.geolocation_lat, 2) +
            POW((cg.geolocation_lng - sg.geolocation_lng) * COS(RADIANS(cg.geolocation_lat)), 2)
        ) as distance_km
    FROM order_items oi
    INNER JOIN orders o USING(order_id)
    INNER JOIN customers c USING(customer_id)
    INNER JOIN sellers s USING(seller_id)
    INNER JOIN geolocation cg ON c.customer_zip_code = cg.geolocation_zip_code_prefix
    INNER JOIN geolocation sg ON s.seller_zip_code_prefix = sg.geolocation_zip_code_prefix
    WHERE o.order_status = 'delivered'
        AND o.order_delivered_customer_date IS NOT NULL
) distances
GROUP BY
    CASE
        WHEN distance_km < 100 THEN '< 100km'
        WHEN distance_km < 500 THEN '100-500km'
        WHEN distance_km < 1000 THEN '500-1000km'
        ELSE '1000km+'
    END
ORDER BY avg_delivery_days;

-- RFM Analysis (Recency, Frequency, Monetary)
-- Source: Customer segmentation for marketing
SELECT
    customer_unique_id,
    EXTRACT(DAY FROM (CURRENT_DATE - MAX(order_purchase_timestamp))) as recency_days,
    COUNT(DISTINCT order_id) as frequency,
    SUM(payment_value) as monetary
FROM customers c
INNER JOIN orders o USING(customer_id)
INNER JOIN order_payments op USING(order_id)
WHERE o.order_status <> 'canceled'
GROUP BY customer_unique_id
ORDER BY monetary DESC;


-- ----------------------------------------------------------------------------
-- DATA QUALITY & VALIDATION QUERIES
-- Patterns used to validate data integrity
-- ----------------------------------------------------------------------------

-- Geolocation data quality check
-- Source: rachelleperez/Olist-Brazilian-Ecommerce validation patterns
-- Business logic: Check if customer city matches geolocation city by zip
SELECT COUNT(*) as mismatched_cities
FROM customers c
INNER JOIN geolocation g ON c.customer_zip_code = g.geolocation_zip_code_prefix
WHERE c.customer_city <> g.geolocation_city;

-- Order timeline validation
-- Source: Data quality checks
-- Business logic: Ensure order dates are in logical sequence
SELECT
    COUNT(*) as invalid_orders
FROM orders
WHERE order_approved_at < order_purchase_timestamp
    OR order_delivered_carrier_date < order_approved_at
    OR order_delivered_customer_date < order_delivered_carrier_date;

-- Payment value vs order item total reconciliation
-- Source: Financial reconciliation
-- Business logic: Payment total should match order items total
SELECT
    o.order_id,
    SUM(oi.price + oi.freight_value) as items_total,
    SUM(op.payment_value) as payments_total,
    ABS(SUM(oi.price + oi.freight_value) - SUM(op.payment_value)) as difference
FROM orders o
INNER JOIN order_items oi USING(order_id)
INNER JOIN order_payments op USING(order_id)
GROUP BY o.order_id
HAVING ABS(SUM(oi.price + oi.freight_value) - SUM(op.payment_value)) > 0.01
ORDER BY difference DESC;


-- ============================================================================
-- END OF QUERY COLLECTION
-- ============================================================================
--
-- SOURCES AND REFERENCES:
--
-- Primary GitHub Repositories:
-- 1. https://github.com/rachelleperez/Olist-Brazilian-Ecommerce-/blob/master/olist_sql.sql
-- 2. https://github.com/nabeel-io/olist_database_analysis
-- 3. https://github.com/lewagon-data/olist_full_sql
-- 4. https://github.com/tolamoye/Olist-E-commerce-Data-Analysis
-- 5. https://github.com/allmeidaapedro/Olist-Data-Analysis
-- 6. https://github.com/thuynh323/SQL-olist-e-commerce
--
-- Kaggle Notebooks:
-- 1. https://www.kaggle.com/code/douglasdutra/olist-dataset-analysis-with-sql
-- 2. https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce
-- 3. https://www.kaggle.com/code/terencicp/sql-challenge-e-commerce-data-analysis
--
-- Medium Articles & Blog Posts:
-- 1. https://medium.com/@e.imenje/brazilian-e-commerce-sql-analysis-110a6de025c5
-- 2. https://medium.com/@ming.s.lu1617/e-commerce-data-analysis-sql-project-dc673b4348a2
-- 3. https://mlnayusuf24.medium.com/olist-store-exploratory-data-analysis-using-sql-63ca3c4b7a87
-- 4. https://medium.com/@wiradp/olist-e-commerce-data-analysis-d8530fb49c01
-- 5. https://medium.com/@enahoroprecious/improving-olists-delivery-performance-52e0b27d0570
-- 6. https://medium.com/@vaniaelvinaa/olist-e-commerce-sales-analysis-7837d43f37da
-- 7. https://medium.com/@laraenibuck/e-commerce-landscape-in-brazil-using-olist-as-a-case-study-1de6a781a264
-- 8. https://medium.com/@dzakiyma/olist-e-commerce-analysis-customer-reviews-c8b61f896ac2
--
-- Project Documentation:
-- 1. https://chinhmaigit.github.io/Project-SQL-2/html/project2.html
-- 2. https://www.rajwolkhadka.com/post/olist-e-commerce-analysis
--
-- Additional Resources:
-- 1. https://towardsdatascience.com/case-study-1-customer-satisfaction-prediction-on-olist-brazillian-dataset-4289bdd20076
-- 2. https://community.fabric.microsoft.com/t5/Data-Stories-Gallery/From-Learning-to-Action-E-commerce-Analytics-with-Olist-Data/m-p/4787990
--
-- KEY BUSINESS LOGIC PATTERNS IDENTIFIED:
--
-- 1. Revenue Calculation:
--    - Always filter WHERE order_status <> 'canceled' OR order_status = 'delivered'
--    - GMV can be defined as: price only, or price + freight_value
--    - Use order_payments.payment_value or SUM(order_items.price)
--
-- 2. Customer Deduplication:
--    - Use customer_unique_id, NOT customer_id
--    - customer_id can appear multiple times per customer
--
-- 3. Time-based Analysis:
--    - Use DATE_TRUNC('month', ...) for monthly aggregations in PostgreSQL
--    - Use EXTRACT(YEAR/MONTH/QUARTER FROM ...) for period grouping
--    - First order date = MIN(order_purchase_timestamp) per customer_unique_id
--
-- 4. Delivery Performance:
--    - On-time = order_delivered_customer_date <= order_estimated_delivery_date
--    - Delivery time = order_delivered_customer_date - order_purchase_timestamp
--    - Always filter for order_status = 'delivered' and NOT NULL delivery dates
--
-- 5. Geographic Analysis:
--    - São Paulo (SP) dominates at ~46% of customers
--    - Top 10 states contain >90% of customer base
--    - customer_state is preferred over customer_city for aggregation
--
-- 6. Payment Analysis:
--    - Credit card: ~76% of orders, ~75% of revenue
--    - Boleto: ~18% of orders
--    - Most credit card payments use 1 installment
--
-- 7. Cohort Analysis:
--    - Define cohort by DATE_TRUNC('month', MIN(order_purchase_timestamp))
--    - Only ~3% of customers make repeat purchases
--    - Track activity in time windows (e.g., first 6 months = 182.5 days)
--
-- 8. Review Analysis:
--    - Average score: ~4.09/5.0
--    - 56.55% of customers give 5-star reviews
--    - Late delivery strongly correlates with poor reviews
--    - Sellers with 4-5 star ratings drive most revenue
--
-- ============================================================================
