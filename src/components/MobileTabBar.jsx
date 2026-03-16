import './MobileTabBar.css'

const TABS = [
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'vehicles', label: 'Vehicles', icon: 'directions_car' },
]

export default function MobileTabBar({ activeTab, onSelect }) {
  return (
    <nav className="mobile-tab-bar" role="tablist" aria-label="Main navigation">
      {TABS.map(({ id, label, icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={activeTab === id}
          aria-label={label}
          className={`mobile-tab-bar__tab ${activeTab === id ? 'mobile-tab-bar__tab--active' : ''}`}
          onClick={() => onSelect(id)}
        >
          <span className="material-symbols-outlined mobile-tab-bar__icon" aria-hidden>
            {icon}
          </span>
          <span className="mobile-tab-bar__label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
