import './VehicleBanner.css'

export default function VehicleBanner({ vehicle, onClose, isMobile }) {
  if (!vehicle) return null
  return (
    <div className={`vehicle-banner vehicle-banner--${vehicle.color}`} role="banner">
      <span className="vehicle-banner-text">
        Xbox controller overrides {vehicle.name}
      </span>
      {onClose && (
        <button
          type="button"
          className="vehicle-banner-close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
