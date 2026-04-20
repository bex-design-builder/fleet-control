import { useState, useMemo, useRef, useEffect } from 'react'
import { VEHICLES } from '../data/vehicles'
import MapPanel from './MapPanel'
import './JobDetailModal.css'

const STATUS_LABEL = { complete: 'Complete', active: 'In progress', pending: 'Pending', blocked: 'Blocked' }

function SubtaskCard({ st, effectiveStatus, assignedVehicles, avatarBg, effectiveVehicleStatuses }) {
  const status = effectiveStatus ?? st.status
  const progress = status === 'complete' ? 100 : status === 'active' ? 40 : 0
  return (
    <div className={`jdm-subtask jdm-subtask--${status}`}>
      <div className="jdm-subtask-top">
        <span className={`jdm-subtask-chip jdm-subtask-chip--${status}`}>
          {STATUS_LABEL[status] ?? status}
        </span>
        <span className="jdm-subtask-time">~{st.estimatedMins}m</span>
      </div>
      <span className="jdm-subtask-name">{st.name}</span>
      <div className="jdm-subtask-progress">
        <div className={`jdm-subtask-progress-fill jdm-subtask-progress-fill--${status}`} style={{ width: `${progress}%` }} />
      </div>
      <div className="jdm-subtask-machines">
        {assignedVehicles.map((v) => (
          <span key={v.id} className={`jdm-subtask-machine-chip ${v.color}`}>
            <span className="jdm-mini-avatar">
              <img src="/bobcat-vehicle.png" alt="" />
            </span>
            {v.name}
          </span>
        ))}
        {st.attachment && (
          <span className="jdm-subtask-attachment">
            <span className="material-symbols-outlined" aria-hidden>construction</span>
            {st.attachment}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function JobDetailModal({ job, zones = [], zonesVisible = true, effectiveVehicleStatuses = {}, effectiveSubtaskStatuses = {}, onClose, onUpdateJob, onSelectVehicle = () => {}, contextVehicleId = null }) {
  const modalRef = useRef(null)
  useEffect(() => { if (modalRef.current) modalRef.current.scrollTop = 0 }, [])

  const assignedVehicles = (job.assignedVehicleIds ?? [])
    .map((id) => VEHICLES.find((v) => v.id === id))
    .filter(Boolean)

  const effectiveStatus = job.effectiveStatus ?? job.status

  const [subtasks] = useState(job.subtasks ?? [])
  const [subtaskFilter, setSubtaskFilter] = useState(contextVehicleId ?? 'all')

  const contextVehicle = contextVehicleId ? VEHICLES.find((v) => v.id === contextVehicleId) : null

  const filteredSubtasks = useMemo(() =>
    subtaskFilter === 'all'
      ? subtasks
      : subtasks.filter((st) => {
          const ids = st.assignedVehicleIds ?? (st.assignedVehicleId ? [st.assignedVehicleId] : [])
          return ids.includes(subtaskFilter)
        }),
    [subtasks, subtaskFilter]
  )

  const totalMins = subtasks.reduce((sum, st) => st.status === 'complete' ? sum : sum + (st.estimatedMins ?? 0), 0)
  const completedCount = subtasks.filter((st) => st.status === 'complete').length
  const progressPct = subtasks.length > 0 ? Math.round((completedCount / subtasks.length) * 100) : Math.round((job.progress ?? 0) * 100)

  // Map preview props based on job type
  const jobType = job.jobType
  const resourcePoint     = job.resourcePoint ?? null
  const destinationPoint  = job.destinationPoint ?? null
  const resourceLabel = job.resourceLabel || null

  return (
    <div
      className="jdm-overlay"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div ref={modalRef} className="jdm-modal" role="dialog" aria-label={`Job detail: ${job.name}`}>

        {/* Mobile-only: sticky floating close button */}
        <div className="jdm-close-float-wrap" aria-hidden="true">
          <button type="button" className="jdm-map-close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="jdm-body">
          {/* Left — details */}
          <div className="jdm-left">

            {/* Hero header — matches job list card style */}
            <div className="jdm-hero">
              <div className="jdm-hero-top">
                <span className={`jdm-status-badge jdm-status-badge--${effectiveStatus}`}>
                  {STATUS_LABEL[effectiveStatus] ?? effectiveStatus}
                </span>
                <div className="jdm-hero-right">
                  <button type="button" className="jdm-edit-btn" aria-label="Edit job">
                    <span className="material-symbols-outlined">edit</span>
                    Edit
                  </button>
                </div>
              </div>
              <h2 className="jdm-title">{job.name}</h2>
              <div className="jdm-hero-progress-row">
                <div className="jdm-progress-bar">
                  <div className={`jdm-progress-fill jdm-progress-fill--${effectiveStatus}`} style={{ width: `${progressPct}%` }} />
                </div>
                <span className="jdm-hero-time">{totalMins}m left</span>
              </div>
              <div className="jdm-hero-avatars">
                {assignedVehicles.map((v) => (
                  <button key={v.id} type="button" className={`jdm-hero-vehicle-chip ${v.color}`} onClick={() => onSelectVehicle(v.id)}>
                    <span className="jdm-hero-avatar">
                      <img src="/bobcat-vehicle.png" alt="" />
                    </span>
                    {v.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Subtask list */}
            <div className="jdm-subtasks">
              <div className="jdm-subtasks-header">
                <span className="jdm-subtasks-title">Subtasks <span className="jdm-subtasks-count">{completedCount}/{subtasks.length}</span></span>
                {contextVehicle && (
                  <div className="jdm-subtask-filter-chips">
                    <button type="button" className={`chat-filter-chip${subtaskFilter === 'all' ? ' chat-filter-chip--active' : ''}`} onClick={() => setSubtaskFilter('all')}>All</button>
                    <button type="button" className={`chat-filter-chip${subtaskFilter === contextVehicle.id ? ' chat-filter-chip--active' : ''}`} onClick={() => setSubtaskFilter(contextVehicle.id)}>{contextVehicle.name}</button>
                  </div>
                )}
              </div>
              {filteredSubtasks.length === 0 && <p className="jdm-empty">No subtasks for this machine.</p>}
              {(() => {
                const avatarBg = { idle: 'rgba(122,122,122,0.3)', active: 'rgba(61,212,48,0.25)', paused: 'rgba(239,68,68,0.25)', intervention: 'rgba(234,67,53,0.25)' }
                const hasPhases = filteredSubtasks.some((st) => st.phase != null)
                if (!hasPhases) {
                  // Flat list fallback for jobs without phase data
                  return filteredSubtasks.map((st) => {
                    const assignedIds = st.assignedVehicleIds ?? (st.assignedVehicleId ? [st.assignedVehicleId] : [])
                    const assignedVehicles = assignedIds.map((id) => VEHICLES.find((v) => v.id === id)).filter(Boolean)

                    return <SubtaskCard key={st.id} st={st} effectiveStatus={effectiveSubtaskStatuses[st.id]} assignedVehicles={assignedVehicles} avatarBg={avatarBg} effectiveVehicleStatuses={effectiveVehicleStatuses} />
                  })
                }
                // Phase-grouped display
                const phases = filteredSubtasks.reduce((acc, t) => {
                  const p = t.phase ?? 1
                  const g = acc.find((x) => x.phase === p)
                  if (g) g.tasks.push(t)
                  else acc.push({ phase: p, tasks: [t] })
                  return acc
                }, [])
                return phases.map((group, gIdx) => (
                  <div key={group.phase} className="jdm-phase-group">
                    {gIdx > 0 && (
                      <div className="jdm-phase-divider" aria-hidden>
                        <div className="jdm-phase-divider-line" />
                        <span className="jdm-phase-divider-label">
                          <span className="material-symbols-outlined">arrow_downward</span>
                          then
                        </span>
                        <div className="jdm-phase-divider-line" />
                      </div>
                    )}
                    {group.tasks.length > 1 && (
                      <div className="jdm-phase-parallel-label">
                        <span className="material-symbols-outlined" aria-hidden>compare_arrows</span>
                        Happens simultaneously
                      </div>
                    )}
                    <div className={`jdm-phase-tasks${group.tasks.length > 1 ? ' jdm-phase-tasks--parallel' : ''}`}>
                      {group.tasks.map((st) => {
                        const assignedIds = st.assignedVehicleIds ?? (st.assignedVehicleId ? [st.assignedVehicleId] : [])
                        const assignedVehicles = assignedIds.map((id) => VEHICLES.find((v) => v.id === id)).filter(Boolean)
    
                        return <SubtaskCard key={st.id} st={st} effectiveStatus={effectiveSubtaskStatuses[st.id]} assignedVehicles={assignedVehicles} avatarBg={avatarBg} effectiveVehicleStatuses={effectiveVehicleStatuses} />
                      })}
                    </div>
                  </div>
                ))
              })()}
            </div>

          </div>

          {/* Right — 3D map preview */}
          <div className="jdm-map-col">
            <button type="button" className="jdm-map-close-btn" onClick={onClose} aria-label="Close">
              <span className="material-symbols-outlined">close</span>
            </button>
            <MapPanel
              scene3D={true}
              hasBanner={false}
              readOnly={true}
              initialAzimuth={45}
              initialElevation={28}
              effectiveVehicleStatuses={effectiveVehicleStatuses}
              visibleVehicleIds={job.assignedVehicleIds ?? []}
              terrainVisualizationActive={jobType === 'build-terrain'}
              confirmedResourcePoint={jobType === 'move-resources' ? resourcePoint : null}
              confirmedResourceLabel={jobType === 'move-resources' ? resourceLabel : null}
              confirmedDestinationPoint={jobType !== 'build-terrain' ? destinationPoint : null}
              confirmedDestinationLabel={jobType === 'navigate' ? 'Destination' : 'Drop off'}
              zones={zones}
              zonesVisible={zonesVisible}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
