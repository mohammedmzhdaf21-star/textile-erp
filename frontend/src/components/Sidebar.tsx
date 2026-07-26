
import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { canAccessRoute } from '../lib/dashboardSettings';
import { getCurrentUser } from '../lib/auth';
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
];

const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const user = getCurrentUser();
  const visibleNavigation = navigation.filter((nav) => canAccessRoute(user?.email, nav.to));

  return (
    <aside className="h-full w-64 shrink-0 bg-white border-r border-gray-200 p-4 flex flex-col">
      <nav className="space-y-2 flex-1">
        {visibleNavigation.map((nav) => (
          <NavLink
            key={nav.to}
            to={nav.to}
            end={nav.end}
            className={({ isActive }) => {
              if (nav.to === '/sales') {
                return isActive
                  ? 'nav-liquid-sales scale-[1.02]'
                  : 'nav-liquid-sales opacity-95 hover:opacity-100';
              }

              return isActive
                ? 'block px-3 py-2 rounded-md bg-black text-white font-semibold'
                : 'block px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100 transition-colors';
            }}
          >
            <span className={nav.to === '/sales' ? 'relative z-10' : undefined}>{t(nav.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
      <LanguageSwitcher className="mt-4 border-t border-gray-100 pt-4" />
    </aside>
  );
};

export default Sidebar;
