import { useState, useEffect, useRef } from 'react'
import MapPanel from './MapPanel'
import MentionInput from './MentionInput'
import { VEHICLES } from '../data/vehicles'
import './NewJobFlow.css'

let _msgId = 1
const nextId = () => ++_msgId

const MATERIAL_ESTIMATES = {
  'Flat area': { volumeCY: 124, areaSqFt: 2800, avgDepthFt: 1.6, excavation: false },
  'Slope':     { volumeCY:  87, areaSqFt: 2200, avgDepthFt: 1.1, excavation: false },
  'Trench':    { volumeCY:  43, areaSqFt:  480, avgDepthFt: 3.2, excavation: true  },
  'Berm':      { volumeCY: 178, areaSqFt: 1900, avgDepthFt: 2.6, excavation: false },
  'custom':    { volumeCY: 112, areaSqFt: 2400, avgDepthFt: 1.5, excavation: false },
}

function getMaterialEstimate(terrainLabel) {
  const est = MATERIAL_ESTIMATES[terrainLabel] ?? MATERIAL_ESTIMATES['custom']
  return { ...est, truckloads: Math.ceil(est.volumeCY / 10) }
}

function getReply(userText, currentJobType) {
  const t = userText.toLowerCase()

  if (currentJobType === 'build-terrain') {
    return {
      body: "Preview created. Click any point on the terrain to check the elevation.",
      showTerrainViz: true,
      materialData: getMaterialEstimate('custom'),
      chips: ['Confirm design'],
    }
  }

  if (t === 'move resources') {
    return {
      body: "Got it. What are you moving?",
      jobType: 'move-resources',
      mapMode: 'resource',
    }
  }

  if (t === 'build terrain') {
    return {
      body: "Describe the terrain you want to build.",
      jobType: 'build-terrain',
      chips: ['Flat area', 'Slope', 'Trench', 'Berm'],
    }
  }

  if (t === 'navigate') {
    return {
      body: "Click on the map to place the destination.",
      jobType: 'navigate',
      mapMode: 'destination',
    }
  }

  if (t === 'confirm') {
    return {
      body: "Design confirmed. Assigning vehicles to begin terrain work.",
    }
  }

  return {
    body: "Got it — give me a moment to think through that.",
  }
}

const MAP_INSTRUCTIONS = {
  resource:    'Draw a zone on the map to mark the pickup area — or describe it in chat',
  destination: 'Click on the map to set the destination — or describe it in chat',
  waypoints:   'Click on the map to add waypoints along the route',
}

const INITIAL_MESSAGES = [
  { id: 1, type: 'system', body: 'What kind of job do you need done?', chips: ['Build terrain', 'Move resources', 'Navigate'] },
]

export default function NewJobFlow({ onClose, onJobCreated, zones, onZonesChange, zonesVisible, onZonesVisibleChange, scene3D, onScene3DChange, effectiveVehicleStatuses = {}, existingJobs = [] }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  // Job type tracking
  const [jobType, setJobType] = useState(null)
  const [terrainDescribed, setTerrainDescribed] = useState(false)
  const [terrainVerified, setTerrainVerified] = useState(false)
  const [selectedMachineIds, setSelectedMachineIds] = useState(new Set())

  // Map pick state — resource/destination
  const [mapPickMode, setMapPickMode] = useState(null)
  const [pendingMapPoint, setPendingMapPoint] = useState(null)
  const [confirmedDestinationPoint, setConfirmedDestinationPoint] = useState(null)

  // Move-resources summary data
  const [pendingResource, setPendingResource] = useState(null) // { name, centroid? } — awaiting user confirmation
  const [resourceDescription, setResourceDescription] = useState(null)
  const [destinationDescription, setDestinationDescription] = useState(null)
  const [confirmedResourceCentroid, setConfirmedResourceCentroid] = useState(null)
  const [resourceFromObject, setResourceFromObject] = useState(false) // true when resource was a 3D scene object (not a drawn zone)

  // Navigate waypoints
  const [waypoints, setWaypoints] = useState([])

  const [taskPlanSubtasks, setTaskPlanSubtasks] = useState(null)
  const [subtaskPickerOpen, setSubtaskPickerOpen] = useState(null)
  const [pickerAnchor, setPickerAnchor] = useState(null)
  const [pendingTaskPlanArgs, setPendingTaskPlanArgs] = useState(null) // { vehicleIds, type }
  const [priorityList, setPriorityList] = useState(null) // [{ id, name, status, isNew }]

  const [confirmClose, setConfirmClose] = useState(false)
  const [snapIndex, setSnapIndex] = useState(1) // 0=peek, 1=mid, 2=full
  const njfChatRef = useRef(null)
  const njfSnapIndexRef = useRef(1)
  useEffect(() => {
    njfSnapIndexRef.current = snapIndex
    const panel = njfChatRef.current
    if (panel?.parentElement) {
      panel.parentElement.style.setProperty('--sheet-h', `${njfSnapHeights()[snapIndex]}px`)
    }
  })

  const njfSnapHeights = () => {
    const frameH = njfChatRef.current?.parentElement?.offsetHeight ?? window.innerHeight
    return [72, frameH * 0.45, frameH - 12]
  }

  const handleNjfTouchStart = (e) => {
    const panel = njfChatRef.current
    if (!panel) return
    const parentEl = panel.parentElement
    const isHandle = !!e.target.closest?.('.njf-drag-handle')
    let scrollEl = null
    if (!isHandle) {
      let node = e.target
      while (node && node !== panel) {
        const s = getComputedStyle(node)
        if (node.scrollHeight > node.clientHeight + 1 &&
            (s.overflowY === 'auto' || s.overflowY === 'scroll')) {
          scrollEl = node; break
        }
        node = node.parentElement
      }
    }
    const touch = e.touches[0]
    const startY = touch.clientY
    const startH = panel.offsetHeight
    const willAlwaysResize = isHandle || njfSnapIndexRef.current < 2
    let resizing = false
    const onMove = (ev) => {
      const deltaY = ev.touches[0].clientY - startY
      const isAtTop = !scrollEl || scrollEl.scrollTop <= 0
      if (willAlwaysResize || (deltaY > 0 && isAtTop)) {
        if (!resizing) {
          resizing = true
          panel.style.transition = 'none'
          parentEl?.classList.add('sheet-dragging')
        }
        const heights = njfSnapHeights()
        const newH = Math.max(heights[0], Math.min(heights[2], startH - deltaY))
        panel.style.height = `${newH}px`
        parentEl?.style.setProperty('--sheet-h', `${newH}px`)
        ev.preventDefault()
      }
    }
    const onEnd = () => {
      parentEl?.classList.remove('sheet-dragging')
      if (resizing) {
        const heights = njfSnapHeights()
        const idx = heights.reduce((best, h, i) =>
          Math.abs(h - panel.offsetHeight) < Math.abs(heights[best] - panel.offsetHeight) ? i : best, 0)
        panel.style.transition = ''
        panel.style.height = ''
        parentEl?.style.setProperty('--sheet-h', `${heights[idx]}px`)
        setSnapIndex(idx)
      }
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
  }

  const [attachedFile, setAttachedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const fileInputRef = useRef(null)

  const handleFileChange = (file) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (!file) { setAttachedFile(null); setPreviewUrl(null); return }
    setAttachedFile(file)
    setPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
  }

  const removeAttachment = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setAttachedFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  const messagesEndRef = useRef(null)
  const taskPlanMsgRef = useRef(null)
  const priorPickModeRef = useRef(null)

  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.type === 'task-plan' || lastMsg?.type === 'priority-select') {
      // Delay so the full message renders before scrolling to its top
      setTimeout(() => {
        taskPlanMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isTyping])

  // When a resource is pre-selected (pending confirmation), inject/replace a chip message
  useEffect(() => {
    if (!pendingResource) return
    const chipMsg = {
      id: 'pending-resource-msg',
      type: 'system',
      body: `**${pendingResource.name}** selected. Confirm or click a different object to change.`,
      chips: ['Confirm resource'],
    }
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === 'pending-resource-msg')
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = chipMsg
        return next
      }
      return [...prev.map((m) => ({ ...m, chips: undefined })), chipMsg]
    })
  }, [pendingResource])


  const addSystemMessage = (body, chips) => {
    setMessages((prev) => [...prev, { id: nextId(), type: 'system', body, chips }])
  }

  const showTaskPlan = (vehicleIds, type) => {
    const subtasks = generateSubtasks(type, vehicleIds)
    setTaskPlanSubtasks(subtasks)
    setSubtaskPickerOpen(null)
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      setMessages((prev) => [...prev, { id: nextId(), type: 'task-plan' }])
    }, 800)
  }

  const showJobSummary = (resource, destination) => {
    const idleIds = VEHICLES.filter((v) => (effectiveVehicleStatuses[v.id] ?? v.status) === 'idle').map((v) => v.id)
    const assignIds = idleIds.length > 0 ? idleIds : VEHICLES.map((v) => v.id)
    setSelectedMachineIds(new Set(assignIds))
    setMessages((prev) => [...prev, {
      id: nextId(), type: 'job-summary',
      resource: resource || 'Marked on map',
      destination: destination || 'Set on map',
    }])
    setTimeout(() => showPriorityStep(assignIds, 'move-resources'), 400)
  }

  const showNavigateSummary = (destination) => {
    const idleIds = VEHICLES.filter((v) => (effectiveVehicleStatuses[v.id] ?? v.status) === 'idle').map((v) => v.id)
    const assignIds = idleIds.length > 0 ? idleIds : VEHICLES.map((v) => v.id)
    setSelectedMachineIds(new Set(assignIds))
    setMessages((prev) => [...prev, {
      id: nextId(), type: 'navigate-summary',
      destination: destination || 'Set on map',
    }])
    setTimeout(() => showPriorityStep(assignIds, 'navigate'), 400)
  }

  const sendMessage = (text) => {
    if (!text.trim() || isTyping) return
    const trimmed = text.trim()

    if (trimmed === 'Confirm resource') {
      setMessages((prev) => [...prev.map((m) => ({ ...m, chips: undefined })), { id: nextId(), type: 'user', body: trimmed }])
      setInput('')
      handleConfirmResource()
      return
    }

    if (trimmed === 'Confirm design') {
      setMessages((prev) => [...prev.map((m) => ({ ...m, chips: undefined })), { id: nextId(), type: 'user', body: trimmed }])
      setInput('')
      handleConfirmDesign()
      return
    }

    // Build-terrain type chips — treat as a terrain description and jump straight to preview
    if (jobType === 'build-terrain' && !terrainDescribed && ['Flat area', 'Slope', 'Trench', 'Berm'].includes(trimmed)) {
      setMessages((prev) => [...prev.map((m) => ({ ...m, chips: undefined })), { id: nextId(), type: 'user', body: trimmed }])
      setInput('')
      setIsTyping(true)
      setTimeout(() => {
        setIsTyping(false)
        setTerrainDescribed(true)
        setMessages((prev) => [...prev, {
          id: nextId(), type: 'system',
          body: "Preview created. Click any point on the terrain to check the elevation.",
          showTerrainViz: true,
          materialData: getMaterialEstimate(trimmed),
          chips: ['Confirm design'],
        }])
      }, 900)
      return
    }

    // Move-resources chat path: resource description via chat
    if (jobType === 'move-resources' && mapPickMode === 'resource') {
      setMessages((prev) => [...prev.map((m) => ({ ...m, chips: undefined })), { id: nextId(), type: 'user', body: trimmed }])
      setInput('')
      setResourceDescription(trimmed)
      setMapPickMode('destination')
      setIsTyping(true)
      setTimeout(() => {
        setIsTyping(false)
        setMessages((prev) => [...prev, { id: nextId(), type: 'system', body: "Got it. Now where should it go?\n\nClick the destination on the map or describe it here." }])
      }, 700)
      return
    }

    // Move-resources chat path: destination description via chat
    if (jobType === 'move-resources' && mapPickMode === 'destination') {
      setMessages((prev) => [...prev.map((m) => ({ ...m, chips: undefined })), { id: nextId(), type: 'user', body: trimmed }])
      setInput('')
      setDestinationDescription(trimmed)
      setIsTyping(true)
      setTimeout(() => {
        setIsTyping(false)
        showJobSummary(resourceDescription, trimmed)
      }, 700)
      return
    }

    setMessages((prev) => [...prev.map((m) => ({ ...m, chips: undefined })), { id: nextId(), type: 'user', body: trimmed }])
    setInput('')

    const reply = getReply(trimmed, jobType)
    if (!reply) return

    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      setMessages((prev) => [...prev, { id: nextId(), type: 'system', body: reply.body, chips: reply.chips, showTerrainViz: reply.showTerrainViz, materialData: reply.materialData ?? null }])
      if (reply.jobType) setJobType(reply.jobType)
      if (reply.mapMode) setMapPickMode(reply.mapMode)
      if (reply.showTerrainViz) {
        setTerrainDescribed(true)
      }
    }, 900)
  }

  const handleMapPointPick = (point) => {
    if (mapPickMode === 'waypoints') {
      setWaypoints((prev) => [...prev, point])
    } else {
      setPendingMapPoint(point)
    }
  }

  const handleTerrainClick = () => {}

  const handleConfirmDesign = () => {
    const idleIds = VEHICLES.filter((v) => (effectiveVehicleStatuses[v.id] ?? v.status) === 'idle').map((v) => v.id)
    const assignIds = idleIds.length > 0 ? idleIds : VEHICLES.map((v) => v.id)
    setSelectedMachineIds(new Set(assignIds))
    setMessages((prev) => [...prev.map((m) => ({ ...m, chips: undefined })), { id: nextId(), type: 'system', body: 'Design confirmed.' }])
    setTimeout(() => showPriorityStep(assignIds, 'build-terrain'), 400)
  }

  const handleResourceZoneDrawn = (data) => {
    const name = data?.name || 'Zone'
    const centroid = data?.centroid ? { x: data.centroid[0], y: data.centroid[1] } : null
    setResourceDescription(name)
    if (centroid) setConfirmedResourceCentroid(centroid)
    setResourceFromObject(false)
    setMapPickMode('destination')
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      addSystemMessage("Got it. Now click anywhere on the map to set the destination.")
    }, 700)
  }

  const handleZoneSelect = (data) => {
    const name = data?.name || 'Zone'
    const centroid = data?.centroid ? { x: data.centroid[0], y: data.centroid[1] } : null
    const fromObject = !!data?.fromObject
    // Auto-confirm immediately — no intermediate pending step
    setResourceDescription(name)
    if (centroid) setConfirmedResourceCentroid(centroid)
    setResourceFromObject(fromObject)
    setMapPickMode('destination')
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      addSystemMessage("Got it. Now click anywhere on the map to set the destination.")
    }, 700)
  }

  const handleConfirmResource = () => {
    if (!pendingResource) return
    const { name, centroid, fromObject } = pendingResource
    setResourceDescription(name)
    if (centroid) setConfirmedResourceCentroid(centroid)
    setResourceFromObject(!!fromObject)
    setPendingResource(null)
    setMapPickMode('destination')
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      addSystemMessage("Got it. Now click anywhere on the map to set the destination.")
    }, 700)
  }

  const handleConfirmPoint = () => {
    if (!pendingMapPoint) return

    if (mapPickMode === 'destination') {
      const dest = pendingMapPoint
      setConfirmedDestinationPoint(dest)
      setPendingMapPoint(null)
      setMapPickMode(null)
      setDestinationDescription('Set on map')
      if (jobType === 'navigate') {
        setMessages((prev) => [...prev, { id: nextId(), type: 'system', body: 'Destination set.' }])
        setTimeout(() => showNavigateSummary('Set on map'), 500)
      } else {
        setMessages((prev) => [...prev, { id: nextId(), type: 'system', body: 'Got it — pickup and destination are set.' }])
        setTimeout(() => showJobSummary(resourceDescription, 'Set on map'), 500)
      }
    }
  }

  const removeSummaryMessages = () => {
    setMessages((prev) => prev.filter((m) => m.type !== 'job-summary' && m.type !== 'navigate-summary' && m.type !== 'machine-select' && m.type !== 'task-plan' && m.id !== 'pending-dest-msg'))
    setSelectedMachineIds(new Set())
    setTaskPlanSubtasks(null)
    setSubtaskPickerOpen(null)
  }

  const handleEditResource = () => {
    removeSummaryMessages()
    setResourceDescription(null)
    setConfirmedResourceCentroid(null)
    setResourceFromObject(false)
    setConfirmedDestinationPoint(null)
    setDestinationDescription(null)
    setPendingResource(null)
    setPendingMapPoint(null)
    setMapPickMode('resource')
    addSystemMessage('What would you like to move instead? Click an object on the map or describe it here.')
  }

  const handleEditDestination = () => {
    removeSummaryMessages()
    setConfirmedDestinationPoint(null)
    setDestinationDescription(null)
    setPendingMapPoint(null)
    setMapPickMode('destination')
    addSystemMessage('Click the new destination on the map.')
  }

  const handleConfirmWaypoints = () => {
    setMapPickMode(null)
    addSystemMessage(`Route confirmed with ${waypoints.length} waypoint${waypoints.length > 1 ? 's' : ''}. Ready to assign a vehicle.`)
  }

  const handleCancelMapPick = () => {
    priorPickModeRef.current = mapPickMode
    setMapPickMode(null)
    setPendingMapPoint(null)
  }

  const handleDrawModeCancel = () => {
    if (priorPickModeRef.current) {
      setMapPickMode(priorPickModeRef.current)
      priorPickModeRef.current = null
    }
  }

  const JOB_NAMES = { 'build-terrain': 'Build terrain', 'move-resources': 'Move resources', 'navigate': 'Navigate' }

  const showPriorityStep = (vehicleIds, type) => {
    const activePending = existingJobs.filter((j) => j.status !== 'complete' && j.effectiveStatus !== 'complete')
    if (activePending.length === 0) {
      // No existing jobs to prioritise against — skip straight to task plan
      showTaskPlan(vehicleIds, type)
      return
    }
    const draftEntry = { id: '__new__', name: JOB_NAMES[type] ?? 'New job', status: 'new', isNew: true }
    setPriorityList([...activePending.map((j) => ({ id: j.id, name: j.name, status: j.effectiveStatus ?? j.status, isNew: false })), draftEntry])
    setPendingTaskPlanArgs({ vehicleIds, type })
    setMessages((prev) => [...prev, { id: nextId(), type: 'priority-select' }])
  }

  const movePriorityItem = (idx, dir) => {
    setPriorityList((prev) => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  const handleConfirmPriority = () => {
    if (!pendingTaskPlanArgs) return
    showTaskPlan(pendingTaskPlanArgs.vehicleIds, pendingTaskPlanArgs.type)
    setPendingTaskPlanArgs(null)
  }

  const generateSubtasks = (type, vehicleIds) => {
    const a = vehicleIds[0] ?? null
    const b = vehicleIds[1] ?? a
    const both = [...new Set([a, b].filter(Boolean))]
    const templates = {
      'move-resources': [
        { name: 'Prepare pickup area',    phase: 1, estimatedMins: 8,  assignedVehicleIds: [a].filter(Boolean) },
        { name: 'Prepare drop zone',      phase: 1, estimatedMins: 7,  assignedVehicleIds: [b].filter(Boolean) },
        { name: 'Load material',          phase: 2, estimatedMins: 10, assignedVehicleIds: [a].filter(Boolean) },
        { name: 'Transport to drop zone', phase: 3, estimatedMins: 12, assignedVehicleIds: [a].filter(Boolean) },
        { name: 'Deposit material',       phase: 4, estimatedMins: 8,  assignedVehicleIds: [b].filter(Boolean) },
        { name: 'Compact and level',      phase: 4, estimatedMins: 7,  assignedVehicleIds: [a].filter(Boolean) },
        { name: 'Final sweep',            phase: 5, estimatedMins: 5,  assignedVehicleIds: [a].filter(Boolean) },
      ],
      'build-terrain': [
        { name: 'Stake out boundary',           phase: 1, estimatedMins: 10, assignedVehicleIds: [a].filter(Boolean) },
        { name: 'Strip topsoil',                phase: 2, estimatedMins: 15, assignedVehicleIds: [a].filter(Boolean) },
        { name: 'Stage equipment and materials',phase: 2, estimatedMins: 12, assignedVehicleIds: [b].filter(Boolean) },
        { name: 'Rough cut to subgrade',        phase: 3, estimatedMins: 20, assignedVehicleIds: [a].filter(Boolean) },
        { name: 'Spread imported fill',         phase: 3, estimatedMins: 18, assignedVehicleIds: [b].filter(Boolean) },
        { name: 'Compact each lift',            phase: 4, estimatedMins: 14, assignedVehicleIds: both },
        { name: 'Fine grade to level',          phase: 5, estimatedMins: 12, assignedVehicleIds: [a].filter(Boolean) },
        { name: 'Final elevation check',        phase: 6, estimatedMins: 8,  assignedVehicleIds: [a].filter(Boolean) },
      ],
      'navigate': [
        { name: 'Pre-departure inspection', phase: 1, estimatedMins: 5,  assignedVehicleIds: [a].filter(Boolean) },
        { name: 'Confirm route clearance',  phase: 2, estimatedMins: 4,  assignedVehicleIds: [a].filter(Boolean) },
        { name: 'Navigate to destination',  phase: 3, estimatedMins: 18, assignedVehicleIds: [a].filter(Boolean) },
        { name: 'Arrive and park',          phase: 4, estimatedMins: 4,  assignedVehicleIds: [a].filter(Boolean) },
      ],
    }
    return (templates[type] ?? templates['navigate']).map((t, i) => ({
      ...t,
      id: `subtask-${i}`,
      status: t.phase === 1 ? 'active' : 'pending',
      assignedVehicleId: t.assignedVehicleIds[0] ?? null,
    }))
  }

  const toggleSubtaskMachine = (subtaskId, vehicleId) => {
    setTaskPlanSubtasks((prev) => prev.map((t) => {
      if (t.id !== subtaskId) return t
      const ids = t.assignedVehicleIds ?? []
      const next = ids.includes(vehicleId) ? ids.filter((id) => id !== vehicleId) : [...ids, vehicleId]
      if (next.length === 0) return t // keep at least one
      return { ...t, assignedVehicleIds: next, assignedVehicleId: next[0] }
    }))
  }

  const removeSubtaskMachine = (subtaskId, vehicleId) => {
    setTaskPlanSubtasks((prev) => prev.map((t) => {
      if (t.id !== subtaskId) return t
      const next = (t.assignedVehicleIds ?? []).filter((id) => id !== vehicleId)
      if (next.length === 0) return t
      return { ...t, assignedVehicleIds: next, assignedVehicleId: next[0] }
    }))
  }

  const handleConfirmJob = () => {
    const vehicleIds = [...selectedMachineIds]
    const subtasks = taskPlanSubtasks ?? generateSubtasks(jobType, vehicleIds)
    onJobCreated?.({
      id: 'job-' + Date.now(),
      name: JOB_NAMES[jobType] ?? 'New job',
      jobType,
      assignedVehicleIds: [...new Set(subtasks.flatMap((t) => t.assignedVehicleIds ?? [t.assignedVehicleId]).filter(Boolean))],
      status: 'active',
      progress: 0.05,
      estimatedMins: 45,
      subtasks,
      resourcePoint: confirmedResourceCentroid ?? null,
      destinationPoint: confirmedDestinationPoint ?? null,
      resourceLabel: resourceDescription ?? null,
      destinationLabel: destinationDescription ?? null,
    })
    onClose()
  }


  return (
    <div className="new-job-flow">
      {/* Full-width banner */}
      <div className="njf-banner">
        <span className="njf-banner-title">New job</span>
        <div className="map-mode-tabs njf-mode-tabs" role="group" aria-label="Map view mode">
          <button type="button" className={`map-mode-tab map-mode-tab--basic${scene3D === false ? ' map-mode-tab--active' : ''}`} onClick={() => onScene3DChange?.(false)} aria-label="Basic map"><span className="material-symbols-outlined">map</span></button>
          <button type="button" className={`map-mode-tab${scene3D === 'lidar' ? ' map-mode-tab--active' : ''}`} onClick={() => onScene3DChange?.('lidar')} aria-label="Lidar"><span className="material-symbols-outlined">radar</span></button>
          <button type="button" className={`map-mode-tab${scene3D === true ? ' map-mode-tab--active' : ''}`} onClick={() => onScene3DChange?.(true)} aria-label="3D view"><span className="material-symbols-outlined">view_in_ar</span></button>
        </div>
        <button
          type="button"
          className="njf-banner-close"
          onClick={() => setConfirmClose(true)}
          aria-label="Close new job"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <MapPanel
        hideVehicles={true}
        hasBanner={true}
        popupSafeLeft={400}
        initialAzimuth={45}
        initialElevation={28}
        mapPickMode={mapPickMode}
        pendingMapPoint={pendingMapPoint}
        confirmedResourcePoint={resourceFromObject ? null : confirmedResourceCentroid}
        confirmedDestinationPoint={confirmedDestinationPoint}
        confirmedDestinationLabel={jobType === 'navigate' ? 'Destination' : 'Drop off'}
        routeSummaryLabels={confirmedResourceCentroid && confirmedDestinationPoint ? { resource: resourceDescription || 'Marked on map', destination: destinationDescription || 'Set on map' } : null}
        onEditResource={handleEditResource}
        onEditDestination={handleEditDestination}
        onMapPointPick={handleMapPointPick}
        onConfirmPoint={handleConfirmPoint}
        onConfirmWaypoints={handleConfirmWaypoints}
        onCancelMapPick={handleCancelMapPick}
        onDrawModeCancel={handleDrawModeCancel}
        pendingResourceName={pendingResource?.name ?? null}
        onConfirmResource={handleConfirmResource}
        onZoneSelect={handleZoneSelect}
        onResourceZoneDrawn={handleResourceZoneDrawn}
        terrainVisualizationActive={terrainDescribed}
        onTerrainClick={terrainDescribed ? handleTerrainClick : undefined}
        waypoints={waypoints}
        zones={zones}
        onZonesChange={onZonesChange}
        zonesVisible={zonesVisible}
        onZonesVisibleChange={onZonesVisibleChange}
        scene3D={scene3D ?? null}
        onScene3DChange={onScene3DChange}
        routeLine={null}
      />


      {/* Left chat panel */}
      <div
        ref={njfChatRef}
        className={`njf-chat${snapIndex === 0 ? ' njf-chat--snap-peek' : snapIndex === 2 ? ' njf-chat--snap-full' : ''}`}
        onTouchStart={handleNjfTouchStart}
      >
        {/* Mobile-only drag handle */}
        <div
          className="njf-drag-handle"
          onClick={() => setSnapIndex((i) => (i + 1) % 3)}
          role="button"
          aria-label="Toggle panel height"
        >
          <div className="njf-drag-pill" />
        </div>
        <div className="njf-chat-header">
          <span className="njf-chat-header-title">New job</span>
        </div>

        <div className="njf-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`njf-msg njf-msg--${'task-plan|priority-select'.includes(msg.type) ? 'system' : msg.type}`} ref={msg.type === 'task-plan' || msg.type === 'priority-select' ? taskPlanMsgRef : null}>
              {msg.type === 'system' && (
                <>
                  <div className="vehicle-bubble njf-bubble-body">{msg.body}</div>
                  {msg.materialData && (
                    <div className="njf-material-card">
                      <div className="njf-material-label-row">
                        <span className="njf-material-title">{msg.materialData.excavation ? 'Excavation estimate' : 'Fill material required'}</span>
                      </div>
                      <div className="njf-material-hero">
                        <span className="njf-material-vol">{msg.materialData.volumeCY}</span>
                        <span className="njf-material-unit">yd³</span>
                      </div>
                      <div className="njf-material-stats">
                        <div className="njf-material-stat">
                          <span className="njf-material-stat-val">{msg.materialData.areaSqFt.toLocaleString()}</span>
                          <span className="njf-material-stat-key">sq ft area</span>
                        </div>
                        <div className="njf-material-stat-divider" />
                        <div className="njf-material-stat">
                          <span className="njf-material-stat-val">{msg.materialData.avgDepthFt} ft</span>
                          <span className="njf-material-stat-key">{msg.materialData.excavation ? 'avg depth' : 'avg fill'}</span>
                        </div>
                        {!msg.materialData.excavation && (
                          <>
                            <div className="njf-material-stat-divider" />
                            <div className="njf-material-stat">
                              <span className="njf-material-stat-val">{msg.materialData.truckloads}</span>
                              <span className="njf-material-stat-key">truckloads</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {msg.chips && (
                    <div className="njf-chips">
                      {msg.chips.map((chip) => (
                        <button key={chip} type="button" className="njf-chip" onClick={() => sendMessage(chip)}>
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {msg.type === 'job-summary' && (
                <div className="njf-summary-card">
                  <div className="njf-summary-row">
                    <span className="material-symbols-outlined njf-summary-icon">inventory_2</span>
                    <div className="njf-summary-detail">
                      <span className="njf-summary-label">Resource</span>
                      <span className="njf-summary-value">{msg.resource}</span>
                    </div>
                    <button type="button" className="njf-summary-edit-btn" onClick={handleEditResource}>
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                  </div>
                  <div className="njf-summary-arrow">
                    <span className="material-symbols-outlined">arrow_downward</span>
                  </div>
                  <div className="njf-summary-row">
                    <span className="material-symbols-outlined njf-summary-icon">flag</span>
                    <div className="njf-summary-detail">
                      <span className="njf-summary-label">Destination</span>
                      <span className="njf-summary-value">{msg.destination}</span>
                    </div>
                    <button type="button" className="njf-summary-edit-btn" onClick={handleEditDestination}>
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                  </div>
                </div>
              )}
              {msg.type === 'navigate-summary' && (
                <div className="njf-summary-card">
                  <div className="njf-summary-row">
                    <span className="material-symbols-outlined njf-summary-icon">flag</span>
                    <div className="njf-summary-detail">
                      <span className="njf-summary-label">Destination</span>
                      <span className="njf-summary-value">{msg.destination}</span>
                    </div>
                    <button type="button" className="njf-summary-edit-btn" onClick={handleEditDestination}>
                      <span className="material-symbols-outlined">edit</span>
                    </button>
                  </div>
                </div>
              )}
              {msg.type === 'priority-select' && priorityList && (
                <div className="njf-priority-card">
                  <div className="njf-priority-header">
                    <span className="material-symbols-outlined njf-priority-icon" aria-hidden>low_priority</span>
                    <span className="njf-priority-title">Job priority</span>
                  </div>
                  <p className="njf-priority-desc">Drag to set order. Top = highest priority.</p>
                  <div className="njf-priority-list">
                    {priorityList.map((item, idx) => (
                      <div key={item.id} className={`njf-priority-item${item.isNew ? ' njf-priority-item--new' : ''}`}>
                        <span className="njf-priority-rank">{idx + 1}</span>
                        <div className="njf-priority-item-body">
                          <span className={`njf-priority-status ftp-job-status-label ftp-job-status-label--${item.isNew ? 'pending' : item.status}`}>
                            {item.isNew ? 'New' : ({ active: 'In progress', blocked: 'Blocked', paused: 'Paused', pending: 'Pending' }[item.status] ?? item.status)}
                          </span>
                          <span className="njf-priority-name">{item.name}</span>
                        </div>
                        <div className="njf-priority-arrows">
                          <button type="button" className="njf-priority-arrow" disabled={idx === 0} onClick={() => movePriorityItem(idx, -1)} aria-label="Move up">
                            <span className="material-symbols-outlined">arrow_upward</span>
                          </button>
                          <button type="button" className="njf-priority-arrow" disabled={idx === priorityList.length - 1} onClick={() => movePriorityItem(idx, 1)} aria-label="Move down">
                            <span className="material-symbols-outlined">arrow_downward</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="njf-priority-footer">
                    <button type="button" className="njf-confirm-job-btn" onClick={handleConfirmPriority}>
                      Confirm order
                    </button>
                  </div>
                </div>
              )}
              {msg.type === 'task-plan' && taskPlanSubtasks && (
                <div className="njf-task-plan">
                  <div className="njf-task-plan-header">
                    <span className="material-symbols-outlined njf-task-plan-icon" aria-hidden>format_list_bulleted</span>
                    <span className="njf-task-plan-title">Task plan</span>
                    <span className="njf-task-plan-count">{taskPlanSubtasks.length} tasks</span>
                  </div>
                  <div className="njf-task-plan-list">
                    {(() => {
                      const avatarBg = { idle: 'rgba(122,122,122,0.3)', active: 'rgba(61,212,48,0.25)', paused: 'rgba(239,68,68,0.25)', intervention: 'rgba(234,67,53,0.25)' }
                      // Group subtasks by phase
                      const phases = taskPlanSubtasks.reduce((acc, t) => {
                        const p = t.phase ?? 1
                        const g = acc.find((x) => x.phase === p)
                        if (g) g.tasks.push(t)
                        else acc.push({ phase: p, tasks: [t] })
                        return acc
                      }, [])
                      return phases.map((group, gIdx) => (
                        <div key={group.phase} className="njf-phase-group">
                          {gIdx > 0 && (
                            <div className="njf-phase-divider" aria-hidden>
                              <div className="njf-phase-divider-line" />
                              <span className="njf-phase-divider-label">
                                <span className="material-symbols-outlined">arrow_downward</span>
                                then
                              </span>
                              <div className="njf-phase-divider-line" />
                            </div>
                          )}
                          {group.tasks.length > 1 && (
                            <div className="njf-phase-parallel-label">
                              <span className="material-symbols-outlined" aria-hidden>compare_arrows</span>
                              Happens simultaneously
                            </div>
                          )}
                          <div className={`njf-phase-tasks${group.tasks.length > 1 ? ' njf-phase-tasks--parallel' : ''}`}>
                            {group.tasks.map((subtask) => {
                              const assignedIds = subtask.assignedVehicleIds ?? [subtask.assignedVehicleId].filter(Boolean)
                              return (
                                <div key={subtask.id} className="njf-subtask">
                                  <div className="njf-subtask-header">
                                    <span className="njf-subtask-name">{subtask.name}</span>
                                    <span className="njf-subtask-time">~{subtask.estimatedMins}m</span>
                                  </div>
                                  <div className="njf-subtask-machines">
                                    {assignedIds.map((vid) => {
                                      const v = VEHICLES.find((x) => x.id === vid)
                                      if (!v) return null
                                      const vs = effectiveVehicleStatuses[v.id] ?? v.status
                                      return (
                                        <span key={vid} className={`njf-subtask-machine-chip ${v.color}`}>
                                          <span className="njf-machine-avatar">
                                            <img src="/bobcat-vehicle.png" alt="" />
                                          </span>
                                          <span className="njf-subtask-chip-name">{v.name}</span>
                                          <button
                                            type="button"
                                            className="njf-subtask-chip-remove"
                                            onClick={() => removeSubtaskMachine(subtask.id, vid)}
                                            aria-label={`Remove ${v.name}`}
                                          >
                                            <span className="material-symbols-outlined" aria-hidden>close</span>
                                          </button>
                                        </span>
                                      )
                                    })}
                                    <button
                                      type="button"
                                      className="njf-subtask-add-machine"
                                      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPickerAnchor(r); setSubtaskPickerOpen(subtask.id) }}
                                    >
                                      <span className="material-symbols-outlined" aria-hidden>add</span>
                                      Add machine
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))
                    })()}
                  </div>
                  <div className="njf-task-plan-footer">
                    <button type="button" className="njf-confirm-job-btn" onClick={handleConfirmJob}>
                      Confirm and start job
                    </button>
                  </div>
                </div>
              )}
              {msg.type === 'user' && (
                <div className="command-bubble">
                  <span className="command-body">{msg.body}</span>
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="njf-msg njf-msg--system">
              <div className="vehicle-bubble njf-typing">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="njf-input-area">
          {attachedFile && (
            <div className="njf-file-preview">
              {previewUrl ? (
                <img src={previewUrl} alt={attachedFile.name} className="njf-file-preview-img" />
              ) : (
                <div className="njf-file-preview-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
              )}
              <span className="njf-file-preview-name">{attachedFile.name}</span>
              <button type="button" className="njf-file-preview-remove" onClick={removeAttachment} aria-label="Remove file">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <div className="chat-input-wrap njf-input-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.csv,.xlsx"
              style={{ display: 'none' }}
              onChange={(e) => handleFileChange(e.target.files[0] ?? null)}
            />
            <button
              type="button"
              className={`njf-upload-btn${attachedFile ? ' njf-upload-btn--active' : ''}`}
              title={attachedFile ? attachedFile.name : 'Attach file'}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <MentionInput
              value={input}
              onChange={setInput}
              onSubmit={sendMessage}
              vehicles={[]}
              placeholder={
                mapPickMode === 'resource' ? 'Describe what to move…' :
                mapPickMode === 'destination' ? 'Describe the destination…' :
                'Type a message…'
              }
              inputClassName="chat-input"
            />
          </div>
        </div>
      </div>

      {/* Machine picker popup */}
      {subtaskPickerOpen && taskPlanSubtasks && (() => {
        const currentSubtask = taskPlanSubtasks.find((t) => t.id === subtaskPickerOpen)
        const avatarBg = { idle: 'rgba(122,122,122,0.3)', active: 'rgba(61,212,48,0.25)', paused: 'rgba(239,68,68,0.25)', intervention: 'rgba(234,67,53,0.25)' }
        const popupStyle = (() => {
          if (!pickerAnchor) return {}
          const PAD = 8
          const POPUP_W = 220
          const left = Math.max(PAD, Math.min(pickerAnchor.left, window.innerWidth - POPUP_W - PAD))
          const spaceBelow = window.innerHeight - pickerAnchor.bottom - PAD
          const spaceAbove = pickerAnchor.top - PAD
          if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
            return { position: 'fixed', top: pickerAnchor.bottom + 6, left, maxHeight: Math.max(120, spaceBelow) }
          }
          return { position: 'fixed', bottom: window.innerHeight - pickerAnchor.top + 6, left, maxHeight: Math.max(120, spaceAbove) }
        })()
        return (
          <div className="njf-picker-backdrop" onClick={() => setSubtaskPickerOpen(null)}>
            <div className="njf-picker-popup" style={popupStyle} onClick={(e) => e.stopPropagation()}>
              <div className="njf-picker-header">
                <span className="njf-picker-subtitle">{currentSubtask?.name}</span>
              </div>
              <div className="njf-picker-list">
                {[...VEHICLES]
                  .sort((a, b) => {
                    const order = { idle: 0, active: 1, paused: 2, intervention: 3 }
                    return (order[effectiveVehicleStatuses[a.id] ?? a.status] ?? 9) - (order[effectiveVehicleStatuses[b.id] ?? b.status] ?? 9)
                  })
                  .map((v) => {
                    const vStatus = effectiveVehicleStatuses[v.id] ?? v.status
                    const vStatusLabel = vStatus === 'idle' ? 'Ready' : vStatus === 'active' ? 'Working' : vStatus === 'intervention' ? 'Needs help' : 'Paused'
                    const assignedIds = currentSubtask?.assignedVehicleIds ?? [currentSubtask?.assignedVehicleId].filter(Boolean)
                    const isSelected = assignedIds.includes(v.id)
                    return (
                      <button
                        key={v.id}
                        type="button"
                        className={`njf-picker-item${isSelected ? ' njf-picker-item--selected' : ''}`}
                        onClick={() => toggleSubtaskMachine(subtaskPickerOpen, v.id)}
                      >
                        <span className="njf-machine-avatar" style={{ width: 26, height: 26, flex: '0 0 26px', background: avatarBg[vStatus] }}>
                          <img src="/bobcat-vehicle.png" alt="" />
                        </span>
                        <span className="njf-picker-item-info">
                          <span className="njf-picker-item-name">{v.name}</span>
                          <span className={`njf-picker-item-status njf-machine-status--${vStatus}`}>
                            <span className="njf-machine-status-dot" />
                            {vStatusLabel}
                          </span>
                        </span>
                        {isSelected && <span className="material-symbols-outlined njf-picker-item-check" aria-hidden>check</span>}
                      </button>
                    )
                  })}
              </div>
              <div className="njf-picker-footer">
                <button type="button" className="njf-picker-done" onClick={() => setSubtaskPickerOpen(null)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Confirm-close modal */}
      {confirmClose && (
        <div className="njf-confirm-overlay" onClick={() => setConfirmClose(false)}>
          <div className="njf-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p className="njf-confirm-title">Delete job</p>
            <div className="njf-confirm-actions">
              <button type="button" className="njf-confirm-keep" onClick={() => setConfirmClose(false)}>
                Keep editing
              </button>
              <button type="button" className="njf-confirm-discard" onClick={onClose}>
                Delete job
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
