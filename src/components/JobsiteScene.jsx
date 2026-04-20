import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { VEHICLES as DATA_VEHICLES } from '../data/vehicles'

const RADIUS_BASE = 70
const STATUS_LABELS = {
  intervention: 'Needs help',
  active:       'Working',
  paused:       'Paused',
  idle:         'Idle',
}

const STATUS_COLORS = {
  intervention: '#ea4335',
  active:       '#3dd430',
  paused:       '#ef4444',
  idle:         'rgba(255,255,255,0.35)',
}

const STATUS_RING_COLORS = {
  intervention: 0xea4335,
  active:       0x3dd430,
  paused:       0xef4444,
  idle:         0x7a7a7a,
}

const STATUS_LABEL_BG = {
  intervention: 'rgba(234, 67, 53,  0.35)',
  active:       'rgba( 61,212, 48,  0.28)',
  paused:       'rgba(239, 68, 68,  0.32)',
  idle:         'rgba(122,122,122,  0.28)',
}

// World positions for each bobcat (derived from their % map positions)
const BOBCAT_PLACEMENTS = {
  mark:    { x: -10, z:  -5, ringColor: 0x8ea0d8, ry:  1.2 },
  steve:   { x:   4, z: -13, ringColor: 0xd09a58, ry:  2.8 },
  bobcat3: { x: -17, z: -14, ringColor: 0x6eb4ca, ry: -0.8 },
}

// How far to shift the look-at point left in camera-space when a vehicle is selected,
// so the vehicle appears in the unobstructed right portion of the map.
const SELECT_LATERAL_OFFSET = 8

// ── Scene helpers ──────────────────────────────────────────────────────────────

function mkMesh(geo, mat, x, y, z, ry) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  if (ry) m.rotation.y = ry
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ── Tree ───────────────────────────────────────────────────────────────────────
// Simple low-poly pine: stacked cones + cylindrical trunk, seeded via rng param
function addTree(scene, x, z, rng) {
  const s      = 0.82 + rng() * 0.55          // overall scale
  const trunkH = (1.6 + rng() * 0.8) * s
  const layers = 2 + Math.floor(rng() * 2)    // 2–3 cone layers
  const baseR  = (1.1 + rng() * 0.7) * s
  const layerH = (2.8 + rng() * 1.4) * s

  const hue    = 0.30 + rng() * 0.07          // green hue range
  const mTrunk = new THREE.MeshLambertMaterial({ color: 0x4a2e10 })
  const mLeaf  = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.55, 0.20 + rng() * 0.08) })

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.20 * s, trunkH, 5), mTrunk)
  trunk.position.set(x, trunkH / 2, z)
  trunk.castShadow = true
  scene.add(trunk)

  for (let i = 0; i < layers; i++) {
    const r = baseR * (1 - i * 0.18)
    const h = layerH * (1 - i * 0.15)
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mLeaf)
    cone.position.set(x, trunkH + (i * layerH * 0.45) + h * 0.3, z)
    cone.castShadow = true
    scene.add(cone)
  }
}

// Plant a row of trees along one edge with random jitter
function plantTreeRow(scene, positions, rng) {
  positions.forEach(([x, z]) => addTree(scene, x + (rng() - 0.5) * 2.5, z + (rng() - 0.5) * 2.5, rng))
}

// ── Bobcat CTL ─────────────────────────────────────────────────────────────────
// Returns { group, meshes[], ring, halo }

function addBobcat(scene, x, z, ringColor, ry = 0) {
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.rotation.y = ry

  const mBody  = new THREE.MeshLambertMaterial({ color: 0xd47c0a })
  const mCab   = new THREE.MeshLambertMaterial({ color: 0xb06008 })
  const mTrack = new THREE.MeshLambertMaterial({ color: 0x1e1e1e })
  const mGlass = new THREE.MeshLambertMaterial({ color: 0x3a5570, transparent: true, opacity: 0.72 })
  const mArm   = new THREE.MeshLambertMaterial({ color: 0x111111 })
  const mBkt   = new THREE.MeshLambertMaterial({ color: 0x2a2a2a })

  for (const tx of [-1.22, 1.22]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.48, 3.7), mTrack)
    t.position.set(tx, 0.24, 0)
    t.castShadow = true
    t.userData.vehiclePart = 'track'
    group.add(t)
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.35, 3.0), mBody)
  body.position.set(0, 1.17, 0)
  body.castShadow = true
  body.userData.vehiclePart = 'body'
  group.add(body)

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.55, 1.75), mCab)
  cab.position.set(0, 2.63, -0.38)
  cab.castShadow = true
  cab.userData.vehiclePart = 'cab'
  group.add(cab)

  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 0.07), mGlass)
  glass.position.set(0, 2.63, 0.49)
  glass.userData.vehiclePart = 'glass'
  group.add(glass)

  for (const ax of [-0.9, 0.9]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 2.3), mArm)
    arm.position.set(ax, 2.25, 0.9)
    arm.rotation.x = -0.36
    arm.castShadow = true
    arm.userData.vehiclePart = 'arm'
    group.add(arm)
  }

  const bkt = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.48, 0.65), mBkt)
  bkt.position.set(0, 0.78, 1.75)
  bkt.castShadow = true
  bkt.userData.vehiclePart = 'bucket'
  group.add(bkt)

  scene.add(group)

  // Collect all meshes in group for raycasting
  const meshes = []
  group.traverse(obj => { if (obj.isMesh) meshes.push(obj) })

  // Status ring — 3D torus tube with metallic + emissive glow
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.13, 24, 90),
    new THREE.MeshStandardMaterial({
      color: ringColor, emissive: ringColor, emissiveIntensity: 0.55,
      metalness: 0.7, roughness: 0.18,
      transparent: true, opacity: 0.95, depthTest: false,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.set(x, 0.15, z)

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(3.55, 5.8, 80),
    new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.06, depthTest: false }),
  )
  halo.rotation.x = -Math.PI / 2
  halo.position.set(x, 0.05, z)

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(3.1, 64),
    new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.04, depthTest: false }),
  )
  disc.rotation.x = -Math.PI / 2
  disc.position.set(x, 0.03, z)

  return { group, meshes, ring, halo, disc }
}

// ── Excavator ──────────────────────────────────────────────────────────────────

function addExcavator(scene, x, z, ry = 0) {
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.rotation.y = ry

  const mYel  = new THREE.MeshLambertMaterial({ color: 0xf0a500 })
  const mYelD = new THREE.MeshLambertMaterial({ color: 0xc88800 })
  const mDark = new THREE.MeshLambertMaterial({ color: 0x1c1c1c })
  const mGray = new THREE.MeshLambertMaterial({ color: 0x484848 })
  const mGls  = new THREE.MeshLambertMaterial({ color: 0x3a5570, transparent: true, opacity: 0.75 })

  const under = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.5, 5.1), mGray)
  under.position.set(0, 0.25, 0)
  under.castShadow = true
  group.add(under)

  for (const tx of [-1.65, 1.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.62, 5.5), mDark)
    t.position.set(tx, 0.31, 0)
    t.castShadow = true
    group.add(t)
  }

  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 24), mGray)
  pivot.position.set(0, 0.6, 0)
  group.add(pivot)

  const house = new THREE.Group()
  house.position.set(0, 0.7, 0)
  house.rotation.y = 0.35

  const upper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.35, 2.9), mYel)
  upper.position.set(0, 0.68, 0)
  upper.castShadow = true
  house.add(upper)

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.48, 1.48), mYel)
  cab.position.set(-0.5, 1.82, -0.45)
  cab.castShadow = true
  house.add(cab)

  const cabGls = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.08, 0.07), mGls)
  cabGls.position.set(-0.5, 1.82, 0.27)
  house.add(cabGls)

  const cw = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.95, 0.88), mGray)
  cw.position.set(0, 0.68, -1.62)
  cw.castShadow = true
  house.add(cw)

  const boomPivot = new THREE.Group()
  boomPivot.position.set(0, 1.2, 0.95)
  boomPivot.rotation.x = -0.7

  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 3.9), mYel)
  boom.position.set(0, 0, 1.95)
  boom.castShadow = true
  boomPivot.add(boom)

  const stickPivot = new THREE.Group()
  stickPivot.position.set(0, 0, 3.9)
  stickPivot.rotation.x = 0.48

  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 2.5), mYelD)
  stick.position.set(0, 0, 1.25)
  stick.castShadow = true
  stickPivot.add(stick)

  const bkt = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.72, 0.68), mGray)
  bkt.position.set(0, -0.33, 2.6)
  bkt.castShadow = true
  stickPivot.add(bkt)

  boomPivot.add(stickPivot)
  house.add(boomPivot)
  group.add(house)
  scene.add(group)
  const meshes = []
  group.traverse(obj => { if (obj.isMesh) meshes.push(obj) })
  return { meshes }
}

// ── Construction worker ────────────────────────────────────────────────────────

function addWorker(scene, x, z, ry = 0, vestColor = 0xf4e20a, hatColor = 0xffffff) {
  const group = new THREE.Group()
  group.position.set(x, 0, z)
  group.rotation.y = ry

  const mVest  = new THREE.MeshLambertMaterial({ color: vestColor })
  const mHat   = new THREE.MeshLambertMaterial({ color: hatColor, side: THREE.DoubleSide })
  const mPants = new THREE.MeshLambertMaterial({ color: 0x253248 })
  const mSkin  = new THREE.MeshLambertMaterial({ color: 0xd49060 })
  const mBoots = new THREE.MeshLambertMaterial({ color: 0x221408 })

  for (const bx of [-0.15, 0.15]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.32), mBoots)
    boot.position.set(bx, 0.11, 0.02)
    group.add(boot)
  }

  for (const lx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.92, 0.22), mPants)
    leg.position.set(lx, 0.68, 0)
    leg.castShadow = true
    group.add(leg)
  }

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.88, 0.28), mVest)
  torso.position.set(0, 1.52, 0)
  torso.castShadow = true
  group.add(torso)

  for (const [ax, rz] of [[-0.44, 0.18], [0.44, -0.18]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.18), mVest)
    arm.position.set(ax, 1.5, 0)
    arm.rotation.z = rz
    arm.castShadow = true
    group.add(arm)
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), mSkin)
  head.position.set(0, 2.16, 0)
  head.castShadow = true
  group.add(head)

  const dome = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.26, 0.22, 16, 1, false, 0, Math.PI),
    mHat,
  )
  dome.position.set(0, 2.36, 0)
  group.add(dome)

  const brim = new THREE.Mesh(new THREE.RingGeometry(0.21, 0.36, 24), mHat)
  brim.rotation.x = -Math.PI / 2
  brim.position.set(0, 2.25, 0)
  group.add(brim)

  scene.add(group)
  const meshes = []
  group.traverse(obj => { if (obj.isMesh) meshes.push(obj) })
  return { meshes }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function JobsiteScene({
  azimuth,
  elevation,
  zoom,
  effectiveVehicleStatuses = {},
  onVehicleClick,
  selectedVehicleId,
  isMobile = false,
  isDrawMode = false,
  labelsVisible = true,
  labelsContainer = null,
  terrainVisualizationActive = false,
  minimalScene = false,
  lidarMode = false,
  onTerrainClick,
  resourceSelectMode = false,
  onObjectSelect = null,
  onEditResource = null,
  mapPickMode = null,
  onMapClick = null,
  terrainMoveMode = false,
  onTerrainMoved = null,
  terrainControlsRef = null,
  visibleVehicleIds = null,
}) {
  const [sceneReady, setSceneReady] = useState(0)

  const mountRef          = useRef(null)
  const cameraRef         = useRef(null)
  const rendererRef       = useRef(null)
  const rafRef            = useRef(null)
  const statusesRef       = useRef(effectiveVehicleStatuses)
  const onVehicleClickRef = useRef(onVehicleClick)
  const isDrawModeRef     = useRef(isDrawMode)
  const labelsVisibleRef  = useRef(labelsVisible)
  const terrainVisRef     = useRef(terrainVisualizationActive)

  // Orbit state — written by the orbit useEffect, read by the tick loop
  const orbitStateRef = useRef({
    az:     (30 * Math.PI) / 180,
    el:     (40 * Math.PI) / 180,
    radius: RADIUS_BASE,
  })

  // Animated look-at: tick loop lerps current → target each frame
  const lookAtCurrentRef = useRef(new THREE.Vector3(0, 0, 0))
  const lookAtTargetRef  = useRef(new THREE.Vector3(0, 0, 0))

  // Ring meshes stored so the tick loop can spin them
  const ringMeshesRef     = useRef([]) // [{ ring, halo }, ...]
  const onTerrainClickRef = useRef(onTerrainClick)
  const onTerrainMovedRef = useRef(onTerrainMoved)
  const terrainPinsRef    = useRef([]) // [{ sphere, stem, worldPos, labelEl }]
  const terrainMoveModeRef    = useRef(false)
  const terrainOriginalPosRef = useRef({ x: 0, z: 0 })  // terrain grp position when move mode started
  const terrainCurrentPosRef  = useRef({ x: 0, z: 0 })  // kept in sync as terrain is dragged
  const terrainDraggingRef    = useRef(false)             // true while mouse is held down
  const terrainDragOffsetRef  = useRef({ x: 0, z: 0 })   // world offset: terrain centre – grab point
  const lidarObjectsRef       = useRef([]) // THREE objects added in lidar mode
  const allMeshesRef          = useRef([]) // all scene meshes + original materials
  const sceneRef              = useRef(null) // THREE.js Scene object
  const lidarModeRef          = useRef(false)
  const lidarLabelsMapRef     = useRef(new Map()) // _lidarId → { name, action }
  const lidarSelectedObjRef   = useRef(null)
  const lidarPopupRef         = useRef(null)
  const lidarTagsRef          = useRef([])
  const closeLidarPopupRef    = useRef(null)
  const lidarBgPtsRef         = useRef(null) // background scatter points
  const sceneObjTargetsRef       = useRef([])   // sceneObjectHoverTargets array (set once in scene setup)
  const vehicleHoverTargetsRef   = useRef([])   // vehicleHoverTargets array (set once in scene setup)
  const resourceSelectModeRef = useRef(false)
  const mapPickModeRef        = useRef(mapPickMode)
  const onObjectSelectRef     = useRef(onObjectSelect)
  const selectedResourceObjRef = useRef(null) // { obj, type: '3d'|'lidar' }
  const lidarResourceRingRef  = useRef(null) // DOM element for lidar resource highlight
  const setSelectionRef           = useRef(null) // set by scene setup so cleanup effects can call it
  const highlightLidarObjRef      = useRef(null) // set by scene setup so cleanup effects can call it
  const confirmedResourceBadgeRef = useRef(null) // blue badge shown above confirmed resource
  const allScenePopupsRef         = useRef([])   // all 3D label popup DOM elements

  useEffect(() => { statusesRef.current        = effectiveVehicleStatuses }, [effectiveVehicleStatuses])
  useEffect(() => { onVehicleClickRef.current  = onVehicleClick           }, [onVehicleClick])
  useEffect(() => { isDrawModeRef.current      = isDrawMode               }, [isDrawMode])
  useEffect(() => { labelsVisibleRef.current   = labelsVisible            }, [labelsVisible])
  useEffect(() => { terrainVisRef.current      = terrainVisualizationActive }, [terrainVisualizationActive])
  useEffect(() => { onTerrainClickRef.current  = onTerrainClick             }, [onTerrainClick])
  useEffect(() => { onTerrainMovedRef.current  = onTerrainMoved             }, [onTerrainMoved])
  useEffect(() => { lidarModeRef.current       = lidarMode                  }, [lidarMode])
  useEffect(() => { resourceSelectModeRef.current = resourceSelectMode       }, [resourceSelectMode])
  useEffect(() => { mapPickModeRef.current     = mapPickMode                 }, [mapPickMode])
  useEffect(() => { onObjectSelectRef.current  = onObjectSelect              }, [onObjectSelect])
  const onEditResourceRef = useRef(onEditResource)
  useEffect(() => { onEditResourceRef.current = onEditResource }, [onEditResource])
  useEffect(() => {
    if (terrainMoveMode) {
      terrainOriginalPosRef.current = { ...terrainCurrentPosRef.current }
      if (mountRef.current) mountRef.current.style.cursor = 'grab'
    } else {
      terrainDraggingRef.current = false
      if (mountRef.current) mountRef.current.style.cursor = ''
    }
    terrainMoveModeRef.current = terrainMoveMode
  }, [terrainMoveMode])
  const onMapClickRef = useRef(onMapClick)
  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])

  // Close all scene object popups whenever any pick mode is active
  useEffect(() => {
    if (!mapPickMode) return
    allScenePopupsRef.current.forEach(el => { el.style.display = 'none' })
    if (lidarPopupRef.current) lidarPopupRef.current.style.display = 'none'
    setSelectionRef.current?.(null, [])
  }, [mapPickMode])

  // When resource select mode turns off: hide the ring DOM element but keep mesh/lidar highlights
  // so the confirmed resource stays visually marked throughout the rest of the flow.
  useEffect(() => {
    if (!resourceSelectMode) {
      if (lidarResourceRingRef.current) lidarResourceRingRef.current.style.display = 'none'
      // Clear any mesh highlight so nothing stays darkened after resource selection
      setSelectionRef.current?.(null, [])
    }
  }, [resourceSelectMode])

  // ── Lidar mode toggle ─────────────────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (lidarMode) {
      // Dark scan background — override scene.background and remove fog
      scene.background = new THREE.Color(0x050d08)
      scene.fog = null

      // Ground grid
      const grid = new THREE.GridHelper(120, 60, 0x1a4a20, 0x0c2210)
      grid.name = 'lidar-grid'
      scene.add(grid)
      lidarObjectsRef.current.push(grid)

      // Horizontal scan plane that sweeps up and down
      const scanGeo = new THREE.PlaneGeometry(140, 140)
      const scanMat = new THREE.MeshBasicMaterial({ color: 0x00ff55, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false })
      const scanPlane = new THREE.Mesh(scanGeo, scanMat)
      scanPlane.rotation.x = Math.PI / 2
      scanPlane.name = 'lidar-scan'
      scene.add(scanPlane)
      lidarObjectsRef.current.push(scanPlane)

      // Shape-accurate point clouds — per-object so each can be highlighted independently
      const N = 0.04 // point jitter/noise
      const mkPts = (arr, size = 0.18) => {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3))
        const mat = new THREE.PointsMaterial({ color: 0x39ff14, size, sizeAttenuation: true, transparent: true })
        const pts = new THREE.Points(geo, mat)
        scene.add(pts)
        lidarObjectsRef.current.push(pts)
        return pts
      }
      const sBox = (arr, cx, cy, cz, w, h, d, n) => {
        const areas = [w*h, w*h, d*h, d*h, w*d, w*d]
        const total = areas.reduce((a, b) => a + b, 0)
        for (let i = 0; i < n; i++) {
          let r = Math.random() * total, face = 0, cum = 0
          for (let f = 0; f < 6; f++) { cum += areas[f]; if (r <= cum) { face = f; break } }
          let x, y, z
          if      (face === 0) { x = cx+(Math.random()-.5)*w; y = cy+(Math.random()-.5)*h; z = cz+d/2 }
          else if (face === 1) { x = cx+(Math.random()-.5)*w; y = cy+(Math.random()-.5)*h; z = cz-d/2 }
          else if (face === 2) { x = cx+w/2; y = cy+(Math.random()-.5)*h; z = cz+(Math.random()-.5)*d }
          else if (face === 3) { x = cx-w/2; y = cy+(Math.random()-.5)*h; z = cz+(Math.random()-.5)*d }
          else if (face === 4) { x = cx+(Math.random()-.5)*w; y = cy+h/2; z = cz+(Math.random()-.5)*d }
          else                 { x = cx+(Math.random()-.5)*w; y = cy-h/2; z = cz+(Math.random()-.5)*d }
          arr.push(x+(Math.random()-.5)*N, y+(Math.random()-.5)*N, z+(Math.random()-.5)*N)
        }
      }
      const sCone = (arr, cx, cy, cz, r, h, n) => {
        for (let i = 0; i < n; i++) {
          const t = Math.random(), ang = Math.random()*Math.PI*2, rad = r*(1-t)
          arr.push(cx+rad*Math.cos(ang)+(Math.random()-.5)*N, cy+t*h, cz+rad*Math.sin(ang)+(Math.random()-.5)*N)
        }
      }
      const sCyl = (arr, cx, cy, cz, r, h, n) => {
        for (let i = 0; i < n; i++) {
          const ang = Math.random()*Math.PI*2
          arr.push(cx+r*Math.cos(ang), cy+Math.random()*h, cz+r*Math.sin(ang))
        }
      }

      // Build per-object point arrays, keyed by _lidarId so there's no fragile index alignment
      const objArrays = {
        'lo-0':  (() => { const a = []; sBox(a, 11, 1.5, 6,    4.2, 2.8, 5.8, 1800); sBox(a, 11, 4.0, 5.8,  2.4, 2.0, 2.4, 900); sBox(a, 12.8, 5.5, 4.5, 0.45, 3.5, 0.45, 400); return a })(),
        'lo-1':  (() => { const a = []; sBox(a, 17, 1.5, -6,   4.2, 2.8, 5.8, 1800); sBox(a, 17, 4.0, -5.8, 2.4, 2.0, 2.4, 900); sBox(a, 15.2, 5.5, -4.5, 0.45, 3.5, 0.45, 400); return a })(),
        'lo-2':  (() => { const a = []; sCyl(a,  4, 0,    4, 0.22, 1.5, 350); sCyl(a,  4, 1.55,    4, 0.15, 0.28, 150); return a })(),
        'lo-3':  (() => { const a = []; sCyl(a, 20, 0,   11, 0.22, 1.5, 350); sCyl(a, 20, 1.55,   11, 0.15, 0.28, 150); return a })(),
        'lo-4':  (() => { const a = []; sCyl(a, -4, 0,  -17, 0.22, 1.5, 350); sCyl(a, -4, 1.55,  -17, 0.15, 0.28, 150); return a })(),
        'lo-5':  (() => { const a = []; sCone(a, -22, 0,  16, 2.6, 3.2, 1200); return a })(),
        'lo-6':  (() => { const a = []; sCone(a, -30, 0,  23, 2.0, 2.6,  900); return a })(),
        'lo-7':  (() => { const a = []; sCone(a, -16, 0,  22, 1.7, 2.1,  700); return a })(),
        'lo-8':  (() => { const a = []; sCone(a,  30, 0, -20, 2.6, 3.2, 1200); return a })(),
        'lo-9':  (() => { const a = []; sCone(a,  38, 0, -14, 2.3, 2.7, 1000); return a })(),
        'lo-10': (() => { const a = []; sBox(a, 6, 0.1, -4, 7.0, 0.25, 5.5, 900); return a })(),
        'lo-11': (() => { const a = []; sBox(a, 24.5, 5.5, 6, 8.5, 10.5, 6.5, 3000); return a })(),
        'lo-12': (() => { const a = []; for (let fi = 0; fi < 7; fi++) sBox(a, -9.5 + fi*1.5, 0.9, 2, 0.15, 1.8, 0.15, 120); sBox(a, -6, 1.55, 2, 10.0, 0.1, 0.1, 500); sBox(a, -6, 0.75, 2, 10.0, 0.1, 0.1, 500); return a })(),
        // Tree clusters (lo-13..lo-19) — 2-3 pine trees each
        'lo-13': (() => { const a = []; sCyl(a,-24,0,-36,.15,2,50); sCone(a,-24,2,-36,1.4,3.2,280); sCone(a,-24,3.8,-36,.9,2.2,180); sCyl(a,-21,0,-37,.18,2.4,60); sCone(a,-21,2.4,-37,1.6,3.8,320); sCone(a,-21,4.2,-37,1.0,2.5,180); return a })(),
        'lo-14': (() => { const a = []; sCyl(a, 16,0,-36,.16,1.9,50); sCone(a, 16,1.9,-36,1.3,3.0,260); sCone(a, 16,3.4,-36,.85,2.1,160); sCyl(a, 20,0,-37,.2,2.6,65); sCone(a, 20,2.6,-37,1.7,4.0,340); sCone(a, 20,4.5,-37,1.1,2.8,190); return a })(),
        'lo-15': (() => { const a = []; sCyl(a,-47,0,-9, .16,2.0,55); sCone(a,-47,2.0,-9, 1.4,3.4,290); sCone(a,-47,3.9,-9, .9,2.3,180); sCyl(a,-47,0,-6, .18,2.3,60); sCone(a,-47,2.3,-6, 1.5,3.6,300); return a })(),
        'lo-16': (() => { const a = []; sCyl(a,-47,0, 15,.15,1.8,50); sCone(a,-47,1.8, 15,1.3,3.1,270); sCone(a,-47,3.4, 15,.85,2.2,170); sCyl(a,-47,0, 18,.2,2.5,65); sCone(a,-47,2.5, 18,1.6,3.8,320); return a })(),
        'lo-17': (() => { const a = []; sCyl(a, 47,0,-9, .17,2.1,55); sCone(a, 47,2.1,-9, 1.5,3.5,300); sCone(a, 47,3.9,-9, .95,2.4,185); sCyl(a, 47,0,-6, .18,2.3,60); sCone(a, 47,2.3,-6, 1.4,3.4,280); return a })(),
        'lo-18': (() => { const a = []; sCyl(a, 47,0, 15,.16,1.9,52); sCone(a, 47,1.9, 15,1.4,3.2,285); sCone(a, 47,3.6, 15,.9,2.2,175); sCyl(a, 47,0, 18,.19,2.4,62); sCone(a, 47,2.4, 18,1.6,3.7,315); return a })(),
        'lo-19': (() => { const a = []; sCyl(a, -7,0, 36,.16,2.0,55); sCone(a, -7,2.0, 36,1.4,3.3,285); sCone(a, -7,3.8, 36,.9,2.2,175); sCyl(a, -4,0, 37,.2,2.5,65); sCone(a, -4,2.5, 37,1.6,3.9,325); return a })(),
      }
      // In minimal scene: dirt piles are lo-0..lo-4 (data at lo-5..lo-9),
      // tree clusters are lo-5..lo-11 (data at lo-13..lo-19)
      if (minimalScene) {
        const DIRT_KEYS = ['lo-5','lo-6','lo-7','lo-8','lo-9']
        DIRT_KEYS.forEach((src, i) => { objArrays[`lo-${i}`] = objArrays[src] })
        const TREE_KEYS = ['lo-13','lo-14','lo-15','lo-16','lo-17','lo-18','lo-19']
        TREE_KEYS.forEach((src, i) => { objArrays[`lo-${i + 5}`] = objArrays[src] })
      }
      // Attach pts directly to each target object (no index alignment risk)
      sceneObjTargetsRef.current.forEach(obj => {
        const arr = objArrays[obj._lidarId]
        if (arr) obj.lidarPts = mkPts(arr)
      })

      // Background ground scatter
      const bgArr = []
      for (let i = 0; i < 2000; i++) bgArr.push((Math.random()-.5)*90, 0, (Math.random()-.5)*90)
      lidarBgPtsRef.current = mkPts(bgArr, 0.13)

      // Scale vehicles down so they're proportionate alongside point clouds
      vehicleHoverTargetsRef.current.forEach(({ group }) => group.scale.setScalar(0.55))

      // Hide all regular meshes
      allMeshesRef.current.forEach(({ mesh }) => { if (!mesh.userData.isVehicle) mesh.visible = false })

      // Swap vehicle materials to photorealistic grey/black PBR for lidar look
      const lidarMats = {
        body:   { color: 0x7a8490, metalness: 0.72, roughness: 0.38 },
        cab:    { color: 0x6a7480, metalness: 0.68, roughness: 0.45 },
        track:  { color: 0x3a3d40, metalness: 0.05, roughness: 0.95 },
        glass:  { color: 0x4a5a6a, metalness: 0.02, roughness: 0.06, transparent: true, opacity: 0.68 },
        arm:    { color: 0x585e64, metalness: 0.82, roughness: 0.30 },
        bucket: { color: 0x606870, metalness: 0.78, roughness: 0.52 },
      }
      allMeshesRef.current.forEach(({ mesh }) => {
        if (!mesh.userData.isVehicle) return
        const part = mesh.userData.vehiclePart
        if (!lidarMats[part]) return
        mesh.userData.origMaterial = mesh.material
        mesh.userData.lidarMaterial = new THREE.MeshStandardMaterial(lidarMats[part])
        mesh.material = mesh.userData.lidarMaterial
      })

      // Subtle fill + rim lights to give depth to grey metal against dark background
      const fillLight = new THREE.PointLight(0x8ab8d4, 2.2, 40)
      fillLight.position.set(-4, 10, -6)
      fillLight.name = 'lidar-fill'
      scene.add(fillLight)
      lidarObjectsRef.current.push(fillLight)

      const rimLight = new THREE.DirectionalLight(0x4a7a9a, 0.9)
      rimLight.position.set(12, 5, -12)
      rimLight.name = 'lidar-rim'
      scene.add(rimLight)
      lidarObjectsRef.current.push(rimLight)

    } else {
      // Remove lidar objects (includes lights and per-object point clouds)
      lidarObjectsRef.current.forEach((obj) => scene.remove(obj))
      lidarObjectsRef.current = []
      lidarBgPtsRef.current = null
      sceneObjTargetsRef.current.forEach(obj => { obj.lidarPts = null })
      // Restore scene background and fog
      scene.background = new THREE.Color(0x8fa8c0)
      scene.fog = new THREE.Fog(0x8fa8c0, 90, 220)
      // Restore vehicle materials
      allMeshesRef.current.forEach(({ mesh }) => {
        if (!mesh.userData.origMaterial) return
        mesh.material = mesh.userData.origMaterial
        mesh.userData.origMaterial = null
        if (mesh.userData.lidarMaterial) { mesh.userData.lidarMaterial.dispose(); mesh.userData.lidarMaterial = null }
      })
      // Restore vehicle scale and mesh visibility
      vehicleHoverTargetsRef.current.forEach(({ group }) => group.scale.setScalar(1))
      allMeshesRef.current.forEach(({ mesh, origVisible }) => { mesh.visible = origVisible })
      // Close lidar popup and hide tags
      if (lidarPopupRef.current) lidarPopupRef.current.style.display = 'none'
      lidarSelectedObjRef.current = null
      lidarTagsRef.current.forEach(({ el }) => { el.style.display = 'none' })
    }

    // Cleanup: runs before next effect invocation (handles React StrictMode double-fire)
    // and on unmount. Removes any lidar objects this run added so the next run starts clean.
    return () => {
      const s = sceneRef.current
      if (!s) return
      lidarObjectsRef.current.forEach(obj => s.remove(obj))
      lidarObjectsRef.current = []
      lidarBgPtsRef.current = null
      sceneObjTargetsRef.current.forEach(obj => { obj.lidarPts = null })
    }
  }, [lidarMode, sceneReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lidar scan plane animation ────────────────────────────────────────────────
  const lidarScanYRef = useRef(0)
  const lidarScanDirRef = useRef(1)

  // ── Scene setup (runs once) ───────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    const w = mount.clientWidth
    const h = mount.clientHeight

    // ── Scene ──
    const scene = new THREE.Scene()
    sceneRef.current = scene
    scene.background = new THREE.Color(0x8fa8c0)
    scene.fog = new THREE.Fog(0x8fa8c0, 90, 220)

    // ── Lighting ──
    const hemi = new THREE.HemisphereLight(0xd6e8f5, 0x8b6e35, 0.7)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff5dc, 1.4)
    sun.position.set(50, 80, 40)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { near: 1, far: 250, left: -90, right: 90, top: 90, bottom: -90 })
    sun.shadow.bias = -0.001
    scene.add(sun)

    // ── Shared materials ──
    const mDirt     = new THREE.MeshLambertMaterial({ color: 0xb08040 })
    const mDirtDk   = new THREE.MeshLambertMaterial({ color: 0x7a5830 })
    const mConcrete = new THREE.MeshLambertMaterial({ color: 0xc4b89a })
    const mSteel    = new THREE.MeshLambertMaterial({ color: 0x7a8e98 })
    const mSteelDk  = new THREE.MeshLambertMaterial({ color: 0x5a6e78 })
    const mRust     = new THREE.MeshLambertMaterial({ color: 0xa0785a })
    const mOrange   = new THREE.MeshLambertMaterial({ color: 0xf4a31f })
    const mGravel   = new THREE.MeshLambertMaterial({ color: 0x9a9080 })
    const mWood     = new THREE.MeshLambertMaterial({ color: 0xc8a870 })

    const box  = (w, h, d) => new THREE.BoxGeometry(w, h, d)
    const cone = (r, h, s)  => new THREE.ConeGeometry(r, h, s ?? 8)
    const cyl  = (r, h, s)  => new THREE.CylinderGeometry(r, r, h, s ?? 8)

    const add = (geo, mat, x, y, z, ry) => {
      const m = mkMesh(geo, mat, x, y, z, ry)
      scene.add(m)
      return m
    }

    // ── Ground ──
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), mDirt)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const vehicleHoverTargets = []
    vehicleHoverTargetsRef.current = vehicleHoverTargets
    const sceneObjectHoverTargets = []
    ringMeshesRef.current = []

    if (!minimalScene) {
    add(box(28, 0.8, 18), mDirtDk, 8, -0.4, 8)

    // ── Concrete slab ──
    const concreteMeshes = [
      add(box(32, 0.3, 22),    mConcrete, 6, 0.15, -4),
      add(box(32, 0.32, 0.15), mDirtDk,   6, 0.16, -4),
      add(box(0.15, 0.32, 22), mDirtDk,   6, 0.16, -4),
    ]

    // ── Site trailers ──
    add(box(11, 3.2, 5), mSteel, -8, 1.6, -19)
    add(box(10, 3.2, 5), mSteelDk, 6, 1.6, -19)
    add(box(2, 0.4, 1), mGravel, -13.5, 0.2, -18)
    add(box(2, 0.4, 1), mGravel, 10.5, 0.2, -18)

    // ── Building frame ──
    const buildingMeshes = [add(box(18, 0.3, 14), mConcrete, 24, 0.15, 6)]
    for (const [cx, cz] of [[16,6],[33,6],[16,-2],[33,-2],[16,14],[33,14]])
      buildingMeshes.push(add(box(0.5, 9, 0.5), mSteelDk, cx, 4.5, cz))
    buildingMeshes.push(
      add(box(17.5, 0.4, 0.4), mSteelDk, 24.5, 9, 6),
      add(box(17.5, 0.4, 0.4), mSteelDk, 24.5, 9, -2),
      add(box(17.5, 0.4, 0.4), mSteelDk, 24.5, 9, 14),
      add(box(0.4, 0.4, 16.5), mSteelDk, 16, 9, 6),
      add(box(0.4, 0.4, 16.5), mSteelDk, 33, 9, 6),
      add(box(0.2, 9, 7), mSteel, 16, 4.5, 2.5),
      add(box(0.2, 9, 7), mSteel, 33, 4.5, 2.5),
    )

    // ── Storage shed ──
    add(box(8, 3, 5), mRust, -24, 1.5, -4)
    add(box(9.5, 0.15, 6.5), mSteelDk, -24, 3.1, -4)

    // ── Stacked materials ──
    add(box(4, 0.5, 1.2), mWood, -14, 0.25, 2)
    add(box(4, 0.5, 1.2), mWood, -14, 0.75, 2)
    add(box(4, 0.5, 1.2), mWood, -14, 1.25, 2)
    add(cyl(0.25, 5, 6), mSteelDk, -11, 0.3, -2).rotation.z = Math.PI / 2
    add(cyl(0.25, 5, 6), mSteelDk, -11, 0.8, -2).rotation.z = Math.PI / 2
    add(box(1.5, 0.8, 0.8), mConcrete, -17, 0.4, -8)
    add(box(1.5, 0.8, 0.8), mConcrete, -17, 1.2, -8)
    add(box(1.5, 0.8, 0.8), mGravel, -19, 0.4, -8)

    // ── Gravel road ──
    add(box(8, 0.05, 60), mGravel, 0, 0.02, 20)

    // ── Fencing ──
    const fences = [
      { x: -6,  z: 2,   l: 14, ry: 0 },
      { x: -6,  z: 18,  l: 14, ry: 0 },
      { x: -13, z: 10,  l: 16, ry: Math.PI / 2 },
      { x: 1,   z: 10,  l: 16, ry: Math.PI / 2 },
      { x: 24,  z: -5,  l: 24, ry: 0 },
      { x: 24,  z: 18,  l: 24, ry: 0 },
      { x: 12,  z: 6.5, l: 24, ry: Math.PI / 2 },
      { x: 36,  z: 6.5, l: 24, ry: Math.PI / 2 },
    ]
    const fenceMeshes = []
    fences.forEach(({ x, z, l, ry }) => {
      fenceMeshes.push(add(box(l, 0.12, 0.1), mOrange, x, 1.1, z, ry))
      fenceMeshes.push(add(box(l, 0.12, 0.1), mOrange, x, 0.6, z, ry))
      const cnt = Math.floor(l / 2)
      for (let i = 0; i <= cnt; i++) {
        const t = i / cnt - 0.5
        fenceMeshes.push(add(box(0.08, 1.4, 0.08), mOrange, ry ? x : x + t * l, 0.7, ry ? z + t * l : z))
      }
    })

    // ── Porta-potties ──
    const mBlue = new THREE.MeshLambertMaterial({ color: 0x3a7dd4 })
    add(box(1.2, 2.4, 1.2), mBlue, -30, 1.2, 5)
    add(box(1.2, 2.4, 1.2), mBlue, -32, 1.2, 5)

    // ── Generator & water tank ──
    add(box(3, 1.8, 1.8), mSteelDk, -28, 0.9, -12)
    add(cyl(0.1, 1.5), mSteelDk, -27.2, 1.65, -12.2)
    const tank = new THREE.Mesh(cyl(1.5, 3.5, 16), new THREE.MeshLambertMaterial({ color: 0x4a8a6a }))
    tank.position.set(-34, 2.75, -20)
    tank.castShadow = true
    tank.receiveShadow = true
    scene.add(tank)

    // ── Excavators ──
    const { meshes: excMeshes1 } = addExcavator(scene, 11,  6, -2.2)
    const { meshes: excMeshes2 } = addExcavator(scene, 17, -6,  0.7)

    // ── Workers ──
    const { meshes: wrkMeshes1 } = addWorker(scene,  4,  4, -2.6, 0xf4e20a, 0xffffff)
    const { meshes: wrkMeshes2 } = addWorker(scene, 20, 11,  0.6, 0xf4811f, 0xf4d000)
    const { meshes: wrkMeshes3 } = addWorker(scene, -4, -17,  1.3, 0xf4e20a, 0xff6600)

    // ── Scene object hover targets (non-vehicle 3D items) ──
    sceneObjectHoverTargets.push(
      { name: 'Excavator A', confidence: 97, worldPos: new THREE.Vector3( 11, 0,   6), tooltipY: 7.0, meshes: excMeshes1,    _lastSeenAgo:  8  },
      { name: 'Excavator B', confidence: 94, worldPos: new THREE.Vector3( 17, 0,  -6), tooltipY: 7.0, meshes: excMeshes2,    _lastSeenAgo: 14  },
      { name: 'Worker',      confidence: 91, worldPos: new THREE.Vector3(  4, 0,   4), tooltipY: 2.8, meshes: wrkMeshes1,    _lastSeenAgo: 20  },
      { name: 'Worker',      confidence: 88, worldPos: new THREE.Vector3( 20, 0,  11), tooltipY: 2.8, meshes: wrkMeshes2,    _lastSeenAgo: 22  },
      { name: 'Worker',      confidence: 54, worldPos: new THREE.Vector3( -4, 0, -17), tooltipY: 2.8, meshes: wrkMeshes3,    _lastSeenAgo: 18  },
      { name: 'Concrete pad',   confidence: 99, worldPos: new THREE.Vector3(  6, 0,  -4), tooltipY: 1.0,  meshes: concreteMeshes, _lastSeenAgo:  12 },
      { name: 'Building frame', confidence: 96, worldPos: new THREE.Vector3( 24.5, 0, 6), tooltipY: 10.5, meshes: buildingMeshes,  _lastSeenAgo:  16 },
      { name: 'Safety fence',   confidence: 98, worldPos: new THREE.Vector3( -6, 0,   2), tooltipY: 2.0,  meshes: fenceMeshes,    _lastSeenAgo:  10 },
    ) // end sceneObjectHoverTargets.push
    } // end if (!minimalScene)

    // ── Bobcat CTLs — shown in all modes; filtered by visibleVehicleIds when provided ──
    for (const [id, { x, z, ringColor, ry }] of Object.entries(BOBCAT_PLACEMENTS)) {
      if (visibleVehicleIds !== null ? !visibleVehicleIds.includes(id) : minimalScene) continue
      const vehicleData = DATA_VEHICLES.find(v => v.id === id)
      const { group, meshes, ring, halo, disc } = addBobcat(scene, x, z, ringColor, ry)
      meshes.forEach(m => { m.userData.isVehicle = true })
      ring.userData.isVehicle = true
      halo.userData.isVehicle = true
      vehicleHoverTargets.push({
        id,
        name: vehicleData?.name ?? id,
        staticStatus: vehicleData?.status ?? 'idle',
        worldPos: new THREE.Vector3(x, 0, z),
        meshes,
        group,
        ring,
        halo,
        disc,
      })
      ringMeshesRef.current.push({ ring, halo })
    }

    // ── Dirt mounds (shown in all modes) ──────────────────────────────────────────
    const dirtM1 = add(cone(9, 4.5, 10), mDirtDk, -22, 2.25,  16)
    const dirtM2 = add(cone(6, 3.5,  9), mDirtDk, -30, 1.75,  23)
    const dirtM3 = add(cone(4, 2.5,  8), mDirt,   -16, 1.25,  22)
    const dirtM4 = add(cone(11, 5.5, 12), mDirtDk, 30, 2.75, -20)
    const dirtM5 = add(cone(7, 3.8, 10), mDirtDk,  38, 1.9,  -14)
    sceneObjectHoverTargets.push(
      { name: 'Dirt pile', confidence: 99, worldPos: new THREE.Vector3(-22, 0,  16), tooltipY: 4.5, meshes: [dirtM1], _lastSeenAgo: 150 },
      { name: 'Dirt pile', confidence: 96, worldPos: new THREE.Vector3(-30, 0,  23), tooltipY: 3.5, meshes: [dirtM2], _lastSeenAgo: 360 },
      { name: 'Dirt pile', confidence: 93, worldPos: new THREE.Vector3(-16, 0,  22), tooltipY: 2.5, meshes: [dirtM3], _lastSeenAgo:  22 },
      { name: 'Dirt pile', confidence: 99, worldPos: new THREE.Vector3( 30, 0, -20), tooltipY: 5.5, meshes: [dirtM4], _lastSeenAgo: 480 },
      { name: 'Dirt pile', confidence: 97, worldPos: new THREE.Vector3( 38, 0, -14), tooltipY: 3.8, meshes: [dirtM5], _lastSeenAgo: 600 },
    )

    // ── Treeline ───────────────────────────────────────────────────────────────────
    // Seeded pseudo-random so trees are identical on every render
    let _seed = 42
    const rng = () => { _seed = (_seed * 1664525 + 1013904223) & 0xffffffff; return (_seed >>> 0) / 0xffffffff }

    // Back edge (Z = -34..–38), spread X = -44..+44 every ~5 units
    const backRow = []
    for (let x = -44; x <= 44; x += 4.5 + rng() * 2) backRow.push([x, -36])
    plantTreeRow(scene, backRow, rng)

    // Front edge (Z = +35..+38)
    const frontRow = []
    for (let x = -44; x <= 44; x += 4.5 + rng() * 2) frontRow.push([x, 36])
    plantTreeRow(scene, frontRow, rng)

    // Left edge (X = -46..–48), spread Z = -32..+32
    const leftRow = []
    for (let z = -32; z <= 32; z += 4.5 + rng() * 2) leftRow.push([-47, z])
    plantTreeRow(scene, leftRow, rng)

    // Right edge (X = +46..+48)
    const rightRow = []
    for (let z = -32; z <= 32; z += 4.5 + rng() * 2) rightRow.push([47, z])
    plantTreeRow(scene, rightRow, rng)

    // ── Tree cluster hover targets (lidar mode only) ────────────────────────────────
    // Representative clusters along each edge — labeled in lidar, invisible in 3D mode
    sceneObjectHoverTargets.push(
      { name: 'Tree', confidence: 100, worldPos: new THREE.Vector3(-22, 0, -36), tooltipY: 5.5, meshes: [], lidarOnly: true, _lastSeenAgo:  720 },
      { name: 'Tree', confidence: 100, worldPos: new THREE.Vector3( 18, 0, -36), tooltipY: 5.5, meshes: [], lidarOnly: true, _lastSeenAgo:  840 },
      { name: 'Unknown', confidence: 0, worldPos: new THREE.Vector3(-47, 0,  -8), tooltipY: 5.5, meshes: [], lidarOnly: true, _lastSeenAgo: 1080 },
      { name: 'Tree', confidence: 100, worldPos: new THREE.Vector3(-47, 0,  16), tooltipY: 5.5, meshes: [], lidarOnly: true, _lastSeenAgo:  960 },
      { name: 'Unknown', confidence: 0, worldPos: new THREE.Vector3( 47, 0,  -8), tooltipY: 5.5, meshes: [], lidarOnly: true, _lastSeenAgo: 1200 },
      { name: 'Tree', confidence: 100, worldPos: new THREE.Vector3( 47, 0,  16), tooltipY: 5.5, meshes: [], lidarOnly: true, _lastSeenAgo: 1020 },
      { name: 'Tree', confidence: 100, worldPos: new THREE.Vector3( -5, 0,  36), tooltipY: 5.5, meshes: [], lidarOnly: true, _lastSeenAgo:  780 },
    )

    // ── Record all meshes for lidar mode toggling ─────────────────────────────────
    allMeshesRef.current = []
    scene.traverse((obj) => {
      if (obj.isMesh) allMeshesRef.current.push({ mesh: obj, origVisible: obj.visible })
    })

    // ── Persistent labels ─────────────────────────────────────────────────────────
    // Confirmed/renamed scene objects: id → { confirmed: bool, name: string }
    const confirmedMap = new Map()
    const lblRoot = labelsContainer?.current ?? mount

    // ── Selection / highlight ──────────────────────────────────────────────────
    // Strategy: directly darken every non-selected mesh's material colour so the
    // selected object always stands out, regardless of camera angle — no lights needed.
    // Shared materials are cloned for the selected mesh so we can brighten it
    // independently without affecting other objects using the same material.

    // Snapshot every unique material's original colour right after scene build.
    const allSceneMeshes = []
    scene.traverse((obj) => { if (obj.isMesh) allSceneMeshes.push(obj) })
    const matSnapshot = new Map() // uuid → { material, origColor }
    allSceneMeshes.forEach((mesh) => {
      if (!matSnapshot.has(mesh.material.uuid)) {
        matSnapshot.set(mesh.material.uuid, {
          material: mesh.material,
          origColor: mesh.material.color.clone(),
        })
      }
    })

    const selectedObj = { id: null, meshes: [] }

    const setSelection = (id, meshes) => {
      // Always restore all materials to original first
      matSnapshot.forEach(({ material, origColor }) => {
        material.color.copy(origColor)
        if (material.emissive) material.emissive.set(0x000000)
      })

      selectedObj.id = id
      selectedObj.meshes = meshes

      if (!id || !meshes.length) return

      // Clone materials for selected meshes that are shared with other scene objects,
      // so we can brighten the selected mesh without affecting its siblings.
      meshes.forEach((mesh) => {
        const shared = allSceneMeshes.some(m => m !== mesh && m.material === mesh.material)
        if (shared) {
          const { origColor } = matSnapshot.get(mesh.material.uuid)
          mesh.material = mesh.material.clone()
          matSnapshot.set(mesh.material.uuid, {
            material: mesh.material,
            origColor: origColor.clone(),
          })
        }
      })

      // Boost selected meshes with emissive highlight (no darkening of others)
      const selSet = new Set(meshes)
      allSceneMeshes.forEach((mesh) => {
        const snap = matSnapshot.get(mesh.material.uuid)
        if (!snap) return
        if (selSet.has(mesh)) {
          mesh.material.color.copy(snap.origColor)
          if (mesh.material.emissive) mesh.material.emissive.set(0x303030)
        }
      })
    }
    setSelectionRef.current = setSelection

    // ── Popup positioning helper ──────────────────────────────────────────────
    // Popups live on document.body (position:fixed) so they escape the map panel's
    // stacking context and always appear above every other UI element.
    // sx / sy are pixels relative to the mount container; this converts them to
    // viewport coordinates and clamps so the popup is never cut off.
    const POPUP_W = 270
    const positionPopupFixed = (el, sx, sy, mountRect) => {
      // el must already be visible (display != none) so offsetHeight is real
      const ph = el.offsetHeight || 260
      // Centre horizontally on the anchor; appear above it (same as old CSS transform)
      let vx = mountRect.left + sx - POPUP_W / 2
      let vy = mountRect.top  + sy - ph - 52
      const margin = 8
      if (vx + POPUP_W > window.innerWidth  - margin) vx = window.innerWidth  - POPUP_W - margin
      if (vx < margin) vx = margin
      if (vy + ph > window.innerHeight - margin) vy = window.innerHeight - ph - margin
      if (vy < margin) vy = margin
      el.style.left = `${vx}px`
      el.style.top  = `${vy}px`
    }

    const closePopup = (popup) => {
      popup.style.display = 'none'
      setSelection(null, [])
    }

    // Vehicle persistent labels + large invisible hit areas
    const vehicleLabelEls = vehicleHoverTargets.map((v) => {
      // Hit area — large transparent div centred on the vehicle's projected position
      const hit = document.createElement('div')
      hit.style.cssText = 'position:absolute;width:88px;height:88px;transform:translate(-50%,-50%);cursor:pointer;pointer-events:auto;'
      hit.addEventListener('click', (e) => { e.stopPropagation(); onVehicleClickRef.current?.(v.id) })
      lblRoot.appendChild(hit)

      const el = document.createElement('div')
      el.className = 'v3d-label v3d-label--vehicle'
      el.style.cursor = 'pointer'
      el.style.pointerEvents = 'auto'
      el.addEventListener('click', (e) => { e.stopPropagation(); onVehicleClickRef.current?.(v.id) })
      lblRoot.appendChild(el)
      return { el, hit, popup: null, worldPos: v.worldPos, id: v.id, name: v.name, isVehicle: true }
    })

    const OBJ_ACTIONS = [
      { value: 'avoid',  icon: 'block',         label: 'Avoid' },
      { value: 'push',   icon: 'arrow_forward', label: 'Push through' },
      { value: 'pickup', icon: 'conveyor_belt', label: 'Mark for pickup' },
    ]

    // Pre-compute static timestamp text for all scene objects
    sceneObjectHoverTargets.forEach((obj) => {
      const s = obj._lastSeenAgo ?? 60
      if (s < 30)        { obj._tsText = 'Live';                               obj._tsLive = true  }
      else if (s < 90)   { obj._tsText = '1 min ago';                          obj._tsLive = false }
      else if (s < 3600) { obj._tsText = `${Math.round(s / 60)} mins ago`;     obj._tsLive = false }
      else if (s < 86400){ obj._tsText = `${Math.round(s / 3600)} hrs ago`;    obj._tsLive = false }
      else               { obj._tsText = 'Yesterday';                           obj._tsLive = false }
    })

    // Scene object persistent labels (clickable for confirm/rename)
    const sceneObjLabelEls = sceneObjectHoverTargets.map((obj, i) => {
      const id = `scene-${i}`
      const el = document.createElement('div')
      el.className = 'v3d-tooltip v3d-label v3d-label--object'
      lblRoot.appendChild(el)

      const popup = document.createElement('div')
      popup.className = 'v3d-label-popup'
      popup.style.display = 'none'
      document.body.appendChild(popup)
      allScenePopupsRef.current.push(popup)

      const confLevel = () => obj.confidence >= 90 ? 'high' : obj.confidence >= 70 ? 'med' : 'low'
      const confLabel = () => {
        const lv = confLevel()
        const label = `${obj.confidence}% confidence`
        if (lv === 'low')  return `<span style="color:#f07060">${label}</span>`
        if (lv === 'med')  return `<span style="color:#f4b400">${label}</span>`
        return label
      }

      const buildPopup = (editMode = false) => {
        const state = confirmedMap.get(id) ?? { confirmed: false, name: obj.name }
        popup.innerHTML = ''

        if (editMode) {
          // ── Rename mode — no header, just the input row ──────────────────
          const renameRow = document.createElement('div')
          renameRow.className = 'v3d-rename-row'

          const input = document.createElement('input')
          input.className = 'v3d-rename-input'
          input.value = state.name
          input.placeholder = 'Label name'
          input.onclick = (ev) => ev.stopPropagation()
          input.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') saveEdit(input); if (ev.key === 'Escape') buildPopup(false) }

          const saveEditBtn = document.createElement('button')
          saveEditBtn.type = 'button'
          saveEditBtn.className = 'v3d-rename-save-btn'
          saveEditBtn.textContent = 'Save'
          saveEditBtn.onclick = (e) => { e.stopPropagation(); saveEdit(input) }

          const cancelEditBtn = document.createElement('button')
          cancelEditBtn.type = 'button'
          cancelEditBtn.className = 'map-zone-popup-close'
          cancelEditBtn.setAttribute('aria-label', 'Cancel')
          cancelEditBtn.innerHTML = '<span class="material-symbols-outlined">close</span>'
          cancelEditBtn.onclick = (e) => { e.stopPropagation(); buildPopup(false) }

          renameRow.appendChild(input)
          renameRow.appendChild(saveEditBtn)
          renameRow.appendChild(cancelEditBtn)
          popup.appendChild(renameRow)
          setTimeout(() => { input.focus(); input.select() }, 0)

          const saveEdit = (inp) => {
            const newName = inp.value.trim() || state.name
            confirmedMap.set(id, { ...state, name: newName })
            buildPopup(false)
          }
          return
        }

        // ── Header (normal view only) ────────────────────────────────────
        const header = document.createElement('div')
        header.className = 'map-zone-popup-header'

        const info = document.createElement('div')
        info.className = 'map-zone-popup-info'
        const nameEl = document.createElement('span')
        nameEl.className = 'map-zone-popup-name'
        nameEl.innerHTML = `${obj._tsLive ? '<span class="v3d-live-ring map-zone-popup-live-ring"></span>' : ''}${state.name}`
        info.appendChild(nameEl)
        const typeEl = document.createElement('span')
        typeEl.className = 'map-zone-popup-type'
        const tsText = obj._tsLive
          ? ''
          : `<span class="map-zone-popup-ts-inline">${obj._tsText ?? '1 min ago'}</span> · `
        typeEl.innerHTML = state.confirmed ? '<span class="v3d-conf-confirmed-text">Verified by you</span>' : (tsText + confLabel())
        info.appendChild(typeEl)
        header.appendChild(info)

        const closeBtn = document.createElement('button')
        closeBtn.type = 'button'
        closeBtn.className = 'map-zone-popup-close'
        closeBtn.setAttribute('aria-label', 'Dismiss')
        closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>'
        closeBtn.onclick = (e) => { e.stopPropagation(); closePopup(popup) }
        header.appendChild(closeBtn)

        popup.appendChild(header)

        // ── Avoid / Push through / Mark for pickup ────────────────────────
        const currentAction = state.action ?? 'avoid'
        const labelsRow = document.createElement('div')
        labelsRow.className = 'map-zone-popup-obstacle-labels'
        OBJ_ACTIONS.forEach(({ value, icon, label }) => {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = `map-zone-obstacle-label-btn${currentAction === value ? ' map-zone-obstacle-label-btn--active' : ''}`
          btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${label}`
          if (currentAction === value) {
            const check = document.createElement('span')
            check.className = 'material-symbols-outlined map-zone-obstacle-label-check'
            check.setAttribute('aria-hidden', 'true')
            check.textContent = 'check'
            btn.appendChild(check)
          }
          btn.onclick = (e) => {
            e.stopPropagation()
            confirmedMap.set(id, { ...state, action: value })
            buildPopup(false)
          }
          labelsRow.appendChild(btn)
        })
        popup.appendChild(labelsRow)

        // ── Bottom actions ─────────────────────────────────────────────────
        const actions = document.createElement('div')
        actions.className = 'map-zone-popup-actions'

        if (!state.confirmed) {
          const confirmRow = document.createElement('button')
          confirmRow.type = 'button'
          confirmRow.className = 'map-zone-popup-action'
          confirmRow.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">check_circle</span>Confirm'
          confirmRow.onclick = (e) => {
            e.stopPropagation()
            confirmedMap.set(id, { ...state, confirmed: true })
            buildPopup(false)
          }
          actions.appendChild(confirmRow)
        }

        const renameBtn = document.createElement('button')
        renameBtn.type = 'button'
        renameBtn.className = 'map-zone-popup-action'
        renameBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">edit</span>Rename'
        renameBtn.onclick = (e) => { e.stopPropagation(); buildPopup(true) }
        actions.appendChild(renameBtn)

        if (confirmedMap.has(id)) {
          const resetBtn = document.createElement('button')
          resetBtn.type = 'button'
          resetBtn.className = 'map-zone-popup-action'
          resetBtn.title = 'Reset to detected state'
          resetBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">reset_wrench</span>Reset to detected'
          resetBtn.onclick = (e) => { e.stopPropagation(); confirmedMap.delete(id); closePopup(popup) }
          actions.appendChild(resetBtn)
        }

        popup.appendChild(actions)
      }
      buildPopup()

      el.style.cursor = 'pointer'
      el.style.pointerEvents = 'auto'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        // Suppress all popups while the new-job flow is collecting any pin
        if (resourceSelectModeRef.current || mapPickModeRef.current) return
        // In lidar mode: delegate to the lidar popup instead of the 3D confirm/rename popup
        if (lidarModeRef.current) {
          lidarSelectedObjRef.current = obj
          highlightLidarObj(obj)
          buildLidarPopup(obj)
          lidarPopupEl.style.display = 'block'
          positionPopupFixed(lidarPopupEl, parseFloat(el.style.left), parseFloat(el.style.top), mount.getBoundingClientRect())
          return
        }
        const isOpen = popup.style.display !== 'none'
        // Close all other popups / deselect
        sceneObjLabelEls.forEach((lbl) => { if (lbl.popup && lbl.popup !== popup) closePopup(lbl.popup) })
        if (isOpen) {
          closePopup(popup)
        } else {
          buildPopup()
          popup.style.display = 'flex'
          positionPopupFixed(popup, parseFloat(el.style.left), parseFloat(el.style.top), mount.getBoundingClientRect())
          setSelection(id, obj.meshes)
        }
      })
      popup.addEventListener('click', (e) => e.stopPropagation())

      return { el, popup, worldPos: obj.worldPos, id, name: obj.name, confidence: obj.confidence, tooltipY: obj.tooltipY, meshes: obj.meshes, isVehicle: false, lidarOnly: obj.lidarOnly ?? false, _lastClass: '', _tsText: obj._tsText ?? '1 min ago', _tsLive: obj._tsLive ?? false }
    })

    const allLabelEls = [...vehicleLabelEls, ...sceneObjLabelEls]

    // ── Lidar labeling ───────────────────────────────────────────────────────────
    // Give each detectable object a stable lidar ID
    sceneObjectHoverTargets.forEach((obj, i) => {
      obj._lidarId = `lo-${i}`
      if (obj.name === 'Dirt pile') lidarLabelsMapRef.current.set(`lo-${i}`, { action: 'pickup' })
      if (obj.name === 'Tree') lidarLabelsMapRef.current.set(`lo-${i}`, { action: 'avoid' })
    })
    sceneObjTargetsRef.current = sceneObjectHoverTargets

    // Persistent popup for lidar cluster selection
    const lidarPopupEl = document.createElement('div')
    lidarPopupEl.className = 'v3d-label-popup'
    lidarPopupEl.style.display = 'none'
    lidarPopupEl.addEventListener('click', e => e.stopPropagation())
    document.body.appendChild(lidarPopupEl)
    lidarPopupRef.current = lidarPopupEl

    // Confirmed resource badge — blue pill shown above the object after resource is confirmed
    const confirmedResourceBadgeEl = document.createElement('div')
    confirmedResourceBadgeEl.className = 'v3d-resource-badge'
    confirmedResourceBadgeEl.style.display = 'none'
    confirmedResourceBadgeEl.innerHTML = '<span class="material-symbols-outlined">inventory_2</span><span class="v3d-resource-badge-name"></span><button class="v3d-resource-badge-edit" title="Edit resource"><span class="material-symbols-outlined">edit</span></button>'
    confirmedResourceBadgeEl.querySelector('.v3d-resource-badge-edit').addEventListener('click', (e) => {
      e.stopPropagation()
      onEditResourceRef.current?.()
    })
    lblRoot.appendChild(confirmedResourceBadgeEl)
    confirmedResourceBadgeRef.current = confirmedResourceBadgeEl

    // Resource select highlight ring (lidar mode)
    const lidarResourceRingEl = document.createElement('div')
    lidarResourceRingEl.className = 'lidar-resource-ring'
    lidarResourceRingEl.style.display = 'none'
    lblRoot.appendChild(lidarResourceRingEl)
    lidarResourceRingRef.current = lidarResourceRingEl

    // Persistent tag elements (one per object, shown after labeling)
    const lidarTagEls = sceneObjectHoverTargets.map((obj) => {
      const el = document.createElement('div')
      el.className = 'lidar-obj-tag'
      el.style.display = 'none'
      lblRoot.appendChild(el)
      return { obj, el }
    })

    const highlightLidarObj = (selectedObj) => {
      sceneObjTargetsRef.current.forEach(obj => {
        if (!obj.lidarPts) return
        const dim = !!selectedObj && obj !== selectedObj
        // Selected stays normal green; others darken but remain visible
        obj.lidarPts.material.color.setHex(dim ? 0x1a4a1a : 0x39ff14)
      })
      const bg = lidarBgPtsRef.current
      if (bg) {
        bg.material.color.setHex(selectedObj ? 0x071407 : 0x39ff14)
        bg.material.opacity = selectedObj ? 0.12 : 1.0
      }
    }
    highlightLidarObjRef.current = highlightLidarObj

    const closeLidarPopup = () => {
      lidarPopupEl.style.display = 'none'
      lidarSelectedObjRef.current = null
      highlightLidarObj(null)
    }

    const LIDAR_ACTIONS = [
      { value: 'avoid',  icon: 'block',         label: 'Avoid' },
      { value: 'push',   icon: 'arrow_forward', label: 'Push through' },
      { value: 'pickup', icon: 'conveyor_belt', label: 'Mark for pickup', activeLabel: 'Marked for pickup' },
    ]

    const buildLidarPopup = (obj) => {
      const existing = lidarLabelsMapRef.current.get(obj._lidarId) ?? {}
      const currentAction = existing.action ?? 'avoid'
      const displayName = existing.name ?? obj.name
      const activeActionDef = LIDAR_ACTIONS.find(a => a.value === currentAction)
      const subtitle = activeActionDef?.activeLabel ?? activeActionDef?.label ?? 'Avoid'

      lidarPopupEl.innerHTML = ''
      lidarPopupEl.style.position = 'fixed'
      lidarPopupEl.style.zIndex = '1000'
      lidarPopupEl.style.pointerEvents = 'auto'
      lidarPopupEl.className = 'map-zone-popup map-zone-popup--obstacle'

      // ── Header ──
      const hdr = document.createElement('div')
      hdr.className = 'map-zone-popup-header'

      const dot = document.createElement('span')
      dot.className = `map-zone-popup-dot ${obj._tsLive ? 'map-zone-popup-dot--live' : 'map-zone-popup-dot--stale'}`
      dot.setAttribute('aria-hidden', 'true')
      hdr.appendChild(dot)

      const info = document.createElement('div')
      info.className = 'map-zone-popup-info'
      const nameEl = document.createElement('span')
      nameEl.className = 'map-zone-popup-name'
      nameEl.textContent = displayName
      const subtitleEl = document.createElement('span')
      subtitleEl.className = 'map-zone-popup-type'
      const lidarTsHtml = obj._tsLive
        ? `<span class="map-zone-popup-ts-inline map-zone-popup-ts-inline--live">Live</span> · `
        : `<span class="map-zone-popup-ts-inline">${obj._tsText ?? '1 min ago'}</span> · `
      subtitleEl.innerHTML = lidarTsHtml + subtitle
      info.appendChild(nameEl)
      info.appendChild(subtitleEl)
      hdr.appendChild(info)

      const closeBtn = document.createElement('button')
      closeBtn.type = 'button'
      closeBtn.className = 'map-zone-popup-close'
      closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>'
      closeBtn.onclick = e => { e.stopPropagation(); closeLidarPopup() }
      hdr.appendChild(closeBtn)
      lidarPopupEl.appendChild(hdr)

      // ── Action buttons (Avoid / Push through / Mark for pickup) ──
      const labelsRow = document.createElement('div')
      labelsRow.className = 'map-zone-popup-obstacle-labels'
      LIDAR_ACTIONS.forEach(({ value, icon, label }) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = `map-zone-obstacle-label-btn${currentAction === value ? ' map-zone-obstacle-label-btn--active' : ''}`
        btn.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${label}`
        if (currentAction === value) {
          const check = document.createElement('span')
          check.className = 'material-symbols-outlined map-zone-obstacle-label-check'
          check.setAttribute('aria-hidden', 'true')
          check.textContent = 'check'
          btn.appendChild(check)
        }
        btn.onclick = e => {
          e.stopPropagation()
          const cur = lidarLabelsMapRef.current.get(obj._lidarId) ?? {}
          lidarLabelsMapRef.current.set(obj._lidarId, { ...cur, action: value })
          buildLidarPopup(obj)
        }
        labelsRow.appendChild(btn)
      })
      lidarPopupEl.appendChild(labelsRow)

      // ── Bottom actions: Rename only ──
      const actRow = document.createElement('div')
      actRow.className = 'map-zone-popup-actions'

      const renameBtn = document.createElement('button')
      renameBtn.type = 'button'
      renameBtn.className = 'map-zone-popup-action'
      renameBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>Rename'
      renameBtn.onclick = e => {
        e.stopPropagation()
        lidarPopupEl.innerHTML = ''
        lidarPopupEl.style.pointerEvents = 'auto'
        lidarPopupEl.className = 'map-zone-popup map-zone-popup--obstacle'

        const editRow = document.createElement('div')
        editRow.className = 'v3d-rename-row'

        const inp = document.createElement('input')
        inp.type = 'text'
        inp.className = 'v3d-rename-input'
        inp.value = displayName
        inp.placeholder = 'Object name'
        inp.onclick = e2 => e2.stopPropagation()
        const commit = () => {
          if (lidarPopupEl.style.display === 'none') return
          const v = inp.value.trim()
          const cur = lidarLabelsMapRef.current.get(obj._lidarId) ?? {}
          lidarLabelsMapRef.current.set(obj._lidarId, { ...cur, name: v || displayName })
          buildLidarPopup(obj)
        }
        inp.onkeydown = e2 => {
          e2.stopPropagation()
          if (e2.key === 'Enter') commit()
          if (e2.key === 'Escape') buildLidarPopup(obj)
        }

        const saveBtn = document.createElement('button')
        saveBtn.type = 'button'
        saveBtn.className = 'v3d-rename-save-btn'
        saveBtn.textContent = 'Save'
        saveBtn.onclick = e2 => { e2.stopPropagation(); commit() }

        const cancelBtn = document.createElement('button')
        cancelBtn.type = 'button'
        cancelBtn.className = 'map-zone-popup-close'
        cancelBtn.setAttribute('aria-label', 'Cancel')
        cancelBtn.innerHTML = '<span class="material-symbols-outlined">close</span>'
        cancelBtn.onclick = e2 => { e2.stopPropagation(); buildLidarPopup(obj) }

        editRow.appendChild(inp)
        editRow.appendChild(saveBtn)
        editRow.appendChild(cancelBtn)
        lidarPopupEl.appendChild(editRow)
        setTimeout(() => { inp.focus(); inp.select() }, 0)
      }

      actRow.appendChild(renameBtn)
      lidarPopupEl.appendChild(actRow)
    }

    lidarTagsRef.current = lidarTagEls
    closeLidarPopupRef.current = closeLidarPopup

    // Close popups + deselect when clicking outside
    const onDocClick = (e) => {
      sceneObjLabelEls.forEach(({ popup }) => { if (popup.style.display !== 'none') closePopup(popup) })
      // Canvas clicks in lidar mode call e.stopPropagation() so this only fires for
      // clicks outside the canvas — safe to close the popup without a race condition.
      if (lidarModeRef.current && !lidarPopupEl.contains(e.target)) closeLidarPopup()
    }
    document.addEventListener('click', onDocClick)

    // ── Terrain design visualization ─────────────────────────────────────────
    // Built once and toggled visible via terrainVisRef. A graded surface over
    // the concrete-pad area coloured by grade status (blue/green/red).
    const terrainGroup = (() => {
      const CX = 6, CZ = -4   // centre of concrete pad
      const TW = 36, TD = 26  // terrain extent
      const SX = 28, SZ = 18  // grid subdivisions

      const geo = new THREE.PlaneGeometry(TW, TD, SX, SZ)
      geo.rotateX(-Math.PI / 2)

      const pos    = geo.attributes.position
      const colors = new Float32Array(pos.count * 3)

      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i)  // local x (−TW/2 → TW/2)
        const lz = pos.getZ(i)

        // Design grade: slope rising west→east
        const targetY = ((lx + TW / 2) / TW) * 3.0

        // Simulated actual terrain: add undulation representing dig work
        const actual = targetY
          + Math.sin(lx * 0.45 + 0.5) * 0.45
          + Math.cos(lz * 0.42 + 1.0) * 0.35
          + Math.sin(lx * 0.18 - lz * 0.22) * 0.25

        pos.setY(i, actual + 0.06)

        const diff = actual - targetY
        if (diff > 0.22) {
          // above grade — blue
          colors[i * 3] = 0.24; colors[i * 3 + 1] = 0.52; colors[i * 3 + 2] = 0.97
        } else if (diff < -0.22) {
          // below grade — red/orange
          colors[i * 3] = 0.95; colors[i * 3 + 1] = 0.30; colors[i * 3 + 2] = 0.22
        } else {
          // on grade — green
          colors[i * 3] = 0.15; colors[i * 3 + 1] = 0.80; colors[i * 3 + 2] = 0.40
        }
      }
      pos.needsUpdate = true
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      geo.computeVertexNormals()

      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.82 })
      const terrainMesh = new THREE.Mesh(geo, mat)
      terrainMesh.position.set(CX, 0, CZ)
      terrainMesh.receiveShadow = true

      // Grid lines that follow the actual terrain shape, colored by grade
      const vCols = SX + 1, vRows = SZ + 1
      const linePositions = [], lineColors = []
      const addEdge = (i1, i2) => {
        for (const idx of [i1, i2]) {
          linePositions.push(pos.getX(idx), pos.getY(idx) + 0.04, pos.getZ(idx))
          const lx2 = pos.getX(idx)
          const diff2 = pos.getY(idx) - ((lx2 + TW / 2) / TW) * 3.0
          if (diff2 > 0.22)       lineColors.push(0.50, 0.75, 1.00)
          else if (diff2 < -0.22) lineColors.push(1.00, 0.50, 0.38)
          else                    lineColors.push(0.28, 1.00, 0.58)
        }
      }
      for (let r = 0; r < vRows; r++)
        for (let c = 0; c < vCols - 1; c++) addEdge(r * vCols + c, r * vCols + c + 1)
      for (let c = 0; c < vCols; c++)
        for (let r = 0; r < vRows - 1; r++) addEdge(r * vCols + c, (r + 1) * vCols + c)
      const wireGeo = new THREE.BufferGeometry()
      wireGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePositions), 3))
      wireGeo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(lineColors), 3))
      const wireMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 })
      const wireMesh = new THREE.LineSegments(wireGeo, wireMat)
      wireMesh.position.set(CX, 0, CZ)

      const grp = new THREE.Group()
      grp.add(terrainMesh)
      grp.add(wireMesh)
      grp.visible = false
      scene.add(grp)

      return { grp, mat, mesh: terrainMesh, CX, CZ, TW, dragHandleEl: null }
    })()

    // Initialise terrain position tracking and register revert callback with MapPanel
    terrainCurrentPosRef.current = { x: terrainGroup.grp.position.x, z: terrainGroup.grp.position.z }
    if (terrainControlsRef) {
      terrainControlsRef.current.revert = () => {
        const orig = terrainOriginalPosRef.current
        terrainGroup.grp.position.set(orig.x, 0, orig.z)
        terrainCurrentPosRef.current = { x: orig.x, z: orig.z }
        for (const p of terrainPinsRef.current) {
          scene.remove(p.sphere); scene.remove(p.stem); if (p.ring) scene.remove(p.ring); p.labelEl.remove()
        }
        terrainPinsRef.current = []
      }
    }

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500)
    // Position will be driven by orbitStateRef in the tick loop; set a sensible initial value
    const initAz = orbitStateRef.current.az
    const initEl = orbitStateRef.current.el
    const initR  = orbitStateRef.current.radius
    camera.position.set(
      initR * Math.cos(initEl) * Math.sin(initAz),
      initR * Math.sin(initEl),
      initR * Math.cos(initEl) * Math.cos(initAz),
    )
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // ── Hover tooltip ──
    const tooltipEl = document.createElement('div')
    tooltipEl.className = 'v3d-tooltip'
    tooltipEl.style.cssText = 'display:none;position:absolute;pointer-events:none;'
    mount.appendChild(tooltipEl)

    // Track mouse via document (mount has pointer-events:none so can't listen directly)
    const mouse = new THREE.Vector2(-999, -999)
    const onMouseMove = (e) => {
      const rect = mount.getBoundingClientRect()
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top  && e.clientY <= rect.bottom) {
        mouse.set(
          ((e.clientX - rect.left) / rect.width)  *  2 - 1,
          ((e.clientY - rect.top)  / rect.height) * -2 + 1,
        )
      } else {
        mouse.set(-999, -999)
      }
    }
    document.addEventListener('mousemove', onMouseMove)

    // Mobile: touchstart shows tooltip; touchend hides it after a short delay
    let touchHideTimer = null
    const onTouchStart = (e) => {
      if (isDrawModeRef.current) return
      const touch = e.touches[0]
      if (!touch) return
      const rect = mount.getBoundingClientRect()
      if (touch.clientX < rect.left || touch.clientX > rect.right ||
          touch.clientY < rect.top  || touch.clientY > rect.bottom) return
      clearTimeout(touchHideTimer)
      mouse.set(
        ((touch.clientX - rect.left) / rect.width)  *  2 - 1,
        ((touch.clientY - rect.top)  / rect.height) * -2 + 1,
      )
    }
    const onTouchEnd = () => {
      touchHideTimer = setTimeout(() => { mouse.set(-999, -999) }, 1800)
    }
    const onTouchMove = () => {
      clearTimeout(touchHideTimer)
      mouse.set(-999, -999)
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend',   onTouchEnd)
    document.addEventListener('touchmove',  onTouchMove,  { passive: true })

    // Track pointerdown position so we can distinguish click from orbit drag
    const ptrDown = { x: 0, y: 0 }
    const onPointerDown = (e) => { ptrDown.x = e.clientX; ptrDown.y = e.clientY }
    document.addEventListener('pointerdown', onPointerDown)

    // ── Terrain drag-to-reposition ──
    const terrainDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const terrainDragRay   = new THREE.Raycaster()
    const terrainHitPt     = new THREE.Vector3()

    const onTerrainPointerDown = (e) => {
      if (!terrainMoveModeRef.current) return
      const rect = mount.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top  || e.clientY > rect.bottom) return
      terrainDragRay.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width)  *  2 - 1,
          ((e.clientY - rect.top)  / rect.height) * -2 + 1,
        ), camera,
      )
      if (terrainDragRay.ray.intersectPlane(terrainDragPlane, terrainHitPt)) {
        const cx = terrainGroup.CX + terrainGroup.grp.position.x
        const cz = terrainGroup.CZ + terrainGroup.grp.position.z
        terrainDragOffsetRef.current = { x: cx - terrainHitPt.x, z: cz - terrainHitPt.z }
        terrainDraggingRef.current = true
        mount.style.cursor = 'grabbing'
      }
    }

    const onTerrainPointerMove = (e) => {
      if (!terrainMoveModeRef.current || !terrainDraggingRef.current) return
      const rect = mount.getBoundingClientRect()
      terrainDragRay.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width)  *  2 - 1,
          ((e.clientY - rect.top)  / rect.height) * -2 + 1,
        ), camera,
      )
      if (terrainDragRay.ray.intersectPlane(terrainDragPlane, terrainHitPt)) {
        const nx = terrainHitPt.x + terrainDragOffsetRef.current.x - terrainGroup.CX
        const nz = terrainHitPt.z + terrainDragOffsetRef.current.z - terrainGroup.CZ
        terrainGroup.grp.position.set(nx, 0, nz)
        terrainCurrentPosRef.current = { x: nx, z: nz }
        // Clear elevation pins — they're now misaligned
        for (const p of terrainPinsRef.current) {
          scene.remove(p.sphere); scene.remove(p.stem); if (p.ring) scene.remove(p.ring); p.labelEl.remove()
        }
        terrainPinsRef.current = []
      }
    }

    const onTerrainPointerUp = () => {
      if (!terrainDraggingRef.current) return
      terrainDraggingRef.current = false
      if (terrainMoveModeRef.current) mount.style.cursor = 'grab'
    }

    document.addEventListener('pointerdown', onTerrainPointerDown)
    document.addEventListener('pointermove', onTerrainPointerMove)
    document.addEventListener('pointerup',   onTerrainPointerUp)

    // Click in capture phase so we can stopPropagation before map-scene handles it
    const onClick = (e) => {
      const rect = mount.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top  || e.clientY > rect.bottom) return
      // Don't intercept clicks on labels-overlay elements — they have their own handlers
      // (vehicle hit areas, label divs, terrain cards). Clicks on map-scene-content pass through.
      // EXCEPTIONS: resource select mode (mesh hit detection) and destination pick mode (any
      // click must drop the pin, even if a label element is under the cursor).
      if (!resourceSelectModeRef.current && mapPickModeRef.current !== 'destination' && lblRoot.contains(e.target)) return
      // Don't intercept clicks on any interactive UI element overlaid on the canvas
      // (buttons, inputs, links etc.) — let their own React/DOM handlers fire
      if (e.target.closest('button, input, select, a, [role="button"]')) return
      // If the pointer moved more than 5px it was an orbit drag — ignore
      if (Math.hypot(e.clientX - ptrDown.x, e.clientY - ptrDown.y) > 5) return

      const clickVec = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1,
      )
      clickRaycaster.setFromCamera(clickVec, camera)

      // ── Terrain move mode: drag handles repositioning — block all other click actions ──
      if (terrainMoveModeRef.current) {
        e.stopPropagation()
        return
      }

      // ── Lidar mode: proximity click to select/label a cluster ──
      if (lidarModeRef.current && !isDrawModeRef.current) {
        // In destination/waypoints pick mode: fire map-click directly (bypass MapPanel onClick)
        const pickMode = mapPickModeRef.current
        if (pickMode === 'destination' || pickMode === 'waypoints') {
          e.stopPropagation()
          const r = mount.getBoundingClientRect()
          const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width)  * 100))
          const y = Math.max(0, Math.min(100, ((e.clientY - r.top)  / r.height) * 100))
          onMapClickRef.current?.({ x, y })
          return
        }

        // ── Terrain click works in lidar mode too ──
        if (terrainVisRef.current) {
          const hits = clickRaycaster.intersectObject(terrainGroup.mesh, false)
          if (hits.length > 0) {
            e.stopPropagation()
            const { x: wx, y: wy, z: wz } = hits[0].point
            for (const p of terrainPinsRef.current) {
              scene.remove(p.sphere); scene.remove(p.stem); if (p.ring) scene.remove(p.ring); p.labelEl.remove()
            }
            terrainPinsRef.current = []
            const { CX, TW } = terrainGroup
            const effectiveCX = CX + terrainGroup.grp.position.x
            const lx = wx - effectiveCX
            const targetY = ((lx + TW / 2) / TW) * 3.0
            const diff = wy - targetY
            const gradeStatus = diff > 0.22 ? 'above' : diff < -0.22 ? 'below' : 'on'
            const pinColor = gradeStatus === 'above' ? 0x60a5fa : gradeStatus === 'below' ? 0xf87171 : 0x4ade80
            const pinMat = new THREE.MeshLambertMaterial({ color: pinColor })
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), pinMat)
            stem.position.set(wx, wy + 0.8, wz); scene.add(stem)
            const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), pinMat)
            sphere.position.set(wx, wy + 1.65, wz); scene.add(sphere)
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(0.22, 0.035, 6, 20),
              new THREE.MeshLambertMaterial({ color: pinColor, transparent: true, opacity: 0.7 })
            )
            ring.rotation.x = Math.PI / 2
            ring.position.set(wx, wy + 0.02, wz); scene.add(ring)
            const labelEl = document.createElement('div')
            labelEl.className = 'terrain-elev-card'
            labelEl.style.pointerEvents = 'auto'
            labelEl.addEventListener('click', (ev) => ev.stopPropagation())
            let customTarget = null
            const buildCard = (editMode = false) => {
              const effTarget = customTarget ?? targetY
              const effDiff = wy - effTarget
              const effStatus = effDiff > 0.22 ? 'above' : effDiff < -0.22 ? 'below' : 'on'
              const diffAbs = Math.abs(effDiff).toFixed(2)
              const diffText = effStatus === 'above' ? `+${diffAbs}m above grade` : effStatus === 'below' ? `−${diffAbs}m below grade` : 'On target grade'
              const diffCls = `terrain-elev-card__diff terrain-elev-card__diff--${effStatus}`
              labelEl.innerHTML = ''
              const hdr = document.createElement('div')
              hdr.className = 'terrain-elev-card__header'
              hdr.textContent = editMode ? 'Edit target grade' : 'Elevation'
              labelEl.appendChild(hdr)
              const coord = document.createElement('div')
              coord.className = 'terrain-elev-card__coord'
              coord.textContent = `${wx.toFixed(1)}, ${wz.toFixed(1)}`
              labelEl.appendChild(coord)
              const diffEl = document.createElement('div')
              diffEl.className = diffCls
              diffEl.textContent = diffText
              labelEl.appendChild(diffEl)
            }
            buildCard(false)
            lblRoot.appendChild(labelEl)
            terrainPinsRef.current.push({ sphere, stem, ring, labelEl, worldPos: new THREE.Vector3(wx, wy, wz), gradeStatus, diff })
            onTerrainClickRef.current?.({ gradeStatus, diff: +diff.toFixed(2), current: +wy.toFixed(2), target: +targetY.toFixed(2) })
            return
          }
        }

        e.stopPropagation()
        const lRect = mount.getBoundingClientRect()
        const cx = e.clientX - lRect.left
        const cy = e.clientY - lRect.top
        let closest = null, minDist = 80
        for (const obj of sceneObjectHoverTargets) {
          projVec.set(obj.worldPos.x, obj.tooltipY ?? 3, obj.worldPos.z)
          projVec.project(camera)
          const sx = ((projVec.x + 1) / 2) * lRect.width
          const sy = ((-projVec.y + 1) / 2) * lRect.height
          const d = Math.hypot(cx - sx, cy - sy)
          if (d < minDist) { minDist = d; closest = obj }
        }
        if (closest) {
          if (resourceSelectModeRef.current) {
            // Resource select: use same point-cloud highlight as normal lidar selection
            selectedResourceObjRef.current = { obj: closest, type: 'lidar' }
            highlightLidarObj(closest)
            onObjectSelectRef.current?.(closest.name, closest.worldPos)
          } else if (!mapPickModeRef.current) {
            lidarSelectedObjRef.current = closest
            highlightLidarObj(closest)
            buildLidarPopup(closest)
            lidarPopupEl.style.display = 'block'
          }
        } else {
          if (resourceSelectModeRef.current) {
            selectedResourceObjRef.current = null
            highlightLidarObj(null)
          } else {
            closeLidarPopup()
          }
        }
        return
      }

      // ── Destination pick mode (3D): any click drops the pin — suppress all other handlers ──
      if (!lidarModeRef.current && mapPickModeRef.current === 'destination') {
        e.stopPropagation()
        const r = mount.getBoundingClientRect()
        const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width)  * 100))
        const y = Math.max(0, Math.min(100, ((e.clientY - r.top)  / r.height) * 100))
        onMapClickRef.current?.({ x, y })
        return
      }

      // ── Terrain click: place / remove confirmation pin ──
      if (terrainVisRef.current) {
        const hits = clickRaycaster.intersectObject(terrainGroup.mesh, false)
        if (hits.length > 0) {
          e.stopPropagation()
          const { x: wx, y: wy, z: wz } = hits[0].point
          // Check if near an existing pin (within 1.5 units) — if so, remove it
          // Remove any existing pin before placing a new one
          for (const p of terrainPinsRef.current) {
            scene.remove(p.sphere); scene.remove(p.stem); if (p.ring) scene.remove(p.ring); p.labelEl.remove()
          }
          terrainPinsRef.current = []
          // Compute grade at this point (account for any relocation offset)
          const { CX, TW } = terrainGroup
          const effectiveCX = CX + terrainGroup.grp.position.x
          const lx = wx - effectiveCX
          const targetY = ((lx + TW / 2) / TW) * 3.0
          const diff = wy - targetY
          const gradeStatus = diff > 0.22 ? 'above' : diff < -0.22 ? 'below' : 'on'
          const pinColor = gradeStatus === 'above' ? 0x60a5fa : gradeStatus === 'below' ? 0xf87171 : 0x4ade80
          const pinMat = new THREE.MeshLambertMaterial({ color: pinColor })
          // Thin needle stem
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), pinMat)
          stem.position.set(wx, wy + 0.8, wz)
          scene.add(stem)
          // Small cap dot at top
          const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), pinMat)
          sphere.position.set(wx, wy + 1.65, wz)
          scene.add(sphere)
          // Flat base ring
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.22, 0.035, 6, 20),
            new THREE.MeshLambertMaterial({ color: pinColor, transparent: true, opacity: 0.7 })
          )
          ring.rotation.x = Math.PI / 2
          ring.position.set(wx, wy + 0.02, wz)
          scene.add(ring)
          // 2D label card
          const labelEl = document.createElement('div')
          labelEl.className = 'terrain-elev-card'
          labelEl.style.pointerEvents = 'auto'
          labelEl.addEventListener('click', (e) => e.stopPropagation())

          let customTarget = null

          const buildCard = (editMode = false) => {
            const effTarget = customTarget ?? targetY
            const effDiff = wy - effTarget
            const effStatus = effDiff > 0.22 ? 'above' : effDiff < -0.22 ? 'below' : 'on'
            const diffAbs = Math.abs(effDiff).toFixed(2)
            const diffText = effStatus === 'above' ? `+${diffAbs}m above grade` : effStatus === 'below' ? `−${diffAbs}m below grade` : 'On target grade'
            const diffCls = `terrain-elev-card__diff terrain-elev-card__diff--${effStatus}`
            labelEl.innerHTML = ''

            const hdr = document.createElement('div')
            hdr.className = 'terrain-elev-card__header'
            hdr.textContent = editMode ? 'Edit target grade' : 'Elevation'
            labelEl.appendChild(hdr)

            const coord = document.createElement('div')
            coord.className = 'terrain-elev-card__coord'
            coord.textContent = `${wx.toFixed(1)}, ${wz.toFixed(1)}`
            labelEl.appendChild(coord)

            if (editMode) {
              const save = (inp) => {
                const val = parseFloat(inp.value)
                if (!isNaN(val)) customTarget = val
                buildCard(false)
              }

              // Stepper row: [ − ] [ value input ] [ + ]  m
              const stepRow = document.createElement('div')
              stepRow.className = 'terrain-elev-card__stepper'

              const minusBtn = document.createElement('button')
              minusBtn.type = 'button'
              minusBtn.className = 'terrain-elev-card__step-btn'
              minusBtn.setAttribute('aria-label', 'Decrease')
              minusBtn.innerHTML = '<span class="material-symbols-outlined">remove</span>'

              const inp = document.createElement('input')
              inp.type = 'number'
              inp.step = '0.01'
              inp.className = 'terrain-elev-card__input'
              inp.value = effTarget.toFixed(2)
              inp.onclick = (e) => e.stopPropagation()
              inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') save(inp) }

              const plusBtn = document.createElement('button')
              plusBtn.type = 'button'
              plusBtn.className = 'terrain-elev-card__step-btn'
              plusBtn.setAttribute('aria-label', 'Increase')
              plusBtn.innerHTML = '<span class="material-symbols-outlined">add</span>'

              const STEP = 0.05
              minusBtn.onclick = (e) => {
                e.stopPropagation()
                inp.value = (parseFloat(inp.value || 0) - STEP).toFixed(2)
              }
              plusBtn.onclick = (e) => {
                e.stopPropagation()
                inp.value = (parseFloat(inp.value || 0) + STEP).toFixed(2)
              }

              const unitSpan = document.createElement('span')
              unitSpan.className = 'terrain-elev-card__input-unit'
              unitSpan.textContent = 'm'

              stepRow.appendChild(minusBtn)
              stepRow.appendChild(inp)
              stepRow.appendChild(unitSpan)
              stepRow.appendChild(plusBtn)
              labelEl.appendChild(stepRow)

              const btns = document.createElement('div')
              btns.className = 'terrain-elev-card__edit-btns'
              const cancelBtn = document.createElement('button')
              cancelBtn.type = 'button'
              cancelBtn.className = 'map-zone-popup-confirm-cancel'
              cancelBtn.textContent = 'Cancel'
              cancelBtn.onclick = (e) => { e.stopPropagation(); buildCard(false) }
              const saveBtn = document.createElement('button')
              saveBtn.type = 'button'
              saveBtn.className = 'v3d-popup-save-btn'
              saveBtn.textContent = 'Save'
              saveBtn.onclick = (e) => { e.stopPropagation(); save(inp) }
              btns.appendChild(cancelBtn)
              btns.appendChild(saveBtn)
              labelEl.appendChild(btns)
              setTimeout(() => { inp.focus(); inp.select() }, 0)
            } else {
              const rows = document.createElement('div')
              rows.className = 'terrain-elev-card__rows'
              rows.innerHTML =
                `<div class="terrain-elev-card__row"><span class="terrain-elev-card__key">Current</span><span class="terrain-elev-card__val">${wy.toFixed(2)}<span class="terrain-elev-card__unit">m</span></span></div>` +
                `<div class="terrain-elev-card__row"><span class="terrain-elev-card__key">Target</span><span class="terrain-elev-card__val">${effTarget.toFixed(2)}<span class="terrain-elev-card__unit">m</span></span></div>`
              labelEl.appendChild(rows)

              const diffEl = document.createElement('div')
              diffEl.className = diffCls
              diffEl.textContent = diffText
              labelEl.appendChild(diffEl)

              const editBtn = document.createElement('button')
              editBtn.type = 'button'
              editBtn.className = 'map-zone-popup-action terrain-elev-card__edit-btn'
              editBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">edit</span>Edit target'
              editBtn.onclick = (e) => { e.stopPropagation(); buildCard(true) }
              labelEl.appendChild(editBtn)
            }
          }
          buildCard(false)

          lblRoot.appendChild(labelEl)
          const pin = { sphere, stem, ring, labelEl, worldPos: new THREE.Vector3(wx, wy, wz), gradeStatus, diff }
          terrainPinsRef.current.push(pin)
          onTerrainClickRef.current?.({ gradeStatus, diff: +diff.toFixed(2), current: +wy.toFixed(2), target: +targetY.toFixed(2) })
          return
        }
      }

      for (const v of vehicleHoverTargets) {
        if (clickRaycaster.intersectObjects(v.meshes, false).length > 0) {
          e.stopPropagation()
          onVehicleClickRef.current?.(v.id)
          return
        }
      }

      // ── Scene object body click: open label popup (works even when labels are hidden) ──
      if (!lidarModeRef.current && !resourceSelectModeRef.current && !mapPickModeRef.current) {
        for (const lbl of sceneObjLabelEls) {
          if (clickRaycaster.intersectObjects(lbl.meshes, false).length > 0) {
            e.stopPropagation()
            // If labels are hidden, the tick loop skips positioning — compute it now
            // so the popup opens at the correct screen location
            if (!labelsVisibleRef.current) {
              const r = mount.getBoundingClientRect()
              projVec.set(lbl.worldPos.x, (lbl.tooltipY ?? 5) + 2, lbl.worldPos.z)
              projVec.project(camera)
              lbl.el.style.left = `${((projVec.x + 1) / 2) * r.width}px`
              lbl.el.style.top  = `${((-projVec.y + 1) / 2) * r.height}px`
            }
            lbl.el.click()
            return
          }
        }
      }

      // ── Resource select mode: click a scene object to select it ──
      if (resourceSelectModeRef.current) {
        for (const obj of sceneObjectHoverTargets) {
          if (clickRaycaster.intersectObjects(obj.meshes, false).length > 0) {
            e.stopPropagation()
            selectedResourceObjRef.current = { obj, type: '3d' }
            onObjectSelectRef.current?.(obj.name, obj.worldPos)
            return
          }
        }
        // Clicked empty space — clear selection
        selectedResourceObjRef.current = null
      }
    }
    document.addEventListener('click', onClick, true)

    const raycaster      = new THREE.Raycaster()
    const clickRaycaster = new THREE.Raycaster()
    const projVec        = new THREE.Vector3()

    // ── Render loop ──────────────────────────────────────────────────────────────
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)

      // ── Lidar scan sweep ──
      const scanObj = scene.getObjectByName('lidar-scan')
      if (scanObj) {
        lidarScanYRef.current += lidarScanDirRef.current * 0.04
        if (lidarScanYRef.current > 12)  lidarScanDirRef.current = -1
        if (lidarScanYRef.current < -1)  lidarScanDirRef.current =  1
        scanObj.position.y = lidarScanYRef.current
      }

      // ── Animated rings ──
      const t = Date.now() * 0.001
      for (let vi = 0; vi < vehicleHoverTargets.length; vi++) {
        const v = vehicleHoverTargets[vi]
        const status = statusesRef.current[v.id] ?? v.staticStatus
        const ringCol = STATUS_RING_COLORS[status] ?? STATUS_RING_COLORS.idle
        // Breathing emissive pulse — each vehicle offset slightly
        const pulse = 0.35 + 0.3 * Math.sin(t * 1.6 + vi * 1.1)
        v.ring.material.color.setHex(ringCol)
        v.ring.material.emissive.setHex(ringCol)
        v.ring.material.emissiveIntensity = pulse
        // Slow-spinning outer glow
        v.halo.material.color.setHex(ringCol)
        v.halo.material.opacity = 0.04 + 0.04 * Math.sin(t * 1.6 + vi * 1.1)
        v.halo.rotation.z = t * -0.12
        // Ground disc colour sync
        v.disc.material.color.setHex(ringCol)
        v.disc.material.opacity = 0.02 + 0.025 * pulse
      }

      // ── Smooth camera look-at ──
      lookAtCurrentRef.current.lerp(lookAtTargetRef.current, 0.08)
      const lookAt = lookAtCurrentRef.current

      const { az, el, radius } = orbitStateRef.current
      camera.position.set(
        lookAt.x + radius * Math.cos(el) * Math.sin(az),
        lookAt.y + radius * Math.sin(el),
        lookAt.z + radius * Math.cos(el) * Math.cos(az),
      )
      camera.lookAt(lookAt)

      // ── Hover detection ──
      raycaster.setFromCamera(mouse, camera)
      let hovered = null
      let hoveredIsVehicle = false

      if (!isDrawModeRef.current) {
        for (const v of vehicleHoverTargets) {
          if (raycaster.intersectObjects(v.meshes, false).length > 0) {
            hovered = v
            hoveredIsVehicle = true
            break
          }
        }
        if (!hovered) {
          for (const obj of sceneObjectHoverTargets) {
            if (raycaster.intersectObjects(obj.meshes, false).length > 0) {
              hovered = obj
              break
            }
          }
        }
      }

      // Hover tooltip — only shown when persistent labels are hidden
      if (hovered && !labelsVisibleRef.current) {
        let innerHtml
        if (hoveredIsVehicle) {
          const status      = statusesRef.current[hovered.id] ?? hovered.staticStatus
          const statusLabel = STATUS_LABELS[status] ?? status
          const statusColor = STATUS_COLORS[status]  ?? STATUS_COLORS.idle
          innerHtml =
            `<span class="v3d-tt-name">${hovered.name}</span>` +
            `<span class="v3d-tt-status"><span class="v3d-tt-dot" style="background:${statusColor}"></span>${statusLabel}</span>`
        } else if (lidarModeRef.current) {
          const lidarState = lidarLabelsMapRef.current.get(hovered._lidarId) ?? {}
          const displayName = lidarState.name ?? hovered.name
          const actionLabel = lidarState.action === 'push' ? 'Push through' : lidarState.action === 'pickup' ? 'Marked for pickup' : 'Avoid'
          innerHtml =
            `<span class="v3d-tt-name">${displayName}</span>` +
            `<span class="v3d-tt-status">${actionLabel}</span>`
        } else {
          innerHtml =
            `<span class="v3d-tt-name">${hovered.name}</span>` +
            `<span class="v3d-tt-status">${hovered.confidence === 0 ? 'Unclassified' : `${hovered.confidence}% confidence`}</span>`
        }

        const ty = hoveredIsVehicle ? 5.2 : hovered.tooltipY
        projVec.set(hovered.worldPos.x, ty, hovered.worldPos.z)
        projVec.project(camera)

        const rect = mount.getBoundingClientRect()
        const sx = ((projVec.x + 1) / 2) * rect.width
        const sy = ((-projVec.y + 1) / 2) * rect.height

        tooltipEl.innerHTML    = innerHtml
        tooltipEl.style.left    = `${sx}px`
        tooltipEl.style.top     = `${sy}px`
        tooltipEl.style.display = 'flex'
      } else {
        tooltipEl.style.display = 'none'
      }

      // ── Persistent labels ──
      const labelsOn = labelsVisibleRef.current
      const inPickMode = !!mapPickModeRef.current
      const rect2 = mount.getBoundingClientRect()
      for (const lbl of allLabelEls) {
        if ((!labelsOn && !lbl.isVehicle) || (lbl.lidarOnly && !lidarModeRef.current)) {
          lbl.el.style.display = 'none'
          if (lbl.hit) lbl.hit.style.display = 'none'
          // If the popup was opened via a mesh click, keep it visible and track its position
          // — unless a pick mode is active, in which case force it closed
          if (lbl.popup && lbl.popup.style.display !== 'none' && inPickMode) {
            lbl.popup.style.display = 'none'
          } else if (lbl.popup && lbl.popup.style.display !== 'none') {
            projVec.set(lbl.worldPos.x, (lbl.tooltipY ?? 5) + 2, lbl.worldPos.z)
            projVec.project(camera)
            const sx = ((projVec.x + 1) / 2) * rect2.width
            const sy = ((-projVec.y + 1) / 2) * rect2.height
            positionPopupFixed(lbl.popup, sx, sy, rect2)
          } else if (lbl.popup) {
            lbl.popup.style.display = 'none'
          }
          continue
        }
        if (lbl.hit) lbl.hit.style.display = 'block'
        const labelY = lbl.isVehicle ? 6.5 : (lbl.tooltipY ?? 5) + 2
        projVec.set(lbl.worldPos.x, labelY, lbl.worldPos.z)
        projVec.project(camera)
        const sx = ((projVec.x + 1) / 2) * rect2.width
        const sy = ((-projVec.y + 1) / 2) * rect2.height
        if (lbl.isVehicle) {
          if (lbl.hit) { lbl.hit.style.left = `${sx}px`; lbl.hit.style.top = `${sy}px` }
          const status = statusesRef.current[lbl.id] ?? 'idle'
          const statusLabel = STATUS_LABELS[status] ?? status
          const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle
          const newHtml =
            `<span class="v3d-vehicle-label-dot" style="background:${statusColor}"></span>` +
            `<span class="v3d-vehicle-label-name">${lbl.name}</span>` +
            `<span class="v3d-vehicle-label-sep">·</span>` +
            `<span class="v3d-vehicle-label-status">${statusLabel}</span>`
          if (lbl._lastHtml !== newHtml) { lbl.el.innerHTML = newHtml; lbl._lastHtml = newHtml }
          if (lbl._lastStatus !== status) { lbl.el.style.setProperty('background', STATUS_LABEL_BG[status] ?? STATUS_LABEL_BG.idle, 'important'); lbl.el.style.setProperty('border-color', statusColor + '30', 'important'); lbl._lastStatus = status }
        } else {
          const state = confirmedMap.get(lbl.id)
          const displayName = state?.name ?? lbl.name
          let newHtml
          if (lidarModeRef.current) {
            const targetClass = 'v3d-tooltip v3d-label v3d-label--object v3d-conf-confirmed'
            if (lbl._lastClass !== targetClass) { lbl.el.className = targetClass; lbl._lastClass = targetClass }
            const lidarKey = `lo-${lbl.id.replace('scene-', '')}`
            const lidarState = lidarLabelsMapRef.current.get(lidarKey) ?? {}
            const lidarDisplayName = lidarState.name ?? displayName
            const actionLabel = lidarState.action === 'push' ? 'Push through' : lidarState.action === 'pickup' ? 'Marked for pickup' : 'Avoid'
            const isLive = lbl._tsLive
            const liveRingLidar = isLive ? `<span class="v3d-live-ring"></span>` : ''
            const tsHtml = isLive
              ? ''
              : `<span class="v3d-lidar-ts">${lbl._tsText}</span> · `
            newHtml = `${liveRingLidar}<span class="v3d-label-text"><span class="v3d-tt-name">${lidarDisplayName}</span><span class="v3d-tt-status">${tsHtml}${actionLabel}</span></span>`
          } else {
            const confLevel = lbl.confidence >= 90 ? 'high' : lbl.confidence >= 70 ? 'med' : 'low'
            const isLive3d = lbl._tsLive
            const targetClass = `v3d-tooltip v3d-label v3d-label--object v3d-conf-${state?.confirmed ? 'confirmed' : isLive3d ? 'live' : confLevel}`
            if (lbl._lastClass !== targetClass) { lbl.el.className = targetClass; lbl._lastClass = targetClass }
            const dotColor = confLevel === 'med' ? '#f4b400' : '#ea4335'
            const confLabel = state?.confirmed
              ? ''
              : lbl.confidence === 0
                ? `<span class="v3d-conf-low-text">Unclassified</span>`
                : confLevel === 'low'
                  ? `<span class="v3d-conf-low-text">${lbl.confidence}% confidence</span>`
                  : `${lbl.confidence}% confidence`
            const liveRingHtml = isLive3d ? `<span class="v3d-live-ring"></span>` : ''
            const tsPart = isLive3d
              ? ''
              : `<span class="v3d-lidar-ts v3d-lidar-ts--3d">${lbl._tsText}</span>`
            const separator = tsPart && confLabel ? ' · ' : ''
            const statusHtml = (tsPart || confLabel) ? `<span class="v3d-tt-status">${tsPart}${separator}${confLabel}</span>` : ''
            newHtml = `${liveRingHtml}<span class="v3d-label-text"><span class="v3d-tt-name">${displayName}</span>${statusHtml}</span>`
          }
          if (lbl._lastHtml !== newHtml) { lbl.el.innerHTML = newHtml; lbl._lastHtml = newHtml }
        }
        lbl.el.style.left = `${sx}px`
        lbl.el.style.top  = `${sy}px`
        lbl.el.style.display = 'flex'
        // Dim labels that aren't the selected object
        let targetOpacity = '1'
        if (lidarModeRef.current) {
          const lidarSel = lidarSelectedObjRef.current
          const resObj = selectedResourceObjRef.current
          const activeSel = lidarSel ?? (resObj?.type === 'lidar' ? resObj.obj : null)
          if (activeSel && !lbl.isVehicle) {
            const selIdx = parseInt(activeSel._lidarId.replace('lo-', ''), 10)
            const lblIdx = parseInt(lbl.id.replace('scene-', ''), 10)
            targetOpacity = lblIdx === selIdx ? '1' : '0.25'
          }
        } else {
          const resObj = selectedResourceObjRef.current
          const resLidarId = resObj?.type === '3d' ? resObj.obj._lidarId : null
          const resLblId = resLidarId ? `scene-${resLidarId.replace('lo-', '')}` : null
          const activeId = selectedObj.id ?? resLblId
          const is3dSelected = activeId !== null && lbl.id === activeId
          targetOpacity = activeId !== null && !is3dSelected ? '0.25' : '1'
        }
        if (lbl.el.style.opacity !== targetOpacity) lbl.el.style.opacity = targetOpacity
        if (lbl.popup && lbl.popup.style.display !== 'none') {
          if (inPickMode) lbl.popup.style.display = 'none'
          else positionPopupFixed(lbl.popup, sx, sy, rect2)
        }
      }

      // ── Terrain pin labels ──
      const rect3 = mount.getBoundingClientRect()
      for (const pin of terrainPinsRef.current) {
        projVec.set(pin.worldPos.x, pin.worldPos.y + 1.6, pin.worldPos.z)
        projVec.project(camera)
        const sx = ((projVec.x + 1) / 2) * rect3.width
        const sy = ((-projVec.y + 1) / 2) * rect3.height
        pin.labelEl.style.left    = `${sx}px`
        pin.labelEl.style.top     = `${sy}px`
        pin.labelEl.style.display = terrainVisRef.current ? 'flex' : 'none'
      }

      // ── Terrain visibility + fade-in ──
      const terrainOn = terrainVisRef.current
      if (terrainOn !== terrainGroup.grp.visible) terrainGroup.grp.visible = terrainOn
      if (terrainOn) {
        const op = terrainGroup.mat.opacity
        if (op < 0.82) terrainGroup.mat.opacity = Math.min(0.82, op + 0.025)
      } else {
        terrainGroup.mat.opacity = 0
      }

      // ── Terrain drag handle ──
      const dh = terrainGroup.dragHandleEl
      if (dh) {
        const inMoveMode = terrainMoveModeRef.current
        if (terrainOn && inMoveMode) {
          const cx = terrainGroup.CX + terrainGroup.grp.position.x
          const cz = terrainGroup.CZ + terrainGroup.grp.position.z
          projVec.set(cx, 1.5, cz)
          projVec.project(camera)
          dh.style.left = `${((projVec.x + 1) / 2) * rect2.width}px`
          dh.style.top  = `${((-projVec.y + 1) / 2) * rect2.height}px`
          dh.style.display = 'flex'
        } else {
          dh.style.display = 'none'
        }
      }

      // ── Lidar popup position tracking ──
      if (lidarModeRef.current && lidarSelectedObjRef.current && lidarPopupEl.style.display !== 'none') {
        const obj = lidarSelectedObjRef.current
        projVec.set(obj.worldPos.x, (obj.tooltipY ?? 3) + 1, obj.worldPos.z)
        projVec.project(camera)
        const sx = ((projVec.x + 1) / 2) * rect2.width
        const sy = ((-projVec.y + 1) / 2) * rect2.height
        positionPopupFixed(lidarPopupEl, sx, sy, rect2)
      }

      // ── Confirmed resource badge ──
      const resEl = confirmedResourceBadgeRef.current
      if (resEl) {
        const resObj = selectedResourceObjRef.current
        if (resObj && !resourceSelectModeRef.current) {
          const obj = resObj.obj
          projVec.set(obj.worldPos.x, (obj.tooltipY ?? 3) + 2.5, obj.worldPos.z)
          projVec.project(camera)
          const bsx = ((projVec.x + 1) / 2) * rect2.width
          const bsy = ((-projVec.y + 1) / 2) * rect2.height
          const nameEl = resEl.querySelector('.v3d-resource-badge-name')
          if (nameEl) nameEl.textContent = obj.name
          resEl.style.left = `${bsx}px`
          resEl.style.top  = `${bsy}px`
          resEl.style.display = 'flex'
        } else {
          resEl.style.display = 'none'
        }
      }

      // ── Lidar object tags — suppressed; sceneObjLabelEls handles lidar display ──
      for (const { el } of lidarTagsRef.current) { el.style.display = 'none' }

      renderer.render(scene, camera)
    }
    tick()
    setSceneReady(v => v + 1)

    // ── Resize ──
    const ro = new ResizeObserver(() => {
      const nw = mount.clientWidth, nh = mount.clientHeight
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    })
    ro.observe(mount)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend',   onTouchEnd)
      document.removeEventListener('touchmove',  onTouchMove)
      clearTimeout(touchHideTimer)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerdown', onTerrainPointerDown)
      document.removeEventListener('pointermove', onTerrainPointerMove)
      document.removeEventListener('pointerup',   onTerrainPointerUp)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('click', onDocClick)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      if (mount.contains(tooltipEl))                                    mount.removeChild(tooltipEl)
      if (lblRoot.contains(confirmedResourceBadgeEl))                   lblRoot.removeChild(confirmedResourceBadgeEl)
      if (document.body.contains(lidarPopupEl)) document.body.removeChild(lidarPopupEl)
      for (const lbl of allLabelEls) {
        if (lblRoot.contains(lbl.el))    lblRoot.removeChild(lbl.el)
        if (lbl.popup && document.body.contains(lbl.popup)) document.body.removeChild(lbl.popup)
      }
      for (const pin of terrainPinsRef.current) {
        if (lblRoot.contains(pin.labelEl)) lblRoot.removeChild(pin.labelEl)
        scene.remove(pin.sphere); scene.remove(pin.stem); if (pin.ring) scene.remove(pin.ring)
      }
      terrainPinsRef.current = []
    }
  }, [])

  // ── Camera orbit ─────────────────────────────────────────────────────────────
  // Only updates the orbit state ref; actual camera.position is set in the tick loop.
  useEffect(() => {
    const radius = RADIUS_BASE / (zoom ?? 1)
    const az = (azimuth   * Math.PI) / 180
    const el = (elevation * Math.PI) / 180
    orbitStateRef.current = { az, el, radius }
  }, [azimuth, elevation, zoom])

  // ── Center camera on selected vehicle ────────────────────────────────────────
  useEffect(() => {
    if (!selectedVehicleId) {
      // Deselected — return to scene center
      lookAtTargetRef.current.set(0, 0, 0)
      return
    }
    const placement = BOBCAT_PLACEMENTS[selectedVehicleId]
    if (!placement) return

    if (isMobile) {
      // On mobile the chat is at the bottom — centre the vehicle directly
      lookAtTargetRef.current.set(placement.x, 0, placement.z)
    } else {
      // Shift the look-at point toward the left of the camera's view so the
      // vehicle lands in the visible right portion (not behind the side panel).
      const { az } = orbitStateRef.current
      const camRightX =  Math.cos(az)
      const camRightZ = -Math.sin(az)
      lookAtTargetRef.current.set(
        placement.x - camRightX * SELECT_LATERAL_OFFSET,
        0,
        placement.z - camRightZ * SELECT_LATERAL_OFFSET,
      )
    }
  }, [selectedVehicleId, isMobile])

  return (
    <div
      ref={mountRef}
      style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    />
  )
}
