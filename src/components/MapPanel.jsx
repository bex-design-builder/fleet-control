import { useState, useEffect, useMemo, useRef } from 'react'
import { VEHICLES as DATA_VEHICLES } from '../data/vehicles'
import VehicleStatsCard from './VehicleStatsCard'
import './MapPanel.css'

const MAP_POSITIONS = {
  mark:    { x: 28, y: 42 },
  steve:   { x: 52, y: 28 },
  bobcat3: { x: 16, y: 26 },
  bobcat4: { x: 38, y: 62 },
  bobcat5: { x: 22, y: 30 },
  bobcat6: { x: 80, y: 30 },
  bobcat7: { x: 18, y: 70 },
  bobcat8: { x: 12, y: 33 },
}

const VEHICLES = DATA_VEHICLES.map((v) => ({
  ...v,
  ...MAP_POSITIONS[v.id],
  hasWarning: v.status === 'intervention',
}))

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

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.25

const OBSTACLE_LABELS = [
  { value: 'avoid',  icon: 'block',         label: 'Avoid' },
  { value: 'push',   icon: 'arrow_forward', label: 'Push through' },
  { value: 'pickup', icon: 'conveyor_belt', label: 'Mark for pickup', activeLabel: 'Marked for pickup' },
]

export const AUTO_OBSTACLES = [
  { id: 'obs-1', name: 'Detected obstacle', type: 'obstacle', auto: true, confirmed: null, label: 'avoid',
    points: [[30,55],[36,55],[36,62],[30,62]] },
  { id: 'obs-2', name: 'Detected obstacle', type: 'obstacle', auto: true, confirmed: null, label: 'avoid',
    points: [[55,68],[62,68],[62,75],[55,75]] },
]

// --- Zone drawing helpers ---

let _zoneId = 0
const nextZoneId = () => ++_zoneId

function screenToMapPct(clientX, clientY, sceneEl, panOffset, zoom, centerPosition) {
  const rect = sceneEl.getBoundingClientRect()
  const W = rect.width
  const H = rect.height
  const sx = clientX - rect.left
  const sy = clientY - rect.top
  const bt_x = centerPosition ? (50 - centerPosition.x) / 100 * W : 0
  const bt_y = centerPosition ? (50 - centerPosition.y) / 100 * H : 0
  const cpx = (sx - panOffset.x - bt_x - W / 2) / zoom + W / 2
  const cpy = (sy - panOffset.y - bt_y - H / 2) / zoom + H / 2
  return {
    x: Math.max(0, Math.min(100, (cpx / W) * 100)),
    y: Math.max(0, Math.min(100, (cpy / H) * 100)),
  }
}

function ptDist(a, b) {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return Math.sqrt(dx * dx + dy * dy)
}

function closestPointOnSegment(pt, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { point: [...a], dist: ptDist(pt, a) }
  const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq))
  const cx = a[0] + t * dx, cy = a[1] + t * dy
  return { point: [cx, cy], t, dist: Math.hypot(pt[0] - cx, pt[1] - cy) }
}

function findEdgeInsertionIndex(pt, points, isClosed) {
  let bestDist = Infinity, bestIdx = -1, bestPoint = null
  const loopEnd = isClosed ? points.length : points.length - 1
  for (let i = 0; i < loopEnd; i++) {
    const j = (i + 1) % points.length
    const res = closestPointOnSegment(pt, points[i], points[j])
    if (res.dist < bestDist) {
      bestDist = res.dist
      bestIdx = i + 1
      bestPoint = res.point
    }
  }
  return { idx: bestIdx, point: bestPoint }
}

function centroid(pts) {
  return [
    pts.reduce((s, [x]) => s + x, 0) / pts.length,
    pts.reduce((s, [, y]) => s + y, 0) / pts.length,
  ]
}

// --- Path avoidance helpers ---

function pointInPolygon([px, py], polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi))
      inside = !inside
  }
  return inside
}

function segCross([ox, oy], [ax, ay], [bx, by]) {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)
}

function segmentsIntersect(a, b, c, d) {
  const d1 = segCross(c, d, a), d2 = segCross(c, d, b)
  const d3 = segCross(a, b, c), d4 = segCross(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function segmentBlockedByPolygon(a, b, polygon) {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return true
  for (let i = 0; i < polygon.length; i++) {
    if (segmentsIntersect(a, b, polygon[i], polygon[(i + 1) % polygon.length])) return true
  }
  return false
}

function polyRadius(polygon) {
  const c = centroid(polygon)
  return Math.max(...polygon.map(([x, y]) => Math.hypot(x - c[0], y - c[1])))
}

function buildAvoidancePath(basePath, forbiddenPolygons) {
  if (!forbiddenPolygons.length) return basePath
  const out = [basePath[0]]
  for (let i = 0; i < basePath.length - 1; i++) {
    const a = [basePath[i].x, basePath[i].y]
    const b = [basePath[i + 1].x, basePath[i + 1].y]
    const blocker = forbiddenPolygons.find((poly) => segmentBlockedByPolygon(a, b, poly))
    if (blocker) {
      const [cx, cy] = centroid(blocker)
      const r = polyRadius(blocker) + 8
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len, ny = dx / len
      const side = (cx - a[0]) * nx + (cy - a[1]) * ny
      const s = side > 0 ? -1 : 1
      out.push({ x: cx + s * nx * r, y: cy + s * ny * r })
    }
    out.push(basePath[i + 1])
  }
  return out
}

// --- Reverse map % → section-relative px ---

function mapPctToSection(px, py, sceneEl, sectionEl, panOffset, zoom, centerPosition) {
  const sceneRect = sceneEl.getBoundingClientRect()
  const sectionRect = sectionEl.getBoundingClientRect()
  const W = sceneRect.width
  const H = sceneRect.height
  const bt_x = centerPosition ? (50 - centerPosition.x) / 100 * W : 0
  const bt_y = centerPosition ? (50 - centerPosition.y) / 100 * H : 0
  const cpx = (px / 100) * W
  const cpy = (py / 100) * H
  const sx = (cpx - W / 2) * zoom + panOffset.x + bt_x + W / 2
  const sy = (cpy - H / 2) * zoom + panOffset.y + bt_y + H / 2
  return {
    x: sceneRect.left - sectionRect.left + sx,
    y: sceneRect.top - sectionRect.top + sy,
  }
}

function computeOverlayPosition(points, sceneEl, sectionEl, panOffset, zoom, centerPosition, overlayW, overlayH) {
  const PAD = 16

  const screenPts = points.map(([px, py]) =>
    mapPctToSection(px, py, sceneEl, sectionEl, panOffset, zoom, centerPosition)
  )

  const minX = Math.min(...screenPts.map((p) => p.x))
  const maxX = Math.max(...screenPts.map((p) => p.x))
  const minY = Math.min(...screenPts.map((p) => p.y))
  const maxY = Math.max(...screenPts.map((p) => p.y))
  const zoneCX = (minX + maxX) / 2
  const zoneCY = (minY + maxY) / 2

  const sectionW = sectionEl.clientWidth
  const sectionH = sectionEl.clientHeight

  const clampL = (v) => Math.max(8, Math.min(sectionW - overlayW - 8, v))
  const clampT = (v) => Math.max(8, Math.min(sectionH - overlayH - 8, v))
  const fits = (c) =>
    c.left >= 8 && c.left + overlayW <= sectionW - 8 &&
    c.top  >= 8 && c.top  + overlayH <= sectionH - 8

  const candidates = [
    { left: clampL(zoneCX - overlayW / 2), top: maxY + PAD },          // below
    { left: clampL(zoneCX - overlayW / 2), top: minY - overlayH - PAD }, // above
    { left: maxX + PAD,  top: clampT(zoneCY - overlayH / 2) },          // right
    { left: minX - overlayW - PAD, top: clampT(zoneCY - overlayH / 2) }, // left
  ]

  return candidates.find(fits) ?? {
    left: clampL(zoneCX - overlayW / 2),
    top:  clampT(maxY + PAD),
  }
}

// --- Zone drag node ---

function ZoneNode({ cx, cy, onPointerDown }) {
  return (
    <circle
      cx={cx} cy={cy} r="1.4"
      className="map-zone-node"
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

// --- Zone name bar ---

function ZoneNameBar({ onConfirm, onCancel, defaultNames = {}, initialType = 'keepout', style, resourceOnly = false }) {
  const resolvedInitial = resourceOnly ? 'resource' : initialType
  const [name, setName] = useState(defaultNames[resolvedInitial] ?? '')
  const [type, setType] = useState(resolvedInitial)
  const [nameEdited, setNameEdited] = useState(false)
  const [obstacleLabel, setObstacleLabel] = useState('avoid')
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const handleTypeChange = (newType) => {
    setType(newType)
    if (!nameEdited && defaultNames[newType]) setName(defaultNames[newType])
  }

  return (
    <div className="zone-name-bar" style={style}>
      <input
        ref={inputRef}
        className="zone-modal-input"
        type="text"
        placeholder="Zone name"
        value={name}
        onChange={(e) => { setName(e.target.value); setNameEdited(true) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onConfirm(name.trim(), type, obstacleLabel)
          if (e.key === 'Escape') onCancel()
        }}
      />
      {!resourceOnly && (
        <div className="zone-modal-types">
          <button
            type="button"
            className={`zone-type-btn zone-type-btn--info${type === 'info' ? ' active' : ''}`}
            onClick={() => handleTypeChange('info')}
          >
            <span className="zone-type-dot zone-type-dot--info" aria-hidden />
            Info
          </button>
          <button
            type="button"
            className={`zone-type-btn zone-type-btn--keepout${type === 'keepout' ? ' active' : ''}`}
            onClick={() => handleTypeChange('keepout')}
          >
            <span className="zone-type-dot zone-type-dot--keepout" aria-hidden />
            Keep-out
          </button>
          <button
            type="button"
            className={`zone-type-btn zone-type-btn--obstacle${type === 'obstacle' ? ' active' : ''}`}
            onClick={() => handleTypeChange('obstacle')}
          >
            <span className="zone-type-dot zone-type-dot--obstacle" aria-hidden />
            Obstacle
          </button>
          <button
            type="button"
            className={`zone-type-btn zone-type-btn--resource${type === 'resource' ? ' active' : ''}`}
            onClick={() => handleTypeChange('resource')}
          >
            <span className="zone-type-dot zone-type-dot--resource" aria-hidden />
            Resource
          </button>
        </div>
      )}
      {type === 'obstacle' && (
        <div className="zone-modal-obstacle-labels">
          {OBSTACLE_LABELS.map(({ value, icon, label }) => (
            <button
              key={value}
              type="button"
              className={`map-zone-obstacle-label-btn${obstacleLabel === value ? ' map-zone-obstacle-label-btn--active' : ''}`}
              onClick={() => setObstacleLabel(value)}
            >
              <span className="material-symbols-outlined" aria-hidden>{icon}</span>
              {label}
              {obstacleLabel === value && (
                <span className="material-symbols-outlined map-zone-obstacle-label-check" aria-hidden>check</span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="zone-modal-actions">
        <button type="button" className="zone-modal-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="zone-modal-save"
          onClick={() => name.trim() && onConfirm(name.trim(), type, obstacleLabel)}
          disabled={!name.trim()}
        >
          Save zone
        </button>
      </div>
    </div>
  )
}

// --- Main component ---

const MARKER_STATUS_LABELS = {
  intervention: 'Needs help',
  active: 'Working',
  paused: 'Paused',
  idle: 'Idle',
}

export default function MapPanel({
  selectedVehicleId = null,
  onSelectVehicle = () => {},
  stoppedVehicleIds = new Set(),
  effectiveVehicleStatuses = {},
  mobileVehicleBarVisible = false,
  vehiclesPanelOpen = false,
  isMobile = false,
  vehicleAttachments = {},
  onChangeAttachment = () => {},
  hideVehicles = false,
  mapPickMode = null,
  pendingMapPoint = null,
  confirmedResourcePoint = null,
  confirmedDestinationPoint = null,
  onMapPointPick = null,
  onConfirmPoint = null,
  onCancelMapPick = null,
  onDrawModeCancel = null,
  terrainVisualizationActive = false,
  waypoints = [],
  onConfirmWaypoints = null,
  zones: zonesProp = null,
  onZonesChange = null,
  zonesVisible: zonesVisibleProp = null,
  onZonesVisibleChange = null,
  onZoneSelect = null,
  onResourceZoneDrawn = null,
  hasBanner = false,
}) {
  const [progress, setProgress] = useState(0)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [isZooming, setIsZooming] = useState(false)
  const frozenPositionRef = useRef(null)
  const dragRef = useRef(null)
  const didPanRef = useRef(false)
  const zoomTimeoutRef = useRef(null)
  const sceneRef = useRef(null)

  // Zone drawing state
  const sectionRef = useRef(null)

  // Zone drawing state
  const [isDrawMode, setIsDrawMode] = useState(false)
  const [pendingZonePoints, setPendingZonePoints] = useState(null) // points clicked so far
  const [pendingZoneClosed, setPendingZoneClosed] = useState(false) // polygon is closed, ready to name
  const [cursorPct, setCursorPct] = useState(null) // live cursor pos while drawing
  const [zonesInternal, setZonesInternal] = useState(AUTO_OBSTACLES)
  const [zonesVisibleInternal, setZonesVisibleInternal] = useState(true)
  const zones = zonesProp ?? zonesInternal
  const zonesVisible = zonesVisibleProp ?? zonesVisibleInternal
  const setZones = zonesProp !== null ? onZonesChange : setZonesInternal
  const setZonesVisible = zonesVisibleProp !== null ? onZonesVisibleChange : setZonesVisibleInternal
  const [selectedZoneId, setSelectedZoneId] = useState(null)
  const [editingZoneId, setEditingZoneId] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [draggingNode, setDraggingNode] = useState(null) // { target: 'pending'|zoneId, idx }
  const [draggingZoneBody, setDraggingZoneBody] = useState(null) // { zoneId: 'pending'|id, startPct: [x,y], originalPoints }
  const didDragZoneBodyRef = useRef(false)
  const didDragNodeRef = useRef(false)
  const didInsertNodeRef = useRef(false)
  const [zoneSpatialEditId, setZoneSpatialEditId] = useState(null) // which saved zone is in spatial-edit mode
  const [sectionSize, setSectionSize] = useState({ w: 800, h: 600 })
  const [heatmapOn, setHeatmapOn] = useState(false)
  const [targetTerrainOn, setTargetTerrainOn] = useState(false)
  const [pendingResourceZone, setPendingResourceZone] = useState(null) // { id, points } — awaiting name
  useEffect(() => {
    if (terrainVisualizationActive) {
      setHeatmapOn(true)
      setTargetTerrainOn(true)
    }
  }, [terrainVisualizationActive])

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

  const forbiddenPolygons = useMemo(
    () => zones
      .filter((z) => z.type === 'obstacle' || z.type === 'keepout')
      .map((z) => z.points),
    [zones]
  )

  const activePath = useMemo(
    () => buildAvoidancePath(ACTIVE_VEHICLE_PATH, forbiddenPolygons),
    [forbiddenPolygons]
  )

  const activePosition = useMemo(
    () => positionAtProgress(activePath, progress),
    [activePath, progress]
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
    ? (selectedVehicle.id === ACTIVE_VEHICLE_ID
        ? effectiveActivePosition
        : { x: selectedVehicle.x, y: selectedVehicle.y })
    : null

  const baseTransform =
    centerPosition != null
      ? `translate(${50 - centerPosition.x}%, ${50 - centerPosition.y}%)`
      : 'translate(0, 0)'
  const panStyle = useMemo(
    () => ({
      transformOrigin: '50% 50%',
      transform: `${baseTransform} translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
    }),
    [baseTransform, panOffset.x, panOffset.y, zoom]
  )

  const zoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX))
  const zoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN))

  useEffect(() => {
    const el = sceneRef.current
    if (!el) return
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current)
        setIsZooming(true)
        setZoom((z) => {
          const next = e.deltaY > 0 ? z - ZOOM_STEP : z + ZOOM_STEP
          return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next))
        })
        zoomTimeoutRef.current = setTimeout(() => {
          setIsZooming(false)
          zoomTimeoutRef.current = null
        }, 150)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSectionSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const SNAP_THRESHOLD = 5 // % distance to snap-close the polygon

  const closePendingZone = () => {
    if (pendingZonePoints && pendingZonePoints.length >= 3 && !pendingZoneClosed) {
      setPendingZoneClosed(true)
      setCursorPct(null)
    }
  }

  // Escape / Enter / Backspace while drawing
  useEffect(() => {
    if (!isDrawMode) return
    const onKey = (e) => {
      if (e.key === 'Escape') { cancelDraw(); return }
      if (e.key === 'Enter' && !pendingZoneClosed) { closePendingZone(); return }
      if (e.key === 'Backspace' && pendingZonePoints && !pendingZoneClosed) {
        if (pendingZonePoints.length === 1) setPendingZonePoints(null)
        else setPendingZonePoints((prev) => prev.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDrawMode, pendingZonePoints, pendingZoneClosed])

  const cancelDraw = () => {
    setIsDrawMode(false)
    setPendingZonePoints(null)
    setPendingZoneClosed(false)
    setCursorPct(null)
    setDraggingNode(null)
    onDrawModeCancel?.()
  }

  const onPointerDown = (e) => {
    if (isDrawMode) {
      if (pendingZoneClosed) return // waiting for name input
      const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
      if (!pt) return
      if (!pendingZonePoints) {
        // First point
        setPendingZonePoints([[pt.x, pt.y]])
        return
      }
      // Close if clicking near first point with >= 3 points
      if (pendingZonePoints.length >= 3) {
        const [fx, fy] = pendingZonePoints[0]
        if (Math.hypot(pt.x - fx, pt.y - fy) < SNAP_THRESHOLD) {
          closePendingZone()
          return
        }
      }
      // Add point
      setPendingZonePoints((prev) => [...prev, [pt.x, pt.y]])
      return
    }
    if (dragRef.current) return
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    }
  }

  const onPointerMove = (e) => {
    if (draggingZoneBody) {
      const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
      if (!pt) return
      const dx = pt.x - draggingZoneBody.startPct[0]
      const dy = pt.y - draggingZoneBody.startPct[1]
      if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) didDragZoneBodyRef.current = true
      const newPoints = draggingZoneBody.originalPoints.map(([ox, oy]) => [
        Math.max(0, Math.min(100, ox + dx)),
        Math.max(0, Math.min(100, oy + dy)),
      ])
      if (draggingZoneBody.zoneId === 'pending') {
        setPendingZonePoints(newPoints)
      } else {
        setZones((prev) => prev.map((z) => z.id !== draggingZoneBody.zoneId ? z : { ...z, points: newPoints }))
      }
      e.preventDefault()
      return
    }
    if (draggingNode) {
      const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
      if (!pt) return
      didDragNodeRef.current = true
      const clamped = [Math.max(0, Math.min(100, pt.x)), Math.max(0, Math.min(100, pt.y))]
      if (draggingNode.target === 'pendingResource') {
        setPendingResourceZone((prev) => {
          if (!prev) return prev
          const pts = [...prev.points]
          pts[draggingNode.idx] = clamped
          return { ...prev, points: pts }
        })
      } else if (draggingNode.target === 'pending') {
        setPendingZonePoints((prev) => {
          const next = [...prev]
          next[draggingNode.idx] = clamped
          return next
        })
      } else {
        setZones((prev) => prev.map((z) => {
          if (z.id !== draggingNode.target) return z
          const pts = [...z.points]
          pts[draggingNode.idx] = clamped
          return { ...z, points: pts }
        }))
      }
      e.preventDefault()
      return
    }
    if (isDrawMode) {
      if (pendingZonePoints && !pendingZoneClosed) {
        const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
        if (pt) setCursorPct(pt)
      }
      return
    }
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
    if (draggingZoneBody) { setDraggingZoneBody(null); return }
    if (draggingNode) {
      setDraggingNode(null)
      return
    }
    if (isDrawMode) return
    if (dragRef.current && e.pointerId === dragRef.current.pointerId) {
      dragRef.current = null
      setIsDragging(false)
    }
  }

  const onPointerLeave = (e) => {
    if (draggingZoneBody) { setDraggingZoneBody(null); return }
    if (draggingNode) return // pointer capture keeps events flowing; let onPointerUp handle release
    if (isDrawMode) return
    onPointerUp(e)
  }

  const onPointerCancel = (e) => {
    if (draggingZoneBody) { setDraggingZoneBody(null); return }
    if (draggingNode) { setDraggingNode(null); return }
    if (isDrawMode) return
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

  // Zone handlers
  const handleZoneConfirm = (name, type, obstacleLabel) => {
    setZones((prev) => [...prev, { id: nextZoneId(), name, type, points: pendingZonePoints, auto: false, label: type === 'obstacle' ? (obstacleLabel ?? 'avoid') : null }])
    setPendingZonePoints(null)
    setPendingZoneClosed(false)
    setIsDrawMode(false)
    onDrawModeCancel?.()
  }

  const handleZoneCancel = () => {
    setPendingZonePoints(null)
    setPendingZoneClosed(false)
    setCursorPct(null)
    setIsDrawMode(false)
  }

  const handleDeleteZone = (id) => {
    setZones((prev) => prev.filter((z) => z.id !== id))
    setSelectedZoneId(null)
    setZoneSpatialEditId(null)
    setEditingZoneId(null)
    setConfirmingDelete(false)
  }

  const handleEditZone = (name, type) => {
    setZones((prev) => prev.map((z) => z.id === editingZoneId ? { ...z, name, type } : z))
    setEditingZoneId(null)
    setZoneSpatialEditId(null)
  }

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null

  const noTransition = isDragging || isZooming

  // Minimap viewport rect computation
  const MINI_W = 160
  const MINI_H = 110
  const mmCx = centerPosition?.x ?? 50
  const mmCy = centerPosition?.y ?? 50
  const mmViewCx = 50 + (mmCx - 50 - panOffset.x * 100 / sectionSize.w) / zoom
  const mmViewCy = 50 + (mmCy - 50 - panOffset.y * 100 / sectionSize.h) / zoom
  const mmViewW = 100 / zoom
  const mmViewH = 100 / zoom
  const mmRx = Math.max(0, (mmViewCx - mmViewW / 2) / 100 * MINI_W)
  const mmRy = Math.max(0, (mmViewCy - mmViewH / 2) / 100 * MINI_H)
  const mmRw = Math.min(mmViewW / 100 * MINI_W, MINI_W - mmRx)
  const mmRh = Math.min(mmViewH / 100 * MINI_H, MINI_H - mmRy)

  const VEHICLE_DOT_COLORS = {
    active: '#3d8a62',
    intervention: '#ea4335',
    paused: '#f4b400',
    idle: 'rgba(255,255,255,0.35)',
  }

  return (
    <section
      ref={sectionRef}
      className={`map-panel ${mobileVehicleBarVisible ? 'map-panel--zoom-above-bar' : ''} ${hasBanner ? 'map-panel--with-banner' : ''}`}
      aria-label="Map overview"
    >
      {!hideVehicles && selectedVehicleId && selectedVehicle && (
        <div className="vsc-anchor">
          <VehicleStatsCard
            vehicle={selectedVehicle}
            effectiveStatus={effectiveVehicleStatuses[selectedVehicleId]}
            vehicleAttachments={vehicleAttachments}
            onChangeAttachment={onChangeAttachment}
          />
        </div>
      )}

      <div
        ref={sceneRef}
        className={`map-scene ${isDragging || draggingNode || draggingZoneBody ? 'map-scene--dragging' : ''} ${isDrawMode && !pendingZonePoints ? 'map-scene--draw-mode' : ''} ${mapPickMode ? 'map-scene--pick-mode' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onPointerCancel={onPointerCancel}
        onClick={(e) => {
          if (didPanRef.current) { didPanRef.current = false; return }
          if (didDragNodeRef.current) { didDragNodeRef.current = false; return }
          if (didInsertNodeRef.current) { didInsertNodeRef.current = false; return }
          if (mapPickMode === 'resource' && sceneRef.current) {
            const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
            if (pt) {
              const half = 6
              const zonePoints = [
                [Math.max(0, pt.x - half), Math.max(0, pt.y - half)],
                [Math.min(100, pt.x + half), Math.max(0, pt.y - half)],
                [Math.min(100, pt.x + half), Math.min(100, pt.y + half)],
                [Math.max(0, pt.x - half), Math.min(100, pt.y + half)],
              ]
              setPendingResourceZone({ id: nextZoneId(), points: zonePoints })
            }
            return
          }
          if (mapPickMode && onMapPointPick && sceneRef.current) {
            const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
            if (pt) onMapPointPick(pt)
            return
          }
          if ((selectedZoneId || editingZoneId) && !isDrawMode) {
            setSelectedZoneId(null)
            setZoneSpatialEditId(null)
            setEditingZoneId(null)
            setConfirmingDelete(false)
          }
        }}
      >
        <div className={`map-scene-content ${noTransition ? 'map-scene-content--no-transition' : ''}`} style={panStyle}>
          <div className="map-ground" />
          <div className="map-pillars" aria-hidden />

          {/* Zones SVG — same coordinate space as vehicle % positions */}
          <svg
            className="map-zones-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* ── Terrain design overlay (target terrain) ── */}
            {terrainVisualizationActive && targetTerrainOn && (
              <g className="terrain-design-lines">
                <polyline points="10,37 82,46" className="terrain-line terrain-line--shoulder" />
                <polyline points="10,40 82,49" className="terrain-line terrain-line--cut" />
                <polyline points="10,43 82,52" className="terrain-line terrain-line--invert" />
                <polyline points="10,46 82,55" className="terrain-line terrain-line--cut" />
                <polyline points="10,50 82,59" className="terrain-line terrain-line--shoulder" />
                {/* Station cross-lines at x=24, 47, 68 */}
                <line x1="24" y1="38.75" x2="24" y2="51.75" className="terrain-line terrain-line--station" />
                <line x1="47" y1="41.63" x2="47" y2="54.63" className="terrain-line terrain-line--station" />
                <line x1="68" y1="44.25" x2="68" y2="57.25" className="terrain-line terrain-line--station" />
              </g>
            )}

            {/* ── Heatmap overlay ── */}
            {terrainVisualizationActive && heatmapOn && (
              <g className="terrain-heatmap">
                {/* Above grade — blue: banks not yet at design grade */}
                <polygon points="10,37 82,46 82,49 10,40" className="heatmap-above" />
                <polygon points="10,46 82,55 82,59 10,50" className="heatmap-above" />
                {/* On grade — green: cut slopes at correct depth */}
                <polygon points="10,40 82,49 82,52 10,43" className="heatmap-on" />
                <polygon points="10,43 82,52 82,55 10,46" className="heatmap-on" />
                {/* Below grade — red: overcut spots along invert */}
                <polygon points="20,42 42,44 42,47 20,46" className="heatmap-below" />
                <polygon points="54,47 72,48.5 72,52 54,50.5" className="heatmap-below" />
              </g>
            )}

            {/* ── Waypoint route line ── */}
            {waypoints.length >= 2 && (
              <polyline
                points={waypoints.map((p) => `${p.x},${p.y}`).join(' ')}
                className="waypoint-route-line"
              />
            )}


            {/* Selected vehicle path indicator — shows ~10s ahead */}
            {selectedVehicleId && !isDrawMode && (() => {
              const sv = VEHICLES.find((vv) => vv.id === selectedVehicleId)
              if (!sv) return null
              const effectiveStatus = effectiveVehicleStatuses[sv.id]
              if (effectiveStatus !== 'active') return null

              if (sv.id === ACTIVE_VEHICLE_ID) {
                const lookahead = 10000 / LOOP_DURATION_MS
                const pts = Array.from({ length: 7 }, (_, i) =>
                  positionAtProgress(activePath, progress + lookahead * (i / 6))
                )
                return (
                  <polyline
                    key="vehicle-path-indicator"
                    className="vehicle-path-indicator"
                    points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                    style={{ pointerEvents: 'none' }}
                  />
                )
              }

              if (sv.heading == null) return null
              const rad = (sv.heading * Math.PI) / 180
              const len = 10
              return (
                <line
                  key="vehicle-path-indicator-static"
                  className="vehicle-path-indicator"
                  x1={sv.x} y1={sv.y}
                  x2={sv.x + Math.sin(rad) * len}
                  y2={sv.y - Math.cos(rad) * len}
                  style={{ pointerEvents: 'none' }}
                />
              )
            })()}

            {/* Completed zones (hidden when zones toggle is off) */}
            {zonesVisible && zones.map((zone) => {
              const isUnreviewed = zone.type === 'obstacle' && zone.confirmed === null
              return (
              <polygon
                key={zone.id}
                className={`map-zone-polygon map-zone-polygon--${zone.type}${isUnreviewed ? ' map-zone-polygon--unreviewed' : ''}${zone.id === selectedZoneId ? ' map-zone-polygon--selected' : ''}${zone.id === zoneSpatialEditId ? ' map-zone-polygon--editing' : ''}`}
                points={zone.points.map(([x, y]) => `${x},${y}`).join(' ')}
                onPointerDown={!isDrawMode && zone.id === zoneSpatialEditId ? (e) => {
                  e.stopPropagation()
                  didDragZoneBodyRef.current = false
                  const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
                  if (pt) setDraggingZoneBody({ zoneId: zone.id, startPct: [pt.x, pt.y], originalPoints: zone.points.map((p) => [...p]) })
                } : undefined}
                onClick={!isDrawMode ? (e) => {
                  e.stopPropagation()
                  if (didDragZoneBodyRef.current) { didDragZoneBodyRef.current = false; return }
                  // In resource pick mode: select zone so user can confirm it
                  if (mapPickMode === 'resource') {
                    setSelectedZoneId(zone.id)
                    return
                  }
                  // In other pick modes: place resource/destination/waypoint at click position
                  if (mapPickMode && onMapPointPick && sceneRef.current) {
                    const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
                    if (pt) onMapPointPick(pt)
                  }
                  if (zone.id === zoneSpatialEditId) return // in edit mode, body click doesn't deselect
                  if (zone.id === selectedZoneId) {
                    setSelectedZoneId(null)
                    setZoneSpatialEditId(null)
                    setEditingZoneId(null)
                    setConfirmingDelete(false)
                  } else {
                    setSelectedZoneId(zone.id)
                    setConfirmingDelete(false)
                  }
                } : undefined}
              />
              )
            })}
            {/* Pending polygon while drawing (open) */}
            {pendingZonePoints && !pendingZoneClosed && pendingZonePoints.length >= 2 && (
              <>
                <polyline
                  className="map-zone-draft"
                  points={pendingZonePoints.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="none"
                />
                {/* Invisible wide-stroke hit target for click-to-insert-node */}
                <polyline
                  points={pendingZonePoints.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="2.5"
                  style={{ pointerEvents: 'stroke', cursor: 'cell' }}
                  onPointerDown={(e) => {
                    const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
                    if (!pt) return
                    // Let the scene handle snap-close when near the first point
                    if (pendingZonePoints.length >= 3) {
                      const [fx, fy] = pendingZonePoints[0]
                      if (Math.hypot(pt.x - fx, pt.y - fy) < SNAP_THRESHOLD) return
                    }
                    e.stopPropagation()
                    const { idx, point } = findEdgeInsertionIndex([pt.x, pt.y], pendingZonePoints, false)
                    if (idx !== -1) setPendingZonePoints((prev) => {
                      const next = [...prev]
                      next.splice(idx, 0, point)
                      return next
                    })
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </>
            )}
            {/* Ghost line from last point to cursor */}
            {pendingZonePoints && !pendingZoneClosed && cursorPct && pendingZonePoints.length >= 1 && (
              <line
                className="map-zone-draft"
                x1={pendingZonePoints[pendingZonePoints.length - 1][0]}
                y1={pendingZonePoints[pendingZonePoints.length - 1][1]}
                x2={cursorPct.x}
                y2={cursorPct.y}
                fill="none"
              />
            )}
            {/* Snap indicator on first point when close */}
            {pendingZonePoints && !pendingZoneClosed && pendingZonePoints.length >= 3 && cursorPct && (() => {
              const [fx, fy] = pendingZonePoints[0]
              return Math.hypot(cursorPct.x - fx, cursorPct.y - fy) < SNAP_THRESHOLD
                ? <circle cx={fx} cy={fy} r="2.5" className="map-zone-snap" />
                : null
            })()}
            {/* Clicked point dots while drawing */}
            {pendingZonePoints && !pendingZoneClosed && pendingZonePoints.map(([x, y], i) => (
              <circle key={`draft-dot-${i}`} cx={x} cy={y} r="1" className="map-zone-draft-dot" />
            ))}
            {/* Closed pending polygon (ready to name) */}
            {pendingZonePoints && pendingZoneClosed && (
              <>
                {/* Fill area → body drag */}
                <polygon
                  className="map-zone-draft map-zone-draft--moveable"
                  points={pendingZonePoints.map(([x, y]) => `${x},${y}`).join(' ')}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
                    if (pt) setDraggingZoneBody({ zoneId: 'pending', startPct: [pt.x, pt.y], originalPoints: pendingZonePoints.map((p) => [...p]) })
                  }}
                />
                {/* Stroke area hit target → click edge to insert node */}
                <polygon
                  points={pendingZonePoints.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="transparent"
                  stroke="transparent"
                  strokeWidth="2.5"
                  style={{ pointerEvents: 'stroke', cursor: 'cell' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
                    if (!pt) return
                    const { idx, point } = findEdgeInsertionIndex([pt.x, pt.y], pendingZonePoints, true)
                    if (idx !== -1) setPendingZonePoints((prev) => {
                      const next = [...prev]
                      next.splice(idx, 0, point)
                      return next
                    })
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </>
            )}
            {/* Corner nodes — only when polygon is closed */}
            {pendingZonePoints && pendingZoneClosed && pendingZonePoints.map(([x, y], i) => (
              <ZoneNode
                key={`pending-node-${i}`}
                cx={x}
                cy={y}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  sceneRef.current?.setPointerCapture(e.pointerId)
                  setDraggingNode({ target: 'pending', idx: i })
                }}
              />
            ))}
            {/* Edge hit targets — rendered BEFORE nodes so nodes sit on top (SVG z-order) */}
            {zonesVisible && zoneSpatialEditId && !isDrawMode && (() => {
              const sz = zones.find((z) => z.id === zoneSpatialEditId)
              if (!sz) return null
              return (
                <polygon
                  key={`edge-hit-${zoneSpatialEditId}`}
                  points={sz.points.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="transparent"
                  stroke="transparent"
                  strokeWidth="2.5"
                  style={{ pointerEvents: 'stroke', cursor: 'cell' }}
                  onPointerDown={(e) => {
                    const pt = screenToMapPct(e.clientX, e.clientY, sceneRef.current, panOffset, zoom, centerPosition)
                    if (!pt) return
                    // Skip insertion if clicking near an existing node
                    const nearNode = sz.points.some(([nx, ny]) => Math.hypot(pt.x - nx, pt.y - ny) < 2.5)
                    if (nearNode) return
                    e.stopPropagation()
                    didInsertNodeRef.current = true
                    const { idx, point } = findEdgeInsertionIndex([pt.x, pt.y], sz.points, true)
                    if (idx !== -1) setZones((prev) => prev.map((z) => {
                      if (z.id !== zoneSpatialEditId) return z
                      const pts = [...z.points]
                      pts.splice(idx, 0, point)
                      return { ...z, points: pts }
                    }))
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              )
            })()}
            {/* Selected zone corner nodes — rendered AFTER edge hit so they're on top */}
            {zonesVisible && zoneSpatialEditId && !isDrawMode && (() => {
              const sz = zones.find((z) => z.id === zoneSpatialEditId)
              return sz?.points.map(([x, y], i) => (
                <ZoneNode
                  key={`node-${zoneSpatialEditId}-${i}`}
                  cx={x}
                  cy={y}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    sceneRef.current?.setPointerCapture(e.pointerId)
                    setDraggingNode({ target: zoneSpatialEditId, idx: i })
                  }}
                />
              ))
            })()}

            {/* Pending resource zone preview (before naming) */}
            {pendingResourceZone && (
              <>
                <polygon
                  className="map-zone-polygon map-zone-polygon--resource"
                  points={pendingResourceZone.points.map(([x, y]) => `${x},${y}`).join(' ')}
                  style={{ opacity: 0.55, pointerEvents: 'none' }}
                />
                {pendingResourceZone.points.map(([x, y], i) => (
                  <ZoneNode
                    key={`pending-resource-node-${i}`}
                    cx={x}
                    cy={y}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      sceneRef.current?.setPointerCapture(e.pointerId)
                      setDraggingNode({ target: 'pendingResource', idx: i })
                    }}
                  />
                ))}
              </>
            )}
          </svg>

          {/* Zone labels */}
          {zonesVisible && zones.map((zone) => {
            const [cx, cy] = centroid(zone.points)
            return (
              <div
                key={`lbl-${zone.id}`}
                className={`map-zone-label map-zone-label--${zone.type}`}
                style={{ left: `${cx}%`, top: `${cy}%` }}
              >
                {zone.name}
                {zone.label && (
                  <span className="map-zone-label-role">
                    {((l) => l?.activeLabel ?? l?.label)(OBSTACLE_LABELS.find((l) => l.value === zone.label))}
                  </span>
                )}
              </div>
            )
          })}

          {/* Map pick pins */}
          {confirmedResourcePoint && (
            <div className="map-pick-pin map-pick-pin--resource" style={{ left: `${confirmedResourcePoint.x}%`, top: `${confirmedResourcePoint.y}%` }}>
              <span className="material-symbols-outlined">inventory_2</span>
            </div>
          )}
          {confirmedDestinationPoint && (
            <div className="map-pick-pin map-pick-pin--destination" style={{ left: `${confirmedDestinationPoint.x}%`, top: `${confirmedDestinationPoint.y}%` }}>
              <span className="material-symbols-outlined">flag</span>
            </div>
          )}
          {pendingMapPoint && (
            <div className={`map-pick-pin map-pick-pin--${mapPickMode} map-pick-pin--pending`} style={{ left: `${pendingMapPoint.x}%`, top: `${pendingMapPoint.y}%` }}>
              <span className="material-symbols-outlined">{mapPickMode === 'resource' ? 'inventory_2' : 'flag'}</span>
            </div>
          )}

          {/* Waypoint markers */}
          {waypoints.map((pt, i) => (
            <div
              key={i}
              className="map-pick-pin map-pick-pin--waypoint"
              style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
            >
              <span className="map-waypoint-num">{i + 1}</span>
            </div>
          ))}

          {!isDrawMode && !hideVehicles && VEHICLES.map((v) => {
            const isAnimated = v.id === ACTIVE_VEHICLE_ID
            const x = isAnimated ? effectiveActivePosition.x : v.x
            const y = isAnimated ? effectiveActivePosition.y : v.y
            const effectiveStatus = effectiveVehicleStatuses[v.id] ?? v.status
            return (
              <button
                key={v.id}
                type="button"
                className={`vehicle-marker ${v.color} ${effectiveStatus} ${v.hasWarning ? 'has-warning' : ''}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                onClick={() => onVehicleClick(v.id)}
                aria-label={`Open chat for ${v.name}`}
              >
                <div className="vehicle-marker-icon">
                  <div className="vehicle-marker-bg" aria-hidden />
                  <div className="vehicle-body">
                    <img src="/bobcat-vehicle.png" alt="" className="bobcat-vehicle-img" />
                  </div>
                  {effectiveStatus === 'intervention' && (
                    <div className="vehicle-warning" role="img" aria-label="Needs help">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="vehicle-marker-label">
                  <span className="vehicle-marker-label-name">{v.name}</span>
                  <span className="vehicle-marker-label-status">
                    {effectiveStatus !== 'intervention' && (
                      <span className={`vehicle-marker-status-dot vehicle-marker-status-dot--${effectiveStatus}`} aria-hidden />
                    )}
                    {MARKER_STATUS_LABELS[effectiveStatus] ?? v.statusLabel ?? ''}
                  </span>
                  {v.taskProgress != null && ['active', 'paused', 'intervention'].includes(effectiveStatus) && (
                    <div className="vehicle-marker-progress-bar" aria-hidden>
                      <div
                        className={`vehicle-marker-progress-fill vehicle-marker-progress-fill--${effectiveStatus}`}
                        style={{ width: `${v.taskProgress * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Draw mode hint */}
      {isDrawMode && !pendingZonePoints && (
        <div className="map-draw-hint" role="status" aria-live="polite">
          Click on the map to start drawing
        </div>
      )}
      {isDrawMode && pendingZonePoints && !pendingZoneClosed && pendingZonePoints.length < 3 && (
        <div className="map-draw-hint" role="status" aria-live="polite">
          {3 - pendingZonePoints.length} more point{3 - pendingZonePoints.length > 1 ? 's' : ''} needed
        </div>
      )}
      {isDrawMode && pendingZonePoints && !pendingZoneClosed && pendingZonePoints.length >= 3 && (
        <div className="map-draw-hint" role="status" aria-live="polite">
          Click the first point to close
          <button type="button" className="map-draw-hint-done" onClick={closePendingZone}>Done</button>
        </div>
      )}
      {isDrawMode && pendingZoneClosed && (
        <div className="map-draw-hint" role="status" aria-live="polite">
          Drag corners to adjust
        </div>
      )}

      {/* Map pick mode hints */}
      {mapPickMode === 'resource' && !zoneSpatialEditId && !pendingResourceZone && !selectedZoneId && (
        <div className="map-draw-hint" role="status" aria-live="polite">
          Click on the map to place a resource zone, or click an existing zone to select it
        </div>
      )}
      {mapPickMode === 'resource' && selectedZoneId && !pendingResourceZone && (
        <div className="map-draw-hint" role="status" aria-live="polite">
          Resource zone selected
          <button
            type="button"
            className="map-draw-hint-done"
            onClick={() => {
              setSelectedZoneId(null)
              onResourceZoneDrawn?.()
            }}
          >
            Confirm resource
          </button>
        </div>
      )}
      {mapPickMode === 'destination' && !pendingMapPoint && (
        <div className="map-draw-hint" role="status" aria-live="polite">
          Now click the destination on the map
        </div>
      )}
      {mapPickMode === 'destination' && pendingMapPoint && (
        <div className="map-draw-hint" role="status" aria-live="polite">
          Destination set
          <button type="button" className="map-draw-hint-done" onClick={onConfirmPoint}>Confirm destination</button>
        </div>
      )}
      {mapPickMode === 'waypoints' && waypoints.length === 0 && (
        <div className="map-draw-hint" role="status" aria-live="polite">
          Click on the map to add the first waypoint
        </div>
      )}
      {mapPickMode === 'waypoints' && waypoints.length > 0 && (
        <div className="map-draw-hint" role="status" aria-live="polite">
          {waypoints.length} waypoint{waypoints.length > 1 ? 's' : ''} set — click to add more
          <button type="button" className="map-draw-hint-done" onClick={onConfirmWaypoints}>Confirm route</button>
        </div>
      )}

      {/* Zone popup — positioned dynamically to never cover the zone */}
      {selectedZone && !isDrawMode && editingZoneId !== selectedZone.id && !(mapPickMode === 'resource' && zoneSpatialEditId) && (() => {
        const POPUP_W = 220
        const POPUP_H = selectedZone.type === 'obstacle' ? 290 : 180
        const popupStyle = (sceneRef.current && sectionRef.current)
          ? computeOverlayPosition(selectedZone.points, sceneRef.current, sectionRef.current, panOffset, zoom, centerPosition, POPUP_W, POPUP_H)
          : { left: 16, top: 16 }
        return (
        <div
          className={`map-zone-popup map-zone-popup--${selectedZone.type}`}
          style={popupStyle}
        >
          <div className="map-zone-popup-header">
            <span className={`map-zone-popup-dot map-zone-popup-dot--${selectedZone.type}`} aria-hidden />
            <div className="map-zone-popup-info">
              <span className="map-zone-popup-name">{selectedZone.name}</span>
              <span className="map-zone-popup-type">
                {selectedZone.type === 'keepout' ? 'Keep-out zone'
                  : selectedZone.type === 'obstacle'
                    ? (selectedZone.label
                        ? ((l) => l?.activeLabel ?? l?.label)(OBSTACLE_LABELS.find((l) => l.value === selectedZone.label))
                        : 'Detected obstacle')
                  : 'Informational zone'}
              </span>
            </div>
            <button
              type="button"
              className="map-zone-popup-close"
              onClick={() => { setSelectedZoneId(null); setZoneSpatialEditId(null); setEditingZoneId(null); setConfirmingDelete(false) }}
              aria-label="Dismiss"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          {selectedZone.type === 'obstacle' && !confirmingDelete && (
            <div className="map-zone-popup-obstacle-labels">
              {OBSTACLE_LABELS.map(({ value, icon, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`map-zone-obstacle-label-btn${selectedZone.label === value ? ' map-zone-obstacle-label-btn--active' : ''}`}
                  onClick={() => setZones((prev) => prev.map((z) =>
                    z.id === selectedZone.id ? { ...z, label: z.label === value ? null : value } : z
                  ))}
                >
                  <span className="material-symbols-outlined" aria-hidden>{icon}</span>
                  {label}
                  {selectedZone.label === value && (
                    <span className="material-symbols-outlined map-zone-obstacle-label-check" aria-hidden>check</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {confirmingDelete ? (
            <div className="map-zone-popup-confirm">
              <span className="map-zone-popup-confirm-label">Delete?</span>
              <div className="map-zone-popup-confirm-actions">
                <button
                  type="button"
                  className="map-zone-popup-confirm-cancel"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="map-zone-popup-confirm-delete"
                  onClick={() => handleDeleteZone(selectedZone.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : mapPickMode === 'resource' ? (
            <div className="map-zone-popup-actions">
              <button
                type="button"
                className="map-zone-popup-action map-zone-popup-action--done"
                onClick={() => {
                  setSelectedZoneId(null)
                  onZoneSelect?.(selectedZone.id)
                }}
              >
                <span className="material-symbols-outlined">check_circle</span>
                Confirm resource
              </button>
            </div>
          ) : zoneSpatialEditId === selectedZone.id ? (
            <div className="map-zone-popup-actions">
              <span className="map-zone-popup-edit-hint">Drag to move · Click edge to add node</span>
              <button
                type="button"
                className="map-zone-popup-action map-zone-popup-action--done"
                onClick={() => { setZoneSpatialEditId(null); setEditingZoneId(null) }}
              >
                <span className="material-symbols-outlined">check</span>
                Done
              </button>
            </div>
          ) : (
            <div className="map-zone-popup-actions">
              <button
                type="button"
                className="map-zone-popup-action"
                onClick={() => { setZoneSpatialEditId(selectedZone.id); setEditingZoneId(selectedZone.id) }}
              >
                <span className="material-symbols-outlined">edit</span>
                Edit
              </button>
              <button
                type="button"
                className="map-zone-popup-action map-zone-popup-action--danger"
                onClick={() => setConfirmingDelete(true)}
              >
                <span className="material-symbols-outlined">delete</span>
                Delete
              </button>
            </div>
          )}
        </div>
        )
      })()}

      <div className="map-controls">
        {/* Heatmap + Target terrain toggles — only when a vehicle is selected */}
        {(selectedVehicleId || terrainVisualizationActive) && (
          <>
            <button
              type="button"
              className={`map-overlay-toggle${heatmapOn ? ' map-overlay-toggle--on' : ''}`}
              onClick={() => setHeatmapOn((v) => !v)}
              aria-label={heatmapOn ? 'Hide heatmap' : 'Show heatmap'}
              aria-pressed={heatmapOn}
            >
              <span className="material-symbols-outlined" aria-hidden>
                {heatmapOn ? 'visibility' : 'visibility_off'}
              </span>
              Heatmap
            </button>
            <button
              type="button"
              className={`map-overlay-toggle${targetTerrainOn ? ' map-overlay-toggle--on' : ''}`}
              onClick={() => setTargetTerrainOn((v) => !v)}
              aria-label={targetTerrainOn ? 'Hide target terrain' : 'Show target terrain'}
              aria-pressed={targetTerrainOn}
            >
              <span className="material-symbols-outlined" aria-hidden>
                {targetTerrainOn ? 'visibility' : 'visibility_off'}
              </span>
              Target terrain
            </button>
          </>
        )}
        {/* Zones visibility toggle */}
        <button
          type="button"
          className={`map-zones-toggle${!zonesVisible ? ' map-zones-toggle--hidden' : ''}`}
          onClick={() => setZonesVisible((v) => !v)}
          aria-label={zonesVisible ? 'Hide zones' : 'Show zones'}
          aria-pressed={zonesVisible}
        >
          <span className="material-symbols-outlined" aria-hidden>
            {zonesVisible ? 'visibility' : 'visibility_off'}
          </span>
          Zones
        </button>
        {/* Draw zone toggle */}
        <button
          type="button"
          className={`map-draw-btn${isDrawMode ? ' map-draw-btn--active' : ''}`}
          onClick={() => {
            if (isDrawMode) {
              cancelDraw()
            } else {
              setIsDrawMode(true)
              setSelectedZoneId(null)
              setZoneSpatialEditId(null)
              setEditingZoneId(null)
              if (mapPickMode) onCancelMapPick?.()
            }
          }}
          aria-label={isDrawMode ? 'Cancel drawing' : 'Draw zone'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polygon points="3,17 3,21 7,21 18,10 14,6" />
            <line x1="14" y1="6" x2="18" y2="2" />
            <line x1="18" y1="2" x2="22" y2="6" />
          </svg>
          {isDrawMode ? 'Cancel' : 'Draw zone'}
        </button>
        {/* Zoom controls */}
        <div className="map-zoom-controls" aria-label="Map zoom">
          <button
            type="button"
            className="map-zoom-btn"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="map-zoom-btn"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Zoom out"
          >
            −
          </button>
        </div>
        {/* Compass */}
        <div className="map-compass" aria-label="Compass — North is up">
          <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
            <circle cx="24" cy="24" r="23" fill="rgba(18,20,24,0.82)" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
            {/* Cardinal labels */}
            <text x="24" y="9"  textAnchor="middle" dominantBaseline="middle" fontSize="7" fontWeight="700" fill="#e54c3c" fontFamily="inherit">N</text>
            <text x="24" y="41" textAnchor="middle" dominantBaseline="middle" fontSize="6" fontWeight="600" fill="rgba(255,255,255,0.45)" fontFamily="inherit">S</text>
            <text x="41" y="25" textAnchor="middle" dominantBaseline="middle" fontSize="6" fontWeight="600" fill="rgba(255,255,255,0.45)" fontFamily="inherit">E</text>
            <text x="7"  y="25" textAnchor="middle" dominantBaseline="middle" fontSize="6" fontWeight="600" fill="rgba(255,255,255,0.45)" fontFamily="inherit">W</text>
            {/* North needle (red) */}
            <polygon points="24,14 26.5,24 24,22 21.5,24" fill="#e54c3c" />
            {/* South needle (muted white) */}
            <polygon points="24,34 26.5,24 24,26 21.5,24" fill="rgba(255,255,255,0.35)" />
            {/* Center ring */}
            <circle cx="24" cy="24" r="2.2" fill="rgba(255,255,255,0.9)" />
            <circle cx="24" cy="24" r="1"   fill="rgba(18,20,24,0.9)" />
          </svg>
        </div>
        {/* Minimap */}
        {!isMobile && (
          <div className="map-minimap" aria-hidden="true">
            <svg
              width={MINI_W}
              height={MINI_H}
              viewBox={`0 0 ${MINI_W} ${MINI_H}`}
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <mask id="mm-vp-mask">
                  <rect width={MINI_W} height={MINI_H} fill="white" />
                  <rect x={mmRx} y={mmRy} width={mmRw} height={mmRh} fill="black" />
                </mask>
              </defs>
              <rect width={MINI_W} height={MINI_H} fill="rgba(0,0,0,0.42)" mask="url(#mm-vp-mask)" />
              <rect x={mmRx} y={mmRy} width={mmRw} height={mmRh} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" rx="2" />
              {VEHICLES.map((v) => {
                const vx = (v.id === ACTIVE_VEHICLE_ID ? effectiveActivePosition.x : v.x) / 100 * MINI_W
                const vy = (v.id === ACTIVE_VEHICLE_ID ? effectiveActivePosition.y : v.y) / 100 * MINI_H
                const status = effectiveVehicleStatuses[v.id] ?? v.status
                return (
                  <circle
                    key={v.id}
                    cx={vx}
                    cy={vy}
                    r={v.id === selectedVehicleId ? 4.5 : 3}
                    fill={VEHICLE_DOT_COLORS[status] ?? 'rgba(255,255,255,0.4)'}
                    stroke={v.id === selectedVehicleId ? 'white' : 'none'}
                    strokeWidth="1"
                  />
                )
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Zone name bar — shown after polygon is closed */}
      {isDrawMode && pendingZonePoints && pendingZoneClosed && (() => {
        const keepoutCount = zones.filter((z) => z.type === 'keepout').length + 1
        const infoCount = zones.filter((z) => z.type === 'info').length + 1
        const obstacleCount = zones.filter((z) => z.type === 'obstacle').length + 1
        const barStyle = (sceneRef.current && sectionRef.current)
          ? computeOverlayPosition(pendingZonePoints, sceneRef.current, sectionRef.current, panOffset, zoom, centerPosition, 300, 300)
          : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }
        return (
          <ZoneNameBar
            style={barStyle}
            defaultNames={{
              keepout: `Keep-out zone ${keepoutCount}`,
              info: `Info zone ${infoCount}`,
              obstacle: `Obstacle ${obstacleCount}`,
              resource: `Resource ${zones.filter((z) => z.type === 'resource').length + 1}`,
            }}
            onConfirm={handleZoneConfirm}
            onCancel={handleZoneCancel}
          />
        )
      })()}
      {/* Resource zone name bar — shown after auto-square is placed */}
      {pendingResourceZone && (() => {
        const resourceCount = zones.filter((z) => z.type === 'resource').length + 1
        const barStyle = (sceneRef.current && sectionRef.current)
          ? computeOverlayPosition(pendingResourceZone.points, sceneRef.current, sectionRef.current, panOffset, zoom, centerPosition, 300, 160)
          : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }
        return (
          <ZoneNameBar
            style={barStyle}
            resourceOnly={true}
            defaultNames={{ resource: `Resource area ${resourceCount}` }}
            onConfirm={(name) => {
              const zone = { id: pendingResourceZone.id, name, type: 'resource', points: pendingResourceZone.points, auto: false, label: null }
              setZones((prev) => [...prev, zone])
              setSelectedZoneId(zone.id)
              setPendingResourceZone(null)
            }}
            onCancel={() => setPendingResourceZone(null)}
          />
        )
      })()}

      {/* Zone edit bar */}
      {editingZoneId !== null && (() => {
        const z = zones.find((z) => z.id === editingZoneId)
        if (!z) return null
        const barStyle = (sceneRef.current && sectionRef.current)
          ? computeOverlayPosition(z.points, sceneRef.current, sectionRef.current, panOffset, zoom, centerPosition, 300, 300)
          : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }
        return (
          <ZoneNameBar
            style={barStyle}
            initialType={z.type}
            defaultNames={{ keepout: z.name, info: z.name, obstacle: z.name, resource: z.name }}
            onConfirm={handleEditZone}
            onCancel={() => { setEditingZoneId(null); setZoneSpatialEditId(null) }}
          />
        )
      })()}
    </section>
  )
}
