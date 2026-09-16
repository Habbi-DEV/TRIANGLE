import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './lib/i18n';
import ProtectedRoute from './components/ProtectedRoute';
import RoleGuard from './components/RoleGuard';
import { ToastProvider } from './components/ui/ToastProvider';
import MenuPage from './pages/MenuPage';
import LoginPage from './pages/LoginPage';
import AdminLayout from './pages/admin/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import RegisterPage from './pages/admin/RegisterPage';
import OrdersPage from './pages/admin/OrdersPage';
import MenuManagePage from './pages/admin/MenuManagePage';
import TablesPage from './pages/admin/TablesPage';
import InventoryPage from './pages/admin/InventoryPage';
import SchemaPage from './pages/admin/SchemaPage';
import SettingsPage from './pages/admin/SettingsPage';
import StaffPage from './pages/admin/StaffPage';
import DriverLayout from './pages/driver/DriverLayout';
import DriverActivePage from './pages/driver/DriverActivePage';
import DriverAvailablePage from './pages/driver/DriverAvailablePage';
import DriverHistoryPage from './pages/driver/DriverHistoryPage';
import { loadSettings } from './lib/settings';

export default function App() {
  // Loaded once at the root so money() (used on both the public e-menu and
  // the admin dashboard) has the real currency as early as possible. Until
  // this resolves, money() falls back to EUR. Also syncs the browser tab
  // title to the configured restaurant name, so a rename in Settings shows
  // up there too, not just in the header/sidebar.
  useEffect(() => {
    loadSettings().then((s) => {
      if (s?.restaurant_name) document.title = s.restaurant_name;
    });
  }, []);

  return (
    <ThemeProvider>
    <LanguageProvider>
    <ToastProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Customer-facing, mobile-first e-menu */}
          <Route path="/" element={<MenuPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Staff dashboard — one shell (/admin), nav + routes filtered by role.
              Each child is additionally guarded so a direct URL can't bypass the nav filter. */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin', 'cashier', 'kitchen']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<RoleGuard allowedRoles={['admin', 'cashier', 'kitchen']}><DashboardPage /></RoleGuard>} />
            <Route path="register" element={<RoleGuard allowedRoles={['admin', 'cashier']}><RegisterPage /></RoleGuard>} />
            <Route path="orders" element={<RoleGuard allowedRoles={['admin', 'cashier', 'kitchen']}><OrdersPage /></RoleGuard>} />
            <Route path="menu" element={<RoleGuard allowedRoles={['admin']}><MenuManagePage /></RoleGuard>} />
            <Route path="tables" element={<RoleGuard allowedRoles={['admin', 'cashier']}><TablesPage /></RoleGuard>} />
            <Route path="inventory" element={<RoleGuard allowedRoles={['admin', 'kitchen']}><InventoryPage /></RoleGuard>} />
            <Route path="schema" element={<RoleGuard allowedRoles={['admin']}><SchemaPage /></RoleGuard>} />
            <Route path="settings" element={<RoleGuard allowedRoles={['admin']}><SettingsPage /></RoleGuard>} />
            <Route path="staff" element={<RoleGuard allowedRoles={['admin']}><StaffPage /></RoleGuard>} />
          </Route>

          {/* Delivery Driver Dashboard — mobile-first, separate shell from /admin */}
          <Route
            path="/driver"
            element={
              <ProtectedRoute allowedRoles={['delivery_driver']}>
                <DriverLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DriverActivePage />} />
            <Route path="available" element={<DriverAvailablePage />} />
            <Route path="history" element={<DriverHistoryPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ToastProvider>
    </LanguageProvider>
    </ThemeProvider>
  );
}
