# DataTable Bug Investigation

**Date:** January 20, 2026
**PR:** https://github.com/evidence-dev/evidence/pull/3265
**Environment:**
- @evidence-dev/core-components: 5.4.0
- @evidence-dev/evidence: 40.1.6

## Summary

DataTable component renders the table container (search box, pagination) but no actual rows, even when data is confirmed to be loaded and accessible.

## Symptoms

1. DataTable shows empty - no rows visible
2. Debug output confirms data exists:
   - `test_data.length = 3` (or 5 with source data)
   - `test_data[0].fruit = "Apple"`
3. Table container structure renders but no `<tr>` elements for data rows
4. Raw HTML tables iterating over the same data work correctly

## Investigation Steps

### Step 1: Initial Diagnosis

Suspected the issue was in `Column.svelte`'s `checkColumnName()` function accessing `$props.data[0]` without null checking.

**File:** `packages/ui/core-components/src/lib/unsorted/viz/table/Column.svelte`

**Original code:**
```javascript
function checkColumnName() {
    try {
        if (!Object.keys($props.data[0]).includes(id)) {
            error = 'Error in table: ' + id + ' does not exist in the dataset';
            throw new Error(error);
        }
    } catch (e) {
        error = e.message;
        if (strictBuild) {
            throw error;
        }
    }
}
```

**Fix applied:**
```javascript
function checkColumnName() {
    try {
        // Guard against data not being ready yet
        if (!$props.data || !$props.data.length || !$props.data[0]) {
            return; // Data not ready, skip validation for now
        }
        if (!Object.keys($props.data[0]).includes(id)) {
            error = 'Error in table: ' + id + ' does not exist in the dataset';
            throw new Error(error);
        }
    } catch (e) {
        error = e.message;
        if (strictBuild) {
            throw error;
        }
    }
}
```

### Step 2: Testing the Fix

Applied the fix to local `node_modules` and tested. DataTable still did not render rows.

### Step 3: Adding Debug Output

Added debug output to multiple levels of the component hierarchy:

**DataTable.svelte (wrapper):**
```svelte
<div style="background: orange; padding: 5px;">
    WRAPPER DEBUG: data?.length={data?.length}, Query.isQuery={Query.isQuery(data)}
</div>
```

**_DataTable.svelte (internal):**
```svelte
<div style="background: yellow; padding: 10px;">
    DEBUG: columnSummary length = {columnSummary?.length ?? 'undefined'},
    props.columns length = {$props.columns?.length ?? 'undefined'},
    orderedColumns length = {orderedColumns?.length ?? 'undefined'},
    displayedData length = {displayedData?.length ?? 'undefined'}
</div>
```

### Step 4: Debug Results

Debug output showed all data was correctly populated:

| Variable | Value |
|----------|-------|
| data?.length | 5 |
| Query.isQuery | true |
| columnSummary.length | 7 |
| props.columns.length | 7 |
| orderedColumns.length | 7 |
| displayedData.length | 5 |

**Conclusion:** Data flows correctly through the entire component. The issue is in rendering, not data.

### Step 5: Isolating the Render Issue

Added debug inside the table structure:

```svelte
<div class="scrollbox">
    <div style="background: cyan;">TABLE CONTAINER RENDERED</div>
    <table>
        <!-- inside QueryLoad default slot -->
        <tr><td style="background: lime;">TABLEROW SHOULD RENDER HERE</td></tr>
        <TableRow ... />
    </table>
</div>
```

**Result:** The cyan and lime debug elements did NOT render, even though the yellow debug box (earlier in the component) did render.

### Step 6: Investigating Transitions

Removed `transition:slide|local` from the table-container div to rule out transition issues.

**Result:** No change - table container still did not render.

### Step 7: Vite Caching Issues

Discovered that Vite was not picking up changes to `node_modules` files despite:
- Clearing `.svelte-kit` directories
- Clearing `.vite` cache directories
- Restarting dev server
- Hard refreshing browser

### Step 8: Raw HTML Table Test

Created a raw HTML table to bypass DataTable entirely:

```svelte
<table>
    {#each customer_sample as row}
        <tr>
            <td>{row.customer_id}</td>
            <td>{row.customer_name}</td>
        </tr>
    {/each}
</table>
```

**Result:** Raw HTML table rendered correctly with all 5 rows of data.

## Conclusions

1. **Data loading works correctly** - Query objects load and data is accessible
2. **Column detection works** - columnSummary, props.columns, orderedColumns all populate correctly
3. **The issue is in the table container rendering** - the `div.table-container` element does not render despite being inside an `{#if error === undefined}` block that IS executing (proven by yellow debug box rendering)
4. **Raw HTML tables work** - confirming data access is not the issue
5. **Our null check fix is valid** but does not address the root cause

## Potential Areas for Further Investigation

1. **Inner QueryLoad** at line ~600 in `_DataTable.svelte` - wraps the actual table rows, may be filtering them out
2. **Svelte reactivity** - the table-container div may have stale reactive dependencies
3. **Slot rendering** - the default slot creates Column components; there may be timing issues with how columns register to the props store
4. **Component lifecycle** - possible issue with mount/unmount cycles

## Files Modified During Investigation

- `packages/ui/core-components/src/lib/unsorted/viz/table/Column.svelte` - null check fix (submitted in PR)
- `packages/ui/core-components/src/lib/unsorted/viz/table/_DataTable.svelte` - debug output (local only)
- `packages/ui/core-components/src/lib/unsorted/viz/table/DataTable.svelte` - debug output (local only)

## Reproduction Steps

1. Create a new Evidence project with version 40.1.6
2. Create a page with a SQL query and DataTable:
```markdown
```sql test_data
SELECT * FROM snowflake_saas.customers LIMIT 5
```

<DataTable data={test_data}/>
```
3. Observe that DataTable renders empty (no rows)
4. Add raw HTML table with same data - observe it works:
```svelte
{#each test_data as row}
    <tr><td>{row.customer_id}</td></tr>
{/each}
```

## Contact

If you have questions about this investigation, please comment on PR #3265.
