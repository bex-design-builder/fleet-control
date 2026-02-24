/** Initial messages for the "All vehicles" chat */
export const INITIAL_ALL_MESSAGES = [
  {
    id: 1,
    type: 'command',
    mentions: [
      { name: 'Steve the bobcat', pill: 'green' },
      { name: 'Mark the bobcat', pill: 'purple' },
    ],
    body: 'pick up pallets from delivery spot & take to staging area.',
  },
  {
    id: 2,
    type: 'vehicle',
    sender: 'Mark the bobcat',
    color: 'purple',
    body: 'Heading to pick up pallet',
  },
  {
    id: 3,
    type: 'vehicle',
    sender: 'Steve the bobcat',
    color: 'green',
    body: 'Picking up pallet',
  },
  {
    id: 4,
    type: 'vehicle',
    sender: 'Mark the bobcat',
    color: 'purple',
    body: "Can't find a route to pallet. Please unblock to continue.",
    needsIntervention: true,
  },
]

/** Initial messages per vehicle (vehicle view chat) */
export const INITIAL_VEHICLE_MESSAGES = {
  mark: [
    {
      type: 'command',
      mentions: [
        { name: 'Steve the bobcat', pill: 'green' },
        { name: 'Mark the bobcat', pill: 'purple' },
      ],
      body: 'pick up pallets from delivery spot & take to staging area.',
    },
    { type: 'vehicle', body: 'Heading to pick up pallet' },
    { type: 'vehicle', body: 'Picked up pallet and heading to staging area' },
    {
      type: 'vehicle',
      body: "Can't find a safe route to pallet. Please unblock to continue.",
      needsIntervention: true,
    },
  ],
  steve: [
    { type: 'command', mentions: [], body: 'Pick up pallets from delivery spot.' },
    { type: 'vehicle', body: 'Scanning for pallets.' },
    { type: 'vehicle', body: 'Picking up pallet' },
  ],
  bobcat3: [{ type: 'vehicle', body: 'Ready for task' }],
}

export let nextMessageId = 10

export function getNextMessageId() {
  return nextMessageId++
}
