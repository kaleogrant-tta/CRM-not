const { useState } = React;
dayjs.extend(window.dayjs_plugin_utc);
dayjs.extend(window.dayjs_plugin_timezone);
dayjs.tz.setDefault("America/New_York");

function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const wb = XLSX.read(new Uint8Array(r.result), { type: "array" });
        const sh = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(sh, { defval: "" }));
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

function fmtMoney(n) {
  return n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtNum(n) {
  return n == null ? "—" : n.toLocaleString("en-US");
}
function fmtPct(n) {
  return n == null ? "—" : (n * 100).toFixed(1) + "%";
}

function App() {
  const [sales, setSales] = useState([]);
  const [receive, setReceive] = useState([]);
  const [times, setTimes] = useState([]);
  const [err, setErr] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [filter, setFilter] = useState("ALL");

  async function onPick(e, kind) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const rows = await readWorkbook(f);
      if (kind === "sales") setSales(rows);
      if (kind === "receive") setReceive(rows);
      if (kind === "times") setTimes(rows);
      setMetrics(null);
    } catch (e) {
      setErr(String(e));
    }
  }

  function compute() {
    setErr("");
    if (!sales.length) {
      setErr("Upload sales_transactions.xlsx first.");
      return;
    }
    const rows = sales.filter((r) => {
      const name = (r["Product Name"] || "").toString().toLowerCase();
      const u = +r["Total Inventory Sold"] || 0,
        rev = +r["Net Sales"] || 0;
      return !name.includes("sample") && u >= 0 && rev >= 0;
    });

    // per rep totals
    const reps = new Map();
    let totalRev = 0,
      totalUnits = 0;
    rows.forEach((r) => {
      const rep = (r["helped_by"] || r["Budtender"] || r["Associate"] || r["Rep"] || "Unassigned").toString().trim();
      const u = +r["Total Inventory Sold"] || 0,
        rev = +r["Net Sales"] || 0;
      totalRev += rev;
      totalUnits += u;
      const cur = reps.get(rep) || { rep, revenue: 0, units: 0, tickets: 0, totalTicket: 0 };
      cur.revenue += rev;
      cur.units += u;
      cur.tickets++;
      cur.totalTicket += rev;
      reps.set(rep, cur);
    });

    // hours
    const hours = {};
    times.forEach((t) => {
      const rep = (t["rep"] || t["Name"] || t["Employee"] || "").toString();
      const h = +t["Hours"] || +t["Hours Worked"] || 0;
      if (rep) hours[rep] = (hours[rep] || 0) + h;
    });

    // metrics per rep
    const repsArr = [...reps.values()].map((r) => {
      const avg = r.tickets ? r.totalTicket / r.tickets : 0;
      const share = totalRev ? r.revenue / totalRev : 0;
      const h = hours[r.rep] || 0;
      const twe = h > 0 ? (avg * share) / h : 0;
      return { ...r, avg_ticket: avg, share_of_sales_pct: share, hours_worked: h, twe };
    });

    // product leaderboard filters
    const filters = {
      ALL: () => true,
      "FOY Gummies": (r) =>
        (r["Product Name"] || "").toString().toLowerCase().includes("foy") &&
        (r["Category"] || "").toString().toLowerCase().includes("gumm"),
      "Brand: Ruby": (r) => (r["Vendor Name"] || "").toString().toLowerCase().includes("ruby"),
      "Brand: MFNY": (r) => (r["Vendor Name"] || "").toString().toLowerCase().includes("mfny"),
      "Category: Gummies": (r) => (r["Category"] || "").toString().toLowerCase().includes("gumm"),
    };

    const map = {};
    rows.filter(filters[filter] || (() => true)).forEach((r) => {
      const rep = (r["helped_by"] || r["Budtender"] || r["Associate"] || r["Rep"] || "Unassigned").toString().trim();
      const u = +r["Total Inventory Sold"] || 0;
      map[rep] = (map[rep] || 0) + u;
    });
    const productLB = Object.keys(map)
      .map((rep) => ({ rep, units: map[rep] }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 10);

    // sell-through (simple, by Package ID)
    const recMap = {};
    receive.forEach((x) => {
      const pkg = (x["Package Id"] || x["Package ID"] || x["Package"] || "").toString().trim();
      const q = +x["Quantity"] || +x["Units"] || 0;
      if (pkg) recMap[pkg] = (recMap[pkg] || 0) + q;
    });
    const soldMap = {};
    rows.forEach((r) => {
      const pkg = (r["Package ID"] || r["Package Id"] || "").toString().trim();
      const u = +r["Total Inventory Sold"] || 0;
      if (pkg) soldMap[pkg] = (soldMap[pkg] || 0) + u;
    });
    const sellRows = Object.keys(recMap)
      .map((pkg) => {
        const received = recMap[pkg],
          sold = soldMap[pkg] || 0;
        return { pkg, received, sold, ratio: received ? sold / received : 0 };
      })
      .sort((a, b) => b.ratio - a.ratio);
    const sellTop = sellRows.slice(0, 5),
      sellBottom = sellRows.slice(-5).reverse();

    setMetrics({
      kpis: { totalRevenue: totalRev, totalUnits },
      reps: repsArr.sort((a, b) => b.revenue - a.revenue),
      productLB,
      sellTop,
      sellBottom,
    });
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Sales Team CRM — Upload Edition</h1>
      <p className="text-sm text-gray-600">
        Upload sales (required), optional inventory receive &amp; timesheets. TZ America/New_York.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 border rounded-2xl">
          <div className="font-semibold">sales_transactions.xlsx *</div>
          <input type="file" accept=".xls,.xlsx,.csv" onChange={(e) => onPick(e, "sales")} className="mt-2" />
        </div>
        <div className="card p-4 border rounded-2xl">
          <div className="font-semibold">inventory_receive.xlsx (optional)</div>
          <input type="file" accept=".xls,.xlsx,.csv" onChange={(e) => onPick(e, "receive")} className="mt-2" />
        </div>
        <div className="card p-4 border rounded-2xl">
          <div className="font-semibold">timesheets.csv/.xlsx (optional)</div>
          <input type="file" accept=".csv,.xls,.xlsx" onChange={(e) => onPick(e, "times")} className="mt-2" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="px-4 py-2 rounded bg-black text-white disabled:bg-gray-300"
          disabled={!sales.length}
          onClick={compute}
        >
          Compute
        </button>
        <select className="border rounded px-2 py-1" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {["ALL", "FOY Gummies", "Brand: Ruby", "Brand: MFNY", "Category: Gummies"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        {err && <span className="text-red-600 text-sm">{err}</span>}
      </div>

      {metrics && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card p-4 border rounded-2xl text-center">
              <div className="text-xs text-gray-600">Total Revenue</div>
              <div className="text-xl font-bold">{fmtMoney(metrics.kpis.totalRevenue)}</div>
            </div>
            <div className="card p-4 border rounded-2xl text-center">
              <div className="text-xs text-gray-600">Total Units</div>
              <div className="text-xl font-bold">{fmtNum(metrics.kpis.totalUnits)}</div>
            </div>
            <div className="card p-4 border rounded-2xl text-center">
              <div className="text-xs text-gray-600">Top Rep (Rev)</div>
              <div className="text-lg font-semibold">{metrics.reps[0]?.rep || "—"}</div>
            </div>
            <div className="card p-4 border rounded-2xl text-center">
              <div className="text-xs text-gray-600">Top Rep (TWE)</div>
              <div className="text-lg font-semibold">
                {[...metrics.reps].sort((a, b) => b.twe - a.twe)[0]?.rep || "—"}
              </div>
            </div>
          </div>

          <div className="card p-4 border rounded-2xl">
            <div className="font-semibold mb-1">Product Leaderboard ({filter})</div>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Rep</th>
                  <th className="text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {metrics.productLB.map((x) => (
                  <tr key={x.rep} className="border-t">
                    <td>{x.rep}</td>
                    <td className="text-right">{fmtNum(x.units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-4 border rounded-2xl">
              <div className="font-semibold mb-1">Top Sell-Through</div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Package</th>
                    <th className="text-right">Sold</th>
                    <th className="text-right">Received</th>
                    <th className="text-right">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.sellTop.map((s) => (
                    <tr key={s.pkg} className="border-t">
                      <td>{s.pkg}</td>
                      <td className="text-right">{fmtNum(s.sold)}</td>
                      <td className="text-right">{fmtNum(s.received)}</td>
                      <td className="text-right">{fmtPct(s.ratio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card p-4 border rounded-2xl">
              <div className="font-semibold mb-1">Bottom Sell-Through</div>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Package</th>
                    <th className="text-right">Sold</th>
                    <th className="text-right">Received</th>
                    <th className="text-right">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.sellBottom.map((s) => (
                    <tr key={s.pkg} className="border-t">
                      <td>{s.pkg}</td>
                      <td className="text-right">{fmtNum(s.sold)}</td>
                      <td className="text-right">{fmtNum(s.received)}</td>
                      <td className="text-right">{fmtPct(s.ratio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-4 border rounded-2xl">
            <div className="font-semibold mb-1">Team Metrics</div>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>Rep</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">Avg Ticket</th>
                  <th className="text-right">Share</th>
                  <th className="text-right">Hours</th>
                  <th className="text-right">TWE</th>
                </tr>
              </thead>
              <tbody>
                {metrics.reps.map((r) => (
                  <tr key={r.rep} className="border-t">
                    <td>{r.rep}</td>
                    <td className="text-right">{fmtMoney(r.revenue)}</td>
                    <td className="text-right">{fmtNum(r.units)}</td>
                    <td className="text-right">{fmtMoney(r.avg_ticket)}</td>
                    <td className="text-right">{fmtPct(r.share_of_sales_pct)}</td>
                    <td className="text-right">{fmtNum(r.hours_worked)}</td>
                    <td className="text-right">{r.twe.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
