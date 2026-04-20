import { VEHICLES } from './vehicles'

/**
 * Compute the effective status of a single subtask given:
 * - the vehicle statuses (intervention / paused / active / idle)
 * - all subtasks in the same job (for phase gating)
 * - a set of vehicle IDs that are already occupied on an active subtask elsewhere
 */
export function getEffectiveSubtaskStatus(subtask, jobSubtasks, effectiveVehicleStatuses, occupiedVehicleIds = new Set()) {
  if (subtask.status === 'complete') return 'complete'

  const assignedIds = subtask.assignedVehicleIds ?? (subtask.assignedVehicleId ? [subtask.assignedVehicleId] : [])
  const vehicleStatuses = assignedIds.map((vid) => effectiveVehicleStatuses[vid] ?? VEHICLES.find((v) => v.id === vid)?.status ?? 'idle')

  // Rule 1 — any assigned vehicle needs intervention → blocked
  if (vehicleStatuses.some((s) => s === 'intervention')) return 'blocked'

  // Rule 2 — any assigned vehicle is paused and task was active → paused
  if (subtask.status === 'active' && vehicleStatuses.some((s) => s === 'paused')) return 'paused'

  // Rule 3 — phase gating: if any earlier phase has incomplete subtasks, this is pending
  const phase = subtask.phase ?? 1
  if (phase > 1) {
    const earlierIncomplete = jobSubtasks.some(
      (s) => (s.phase ?? 1) < phase && s.status !== 'complete'
    )
    if (earlierIncomplete) return 'pending'
  }

  // Rule 4 — assigned vehicle is already active on another subtask → pending
  if (subtask.status === 'active' && assignedIds.some((vid) => occupiedVehicleIds.has(vid))) {
    return 'pending'
  }

  return subtask.status
}

/**
 * Build a map of { subtaskId -> effectiveStatus } across all jobs,
 * respecting cross-job vehicle conflicts.
 */
export function computeAllEffectiveSubtaskStatuses(jobs, effectiveVehicleStatuses) {
  const result = {}
  let activeJobFound = false

  jobs.forEach((job) => {
    const subtasks = job.subtasks ?? []
    const allComplete = subtasks.length > 0 && subtasks.every((st) => st.status === 'complete')

    if (!activeJobFound && !allComplete) {
      // First non-complete job: run normally with full subtask logic
      activeJobFound = true
      const jobOccupied = new Set()
      subtasks.forEach((st) => {
        const effective = getEffectiveSubtaskStatus(st, subtasks, effectiveVehicleStatuses, jobOccupied)
        result[st.id] = effective
        if (effective === 'active') {
          const ids = st.assignedVehicleIds ?? (st.assignedVehicleId ? [st.assignedVehicleId] : [])
          ids.forEach((vid) => jobOccupied.add(vid))
        }
      })
    } else {
      // All subsequent jobs wait — force pending (preserve complete)
      subtasks.forEach((st) => {
        result[st.id] = st.status === 'complete' ? 'complete' : 'pending'
      })
    }
  })

  return result
}

/**
 * Derive the effective job-level status from its subtasks' effective statuses.
 */
export function getEffectiveJobStatus(job, effectiveSubtaskStatuses, effectiveVehicleStatuses) {
  const subtasks = job.subtasks ?? []

  // Fall back to vehicle-level check if no subtasks
  if (subtasks.length === 0) {
    const assignedVehicles = (job.assignedVehicleIds ?? [])
      .map((id) => VEHICLES.find((v) => v.id === id))
      .filter(Boolean)
    const hasBlocked = assignedVehicles.some(
      (v) => (effectiveVehicleStatuses[v.id] ?? v.status) === 'intervention'
    )
    return hasBlocked ? 'blocked' : job.status
  }

  const statuses = subtasks.map((st) => effectiveSubtaskStatuses[st.id] ?? st.status)

  if (statuses.every((s) => s === 'complete')) return 'complete'
  if (statuses.some((s) => s === 'blocked')) return 'blocked'
  if (statuses.some((s) => s === 'active')) return 'active'
  if (statuses.some((s) => s === 'paused')) return 'paused'
  return 'pending'
}
