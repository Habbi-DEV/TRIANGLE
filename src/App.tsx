import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './lib/i18n';
import ProtectedRoute from './components/ProtectedRoute';
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
    <LanguageProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Customer-facing, mobile-first e-menu */}
          <Route path="/" element={<MenuPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Staff dashboard — desktop-first, responsive */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="menu" element={<MenuManagePage />} />
            <Route path="tables" element={<TablesPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="schema" element={<SchemaPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="staff" element={<StaffPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </LanguageProvider>
  );
}
