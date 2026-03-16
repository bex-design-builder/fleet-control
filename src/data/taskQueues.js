export const TASK_QUEUES = {
  mark: [
    { id: 'mark-1', name: 'Level north section',    estimatedMins: 14, progress: 0.62, status: 'interrupted' },
    { id: 'mark-2', name: 'Clear debris zone A',    estimatedMins: 20, status: 'queued' },
    { id: 'mark-3', name: 'Grade access road',      estimatedMins: 35, status: 'queued' },
    { id: 'mark-4', name: 'Compact east boundary',  estimatedMins: 25, status: 'queued' },
  ],
  steve: [
    { id: 'steve-1', name: 'Grade section B',          estimatedMins: 28, progress: 0.35, status: 'active' },
    { id: 'steve-2', name: 'Move materials to zone 3', estimatedMins: 15, status: 'queued' },
    { id: 'steve-3', name: 'Level east perimeter',     estimatedMins: 22, status: 'queued' },
  ],
  bobcat4: [
    { id: 'b4-1', name: 'Excavate foundation pit', estimatedMins: 18, progress: 0.58, status: 'active' },
    { id: 'b4-2', name: 'Remove spoil pile',        estimatedMins: 12, status: 'queued' },
    { id: 'b4-3', name: 'Backfill trench C',        estimatedMins: 30, status: 'queued' },
    { id: 'b4-4', name: 'Compact subgrade',         estimatedMins: 18, status: 'queued' },
  ],
  bobcat6: [
    { id: 'b6-1', name: 'Push through zone 7',  estimatedMins: 11, progress: 0.71, status: 'active' },
    { id: 'b6-2', name: 'Grade parking area',   estimatedMins: 40, status: 'queued' },
    { id: 'b6-3', name: 'Spread gravel layer',  estimatedMins: 28, status: 'queued' },
  ],
  bobcat7: [
    { id: 'b7-1', name: 'Dig service trench',    estimatedMins: 22, progress: 0.45, status: 'interrupted' },
    { id: 'b7-2', name: 'Install pipe segment',  estimatedMins: 15, status: 'queued' },
    { id: 'b7-3', name: 'Backfill and compact',  estimatedMins: 20, status: 'queued' },
  ],
}
