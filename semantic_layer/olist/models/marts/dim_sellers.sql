-- Seller dimension table.
-- 3,095 sellers across 23 of 27 Brazilian states.

select
    seller_id,
    seller_zip_code_prefix,
    seller_city,
    seller_state

from {{ ref('stg_olist__sellers') }}
