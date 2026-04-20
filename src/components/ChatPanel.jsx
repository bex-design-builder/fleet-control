import { useState, useRef, useEffect } from 'react'
import MentionInput from './MentionInput'
import { VEHICLES } from '../data/vehicles'
import './ChatPanel.css'
import './FleetTaskPanel.css'

const JOB_STATUS_LABEL = { active: 'In progress', blocked: 'Blocked', paused: 'Paused', pending: 'Pending' }
const JOB_STATUS_ORDER = { blocked: 0, active: 1, paused: 2, pending: 3 }

export default function ChatPanel({
  messages = [],
  onSendMessage = () => {},
  selectedVehicle = null,
  effectiveVehicleStatuses = {},
  onNewJob = () => {},
  jobs = [],
  onSelectJob = () => {},
  onReorderJobs = () => {},
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

  const [snapIndex, setSnapIndex] = useState(1) // 0=peek, 1=mid, 2=full
  const [reorderMode, setReorderMode] = useState(false)
  const panelRef = useRef(null)
  const snapIndexRef = useRef(1)
  useEffect(() => { snapIndexRef.current = snapIndex }, [snapIndex])

  const snapHeights = () => {
    const frameH = panelRef.current?.parentElement?.offsetHeight ?? window.innerHeight
    return [72, frameH * 0.45, frameH - 12]
  }

  // Keep --sheet-h CSS var on parent in sync for FAB positioning
  useEffect(() => {
    const panel = panelRef.current
    if (!panel?.parentElement) return
    panel.parentElement.style.setProperty('--sheet-h', `${snapHeights()[snapIndex]}px`)
  })

  const handlePanelTouchStart = (e) => {
    const panel = panelRef.current
    if (!panel) return
    const parentEl = panel.parentElement

    // Detect if touch started on the drag handle (always resize) or content
    const isHandle = !!e.target.closest?.('.chat-drag-handle')

    // Find the nearest scrollable container within the panel
    let scrollEl = null
    if (!isHandle) {
      let node = e.target
      while (node && node !== panel) {
        const s = getComputedStyle(node)
        if (node.scrollHeight > node.clientHeight + 1 &&
            (s.overflowY === 'auto' || s.overflowY === 'scroll')) {
          scrollEl = node
          break
        }
        node = node.parentElement
      }
    }

    const touch = e.touches[0]
    const startY = touch.clientY
    const startH = panel.offsetHeight
    // At peek/mid: any touch on panel resizes. At full: only handle or collapse-from-top.
    const willAlwaysResize = isHandle || snapIndexRef.current < 2
    let resizing = false

    const onMove = (ev) => {
      const t = ev.touches[0]
      const deltaY = t.clientY - startY          // positive = finger down = collapse
      const isAtTop = !scrollEl || scrollEl.scrollTop <= 0
      const shouldResize = willAlwaysResize || (deltaY > 0 && isAtTop)

      if (shouldResize) {
        if (!resizing) {
          resizing = true
          panel.style.transition = 'none'
          parentEl?.classList.add('sheet-dragging')
        }
        const heights = snapHeights()
        const newH = Math.max(heights[0], Math.min(heights[2], startH - deltaY))
        panel.style.height = `${newH}px`
        parentEl?.style.setProperty('--sheet-h', `${newH}px`)
        ev.preventDefault()
      }
    }

    const onEnd = () => {
      parentEl?.classList.remove('sheet-dragging')
      if (resizing) {
        const currentH = panel.offsetHeight
        const heights = snapHeights()
        const idx = heights.reduce((best, h, i) =>
          Math.abs(h - currentH) < Math.abs(heights[best] - currentH) ? i : best, 0)
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

  const jobRows = [...jobs]
    .map((job) => {
      const assignedVehicles = job.assignedVehicleIds
        .map((id) => VEHICLES.find((v) => v.id === id))
        .filter(Boolean)
      return { job, assignedVehicles, effectiveStatus: job.effectiveStatus ?? job.status }
    })
    .filter(({ job }) =>
      selectedVehicle && jobsFilter !== 'all'
        ? job.assignedVehicleIds.includes(selectedVehicle.id)
        : true
    )
    .sort((a, b) => reorderMode ? 0 : (JOB_STATUS_ORDER[a.effectiveStatus] ?? 9) - (JOB_STATUS_ORDER[b.effectiveStatus] ?? 9))
    .map((row, idx) => idx === 0 && row.effectiveStatus !== 'blocked' ? { ...row, effectiveStatus: 'active' } : row)

  const moveJob = (idx, dir) => {
    const ordered = [...jobRows]
    const swap = idx + dir
    if (swap < 0 || swap >= ordered.length) return
    const ids = ordered.map((r) => r.job.id)
    ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
    onReorderJobs(ids)
  }

  const snapClass = snapIndex === 0 ? ' chat-panel--snap-peek' : snapIndex === 2 ? ' chat-panel--snap-full' : ''

  const handleTabClick = (tab) => {
    setActiveTab(tab)
    if (snapIndexRef.current === 0) setSnapIndex(1)
  }

  return (
    <aside ref={panelRef} className={`chat-panel${snapClass}`} onTouchStart={handlePanelTouchStart}>
      <div
        className="chat-drag-handle"
        onClick={() => setSnapIndex((i) => (i + 1) % 3)}
        aria-label="Toggle panel height"
        role="button"
      >
        <div className="chat-drag-pill" />
      </div>
      <header className="chat-header">
        <div className="chat-tabs">
          <button
            type="button"
            className={`chat-tab${activeTab === 'chat' ? ' chat-tab--active' : ''}`}
            onClick={() => handleTabClick('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            className={`chat-tab${activeTab === 'jobs' ? ' chat-tab--active' : ''}`}
            onClick={() => handleTabClick('jobs')}
          >
            Jobs
          </button>
        </div>
        <button type="button" className="ftp-new-job-btn" onClick={() => { if (snapIndexRef.current === 0) setSnapIndex(1); onNewJob() }}>
          <span className="material-symbols-outlined" aria-hidden>add</span>
          New job
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
          ) : (
            <>
              {jobRows.length > 1 && (
                <div className="chat-jobs-toolbar">
                  <button
                    type="button"
                    className={`chat-jobs-reorder-btn${reorderMode ? ' chat-jobs-reorder-btn--active' : ''}`}
                    onClick={() => setReorderMode((m) => !m)}
                  >
                    <span className="material-symbols-outlined" aria-hidden>swap_vert</span>
                    {reorderMode ? 'Done' : 'Reorder'}
                  </button>
                </div>
              )}
              {jobRows.map(({ job, assignedVehicles, effectiveStatus }, idx) => (
                <div
                  key={job.id}
                  className={`ftp-job ftp-job--${effectiveStatus}${!reorderMode ? ' ftp-job--clickable' : ''}`}
                  onClick={!reorderMode ? () => onSelectJob(job.id, selectedVehicle?.id ?? null) : undefined}
                  role={!reorderMode ? 'button' : undefined}
                  tabIndex={!reorderMode ? 0 : undefined}
                  onKeyDown={!reorderMode ? (e) => e.key === 'Enter' && onSelectJob(job.id, selectedVehicle?.id ?? null) : undefined}
                >
                  <div className="ftp-job-top-row">
                    <span className={`ftp-job-status-label ftp-job-status-label--${effectiveStatus}`}>
                      {JOB_STATUS_LABEL[effectiveStatus]}
                    </span>
                    {reorderMode ? (
                      <div className="ftp-job-reorder-arrows">
                        <button type="button" className="ftp-reorder-arrow" disabled={idx === 0} onClick={() => moveJob(idx, -1)} aria-label="Move up">
                          <span className="material-symbols-outlined">arrow_upward</span>
                        </button>
                        <button type="button" className="ftp-reorder-arrow" disabled={idx === jobRows.length - 1} onClick={() => moveJob(idx, 1)} aria-label="Move down">
                          <span className="material-symbols-outlined">arrow_downward</span>
                        </button>
                      </div>
                    ) : (
                      <div className="ftp-job-vehicles">
                        {assignedVehicles.map((v) => (
                          <span key={v.id} className={`ftp-vehicle-avatar ${v.color}`} title={v.name} aria-label={v.name}>
                            <img src="/bobcat-vehicle.png" alt="" />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="ftp-job-name">{job.name}</p>
                  {job.progress != null && !reorderMode && (
                    <div className="ftp-job-progress-row">
                      <div className="ftp-job-bar">
                        <div className={`ftp-job-bar-fill ftp-job-bar-fill--${effectiveStatus}`} style={{ width: `${job.progress * 100}%` }} />
                      </div>
                      <span className="ftp-job-time">{job.estimatedMins}m left</span>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </aside>
  )
}
