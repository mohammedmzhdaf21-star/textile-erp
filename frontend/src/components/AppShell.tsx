import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ensureCommissionSettingsSynced } from '../lib/commissionSettingsApi';
import api from '../lib/api';
import { applyShopBranches } from '../lib/inventoryCodes';
import Sidebar from './Sidebar';
import SidebarToggle from './SidebarToggle';

const SIDEBAR_STORAGE_KEY = 'textile-erp-sidebar-open';

type AppShellProps = {
  children: React.ReactNode;
};

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const location = useLocation();
  const [branchVersion, setBranchVersion] = useState(0);
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });

  const toggleSidebar = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    void ensureCommissionSettingsSynced();
    void api
      .get<{ branches: Array<{ id: string; code: string; name: string }> }>('/branches')
      .then((response) => {
        applyShopBranches(response.data.branches ?? []);
        setBranchVersion((current) => current + 1);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const sync = () => setBranchVersion((current) => current + 1);
    window.addEventListener('shop-branches-updated', sync);
    return () => window.removeEventListener('shop-branches-updated', sync);
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('sidebar-open', isOpen);
    document.body.classList.toggle('sidebar-closed', !isOpen);
    return () => {
      document.body.classList.remove('sidebar-open', 'sidebar-closed');
    };
  }, [isOpen]);

  return (
    <div className="app-shell">
      <Sidebar isOpen={isOpen} onNavigate={closeSidebar} />
      <button
        type="button"
        aria-hidden={!isOpen}
        tabIndex={isOpen ? 0 : -1}
        className={`sidebar-backdrop ${isOpen ? 'sidebar-backdrop--visible' : ''}`}
        onClick={closeSidebar}
      />
      <SidebarToggle isOpen={isOpen} onToggle={toggleSidebar} />
      <main className={`app-shell__main ${isOpen ? 'app-shell__main--with-sidebar' : ''}`}>
        <div className="app-shell__content" data-branches={branchVersion}>{children}</div>
      </main>
    </div>
  );
};

export default AppShell;
