# Sales Team CRM — Upload Edition

Static React app that runs entirely in the browser. Upload **sales_transactions.xlsx** (required) and optional **inventory_receive.xlsx** and **timesheets** to compute KPIs, leaderboards, and sell-through.

## Files
- `index.html` — loads React/Recharts/SheetJS via CDN + Babel
- `app.jsx` — Upload UI (no build required)
- `.nojekyll` — required for GitHub Pages at repo root

## Expected columns
- **Sales:** `Order Time` / `Order Date`, `Product Name`, `Total Inventory Sold`, `Net Sales`, `Vendor Name`, `Category`, optional `helped_by` / `Budtender` / `Associate` / `Rep`, `Package ID`
- **Inventory receive (optional):** `Package Id`/`Package ID`, `Quantity` or `Units`, `Receive Date`
- **Timesheets (optional):** `rep`/`Name`/`Employee`, `Hours` or `Hours Worked`

Rules: exclude rows containing “sample”; ignore negative rows. Time zone is **America/New_York**.

## Local run
Open `index.html` in a browser (or any static server).

## GitHub Pages
Settings → Pages → **Deploy from a branch**, Branch **main**, Folder **/** (root). Save and open the URL shown.
