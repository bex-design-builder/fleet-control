/**
 * Autonomous machine chat response engine.
 * Intent detection → per-vehicle response bank → randomised pick.
 */

const INTENTS = [
  { key: 'stop',    match: /\b(stop|halt|pause|hold|freeze|abort|kill)\b/i },
  { key: 'resume',  match: /\b(resume|continue|proceed|go|start|carry on|move on)\b/i },
  { key: 'status',  match: /\b(status|update|where|report|position|location|what are you|how far|eta|progress)\b/i },
  { key: 'pickup',  match: /\b(pick.?up|collect|grab|load|retrieve|fetch)\b/i },
  { key: 'deliver', match: /\b(deliver|drop|unload|place|bring|deposit|transfer)\b/i },
  { key: 'move',    match: /\b(move|go to|navigate|head|drive|route|get to)\b/i },
  { key: 'scan',    match: /\b(scan|check|inspect|survey|assess|monitor|look)\b/i },
  { key: 'clear',   match: /\b(clear|unblock|obstacle.?removed|path.?clear|route.?clear|moved it|all good)\b/i },
]

const RESPONSES = {
  // ── Mark: blocked, needs intervention ─────────────────────────────────────
  mark: {
    stop: [
      'Stopping. Task suspended at current position.',
      'Safe stop engaged. Holding at waypoint 3.',
      'Halted. Awaiting instruction.',
    ],
    resume: [
      'Path still obstructed. Cannot proceed — manual clearance needed.',
      'Attempting alternate route. Obstacle still detected on primary path.',
      'Re-scanning route. Blockage confirmed at grid 4-C.',
    ],
    status: [
      'Blocked at waypoint 3. Obstacle on planned route to pallet.',
      'Holding position. Last task: pallet retrieval, delivery zone A.',
      'Intervention required. Cannot find safe route. Sensors nominal.',
    ],
    pickup: [
      'Pickup queued — path to pallet blocked. Clear obstacle to proceed.',
      'Cannot reach pickup point. Obstruction at grid 4-C.',
    ],
    deliver: [
      'Delivery task received. Route blocked — awaiting clearance.',
      'Cannot navigate to drop zone. Manual intervention required first.',
    ],
    move: [
      'Navigation blocked. Obstacle on planned route.',
      'Cannot execute — path obstructed. Requesting manual clearance.',
    ],
    scan: [
      'Scanning area around waypoint 3. Obstacle confirmed.',
      'Sensor sweep complete. Blockage at grid 4-C, approximately 1.2m.',
    ],
    clear: [
      'Obstacle clear confirmed. Resuming route to pallet.',
      'Path clear. Proceeding to delivery zone A.',
      'Route re-acquired. Heading to pallet pickup.',
    ],
    default: [
      'Acknowledged. Still blocked — intervention required.',
      'Command received. Cannot execute until path is cleared.',
      'Standing by. Waiting for route clearance.',
      'Copy. Holding position at waypoint 3.',
    ],
  },

  // ── Steve: active, mid-task ────────────────────────────────────────────────
  steve: {
    stop: [
      'Stopping. Pallet secured at current position.',
      'Halted. Task paused.',
      'Safe stop. Standing by.',
    ],
    resume: [
      'Resuming. Continuing to staging area.',
      'Back on route. ETA staging zone: ~90s.',
      'Task resumed. Carrying pallet to zone B.',
    ],
    status: [
      'En route to staging area. Pallet loaded. 60% complete.',
      'Active. Transporting pallet — no obstacles detected.',
      'Approaching staging zone. Path clear. ETA 2 min.',
    ],
    pickup: [
      'Moving to pickup point. Forks engaged.',
      'Pallet detected. Initiating pickup sequence.',
      'Scanning load at pickup zone.',
    ],
    deliver: [
      'Delivery in progress. Navigating to drop zone.',
      'En route to drop point. ETA 90s.',
    ],
    move: [
      'Acknowledged. Updating route.',
      'Navigating to target. Path clear.',
      'On it.',
    ],
    scan: [
      'Scanning area. No obstacles detected.',
      'Survey complete. Zone is clear.',
    ],
    clear: [
      'Copy. Continuing current task.',
      'Confirmed. Proceeding.',
    ],
    default: [
      'Acknowledged.',
      'Copy that. On it.',
      'Confirmed. Executing.',
      'Understood. Proceeding.',
      'Copy.',
    ],
  },

  // ── Bobcat 3: idle, ready to deploy ───────────────────────────────────────
  bobcat3: {
    stop: [
      'Stopped. Idle at bay.',
      'Halted. Standing by.',
    ],
    resume: [
      'Ready to proceed. Send target coordinates.',
      'Standing by. Awaiting task assignment.',
    ],
    status: [
      'Idle. Battery 100%. Ready for deployment.',
      'Standby mode. No active task. Awaiting instructions.',
      'Systems nominal. Docked at charging bay. Ready.',
    ],
    pickup: [
      'Moving to pickup location. Forks down.',
      'En route to pickup. Ready to load.',
      'Copy. Heading to pickup zone.',
    ],
    deliver: [
      'Ready to deliver. Send drop zone coordinates.',
      'Navigating to delivery point.',
      'Confirmed. En route to drop zone.',
    ],
    move: [
      'Moving to target. Path clear.',
      'Acknowledged. Navigating now.',
      'Copy. On my way.',
    ],
    scan: [
      'Initiating scan. 360° coverage active.',
      'Scanning zone. Area is clear.',
    ],
    clear: [
      'Confirmed. Ready for next task.',
      'Copy. Standing by.',
    ],
    default: [
      'Ready.',
      'Acknowledged. Standing by.',
      'Copy. Awaiting task.',
      'Confirmed. Ready to deploy.',
      'Standing by.',
    ],
  },

  // ── Bobcat 4: active, grading run ─────────────────────────────────────────
  bobcat4: {
    stop: [
      'Stopping. Blade raised, holding position.',
      'Safe stop. Grading paused at current pass.',
      'Halted. Awaiting further instruction.',
    ],
    resume: [
      'Resuming grading pass. ETA end of run: ~2 min.',
      'Back on track. Continuing grade profile.',
      'Task resumed. Maintaining slope angle.',
    ],
    status: [
      'Active. Grading north section. Pass 3 of 5.',
      'Grading in progress. 55% complete. No issues detected.',
      'On second pass. Blade at -2° pitch. Path clear.',
    ],
    pickup: [ 'Acknowledged. Heading to pickup after current pass.', 'Completing this run first, then moving to pickup zone.' ],
    deliver: [ 'Navigating to drop zone after current pass.', 'On it. Will divert once grading run is complete.' ],
    move: [ 'Updating route. Adjusting path.', 'Moving to target. Blade retracted.' ],
    scan: [ 'Scanning work zone. Grade looks nominal.', 'Survey sweep active. No anomalies detected.' ],
    clear: [ 'Copy. Continuing grading.', 'Confirmed. Proceeding on current pass.' ],
    default: [ 'Acknowledged.', 'Copy. Proceeding.', 'Confirmed.', 'Understood. On it.', 'Copy.' ],
  },

  // ── Bobcat 5: idle, standby ────────────────────────────────────────────────
  bobcat5: {
    stop: [ 'Already stationary. Holding at bay.', 'Stopped. Standing by.' ],
    resume: [ 'Ready to go. Awaiting coordinates.', 'Standing by. Send task assignment.' ],
    status: [
      'Idle. Fully charged. Ready to deploy.',
      'Standby at bay 2. All systems nominal.',
      'No active task. Battery 98%. Available.',
    ],
    pickup: [ 'Moving to pickup zone. Forks engaged.', 'En route to load point. ETA 45s.' ],
    deliver: [ 'Ready to deliver. Send drop zone.', 'Confirmed. Heading to delivery point.' ],
    move: [ 'Moving to target. Path clear.', 'On my way.', 'Copy. Navigating.' ],
    scan: [ 'Scanning zone. All clear.', 'Initiating 360° survey.' ],
    clear: [ 'Confirmed. Ready.', 'Copy. Standing by for next task.' ],
    default: [ 'Ready.', 'Acknowledged.', 'Copy. Awaiting task.', 'Standing by.', 'Confirmed.' ],
  },

  // ── Bobcat 6: active, material transport ──────────────────────────────────
  bobcat6: {
    stop: [
      'Stopping. Load secured.',
      'Halted mid-transport. Holding position.',
      'Safe stop engaged.',
    ],
    resume: [
      'Resuming transport. Heading to drop zone.',
      'Back on route. Load stable.',
      'Task resumed. ETA drop zone: 75s.',
    ],
    status: [
      'Transporting material to zone C. Load weight nominal.',
      'Active. 70% of route complete. No obstacles.',
      'En route. Carrying aggregate — passing waypoint 5.',
    ],
    pickup: [ 'Picking up next load after drop.', 'Will queue pickup once delivery is complete.' ],
    deliver: [ 'Delivery in progress. Approaching drop zone.', 'En route. Dropping at zone C.' ],
    move: [ 'Rerouting. Load on board.', 'Adjusting course.' ],
    scan: [ 'Quick scan — route ahead is clear.', 'No obstacles detected on path.' ],
    clear: [ 'Copy. Continuing delivery.', 'Confirmed. On track.' ],
    default: [ 'Acknowledged.', 'Copy.', 'Understood.', 'On it.', 'Confirmed.' ],
  },

  // ── Bobcat 7: blocked, needs intervention ─────────────────────────────────
  bobcat7: {
    stop: [
      'Already stopped. Waiting for clearance.',
      'Halted at grid 7-A. Obstacle unresolved.',
    ],
    resume: [
      'Cannot proceed. Ramp debris blocking south exit.',
      'Attempting reroute — all alternate paths obstructed.',
      'Sensors show blockage at 3 o\'clock. Manual removal needed.',
    ],
    status: [
      'Blocked at loading ramp. Debris on south exit path.',
      'Intervention required. Obstacle at grid 7-A confirmed.',
      'Holding. Ramp exit is impassable. Awaiting clearance.',
    ],
    pickup: [ 'Pickup queued — ramp exit blocked. Clear path first.', 'Cannot reach pickup point. Obstruction persists.' ],
    deliver: [ 'Delivery queued. Route to drop zone is blocked.', 'Cannot execute — south exit obstructed.' ],
    move: [ 'Movement blocked. Ramp debris at grid 7-A.', 'Cannot navigate. Requesting manual clearance.' ],
    scan: [ 'Scanning ramp area. Debris confirmed — approx. 2m wide.', 'Obstacle map updated. Three blocked approaches.' ],
    clear: [
      'Path clear confirmed. Resuming route.',
      'Ramp clear. Heading to assigned task.',
      'Debris removed. Back on route.',
    ],
    default: [
      'Acknowledged. Still blocked — clearance needed.',
      'Command received. Cannot execute until ramp is clear.',
      'Holding at grid 7-A. Awaiting manual intervention.',
      'Copy. Waiting for route clearance.',
    ],
  },

  // ── Bobcat 8: idle, standby ────────────────────────────────────────────────
  bobcat8: {
    stop: [ 'Stopped. Idle at bay 4.', 'Halted. Standing by.' ],
    resume: [ 'Ready. Send task.', 'Awaiting assignment. Standing by.' ],
    status: [
      'Idle at bay 4. Battery 100%. Ready.',
      'No active task. All systems nominal. Available.',
      'Standby mode. Docked and charging. Ready to deploy.',
    ],
    pickup: [ 'Moving to pickup point.', 'En route to load. Forks down.', 'Copy. Heading to pickup zone.' ],
    deliver: [ 'Confirmed. En route to drop zone.', 'Navigating to delivery point.' ],
    move: [ 'Moving to target.', 'Acknowledged. On my way.', 'Copy.' ],
    scan: [ 'Scanning zone. Clear.', 'Survey active. No anomalies.' ],
    clear: [ 'Confirmed. Ready for task.', 'Copy. Standing by.' ],
    default: [ 'Ready.', 'Acknowledged.', 'Standing by.', 'Copy.', 'Confirmed.' ],
  },
}

export function detectIntent(body) {
  for (const { key, match } of INTENTS) {
    if (match.test(body)) return key
  }
  return 'default'
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Returns a response string for the given vehicle and command body, or null if unknown vehicle. */
export function getMachineResponse(vehicle, commandBody) {
  const bank = RESPONSES[vehicle.id]
  if (!bank) return null
  const intent = detectIntent(commandBody)
  const pool = bank[intent] ?? bank.default
  return pick(pool)
}

/** Randomised realistic typing delay: 700–1800ms */
export function getResponseDelay() {
  return 700 + Math.floor(Math.random() * 1100)
}
