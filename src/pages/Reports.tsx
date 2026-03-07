import { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, FileText, Table } from 'lucide-react';
import { useInventory } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { useWarehouse } from '../contexts/WarehouseContext';
import { isValidWarehouseId } from '../lib/warehouseId';
import { DateRangePicker } from '../components/reports/DateRangePicker';
import { SalesMetrics } from '../components/reports/SalesMetrics';
import { SalesChart } from '../components/reports/SalesChart';
import { TopProductsTable } from '../components/reports/TopProductsTable';
import { InventoryMetrics } from '../components/reports/InventoryMetrics';
import { generateSalesReport, generateInventoryReport, exportToCSV, mapApiReportToSalesReport, SalesReport, InventoryReport } from '../services/reportService';
import { fetchSalesReport } from '../services/reportsApi';
import { fetchTransactionsFromApi } from '../services/transactionsApi';
import { Transaction } from '../types';
import { formatCurrency, getCategoryDisplay } from '../lib/utils';
import { getStoredData } from '../lib/storage';
import { parseDate, validateDateRange } from '../lib/dateUtils';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../lib/api';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';

type ReportType = 'sales' | 'inventory';
type TransactionsSource = 'server' | 'local';

export function Reports() {
  const { products } = useInventory();
  const { user } = useAuth();
  const { currentWarehouseId } = useWarehouse();
  const [reportType, setReportType] = useState<ReportType>('sales');

  const today = new Date().toISOString().split('T')[0];
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(last30Days);
  const [endDate, setEndDate] = useState(today);

  const setPeriod = useCallback((preset: 'today' | 'week' | 'month' | 'last_month' | 'quarter' | 'year') => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    end.setHours(23, 59, 59, 999);
    switch (preset) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'week': {
        const day = start.getDay();
        start.setDate(start.getDate() - day);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case 'month':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'last_month':
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setTime(start.getTime());
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'quarter': {
        const q = Math.floor(start.getMonth() / 3) + 1;
        start.setMonth((q - 1) * 3);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case 'year':
        start.setMonth(0);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
    }
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  }, []);

  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  /** When set, sales metrics come from GET /api/reports/sales (sales + sale_lines). */
  const [salesReportFromApi, setSalesReportFromApi] = useState<SalesReport | null>(null);
  const [inventoryReport, setInventoryReport] = useState<InventoryReport | null>(null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsSource, setTransactionsSource] = useState<TransactionsSource>('local');
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [salesReportLoading, setSalesReportLoading] = useState(false);
  /** True when API was tried but returned 404/5xx or failed; show banner that report is from local data (P3#20). */
  const [serverReportUnavailable, setServerReportUnavailable] = useState(false);

  /** Displayed sales report: prefer API (SQL from sales/sale_lines), else JS from transactions. */
  const displayedSalesReport = salesReportFromApi ?? salesReport;

  const getProductQty = useCallback((p: { quantity?: number; quantityBySize?: Array<{ quantity?: number }>; sizeKind?: string }) => {
    if (p.sizeKind === 'sized' && (p.quantityBySize?.length ?? 0) > 0) {
      return (p.quantityBySize ?? []).reduce((s, r) => s + (r.quantity ?? 0), 0);
    }
    return Number(p.quantity ?? 0) || 0;
  }, []);

  const inventorySnapshot = useMemo(() => {
    const list = products ?? [];
    let atCost = 0;
    let atSelling = 0;
    let totalUnits = 0;
    let outOfStock = 0;
    let lowStock = 0;
    let noCostPrice = 0;
    const reorderDefault = 3;
    list.forEach((p) => {
      const q = getProductQty(p);
      const cost = Number((p as { costPrice?: number }).costPrice ?? 0) || 0;
      const selling = Number((p as { sellingPrice?: number }).sellingPrice ?? 0) || 0;
      atCost += q * cost;
      atSelling += q * selling;
      totalUnits += q;
      if (q === 0) outOfStock++;
      else if (q <= (Number((p as { reorderLevel?: number }).reorderLevel ?? 0) || reorderDefault)) lowStock++;
      if (cost === 0) noCostPrice++;
    });
    return {
      stockValueAtCost: atCost,
      stockValueAtSelling: atSelling,
      potentialProfit: atSelling - atCost,
      totalUnits,
      outOfStock,
      lowStock,
      noCostPrice,
      skuCount: list.length,
    };
  }, [products, getProductQty]);

  /** Any authenticated user can fetch transactions; API returns scope-filtered data for non-admin (Phase 3). */
  const canFetchServerTransactions = !!user;

  /** Fetch sales report from GET /api/reports/sales (single source of truth: sales + sale_lines). */
  useEffect(() => {
    if (reportType !== 'sales' || !isValidWarehouseId(currentWarehouseId) || !user) {
      setSalesReportFromApi(null);
      return;
    }
    const fromIso = `${startDate}T00:00:00.000Z`;
    const toIso = `${endDate}T23:59:59.999Z`;
    setSalesReportLoading(true);
    setSalesReportFromApi(null);
    fetchSalesReport(API_BASE_URL, {
      warehouseId: currentWarehouseId,
      from: fromIso,
      to: toIso,
    })
      .then((api) => {
        if (api) {
          setSalesReportFromApi(mapApiReportToSalesReport(api));
          setServerReportUnavailable(false);
        } else {
          setServerReportUnavailable(true);
        }
      })
      .catch(() => setServerReportUnavailable(true))
      .finally(() => setSalesReportLoading(false));
  }, [reportType, currentWarehouseId, startDate, endDate, user]);

  const loadSalesData = useCallback(async () => {
    const start = parseDate(startDate);
    const end = parseDate(endDate + 'T23:59:59');
    if (!start || !end) return;
    const validation = validateDateRange(start, end);
    if (!validation.valid) return;

    const fromIso = start.toISOString();
    const toIso = end.toISOString();

    const fallbackLocal = () => {
      const stored = getStoredData<Transaction[]>('transactions', []);
      const raw = Array.isArray(stored) ? stored : [];
      const withDates = raw
        .filter((t: unknown) => t != null && typeof t === 'object')
        .map((t: any) => ({
          ...t,
          items: Array.isArray(t?.items) ? t.items.filter((i: unknown) => i != null && typeof i === 'object') : [],
          createdAt: parseDate(t?.createdAt) || new Date(),
          completedAt: t?.completedAt ? parseDate(t.completedAt) : null,
        }));
      setTransactions(withDates);
      setTransactionsSource('local');
    };

    if (canFetchServerTransactions) {
      setTransactionsLoading(true);
      try {
        const { data } = await fetchTransactionsFromApi(API_BASE_URL, {
          from: fromIso,
          to: toIso,
          limit: 2000,
        });
        const safe = (data ?? []).filter((t): t is Transaction => t != null && typeof t === 'object');
        setTransactions(safe);
        setTransactionsSource('server');
        setServerReportUnavailable(false);
      } catch {
        setServerReportUnavailable(true);
        fallbackLocal();
      } finally {
        setTransactionsLoading(false);
      }
    } else {
      fallbackLocal();
    }
  }, [startDate, endDate, canFetchServerTransactions]);

  useEffect(() => {
    loadSalesData();
  }, [loadSalesData]);

  useEffect(() => {
    if (reportType === 'sales') {
      if (salesReportFromApi != null) return;
      const start = parseDate(startDate);
      const end = parseDate(endDate + 'T23:59:59');
      if (!start || !end) {
        setSalesReport(null);
        return;
      }
      const validation = validateDateRange(start, end);
      if (!validation.valid) {
        setSalesReport(null);
        return;
      }
      const report = generateSalesReport(transactions, products, start, end);
      setSalesReport(report);
    } else {
      const report = generateInventoryReport(products);
      setInventoryReport(report);
    }
  }, [reportType, startDate, endDate, transactions, products, salesReportFromApi]);

  const handleExportSales = () => {
    if (!displayedSalesReport) return;

    const exportData = displayedSalesReport.topSellingProducts.map(p => ({
      'Product Name': p.productName,
      'Quantity Sold': p.quantitySold,
      'Revenue': p.revenue,
      ...(p.cogs != null && { 'Cost': p.cogs }),
      ...(p.profit != null && { 'Profit': p.profit }),
    }));
    
    exportToCSV(exportData, 'sales_report');
  };

  const handleExportInventory = () => {
    const exportData = products.map(p => ({
      'SKU': p.sku,
      'Name': p.name,
      'Category': getCategoryDisplay(p.category),
      'Quantity': p.quantity,
      'Cost Price': p.costPrice,
      'Selling Price': p.sellingPrice,
      'Total Value': p.quantity * p.costPrice,
    }));
    
    exportToCSV(exportData, 'inventory_report');
  };

  return (
    <div className="space-y-8 min-h-screen bg-[var(--edk-bg)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in-up">
        <PageHeader title="Reports & Analytics" description="Comprehensive business insights" />
        <Button
          type="button"
          variant="primary"
          onClick={reportType === 'sales' ? handleExportSales : handleExportInventory}
          className="flex items-center gap-2"
        >
          <Download className="w-5 h-5" strokeWidth={2} />
          Export CSV
        </Button>
      </div>

      {/* Report Type Selector */}
      <div className="flex gap-3 animate-fade-in-up">
        <Button
          type="button"
          variant={reportType === 'sales' ? 'primary' : 'secondary'}
          onClick={() => setReportType('sales')}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold"
        >
          <FileText className="w-5 h-5" strokeWidth={2} />
          Sales Report
        </Button>
        <Button
          type="button"
          variant={reportType === 'inventory' ? 'primary' : 'secondary'}
          onClick={() => setReportType('inventory')}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold"
        >
          <Table className="w-5 h-5" strokeWidth={2} />
          Inventory Report
        </Button>
      </div>

      {/* Sales Report */}
      {reportType === 'sales' && (
        <div className="space-y-6">
          <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-4 animate-fade-in-up">
            <h3 className="font-semibold text-[var(--edk-ink)] mb-3">Period</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {(['today', 'week', 'month', 'last_month', 'quarter', 'year'] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPeriod(preset)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--edk-surface-2)] text-[var(--edk-ink-2)] hover:bg-[var(--edk-border-mid)] transition-colors"
                >
                  {preset === 'today' ? 'Today' : preset === 'week' ? 'This Week' : preset === 'month' ? 'This Month' : preset === 'last_month' ? 'Last Month' : preset === 'quarter' ? 'Last 3 Months' : 'This Year'}
                </button>
              ))}
            </div>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
            />
          </div>
          {(salesReportLoading || transactionsLoading) && (
            <p className="text-sm text-[var(--edk-ink-3)]">
              {salesReportLoading ? 'Loading sales report…' : 'Loading sales from server…'}
            </p>
          )}
          {serverReportUnavailable && reportType === 'sales' && (
            <div className="rounded-[var(--edk-radius)] border border-[var(--edk-amber)]/30 bg-[var(--edk-amber-bg)] px-4 py-2.5 text-sm text-[var(--edk-ink)]">
              Report is from local data; server report unavailable.
            </div>
          )}
          {!salesReportLoading && !transactionsLoading && reportType === 'sales' && (
            <p className="text-sm text-[var(--edk-ink-3)]">
              {salesReportFromApi != null
                ? 'Sales from POS (revenue, COGS, profit from sale records).'
                : transactionsSource === 'server'
                  ? 'Showing sales from server (all devices).'
                  : 'Showing sales from this device.'}
            </p>
          )}

          {displayedSalesReport && (
            <>
              <SalesMetrics report={displayedSalesReport} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-4">
                  <p className="text-sm font-medium text-[var(--edk-ink-2)] mb-1">Stock value (at cost)</p>
                  <p className="text-xl font-bold text-[var(--edk-ink)]">{formatCurrency(inventorySnapshot.stockValueAtCost)}</p>
                  <p className="text-xs text-[var(--edk-ink-3)] mt-1">{inventorySnapshot.skuCount} SKUs · {inventorySnapshot.totalUnits} units</p>
                </div>
                <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-4">
                  <p className="text-sm font-medium text-[var(--edk-ink-2)] mb-1">Stock value (at selling price)</p>
                  <p className="text-xl font-bold text-[var(--edk-ink)]">{formatCurrency(inventorySnapshot.stockValueAtSelling)}</p>
                  <p className="text-xs text-[var(--edk-ink-3)] mt-1">Potential revenue if all sold</p>
                </div>
                <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-4">
                  <p className="text-sm font-medium text-[var(--edk-ink-2)] mb-1">Potential profit in stock</p>
                  <p className="text-xl font-bold text-[var(--edk-ink)]">{formatCurrency(inventorySnapshot.potentialProfit)}</p>
                  <p className="text-xs text-[var(--edk-ink-3)] mt-1">
                    {inventorySnapshot.stockValueAtSelling > 0
                      ? `${((inventorySnapshot.potentialProfit / inventorySnapshot.stockValueAtSelling) * 100).toFixed(1)}% potential margin`
                      : '—'}
                  </p>
                </div>
              </div>
              <SalesChart report={displayedSalesReport} />
              <TopProductsTable report={displayedSalesReport} />
              <div className="table-container rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] overflow-hidden">
                <h3 className="text-lg font-semibold text-[var(--edk-ink)] mb-6 px-6 pt-6">Category Performance</h3>
            <div className="table-scroll-wrap">
              <table className="w-full min-w-[320px]">
                <thead className="table-header bg-[var(--edk-surface-2)] border-b border-[var(--edk-border)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--edk-ink-3)] uppercase">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[var(--edk-ink-3)] uppercase">Quantity Sold</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[var(--edk-ink-3)] uppercase">Revenue</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[var(--edk-ink-3)] uppercase">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSalesReport.salesByCategory.map((cat, idx) => (
                    <tr key={idx} className="table-row border-b border-[var(--edk-border)]">
                      <td className="px-4 py-3 font-medium text-[var(--edk-ink)]">{cat.category}</td>
                      <td className="px-4 py-3 text-right text-[var(--edk-ink-2)]">{cat.quantity}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--edk-ink)]">
                        {formatCurrency(cat.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--edk-ink-2)]">
                        {displayedSalesReport.totalRevenue > 0 ? ((cat.revenue / displayedSalesReport.totalRevenue) * 100).toFixed(1) : '0.0'}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
              <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-4">
                <h3 className="font-semibold text-[var(--edk-ink)] mb-3">Alerts</h3>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex items-center justify-between">
                    <span className="text-[var(--edk-ink-2)]">Out of stock</span>
                    <span className="font-semibold text-[var(--edk-red)]">{inventorySnapshot.outOfStock}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-[var(--edk-ink-2)]">Low stock (at or below reorder level)</span>
                    <span className="font-semibold text-[var(--edk-amber)]">{inventorySnapshot.lowStock}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-[var(--edk-ink-2)]">Products with no cost price</span>
                    <span className="font-semibold text-[var(--edk-ink-2)]">{inventorySnapshot.noCostPrice}</span>
                  </li>
                </ul>
                <p className="text-xs text-[var(--edk-ink-3)] mt-2">Cost price is required for accurate profit in reports.</p>
              </div>
              <div className="flex justify-end">
                <Link to="/sales" className="text-sm font-semibold text-[var(--edk-red)] hover:underline">
                  View full sales history →
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {/* Inventory Report */}
      {reportType === 'inventory' && inventoryReport && (
        <div className="space-y-6">
          <InventoryMetrics report={inventoryReport} />

          <div className="table-container rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] overflow-hidden">
            <h3 className="text-lg font-semibold text-[var(--edk-ink)] mb-6 px-6 pt-6">Highest Value Inventory</h3>
            <div className="table-scroll-wrap">
              <table className="w-full min-w-[280px]">
                <thead className="table-header bg-[var(--edk-surface-2)] border-b border-[var(--edk-border)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--edk-ink-3)] uppercase">Product</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[var(--edk-ink-3)] uppercase">Quantity</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[var(--edk-ink-3)] uppercase">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryReport.topValueProducts.map((product, idx) => (
                    <tr key={idx} className="table-row border-b border-[var(--edk-border)]">
                      <td className="px-4 py-3 font-medium text-[var(--edk-ink)]">{product.name}</td>
                      <td className="px-4 py-3 text-right text-[var(--edk-ink-2)]">{product.quantity}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--edk-ink)]">
                        {formatCurrency(product.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="table-container rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] overflow-hidden">
            <h3 className="text-lg font-semibold text-[var(--edk-ink)] mb-6 px-6 pt-6">Inventory by Category</h3>
            <div className="table-scroll-wrap">
              <table className="w-full min-w-[320px]">
                <thead className="table-header bg-[var(--edk-surface-2)] border-b border-[var(--edk-border)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--edk-ink-3)] uppercase">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[var(--edk-ink-3)] uppercase">Product Count</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[var(--edk-ink-3)] uppercase">Total Value</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[var(--edk-ink-3)] uppercase">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryReport.productsByCategory.map((cat, idx) => (
                    <tr key={idx} className="table-row border-b border-[var(--edk-border)]">
                      <td className="px-4 py-3 font-medium text-[var(--edk-ink)]">{cat.category}</td>
                      <td className="px-4 py-3 text-right text-[var(--edk-ink-2)]">{cat.count}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--edk-ink)]">
                        {formatCurrency(cat.value)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--edk-ink-2)]">
                        {inventoryReport.totalStockValue > 0 ? ((cat.value / inventoryReport.totalStockValue) * 100).toFixed(1) : '0.0'}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
