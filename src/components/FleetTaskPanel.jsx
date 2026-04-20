import { VEHICLES } from '../data/vehicles'
import { JOBS } from '../data/jobs'
import './FleetTaskPanel.css'

const STATUS_LABEL = {
  active:  'In progress',
  blocked: 'Blocked',
  paused:  'Paused',
  pending: 'Pending',
}

const STATUS_ORDER = { blocked: 0, active: 1, paused: 2, pending: 3 }

export default function FleetTaskPanel({ effectiveVehicleStatuses = {}, onNewJob, collapsed = true, onToggle }) {

  return (
    <div className={`fleet-task-panel${collapsed ? ' fleet-task-panel--collapsed' : ''}`}>
      <div className="ftp-header">
        <button type="button" className="ftp-collapse-btn" onClick={onToggle} aria-label={collapsed ? 'Expand jobs' : 'Collapse jobs'}>
          <span className="material-symbols-outlined ftp-collapse-icon" aria-hidden>{collapsed ? 'expand_more' : 'expand_less'}</span>
        </button>
        <span className="ftp-title">Jobs</span>
        <span className="ftp-count">{JOBS.length}</span>
        <button type="button" className="ftp-new-job-btn" onClick={onNewJob}>
          <span className="material-symbols-outlined" aria-hidden>add</span>
          New job
        </button>
      </div>

      {!collapsed && <div className="ftp-list">
        {[...JOBS]
          .map((job) => {
            const assignedVehicles = job.assignedVehicleIds
              .map((id) => VEHICLES.find((v) => v.id === id))
              .filter(Boolean)
            const hasBlocked = assignedVehicles.some(
              (v) => (effectiveVehicleStatuses[v.id] ?? v.status) === 'intervention'
            )
            return { job, assignedVehicles, effectiveStatus: hasBlocked ? 'blocked' : job.status }
          })
          .sort((a, b) => (STATUS_ORDER[a.effectiveStatus] ?? 9) - (STATUS_ORDER[b.effectiveStatus] ?? 9))
          .map(({ job, assignedVehicles, effectiveStatus }) => {
          return (
            <div key={job.id} className={`ftp-job ftp-job--${effectiveStatus}`}>
              <span className={`ftp-job-status-label ftp-job-status-label--${effectiveStatus}`}>
                {STATUS_LABEL[effectiveStatus]}
              </span>
              <p className="ftp-job-name">{job.name}</p>

              {job.progress != null && (
                <div className="ftp-job-progress-row">
                  <div className="ftp-job-bar">
                    <div
                      className={`ftp-job-bar-fill ftp-job-bar-fill--${effectiveStatus}`}
                      style={{ width: `${job.progress * 100}%` }}
                    />
                  </div>
                  <span className="ftp-job-time">{job.estimatedMins}m left</span>
                </div>
              )}

              <div className="ftp-job-vehicles">
                {assignedVehicles.map((v) => (
                  <span key={v.id} className={`ftp-vehicle-avatar ${v.color}`} title={v.name} aria-label={v.name}>
                    <img src="/bobcat-vehicle.png" alt="" />
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>}
    </div>
  )
}
