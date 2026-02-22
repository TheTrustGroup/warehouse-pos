/**
 * Dashboard route component. Implementation lives in DashboardPage.tsx so that
 * stats are always fetched for the warehouse selected in WarehouseContext (fixes
 * "Main Town selected but Main Store stats" bug). Re-export keeps existing routes working.
 */
import DashboardPage from './DashboardPage';

export function Dashboard() {
  return <DashboardPage />;
}
