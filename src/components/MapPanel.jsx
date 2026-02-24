import { useState, useEffect, useMemo, useRef } from 'react'
import './MapPanel.css'

const VEHICLES = [
  { id: 'mark', name: 'Mark the bobcat', x: 28, y: 42, color: 'purple', status: 'error', hasWarning: true, statusLabel: 'Needs intervention' },
  { id: 'steve', name: 'Steve the bobcat', x: 52, y: 28, color: 'green', status: 'active', statusLabel: 'Task in progress' },
  { id: 'bobcat3', name: 'Bobcat 3', x: 72, y: 68, color: 'blue', status: 'idle', statusLabel: 'Ready for task' },
]

// Movement path for active vehicles (x, y in %). One full loop = 80s (half speed again).
const LOOP_DURATION_MS = 80000

const ACTIVE_VEHICLE_PATH = [
  { x: 52, y: 43 },
  { x: 56, y: 47 },
  { x: 60, y: 53 },
  { x: 62, y: 60 },
  { x: 60, y: 67 },
  { x: 55, y: 71 },
  { x: 48, y: 69 },
  { x: 44, y: 63 },
  { x: 44, y: 55 },
  { x: 48, y: 47 },
  { x: 52, y: 43 },
]

function lerp(a, b, t) {
  return a + (b - a) * t
}

function positionAtProgress(path, progress) {
  const n = path.length - 1
  const scaled = ((progress % 1) + 1) % 1
  const i = Math.min(Math.floor(scaled * n), n - 1)
  const t = (scaled * n) % 1
  return {
    x: lerp(path[i].x, path[i + 1].x, t),
    y: lerp(path[i].y, path[i + 1].y, t),
  }
}

const ACTIVE_VEHICLE_ID = VEHICLES.find((v) => v.status === 'active')?.id

export default function MapPanel({
  selectedVehicleId = null,
  onSelectVehicle = () => {},
  stoppedVehicleIds = new Set(),
}) {
  const [progress, setProgress] = useState(0)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const frozenPositionRef = useRef(null)
  const dragRef = useRef(null)
  const didPanRef = useRef(false)

  const stoppedSet = stoppedVehicleIds instanceof Set ? stoppedVehicleIds : new Set(stoppedVehicleIds)
  const isActiveVehicleStopped = ACTIVE_VEHICLE_ID != null && stoppedSet.has(ACTIVE_VEHICLE_ID)

  useEffect(() => {
    setPanOffset({ x: 0, y: 0 })
  }, [selectedVehicleId])

  const rafIdRef = useRef(null)
  useEffect(() => {
    if (isActiveVehicleStopped) {
      return () => {
        if (rafIdRef.current != null) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
      }
    }
    const start = Date.now()
    const tick = () => {
      const elapsed = (Date.now() - start) % LOOP_DURATION_MS
      setProgress(elapsed / LOOP_DURATION_MS)
      rafIdRef.current = requestAnimationFrame(tick)
    }
    rafIdRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [isActiveVehicleStopped])

  const activePosition = useMemo(
    () => positionAtProgress(ACTIVE_VEHICLE_PATH, progress),
    [progress]
  )

  if (isActiveVehicleStopped && frozenPositionRef.current == null) {
    frozenPositionRef.current = activePosition
  }
  if (!isActiveVehicleStopped) {
    frozenPositionRef.current = null
  }

  const effectiveActivePosition = isActiveVehicleStopped && frozenPositionRef.current
    ? frozenPositionRef.current
    : activePosition

  const selectedVehicle = selectedVehicleId
    ? VEHICLES.find((v) => v.id === selectedVehicleId)
    : null
  const centerPosition = selectedVehicle
    ? (selectedVehicle.status === 'active'
        ? effectiveActivePosition
        : { x: selectedVehicle.x, y: selectedVehicle.y })
    : null

  const baseTransform =
    centerPosition != null
      ? `translate(${50 - centerPosition.x}%, ${50 - centerPosition.y}%)`
      : 'translate(0, 0)'
  const panStyle = {
    transform: `${baseTransform} translate(${panOffset.x}px, ${panOffset.y}px)`,
  }

  const onPointerDown = (e) => {
    if (dragRef.current) return
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    }
  }

  const onPointerMove = (e) => {
    if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      if (!isDragging) {
        setIsDragging(true)
        didPanRef.current = true
      }
      setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
      dragRef.current.startX = e.clientX
      dragRef.current.startY = e.clientY
      e.preventDefault()
    }
  }

  const onPointerUp = (e) => {
    if (dragRef.current && e.pointerId === dragRef.current.pointerId) {
      dragRef.current = null
      setIsDragging(false)
    }
  }

  const onPointerCancel = (e) => {
    if (dragRef.current && e.pointerId === dragRef.current.pointerId) {
      dragRef.current = null
      setIsDragging(false)
    }
  }

  const onVehicleClick = (vehicleId) => {
    if (didPanRef.current) {
      didPanRef.current = false
      return
    }
    onSelectVehicle(vehicleId)
  }

  return (
    <section className="map-panel" aria-label="Map overview">
      <div
        className={`map-scene ${isDragging ? 'map-scene--dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div className={`map-scene-content ${isDragging ? 'map-scene-content--no-transition' : ''}`} style={panStyle}>
          <div className="map-ground" />
          <div className="map-pillars" aria-hidden />

          {VEHICLES.map((v) => {
            const isActive = v.status === 'active'
            const x = isActive ? effectiveActivePosition.x : v.x
            const y = isActive ? effectiveActivePosition.y : v.y
            return (
              <button
                key={v.id}
                type="button"
                className={`vehicle-marker ${v.color} ${v.status} ${v.hasWarning ? 'has-warning' : ''}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                onClick={() => onVehicleClick(v.id)}
                aria-label={`Open chat for ${v.name}`}
              >
                <div className="vehicle-marker-icon">
                  <div className="vehicle-marker-bg" aria-hidden />
                  <div className="vehicle-body">
                    <img src="/bobcat-vehicle.png" alt="" className="bobcat-vehicle-img" />
                  </div>
                  {v.hasWarning && (
                    <div className="vehicle-warning" role="img" aria-label="Needs intervention">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="vehicle-marker-label">
                  <span className="vehicle-marker-label-name">{v.name}</span>
                  <span className="vehicle-marker-label-status">{v.statusLabel ?? ''}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
