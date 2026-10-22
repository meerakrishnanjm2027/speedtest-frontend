// App.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const API_URL = 'https://speedtest-backend-ofvb.onrender.com'; // unchanged

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * FIX: throughput is returned as a NUMBER (the original returned a string from
 * toFixed(), which then leaked into state, refs and comparisons).
 * Mbps = bytes * 8 / 1,000,000 / seconds
 */
const calculateMbps = (bytes, seconds) => {
  if (!seconds || seconds <= 0) return 0;
  return (bytes * 8) / 1_000_000 / seconds;
};

/**
 * Counting transition. Eases toward `target`; duration grows with sqrt(change),
 * so bigger jumps cover more distance per second (faster) and small changes ease gently.
 */
function useCountTo(target) {
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    if (prefersReducedMotion()) {
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    const delta = Math.abs(target - from);
    if (delta < 0.005) {
      current.current = target;
      setValue(target);
      return;
    }
    const duration = Math.min(1800, 300 + 110 * Math.sqrt(delta));
    let raf;
    let t0 = null;
    const step = (ts) => {
      if (t0 === null) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (target - from) * eased;
      current.current = next;
      setValue(next);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return value;
}

/* ------------------------------------------------------------------ */
/* Gauge                                                               */
/* ------------------------------------------------------------------ */

// Non-linear scale so both 5 Mbps and 900 Mbps connections read well.
const MARKS = [0, 5, 10, 25, 50, 100, 250, 500, 1000];
const START = -225;
const END = 45;
const SWEEP = END - START;

const valueToFraction = (v) => {
  const x = Math.max(0, Math.min(v, MARKS[MARKS.length - 1]));
  for (let i = 0; i < MARKS.length - 1; i++) {
    if (x <= MARKS[i + 1]) {
      return (i + (x - MARKS[i]) / (MARKS[i + 1] - MARKS[i])) / (MARKS.length - 1);
    }
  }
  return 1;
};

const polar = (r, deg) => {
  const rad = (deg * Math.PI) / 180;
  return { x: 150 + r * Math.cos(rad), y: 150 + r * Math.sin(rad) };
};

const arcPath = (r, a0, a1) => {
  const s = polar(r, a0);
  const e = polar(r, a1);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
};

const TICKS = (() => {
  const out = [];
  const segs = MARKS.length - 1;
  const sub = 4;
  for (let i = 0; i <= segs * sub; i++) {
    const major = i % sub === 0;
    const angle = START + (i / (segs * sub)) * SWEEP;
    out.push({
      major,
      a: polar(major ? 98 : 104, angle),
      b: polar(112, angle),
      label: major ? { ...polar(80, angle), text: MARKS[i / sub] } : null,
    });
  }
  return out;
})();

function Gauge({ reading, phaseLabel, active }) {
  const shown = useCountTo(reading);
  const frac = valueToFraction(shown);
  const angle = START + frac * SWEEP;

  return (
    <svg
      viewBox="0 0 300 262"
      className={`gauge ${active ? 'is-active' : ''}`}
      role="img"
      aria-label={`${phaseLabel}: ${shown.toFixed(1)} Mbps`}
    >
      <path d={arcPath(126, START, END)} className="gauge-track" />
      {frac > 0.002 && <path d={arcPath(126, START, angle)} className="gauge-progress" />}

      {TICKS.map((t, i) => (
        <g key={i}>
          <line
            x1={t.a.x}
            y1={t.a.y}
            x2={t.b.x}
            y2={t.b.y}
            className={t.major ? 'tick tick-major' : 'tick'}
          />
          {t.label && (
            <text x={t.label.x} y={t.label.y} className="tick-label" textAnchor="middle" dominantBaseline="central">
              {t.label.text}
            </text>
          )}
        </g>
      ))}

      {/* Needle: drawn pointing east, rotated by the same angle used for the arc */}
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '150px 150px' }}>
        <line x1="138" y1="150" x2="238" y2="150" className="needle" />
        <circle cx="150" cy="150" r="9" className="needle-hub" />
        <circle cx="150" cy="150" r="3.5" className="needle-pin" />
      </g>

      <text x="150" y="214" textAnchor="middle" className="gauge-reading">
        {shown.toFixed(shown >= 100 ? 0 : 1)}
      </text>
      <text x="150" y="236" textAnchor="middle" className="gauge-unit">
        Mbps
      </text>
      <text x="150" y="256" textAnchor="middle" className="gauge-phase">
        {phaseLabel}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

function StatCard({ label, value, unit, digits, tone, active }) {
  const shown = useCountTo(value ?? 0);
  return (
    <div className={`stat-card ${tone} ${active ? 'is-active' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value === null ? '—' : shown.toFixed(digits)}
        <span className="stat-unit">{unit}</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts (non-blocking: container ignores pointer events)             */
/* ------------------------------------------------------------------ */

function Toasts({ toasts, onClose }) {
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind} ${t.leaving ? 'leaving' : ''}`} role="status">
          <div className="toast-body">
            <strong>{t.title}</strong>
            <span>{t.text}</span>
          </div>
          <button className="toast-close" onClick={() => onClose(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

// Saved choice → system preference on first load → light.
const initialTheme = () => {
  try {
    const saved = localStorage.getItem('speedtest-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* ignore */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/* ------------------------------------------------------------------ */
/* Upload helper                                                       */
/* ------------------------------------------------------------------ */

/**
 * FIX: fetch() cannot report upload progress, so upload Mbps could only be
 * computed once at the very end (and included server response time).
 * Same POST + same FormData + same URL, sent with XHR so bytes sent are observable.
 */
const uploadWithProgress = (url, formData, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let t0 = 0;
    let sentAt = 0;
    xhr.upload.onloadstart = () => (t0 = performance.now());
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const secs = (performance.now() - t0) / 1000;
      if (secs > 0.1) onProgress(calculateMbps(e.loaded, secs));
    };
    xhr.upload.onload = () => (sentAt = performance.now()); // body fully sent
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`Upload failed (${xhr.status})`));
      resolve({ seconds: ((sentAt || performance.now()) - t0) / 1000 });
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.open('POST', url);
    xhr.send(formData);
  });

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

const PHASES = ['ping', 'download', 'upload'];
const PHASE_LABEL = { ping: 'Ping', download: 'Download', upload: 'Upload' };

function App() {
  const [ping, setPing] = useState(null);
  const [downloadSpeed, setDownloadSpeed] = useState(null);
  const [uploadSpeed, setUploadSpeed] = useState(null);
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [isTesting, setIsTesting] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(null);
  const [testComplete, setTestComplete] = useState(false);
  const [status, setStatus] = useState('Ready to test');
  const [elapsed, setElapsed] = useState('0.0');
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState(initialTheme);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('speedtest-history') || '[]');
    } catch {
      return [];
    }
  });

  const toastId = useRef(0);
  const lastLiveUpdate = useRef(0);

  /* theme */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('speedtest-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  /* toasts */
  const closeToast = useCallback((id) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 250);
  }, []);

  const pushToast = useCallback(
    (kind, title, text) => {
      const id = ++toastId.current;
      setToasts((t) => [...t, { id, kind, title, text }]);
      setTimeout(() => closeToast(id), 4000);
    },
    [closeToast]
  );

  /* elapsed timer */
  useEffect(() => {
    if (!isTesting) return;
    const start = performance.now();
    setElapsed('0.0');
    const timer = setInterval(() => setElapsed(((performance.now() - start) / 1000).toFixed(1)), 100);
    return () => clearInterval(timer);
  }, [isTesting]);

  /* history */
  useEffect(() => {
    try {
      localStorage.setItem('speedtest-history', JSON.stringify(history.slice(0, 5)));
    } catch {
      /* ignore */
    }
  }, [history]);

  // Throttle live updates to ~10/sec; the counter hook smooths between them.
  const updateLive = (mbps) => {
    const now = performance.now();
    if (now - lastLiveUpdate.current < 100) return;
    lastLiveUpdate.current = now;
    setLiveSpeed(mbps);
  };

  const runTest = async () => {
    setIsTesting(true);
    setTestComplete(false);
    setPing(null);
    setDownloadSpeed(null);
    setUploadSpeed(null);
    setLiveSpeed(0);
    pushToast('info', 'Test started', 'Measuring ping, download and upload.');

    try {
      // 1. PING (unchanged flow)
      setCurrentPhase('ping');
      setStatus('Measuring latency…');
      const pingStart = performance.now();
      await fetch(`${API_URL}/ping`);
      const pingVal = Math.round(performance.now() - pingStart);
      setPing(pingVal);

      // 2. DOWNLOAD — same URL / size / streaming read as before
      setCurrentPhase('download');
      setStatus('Testing download speed…');
      setLiveSpeed(0);
      const downloadSize = 25000000;
      const dlStart = performance.now();
      const response = await fetch(`${API_URL}/download?size=${downloadSize}`);
      if (!response.ok) throw new Error(`Download failed (${response.status})`); // FIX: don't time an error page
      const reader = response.body.getReader();
      let bytesReceived = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesReceived += value.length;
        // FIX: live reading updated as bytes arrive (numeric, throttled)
        const secs = (performance.now() - dlStart) / 1000;
        if (secs > 0.2) updateLive(calculateMbps(bytesReceived, secs));
      }

      // FIX: final value = total bytes actually received / total elapsed time
      const dlSeconds = (performance.now() - dlStart) / 1000;
      const dlSpeed = calculateMbps(bytesReceived, dlSeconds);
      setLiveSpeed(dlSpeed);
      setDownloadSpeed(dlSpeed);

      // 3. UPLOAD — same POST /upload with the same FormData
      setCurrentPhase('upload');
      setStatus('Testing upload speed…');
      setLiveSpeed(0);
      lastLiveUpdate.current = 0;
      const uploadSize = 10000000;
      const blob = new Blob([new ArrayBuffer(uploadSize)]);
      const formData = new FormData();
      formData.append('file', blob, 'testfile.bin');

      // FIX: live progress + time measured until the body is sent
      const { seconds } = await uploadWithProgress(`${API_URL}/upload`, formData, updateLive);
      const ulSpeed = calculateMbps(uploadSize, seconds);
      setLiveSpeed(ulSpeed);
      setUploadSpeed(ulSpeed);

      setStatus('Test complete');
      setTestComplete(true);
      setHistory((prev) => [
        { ping: pingVal, download: dlSpeed, upload: ulSpeed, date: new Date().toLocaleString() },
        ...prev,
      ]);
      pushToast(
        'success',
        'Test complete',
        `${dlSpeed.toFixed(1)} Mbps down · ${ulSpeed.toFixed(1)} Mbps up · ${pingVal} ms`
      );
    } catch (error) {
      console.error(error);
      setStatus('Connection error — is the backend running?');
      pushToast('error', 'Test failed', 'Could not reach the backend. Check that it is running.');
    } finally {
      setIsTesting(false);
      setCurrentPhase(null);
    }
  };

  const phaseLabel = isTesting ? PHASE_LABEL[currentPhase] : testComplete ? 'Complete' : 'Ready';
  const stepDone = { ping: ping !== null, download: downloadSpeed !== null, upload: uploadSpeed !== null };

  return (
    <div className="app-shell">
      <Toasts toasts={toasts} onClose={closeToast} />

      <header className="app-header">
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-text">SpeedPulse</span>
        </div>
        <div className="header-right">
          <div className={`status-pill ${isTesting ? 'testing' : testComplete ? 'done' : ''}`}>
            {isTesting && <span className="pulse-dot" />}
            <span>{status}</span>
            {isTesting && <span className="timer">{elapsed}s</span>}
          </div>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {theme === 'light' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="gauge-card">
          <div className="phase-steps">
            {PHASES.map((p) => (
              <div
                key={p}
                className={`phase-step ${currentPhase === p ? 'current' : ''} ${stepDone[p] ? 'done' : ''}`}
              >
                <span className="phase-dot" />
                {PHASE_LABEL[p]}
              </div>
            ))}
          </div>

          <div className="gauge-wrap">
            <Gauge reading={liveSpeed} phaseLabel={phaseLabel} active={isTesting} />
          </div>

          <button className={`cta-button ${isTesting ? 'running' : ''}`} onClick={runTest} disabled={isTesting}>
            {isTesting ? (
              <>
                <span className="spinner" />
                Testing…
              </>
            ) : testComplete ? (
              'Test again'
            ) : (
              'Start test'
            )}
          </button>
        </section>

        <section className="stat-grid">
          <StatCard label="Download" value={downloadSpeed} unit="Mbps" digits={1} tone="download" active={currentPhase === 'download'} />
          <StatCard label="Upload" value={uploadSpeed} unit="Mbps" digits={1} tone="upload" active={currentPhase === 'upload'} />
          <StatCard label="Ping" value={ping} unit="ms" digits={0} tone="ping" active={currentPhase === 'ping'} />
        </section>

        {history.length > 0 && (
          <section className="history-section">
            <h2 className="history-title">Recent results</h2>
            <div className="history-list">
              {history.slice(0, 5).map((h, i) => (
                <div key={i} className="history-item">
                  <span className="history-date">{h.date}</span>
                  <div className="history-metrics">
                    <span className="history-metric ping">
                      <span className="metric-dot" /> {Number(h.ping).toFixed(0)} ms
                    </span>
                    <span className="history-metric download">
                      <span className="metric-dot" /> {Number(h.download).toFixed(1)} Mbps
                    </span>
                    <span className="history-metric upload">
                      <span className="metric-dot" /> {Number(h.upload).toFixed(1)} Mbps
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
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
