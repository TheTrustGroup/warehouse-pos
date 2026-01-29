import { useState, useEffect } from 'react';
import { Download, FileText, Table } from 'lucide-react';
import { useInventory } from '../contexts/InventoryContext';
import { DateRangePicker } from '../components/reports/DateRangePicker';
import { SalesMetrics } from '../components/reports/SalesMetrics';
import { SalesChart } from '../components/reports/SalesChart';
import { TopProductsTable } from '../components/reports/TopProductsTable';
import { InventoryMetrics } from '../components/reports/InventoryMetrics';
import { generateSalesReport, generateInventoryReport, exportToCSV, SalesReport, InventoryReport } from '../services/reportService';
import { Transaction } from '../types';
import { formatCurrency, getCategoryDisplay } from '../lib/utils';
import { getStoredData } from '../lib/storage';
import { parseDate, validateDateRange } from '../lib/dateUtils';

type ReportType = 'sales' | 'inventory';

export function Reports() {
  const { products } = useInventory();
  const [reportType, setReportType] = useState<ReportType>('sales');
  
  // Date range for sales reports
  const today = new Date().toISOString().split('T')[0];
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(last30Days);
  const [endDate, setEndDate] = useState(today);

  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [inventoryReport, setInventoryReport] = useState<InventoryReport | null>(null);

  // Load transactions from localStorage
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const storedTransactions = getStoredData<Transaction[]>('transactions', []);
    
    if (storedTransactions.length > 0) {
      const transactionsWithDates = storedTransactions.map((t: any) => ({
        ...t,
        createdAt: parseDate(t.createdAt) || new Date(),
        completedAt: t.completedAt ? parseDate(t.completedAt) : null,
      }));
      setTransactions(transactionsWithDates);
    }
  }, []);

  // Generate reports when data changes
  useEffect(() => {
    if (reportType === 'sales') {
      const start = parseDate(startDate);
      const end = parseDate(endDate + 'T23:59:59');
      
      if (!start || !end) {
        console.error('Invalid date range for sales report');
        setSalesReport(null);
        return;
      }
      
      const validation = validateDateRange(start, end);
      if (!validation.valid) {
        console.error('Date range validation failed:', validation.error);
        setSalesReport(null);
        return;
      }
      
      const report = generateSalesReport(transactions, products, start, end);
      setSalesReport(report);
    } else {
      const report = generateInventoryReport(products);
      setInventoryReport(report);
    }
  }, [reportType, startDate, endDate, transactions, products]);

  const handleExportSales = () => {
    if (!salesReport) return;
    
    const exportData = salesReport.topSellingProducts.map(p => ({
      'Product Name': p.productName,
      'Quantity Sold': p.quantitySold,
      'Revenue': p.revenue,
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Reports & Analytics</h1>
          <p className="text-slate-500 text-sm">Comprehensive business insights</p>
        </div>
        <button
          onClick={reportType === 'sales' ? handleExportSales : handleExportInventory}
          className="btn-primary flex items-center gap-2"
        >
          <Download className="w-5 h-5" strokeWidth={2} />
          Export CSV
        </button>
      </div>

      {/* Report Type Selector */}
      <div className="flex gap-3 animate-fade-in-up">
        <button
          onClick={() => setReportType('sales')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
            reportType === 'sales'
              ? 'btn-primary'
              : 'btn-secondary'
          }`}
        >
          <FileText className="w-5 h-5" strokeWidth={2} />
          Sales Report
        </button>
        <button
          onClick={() => setReportType('inventory')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
            reportType === 'inventory'
              ? 'btn-primary'
              : 'btn-secondary'
          }`}
        >
          <Table className="w-5 h-5" strokeWidth={2} />
          Inventory Report
        </button>
      </div>

      {/* Sales Report */}
      {reportType === 'sales' && salesReport && (
        <div className="space-y-6">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />

          <SalesMetrics report={salesReport} />

          <SalesChart report={salesReport} />

          <TopProductsTable report={salesReport} />

          {/* Category Performance */}
          <div className="table-container">
            <h3 className="text-lg font-semibold text-slate-900 mb-6 px-6 pt-6">Category Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Quantity Sold</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Revenue</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salesReport.salesByCategory.map((cat, idx) => (
                    <tr key={idx} className="table-row">
                      <td className="px-4 py-3 font-medium text-slate-900">{cat.category}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{cat.quantity}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatCurrency(cat.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {salesReport.totalRevenue > 0 ? ((cat.revenue / salesReport.totalRevenue) * 100).toFixed(1) : '0.0'}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Report */}
      {reportType === 'inventory' && inventoryReport && (
        <div className="space-y-6">
          <InventoryMetrics report={inventoryReport} />

          {/* Top Value Products */}
          <div className="table-container">
            <h3 className="text-lg font-semibold text-slate-900 mb-6 px-6 pt-6">Highest Value Inventory</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Quantity</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryReport.topValueProducts.map((product, idx) => (
                    <tr key={idx} className="table-row">
                      <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{product.quantity}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatCurrency(product.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="table-container">
            <h3 className="text-lg font-semibold text-slate-900 mb-6 px-6 pt-6">Inventory by Category</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="table-header">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Product Count</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Total Value</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryReport.productsByCategory.map((cat, idx) => (
                    <tr key={idx} className="table-row">
                      <td className="px-4 py-3 font-medium text-slate-900">{cat.category}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{cat.count}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatCurrency(cat.value)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
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
