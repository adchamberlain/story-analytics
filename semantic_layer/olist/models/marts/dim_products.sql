-- Product dimension with English category names.
-- Joins products with the Portuguese-to-English category translation table.
-- Products without a category (1.9%) get 'uncategorized'.

with products as (

    select * from {{ ref('stg_olist__products') }}

),

category_translation as (

    select * from {{ source('olist', 'product_category_translation') }}

)

select
    p.product_id,
    p.product_category_name,
    coalesce(t.product_category_name_english, 'uncategorized') as product_category,
    p.product_name_length,
    p.product_description_length,
    p.product_photos_qty,
    p.product_weight_g,
    p.product_length_cm,
    p.product_height_cm,
    p.product_width_cm

from products p
left join category_translation t
    on p.product_category_name = t.product_category_name
