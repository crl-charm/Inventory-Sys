# Feature Specification: Base Price and Final Price in Record Daily Sales

> **Project:** Hardware Store Inventory & Daily Sales System  
> **Stack:** Next.js App Router, TypeScript, React, MySQL through local XAMPP  
> **Change type:** Extend the existing application; do not rebuild it from scratch.  
> **Primary goal:** Add **Base Price** and editable **Final Price** only to the **Record Daily Sales** entry workflow. Store the actual final price for correct calculations, but do not add new price fields or UI columns to other screens.

---

## 1. Scope boundary — read before implementing

**This is a small change to the Record Daily Sales form, not a system-wide pricing feature.** The Base Price and Final Price fields must be shown and editable/read-only as specified only while the owner is creating a daily sales entry. Do not add these fields to product management, inventory lists, stock adjustments, purchase/receiving forms, dashboard cards, sales-history tables, or report/print layouts. Do not redesign those screens for this request.

The database and backend must still save the final per-unit price used by the sale so revenue remains accurate. Existing dashboards, sales history totals, and reports must continue to calculate from saved sale amounts, but keep their current visible layout and columns. This scope restriction does not mean calculating revenue from the current catalog price; always use the amount actually recorded for the sale.

## 2. Required business behavior

The owner's notebook records the quantities sold at the end of the day. For each product line, the screen must show:

1. **Product** — product name and optional SKU.
2. **Available Stock** — current on-hand quantity before this entry is saved.
3. **Unit** — bottle, piece, tire, pair, set, etc.
4. **Quantity Sold** — number of units sold for this daily entry.
5. **Base Price** — the normal/default per-unit price saved in the product catalog. Show this as a read-only value in the sales form.
6. **Final Price** — the actual per-unit amount charged for this entry. This field is editable and defaults to the Base Price.
7. **Line Total** — automatically calculated as `Quantity Sold × Final Price`.
8. **Remove** — removes the unsaved line from the form.

The daily total must be the sum of all line totals. All authoritative amounts must be calculated and validated on the server before saving.

### Example

A product has a catalog Base Price of ₱350.00. The owner sold 3 bottles and wants the actual amount recorded as ₱320.00 per bottle.

| Field | Value |
|---|---:|
| Product | Engine Oil 1L |
| Quantity Sold | 3 |
| Base Price | ₱350.00 |
| Final Price | ₱320.00 |
| Line Total | ₱960.00 |
| Stock before saving | 20 bottles |
| Stock after saving | 17 bottles |

The UI should display only the Base Price, Final Price, and calculated Line Total. **Do not add a discount field, discount percentage, savings badge, or discount amount.** Do not describe the price difference as a discount anywhere in the user interface or sales reports.

## 3. Pricing rules

- The product catalog's existing `selling_price` column remains the stored normal/default price for a product. Keep the product catalog's existing label and UI unchanged; call it **Base Price** only inside the Record Daily Sales form.
- In Record Daily Sales, Base Price is loaded from the product stored on the server. It is read-only in this form.
- Final Price is a per-unit amount for the selected product line, not the total for the entire quantity.
- When a product is added to the form, set Final Price equal to Base Price by default.
- The owner can edit Final Price for this sales entry without changing the product's catalog Base Price.
- Allow any valid non-negative Final Price with up to two decimal places. Do not automatically force it to be below Base Price; the application should record the actual entered final price.
- Do not silently change the product catalog price when a Final Price is edited in a sales entry.
- If Final Price is not provided by an API client, the server must default it to the current product Base Price.
- Zero price should be technically valid if the current business rules permit free or complimentary stock to be recorded. If free items are not permitted by existing validation rules, preserve the current policy consistently and explain the validation error clearly.
- For the existing end-of-day workflow, one product can appear only once in a sales batch. The row's Final Price applies to all units of that product in that batch. If units of the same product were sold at several different prices during the day, the owner must use one effective per-unit price for this row (for example, the weighted average) so the saved revenue matches the day's total. Do not add per-customer receipts or a full POS workflow as part of this change.

## 4. Record Daily Sales UI changes

Update the existing Record Daily Sales screen without removing its current date selector, product search, notes, stock validation, save action, or responsive styling.

### Desktop/tablet table columns

Use this column order:

`Product | Available Stock | Unit | Quantity Sold | Base Price | Final Price | Line Total | Action`

### Phone layout

On narrow screens, show each selected product as a readable stacked card instead of forcing the complete wide table onto the screen. The card must display:

- Product name and available stock
- Quantity Sold input
- Base Price as read-only text
- Final Price as an editable currency input
- Line Total
- Remove action

Do not hide Base Price or Final Price on mobile. Inputs and remove actions must be touch-friendly, and the form must not cause page-level horizontal scrolling.

### Input behavior

- Final Price should be a decimal/currency input with a visible `₱` cue and a clear label.
- Initialize Final Price from Base Price when the item is added.
- Recalculate Line Total and the batch total as Quantity Sold or Final Price changes.
- Recalculations are UI previews only. The server recalculates amounts independently and persists its calculated values.
- Format displayed prices using Philippine peso formatting and two decimal places, e.g. `₱350.00`.
- Keep user-entered quantities and Final Prices intact if validation or network errors occur.
- Prevent duplicate product lines using the app's existing behavior.
- Do not add any label, tooltip, icon, color, animation, or helper text that calls attention to the difference between Base Price and Final Price as a discount or savings.
- Preserve the app's existing accessible labels, keyboard navigation, loading/error states, and responsive animation standards.

## 5. Data model and database migration

Inspect the current project and schema before changing the database. The existing `products.selling_price` field is the source of Base Price. Historical sales must preserve both prices used for each saved line.

### Required final `sale_items` fields

Keep all existing product and quantity snapshots, and ensure each sales line stores:

- `base_unit_price DECIMAL(12,2) NOT NULL` — the Base Price copied from the product catalog at the time the daily sales batch is posted.
- `final_unit_price DECIMAL(12,2) NOT NULL` — the actual per-unit price used to calculate revenue for that saved line.
- `line_total DECIMAL(14,2) NOT NULL` — server-calculated `quantity × final_unit_price`, rounded to two decimal places using the application's consistent rounding rule.

Retain existing fields such as `sale_batch_id`, `product_id`, `product_name_snapshot`, `sku_snapshot`, `unit_snapshot`, and `quantity`.

### Existing database migration requirements

The app may already have a `sale_items.unit_price` column. Do not assume a fresh database and do not discard current sales history.

1. Inspect the current schema and existing migration convention first.
2. Create a versioned migration that adds `base_unit_price` and `final_unit_price` to existing `sale_items` rows.
3. Backfill both new fields from the old `unit_price` for historical rows, so old entries remain financially unchanged.
4. Preserve each old `line_total`, each batch total, and existing stock history. Do not recalculate past revenue from the current product price.
5. Update all API handlers, service code, TypeScript types, report queries, and UI components to use `base_unit_price` and `final_unit_price` consistently.
6. If keeping `unit_price` temporarily for compatibility, document which column is authoritative and keep values synchronized during the transition. Otherwise, remove the legacy column only in a safe migration after all usages and constraints have been updated.
7. Add appropriate non-negative price constraints using syntax supported by the installed MySQL/MariaDB version. Do not break XAMPP compatibility.
8. Make the migration safe to identify as already applied; do not create duplicate columns when rerun.

The product catalog's `selling_price` column does not need to be renamed in the database. This feature is primarily a sales-line snapshot and form change.

## 6. API contract changes

Update the existing sales API instead of creating a duplicate endpoint.

### Request example

`POST /api/sales`

```json
{
  "saleDate": "2026-10-16",
  "notes": "End-of-day notebook entry",
  "requestId": "a6e7f0d2-62c3-4b47-a9f6-ef8a417c3d11",
  "items": [
    {
      "productId": 12,
      "quantity": "3",
      "finalUnitPrice": "320.00"
    },
    {
      "productId": 28,
      "quantity": "2",
      "finalUnitPrice": "4000.00"
    }
  ]
}
```

The client does not need to send `baseUnitPrice`. The server must read Base Price from the locked product row in MySQL. If an old client sends `unitPrice`, handle it only if necessary for a documented compatibility period; never allow it to override the new field silently when `finalUnitPrice` is present.

### Successful response example

```json
{
  "success": true,
  "data": {
    "saleBatchId": 104,
    "saleDate": "2026-10-16",
    "status": "posted",
    "totalAmount": "960.00",
    "items": [
      {
        "productId": 12,
        "productName": "Engine Oil 1L",
        "quantity": "3.000",
        "unit": "bottle",
        "baseUnitPrice": "350.00",
        "finalUnitPrice": "320.00",
        "lineTotal": "960.00",
        "stockBefore": "20.000",
        "stockAfter": "17.000"
      }
    ]
  }
}
```

Return decimal money values as decimal strings or use the project's existing safe decimal serialization pattern. Do not serialize money as imprecise JavaScript floating-point values in the authoritative API response.

## 7. Server-side sales business logic

Update the existing `postSalesBatch()` or equivalent service function.

Inside the same SQL transaction used for stock deduction:

1. Validate authentication, sale date, product IDs, positive quantities, and duplicate lines under the existing rules.
2. Lock all requested active product rows in a consistent product-ID order.
3. Validate that every product exists, is active, and has enough available stock.
4. Read `products.selling_price` as the authoritative Base Price for each product.
5. Read and validate `finalUnitPrice` from the request. If it is omitted, use Base Price. Reject malformed values, negative values, or more than two decimal places.
6. Calculate `line_total` from Quantity Sold multiplied by Final Price using a decimal-safe approach. Use the existing consistent rounding policy (normally two decimal places per line).
7. Sum the stored line totals to calculate the batch `total_amount`. Never accept a client-provided line total or batch total as authoritative.
8. Insert `sale_items` snapshots containing product identity/unit, quantity, `base_unit_price`, `final_unit_price`, and the calculated `line_total`.
9. Deduct inventory by the entered quantity and insert the existing stock movement records atomically.
10. Commit only when the entire batch succeeds. On any error, roll back all line inserts and stock changes.
11. Preserve existing request-id/idempotency protection so retrying a request cannot deduct stock twice.

### Important price integrity rules

- Editing Final Price in the sales form must never update `products.selling_price`.
- Changing a product's Base Price after a sales batch has been posted must not modify that batch's Base Price, Final Price, line totals, or batch total.
- Historical report totals must use stored `line_total` values, not current catalog prices.
- Voiding a batch must preserve its stored Base Price and Final Price snapshots internally, restore stock exactly once, and remove the batch from posted sales totals according to the existing void rules.
- A failed save must not partially post the batch or partially deduct inventory.

## 8. Other screens and revenue calculations

Do not add Base Price or Final Price fields/columns to other UI screens as part of this feature. Keep the existing presentation of these areas unchanged:

- **Product management/catalog:** continue showing and editing the normal product price using the existing field and current label. Editing a sale's Final Price must never update this catalog value.
- **Inventory and stock pages:** do not add price inputs or price columns. Inventory quantity and low-stock behavior must remain unchanged.
- **Sales history list/details:** preserve the existing layout and columns. The stored line amount and batch total must remain accurate, based on Final Price at the time the sale was recorded. Do not add Base Price / Final Price display columns for this request.
- **Dashboard, daily report, exports, and print view:** preserve the existing layout and visible fields. All sales revenue totals and product revenue calculations must use the saved sale line totals calculated from Final Price, not the current catalog price. Do not add new price fields, discount labels, discount amounts, or savings metrics.
- **Voids/corrections:** use the application's existing rules. A voided batch must restore stock exactly once and be excluded from posted revenue exactly as it is today, without deleting the stored sale-price snapshots.

In short: the only visible UI change is inside **Record Daily Sales**. Other screens may show their existing revenue totals changing correctly because those totals now use the saved actual sale price; their design and field layout must not change.

## 9. TypeScript and validation updates

Update the shared sales line types and validators. The exact file names may differ; follow the current project conventions.

Example shape:

```ts
export type SaleItemInput = {
  productId: number;
  quantity: string;
  finalUnitPrice?: string;
};

export type SaleItemRecord = {
  productId: number;
  productName: string;
  unit: string;
  quantity: string;
  baseUnitPrice: string;
  finalUnitPrice: string;
  lineTotal: string;
};
```

Requirements:

- Parse decimal values safely; avoid `Number(quantity) * Number(price)` as the authoritative stored calculation.
- Apply the project's established decimal library or a deliberate decimal/integer-minor-unit strategy. If quantities allow fractional units, use a decimal-safe library for multiplying quantity by price and round the resulting money value consistently.
- Validate both price fields as money values with at most two fractional digits and no negative values.
- Render amounts as PHP using `Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })` or the app's existing formatting helper.
- Avoid `NaN`, blank-input surprises, and silently converting malformed input to zero.
- If Final Price is temporarily blank while being edited, show a sensible validation state and do not submit until it is valid.

## 10. Acceptance tests

The coding agent must implement and verify at least these scenarios:

1. Adding a product with catalog price ₱350.00 sets Base Price to ₱350.00 and initializes Final Price to ₱350.00.
2. Changing Final Price to ₱320.00 changes the form's line total but does not change the product's catalog price.
3. Quantity 3 and Final Price ₱320.00 produce a line total of ₱960.00 and deduct exactly 3 from stock.
4. Leaving Final Price at its default saves the same result as the current application did before the feature.
5. The batch total equals the sum of the saved line totals based on Final Price.
6. The Base Price and Final Price values are stored as snapshots and remain unchanged when the product catalog price is edited later.
7. Existing historical sale rows are migrated with their old unit price copied to both new price fields, without changing any existing totals.
8. A negative, malformed, or over-precision Final Price is rejected with a clear validation message and no stock change.
9. Insufficient stock prevents the entire batch from being saved, including every price snapshot and stock movement.
10. Retrying a completed request ID does not create another batch or deduct stock again.
11. Existing sales history, dashboard totals, daily reports, and print view calculate revenue from the saved sale line totals based on Final Price, without adding new price columns or changing their existing layouts.
12. A voided batch restores stock once and is excluded from posted sales totals under the existing rules.
13. Mobile, tablet, and desktop layouts of the Record Daily Sales form show Base Price, Final Price, and Line Total without clipping or unintended horizontal scrolling.
14. The UI contains no discount field, discount percentage, savings amount, or discount/savings wording.
15. The feature works against the project's local XAMPP MySQL/MariaDB database after applying the documented migration.

## 11. Implementation workflow for the coding agent

1. Inspect the repository, existing Record Daily Sales components, shared TypeScript types, sales route handlers, service functions, SQL schema/migrations, history queries, dashboard queries, and report/print templates.
2. Write a short implementation plan based on the real project structure, then implement the complete vertical slice.
3. Add and test the database migration before changing code that depends on the new columns.
4. Implement the form, validation, API/service changes, snapshots, and calculations together so all layers use the same field meanings.
5. Run available lint, type-check, test, and production-build commands. Fix the errors caused by this change.
6. Test with local XAMPP/MySQL and verify old sales history still loads correctly.
7. Summarize the changed files, migration command, test results, and any steps the owner must run locally.

Keep the UI scope limited to Record Daily Sales. Do not add Base Price / Final Price fields or columns to other screens. However, the database, API, and backend calculations must persist the actual Final Price and use it for accurate existing revenue totals and history.
