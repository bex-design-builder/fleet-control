import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ATTACHMENTS } from '../data/attachments'
import './VehicleStatsCard.css'

export default function VehicleStatsCard({
  vehicle,
  effectiveStatus,
  vehicleAttachments = {},
  onChangeAttachment = () => {},
  isStopped = false,
  onStop = () => {},
  onResume = () => {},
}) {
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState(null)
  const chipRef = useRef(null)

  const fuel = vehicle.fuel ?? 0
  const fuelPct = Math.round(fuel * 100)
  const fuelLevel = fuel < 0.3 ? 'low' : fuel < 0.6 ? 'mid' : 'ok'

  const currentAttachment = ATTACHMENTS.find(
    (a) => a.id === (vehicleAttachments[vehicle.id] ?? 'bucket')
  ) ?? ATTACHMENTS[0]

  return (
    <div className="vsc-card">
      <div className="vsc-top">
        <div className={`vsc-avatar ${vehicle.color}`}>
          <img src="/bobcat-vehicle.png" alt="" className="vsc-avatar-img" />
        </div>
        <div className="vsc-info">
          <span className="vsc-name">{vehicle.name}</span>
          <div className="vsc-meta-row">

            <span className={`vsc-fuel vsc-fuel--${fuelLevel}`}>
              <span className="material-symbols-outlined vsc-fuel-icon" aria-hidden>local_gas_station</span>
              {fuelPct}%
            </span>
            <span className="vsc-meta-sep" aria-hidden>·</span>
            <button
              ref={chipRef}
              type="button"
              className={`vsc-attachment-btn${attachmentPickerOpen ? ' vsc-attachment-btn--open' : ''}`}
              onClick={() => {
                if (chipRef.current) {
                  const r = chipRef.current.getBoundingClientRect()
                  const PAD = 8, POPUP_W = 220
                  const left = Math.max(PAD, Math.min(r.left, window.innerWidth - POPUP_W - PAD))
                  const spaceBelow = window.innerHeight - r.bottom - PAD
                  const spaceAbove = r.top - PAD
                  if (spaceBelow >= 100 || spaceBelow >= spaceAbove) {
                    setPopoverPos({ top: r.bottom + 6, left, maxHeight: Math.max(80, spaceBelow) })
                  } else {
                    setPopoverPos({ bottom: window.innerHeight - r.top + 6, left, maxHeight: Math.max(80, spaceAbove) })
                  }
                }
                setAttachmentPickerOpen(true)
              }}
              aria-label="Change attachment"
            >
              {currentAttachment.name}
              <span className="material-symbols-outlined vsc-attachment-chevron" aria-hidden>expand_more</span>
            </button>
          </div>
        </div>
        <div className="vsc-actions">
          {!isStopped && effectiveStatus !== 'intervention' && (
            <button type="button" className="stop-btn" onClick={onStop}>Stop</button>
          )}
          {isStopped && effectiveStatus !== 'intervention' && (
            <button type="button" className="resume-btn" onClick={onResume}>Resume</button>
          )}
        </div>
      </div>

      {attachmentPickerOpen && createPortal(
        <>
          <div
            className="attach-popover-backdrop"
            onClick={() => setAttachmentPickerOpen(false)}
          />
          <div
            className="attach-popover attach-popover--list"
            role="dialog"
            aria-label="Select attachment"
            style={popoverPos ? { top: popoverPos.top, bottom: popoverPos.bottom, left: popoverPos.left, maxHeight: popoverPos.maxHeight, overflowY: 'auto' } : undefined}
          >
            {ATTACHMENTS.map((att) => {
              const isSelected = (vehicleAttachments[vehicle.id] ?? 'bucket') === att.id
              return (
                <button
                  key={att.id}
                  type="button"
                  className={`attach-list-item${isSelected ? ' attach-list-item--selected' : ''}`}
                  onClick={() => {
                    onChangeAttachment(vehicle.id, att.id)
                    setAttachmentPickerOpen(false)
                  }}
                >
                  <span className="attach-list-name">{att.name}</span>
                  {isSelected && (
                    <span className="material-symbols-outlined attach-list-check" aria-hidden>check</span>
                  )}
                </button>
              )
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
