/** Initial messages for the "All vehicles" chat */
export const INITIAL_ALL_MESSAGES = []

/** Initial messages per vehicle (vehicle view chat) */
export const INITIAL_VEHICLE_MESSAGES = {}

export let nextMessageId = 10

export function getNextMessageId() {
  return nextMessageId++
}
