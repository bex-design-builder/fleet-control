import { useState, useRef, useEffect } from 'react'
import MentionInput from './MentionInput'
import { VEHICLES } from '../data/vehicles'
import './ChatPanel.css'
import './FleetTaskPanel.css'

const JOB_STATUS_LABEL = { active: 'Active', blocked: 'Blocked', paused: 'Paused', pending: 'Pending' }
const JOB_STATUS_ORDER = { blocked: 0, active: 1, paused: 2, pending: 3 }

export default function ChatPanel({
  messages = [],
  onSendMessage = () => {},
  selectedVehicle = null,
  effectiveVehicleStatuses = {},
  onNewJob = () => {},
  jobs = [],
}) {
  const vehiclePrefill = selectedVehicle ? `@${selectedVehicle.name} ` : ''
  const [input, setInput] = useState(vehiclePrefill)
  const [activeTab, setActiveTab] = useState('chat')
  const [chatFilter, setChatFilter] = useState('all')
  const [jobsFilter, setJobsFilter] = useState('all')
  const messagesEndRef = useRef(null)
  const inputEndRef = useRef(null)

  useEffect(() => {
    if (selectedVehicle) {
      setChatFilter(selectedVehicle.id)
      setJobsFilter(selectedVehicle.id)
      const prefill = `@${selectedVehicle.name} `
      setInput(prefill)
      // Move cursor to end after prefill
      requestAnimationFrame(() => {
        const el = inputEndRef.current
        if (el) el.setSelectionRange(prefill.length, prefill.length)
      })
    } else {
      setChatFilter('all')
      setJobsFilter('all')
      setInput('')
    }
  }, [selectedVehicle?.id])

  const displayedMessages = selectedVehicle && chatFilter !== 'all'
    ? messages.filter((msg) => {
        if (msg.type === 'vehicle') return msg.sender === selectedVehicle.name
        if (msg.type === 'command') return msg.mentions?.some((m) => m.name === selectedVehicle.name)
        return false
      })
    : messages

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayedMessages.length])

  const handleSend = (raw) => {
    onSendMessage(raw)
    const prefill = selectedVehicle ? `@${selectedVehicle.name} ` : ''
    setInput(prefill)
    requestAnimationFrame(() => {
      const el = inputEndRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(prefill.length, prefill.length)
      }
    })
  }

  const jobRows = [...jobs]
    .map((job) => {
      const assignedVehicles = job.assignedVehicleIds
        .map((id) => VEHICLES.find((v) => v.id === id))
        .filter(Boolean)
      const hasBlocked = assignedVehicles.some(
        (v) => (effectiveVehicleStatuses[v.id] ?? v.status) === 'intervention'
      )
      return { job, assignedVehicles, effectiveStatus: hasBlocked ? 'blocked' : job.status }
    })
    .filter(({ job }) =>
      selectedVehicle && jobsFilter !== 'all'
        ? job.assignedVehicleIds.includes(selectedVehicle.id)
        : true
    )
    .sort((a, b) => (JOB_STATUS_ORDER[a.effectiveStatus] ?? 9) - (JOB_STATUS_ORDER[b.effectiveStatus] ?? 9))

  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={`chat-panel${collapsed ? ' chat-panel--collapsed' : ''}`}>
      <header className="chat-header">
        <div className="chat-tabs">
          <button
            type="button"
            className={`chat-tab${activeTab === 'chat' ? ' chat-tab--active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            className={`chat-tab${activeTab === 'jobs' ? ' chat-tab--active' : ''}`}
            onClick={() => setActiveTab('jobs')}
          >
            Jobs
          </button>
        </div>
        <button type="button" className="ftp-new-job-btn" onClick={onNewJob}>
          <span className="material-symbols-outlined" aria-hidden>add</span>
          New job
        </button>
        <button
          type="button"
          className="chat-mobile-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand chat panel' : 'Collapse chat panel'}
        >
          <span className="material-symbols-outlined" aria-hidden>
            {collapsed ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      </header>

      {selectedVehicle && activeTab === 'chat' && (
        <div className="chat-filter-bar">
          <button type="button" className={`chat-filter-chip${chatFilter === 'all' ? ' chat-filter-chip--active' : ''}`} onClick={() => setChatFilter('all')}>All</button>
          <button type="button" className={`chat-filter-chip${chatFilter === selectedVehicle.id ? ' chat-filter-chip--active' : ''}`} onClick={() => setChatFilter(selectedVehicle.id)}>{selectedVehicle.name}</button>
        </div>
      )}
      {selectedVehicle && activeTab === 'jobs' && (
        <div className="chat-filter-bar">
          <button type="button" className={`chat-filter-chip${jobsFilter === 'all' ? ' chat-filter-chip--active' : ''}`} onClick={() => setJobsFilter('all')}>All</button>
          <button type="button" className={`chat-filter-chip${jobsFilter === selectedVehicle.id ? ' chat-filter-chip--active' : ''}`} onClick={() => setJobsFilter(selectedVehicle.id)}>{selectedVehicle.name}</button>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="chat-messages">
          {displayedMessages.map((msg) =>
            msg.type === 'command' ? (
              <div key={msg.id} className="message-row message-row-command">
                <div className="message-bubble command-bubble">
                  {msg.mentions.map((m) => (
                    <span key={m.name} className={`mention-pill ${m.pill}`}>@{m.name}</span>
                  ))}{' '}
                  <span className="command-body">{msg.body}</span>
                </div>
              </div>
            ) : (
              <div key={msg.id} className={`message-row message-row-vehicle ${msg.needsIntervention ? 'needs-intervention' : ''}`}>
                <div className={`chat-avatar ${msg.color}`}>
                  <img src="/bobcat-vehicle.png" alt="" className="chat-avatar-img" />
                </div>
                <div className="vehicle-message-content">
                  <div className="vehicle-message-header">
                    <span className={`vehicle-sender-name ${msg.color}`}>{msg.sender}</span>
                  </div>
                  <div className={`message-bubble vehicle-bubble ${msg.needsIntervention ? 'needs-intervention' : ''}`}>
                    {msg.body}
                  </div>
                </div>
              </div>
            )
          )}
          <div ref={messagesEndRef} aria-hidden />
        </div>
      )}

      {/* Input always in DOM — hidden on Jobs tab when expanded, always shown when collapsed */}
      <div className={`chat-input-wrap chat-input-wrap--mention${activeTab === 'jobs' ? ' chat-input-wrap--jobs-tab' : ''}`}>
        <MentionInput
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          vehicles={VEHICLES}
          placeholder="Type '@' to select machine"
          className="chat-mention-wrap"
          inputClassName="chat-input"
          ariaLabel="Type @ to select machine"
          defaultMentionName={selectedVehicle?.name ?? null}
          textareaRef={inputEndRef}
        />
      </div>

      {activeTab === 'jobs' && (
        <div className="chat-jobs-list">
          {jobRows.length === 0 ? (
            <p className="chat-jobs-empty">
              No jobs{selectedVehicle && jobsFilter !== 'all' ? ` assigned to ${selectedVehicle.name}` : ''}
            </p>
          ) : jobRows.map(({ job, assignedVehicles, effectiveStatus }) => (
            <div key={job.id} className={`ftp-job ftp-job--${effectiveStatus}`}>
              <div className="ftp-job-top-row">
                <span className={`ftp-job-status-label ftp-job-status-label--${effectiveStatus}`}>
                  {JOB_STATUS_LABEL[effectiveStatus]}
                </span>
                <div className="ftp-job-vehicles">
                  {assignedVehicles.map((v) => (
                    <span key={v.id} className={`ftp-vehicle-avatar ${v.color}`} title={v.name} aria-label={v.name}>
                      <img src="/bobcat-vehicle.png" alt="" />
                    </span>
                  ))}
                </div>
              </div>
              <p className="ftp-job-name">{job.name}</p>
              {job.progress != null && (
                <div className="ftp-job-progress-row">
                  <div className="ftp-job-bar">
                    <div className={`ftp-job-bar-fill ftp-job-bar-fill--${effectiveStatus}`} style={{ width: `${job.progress * 100}%` }} />
                  </div>
                  <span className="ftp-job-time">{job.estimatedMins}m left</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
