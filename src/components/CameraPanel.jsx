import './CameraPanel.css'

export default function CameraPanel({ vehicle }) {
  if (!vehicle) return null
  return (
    <div className="camera-panel" role="region" aria-label={`${vehicle.name} camera views`}>
      <div className="camera-panel-inner">
        <div className="camera-view">
          <div className="camera-view-placeholder">
            <span className="camera-view-label">Front</span>
            <img
              src="/camera-front.png"
              alt="Front camera view"
              className="camera-view-img"
            />
          </div>
        </div>
        <div className="camera-view">
          <div className="camera-view-placeholder">
            <span className="camera-view-label">Back</span>
            <img
              src="/camera-back.png"
              alt="Back camera view"
              className="camera-view-img"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
