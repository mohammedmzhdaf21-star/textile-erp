
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { canAccessRoute } from '../lib/dashboardSettings';
import { canManageEmployeeAccounts, getCurrentUser } from '../lib/auth';
import { countOpenTasks } from '../lib/taskSettings';
import LanguageSwitcher from './LanguageSwitcher';

const navigation = [
  { to: '/dashboard', labelKey: 'nav.dashboard', end: true },
  { to: '/inventory', labelKey: 'nav.inventory', end: true },
  { to: '/inventory/convert', labelKey: 'nav.itemConversion', end: true },
  { to: '/sales', labelKey: 'nav.sales', end: true },
  { to: '/sales/daily', labelKey: 'nav.dailySales', end: true },
  { to: '/sales/history', labelKey: 'nav.historySales', end: true },
  { to: '/sales/owed', labelKey: 'nav.owedMoney', end: true },
  { to: '/tasks', labelKey: 'nav.tasks', end: true },
  { to: '/task-employee', labelKey: 'nav.taskEmployee', end: true },
  { to: '/analytics', labelKey: 'nav.dataAnalysis', end: true },
  { to: '/trustee-commission', labelKey: 'nav.trusteeCommission', end: true },
  { to: '/exchange', labelKey: 'nav.exchange', end: true },
  { to: '/item-input', labelKey: 'nav.newItem', end: true },
  { to: '/employee-accounts', labelKey: 'nav.employeeAccounts', end: true, adminOnly: true },
];

type SidebarProps = {
  isOpen: boolean;
  onNavigate?: () => void;
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onNavigate }) => {
  const { t } = useTranslation();
  const user = getCurrentUser();
  const [openTaskCount, setOpenTaskCount] = useState(() => countOpenTasks());
  const visibleNavigation = navigation.filter((nav) => {
    if (nav.adminOnly && !canManageEmployeeAccounts(user)) return false;
    return canAccessRoute(user, nav.to);
  });

  useEffect(() => {
    const refreshCount = () => setOpenTaskCount(countOpenTasks());
    refreshCount();
    window.addEventListener('branch-tasks-updated', refreshCount);
    return () => window.removeEventListener('branch-tasks-updated', refreshCount);
  }, []);

  return (
    <aside
      className={`sidebar-panel ${isOpen ? 'sidebar-panel--open' : 'sidebar-panel--closed'}`}
      aria-hidden={!isOpen}
    >
      <div className="sidebar-panel__sheen" aria-hidden="true" />
      <div className="sidebar-panel__edge" aria-hidden="true" />
      <nav className="sidebar-panel__nav">
        {visibleNavigation.map((nav, index) => (
          <NavLink
            key={nav.to}
            to={nav.to}
            end={nav.end}
            onClick={() => {
              if (window.innerWidth < 1024) {
                onNavigate?.();
              }
            }}
            style={{ transitionDelay: isOpen ? `${index * 35}ms` : '0ms' }}
            className={({ isActive }) => {
              const motion = 'sidebar-nav-item';
              if (nav.to === '/sales') {
                return isActive
                  ? `nav-liquid-sales scale-[1.02] ${motion}`
                  : `nav-liquid-sales opacity-95 hover:opacity-100 ${motion}`;
              }

              return isActive
                ? `block px-3 py-2 rounded-md bg-black text-white font-semibold ${motion}`
                : `block px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100 transition-colors ${motion}`;
            }}
          >
            <span
              className={`flex items-center justify-between gap-2 ${
                nav.to === '/sales' ? 'relative z-10' : ''
              }`}
            >
              <span>{t(nav.labelKey)}</span>
              {nav.to === '/task-employee' && openTaskCount > 0 && (
                <span
                  className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white"
                  aria-label={t('nav.openTasksBadge', { count: openTaskCount })}
                >
                  {openTaskCount > 99 ? '99+' : openTaskCount}
                </span>
              )}
            </span>
          </NavLink>
        ))}
      </nav>
      <LanguageSwitcher className="sidebar-panel__footer mt-4 border-t border-gray-100/80 pt-4" />
    </aside>
  );
};

export default Sidebar;
