import { useState, useRef, useEffect } from 'react'
import MentionInput from './MentionInput'
import { VEHICLES } from '../data/vehicles'
import './VehiclesPanel.css'

export default function VehiclesPanel({
  selectedVehicleId = null,
  initialVehicleMessages = {},
  vehicleMessages = {},
  stoppedVehicleIds = new Set(),
  onSelectVehicle = () => {},
  onSendMessage = () => {},
  onStopVehicle = () => {},
  onBack = () => {},
}) {
  const stoppedSet = stoppedVehicleIds instanceof Set ? stoppedVehicleIds : new Set(stoppedVehicleIds)
  const [vehicleInput, setVehicleInput] = useState('')
  const messagesEndRef = useRef(null)

  const selectedVehicle = selectedVehicleId ? VEHICLES.find((v) => v.id === selectedVehicleId) : null
  const baseMessages = selectedVehicle ? (initialVehicleMessages[selectedVehicle.id] || []) : []
  const extra = selectedVehicle ? (vehicleMessages[selectedVehicle.id] || []) : []
  const messages = [...baseMessages, ...extra]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleCardClick = (e, vehicleId) => {
    if (e.target.closest('button')) return
    onSelectVehicle(vehicleId)
  }

  const handleVehicleSend = (raw) => {
    onSendMessage(raw, selectedVehicle)
    setVehicleInput('')
  }

  if (selectedVehicle) {
    return (
      <aside className="vehicles-panel">
        <header className="vehicle-view-header">
          <button
            type="button"
            className="vehicle-view-back"
            onClick={onBack}
            aria-label="Back to vehicle list"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className={`vehicle-view-avatar ${selectedVehicle.color}`}>
            <img src="/bobcat-vehicle.png" alt="" className="bobcat-avatar-img" />
          </div>
          <div className="vehicle-view-header-title-wrap">
            <h2 className="vehicle-view-title">{selectedVehicle.name}</h2>
            {selectedVehicle.status === 'intervention' && (
              <span className="intervention-badge" role="status" aria-label="Needs intervention">
                <svg className="intervention-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
                </svg>
                Needs intervention
              </span>
            )}
          </div>
        </header>

        <div className="vehicle-view-messages">
          {messages.map((msg, i) =>
            msg.type === 'command' ? (
              <div key={msg.id ?? `cmd-${i}`} className="vehicle-view-message-row vehicle-view-message-command">
                <div className="vehicle-view-bubble vehicle-view-bubble-user">
                  {msg.mentions?.map((m) => (
                    <span key={m.name} className={`vehicle-view-mention-pill ${m.pill}`}>
                      @{m.name}
                    </span>
                  ))}
                  {msg.mentions?.length > 0 && ' '}
                  <span className="vehicle-view-bubble-body">{msg.body}</span>
                </div>
              </div>
            ) : (
              <div key={msg.id ?? `v-${i}`} className="vehicle-view-message-row vehicle-view-message-vehicle">
                <div className={`vehicle-view-msg-avatar ${selectedVehicle.color}`}>
                  <img src="/bobcat-vehicle.png" alt="" className="bobcat-avatar-img" />
                </div>
                <div className="vehicle-view-msg-content">
                  <span className={`vehicle-view-msg-sender ${selectedVehicle.color}`}>
                    {selectedVehicle.name}
                  </span>
                  <div
                    className={`vehicle-view-bubble vehicle-view-bubble-vehicle ${msg.needsIntervention ? 'needs-intervention' : ''}`}
                  >
                    <span className="vehicle-view-bubble-body">{msg.body}</span>
                  </div>
                </div>
              </div>
            )
          )}
          <div ref={messagesEndRef} aria-hidden />
        </div>

        <div className="vehicle-view-input-wrap vehicle-view-input-wrap--mention">
          <MentionInput
            value={vehicleInput}
            onChange={setVehicleInput}
            onSubmit={handleVehicleSend}
            vehicles={VEHICLES}
            placeholder={`@${selectedVehicle.name}`}
            className="vehicle-view-mention-wrap"
            inputClassName="vehicle-view-input"
            ariaLabel={`Message ${selectedVehicle.name}`}
          />
        </div>
      </aside>
    )
  }

  return (
    <aside className="vehicles-panel">
      <header className="vehicles-header">
        <h2 className="vehicles-title">Vehicles</h2>
      </header>

      <ul className="vehicles-list" role="list">
        {VEHICLES.map((v) => (
          <li
            key={v.id}
            className={`vehicle-card ${v.status}`}
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
              <span className="vehicle-status-label">{v.statusLabel}</span>
              {v.status === 'intervention' && (
                <span className="intervention-badge" role="status" aria-label="Needs intervention">
                  <svg className="intervention-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
                  </svg>
                  Needs intervention
                </span>
              )}
            </div>
            {v.showStop && !stoppedSet.has(v.id) && (
              <button
                type="button"
                className="stop-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onStopVehicle(v.id)
                }}
              >
                Stop
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
