-- Review-level fact table with order dates for time-series analysis.
-- Each row is one customer review for an order.

with reviews as (

    select * from {{ ref('stg_olist__order_reviews') }}

),

orders as (

    select
        order_id,
        cast(order_purchase_timestamp as date) as order_date,
        order_status

    from {{ ref('stg_olist__orders') }}

)

select
    -- grain: one row per review
    r.review_id,
    r.order_id,
    r.review_score,
    r.review_comment_title,
    r.review_comment_message,
    cast(r.review_creation_date as date) as review_date,
    r.review_answer_timestamp,

    -- order context
    o.order_date,
    o.order_status

from reviews r
inner join orders o
    on r.order_id = o.order_id
