import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppShell from './components/AppShell';
import Inventory from './pages/Inventory';
import ItemConversion from './pages/ItemConversion';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Sales from './pages/Sales';
import Exchange from './pages/Exchange';
import ItemInput from './pages/ItemInput';
import DailySales from './pages/DailySales';
import HistorySales from './pages/HistorySales';
import OwedMoney from './pages/OwedMoney';
import Tasks from './pages/Tasks';
import TaskEmployee from './pages/TaskEmployee';
import DataAnalysis from './pages/DataAnalysis';
import TrusteeCommission from './pages/TrusteeCommission';
import SaleDetail from './pages/SaleDetail';
import EmployeeAccounts from './pages/EmployeeAccounts';
import { getCurrentUser, isAuthenticated } from './lib/auth';
import { canAccessAdminRoute, canAccessRoute } from './lib/dashboardSettings';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const user = getCurrentUser();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessAdminRoute(user, location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!canAccessRoute(user, location.pathname)) {
    return <Navigate to="/task-employee" replace />;
  }

  return <AppShell>{children}</AppShell>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedLayout>
              <Dashboard />
            </ProtectedLayout>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedLayout>
              <Inventory />
            </ProtectedLayout>
          }
        />
        <Route
          path="/inventory/convert"
          element={
            <ProtectedLayout>
              <ItemConversion />
            </ProtectedLayout>
          }
        />
        <Route
          path="/sales"
          element={
            <ProtectedLayout>
              <Sales />
            </ProtectedLayout>
          }
        />
        <Route
          path="/exchange"
          element={
            <ProtectedLayout>
              <Exchange />
            </ProtectedLayout>
          }
        />
        <Route
          path="/item-input"
          element={
            <ProtectedLayout>
              <ItemInput />
            </ProtectedLayout>
          }
        />
        <Route
          path="/sales/:id"
          element={
            <ProtectedLayout>
              <SaleDetail />
            </ProtectedLayout>
          }
        />
        <Route
          path="/sales/daily"
          element={
            <ProtectedLayout>
              <DailySales />
            </ProtectedLayout>
          }
        />
        <Route
          path="/sales/history"
          element={
            <ProtectedLayout>
              <HistorySales />
            </ProtectedLayout>
          }
        />
        <Route
          path="/sales/owed"
          element={
            <ProtectedLayout>
              <OwedMoney />
            </ProtectedLayout>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedLayout>
              <Tasks />
            </ProtectedLayout>
          }
        />
        <Route
          path="/task-employee"
          element={
            <ProtectedLayout>
              <TaskEmployee />
            </ProtectedLayout>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedLayout>
              <DataAnalysis />
            </ProtectedLayout>
          }
        />
        <Route
          path="/trustee-commission"
          element={
            <ProtectedLayout>
              <TrusteeCommission />
            </ProtectedLayout>
          }
        />
        <Route
          path="/employee-accounts"
          element={
            <ProtectedLayout>
              <EmployeeAccounts />
            </ProtectedLayout>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
