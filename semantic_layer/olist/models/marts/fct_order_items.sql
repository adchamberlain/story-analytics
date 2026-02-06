-- Line-item level fact table: the primary source for revenue and GMV metrics.
-- Denormalizes order dates, product categories, and geographic dimensions
-- into a single wide table for efficient analytics.

with order_items as (

    select * from {{ ref('stg_olist__order_items') }}

),

orders as (

    select * from {{ ref('stg_olist__orders') }}

),

products as (

    select * from {{ ref('dim_products') }}

),

customers as (

    select * from {{ ref('stg_olist__customers') }}

),

sellers as (

    select * from {{ ref('stg_olist__sellers') }}

)

select
    -- grain: one row per item within an order
    oi.order_id,
    oi.order_item_id,

    -- foreign keys
    oi.product_id,
    oi.seller_id,
    o.customer_id,
    c.customer_unique_id,

    -- order context
    o.order_status,
    cast(o.order_purchase_timestamp as date) as order_date,

    -- revenue
    oi.price,
    oi.freight_value,
    oi.price + oi.freight_value as total_item_value,

    -- product dimensions
    p.product_category,
    p.product_weight_g,

    -- customer geography
    c.customer_city,
    c.customer_state,

    -- seller geography
    s.seller_city,
    s.seller_state

from order_items oi
inner join orders o
    on oi.order_id = o.order_id
left join products p
    on oi.product_id = p.product_id
left join customers c
    on o.customer_id = c.customer_id
left join sellers s
    on oi.seller_id = s.seller_id
