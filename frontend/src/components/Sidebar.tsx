
import React from 'react';
import { NavLink } from 'react-router-dom';

const navigation = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/inventory', label: 'Inventory', end: true },
  { to: '/sales', label: 'Sales', end: true },
  { to: '/exchange', label: 'Exchange', end: true },
  { to: '/item-input', label: 'Item Input', end: true },
  { to: '/sales/daily', label: 'Daily Sales', end: false },
];

const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 h-full bg-white border-r border-gray-200 p-4">
      <nav className="space-y-2">
        {navigation.map((nav) => (
          <NavLink
            key={nav.to}
            to={nav.to}
            end={nav.end}
            className={({ isActive }) =>
              isActive
                ? 'block px-3 py-2 rounded-md bg-magenta-500 text-white font-semibold'
                : 'block px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100 transition-colors'
            }
          >
            {nav.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
