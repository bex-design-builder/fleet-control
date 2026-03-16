import { useEffect } from 'react'

/**
 * Scrolls the element tied to messagesEndRef into view when the messages list length changes.
 * Use with a ref attached to a sentinel element at the end of the messages container.
 */
export function useScrollToMessagesEnd(messagesEndRef, messagesLength) {
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messagesLength])
}
