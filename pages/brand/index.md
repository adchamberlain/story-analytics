# Story Analytics Brand Showcase

<style>
/* Base card with subtle gradient and colored shadow */
.chart-card {
    background: linear-gradient(145deg, #ffffff 0%, #f8fafc 50%, #f1f5f9 100%);
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 28px;
    margin: 28px 0;
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.08), 0 1px 3px rgba(0,0,0,0.04);
    transition: all 0.2s ease;
}
.chart-card:hover {
    box-shadow: 0 8px 30px rgba(99, 102, 241, 0.12), 0 2px 6px rgba(0,0,0,0.06);
    transform: translateY(-1px);
}

/* Accent card with stronger gradient */
.chart-card-accent {
    background: linear-gradient(145deg, #fafbff 0%, #f0f4ff 50%, #e8edff 100%);
    border: 1px solid #c7d2fe;
    border-radius: 12px;
    padding: 28px;
    margin: 28px 0;
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.12), 0 1px 3px rgba(99, 102, 241, 0.08);
    transition: all 0.2s ease;
}
.chart-card-accent:hover {
    box-shadow: 0 8px 30px rgba(99, 102, 241, 0.18), 0 2px 6px rgba(99, 102, 241, 0.1);
    transform: translateY(-1px);
}

/* Warm accent card for variety */
.chart-card-warm {
    background: linear-gradient(145deg, #fffbf7 0%, #fff5eb 50%, #ffedd5 100%);
    border: 1px solid #fed7aa;
    border-radius: 12px;
    padding: 28px;
    margin: 28px 0;
    box-shadow: 0 4px 20px rgba(249, 115, 22, 0.08), 0 1px 3px rgba(0,0,0,0.04);
    transition: all 0.2s ease;
}
.chart-card-warm:hover {
    box-shadow: 0 8px 30px rgba(249, 115, 22, 0.15), 0 2px 6px rgba(0,0,0,0.06);
    transform: translateY(-1px);
}

/* KPI Grid */
.metric-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin: 28px 0;
}

.metric-card {
    background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 24px 20px;
    text-align: center;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
}
.metric-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #e2e8f0 0%, #cbd5e1 100%);
}
.metric-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0,0,0,0.08);
}

.metric-card-highlight {
    background: #6366f1;
    border: none;
    border-radius: 12px;
    padding: 24px 20px;
    text-align: center;
    color: white;
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.35);
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
}
.metric-card-highlight:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(99, 102, 241, 0.45);
}

.metric-card-positive {
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    border-radius: 12px;
    padding: 24px 20px;
    text-align: center;
    transition: all 0.2s ease;
    position: relative;
}
.metric-card-positive::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: #6366f1;
}
.metric-card-positive:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(99, 102, 241, 0.15);
}

/* Section styling */
.section-intro {
    font-size: 1.15rem;
    color: #64748b;
    margin-bottom: 36px;
    max-width: 640px;
    line-height: 1.6;
}

.section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 48px;
    margin-bottom: 8px;
}

.section-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    background: linear-gradient(135deg, #6366f1 0%, #7c9eff 100%);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 20px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* Trend indicator */
.trend-up {
    color: #10b981;
    font-weight: 600;
}
.trend-down {
    color: #f43f5e;
    font-weight: 600;
}

/* Progress bar for KPIs */
.kpi-progress {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(0,0,0,0.06);
}
.kpi-progress-bar {
    height: 6px;
    background: #e2e8f0;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 6px;
}
.kpi-progress-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.5s ease;
}
.kpi-progress-fill.green {
    background: #6366f1;
}
.kpi-progress-fill.amber {
    background: #a5b4fc;
}
.kpi-progress-fill.red {
    background: #4338ca;
}
.kpi-progress-text {
    font-size: 0.75rem;
    color: #64748b;
    display: flex;
    justify-content: space-between;
}
.kpi-progress-text span {
    font-weight: 500;
}

/* Highlight card progress bar adjustments */
.metric-card-highlight .kpi-progress {
    border-top-color: rgba(255,255,255,0.2);
}
.metric-card-highlight .kpi-progress-bar {
    background: rgba(255,255,255,0.25);
}
.metric-card-highlight .kpi-progress-fill.green {
    background: rgba(255,255,255,0.9);
}
.metric-card-highlight .kpi-progress-text {
    color: rgba(255,255,255,0.85);
}
</style>

<p class="section-intro">
A polished, publication-ready visual language for Story Analytics.
<strong>Color system:</strong> Shades of indigo for all data, amber (#f59e0b) for annotations and callouts.
This creates visual consistency while allowing important elements to stand out.
</p>


```sql monthly_revenue
SELECT * FROM (VALUES
    ('2024-01', 142000),
    ('2024-02', 156000),
    ('2024-03', 148000),
    ('2024-04', 171000),
    ('2024-05', 189000),
    ('2024-06', 203000),
    ('2024-07', 195000),
    ('2024-08', 218000),
    ('2024-09', 234000),
    ('2024-10', 256000),
    ('2024-11', 278000),
    ('2024-12', 312000)
) AS t(month, revenue)
```

```sql category_breakdown
SELECT * FROM (VALUES
    ('Enterprise', 847000),
    ('Mid-Market', 523000),
    ('SMB', 312000),
    ('Startup', 156000)
) AS t(segment, revenue)
```

```sql multi_series
SELECT * FROM (VALUES
    ('2024-01', 89, 72, 45),
    ('2024-02', 94, 78, 52),
    ('2024-03', 87, 81, 48),
    ('2024-04', 102, 85, 61),
    ('2024-05', 118, 92, 58),
    ('2024-06', 125, 98, 67)
) AS t(month, product_a, product_b, product_c)
```

```sql kpi_data
SELECT
    2847000 as total_revenue,
    3200000 as revenue_goal,
    0.234 as growth_rate,
    0.20 as growth_goal,
    1847 as customers,
    2000 as customers_goal,
    0.92 as retention,
    0.95 as retention_goal
```

## Key Performance Indicators

<div class="metric-grid">
<div class="metric-card-highlight">
<BigValue
    data={kpi_data}
    value="total_revenue"
    title="Total Revenue"
    fmt="usd0"
/>
<div class="kpi-progress">
<div class="kpi-progress-bar">
<div class="kpi-progress-fill green" style="width: 89%"></div>
</div>
<div class="kpi-progress-text">
<span>89% to goal</span>
<span>$3.2M</span>
</div>
</div>
</div>
<div class="metric-card-positive">
<BigValue
    data={kpi_data}
    value="growth_rate"
    title="YoY Growth"
    fmt="pct1"
/>
<div class="kpi-progress">
<div class="kpi-progress-bar">
<div class="kpi-progress-fill green" style="width: 100%"></div>
</div>
<div class="kpi-progress-text">
<span>117% to goal</span>
<span>20%</span>
</div>
</div>
</div>
<div class="metric-card">
<BigValue
    data={kpi_data}
    value="customers"
    title="Active Customers"
    fmt="num0"
/>
<div class="kpi-progress">
<div class="kpi-progress-bar">
<div class="kpi-progress-fill green" style="width: 92%"></div>
</div>
<div class="kpi-progress-text">
<span>92% to goal</span>
<span>2,000</span>
</div>
</div>
</div>
<div class="metric-card">
<BigValue
    data={kpi_data}
    value="retention"
    title="Retention Rate"
    fmt="pct0"
/>
<div class="kpi-progress">
<div class="kpi-progress-bar">
<div class="kpi-progress-fill amber" style="width: 97%"></div>
</div>
<div class="kpi-progress-text">
<span>97% to goal</span>
<span>95%</span>
</div>
</div>
</div>
</div>

<div class="section-header">

## Revenue Trend

<span class="section-badge">Primary KPI</span>
</div>

<div class="chart-card-accent">

<LineChart
    data={monthly_revenue}
    x="month"
    y="revenue"
    yFmt="usd0k"
    title="Monthly Revenue Growth"
    subtitle="2024 fiscal year — record Q4 with 19% month-over-month growth in December"
    lineWidth=3
    markers=true
    markerShape="circle"
    markerSize=8
    chartAreaHeight=350
    sort=false
    echartsOptions={{
        grid: {
            left: '2%',
            right: '3%',
            bottom: '10%',
            top: '18%',
            containLabel: true
        },
        xAxis: {
            axisLine: {
                show: true,
                lineStyle: {
                    color: '#c7d2fe',
                    width: 1
                }
            },
            axisLabel: {
                color: '#4b5563',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'Inter, sans-serif',
                formatter: function(value) {
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthNum = parseInt(value.split('-')[1]) - 1;
                    return months[monthNum];
                }
            },
            axisTick: {
                show: false
            }
        },
        yAxis: {
            axisLine: {
                show: false
            },
            axisLabel: {
                color: '#9ca3af',
                fontSize: 11,
                fontFamily: 'Inter, sans-serif'
            },
            splitLine: {
                lineStyle: {
                    color: '#e0e7ff',
                    width: 1
                }
            }
        },
        series: [{
            smooth: 0.4,
            lineStyle: {
                width: 3.5,
                color: '#6366f1',
                shadowColor: 'rgba(99, 102, 241, 0.3)',
                shadowBlur: 8,
                shadowOffsetY: 4
            },
            itemStyle: {
                color: '#6366f1',
                borderWidth: 3,
                borderColor: '#fff',
                shadowColor: 'rgba(99, 102, 241, 0.4)',
                shadowBlur: 6
            },
            symbolSize: 10,
            areaStyle: {
                color: {
                    type: 'linear',
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [{
                        offset: 0, color: 'rgba(99, 102, 241, 0.25)'
                    }, {
                        offset: 0.5, color: 'rgba(99, 102, 241, 0.08)'
                    }, {
                        offset: 1, color: 'rgba(99, 102, 241, 0.01)'
                    }]
                }
            },
            emphasis: {
                itemStyle: {
                    borderWidth: 4,
                    shadowBlur: 15,
                    shadowColor: 'rgba(99, 102, 241, 0.5)'
                },
                scale: 1.3
            },
        }]
    }}
/>

</div>

<div class="section-header">

## Annotation Examples

<span class="section-badge">Patterns</span>
</div>

<div class="chart-card-accent">

<LineChart
    data={monthly_revenue}
    x="month"
    y="revenue"
    yFmt="usd0k"
    title="Revenue with Annotations"
    subtitle="Demonstrating point callouts, reference lines, and range highlighting"
    lineWidth=3
    markers=true
    markerSize=8
    chartAreaHeight=350
    sort=false
    echartsOptions={{
        grid: {
            left: '2%',
            right: '10%',
            bottom: '10%',
            top: '25%',
            containLabel: true
        },
        xAxis: {
            axisLine: {
                show: true,
                lineStyle: { color: '#c7d2fe', width: 1 }
            },
            axisLabel: {
                color: '#4b5563',
                fontSize: 12,
                fontWeight: 500,
                formatter: function(value) {
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthNum = parseInt(value.split('-')[1]) - 1;
                    return months[monthNum];
                }
            },
            axisTick: { show: false }
        },
        yAxis: {
            axisLine: { show: false },
            axisLabel: { color: '#9ca3af', fontSize: 11 },
            splitLine: {
                lineStyle: { color: '#e0e7ff', width: 1 }
            }
        },
        series: [{
            smooth: 0.3,
            lineStyle: {
                width: 3,
                color: '#6366f1'
            },
            itemStyle: {
                color: '#6366f1',
                borderWidth: 3,
                borderColor: '#fff'
            },
            symbolSize: 8,
            areaStyle: {
                color: {
                    type: 'linear',
                    x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                        { offset: 0, color: 'rgba(99, 102, 241, 0.15)' },
                        { offset: 1, color: 'rgba(99, 102, 241, 0.01)' }
                    ]
                }
            },
            markArea: {
                silent: true,
                itemStyle: {
                    color: 'rgba(245, 158, 11, 0.08)',
                    borderColor: 'rgba(245, 158, 11, 0.4)',
                    borderWidth: 1,
                    borderType: 'dashed'
                },
                label: {
                    show: true,
                    position: 'insideTop',
                    color: '#b45309',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: [6, 10]
                },
                data: [[
                    { name: 'Q2 Campaign', xAxis: '2024-04' },
                    { xAxis: '2024-06' }
                ]]
            },
            markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: {
                    color: '#f59e0b',
                    width: 2,
                    type: 'dashed'
                },
                label: {
                    show: true,
                    position: 'insideEndTop',
                    color: '#92400e',
                    fontSize: 13,
                    fontWeight: 600,
                    backgroundColor: 'rgba(255, 251, 235, 0.75)',
                    padding: [6, 10],
                    borderRadius: 4,
                    formatter: 'Target: $250k'
                },
                data: [
                    { yAxis: 250000 }
                ]
            },
            markPoint: {
                symbol: 'circle',
                symbolSize: 14,
                itemStyle: {
                    color: '#fff',
                    borderColor: '#f59e0b',
                    borderWidth: 3,
                    shadowColor: 'rgba(245, 158, 11, 0.4)',
                    shadowBlur: 8
                },
                label: {
                    show: true,
                    position: 'top',
                    distance: 14,
                    color: '#92400e',
                    fontSize: 13,
                    fontWeight: 600,
                    backgroundColor: 'rgba(255, 251, 235, 0.75)',
                    padding: [8, 12],
                    borderRadius: 6,
                    formatter: function(params) {
                        return 'Record: $312k';
                    }
                },
                data: [
                    { type: 'max' }
                ]
            }
        }]
    }}
/>

**Annotation patterns shown:**
- **Range highlight (amber area):** Q2 campaign period marked with `markArea`
- **Reference line (amber dashed):** Target threshold with `markLine`
- **Point callout (amber circle):** Record month with `markPoint` — positioned above, with label pill

*Design system: All data in indigo shades, amber (#f59e0b) reserved exclusively for annotations and callouts. The warm golden accent provides gentle contrast without competing with the data.*

</div>

<div class="section-header">

## Revenue by Segment

<span class="section-badge">Breakdown</span>
</div>

<div class="chart-card-accent">

<BarChart
    data={category_breakdown}
    x="segment"
    y="revenue"
    yFmt="usd0k"
    title="Revenue Distribution"
    subtitle="Enterprise accounts drive 46% of total revenue — focus area for Q1"
    swapXY=true
    labels=true
    labelPosition="outside"
    labelFmt="usd0k"
    chartAreaHeight=400
    echartsOptions={{
        grid: {
            left: '2%',
            right: '14%',
            bottom: '8%',
            top: '22%',
            containLabel: true
        },
        xAxis: {
            axisLine: {
                show: false
            },
            axisLabel: {
                show: false
            },
            splitLine: {
                show: false
            }
        },
        yAxis: {
            axisLine: {
                show: false
            },
            axisLabel: {
                color: '#1e293b',
                fontSize: 13,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600
            },
            axisTick: {
                show: false
            }
        },
        series: [{
            barWidth: 48,
            itemStyle: {
                borderRadius: [0, 8, 8, 0],
                color: '#6366f1',
                shadowColor: 'rgba(99, 102, 241, 0.25)',
                shadowBlur: 8,
                shadowOffsetX: 4
            },
            label: {
                show: true,
                position: 'right',
                color: '#475569',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'Inter, sans-serif',
                distance: 12
            },
            emphasis: {
                itemStyle: {
                    shadowBlur: 15,
                    shadowColor: 'rgba(99, 102, 241, 0.4)'
                }
            }
        }]
    }}
/>

</div>

<div class="section-header">

## Product Performance

<span class="section-badge">Trends</span>
</div>

<div class="chart-card-accent">

<LineChart
    data={multi_series}
    x="month"
    y={["product_a", "product_b", "product_c"]}
    yAxisLabels={["Product A", "Product B", "Product C"]}
    title="Product Line Trends"
    subtitle="Units sold by product — Product A leads with 40% of total volume"
    lineWidth=3
    seriesColors={["#3730a3", "#6366f1", "#a5b4fc"]}
    chartAreaHeight=350
    sort=false
    echartsOptions={{
        grid: {
            left: '2%',
            right: '3%',
            bottom: '18%',
            top: '18%',
            containLabel: true
        },
        tooltip: {
            formatter: function(params) {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const nameMap = {
                    'product_a': 'Product A',
                    'product_b': 'Product B',
                    'product_c': 'Product C'
                };
                let dateStr = params[0].axisValue;
                let monthNum = parseInt(dateStr.split('-')[1]) - 1;
                let monthName = months[monthNum];
                let result = '<strong>' + monthName + '</strong><br/>';
                params.forEach(function(item) {
                    let name = nameMap[item.seriesName] || item.seriesName;
                    result += item.marker + ' ' + name + ': ' + item.value[1] + '<br/>';
                });
                return result;
            }
        },
        legend: {
            show: true,
            bottom: 0,
            left: 'center',
            itemGap: 40,
            itemWidth: 28,
            itemHeight: 4,
            borderRadius: 2,
            textStyle: {
                color: '#4b5563',
                fontSize: 12,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                padding: [0, 0, 0, 8]
            },
            formatter: function(name) {
                const nameMap = {
                    'product_a': 'Product A',
                    'product_b': 'Product B',
                    'product_c': 'Product C'
                };
                return nameMap[name] || name;
            }
        },
        xAxis: {
            axisLine: {
                show: true,
                lineStyle: {
                    color: '#c7d2fe',
                    width: 1
                }
            },
            axisLabel: {
                color: '#4b5563',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'Inter, sans-serif',
                formatter: function(value) {
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthNum = parseInt(value.split('-')[1]) - 1;
                    return months[monthNum];
                }
            },
            axisTick: {
                show: false
            }
        },
        yAxis: {
            axisLine: {
                show: false
            },
            axisLabel: {
                color: '#9ca3af',
                fontSize: 11,
                fontFamily: 'Inter, sans-serif'
            },
            splitLine: {
                lineStyle: {
                    color: '#e0e7ff',
                    width: 1,
                    type: [4, 4]
                }
            }
        },
        series: [
            {
                name: 'product_a',
                smooth: 0.3,
                color: '#3730a3',
                lineStyle: {
                    width: 3,
                    color: '#3730a3',
                    shadowColor: 'rgba(55, 48, 163, 0.3)',
                    shadowBlur: 6,
                    shadowOffsetY: 3
                },
                symbol: 'circle',
                symbolSize: 10,
                itemStyle: {
                    color: '#3730a3',
                    borderWidth: 3,
                    borderColor: '#fff',
                    shadowColor: 'rgba(55, 48, 163, 0.3)',
                    shadowBlur: 4
                },
                emphasis: {
                    scale: 1.4,
                    itemStyle: {
                        shadowBlur: 12,
                        shadowColor: 'rgba(55, 48, 163, 0.5)'
                    }
                }
            },
            {
                name: 'product_b',
                smooth: 0.3,
                color: '#6366f1',
                lineStyle: {
                    width: 3,
                    color: '#6366f1',
                    shadowColor: 'rgba(99, 102, 241, 0.3)',
                    shadowBlur: 6,
                    shadowOffsetY: 3
                },
                symbol: 'circle',
                symbolSize: 10,
                itemStyle: {
                    color: '#6366f1',
                    borderWidth: 3,
                    borderColor: '#fff',
                    shadowColor: 'rgba(99, 102, 241, 0.3)',
                    shadowBlur: 4
                },
                emphasis: {
                    scale: 1.4,
                    itemStyle: {
                        shadowBlur: 12,
                        shadowColor: 'rgba(99, 102, 241, 0.5)'
                    }
                }
            },
            {
                name: 'product_c',
                smooth: 0.3,
                color: '#a5b4fc',
                lineStyle: {
                    width: 3,
                    color: '#a5b4fc',
                    shadowColor: 'rgba(165, 180, 252, 0.3)',
                    shadowBlur: 6,
                    shadowOffsetY: 3
                },
                symbol: 'circle',
                symbolSize: 10,
                itemStyle: {
                    color: '#a5b4fc',
                    borderWidth: 3,
                    borderColor: '#fff',
                    shadowColor: 'rgba(165, 180, 252, 0.3)',
                    shadowBlur: 4
                },
                emphasis: {
                    scale: 1.4,
                    itemStyle: {
                        shadowBlur: 12,
                        shadowColor: 'rgba(165, 180, 252, 0.5)'
                    }
                }
            }
        ]
    }}
/>

</div>

<div class="section-header">

## Area Chart

<span class="section-badge">Cumulative</span>
</div>

```sql area_data
SELECT * FROM (VALUES
    ('2024-01', 45, 32, 18),
    ('2024-02', 52, 38, 22),
    ('2024-03', 48, 41, 25),
    ('2024-04', 61, 45, 28),
    ('2024-05', 58, 52, 31),
    ('2024-06', 67, 58, 35)
) AS t(month, web, mobile, api)
```

<div class="chart-card-accent">

<AreaChart
    data={area_data}
    x="month"
    y={["web", "mobile", "api"]}
    title="Traffic by Channel"
    subtitle="Stacked area showing cumulative traffic sources"
    chartAreaHeight=320
    sort=false
    seriesColors={["#3730a3", "#6366f1", "#a5b4fc"]}
    echartsOptions={{
        grid: {
            left: '2%',
            right: '3%',
            bottom: '18%',
            top: '18%',
            containLabel: true
        },
        legend: {
            show: true,
            bottom: 0,
            left: 'center',
            itemGap: 40,
            textStyle: {
                color: '#4b5563',
                fontSize: 12,
                fontWeight: 500
            },
            formatter: function(name) {
                const nameMap = { 'web': 'Web', 'mobile': 'Mobile', 'api': 'API' };
                return nameMap[name] || name;
            }
        },
        xAxis: {
            axisLine: { show: true, lineStyle: { color: '#c7d2fe' } },
            axisLabel: {
                color: '#4b5563',
                fontSize: 12,
                fontWeight: 500,
                formatter: function(value) {
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
                    const monthNum = parseInt(value.split('-')[1]) - 1;
                    return months[monthNum];
                }
            },
            axisTick: { show: false }
        },
        yAxis: {
            axisLine: { show: false },
            axisLabel: { color: '#9ca3af', fontSize: 11 },
            splitLine: { lineStyle: { color: '#e0e7ff', type: [4, 4] } }
        },
        series: [
            { name: 'web', color: '#3730a3', areaStyle: { opacity: 0.8 }, lineStyle: { width: 2, color: '#3730a3' }, itemStyle: { color: '#3730a3' } },
            { name: 'mobile', color: '#6366f1', areaStyle: { opacity: 0.8 }, lineStyle: { width: 2, color: '#6366f1' }, itemStyle: { color: '#6366f1' } },
            { name: 'api', color: '#a5b4fc', areaStyle: { opacity: 0.8 }, lineStyle: { width: 2, color: '#a5b4fc' }, itemStyle: { color: '#a5b4fc' } }
        ]
    }}
/>

</div>

<div class="section-header">

## Bar Chart (Vertical)

<span class="section-badge">Comparison</span>
</div>

```sql vertical_bar_data
SELECT * FROM (VALUES
    ('Q1', 142000),
    ('Q2', 189000),
    ('Q3', 234000),
    ('Q4', 312000)
) AS t(quarter, revenue)
```

<div class="chart-card-accent">

<BarChart
    data={vertical_bar_data}
    x="quarter"
    y="revenue"
    yFmt="usd0k"
    title="Quarterly Revenue"
    subtitle="Vertical bars for period-over-period comparison"
    labels=true
    labelFmt="usd0k"
    chartAreaHeight=300
    echartsOptions={{
        grid: {
            left: '2%',
            right: '3%',
            bottom: '10%',
            top: '22%',
            containLabel: true
        },
        xAxis: {
            axisLine: { show: true, lineStyle: { color: '#c7d2fe' } },
            axisLabel: { color: '#4b5563', fontSize: 13, fontWeight: 600 },
            axisTick: { show: false }
        },
        yAxis: {
            axisLine: { show: false },
            axisLabel: { show: false },
            splitLine: { show: false }
        },
        series: [{
            barWidth: '45%',
            itemStyle: {
                borderRadius: [8, 8, 0, 0],
                color: '#6366f1',
                shadowColor: 'rgba(99, 102, 241, 0.25)',
                shadowBlur: 8,
                shadowOffsetY: 4
            }
        }]
    }}
/>

</div>

<div class="section-header">

## Scatter Plot

<span class="section-badge">Correlation</span>
</div>

```sql scatter_data
SELECT * FROM (VALUES
    -- Dense cloud with positive correlation and natural scatter
    (5, 12, 'Data'), (7, 15, 'Data'), (8, 14, 'Data'), (6, 11, 'Data'), (9, 18, 'Data'),
    (10, 16, 'Data'), (11, 19, 'Data'), (8, 13, 'Data'), (12, 21, 'Data'), (7, 14, 'Data'),
    (13, 22, 'Data'), (10, 17, 'Data'), (14, 25, 'Data'), (9, 15, 'Data'), (11, 20, 'Data'),
    (15, 24, 'Data'), (12, 19, 'Data'), (16, 28, 'Data'), (13, 23, 'Data'), (10, 18, 'Data'),
    (14, 21, 'Data'), (17, 29, 'Data'), (15, 26, 'Data'), (11, 17, 'Data'), (18, 31, 'Data'),
    (16, 27, 'Data'), (12, 20, 'Data'), (19, 33, 'Data'), (14, 24, 'Data'), (17, 28, 'Data'),
    (20, 35, 'Data'), (15, 25, 'Data'), (18, 30, 'Data'), (13, 22, 'Data'), (21, 36, 'Data'),
    (16, 26, 'Data'), (19, 32, 'Data'), (22, 38, 'Data'), (17, 29, 'Data'), (14, 23, 'Data'),
    (20, 34, 'Data'), (23, 40, 'Data'), (18, 31, 'Data'), (15, 27, 'Data'), (21, 37, 'Data'),
    (24, 42, 'Data'), (19, 33, 'Data'), (16, 28, 'Data'), (22, 39, 'Data'), (25, 44, 'Data'),
    (20, 35, 'Data'), (17, 30, 'Data'), (23, 41, 'Data'), (26, 46, 'Data'), (21, 38, 'Data'),
    (18, 32, 'Data'), (24, 43, 'Data'), (27, 48, 'Data'), (22, 40, 'Data'), (19, 34, 'Data'),
    (25, 45, 'Data'), (28, 50, 'Data'), (23, 42, 'Data'), (20, 36, 'Data'), (26, 47, 'Data'),
    (29, 52, 'Data'), (24, 44, 'Data'), (21, 39, 'Data'), (27, 49, 'Data'), (30, 54, 'Data'),
    (25, 46, 'Data'), (22, 41, 'Data'), (28, 51, 'Data'), (31, 56, 'Data'), (26, 48, 'Data'),
    (23, 43, 'Data'), (29, 53, 'Data'), (32, 58, 'Data'), (27, 50, 'Data'), (24, 45, 'Data'),
    (30, 55, 'Data'), (33, 60, 'Data'), (28, 52, 'Data'), (25, 47, 'Data'), (31, 57, 'Data'),
    (34, 62, 'Data'), (29, 54, 'Data'), (26, 49, 'Data'), (32, 59, 'Data'), (35, 64, 'Data'),
    (30, 56, 'Data'), (27, 51, 'Data'), (33, 61, 'Data'), (36, 66, 'Data'), (31, 58, 'Data'),
    (28, 53, 'Data'), (34, 63, 'Data'), (37, 68, 'Data'), (32, 60, 'Data'), (29, 55, 'Data'),
    (35, 65, 'Data'), (38, 70, 'Data'), (33, 62, 'Data'), (30, 57, 'Data'), (36, 67, 'Data'),
    (39, 72, 'Data'), (34, 64, 'Data'), (31, 59, 'Data'), (37, 69, 'Data'), (40, 74, 'Data'),
    (35, 66, 'Data'), (32, 61, 'Data'), (38, 71, 'Data'), (41, 76, 'Data'), (36, 68, 'Data'),
    (33, 63, 'Data'), (39, 73, 'Data'), (42, 78, 'Data'), (37, 70, 'Data'), (34, 65, 'Data'),
    (40, 75, 'Data'), (43, 80, 'Data'), (38, 72, 'Data'), (35, 67, 'Data'), (41, 77, 'Data'),
    (44, 82, 'Data'), (39, 74, 'Data'), (36, 69, 'Data'), (42, 79, 'Data'), (45, 84, 'Data'),
    (40, 76, 'Data'), (37, 71, 'Data'), (43, 81, 'Data'), (46, 86, 'Data'), (41, 78, 'Data'),
    (38, 73, 'Data'), (44, 83, 'Data'), (47, 88, 'Data'), (42, 80, 'Data'), (39, 75, 'Data'),
    (45, 85, 'Data'), (48, 90, 'Data'), (43, 82, 'Data'), (40, 77, 'Data'), (46, 87, 'Data'),
    (49, 92, 'Data'), (44, 84, 'Data'), (41, 79, 'Data'), (47, 89, 'Data'), (50, 94, 'Data'),
    -- Add some outliers and noise
    (12, 28, 'Data'), (18, 22, 'Data'), (25, 55, 'Data'), (8, 22, 'Data'), (35, 50, 'Data'),
    (42, 68, 'Data'), (15, 35, 'Data'), (30, 42, 'Data'), (22, 50, 'Data'), (48, 78, 'Data'),
    (5, 18, 'Data'), (38, 58, 'Data'), (28, 62, 'Data'), (45, 72, 'Data'), (10, 25, 'Data'),
    (33, 48, 'Data'), (20, 45, 'Data'), (40, 62, 'Data'), (16, 38, 'Data'), (47, 82, 'Data')
) AS t(engagement_score, retention_rate, segment)
```

<div class="chart-card-accent">

<ScatterPlot
    data={scatter_data}
    x="engagement_score"
    y="retention_rate"
    title="Engagement vs Retention"
    subtitle="170 data points showing positive correlation with natural variance"
    xAxisTitle="Engagement Score"
    yAxisTitle="Retention Rate (%)"
    chartAreaHeight=350
    echartsOptions={{
        grid: {
            left: '3%',
            right: '3%',
            bottom: '12%',
            top: '18%',
            containLabel: true
        },
        xAxis: {
            axisLine: { show: true, lineStyle: { color: '#c7d2fe' } },
            axisLabel: { color: '#4b5563', fontSize: 11 },
            splitLine: { lineStyle: { color: '#e0e7ff', type: [4, 4] } }
        },
        yAxis: {
            axisLine: { show: false },
            axisLabel: { color: '#9ca3af', fontSize: 11 },
            splitLine: { lineStyle: { color: '#e0e7ff', type: [4, 4] } }
        },
        series: [{
            symbolSize: 10,
            itemStyle: {
                color: '#6366f1',
                opacity: 0.7
            }
        }]
    }}
/>

</div>

<div class="section-header">

## Bubble Chart

<span class="section-badge">Multi-Dimension</span>
</div>

```sql bubble_data
SELECT * FROM (VALUES
    ('Product A', 85, 92, 450),
    ('Product B', 72, 78, 320),
    ('Product C', 58, 85, 280),
    ('Product D', 91, 68, 520),
    ('Product E', 45, 55, 180)
) AS t(product, satisfaction, nps, revenue_k)
```

<div class="chart-card-accent">

<BubbleChart
    data={bubble_data}
    x="satisfaction"
    y="nps"
    size="revenue_k"
    series="product"
    title="Product Performance Matrix"
    subtitle="Bubble size represents revenue ($K) — X: Satisfaction, Y: NPS"
    xAxisTitle=""
    yAxisTitle=""
    chartAreaHeight=380
    seriesColors={["#3730a3", "#4f46e5", "#6366f1", "#818cf8", "#a5b4fc"]}
    echartsOptions={{
        grid: {
            left: '3%',
            right: '3%',
            bottom: '15%',
            top: '15%',
            containLabel: true
        },
        legend: {
            show: true,
            bottom: '3%',
            left: 'center',
            itemGap: 32,
            itemWidth: 18,
            itemHeight: 12,
            textStyle: {
                color: '#4b5563',
                fontSize: 13,
                fontWeight: 500,
                padding: [0, 0, 0, 4]
            }
        },
        xAxis: {
            name: '',
            nameTextStyle: { show: false },
            axisLine: { show: true, lineStyle: { color: '#c7d2fe' } },
            axisLabel: { color: '#4b5563', fontSize: 11 },
            splitLine: { lineStyle: { color: '#e0e7ff', type: [4, 4] } }
        },
        yAxis: {
            name: '',
            axisLine: { show: false },
            axisLabel: { color: '#9ca3af', fontSize: 11 },
            splitLine: { lineStyle: { color: '#e0e7ff', type: [4, 4] } }
        },
        color: ['#3730a3', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc']
    }}
/>

</div>

<div class="section-header">

## Histogram

<span class="section-badge">Distribution</span>
</div>

```sql histogram_data
SELECT * FROM (VALUES
    -- Left tail (few observations)
    (15), (18), (20),
    -- Building up
    (25), (27), (28), (30), (32),
    -- Lower-middle
    (35), (36), (37), (38), (39), (40), (41), (42),
    -- Peak area (most observations around 45-55)
    (44), (45), (45), (46), (46), (47), (47), (48), (48), (48),
    (49), (49), (49), (50), (50), (50), (50), (50),
    (51), (51), (51), (52), (52), (52), (53), (53), (54), (54),
    (55), (55), (56), (56), (57), (57), (58),
    -- Upper-middle
    (59), (60), (61), (62), (63), (64), (65), (66),
    -- Tapering off
    (68), (70), (72), (74), (76),
    -- Right tail (few observations)
    (80), (85), (90)
) AS t(response_time_ms)
```

<div class="chart-card-accent">

<Histogram
    data={histogram_data}
    x="response_time_ms"
    title="Response Time Distribution"
    subtitle="API response times across all endpoints"
    xAxisTitle="Response Time (ms)"
    chartAreaHeight=300
    echartsOptions={{
        grid: {
            left: '2%',
            right: '3%',
            bottom: '15%',
            top: '20%',
            containLabel: true
        },
        xAxis: {
            axisLine: { show: true, lineStyle: { color: '#c7d2fe' } },
            axisLabel: { color: '#4b5563', fontSize: 11 },
            axisTick: { show: false }
        },
        yAxis: {
            axisLine: { show: false },
            axisLabel: { color: '#9ca3af', fontSize: 11 },
            splitLine: { lineStyle: { color: '#e0e7ff', type: [4, 4] } }
        },
        series: [{
            itemStyle: {
                color: '#6366f1',
                borderRadius: [4, 4, 0, 0]
            }
        }]
    }}
/>

</div>


<div class="section-header">

## Funnel Chart

<span class="section-badge">Conversion</span>
</div>

```sql funnel_data
SELECT
    stage,
    count,
    conversion_pct
FROM (
    SELECT
        stage,
        count,
        sort_order,
        ROUND(100.0 * count / LAG(count) OVER (ORDER BY sort_order), 0) as conversion_pct
    FROM (VALUES
        ('Visitors', 10000, 1),
        ('Signups', 4200, 2),
        ('Activated', 2100, 3),
        ('Subscribed', 840, 4),
        ('Retained', 630, 5)
    ) AS t(stage, count, sort_order)
)
ORDER BY sort_order
```

<div class="chart-card-accent">

<FunnelChart
    data={funnel_data}
    nameCol="stage"
    valueCol="count"
    title="Conversion Funnel"
    subtitle="User journey from visitor to retained customer"
    chartAreaHeight=300
    legend=false
    echartsOptions={{
        series: [{
            orient: 'horizontal',
            left: '5%',
            right: '5%',
            top: '18%',
            bottom: '5%',
            minSize: '20%',
            maxSize: '100%',
            gap: 4,
            funnelAlign: 'top',
            sort: 'descending',
            label: {
                show: true,
                position: 'inside',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                formatter: function(params) {
                    return params.name + '\n' + params.value.toLocaleString();
                }
            },
            itemStyle: {
                borderColor: '#fff',
                borderWidth: 2
            },
            color: ['#3730a3', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc']
        }]
    }}
/>

</div>

<div class="section-header">

## Sankey Diagram

<span class="section-badge">Flow</span>
</div>

```sql sankey_data
SELECT * FROM (VALUES
    ('Organic', 'Homepage', 3500),
    ('Organic', 'Product', 1200),
    ('Paid', 'Homepage', 2800),
    ('Paid', 'Landing', 4200),
    ('Referral', 'Homepage', 1500),
    ('Homepage', 'Signup', 2400),
    ('Homepage', 'Product', 2100),
    ('Product', 'Signup', 1800),
    ('Landing', 'Signup', 3200),
    ('Signup', 'Purchase', 2800)
) AS t(source, target, value)
```

<div class="chart-card-accent">

<SankeyDiagram
    data={sankey_data}
    source="source"
    target="target"
    value="value"
    title="User Flow Analysis"
    subtitle="Traffic sources through conversion points"
    chartAreaHeight=380
    echartsOptions={{
        series: [{
            nodeAlign: 'left',
            layoutIterations: 32,
            nodeGap: 12,
            nodeWidth: 20,
            label: {
                color: '#1e293b',
                fontSize: 12,
                fontWeight: 600
            },
            lineStyle: {
                color: 'gradient',
                opacity: 0.4
            },
            itemStyle: {
                borderWidth: 0
            },
            color: ['#3730a3', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe']
        }]
    }}
/>

</div>

<div class="section-header">

## Heatmap

<span class="section-badge">Matrix</span>
</div>

```sql heatmap_data
SELECT * FROM (VALUES
    ('Mon', '9am', 12), ('Mon', '12pm', 45), ('Mon', '3pm', 67), ('Mon', '6pm', 34),
    ('Tue', '9am', 23), ('Tue', '12pm', 52), ('Tue', '3pm', 71), ('Tue', '6pm', 41),
    ('Wed', '9am', 31), ('Wed', '12pm', 58), ('Wed', '3pm', 82), ('Wed', '6pm', 48),
    ('Thu', '9am', 28), ('Thu', '12pm', 61), ('Thu', '3pm', 75), ('Thu', '6pm', 38),
    ('Fri', '9am', 18), ('Fri', '12pm', 42), ('Fri', '3pm', 55), ('Fri', '6pm', 25)
) AS t(day, hour, activity)
```

<div class="chart-card-accent">

<Heatmap
    data={heatmap_data}
    x="hour"
    y="day"
    value="activity"
    title="Activity Heatmap"
    subtitle="User activity by day and time"
    chartAreaHeight=280
    echartsOptions={{
        grid: {
            left: '3%',
            right: '12%',
            bottom: '12%',
            top: '18%',
            containLabel: true
        },
        xAxis: {
            axisLine: { show: false },
            axisLabel: { color: '#4b5563', fontSize: 12, fontWeight: 500 },
            axisTick: { show: false }
        },
        yAxis: {
            axisLine: { show: false },
            axisLabel: { color: '#4b5563', fontSize: 12, fontWeight: 500 },
            axisTick: { show: false }
        },
        visualMap: {
            min: 0,
            max: 100,
            calculable: true,
            orient: 'vertical',
            right: '2%',
            top: 'center',
            inRange: {
                color: ['#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#3730a3']
            },
            textStyle: { color: '#64748b', fontSize: 11 }
        },
        series: [{
            itemStyle: {
                borderColor: '#fff',
                borderWidth: 2,
                borderRadius: 4
            }
        }]
    }}
/>

</div>

---

## Color Reference

<div class="chart-card">

### Data Colors (Indigo Spectrum)
Use these for all data series, bars, lines, and fills:

| Shade | Hex | Usage |
|-------|-----|-------|
| Indigo 900 | `#312e81` | Darkest, high contrast |
| Indigo 800 | `#3730a3` | Primary dark |
| Indigo 600 | `#4f46e5` | Rich purple |
| Indigo 500 | `#6366f1` | **Primary brand** |
| Indigo 400 | `#818cf8` | Medium |
| Indigo 300 | `#a5b4fc` | Light |
| Indigo 200 | `#c7d2fe` | Very light |
| Indigo 100 | `#e0e7ff` | Subtle backgrounds |

### Accent Colors (Amber)
Reserved for annotations, callouts, and highlights only:

| Shade | Hex | Usage |
|-------|-----|-------|
| Amber 600 | `#d97706` | Dark text on light bg |
| Amber 500 | `#f59e0b` | **Primary accent** |
| Amber 300 | `#fcd34d` | Light accent |
| Amber 200 | `#fde68a` | Subtle highlight |
| Orange 200 | `#fed7aa` | Label backgrounds |

</div>

