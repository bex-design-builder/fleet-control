import { useState } from 'react'
import ChatPanel from './components/ChatPanel'
import MapPanel, { AUTO_OBSTACLES } from './components/MapPanel'
import VehiclesPanel from './components/VehiclesPanel'
import VehicleBanner from './components/VehicleBanner'
import CameraPanel from './components/CameraPanel'
import NewJobFlow from './components/NewJobFlow'
import { VEHICLES } from './data/vehicles'
import { JOBS } from './data/jobs'
import {
  INITIAL_ALL_MESSAGES,
  getNextMessageId,
} from './data/chatMessages'
import { parseMentionsAndBody } from './components/MentionInput'
import './App.css'

export default function App() {
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)
  const [allVehiclesMessages, setAllVehiclesMessages] = useState(INITIAL_ALL_MESSAGES)
  const [vehicleMessages, setVehicleMessages] = useState({})
  const [stoppedVehicleIds, setStoppedVehicleIds] = useState(new Set())
  const [newJobFlowOpen, setNewJobFlowOpen] = useState(false)
  const [vehiclesPanelOpen, setVehiclesPanelOpen] = useState(false)
  const [zones, setZones] = useState(AUTO_OBSTACLES)
  const [zonesVisible, setZonesVisible] = useState(true)
  const [jobs, setJobs] = useState(JOBS)

  const selectedVehicle = selectedVehicleId
    ? VEHICLES.find((v) => v.id === selectedVehicleId)
    : null

  const effectiveVehicleStatuses = {}
  stoppedVehicleIds.forEach((id) => {
    effectiveVehicleStatuses[id] = 'paused'
  })

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
        {selectedVehicle && (
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
          jobs={jobs}
        />
        <MapPanel
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={handleSelectVehicle}
          stoppedVehicleIds={stoppedVehicleIds}
          zones={zones}
          onZonesChange={setZones}
          zonesVisible={zonesVisible}
          onZonesVisibleChange={setZonesVisible}
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
              E-stop all
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
              E-stop all
            </button>
          </div>
        )}
        {newJobFlowOpen && (
          <NewJobFlow
            onClose={() => setNewJobFlowOpen(false)}
            onJobCreated={(job) => setJobs((prev) => [...prev, job])}
            zones={zones}
            onZonesChange={setZones}
            zonesVisible={zonesVisible}
            onZonesVisibleChange={setZonesVisible}
          />
        )}
      </div>
    </div>
  )
}
