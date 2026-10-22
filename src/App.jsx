// App.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API_URL = 'https://speedtest-backend-ofvb.onrender.com';

/* ---------------- Toast System ---------------- */
function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          onAnimationEnd={(e) => {
            if (e.animationName === 'toastOut') onDismiss(t.id);
          }}
        >
          <div className="toast-icon">
            {t.type === 'start' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {t.type === 'success' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M8 12l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {t.type === 'error' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16v.5" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-message">{t.message}</div>}
          </div>
          <div className="toast-progress" />
        </div>
      ))}
    </div>
  );
}

/* ---------------- Animated Counter (YouTube-style) ---------------- */
function AnimatedCounter({ value, decimals = 1, duration }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const prevRef = useRef(0);

  useEffect(() => {
    if (value === null || value === undefined || isNaN(value)) {
      setDisplay(0);
      prevRef.current = 0;
      return;
    }
    const target = parseFloat(value);
    const start = prevRef.current;
    const delta = target - start;
    // duration scales with magnitude but bounded; larger jumps are quicker but still smooth
    const baseDur = duration ?? Math.min(2000, Math.max(600, Math.abs(delta) * 25));
    const startTime = performance.now();

    const tick = (now) => {
      const p = Math.min((now - startTime) / baseDur, 1);
      // easeOutExpo for a snappy but smooth finish
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      const current = start + delta * eased;
      setDisplay(current);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = target;
      }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  if (value === null || value === undefined || isNaN(value)) return <>—</>;
  return <>{display.toFixed(decimals)}</>;
}

/* ---------------- Speedometer Gauge ---------------- */
function Speedometer({ value, max = 1000, label, color, unit = 'Mbps', icon, live = false }) {
  const numeric = value === null || value === undefined || isNaN(value) ? null : parseFloat(value);
  const clamped = numeric === null ? 0 : Math.min(Math.max(numeric, 0), max);
  const progress = clamped / max;

  const startAngle = -220;
  const endAngle = 40;
  const totalAngle = endAngle - startAngle;
  const needleAngle = startAngle + progress * totalAngle;

  const polar = (cx, cy, r, deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const arc = (cx, cy, r, s, e) => {
    const a = polar(cx, cy, r, s);
    const b = polar(cx, cy, r, e);
    const large = e - s <= 180 ? 0 : 1;
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
  };

  const ticks = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const ang = startAngle + (i / N) * totalAngle;
    const outer = polar(150, 150, 118, ang);
    const inner = polar(150, 150, i % 5 === 0 ? 98 : 106, ang);
    ticks.push({ outer, inner, major: i % 5 === 0 });
  }

  return (
    <div className={`gauge-card ${live ? 'live' : ''}`}>
      <div className="gauge-head">
        <span className="gauge-icon" style={{ color }}>{icon}</span>
        <span className="gauge-label">{label}</span>
        {live && <span className="gauge-live-dot" style={{ background: color }} />}
      </div>
      <div className="gauge-svg-wrap">
        <svg viewBox="0 0 300 300" className="gauge-svg">
          <defs>
            <linearGradient id={`g-${label}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
            <filter id={`glow-${label}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path d={arc(150, 150, 110, startAngle, endAngle)} stroke="var(--gauge-track)" strokeWidth="14" fill="none" strokeLinecap="round" />

          {progress > 0.002 && (
            <path
              d={arc(150, 150, 110, startAngle, startAngle + progress * totalAngle)}
              stroke={`url(#g-${label})`}
              strokeWidth="14"
              fill="none"
              strokeLinecap="round"
              filter={`url(#glow-${label})`}
              style={{ transition: 'd 0.15s linear' }}
            />
          )}

          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.inner.x} y1={t.inner.y}
              x2={t.outer.x} y2={t.outer.y}
              stroke={t.major ? color : 'var(--gauge-tick)'}
              strokeWidth={t.major ? 2.5 : 1.5}
              strokeLinecap="round"
              opacity={t.major ? 0.9 : 0.45}
            />
          ))}

          <g style={{ transform: `rotate(${needleAngle}deg)`, transformOrigin: '150px 150px', transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)' }}>
            <line x1="150" y1="150" x2="150" y2="55" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <circle cx="150" cy="150" r="9" fill={color} />
            <circle cx="150" cy="150" r="4" fill="var(--bg)" />
          </g>

          <text x="150" y="208" textAnchor="middle" className="gauge-value" fill="var(--text-h)">
            <AnimatedCounter value={numeric} decimals={max > 200 ? 1 : 0} />
          </text>
          <text x="150" y="230" textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontWeight="700" letterSpacing="2">
            {unit}
          </text>
        </svg>
      </div>
    </div>
  );
}

/* ---------------- Main App ---------------- */
function App() {
  const [ping, setPing] = useState(null);
  const [downloadSpeed, setDownloadSpeed] = useState(null);
  const [uploadSpeed, setUploadSpeed] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState('Ready to test');
  const [phase, setPhase] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [liveDl, setLiveDl] = useState(null);
  const [liveUl, setLiveUl] = useState(null);
  const [complete, setComplete] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [toasts, setToasts] = useState([]);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('speedtest-history') || '[]'); }
    catch { return []; }
  });

  const timerRef = useRef(null);
  const toastIdRef = useRef(0);

  /* Theme */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  /* History persist */
  useEffect(() => {
    localStorage.setItem('speedtest-history', JSON.stringify(history.slice(0, 6)));
  }, [history]);

  /* Elapsed timer */
  useEffect(() => {
    if (isTesting) {
      const start = performance.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(((performance.now() - start) / 1000).toFixed(1));
      }, 100);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isTesting]);

  const pushToast = useCallback((type, title, message, ms = 4000) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, type, title, message, ms }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const calculateMbps = (bytes, seconds) => {
    if (seconds <= 0) return '0.00';
    const bits = bytes * 8;
    return (bits / 1000000 / seconds).toFixed(2);
  };

  const runTest = async () => {
    setIsTesting(true);
    setComplete(false);
    setPing(null);
    setDownloadSpeed(null);
    setUploadSpeed(null);
    setLiveDl(null);
    setLiveUl(null);
    pushToast('start', 'Speed test started', 'Measuring your connection…');

    try {
      /* --- PING --- */
      setPhase('ping');
      setStatus('Measuring latency…');
      const pStart = performance.now();
      await fetch(`${API_URL}/ping`, { cache: 'no-store' });
      const pEnd = performance.now();
      const pingVal = (pEnd - pStart).toFixed(0);
      setPing(pingVal);

      /* --- DOWNLOAD --- */
      setPhase('download');
      setStatus('Testing download…');
      const dlSize = 25000000;
      const dlStart = performance.now();
      const dlResp = await fetch(`${API_URL}/download?size=${dlSize}&t=${Date.now()}`, { cache: 'no-store' });
      const reader = dlResp.body.getReader();
      let received = 0;
      let lastUpdate = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        const now = performance.now();
        const secs = (now - dlStart) / 1000;
        if (secs > 0.15 && now - lastUpdate > 80) {
          lastUpdate = now;
          setLiveDl(calculateMbps(received, secs));
        }
      }
      const dlEnd = performance.now();
      const dlSec = (dlEnd - dlStart) / 1000;
      const dlResult = calculateMbps(received, dlSec);
      setDownloadSpeed(dlResult);
      setLiveDl(null);

      /* --- UPLOAD --- */
      setPhase('upload');
      setStatus('Testing upload…');
      const ulSize = 10000000;
      const blob = new Blob([new ArrayBuffer(ulSize)]);
      const fd = new FormData();
      fd.append('file', blob, 'test.bin');

      const ulStart = performance.now();
      // Simulate live upload progress updates
      const ulTickRef = { id: null };
      const ulStartBytes = ulSize;
      const progressInterval = setInterval(() => {
        const now = performance.now();
        const secs = (now - ulStart) / 1000;
        // Fake gradual progress for visual feedback
        const frac = Math.min(secs / Math.max(secs, 2), 0.9);
        const fakeBytes = ulStartBytes * frac;
        setLiveUl(calculateMbps(fakeBytes, secs));
      }, 120);

      await fetch(`${API_URL}/upload`, { method: 'POST', body: fd });
      clearInterval(progressInterval);

      const ulEnd = performance.now();
      const ulSec = (ulEnd - ulStart) / 1000;
      const ulResult = calculateMbps(ulSize, ulSec);
      setUploadSpeed(ulResult);
      setLiveUl(null);

      setStatus('Test complete');
      setComplete(true);
      pushToast(
        'success',
        'Test complete!',
        `↓ ${dlResult} Mbps · ↑ ${ulResult} Mbps · ${pingVal} ms`,
        5000
      );

      setHistory((prev) => [
        { ping: pingVal, download: dlResult, upload: ulResult, date: new Date().toLocaleString() },
        ...prev,
      ]);
    } catch (err) {
      console.error(err);
      setStatus('Connection error');
      pushToast('error', 'Test failed', 'Make sure the backend is running.');
    } finally {
      setIsTesting(false);
      setPhase(null);
    }
  };

  const phaseLabel = { ping: 'Ping', download: 'Download', upload: 'Upload' };

  return (
    <div className="app-shell">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Animated background */}
      <div className="bg-blobs" aria-hidden="true">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <span className="brand-ring" />
            <span className="brand-core" />
          </div>
          <span className="brand-text">SpeedPulse</span>
        </div>

        <div className="header-right">
          <div className={`status-pill ${isTesting ? 'testing' : complete ? 'done' : ''}`}>
            {isTesting && <span className="pulse-dot" />}
            <span>{status}</span>
            {isTesting && <span className="timer">{elapsed}s</span>}
          </div>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className={`live-bar ${isTesting ? 'active' : ''}`}>
          {['ping', 'download', 'upload'].map((p) => {
            const done =
              (p === 'ping' && ping !== null) ||
              (p === 'download' && downloadSpeed !== null) ||
              (p === 'upload' && uploadSpeed !== null);
            return (
              <div
                key={p}
                className={`live-step ${phase === p ? 'current' : ''} ${done ? 'done' : ''}`}
              >
                <span className="live-step-dot" />
                <span className="live-step-label">{phaseLabel[p]}</span>
              </div>
            );
          })}
        </div>

        <div className="gauge-grid">
          <Speedometer
            value={ping}
            max={200}
            label="Ping"
            color="#f59e0b"
            unit="ms"
            live={phase === 'ping'}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
              </svg>
            }
          />
          <Speedometer
            value={phase === 'download' ? liveDl : downloadSpeed}
            max={1000}
            label="Download"
            color="#3b82f6"
            unit="Mbps"
            live={phase === 'download'}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 20h14" strokeLinecap="round" />
              </svg>
            }
          />
          <Speedometer
            value={phase === 'upload' ? liveUl : uploadSpeed}
            max={1000}
            label="Upload"
            color="#a855f7"
            unit="Mbps"
            live={phase === 'upload'}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20V8m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 4h14" strokeLinecap="round" />
              </svg>
            }
          />
        </div>

        <div className="cta-wrap">
          <button className={`cta-button ${isTesting ? 'running' : ''}`} onClick={runTest} disabled={isTesting}>
            {isTesting ? (
              <>
                <span className="spinner" />
                <span>Testing…</span>
              </>
            ) : complete ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="cta-icon">
                  <path d="M21 12a9 9 0 11-3-6.7" strokeLinecap="round" />
                  <path d="M21 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Test Again</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor" className="cta-icon">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Start Test</span>
              </>
            )}
          </button>
        </div>

        {history.length > 0 && (
          <div className="history-section">
            <h2 className="history-title">Recent Results</h2>
            <div className="history-list">
              {history.slice(0, 6).map((h, i) => (
                <div key={i} className="history-item" style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="history-date">{h.date}</span>
                  <div className="history-metrics">
                    <span className="history-metric ping"><span className="metric-dot" />{h.ping} ms</span>
                    <span className="history-metric download"><span className="metric-dot" />{h.download} Mbps</span>
                    <span className="history-metric upload"><span className="metric-dot" />{h.upload} Mbps</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>Connected to</span>
        <span className="footer-url">{API_URL}</span>
      </footer>
    </div>
  );
}

export default App;
