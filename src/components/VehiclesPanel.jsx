import { useState } from 'react'
import { VEHICLES } from '../data/vehicles'
import './VehiclesPanel.css'

const STATUS_LABELS = {
  intervention: 'Needs help',
  active:       'Working',
  paused:       'Paused',
  idle:         'Idle',
}

const GROUPS = [
  { keys: ['intervention', 'paused'], label: 'Needs help' },
  { keys: ['active'],                 label: 'Working' },
  { keys: ['idle'],                   label: 'Idle' },
]

const STATUS_FILTERS = [
  { value: 'all',        label: 'All' },
  { value: 'needs-help', label: 'Needs help' },
  { value: 'working',    label: 'Working' },
  { value: 'idle',       label: 'Idle' },
]

const FILTER_KEYS = {
  'needs-help': ['intervention', 'paused'],
  'working':    ['active'],
  'idle':       ['idle'],
}

export default function VehiclesPanel({
  stoppedVehicleIds = new Set(),
  onSelectVehicle = () => {},
  onStopVehicle = () => {},
  onResumeVehicle = () => {},
  onClose = () => {},
  effectiveVehicleStatuses = {},
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const getStatus = (v) => effectiveVehicleStatuses[v.id] ?? v.status

  const allowedKeys = statusFilter === 'all' ? null : FILTER_KEYS[statusFilter]

  const handleCardClick = (e, vehicleId) => {
    if (e.target.closest('button')) return
    onSelectVehicle(vehicleId)
  }

  return (
    <aside className="vehicles-panel">
      <header className="vehicles-header">
        <div className="vehicles-search-row">
          <span className="material-symbols-outlined vehicles-search-icon" aria-hidden>search</span>
          <input
            className="vehicles-search-input"
            type="search"
            placeholder="Search vehicles"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search vehicles"
          />
          {search && (
            <button type="button" className="vehicles-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <span className="material-symbols-outlined" aria-hidden>close</span>
            </button>
          )}
        </div>
        <div className="vehicles-filter-row">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`vehicles-filter-pill${statusFilter === f.value ? ' vehicles-filter-pill--selected' : ''}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="vehicle-view-back vehicles-header-close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="vehicles-list">
        {GROUPS.map(({ keys, label }) => {
          if (allowedKeys && !keys.some((k) => allowedKeys.includes(k))) return null
          const group = VEHICLES
            .filter((v) => keys.includes(getStatus(v)))
            .filter((v) => v.name.toLowerCase().includes(search.toLowerCase()))
          if (group.length === 0) return null
          return (
            <div key={label} className="vehicles-group">
              <p className="vehicles-group-label">{label}</p>
              <ul role="list">
                {group.map((v) => {
                  const status = getStatus(v)
                  return (
                    <li
                      key={v.id}
                      className={`vehicle-card ${status}`}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleCardClick(e, v.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleCardClick(e, v.id)
                        }
                      }}
                      aria-label={`View ${v.name}`}
                    >
                      <div className={`vehicle-avatar ${v.color}`}>
                        <img src="/bobcat-vehicle.png" alt="" className="bobcat-avatar-img" />
                      </div>
                      <div className="vehicle-info">
                        <span className="vehicle-name">{v.name}</span>
                        <span className="vehicle-status-label">
                          <span className={`vehicle-status-dot vehicle-status-dot--${status}`} aria-hidden />
                          {STATUS_LABELS[status] ?? v.statusLabel}
                        </span>
                      </div>
                      {status === 'active' && (
                        <button
                          type="button"
                          className="stop-btn"
                          onClick={(e) => { e.stopPropagation(); onStopVehicle(v.id) }}
                        >
                          Stop
                        </button>
                      )}
                      {status === 'paused' && v.status !== 'intervention' && (
                        <button
                          type="button"
                          className="resume-btn"
                          onClick={(e) => { e.stopPropagation(); onResumeVehicle(v.id) }}
                        >
                          Resume
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
