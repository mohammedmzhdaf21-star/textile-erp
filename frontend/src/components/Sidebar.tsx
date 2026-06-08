
import React from 'react';
import { NavLink } from 'react-router-dom';
import { canAccessRoute } from '../lib/dashboardSettings';
import { getCurrentUser } from '../lib/auth';

const navigation = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/inventory', label: 'Inventory', end: true },
  { to: '/inventory/convert', label: 'Item Conversion', end: true },
  { to: '/sales', label: 'Sales', end: true },
  { to: '/sales/daily', label: 'Daily Sales', end: true },
  { to: '/sales/history', label: 'History Sales', end: true },
  { to: '/sales/owed', label: 'Owed Money', end: true },
  { to: '/tasks', label: 'Tasks', end: true },
  { to: '/task-employee', label: 'Task Employee', end: true },
  { to: '/analytics', label: 'Data Analysis', end: true },
  { to: '/trustee-commission', label: 'Trustee Commission', end: true },
  { to: '/exchange', label: 'Exchange', end: true },
  { to: '/item-input', label: 'Item Input', end: true },
];

const Sidebar: React.FC = () => {
  const user = getCurrentUser();
  const visibleNavigation = navigation.filter((nav) => canAccessRoute(user?.email, nav.to));

  return (
    <aside className="h-full w-64 shrink-0 bg-white border-r border-gray-200 p-4">
      <nav className="space-y-2">
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
            <span className={nav.to === '/sales' ? 'relative z-10' : undefined}>{nav.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
