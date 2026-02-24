import { useState } from 'react'
import ChatPanel from './components/ChatPanel'
import MapPanel from './components/MapPanel'
import VehiclesPanel from './components/VehiclesPanel'
import VehicleBanner from './components/VehicleBanner'
import CameraPanel from './components/CameraPanel'
import { VEHICLES } from './data/vehicles'
import {
  INITIAL_ALL_MESSAGES,
  INITIAL_VEHICLE_MESSAGES,
  getNextMessageId,
} from './data/chatMessages'
import { parseMentionsAndBody } from './components/MentionInput'
import './App.css'

export default function App() {
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)
  const [leftChatCollapsed, setLeftChatCollapsed] = useState(false)
  const [allVehiclesMessages, setAllVehiclesMessages] = useState(INITIAL_ALL_MESSAGES)
  const [vehicleMessages, setVehicleMessages] = useState({})
  const [stoppedVehicleIds, setStoppedVehicleIds] = useState(new Set())

  const selectedVehicle = selectedVehicleId
    ? VEHICLES.find((v) => v.id === selectedVehicleId)
    : null

  const handleSelectVehicle = (id) => {
    setSelectedVehicleId(id)
    setLeftChatCollapsed(true)
  }

  const handleStopVehicle = (id) => {
    setStoppedVehicleIds((prev) => new Set(prev).add(id))
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
      <div className={`app-frame ${leftChatCollapsed ? 'app-frame--left-collapsed' : ''} ${selectedVehicleId ? 'app-frame--vehicle-open' : ''}`}>
        {selectedVehicle && (
          <>
            <VehicleBanner vehicle={selectedVehicle} />
            <CameraPanel vehicle={selectedVehicle} />
          </>
        )}
        <ChatPanel
          messages={allVehiclesMessages}
          onSendMessage={handleSendFromAll}
          isCollapsed={leftChatCollapsed}
          onExpand={() => setLeftChatCollapsed(false)}
          onCollapse={() => setLeftChatCollapsed(true)}
        />
        <MapPanel
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={handleSelectVehicle}
          stoppedVehicleIds={stoppedVehicleIds}
        />
        <VehiclesPanel
          selectedVehicleId={selectedVehicleId}
          initialVehicleMessages={INITIAL_VEHICLE_MESSAGES}
          vehicleMessages={vehicleMessages}
          stoppedVehicleIds={stoppedVehicleIds}
          onSelectVehicle={handleSelectVehicle}
          onSendMessage={handleSendFromVehicle}
          onStopVehicle={handleStopVehicle}
          onBack={() => {
            setSelectedVehicleId(null)
            setLeftChatCollapsed(false)
          }}
        />
      </div>
    </div>
  )
}
