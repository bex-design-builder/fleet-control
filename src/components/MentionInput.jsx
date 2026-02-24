import { useState, useRef, useEffect } from 'react'
import './MentionInput.css'

function parseMentionSegments(value, vehicles) {
  if (!value || !vehicles?.length) return value ? [{ type: 'text', value }] : []
  const matches = []
  for (const v of vehicles) {
    const needle = '@' + v.name
    let pos = 0
    while (true) {
      const i = value.indexOf(needle, pos)
      if (i === -1) break
      matches.push({ start: i, end: i + needle.length, vehicle: v })
      pos = i + 1
    }
  }
  matches.sort((a, b) => a.start - b.start)
  const nonOverlap = []
  for (const m of matches) {
    if (nonOverlap.length && m.start < nonOverlap[nonOverlap.length - 1].end) continue
    nonOverlap.push(m)
  }
  const segments = []
  let last = 0
  for (const m of nonOverlap) {
    if (m.start > last) segments.push({ type: 'text', value: value.slice(last, m.start) })
    segments.push({ type: 'mention', name: m.vehicle.name, color: m.vehicle.color })
    last = m.end
  }
  if (last < value.length) segments.push({ type: 'text', value: value.slice(last) })
  return segments.length ? segments : [{ type: 'text', value }]
}

export function parseMentionsAndBody(value, vehicles) {
  const mentions = []
  const matches = []
  for (const v of vehicles || []) {
    const needle = '@' + v.name
    let pos = 0
    while (true) {
      const idx = value.indexOf(needle, pos)
      if (idx === -1) break
      matches.push({ start: idx, end: idx + needle.length, vehicle: v })
      pos = idx + 1
    }
  }
  matches.sort((a, b) => a.start - b.start)
  const nonOverlap = []
  for (const m of matches) {
    if (nonOverlap.length && m.start < nonOverlap[nonOverlap.length - 1].end) continue
    nonOverlap.push(m)
  }
  for (const m of nonOverlap) mentions.push({ name: m.vehicle.name, pill: m.vehicle.color })
  let body = value
  for (const m of nonOverlap.slice().reverse()) {
    body = body.slice(0, m.start) + body.slice(m.end)
  }
  body = body.replace(/\s+/g, ' ').trim()
  return { mentions, body }
}

export default function MentionInput({
  value,
  onChange,
  onSubmit,
  vehicles = [],
  placeholder = "Type '@' to select machine",
  className = '',
  inputClassName = 'chat-input',
  ariaLabel = "Type @ to select machine",
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [mentionStart, setMentionStart] = useState(-1)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)

  const segments = parseMentionSegments(value, vehicles)
  const query = mentionStart >= 0 ? value.slice(mentionStart + 1) : ''
  const matches = vehicles.filter((v) =>
    v.name.toLowerCase().startsWith(query.toLowerCase())
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!showDropdown) return
    const onKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % Math.max(1, matches.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0))
      } else if (e.key === 'Enter' && showDropdown && matches.length) {
        e.preventDefault()
        handleSelectVehicle(matches[selectedIndex])
      } else if (e.key === 'Escape') {
        setShowDropdown(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showDropdown, matches, selectedIndex])

  const handleChange = (e) => {
    const v = e.target.value
    const cursor = e.target.selectionStart ?? v.length
    onChange(v)

    const atIdx = v.lastIndexOf('@', cursor - 1)
    const spaceAfterAt = atIdx >= 0 && v.slice(atIdx, cursor).includes(' ')
    if (atIdx >= 0 && !spaceAfterAt) {
      setMentionStart(atIdx)
      setShowDropdown(true)
    } else {
      setShowDropdown(false)
    }
  }

  const handleSelectVehicle = (vehicle) => {
    const input = inputRef.current
    const start = mentionStart
    const end = input ? input.selectionStart : value.length
    const before = value.slice(0, start)
    const after = value.slice(end)
    const insert = '@' + vehicle.name + (after.startsWith(' ') ? '' : ' ')
    const next = before + insert + after
    onChange(next)
    setShowDropdown(false)
    setMentionStart(-1)
    requestAnimationFrame(() => {
      if (input) {
        const pos = start + insert.length
        input.focus()
        input.setSelectionRange(pos, pos)
      }
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (value.trim()) {
      onSubmit(value.trim())
    }
  }

  return (
    <form className={`mention-input-wrap ${className}`.trim()} onSubmit={handleSubmit}>
      <div className="mention-input-container">
        <div className="mention-input-overlay" aria-hidden>
          {segments.map((seg, i) =>
            seg.type === 'text' ? (
              <span key={i}>{seg.value || '\u200b'}</span>
            ) : (
              <span key={i} className={`mention-pill mention-pill-inline ${seg.color}`}>
                @{seg.name}
              </span>
            )
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          className={`mention-input ${inputClassName}`}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onSelect={(e) => {
            const cursor = e.target.selectionStart
            const atIdx = value.lastIndexOf('@', cursor - 1)
            const spaceAfterAt = atIdx >= 0 && value.slice(atIdx, cursor).includes(' ')
            if (atIdx >= 0 && !spaceAfterAt) {
              setMentionStart(atIdx)
              setShowDropdown(true)
            } else {
              setShowDropdown(false)
            }
          }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          aria-label={ariaLabel}
        />
      </div>
      {showDropdown && matches.length > 0 && (
        <div className="mention-dropdown" role="listbox">
          {matches.map((v, i) => (
            <button
              key={v.id}
              type="button"
              role="option"
              aria-selected={i === selectedIndex}
              className={`mention-dropdown-item ${i === selectedIndex ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelectVehicle(v)
              }}
            >
              <span className={`mention-dropdown-avatar ${v.color}`} />
              {v.name}
            </button>
          ))}
        </div>
      )}
      <button type="submit" className="send-btn" aria-label="Send">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </form>
  )
}
