// App.jsx
import { useState, useEffect, useRef } from 'react';
import './App.css';

const API_URL = 'http://localhost:8000';

// SVG Arc Speedometer Component
const Speedometer = ({ value, max = 1000, label, color, unit = 'Mbps', icon }) => {
  const [animatedValue, setAnimatedValue] = useState(0);
  const animationRef = useRef(null);
  const startValue = useRef(0);
  const startTime = useRef(null);

  useEffect(() => {
    if (value === null || value === undefined) {
      setAnimatedValue(0);
      return;
    }
    const targetValue = parseFloat(value);
    startValue.current = animatedValue;
    startTime.current = null;

    const animate = (timestamp) => {
      if (!startTime.current) startTime.current = timestamp;
      const progress = Math.min((timestamp - startTime.current) / 1200, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue.current + (targetValue - startValue.current) * eased;
      setAnimatedValue(current);
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [value]);

  const startAngle = -220;
  const endAngle = 40;
  const totalAngle = endAngle - startAngle;
  const clamped = Math.min(Math.max(animatedValue, 0), max);
  const progress = clamped / max;
  const needleAngle = startAngle + progress * totalAngle;

  // Arc path calculation
  const polarToCartesian = (cx, cy, r, angleDeg) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const describeArc = (cx, cy, r, start, end) => {
    const startPt = polarToCartesian(cx, cy, r, start);
    const endPt = polarToCartesian(cx, cy, r, end);
    const largeArc = end - start <= 180 ? 0 : 1;
    return `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`;
  };

  const ticks = [];
  const numTicks = 10;
  for (let i = 0; i <= numTicks; i++) {
    const angle = startAngle + (i / numTicks) * totalAngle;
    const outer = polarToCartesian(150, 150, 120, angle);
    const inner = polarToCartesian(150, 150, i % 5 === 0 ? 100 : 108, angle);
    ticks.push({ outer, inner, major: i % 5 === 0, angle });
  }

  return (
    <div className="speedometer-card">
      <div className="speedometer-header">
        <span className="speedometer-icon">{icon}</span>
        <span className="speedometer-label">{label}</span>
      </div>
      <div className="speedometer-svg-wrap">
        <svg viewBox="0 0 300 300" className="speedometer-svg">
          <defs>
            <linearGradient id={`grad-${label}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
            <filter id={`glow-${label}`}>
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background track */}
          <path
            d={describeArc(150, 150, 110, startAngle, endAngle)}
            stroke="var(--border)"
            strokeWidth="14"
            fill="none"
            strokeLinecap="round"
          />

          {/* Progress arc */}
          {progress > 0.001 && (
            <path
              d={describeArc(150, 150, 110, startAngle, startAngle + progress * totalAngle)}
              stroke={`url(#grad-${label})`}
              strokeWidth="14"
              fill="none"
              strokeLinecap="round"
              filter={`url(#glow-${label})`}
            />
          )}

          {/* Ticks */}
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.inner.x}
              y1={t.inner.y}
              x2={t.outer.x}
              y2={t.outer.y}
              stroke={t.major ? color : 'var(--text-muted)'}
              strokeWidth={t.major ? 2.5 : 1.5}
              strokeLinecap="round"
              opacity={t.major ? 0.9 : 0.5}
            />
          ))}

          {/* Needle */}
          <g
            style={{
              transform: `rotate(${needleAngle}deg)`,
              transformOrigin: '150px 150px',
              transition: 'transform 0.15s linear',
            }}
          >
            <line
              x1="150"
              y1="150"
              x2="150"
              y2="55"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="150" cy="150" r="8" fill={color} />
            <circle cx="150" cy="150" r="4" fill="var(--bg)" />
          </g>

          {/* Center value text */}
          <text
            x="150"
            y="205"
            textAnchor="middle"
            className="speedo-value-text"
            fill="var(--text-h)"
            fontSize="34"
            fontWeight="700"
          >
            {value !== null && value !== undefined ? animatedValue.toFixed(value > 100 ? 0 : 1) : '—'}
          </text>
          <text
            x="150"
            y="228"
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="12"
            fontWeight="600"
            letterSpacing="1"
          >
            {unit}
          </text>
        </svg>
      </div>
    </div>
  );
};

function App() {
  const [ping, setPing] = useState(null);
  const [downloadSpeed, setDownloadSpeed] = useState(null);
  const [uploadSpeed, setUploadSpeed] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState('Ready to test');
  const [currentPhase, setCurrentPhase] = useState(null); // 'ping' | 'download' | 'upload'
  const [elapsed, setElapsed] = useState(0);
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [testComplete, setTestComplete] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('speedtest-history') || '[]');
    } catch {
      return [];
    }
  });

  const timerRef = useRef(null);
  const liveSpeedRef = useRef(0);

  const calculateMbps = (bytes, seconds) => {
    const bits = bytes * 8;
    const megabits = bits / 1000000;
    return (megabits / seconds).toFixed(2);
  };

  // Elapsed timer
  useEffect(() => {
    if (isTesting) {
      setElapsed(0);
      const start = performance.now();
      timerRef.current = setInterval(() => {
        setElapsed(((performance.now() - start) / 1000).toFixed(1));
      }, 100);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isTesting]);

  // Persist history
  useEffect(() => {
    localStorage.setItem('speedtest-history', JSON.stringify(history.slice(0, 5)));
  }, [history]);

  const runTest = async () => {
    setIsTesting(true);
    setTestComplete(false);
    setPing(null);
    setDownloadSpeed(null);
    setUploadSpeed(null);
    setLiveSpeed(0);
    liveSpeedRef.current = 0;

    try {
      // 1. PING
      setCurrentPhase('ping');
      setStatus('Measuring latency…');
      const pingStart = performance.now();
      await fetch(`${API_URL}/ping`);
      const pingEnd = performance.now();
      const pingVal = (pingEnd - pingStart).toFixed(0);
      setPing(pingVal);

      // 2. DOWNLOAD
      setCurrentPhase('download');
      setStatus('Testing download speed…');
      const downloadSize = 25000000;
      const dlStart = performance.now();
      const response = await fetch(`${API_URL}/download?size=${downloadSize}`);
      const reader = response.body.getReader();
      let bytesReceived = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesReceived += value.length;
        const now = performance.now();
        const secs = (now - dlStart) / 1000;
        if (secs > 0.2) {
          const live = calculateMbps(bytesReceived, secs);
          liveSpeedRef.current = live;
          setLiveSpeed(live);
        }
      }

      const dlEnd = performance.now();
      const dlSeconds = (dlEnd - dlStart) / 1000;
      const dlSpeed = calculateMbps(bytesReceived, dlSeconds);
      setDownloadSpeed(dlSpeed);

      // 3. UPLOAD
      setCurrentPhase('upload');
      setStatus('Testing upload speed…');
      setLiveSpeed(0);
      const uploadSize = 10000000;
      const blob = new Blob([new ArrayBuffer(uploadSize)]);
      const formData = new FormData();
      formData.append('file', blob, 'testfile.bin');

      const ulStart = performance.now();
      await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });
      const ulEnd = performance.now();
      const ulSeconds = (ulEnd - ulStart) / 1000;
      const ulSpeed = calculateMbps(uploadSize, ulSeconds);
      setUploadSpeed(ulSpeed);

      setStatus('Test complete');
      setTestComplete(true);
      setHistory((prev) => [
        {
          ping: pingVal,
          download: dlSpeed,
          upload: ulSpeed,
          date: new Date().toLocaleString(),
        },
        ...prev,
      ]);
    } catch (error) {
      console.error(error);
      setStatus('Connection error — is the backend running?');
    } finally {
      setIsTesting(false);
      setCurrentPhase(null);
    }
  };

  const phaseLabel = {
    ping: 'Ping',
    download: 'Download',
    upload: 'Upload',
  };

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-dot" />
          <span className="brand-text">SpeedPulse</span>
        </div>
        <div className={`status-pill ${isTesting ? 'testing' : testComplete ? 'done' : ''}`}>
          {isTesting && <span className="pulse-dot" />}
          <span>{status}</span>
          {isTesting && <span className="timer">{elapsed}s</span>}
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {/* Live status bar during test */}
        <div className={`live-bar ${isTesting ? 'active' : ''}`}>
          {['ping', 'download', 'upload'].map((phase) => (
            <div
              key={phase}
              className={`live-step ${
                currentPhase === phase ? 'current' : ''
              } ${ping !== null && phase === 'ping' ? 'done' : ''} ${
                downloadSpeed !== null && phase === 'download' ? 'done' : ''
              } ${uploadSpeed !== null && phase === 'upload' ? 'done' : ''}`}
            >
              <span className="live-step-dot" />
              <span className="live-step-label">{phaseLabel[phase]}</span>
            </div>
          ))}
        </div>

        {/* Speedometers Grid */}
        <div className="gauge-grid">
          <Speedometer
            value={isTesting && currentPhase === 'ping' ? null : ping}
            max={300}
            label="Ping"
            color="#f59e0b"
            unit="ms"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            }
          />
          <Speedometer
            value={
              isTesting && currentPhase === 'download'
                ? parseFloat(liveSpeed)
                : downloadSpeed
            }
            max={1000}
            label="Download"
            color="#3b82f6"
            unit="Mbps"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 21h14" strokeLinecap="round" />
              </svg>
            }
          />
          <Speedometer
            value={uploadSpeed}
            max={1000}
            label="Upload"
            color="#a855f7"
            unit="Mbps"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 21V9m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 3h14" strokeLinecap="round" />
              </svg>
            }
          />
        </div>

        {/* CTA Button */}
        <div className="cta-wrap">
          <button
            className={`cta-button ${isTesting ? 'running' : ''}`}
            onClick={runTest}
            disabled={isTesting}
          >
            {isTesting ? (
              <>
                <span className="spinner" />
                Testing…
              </>
            ) : testComplete ? (
              'Test Again'
            ) : (
              'Start Test'
            )}
          </button>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="history-section">
            <h2 className="history-title">Recent Results</h2>
            <div className="history-list">
              {history.slice(0, 5).map((h, i) => (
                <div key={i} className="history-item">
                  <span className="history-date">{h.date}</span>
                  <div className="history-metrics">
                    <span className="history-metric ping">
                      <span className="metric-dot" /> {h.ping} ms
                    </span>
                    <span className="history-metric download">
                      <span className="metric-dot" /> {h.download} Mbps
                    </span>
                    <span className="history-metric upload">
                      <span className="metric-dot" /> {h.upload} Mbps
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>Powered by local backend</span>
        <span className="footer-dot">•</span>
        <span>{API_URL}</span>
      </footer>
    </div>
  );
}

export default App;
