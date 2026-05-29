import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Inventory from './pages/Inventory';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Sales from './pages/Sales';
import Exchange from './pages/Exchange';
import ItemInput from './pages/ItemInput';
import DailySales from './pages/DailySales';
import HistorySales from './pages/HistorySales';
import OwedMoney from './pages/OwedMoney';
import Tasks from './pages/Tasks';
import DataAnalysis from './pages/DataAnalysis';
import SaleDetail from './pages/SaleDetail';
import { isAuthenticated } from './lib/auth';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="flex min-h-screen max-w-full overflow-x-hidden bg-white">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">{children}</main>
    </div>
  );
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
          path="/analytics"
          element={
            <ProtectedLayout>
              <DataAnalysis />
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
