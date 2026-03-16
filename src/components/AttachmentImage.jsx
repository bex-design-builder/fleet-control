function SmoothBucket() {
  return (
    <svg viewBox="0 0 200 145" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sm-main" x1="10%" y1="5%" x2="90%" y2="95%">
          <stop offset="0%" stopColor="#494949" />
          <stop offset="55%" stopColor="#6d6d6d" />
          <stop offset="100%" stopColor="#8a8a8a" />
        </linearGradient>
        <linearGradient id="sm-side" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3e3e3e" />
          <stop offset="100%" stopColor="#222222" />
        </linearGradient>
        <linearGradient id="sm-btm" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2a2a2a" />
          <stop offset="100%" stopColor="#141414" />
        </linearGradient>
      </defs>
      <rect width="200" height="145" fill="#0d0d0d" />
      {/* Right side face */}
      <polygon points="162,20 180,36 176,104 158,95" fill="#2e2e2e" />
      {/* Bottom plate */}
      <polygon points="8,98 158,95 176,104 26,106" fill="url(#sm-btm)" />
      {/* Left side panel */}
      <polygon points="10,46 32,20 28,95 8,98" fill="url(#sm-side)" />
      {/* Main back plate */}
      <polygon points="32,20 162,20 158,95 28,95" fill="url(#sm-main)" />
      {/* Edge highlights */}
      <line x1="32" y1="20" x2="162" y2="20" stroke="#d0d0d0" strokeWidth="1.3" />
      <line x1="32" y1="20" x2="28" y2="95" stroke="#a8a8a8" strokeWidth="0.9" />
      <line x1="10" y1="46" x2="32" y2="20" stroke="#787878" strokeWidth="0.8" />
      <line x1="162" y1="20" x2="180" y2="36" stroke="#686868" strokeWidth="0.8" />
      <line x1="8" y1="98" x2="158" y2="95" stroke="#c0c0c0" strokeWidth="1.6" />
      <line x1="158" y1="95" x2="176" y2="104" stroke="#888888" strokeWidth="0.8" />
      <line x1="8" y1="98" x2="26" y2="106" stroke="#505050" strokeWidth="0.7" />
    </svg>
  )
}

function ToothedBucket() {
  const toothStarts = [28, 47, 66, 85, 104, 123, 142]
  return (
    <svg viewBox="0 0 200 145" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tb-main" x1="10%" y1="5%" x2="90%" y2="95%">
          <stop offset="0%" stopColor="#494949" />
          <stop offset="55%" stopColor="#6d6d6d" />
          <stop offset="100%" stopColor="#8a8a8a" />
        </linearGradient>
        <linearGradient id="tb-side" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3e3e3e" />
          <stop offset="100%" stopColor="#222222" />
        </linearGradient>
        <linearGradient id="tb-tf" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#777777" />
          <stop offset="100%" stopColor="#555555" />
        </linearGradient>
      </defs>
      <rect width="200" height="145" fill="#0d0d0d" />
      {/* Right side face */}
      <polygon points="162,20 180,36 177,88 158,86" fill="#2e2e2e" />
      {/* Left side panel */}
      <polygon points="10,46 32,20 28,86 8,88" fill="url(#tb-side)" />
      {/* Main back plate */}
      <polygon points="32,20 162,20 158,86 28,86" fill="url(#tb-main)" />
      {/* Teeth */}
      {toothStarts.map((tx, i) => (
        <g key={i}>
          <rect x={tx} y={86} width={13} height={18} fill="url(#tb-tf)" />
          <polygon points={`${tx + 13},86 ${tx + 15},88 ${tx + 15},104 ${tx + 13},104`} fill="#353535" />
          <line x1={tx} y1={104} x2={tx + 13} y2={104} stroke="#c8c8c8" strokeWidth="1.1" />
          <line x1={tx} y1={86} x2={tx} y2={104} stroke="#888888" strokeWidth="0.5" />
        </g>
      ))}
      {/* Edge highlights */}
      <line x1="32" y1="20" x2="162" y2="20" stroke="#d0d0d0" strokeWidth="1.3" />
      <line x1="32" y1="20" x2="28" y2="86" stroke="#a8a8a8" strokeWidth="0.9" />
      <line x1="10" y1="46" x2="32" y2="20" stroke="#787878" strokeWidth="0.8" />
      <line x1="162" y1="20" x2="180" y2="36" stroke="#686868" strokeWidth="0.8" />
      <line x1="8" y1="88" x2="28" y2="86" stroke="#999999" strokeWidth="0.8" />
      <line x1="28" y1="86" x2="158" y2="86" stroke="#909090" strokeWidth="0.7" />
    </svg>
  )
}

function PalletForks() {
  const gridH = [22, 33, 44, 55, 66, 77]
  const gridV = [33, 48, 63, 78, 93, 108, 123, 138, 153, 163]
  return (
    <svg viewBox="0 0 200 155" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pf-plate" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#383838" />
          <stop offset="100%" stopColor="#2c2c2c" />
        </linearGradient>
        <linearGradient id="pf-bar" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5a5a5a" />
          <stop offset="100%" stopColor="#3c3c3c" />
        </linearGradient>
        <linearGradient id="pf-fork" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#585858" />
          <stop offset="100%" stopColor="#8a8a8a" />
        </linearGradient>
        <linearGradient id="pf-bracket-l" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#383838" />
          <stop offset="100%" stopColor="#242424" />
        </linearGradient>
      </defs>
      <rect width="200" height="155" fill="#0d0d0d" />
      {/* Side brackets */}
      <polygon points="20,12 10,18 10,90 20,90" fill="url(#pf-bracket-l)" />
      <polygon points="175,12 185,18 185,90 175,90" fill="#222222" />
      {/* Main mesh plate */}
      <rect x="20" y="12" width="155" height="78" fill="url(#pf-plate)" />
      {/* Grid */}
      {gridH.map(y => (
        <line key={`h${y}`} x1="20" y1={y} x2="175" y2={y} stroke="#484848" strokeWidth="0.8" />
      ))}
      {gridV.map(x => (
        <line key={`v${x}`} x1={x} y1="12" x2={x} y2="90" stroke="#484848" strokeWidth="0.8" />
      ))}
      {/* Top crossbar */}
      <rect x="17" y="5" width="161" height="11" fill="url(#pf-bar)" />
      {/* Bottom bar */}
      <rect x="20" y="90" width="155" height="9" fill="url(#pf-bar)" />
      {/* Plate edges */}
      <line x1="20" y1="12" x2="175" y2="12" stroke="#707070" strokeWidth="0.9" />
      <line x1="20" y1="12" x2="20" y2="90" stroke="#5a5a5a" strokeWidth="0.8" />
      <line x1="175" y1="12" x2="175" y2="90" stroke="#4a4a4a" strokeWidth="0.8" />
      <line x1="17" y1="5" x2="178" y2="5" stroke="#b0b0b0" strokeWidth="1.1" />
      {/* Left fork tine */}
      <polygon points="38,99 63,99 49,143 24,143" fill="url(#pf-fork)" />
      <polygon points="63,99 68,102 54,143 49,143" fill="#343434" />
      <line x1="24" y1="143" x2="54" y2="143" stroke="#c8c8c8" strokeWidth="1.3" />
      <line x1="38" y1="99" x2="63" y2="99" stroke="#888888" strokeWidth="0.8" />
      {/* Right fork tine */}
      <polygon points="112,99 137,99 123,143 98,143" fill="url(#pf-fork)" />
      <polygon points="137,99 142,102 128,143 123,143" fill="#343434" />
      <line x1="98" y1="143" x2="128" y2="143" stroke="#c8c8c8" strokeWidth="1.3" />
      <line x1="112" y1="99" x2="137" y2="99" stroke="#888888" strokeWidth="0.8" />
    </svg>
  )
}

export default function AttachmentImage({ id }) {
  if (id === 'bucket') return <SmoothBucket />
  if (id === 'tooth-bucket') return <ToothedBucket />
  if (id === 'pallet-forks') return <PalletForks />
  return null
}
