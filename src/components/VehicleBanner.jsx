import './VehicleBanner.css'

export default function VehicleBanner({ vehicle }) {
  if (!vehicle) return null
  return (
    <div className={`vehicle-banner vehicle-banner--${vehicle.color}`} role="banner">
      <span className="vehicle-banner-text">
        Xbox controller overrides {vehicle.name}
      </span>
    </div>
  )
}
