-- Order-level fact table for delivery performance and order-level metrics.
-- Pre-aggregates item counts and values from order_items.
-- Computes delivery time and on-time delivery flag.

with orders as (

    select * from {{ ref('stg_olist__orders') }}

),

customers as (

    select * from {{ ref('stg_olist__customers') }}

),

order_items_agg as (

    select
        order_id,
        count(*) as item_count,
        sum(price) as order_revenue,
        sum(freight_value) as order_freight,
        sum(price + freight_value) as order_total_value,
        count(distinct product_id) as distinct_products,
        count(distinct seller_id) as distinct_sellers

    from {{ ref('stg_olist__order_items') }}
    group by order_id

)

select
    -- grain: one row per order
    o.order_id,
    o.customer_id,
    c.customer_unique_id,
    o.order_status,

    -- timestamps
    o.order_purchase_timestamp,
    cast(o.order_purchase_timestamp as date) as order_date,
    o.order_approved_at,
    o.order_delivered_carrier_date,
    o.order_delivered_customer_date,
    o.order_estimated_delivery_date,

    -- computed delivery metrics
    date_diff(
        'day',
        cast(o.order_purchase_timestamp as date),
        cast(o.order_delivered_customer_date as date)
    ) as delivery_days,

    date_diff(
        'day',
        cast(o.order_delivered_carrier_date as date),
        cast(o.order_delivered_customer_date as date)
    ) as shipping_days,

    case
        when o.order_delivered_customer_date is not null
            and o.order_delivered_customer_date <= o.order_estimated_delivery_date
        then true
        when o.order_delivered_customer_date is not null
            and o.order_delivered_customer_date > o.order_estimated_delivery_date
        then false
        else null
    end as is_on_time,

    -- pre-aggregated item metrics
    coalesce(oia.item_count, 0) as item_count,
    coalesce(oia.order_revenue, 0) as order_revenue,
    coalesce(oia.order_freight, 0) as order_freight,
    coalesce(oia.order_total_value, 0) as order_total_value,
    coalesce(oia.distinct_products, 0) as distinct_products,
    coalesce(oia.distinct_sellers, 0) as distinct_sellers,

    -- customer geography
    c.customer_city,
    c.customer_state

from orders o
left join customers c
    on o.customer_id = c.customer_id
left join order_items_agg oia
    on o.order_id = oia.order_id
