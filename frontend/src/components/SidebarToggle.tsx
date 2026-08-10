import React from 'react';
import { useTranslation } from 'react-i18next';

type SidebarToggleProps = {
  isOpen: boolean;
  onToggle: () => void;
};

const SidebarToggle: React.FC<SidebarToggleProps> = ({ isOpen, onToggle }) => {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-label={isOpen ? t('sidebar.closeMenu') : t('sidebar.openMenu')}
      className={`sidebar-toggle ${isOpen ? 'sidebar-toggle--open' : 'sidebar-toggle--closed'}`}
    >
      <span className="sidebar-toggle__glow" aria-hidden="true" />
      <span className="sidebar-toggle__ring" aria-hidden="true" />
      <span className="sidebar-toggle__icon" aria-hidden="true">
        <span className="sidebar-toggle__line sidebar-toggle__line--top" />
        <span className="sidebar-toggle__line sidebar-toggle__line--mid" />
        <span className="sidebar-toggle__line sidebar-toggle__line--bot" />
      </span>
      <span className="sidebar-toggle__label">{isOpen ? t('sidebar.hide') : t('sidebar.menu')}</span>
    </button>
  );
};

export default SidebarToggle;
