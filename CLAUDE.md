# Bobcat Fleet Control

React + Vite fleet management SPA for controlling autonomous Bobcat vehicles.

## Dev server
```bash
npm run dev       # localhost:5173
npm run share     # expose on local network
```

## Stack
- React 18, Vite 5
- Plain CSS (no Tailwind/CSS-in-JS)
- No routing library — screens are state-driven in App.jsx

## Screens (state-based, not URL-based)
| State | Screen |
|-------|--------|
| `selectedVehicleId = null` | All Vehicles Dashboard (ChatPanel + MapPanel) |
| `selectedVehicleId = <id>` | Vehicle Detail (VehicleBanner + CameraPanel + VehiclesPanel) |
| mobile + `vehicleChatExpanded` | Mobile expanded chat |

## Key state (App.jsx)
- `selectedVehicleId` — which vehicle is active (null = fleet view)
- `leftChatCollapsed` — collapses the all-vehicles chat panel
- `stoppedVehicleIds` — Set of vehicle IDs that are paused
- `vehicleChatExpanded` — mobile: full-screen chat

## Vehicles (src/data/vehicles.js)
- **Mark** (id: 1) — purple, needs intervention
- **Steve** (id: 2) — green, active
- **Bobcat 3** (id: 3) — blue, idle/ready

## Component map
```
App.jsx
├── VehicleBanner       — vehicle name, status, close btn (visible when vehicle selected)
├── CameraPanel         — front/back camera feeds (visible when vehicle selected)
├── ChatPanel           — all-vehicles broadcast chat (left panel)
├── MapPanel            — 2D map with vehicle positions (centre)
└── VehiclesPanel       — individual vehicle chat + stop/resume (right, desktop only)
```

## Responsive
- Mobile breakpoint: `max-width: 768px`
- Desktop: 3-column layout
- Mobile: stacked with MobileTabBar navigation
