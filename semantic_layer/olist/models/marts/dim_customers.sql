-- Customer dimension at the unique customer level.
-- Deduplicates from the per-order customer_id to the true customer_unique_id.
-- Takes the most recent geographic info per unique customer.

with customers as (

    select * from {{ ref('stg_olist__customers') }}

),

deduplicated as (

    select
        customer_unique_id,
        customer_zip_code_prefix,
        customer_city,
        customer_state,
        row_number() over (
            partition by customer_unique_id
            order by customer_id desc
        ) as row_num

    from customers

)

select
    customer_unique_id,
    customer_zip_code_prefix,
    customer_city,
    customer_state

from deduplicated
where row_num = 1
