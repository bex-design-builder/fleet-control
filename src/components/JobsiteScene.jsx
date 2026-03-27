import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { VEHICLES as DATA_VEHICLES } from '../data/vehicles'

const RADIUS_BASE = 70

const STATUS_LABELS = {
  intervention: 'Needs help',
  active:       'Working',
  paused:       'Paused',
  idle:         'Ready',
}

const STATUS_COLORS = {
  intervention: '#ea4335',
  active:       '#3dd430',
  paused:       '#f4b400',
  idle:         'rgba(255,255,255,0.35)',
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
    group.add(t)
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.35, 3.0), mBody)
  body.position.set(0, 1.17, 0)
  body.castShadow = true
  group.add(body)

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.55, 1.75), mCab)
  cab.position.set(0, 2.63, -0.38)
  cab.castShadow = true
  group.add(cab)

  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 0.07), mGlass)
  glass.position.set(0, 2.63, 0.49)
  group.add(glass)

  for (const ax of [-0.9, 0.9]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 2.3), mArm)
    arm.position.set(ax, 2.25, 0.9)
    arm.rotation.x = -0.36
    arm.castShadow = true
    group.add(arm)
  }

  const bkt = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.48, 0.65), mBkt)
  bkt.position.set(0, 0.78, 1.75)
  bkt.castShadow = true
  group.add(bkt)

  scene.add(group)

  // Collect all meshes in group for raycasting
  const meshes = []
  group.traverse(obj => { if (obj.isMesh) meshes.push(obj) })

  // Status ring — larger to encompass full vehicle, depthTest off so always on top
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.0, 3.8, 64),
    new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthTest: false }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.set(x, 0.06, z)
  ring.renderOrder = 10
  scene.add(ring)

  // Outer halo
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(3.8, 4.8, 64),
    new THREE.MeshBasicMaterial({ color: ringColor, side: THREE.DoubleSide, transparent: true, opacity: 0.22, depthTest: false }),
  )
  halo.rotation.x = -Math.PI / 2
  halo.position.set(x, 0.05, z)
  halo.renderOrder = 10
  scene.add(halo)

  return { group, meshes, ring, halo }
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
}) {
  const mountRef          = useRef(null)
  const cameraRef         = useRef(null)
  const rendererRef       = useRef(null)
  const rafRef            = useRef(null)
  const statusesRef       = useRef(effectiveVehicleStatuses)
  const onVehicleClickRef = useRef(onVehicleClick)

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
  const ringMeshesRef = useRef([]) // [{ ring, halo }, ...]

  useEffect(() => { statusesRef.current      = effectiveVehicleStatuses }, [effectiveVehicleStatuses])
  useEffect(() => { onVehicleClickRef.current = onVehicleClick           }, [onVehicleClick])

  // ── Scene setup (runs once) ───────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    const w = mount.clientWidth
    const h = mount.clientHeight

    // ── Scene ──
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x8fa8c0)
    scene.fog = new THREE.Fog(0x8fa8c0, 90, 220)

    // ── Lighting ──
    scene.add(new THREE.HemisphereLight(0xd6e8f5, 0x8b6e35, 0.7))
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

    add(box(28, 0.8, 18), mDirtDk, 8, -0.4, 8)

    // ── Concrete slab ──
    add(box(32, 0.3, 22), mConcrete, 6, 0.15, -4)
    add(box(32, 0.32, 0.15), mDirtDk, 6, 0.16, -4)
    add(box(0.15, 0.32, 22), mDirtDk, 6, 0.16, -4)

    // ── Site trailers ──
    add(box(11, 3.2, 5), mSteel, -8, 1.6, -19)
    add(box(10, 3.2, 5), mSteelDk, 6, 1.6, -19)
    add(box(2, 0.4, 1), mGravel, -13.5, 0.2, -18)
    add(box(2, 0.4, 1), mGravel, 10.5, 0.2, -18)

    // ── Building frame ──
    add(box(18, 0.3, 14), mConcrete, 24, 0.15, 6)
    for (const [cx, cz] of [[16,6],[33,6],[16,-2],[33,-2],[16,14],[33,14]])
      add(box(0.5, 9, 0.5), mSteelDk, cx, 4.5, cz)
    add(box(17.5, 0.4, 0.4), mSteelDk, 24.5, 9, 6)
    add(box(17.5, 0.4, 0.4), mSteelDk, 24.5, 9, -2)
    add(box(17.5, 0.4, 0.4), mSteelDk, 24.5, 9, 14)
    add(box(0.4, 0.4, 16.5), mSteelDk, 16, 9, 6)
    add(box(0.4, 0.4, 16.5), mSteelDk, 33, 9, 6)
    add(box(0.2, 9, 7), mSteel, 16, 4.5, 2.5)
    add(box(0.2, 9, 7), mSteel, 33, 4.5, 2.5)

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

    // ── Dirt mounds ──
    add(cone(9, 4.5, 10), mDirtDk, -22, 2.25, 16)
    add(cone(6, 3.5, 9),  mDirtDk, -30, 1.75, 23)
    add(cone(4, 2.5, 8),  mDirt,   -16, 1.25, 22)
    add(cone(11, 5.5, 12), mDirtDk, 30, 2.75, -20)
    add(cone(7, 3.8, 10), mDirtDk,  38, 1.9,  -14)

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
    fences.forEach(({ x, z, l, ry }) => {
      add(box(l, 0.12, 0.1), mOrange, x, 1.1, z, ry)
      add(box(l, 0.12, 0.1), mOrange, x, 0.6, z, ry)
      const cnt = Math.floor(l / 2)
      for (let i = 0; i <= cnt; i++) {
        const t = i / cnt - 0.5
        add(box(0.08, 1.4, 0.08), mOrange, ry ? x : x + t * l, 0.7, ry ? z + t * l : z)
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

    // ── Bobcat CTLs — build and register for hover ──
    const vehicleHoverTargets = []
    ringMeshesRef.current = []
    for (const [id, { x, z, ringColor, ry }] of Object.entries(BOBCAT_PLACEMENTS)) {
      const vehicleData = DATA_VEHICLES.find(v => v.id === id)
      const { group, meshes, ring, halo } = addBobcat(scene, x, z, ringColor, ry)
      vehicleHoverTargets.push({
        id,
        name: vehicleData?.name ?? id,
        staticStatus: vehicleData?.status ?? 'idle',
        worldPos: new THREE.Vector3(x, 0, z),
        meshes,
      })
      ringMeshesRef.current.push({ ring, halo })
    }

    // ── Excavators ──
    addExcavator(scene, 11,  6, -2.2)
    addExcavator(scene, 17, -6,  0.7)

    // ── Workers ──
    addWorker(scene,  4,  4, -2.6, 0xf4e20a, 0xffffff)
    addWorker(scene, 20, 11,  0.6, 0xf4811f, 0xf4d000)
    addWorker(scene, -4, -17,  1.3, 0xf4e20a, 0xff6600)

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

    // Track pointerdown position so we can distinguish click from orbit drag
    const ptrDown = { x: 0, y: 0 }
    const onPointerDown = (e) => { ptrDown.x = e.clientX; ptrDown.y = e.clientY }
    document.addEventListener('pointerdown', onPointerDown)

    // Click in capture phase so we can stopPropagation before map-scene handles it
    const onClick = (e) => {
      const rect = mount.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top  || e.clientY > rect.bottom) return
      // If the pointer moved more than 5px it was an orbit drag — ignore
      if (Math.hypot(e.clientX - ptrDown.x, e.clientY - ptrDown.y) > 5) return

      const clickVec = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1,
      )
      clickRaycaster.setFromCamera(clickVec, camera)
      for (const v of vehicleHoverTargets) {
        if (clickRaycaster.intersectObjects(v.meshes, false).length > 0) {
          e.stopPropagation()
          onVehicleClickRef.current?.(v.id)
          return
        }
      }
    }
    document.addEventListener('click', onClick, true)

    const raycaster      = new THREE.Raycaster()
    const clickRaycaster = new THREE.Raycaster()
    const projVec        = new THREE.Vector3()

    // ── Render loop ──────────────────────────────────────────────────────────────
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)

      // ── Animated rings ──
      const t = Date.now() * 0.001
      for (const { ring, halo } of ringMeshesRef.current) {
        // ring rotates forward; halo rotates backward — creates a "scanning" look
        ring.rotation.z =  t * 0.5
        halo.rotation.z = -t * 0.25
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
      for (const v of vehicleHoverTargets) {
        if (raycaster.intersectObjects(v.meshes, false).length > 0) {
          hovered = v
          break
        }
      }

      if (hovered) {
        const status      = statusesRef.current[hovered.id] ?? hovered.staticStatus
        const statusLabel = STATUS_LABELS[status] ?? status
        const statusColor = STATUS_COLORS[status]  ?? STATUS_COLORS.idle

        projVec.set(hovered.worldPos.x, 5.2, hovered.worldPos.z)
        projVec.project(camera)

        const rect = mount.getBoundingClientRect()
        const sx = ((projVec.x + 1) / 2) * rect.width
        const sy = ((-projVec.y + 1) / 2) * rect.height

        tooltipEl.innerHTML =
          `<span class="v3d-tt-name">${hovered.name}</span>` +
          `<span class="v3d-tt-status"><span class="v3d-tt-dot" style="background:${statusColor}"></span>${statusLabel}</span>`
        tooltipEl.style.left    = `${sx}px`
        tooltipEl.style.top     = `${sy}px`
        tooltipEl.style.display = 'flex'
      } else {
        tooltipEl.style.display = 'none'
      }

      renderer.render(scene, camera)
    }
    tick()

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
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('click', onClick, true)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      if (mount.contains(tooltipEl))           mount.removeChild(tooltipEl)
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
