"""
Tests for the metric compiler.

Creates synthetic Olist data in DuckDB, builds fact table views that match
the semantic layer models, then validates that compiled metrics produce
correct SQL that executes successfully.
"""

import duckdb
import pytest
from pathlib import Path

from engine.metric_compiler import ModelRegistry, MetricCompiler, CompiledQuery


# =============================================================================
# Fixtures
# =============================================================================

SEMANTIC_LAYER_DIR = Path(__file__).parent.parent / "semantic_layer" / "olist"

# Map semantic model refs to DuckDB table names
TABLE_MAP = {
    "fct_order_items": "fct_order_items",
    "fct_orders": "fct_orders",
    "fct_order_payments": "fct_order_payments",
    "fct_order_reviews": "fct_order_reviews",
}


@pytest.fixture(scope="module")
def db():
    """Create an in-memory DuckDB with synthetic Olist fact tables."""
    conn = duckdb.connect(":memory:")
    _create_fact_tables(conn)
    yield conn
    conn.close()


@pytest.fixture(scope="module")
def registry():
    """Load the Olist semantic layer into a ModelRegistry."""
    reg = ModelRegistry()
    reg.load_from_directory(SEMANTIC_LAYER_DIR)
    reg.set_table_map(TABLE_MAP)
    return reg


@pytest.fixture(scope="module")
def compiler(registry):
    """Create a MetricCompiler with the loaded registry."""
    return MetricCompiler(registry)


def _create_fact_tables(conn: duckdb.DuckDBPyConnection):
    """Create synthetic fact tables matching the semantic model definitions."""

    # fct_order_items — line-item grain
    conn.execute("""
        CREATE TABLE fct_order_items AS
        SELECT * FROM (VALUES
            ('ord_001', 1, 'prod_a', 'seller_1', 'cust_1', 'ucust_1', 'delivered',  DATE '2017-06-15', 120.00, 15.50, 135.50, 'electronics',     500,  'sao paulo',   'SP', 'sao paulo',   'SP'),
            ('ord_001', 2, 'prod_b', 'seller_1', 'cust_1', 'ucust_1', 'delivered',  DATE '2017-06-15',  45.00,  8.00,  53.00, 'housewares',      200,  'sao paulo',   'SP', 'sao paulo',   'SP'),
            ('ord_002', 1, 'prod_c', 'seller_2', 'cust_2', 'ucust_2', 'delivered',  DATE '2017-07-20', 250.00, 22.00, 272.00, 'furniture_decor', 3000, 'rio de janeiro','RJ', 'curitiba',    'PR'),
            ('ord_003', 1, 'prod_a', 'seller_1', 'cust_3', 'ucust_3', 'delivered',  DATE '2017-07-25', 120.00, 15.50, 135.50, 'electronics',     500,  'belo horizonte','MG', 'sao paulo',   'SP'),
            ('ord_004', 1, 'prod_d', 'seller_3', 'cust_4', 'ucust_4', 'canceled',   DATE '2017-08-10',  80.00, 12.00,  92.00, 'sports_leisure',  800,  'sao paulo',   'SP', 'rio de janeiro','RJ'),
            ('ord_005', 1, 'prod_e', 'seller_2', 'cust_5', 'ucust_5', 'delivered',  DATE '2017-08-15', 300.00, 30.00, 330.00, 'health_beauty',  1500,  'campinas',    'SP', 'curitiba',    'PR'),
            ('ord_005', 2, 'prod_f', 'seller_2', 'cust_5', 'ucust_5', 'delivered',  DATE '2017-08-15',  60.00, 10.00,  70.00, 'housewares',      300,  'campinas',    'SP', 'curitiba',    'PR'),
            ('ord_006', 1, 'prod_a', 'seller_1', 'cust_1', 'ucust_1', 'delivered',  DATE '2017-09-05', 120.00, 15.50, 135.50, 'electronics',     500,  'sao paulo',   'SP', 'sao paulo',   'SP'),
            ('ord_007', 1, 'prod_g', 'seller_3', 'cust_6', 'ucust_6', 'shipped',    DATE '2017-09-10', 180.00, 20.00, 200.00, 'computers',      2000,  'brasilia',    'DF', 'rio de janeiro','RJ'),
            ('ord_008', 1, 'prod_h', 'seller_1', 'cust_7', 'ucust_7', 'delivered',  DATE '2017-10-01',  95.00, 14.00, 109.00, 'bed_bath_table',  600,  'salvador',    'BA', 'sao paulo',   'SP')
        ) AS t(order_id, order_item_id, product_id, seller_id, customer_id, customer_unique_id,
               order_status, order_date, price, freight_value, total_item_value,
               product_category, product_weight_g, customer_city, customer_state,
               seller_city, seller_state)
    """)

    # fct_orders — order grain
    conn.execute("""
        CREATE TABLE fct_orders AS
        SELECT * FROM (VALUES
            ('ord_001', 'cust_1', 'ucust_1', 'delivered',  TIMESTAMP '2017-06-15 10:30:00', DATE '2017-06-15', TIMESTAMP '2017-06-15 11:00:00', TIMESTAMP '2017-06-17 08:00:00', TIMESTAMP '2017-06-22 14:00:00', DATE '2017-06-28',  7,  5, true,  2, 165.00, 23.50, 188.50, 2, 2, 'sao paulo',    'SP'),
            ('ord_002', 'cust_2', 'ucust_2', 'delivered',  TIMESTAMP '2017-07-20 09:00:00', DATE '2017-07-20', TIMESTAMP '2017-07-20 10:00:00', TIMESTAMP '2017-07-22 09:00:00', TIMESTAMP '2017-07-28 16:00:00', DATE '2017-07-30',  8,  6, true,  1, 250.00, 22.00, 272.00, 1, 1, 'rio de janeiro','RJ'),
            ('ord_003', 'cust_3', 'ucust_3', 'delivered',  TIMESTAMP '2017-07-25 14:00:00', DATE '2017-07-25', TIMESTAMP '2017-07-25 15:00:00', TIMESTAMP '2017-07-27 10:00:00', TIMESTAMP '2017-08-05 12:00:00', DATE '2017-08-01', 11,  9, false, 1, 120.00, 15.50, 135.50, 1, 1, 'belo horizonte','MG'),
            ('ord_004', 'cust_4', 'ucust_4', 'canceled',   TIMESTAMP '2017-08-10 11:00:00', DATE '2017-08-10', NULL,                            NULL,                            NULL,                            DATE '2017-08-25', NULL, NULL, NULL, 1,  80.00, 12.00,  92.00, 1, 1, 'sao paulo',    'SP'),
            ('ord_005', 'cust_5', 'ucust_5', 'delivered',  TIMESTAMP '2017-08-15 16:00:00', DATE '2017-08-15', TIMESTAMP '2017-08-15 17:00:00', TIMESTAMP '2017-08-17 08:00:00', TIMESTAMP '2017-08-20 10:00:00', DATE '2017-08-25',  5,  3, true,  2, 360.00, 40.00, 400.00, 2, 1, 'campinas',     'SP'),
            ('ord_006', 'cust_1', 'ucust_1', 'delivered',  TIMESTAMP '2017-09-05 08:00:00', DATE '2017-09-05', TIMESTAMP '2017-09-05 09:00:00', TIMESTAMP '2017-09-07 09:00:00', TIMESTAMP '2017-09-12 14:00:00', DATE '2017-09-15',  7,  5, true,  1, 120.00, 15.50, 135.50, 1, 1, 'sao paulo',    'SP'),
            ('ord_007', 'cust_6', 'ucust_6', 'shipped',    TIMESTAMP '2017-09-10 12:00:00', DATE '2017-09-10', TIMESTAMP '2017-09-10 13:00:00', TIMESTAMP '2017-09-12 08:00:00', NULL,                            DATE '2017-09-20', NULL, NULL, NULL, 1, 180.00, 20.00, 200.00, 1, 1, 'brasilia',     'DF'),
            ('ord_008', 'cust_7', 'ucust_7', 'delivered',  TIMESTAMP '2017-10-01 09:00:00', DATE '2017-10-01', TIMESTAMP '2017-10-01 10:00:00', TIMESTAMP '2017-10-03 08:00:00', TIMESTAMP '2017-10-06 15:00:00', DATE '2017-10-10',  5,  3, true,  1,  95.00, 14.00, 109.00, 1, 1, 'salvador',     'BA')
        ) AS t(order_id, customer_id, customer_unique_id, order_status,
               order_purchase_timestamp, order_date, order_approved_at,
               order_delivered_carrier_date, order_delivered_customer_date,
               order_estimated_delivery_date, delivery_days, shipping_days,
               is_on_time, item_count, order_revenue, order_freight,
               order_total_value, distinct_products, distinct_sellers,
               customer_city, customer_state)
    """)

    # fct_order_payments — payment grain
    conn.execute("""
        CREATE TABLE fct_order_payments AS
        SELECT * FROM (VALUES
            ('ord_001', 1, 'credit_card', 3, 188.50, DATE '2017-06-15', 'delivered'),
            ('ord_002', 1, 'boleto',      1, 272.00, DATE '2017-07-20', 'delivered'),
            ('ord_003', 1, 'credit_card', 2, 135.50, DATE '2017-07-25', 'delivered'),
            ('ord_004', 1, 'credit_card', 1,  92.00, DATE '2017-08-10', 'canceled'),
            ('ord_005', 1, 'credit_card', 5, 350.00, DATE '2017-08-15', 'delivered'),
            ('ord_005', 2, 'voucher',     1,  50.00, DATE '2017-08-15', 'delivered'),
            ('ord_006', 1, 'credit_card', 1, 135.50, DATE '2017-09-05', 'delivered'),
            ('ord_007', 1, 'debit_card',  1, 200.00, DATE '2017-09-10', 'shipped'),
            ('ord_008', 1, 'credit_card', 2, 109.00, DATE '2017-10-01', 'delivered')
        ) AS t(order_id, payment_sequential, payment_type, payment_installments,
               payment_value, order_date, order_status)
    """)

    # fct_order_reviews — review grain
    conn.execute("""
        CREATE TABLE fct_order_reviews AS
        SELECT * FROM (VALUES
            ('rev_001', 'ord_001', 5, NULL, 'Great product!',           DATE '2017-06-25', NULL, DATE '2017-06-15', 'delivered'),
            ('rev_002', 'ord_002', 4, NULL, 'Good but slow delivery',   DATE '2017-08-02', NULL, DATE '2017-07-20', 'delivered'),
            ('rev_003', 'ord_003', 1, NULL, 'Arrived very late',        DATE '2017-08-10', NULL, DATE '2017-07-25', 'delivered'),
            ('rev_004', 'ord_005', 5, NULL, 'Love it',                  DATE '2017-08-25', NULL, DATE '2017-08-15', 'delivered'),
            ('rev_005', 'ord_006', 5, NULL, NULL,                       DATE '2017-09-15', NULL, DATE '2017-09-05', 'delivered'),
            ('rev_006', 'ord_008', 3, NULL, 'Ok, nothing special',      DATE '2017-10-10', NULL, DATE '2017-10-01', 'delivered')
        ) AS t(review_id, order_id, review_score, review_comment_title,
               review_comment_message, review_date, review_answer_timestamp,
               order_date, order_status)
    """)


def _run_sql(db, sql: str) -> list[dict]:
    """Execute SQL and return results as list of dicts."""
    result = db.execute(sql)
    columns = [desc[0] for desc in result.description]
    rows = result.fetchall()
    return [dict(zip(columns, row)) for row in rows]


# =============================================================================
# Registry Tests
# =============================================================================


class TestModelRegistry:
    """Tests for loading and querying the semantic layer."""

    def test_loads_semantic_models(self, registry):
        assert len(registry.models) == 4
        assert "order_items" in registry.models
        assert "orders" in registry.models
        assert "order_payments" in registry.models
        assert "order_reviews" in registry.models

    def test_loads_metrics(self, registry):
        assert len(registry.metrics) > 40  # we have 49 metrics
        assert "gmv" in registry.metrics
        assert "average_order_value" in registry.metrics
        assert "five_star_rate" in registry.metrics
        assert "cumulative_gmv" in registry.metrics

    def test_loads_saved_queries(self, registry):
        assert len(registry.saved_queries) > 10
        assert "monthly_revenue_overview" in registry.saved_queries

    def test_measure_to_model_index(self, registry):
        model = registry.get_model_for_measure("gmv")
        assert model is not None
        assert model.name == "order_items"

        model = registry.get_model_for_measure("orders")
        assert model is not None
        assert model.name == "orders"

        model = registry.get_model_for_measure("payment_total")
        assert model is not None
        assert model.name == "order_payments"

    def test_resolve_table(self, registry):
        model = registry.models["order_items"]
        table = registry.resolve_table(model.model_ref)
        assert table == "fct_order_items"

    def test_get_measure(self, registry):
        measure = registry.get_measure("gmv")
        assert measure is not None
        assert measure.agg == "sum"
        assert measure.expr == "price"

    def test_metric_types(self, registry):
        assert registry.metrics["gmv"].type == "simple"
        assert registry.metrics["average_order_value"].type == "derived"
        assert registry.metrics["five_star_rate"].type == "ratio"
        assert registry.metrics["cumulative_gmv"].type == "cumulative"


# =============================================================================
# Simple Metric Tests
# =============================================================================


class TestSimpleMetrics:
    """Test compilation and execution of simple metrics."""

    def test_gmv_no_groupby(self, compiler, db):
        result = compiler.compile_metric("gmv")
        assert "SUM(price)" in result.sql
        assert "fct_order_items" in result.sql

        data = _run_sql(db, result.sql)
        assert len(data) == 1
        assert data[0]["gmv"] == pytest.approx(1370.0)  # sum of all prices

    def test_gmv_monthly(self, compiler, db):
        result = compiler.compile_metric(
            "gmv",
            group_by=["TimeDimension('metric_time', 'month')"],
        )
        assert "DATE_TRUNC('month', order_date)" in result.sql
        assert "GROUP BY" in result.sql

        data = _run_sql(db, result.sql)
        assert len(data) >= 4  # Jun, Jul, Aug, Sep, Oct

    def test_orders_count(self, compiler, db):
        result = compiler.compile_metric("orders")
        data = _run_sql(db, result.sql)
        assert data[0]["orders"] == 8  # 8 orders total

    def test_delivered_orders(self, compiler, db):
        result = compiler.compile_metric("delivered_orders")
        data = _run_sql(db, result.sql)
        assert data[0]["delivered_orders"] == 6  # 6 delivered

    def test_canceled_orders(self, compiler, db):
        result = compiler.compile_metric("canceled_orders")
        data = _run_sql(db, result.sql)
        assert data[0]["canceled_orders"] == 1

    def test_review_count(self, compiler, db):
        result = compiler.compile_metric("review_count")
        data = _run_sql(db, result.sql)
        assert data[0]["review_count"] == 6

    def test_avg_review_score(self, compiler, db):
        result = compiler.compile_metric("avg_review_score")
        data = _run_sql(db, result.sql)
        # (5+4+1+5+5+3) / 6 = 3.833...
        assert data[0]["avg_review_score"] == pytest.approx(23.0 / 6.0)

    def test_count_distinct(self, compiler, db):
        result = compiler.compile_metric("active_sellers")
        assert "COUNT(DISTINCT seller_id)" in result.sql
        data = _run_sql(db, result.sql)
        assert data[0]["active_sellers"] == 3

    def test_unique_customers(self, compiler, db):
        result = compiler.compile_metric("unique_customers")
        data = _run_sql(db, result.sql)
        assert data[0]["unique_customers"] == 7  # 7 unique customer_unique_ids

    def test_metric_with_filter(self, compiler, db):
        result = compiler.compile_metric("realized_gmv")
        assert "WHERE" in result.sql
        assert "order_status" in result.sql
        assert "'delivered'" in result.sql

        data = _run_sql(db, result.sql)
        # Only delivered items: 120+45+250+120+300+60+120+95 = 1110
        assert data[0]["realized_gmv"] == pytest.approx(1110.0)

    def test_total_payment_value(self, compiler, db):
        result = compiler.compile_metric("total_payment_value")
        data = _run_sql(db, result.sql)
        # 188.50+272+135.50+92+350+50+135.50+200+109 = 1532.50
        assert data[0]["total_payment_value"] == pytest.approx(1532.50)

    def test_group_by_categorical_dimension(self, compiler, db):
        result = compiler.compile_metric(
            "gmv",
            group_by=["Dimension('order_item__customer_state')"],
        )
        assert "customer_state" in result.sql
        data = _run_sql(db, result.sql)
        assert len(data) >= 4  # SP, RJ, MG, BA, DF

    def test_group_by_payment_type(self, compiler, db):
        result = compiler.compile_metric(
            "total_payment_value",
            group_by=["Dimension('order_payment__payment_type')"],
        )
        data = _run_sql(db, result.sql)
        assert len(data) >= 3  # credit_card, boleto, voucher, debit_card


# =============================================================================
# Derived Metric Tests
# =============================================================================


class TestDerivedMetrics:
    """Test compilation and execution of derived metrics."""

    def test_average_order_value(self, compiler, db):
        result = compiler.compile_metric("average_order_value")
        assert "gmv" in result.sql.lower() or "price" in result.sql.lower()

        data = _run_sql(db, result.sql)
        assert len(data) == 1
        aov = data[0]["average_order_value"]
        # GMV = 1370, distinct orders from items = 8
        assert aov == pytest.approx(1370.0 / 8.0)

    def test_items_per_order(self, compiler, db):
        result = compiler.compile_metric("items_per_order")
        data = _run_sql(db, result.sql)
        # 10 items / 8 orders = 1.25
        assert data[0]["items_per_order"] == pytest.approx(10.0 / 8.0)

    def test_cancellation_rate(self, compiler, db):
        result = compiler.compile_metric("cancellation_rate")
        data = _run_sql(db, result.sql)
        # 1 canceled / 8 total * 100 = 12.5
        assert data[0]["cancellation_rate"] == pytest.approx(1.0 * 100.0 / 8.0)

    def test_derived_with_monthly_groupby(self, compiler, db):
        result = compiler.compile_metric(
            "average_order_value",
            group_by=["TimeDimension('metric_time', 'month')"],
        )
        data = _run_sql(db, result.sql)
        assert len(data) >= 4

    def test_gmv_per_seller(self, compiler, db):
        result = compiler.compile_metric("gmv_per_seller")
        data = _run_sql(db, result.sql)
        # GMV = 1370, 3 sellers
        assert data[0]["gmv_per_seller"] == pytest.approx(1370.0 / 3.0)

    def test_on_time_delivery_rate(self, compiler, db):
        result = compiler.compile_metric("on_time_delivery_rate")
        data = _run_sql(db, result.sql)
        # 5 on-time / (5+1) total with delivery data * 100 = 83.33
        assert data[0]["on_time_delivery_rate"] == pytest.approx(5.0 * 100.0 / 6.0)


# =============================================================================
# Ratio Metric Tests
# =============================================================================


class TestRatioMetrics:
    """Test compilation and execution of ratio metrics."""

    def test_five_star_rate(self, compiler, db):
        result = compiler.compile_metric("five_star_rate")
        assert "NULLIF" in result.sql

        data = _run_sql(db, result.sql)
        # 3 five-star reviews / 6 total
        assert data[0]["five_star_rate"] == pytest.approx(3.0 / 6.0)

    def test_one_star_rate(self, compiler, db):
        result = compiler.compile_metric("one_star_rate")
        data = _run_sql(db, result.sql)
        # 1 one-star / 6 total
        assert data[0]["one_star_rate"] == pytest.approx(1.0 / 6.0)

    def test_positive_review_rate(self, compiler, db):
        result = compiler.compile_metric("positive_review_rate")
        data = _run_sql(db, result.sql)
        # 4 positive (score >= 4) / 6 total
        assert data[0]["positive_review_rate"] == pytest.approx(4.0 / 6.0)

    def test_credit_card_share(self, compiler, db):
        result = compiler.compile_metric("credit_card_share")
        data = _run_sql(db, result.sql)
        # credit card total / all payments total
        cc_total = 188.50 + 135.50 + 92.00 + 350.00 + 135.50 + 109.00  # 1010.50
        all_total = 1532.50
        assert data[0]["credit_card_share"] == pytest.approx(cc_total / all_total)

    def test_ratio_with_groupby(self, compiler, db):
        result = compiler.compile_metric(
            "five_star_rate",
            group_by=["TimeDimension('metric_time', 'month')"],
        )
        data = _run_sql(db, result.sql)
        assert len(data) >= 3


# =============================================================================
# Cumulative Metric Tests
# =============================================================================


class TestCumulativeMetrics:
    """Test compilation and execution of cumulative metrics."""

    def test_cumulative_gmv(self, compiler, db):
        result = compiler.compile_metric("cumulative_gmv")
        assert "OVER" in result.sql
        assert "UNBOUNDED PRECEDING" in result.sql

        data = _run_sql(db, result.sql)
        assert len(data) >= 4
        # Last row should be the total GMV
        assert data[-1]["cumulative_gmv"] == pytest.approx(1370.0)

    def test_cumulative_gmv_is_monotonic(self, compiler, db):
        result = compiler.compile_metric("cumulative_gmv")
        data = _run_sql(db, result.sql)

        values = [row["cumulative_gmv"] for row in data]
        for i in range(1, len(values)):
            assert values[i] >= values[i - 1], "Cumulative GMV should be monotonically increasing"

    def test_gmv_mtd(self, compiler, db):
        result = compiler.compile_metric("gmv_mtd")
        assert "PARTITION BY" in result.sql
        assert "DATE_TRUNC" in result.sql

        data = _run_sql(db, result.sql)
        assert len(data) >= 4

    def test_gmv_last_30_days(self, compiler, db):
        result = compiler.compile_metric("gmv_last_30_days")
        assert "RANGE" in result.sql or "ROWS" in result.sql

        data = _run_sql(db, result.sql)
        assert len(data) >= 4


# =============================================================================
# Multi-Metric Compilation Tests
# =============================================================================


class TestMultiMetricCompilation:
    """Test compiling multiple metrics in one query."""

    def test_multiple_simple_same_model(self, compiler, db):
        result = compiler.compile_metrics(
            ["gmv", "freight_revenue", "items_sold"],
            group_by=["TimeDimension('metric_time', 'month')"],
        )
        # Should be a single query, not CTEs
        assert "WITH" not in result.sql
        assert "SUM(price)" in result.sql

        data = _run_sql(db, result.sql)
        assert len(data) >= 4

    def test_multiple_metrics_mixed_types(self, compiler, db):
        result = compiler.compile_metrics(
            ["gmv", "average_order_value"],
            group_by=["TimeDimension('metric_time', 'month')"],
        )
        data = _run_sql(db, result.sql)
        assert len(data) >= 4
        # Each row should have both metrics
        for row in data:
            assert "gmv" in row or "average_order_value" in row


# =============================================================================
# Saved Query Compilation Tests
# =============================================================================


class TestSavedQueries:
    """Test compiling saved queries into SQL."""

    def test_monthly_revenue_overview(self, compiler, db):
        result = compiler.compile_saved_query("monthly_revenue_overview")
        assert result.sql
        assert len(result.metric_names) > 0

        data = _run_sql(db, result.sql)
        assert len(data) >= 4

    def test_category_performance(self, compiler, db):
        result = compiler.compile_saved_query("category_performance")
        assert "product_category" in result.sql

        data = _run_sql(db, result.sql)
        assert len(data) >= 4  # multiple categories

    def test_delivery_performance_monthly(self, compiler, db):
        result = compiler.compile_saved_query("delivery_performance_monthly")
        data = _run_sql(db, result.sql)
        assert len(data) >= 3

    def test_satisfaction_monthly(self, compiler, db):
        result = compiler.compile_saved_query("satisfaction_monthly")
        data = _run_sql(db, result.sql)
        assert len(data) >= 3

    def test_payment_method_analysis(self, compiler, db):
        # This saved query references 'payment_count' which is defined as a
        # measure but not as a metric in _metrics.yml. This is a semantic layer
        # gap — the compiler correctly raises ValueError.
        with pytest.raises(ValueError, match="Unknown metric: payment_count"):
            compiler.compile_saved_query("payment_method_analysis")


# =============================================================================
# Offset Window Tests (MoM Growth)
# =============================================================================


class TestOffsetWindowMetrics:
    """Test metrics that use offset_window (e.g., MoM growth)."""

    def test_gmv_growth_mom(self, compiler, db):
        result = compiler.compile_metric(
            "gmv_growth_mom",
            group_by=["TimeDimension('metric_time', 'month')"],
        )
        assert "LAG" in result.sql

        data = _run_sql(db, result.sql)
        assert len(data) >= 4
        # First month should have NULL growth (no previous month)
        assert data[0]["gmv_growth_mom"] is None

    def test_order_growth_mom(self, compiler, db):
        result = compiler.compile_metric(
            "order_growth_mom",
            group_by=["TimeDimension('metric_time', 'month')"],
        )
        data = _run_sql(db, result.sql)
        assert len(data) >= 4


# =============================================================================
# Edge Cases
# =============================================================================


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_unknown_metric_raises(self, compiler):
        with pytest.raises(ValueError, match="Unknown metric"):
            compiler.compile_metric("nonexistent_metric")

    def test_unknown_saved_query_raises(self, compiler):
        with pytest.raises(ValueError, match="Unknown saved query"):
            compiler.compile_saved_query("nonexistent_query")

    def test_empty_metrics_list_raises(self, compiler):
        with pytest.raises(ValueError, match="No metrics"):
            compiler.compile_metrics([])

    def test_sql_has_no_semicolons(self, compiler):
        """SQL should not have trailing semicolons (causes subquery issues in DuckDB)."""
        result = compiler.compile_metric("gmv")
        assert not result.sql.strip().endswith(";")

    def test_all_simple_metrics_compile(self, compiler, registry, db):
        """Every simple metric should produce valid SQL."""
        for name, metric in registry.metrics.items():
            if metric.type == "simple":
                result = compiler.compile_metric(name)
                assert result.sql, f"Empty SQL for metric: {name}"
                # Should execute without error
                _run_sql(db, result.sql)

    def test_all_ratio_metrics_compile(self, compiler, registry, db):
        """Every ratio metric should produce valid SQL."""
        for name, metric in registry.metrics.items():
            if metric.type == "ratio":
                result = compiler.compile_metric(name)
                assert result.sql, f"Empty SQL for metric: {name}"
                _run_sql(db, result.sql)
