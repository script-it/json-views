# View flow test files

These files are intentionally varied and large enough to exercise view creation, layout changes, filtering, sorting, conversion, nested navigation, and rendering performance.

- `01-object-root-operations.json`: object root with existing table/Kanban views, schemas, nested people, and releases.
- `02-object-root-commerce.json`: object root with orders, customers, catalog, metrics, and nested line items.
- `03-object-root-object-map.json`: object root containing record maps keyed by ticket ID and email.
- `04-object-root-single-record.json`: single-record object root with nested notes, invoices, locations, and contact data.
- `05-array-root-work-items.json`: 220 wide records with strings, numbers, booleans, dates, arrays, URLs, and nested objects.
- `06-array-root-edge-cases.json`: 120 uneven records with missing fields, nulls, empty values, unusual keys, and long text.
- `07-array-root-events.json`: 400 analytics events with nested experiment and property objects.
- `08-csv-wide-sales-350x24.csv`: 350 sales rows across 24 columns, including quoted commas and quotes.
- `09-csv-wide-support-600x20.csv`: 600 support rows across 20 columns, including blanks and quoted content.

Regenerate them with:

```bash
node scripts/generate-view-flow-fixtures.mjs
```
