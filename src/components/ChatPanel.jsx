import { useState, useRef, useEffect } from 'react'
import MentionInput from './MentionInput'
import { VEHICLES } from '../data/vehicles'
import './ChatPanel.css'

export default function ChatPanel({
  messages = [],
  onSendMessage = () => {},
  isCollapsed = false,
  onExpand = () => {},
  onCollapse = () => {},
}) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = (raw) => {
    onSendMessage(raw)
    setInput('')
  }

  if (isCollapsed) {
    return (
      <aside className="chat-panel chat-panel--collapsed">
        <header className="chat-header">
          <span className="chat-header-spacer" aria-hidden />
          <h2 className="chat-title">All vehicles</h2>
          <button
            type="button"
            className="chat-header-toggle"
            onClick={onExpand}
            aria-label="Expand chat"
          >
            <span className="chat-header-toggle-label">Expand</span>
            <span className="material-symbols-outlined" aria-hidden>collapse_content</span>
          </button>
        </header>
        <div className="chat-collapsed-form">
          <div className="chat-collapsed-input-row chat-collapsed-input-row--mention">
            <MentionInput
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              vehicles={VEHICLES}
              placeholder="Type '@' to select machine"
              className="chat-collapsed-mention-wrap"
              inputClassName="chat-input"
              ariaLabel="Type @ to select machine"
            />
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="chat-panel">
      <header className="chat-header">
        <span className="chat-header-spacer" aria-hidden />
        <h2 className="chat-title">All vehicles</h2>
        <button type="button" className="chat-header-toggle" onClick={onCollapse} aria-label="Collapse chat">
          <span className="chat-header-toggle-label">Collapse</span>
          <span className="material-symbols-outlined" aria-hidden>collapse_content</span>
        </button>
      </header>

      <div className="chat-messages">
        {messages.map((msg) =>
          msg.type === 'command' ? (
            <div key={msg.id} className="message-row message-row-command">
              <div className="message-bubble command-bubble">
                {msg.mentions.map((m) => (
                  <span key={m.name} className={`mention-pill ${m.pill}`}>
                    @{m.name}
                  </span>
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

      <div className="chat-input-wrap chat-input-wrap--mention">
        <MentionInput
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          vehicles={VEHICLES}
          placeholder="Type '@' to select machine"
          className="chat-mention-wrap"
          inputClassName="chat-input"
          ariaLabel="Type @ to select machine"
        />
      </div>
    </aside>
  )
}
