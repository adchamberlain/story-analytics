-- Payment-level fact table with order dates for time-series analysis.
-- Each row is one payment toward an order.

with payments as (

    select * from {{ ref('stg_olist__order_payments') }}

),

orders as (

    select
        order_id,
        cast(order_purchase_timestamp as date) as order_date,
        order_status

    from {{ ref('stg_olist__orders') }}

)

select
    -- grain: one row per payment within an order
    p.order_id,
    p.payment_sequential,
    p.payment_type,
    p.payment_installments,
    p.payment_value,

    -- order context
    o.order_date,
    o.order_status

from payments p
inner join orders o
    on p.order_id = o.order_id
