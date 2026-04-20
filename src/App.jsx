import { useState, useMemo } from 'react'
import ChatPanel from './components/ChatPanel'
import MapPanel, { AUTO_OBSTACLES } from './components/MapPanel'
import VehiclesPanel from './components/VehiclesPanel'
import VehicleBanner from './components/VehicleBanner'
import CameraPanel from './components/CameraPanel'
import NewJobFlow from './components/NewJobFlow'
import JobDetailModal from './components/JobDetailModal'
import { VEHICLES } from './data/vehicles'
import {
  INITIAL_ALL_MESSAGES,
  getNextMessageId,
} from './data/chatMessages'
import { parseMentionsAndBody } from './components/MentionInput'
import { computeAllEffectiveSubtaskStatuses, getEffectiveJobStatus } from './data/jobLogic'
import './App.css'

export default function App() {
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)
  const [allVehiclesMessages, setAllVehiclesMessages] = useState(INITIAL_ALL_MESSAGES)
  const [vehicleMessages, setVehicleMessages] = useState({})
  const [stoppedVehicleIds, setStoppedVehicleIds] = useState(new Set())
  const [activeJobVehicleIds, setActiveJobVehicleIds] = useState(new Set())
  const [newJobFlowOpen, setNewJobFlowOpen] = useState(false)
  const [vehiclesPanelOpen, setVehiclesPanelOpen] = useState(false)
  const [zones, setZones] = useState(AUTO_OBSTACLES)
  const [zonesVisible, setZonesVisible] = useState(true)
  const [jobs, setJobs] = useState([])
  const [scene3D, setScene3D] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [jobModalVehicleId, setJobModalVehicleId] = useState(null)

  const selectedVehicle = selectedVehicleId
    ? VEHICLES.find((v) => v.id === selectedVehicleId)
    : null

  // Derive vehicle active status from job subtask data, with manual overrides
  const effectiveVehicleStatuses = useMemo(() => {
    const result = {}
    // Vehicles are active if assigned to an active subtask in any job
    jobs.forEach((job) => {
      ;(job.subtasks ?? []).forEach((st) => {
        if (st.status === 'active') {
          const ids = st.assignedVehicleIds ?? (st.assignedVehicleId ? [st.assignedVehicleId] : [])
          ids.forEach((id) => { result[id] = 'active' })
        }
      })
      // Jobs without subtasks: mark assigned vehicles active if job is active
      if ((job.subtasks ?? []).length === 0 && job.status === 'active') {
        ;(job.assignedVehicleIds ?? []).forEach((id) => { result[id] = 'active' })
      }
    })
    // Newly created jobs (before subtask data is available)
    activeJobVehicleIds.forEach((id) => { result[id] = 'active' })
    // Manual pause overrides job-derived active
    stoppedVehicleIds.forEach((id) => { result[id] = 'paused' })
    // Preserve intervention status from base vehicle data (highest priority)
    VEHICLES.forEach((v) => {
      if (v.status === 'intervention') result[v.id] = 'intervention'
    })
    return result
  }, [jobs, activeJobVehicleIds, stoppedVehicleIds])

  const effectiveSubtaskStatuses = useMemo(
    () => computeAllEffectiveSubtaskStatuses(jobs, effectiveVehicleStatuses),
    [jobs, effectiveVehicleStatuses]
  )

  const jobsWithEffectiveStatus = useMemo(
    () => jobs.map((job) => ({
      ...job,
      effectiveStatus: getEffectiveJobStatus(job, effectiveSubtaskStatuses, effectiveVehicleStatuses),
    })),
    [jobs, effectiveSubtaskStatuses]
  )

  const handleSelectVehicle = (id) => {
    setSelectedVehicleId(id)
  }

  const handleEStopAll = () => {
    const nonIdleIds = VEHICLES
      .filter((v) => (effectiveVehicleStatuses[v.id] ?? v.status) !== 'idle')
      .map((v) => v.id)
    setStoppedVehicleIds((prev) => {
      const next = new Set(prev)
      nonIdleIds.forEach((id) => next.add(id))
      return next
    })
  }

  const handleStopVehicle = (id) => {
    setStoppedVehicleIds((prev) => new Set(prev).add(id))
    const vehicle = VEHICLES.find((v) => v.id === id)
    if (vehicle) {
      const msg = {
        id: getNextMessageId(),
        type: 'vehicle',
        sender: vehicle.name,
        color: vehicle.color,
        body: 'Task paused',
      }
      setAllVehiclesMessages((prev) => [...prev, msg])
      setVehicleMessages((prev) => ({
        ...prev,
        [id]: [...(prev[id] || []), msg],
      }))
    }
  }

  const handleResumeVehicle = (id) => {
    setStoppedVehicleIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    const vehicle = VEHICLES.find((v) => v.id === id)
    if (vehicle) {
      const msg = {
        id: getNextMessageId(),
        type: 'vehicle',
        sender: vehicle.name,
        color: vehicle.color,
        body: 'Task resumed',
      }
      setAllVehiclesMessages((prev) => [...prev, msg])
      setVehicleMessages((prev) => ({
        ...prev,
        [id]: [...(prev[id] || []), msg],
      }))
    }
  }

  const handleSendFromAll = (raw) => {
    const { mentions, body } = parseMentionsAndBody(raw, VEHICLES)
    if (!body && mentions.length === 0) return
    const msg = {
      id: getNextMessageId(),
      type: 'command',
      mentions,
      body: body || ' ',
    }
    setAllVehiclesMessages((prev) => [...prev, msg])
    const mentionedIds = new Set(
      mentions.map((m) => VEHICLES.find((v) => v.name === m.name)?.id).filter(Boolean)
    )
    mentionedIds.forEach((vehicleId) => {
      setVehicleMessages((prev) => ({
        ...prev,
        [vehicleId]: [...(prev[vehicleId] || []), msg],
      }))
    })
  }

  const handleReorderJobs = (orderedIds) => {
    setJobs((prev) => {
      const map = new Map(prev.map((j) => [j.id, j]))
      return orderedIds.map((id) => map.get(id)).filter(Boolean)
    })
  }

  const handleSendFromVehicle = (raw, vehicle) => {
    const { body } = parseMentionsAndBody(raw, VEHICLES)
    if (!body?.trim()) return
    const msgForAll = {
      id: getNextMessageId(),
      type: 'command',
      mentions: [{ name: vehicle.name, pill: vehicle.color }],
      body: body.trim(),
    }
    setAllVehiclesMessages((prev) => [...prev, msgForAll])
    setVehicleMessages((prev) => ({
      ...prev,
      [vehicle.id]: [...(prev[vehicle.id] || []), msgForAll],
    }))
  }

  return (
    <div className="app-container">
      <div className={`app-frame ${selectedVehicleId ? 'app-frame--vehicle-open' : ''}`}>
        {selectedVehicle && !newJobFlowOpen && (
          <>
            <VehicleBanner
              vehicle={selectedVehicle}
              onClose={() => setSelectedVehicleId(null)}
            />
            <CameraPanel vehicle={selectedVehicle} />
          </>
        )}
        <ChatPanel
          messages={allVehiclesMessages}
          onSendMessage={handleSendFromAll}
          selectedVehicle={selectedVehicle}
          effectiveVehicleStatuses={effectiveVehicleStatuses}
          onNewJob={() => setNewJobFlowOpen(true)}
          jobs={jobsWithEffectiveStatus}
          onSelectJob={(jobId, vehicleId) => { setSelectedJobId(jobId); setJobModalVehicleId(vehicleId ?? null) }}
          onReorderJobs={handleReorderJobs}
        />
        <MapPanel
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={handleSelectVehicle}
          stoppedVehicleIds={stoppedVehicleIds}
          effectiveVehicleStatuses={effectiveVehicleStatuses}
          onStopVehicle={handleStopVehicle}
          onResumeVehicle={handleResumeVehicle}
          zones={zones}
          onZonesChange={setZones}
          zonesVisible={zonesVisible}
          onZonesVisibleChange={setZonesVisible}
          scene3D={scene3D}
          onScene3DChange={setScene3D}
        />
        {!selectedVehicleId && (() => {
          const needsHelp = VEHICLES.filter((v) => {
            const s = effectiveVehicleStatuses[v.id] ?? v.status
            return s === 'intervention' || s === 'paused'
          }).length
          const inProgress = VEHICLES.filter((v) => (effectiveVehicleStatuses[v.id] ?? v.status) === 'active').length
          const idle = VEHICLES.filter((v) => (effectiveVehicleStatuses[v.id] ?? v.status) === 'idle').length
          return (
          <div className="map-top-right-controls">
            <div className="map-mode-tabs" role="group" aria-label="Map view mode">
              <button type="button" className={`map-mode-tab map-mode-tab--basic${scene3D === false ? ' map-mode-tab--active' : ''}`} onClick={() => setScene3D(false)} aria-label="Basic map"><span className="material-symbols-outlined">map</span></button>
              <button type="button" className={`map-mode-tab${scene3D === 'lidar' ? ' map-mode-tab--active' : ''}`} onClick={() => setScene3D('lidar')} aria-label="Lidar"><span className="material-symbols-outlined">radar</span></button>
              <button type="button" className={`map-mode-tab${scene3D === true ? ' map-mode-tab--active' : ''}`} onClick={() => setScene3D(true)} aria-label="3D view"><span className="material-symbols-outlined">view_in_ar</span></button>
            </div>
            <div className="vehicles-toggle-wrap">
              <button
                type="button"
                className={`vehicles-toggle-btn${vehiclesPanelOpen ? ' vehicles-toggle-btn--active' : ''}`}
                onClick={() => setVehiclesPanelOpen((v) => !v)}
                aria-label={vehiclesPanelOpen ? 'Hide vehicles' : 'Show vehicles'}
              >
                <span className="vehicles-toggle-stats">
                  {needsHelp > 0 && (
                    <span className="vtog-stat vtog-stat--alert">
                      <span className="vtog-dot" />
                      {needsHelp} needs help
                    </span>
                  )}
                  <span className="vtog-stat vtog-stat--active">
                    <span className="vtog-dot" />
                    {inProgress} working
                  </span>
                  <span className="vtog-stat vtog-stat--idle">
                    <span className="vtog-dot" />
                    {idle} idle
                  </span>
                </span>
              </button>
              {vehiclesPanelOpen && (
                <VehiclesPanel
                  stoppedVehicleIds={stoppedVehicleIds}
                  effectiveVehicleStatuses={effectiveVehicleStatuses}
                  onSelectVehicle={handleSelectVehicle}
                  onStopVehicle={handleStopVehicle}
                  onResumeVehicle={handleResumeVehicle}
                  onClose={() => setVehiclesPanelOpen(false)}
                />
              )}
            </div>
            <button
              type="button"
              className="estop-btn"
              onClick={handleEStopAll}
              aria-label="Emergency stop all vehicles"
            >
              <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>stop</span>
              <span className="estop-label">E-stop all</span>
            </button>
          </div>
          )
        })()}
        {selectedVehicleId && (
          <div className="map-top-right-controls map-top-right-controls--vehicle-view">
            <button
              type="button"
              className="estop-btn"
              onClick={handleEStopAll}
              aria-label="Emergency stop all vehicles"
            >
              <span className="material-symbols-outlined" style={{fontVariationSettings: "'FILL' 1"}}>stop</span>
            </button>
          </div>
        )}
        {newJobFlowOpen && (
          <NewJobFlow
            onClose={() => setNewJobFlowOpen(false)}
            scene3D={scene3D}
            onScene3DChange={setScene3D}
            effectiveVehicleStatuses={effectiveVehicleStatuses}
            existingJobs={jobsWithEffectiveStatus}
            onJobCreated={(job) => {
              setJobs((prev) => [...prev, job])
              const assigned = (job.assignedVehicleIds || [])
                .map((id) => VEHICLES.find((v) => v.id === id))
                .filter(Boolean)
              setActiveJobVehicleIds((prev) => {
                const next = new Set(prev)
                assigned.forEach((v) => next.add(v.id))
                return next
              })
              assigned.forEach((vehicle) => {
                const msg = {
                  id: getNextMessageId(),
                  type: 'vehicle',
                  sender: vehicle.name,
                  color: vehicle.color,
                  body: `Starting job: ${job.name}`,
                }
                setAllVehiclesMessages((prev) => [...prev, msg])
                setVehicleMessages((prev) => ({
                  ...prev,
                  [vehicle.id]: [...(prev[vehicle.id] || []), msg],
                }))
              })
            }}
            zones={zones}
            onZonesChange={setZones}
            zonesVisible={zonesVisible}
            onZonesVisibleChange={setZonesVisible}
          />
        )}
      </div>
      {selectedJobId && (() => {
        const job = jobsWithEffectiveStatus.find((j) => j.id === selectedJobId)
        return job ? (
          <JobDetailModal
            job={job}
            zones={zones}
            zonesVisible={zonesVisible}
            effectiveVehicleStatuses={effectiveVehicleStatuses}
            effectiveSubtaskStatuses={effectiveSubtaskStatuses}
            contextVehicleId={jobModalVehicleId}
            onClose={() => { setSelectedJobId(null); setJobModalVehicleId(null) }}
            onUpdateJob={(updatedJob) => setJobs((prev) => prev.map((j) => j.id === updatedJob.id ? updatedJob : j))}
            onSelectVehicle={(id) => { setSelectedJobId(null); setSelectedVehicleId(id) }}
          />
        ) : null
      })()}
    </div>
  )
}
