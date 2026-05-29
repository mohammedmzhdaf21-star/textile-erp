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
import SaleDetail from './pages/SaleDetail';
import { isAuthenticated } from './lib/auth';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <main className="flex-1 p-4 overflow-auto">{children}</main>
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
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
