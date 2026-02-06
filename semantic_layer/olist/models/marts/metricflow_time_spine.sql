-- MetricFlow time spine: one row per day covering the full Olist dataset
-- range (Sept 2016 - Oct 2018) plus buffer on both ends.
-- Required for cumulative metrics and offset windows.

{{
    config(materialized='table')
}}

with date_spine as (

    {{ dbt_utils.date_spine(
        datepart="day",
        start_date="cast('2016-01-01' as date)",
        end_date="cast('2019-12-31' as date)"
    ) }}

)

select
    cast(date_day as date) as date_day

from date_spine
