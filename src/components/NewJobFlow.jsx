import { useState, useEffect, useRef } from 'react'
import MapPanel from './MapPanel'
import MentionInput from './MentionInput'
import { VEHICLES } from '../data/vehicles'
import './NewJobFlow.css'

let _msgId = 1
const nextId = () => ++_msgId

function getReply(userText, currentJobType) {
  const t = userText.toLowerCase()

  // User describing terrain after selecting "Build terrain"
  if (currentJobType === 'build-terrain') {
    return {
      body: "Got it — I've generated the terrain visualization based on your description. The design lines and grade heatmap are now overlaid on the map.",
      showTerrainViz: true,
    }
  }

  if (t === 'move resources') {
    return {
      body: "Got it. What are you moving, and where to?\n\nDescribe the materials and destination — or click a resource directly on the map to select it and I'll pick up the details from there.",
      jobType: 'move-resources',
      mapMode: 'resource',
    }
  }

  if (t === 'build terrain') {
    return {
      body: "Sure. Point me to the area on the map, or describe the location — then tell me the target elevation or slope you're working toward.\n\nFor example: \"the north-east corner, graded to 2% slope\" or \"the pad near zone B, raised to 1.5m above current grade\".",
      jobType: 'build-terrain',
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

const INITIAL_MESSAGES = [
  { id: 1, type: 'system', body: 'What kind of job?', chips: ['Build terrain', 'Move resources', 'Navigate'] },
]

export default function NewJobFlow({ onClose, onJobCreated, zones, onZonesChange, zonesVisible, onZonesVisibleChange }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  // Job type tracking
  const [jobType, setJobType] = useState(null)
  const [terrainDescribed, setTerrainDescribed] = useState(false)
  const [selectedMachineIds, setSelectedMachineIds] = useState(new Set())

  // Map pick state — resource/destination
  const [mapPickMode, setMapPickMode] = useState(null)
  const [pendingMapPoint, setPendingMapPoint] = useState(null)
  const [confirmedDestinationPoint, setConfirmedDestinationPoint] = useState(null)

  // Navigate waypoints
  const [waypoints, setWaypoints] = useState([])

  const [confirmClose, setConfirmClose] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const messagesEndRef = useRef(null)
  const priorPickModeRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const addSystemMessage = (body, chips) => {
    setMessages((prev) => [...prev, { id: nextId(), type: 'system', body, chips }])
  }

  const sendMessage = (text) => {
    if (!text.trim() || isTyping) return
    const trimmed = text.trim()

    setMessages((prev) => [...prev.map((m) => ({ ...m, chips: undefined })), { id: nextId(), type: 'user', body: trimmed }])
    setInput('')

    const reply = getReply(trimmed, jobType)
    if (!reply) return

    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      setMessages((prev) => [...prev, { id: nextId(), type: 'system', body: reply.body }])
      if (reply.jobType) setJobType(reply.jobType)
      if (reply.mapMode) setMapPickMode(reply.mapMode)
      if (reply.showTerrainViz) {
        setTerrainDescribed(true)
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            { id: nextId(), type: 'machine-select', body: 'Which machines should I assign to this job?' },
          ])
        }, 600)
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

  const handleResourceZoneDrawn = () => {
    setMapPickMode('destination')
    addSystemMessage('Resource zone marked. Now click the destination on the map.')
  }

  const handleZoneSelect = () => {
    setMapPickMode('destination')
    addSystemMessage('Zone selected. Now click the destination on the map.')
  }

  const handleConfirmPoint = () => {
    if (!pendingMapPoint) return

    if (mapPickMode === 'destination') {
      setConfirmedDestinationPoint(pendingMapPoint)
      setPendingMapPoint(null)
      setMapPickMode(null)
      setMessages((prev) => [
        ...prev,
        { id: nextId(), type: 'system', body: 'Got it — pickup and destination are set.' },
      ])
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), type: 'machine-select', body: 'Which machines should I assign to this job?' },
        ])
      }, 600)
    }
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

  const handleConfirmJob = () => {
    onJobCreated?.({
      id: 'job-' + Date.now(),
      name: JOB_NAMES[jobType] ?? 'New job',
      assignedVehicleIds: [...selectedMachineIds],
      status: 'active',
      progress: 0.05,
      estimatedMins: 45,
    })
    onClose()
  }

  const toggleMachine = (id) => {
    setSelectedMachineIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="new-job-flow">
      {/* Full-width banner */}
      <div className="njf-banner">
        <span className="njf-banner-title">New job</span>
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
        mapPickMode={mapPickMode}
        pendingMapPoint={pendingMapPoint}
        confirmedDestinationPoint={confirmedDestinationPoint}
        onMapPointPick={handleMapPointPick}
        onConfirmPoint={handleConfirmPoint}
        onConfirmWaypoints={handleConfirmWaypoints}
        onCancelMapPick={handleCancelMapPick}
        onDrawModeCancel={handleDrawModeCancel}
        onZoneSelect={handleZoneSelect}
        onResourceZoneDrawn={handleResourceZoneDrawn}
        terrainVisualizationActive={terrainDescribed}
        waypoints={waypoints}
        zones={zones}
        onZonesChange={onZonesChange}
        zonesVisible={zonesVisible}
        onZonesVisibleChange={onZonesVisibleChange}
      />

      {/* Left chat panel */}
      <div className={`njf-chat${collapsed ? ' njf-chat--collapsed' : ''}`}>
        {/* Mobile-only header with collapse toggle */}
        <div className="njf-chat-header">
          <span className="njf-chat-header-title">New job</span>
          <button
            type="button"
            className="njf-chat-collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            <span className="material-symbols-outlined" aria-hidden>
              {collapsed ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>

        <div className="njf-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`njf-msg njf-msg--${msg.type === 'machine-select' ? 'system' : msg.type}`}>
              {msg.type === 'system' && (
                <>
                  <div className="vehicle-bubble njf-bubble-body">{msg.body}</div>
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
              {msg.type === 'machine-select' && (
                <>
                  <div className="vehicle-bubble njf-bubble-body">{msg.body}</div>
                  <div className="njf-machine-chips">
                    {[...VEHICLES]
                      .sort((a, b) => {
                        const order = { idle: 0, active: 1, paused: 2, intervention: 3 }
                        return (order[a.status] ?? 9) - (order[b.status] ?? 9)
                      })
                      .map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={`njf-machine-chip${selectedMachineIds.has(v.id) ? ' njf-machine-chip--selected' : ''}`}
                        onClick={() => toggleMachine(v.id)}
                      >
                        <span className={`njf-machine-avatar ${v.color}`}>
                          <img src="/bobcat-vehicle.png" alt="" />
                        </span>
                        <span className="njf-machine-info">
                          <span className="njf-machine-name">{v.name}</span>
                          <span className={`njf-machine-status njf-machine-status--${v.status}`}>
                            <span className="njf-machine-status-dot" />
                            {v.status === 'idle' ? 'Ready' : v.status === 'active' ? 'Working' : v.status === 'intervention' ? 'Needs help' : 'Paused'}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {selectedMachineIds.size > 0 && (
                    <button type="button" className="njf-confirm-job-btn" onClick={handleConfirmJob}>
                      Confirm and start job
                    </button>
                  )}
                </>
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

        <div className="chat-input-wrap">
          <MentionInput
            value={input}
            onChange={setInput}
            onSubmit={sendMessage}
            vehicles={[]}
            placeholder="Type a message…"
            inputClassName="chat-input"
          />
        </div>
      </div>

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
