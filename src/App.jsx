// App.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './App.css';

const API_URL = 'https://speedtest-backend-ofvb.onrender.com';

/* ---------------- Helpers ---------------- */

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// FIX: returns a NUMBER. Mbps = bytes * 8 / 1,000,000 / seconds
const calculateMbps = (bytes, seconds) => (!seconds || seconds <= 0 ? 0 : (bytes * 8) / 1_000_000 / seconds);

// Same POST + FormData + URL as before, sent with XHR so real upload progress is visible.
const uploadWithProgress = (url, formData, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let t0 = 0;
    let sentAt = 0;
    xhr.upload.onloadstart = () => (t0 = performance.now());
    xhr.upload.onprogress = (e) => {
      const secs = (performance.now() - t0) / 1000;
      if (e.lengthComputable && secs > 0.1) onProgress(calculateMbps(e.loaded, secs));
    };
    xhr.upload.onload = () => (sentAt = performance.now());
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve({ seconds: ((sentAt || performance.now()) - t0) / 1000 })
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.open('POST', url);
    xhr.send(formData);
  });

// Saved choice → system preference on first load → light
const initialTheme = () => {
  try {
    const s = localStorage.getItem('theme');
    if (s === 'light' || s === 'dark') return s;
  } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/* Smoothly eases a number toward its target (used for the needle + arc). */
function useCountTo(target) {
  const [value, setValue] = useState(target ?? 0);
  const cur = useRef(target ?? 0);
  useEffect(() => {
    const to = target ?? 0;
    if (reducedMotion() || Math.abs(to - cur.current) < 0.005) {
      cur.current = to;
      setValue(to);
      return;
    }
    const from = cur.current;
    const dur = Math.min(1600, 300 + 110 * Math.sqrt(Math.abs(to - from)));
    let raf;
    let t0 = null;
    const step = (ts) => {
      if (t0 === null) t0 = ts;
      const p = Math.min((ts - t0) / dur, 1);
      cur.current = from + (to - from) * (1 - Math.pow(1 - p, 3));
      setValue(cur.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

/* ---------------- Rolling digits (YouTube-subscriber style) ---------------- */

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Digit({ d, dur }) {
  return (
    <span className="digit">
      <span
        className="digit-strip"
        style={{ transform: `translateY(${-d}em)`, transitionDuration: `${dur}ms` }}
      >
        {DIGITS.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </span>
    </span>
  );
}

function RollingNumber({ value, decimals }) {
  const prev = useRef(value ?? 0);
  const change = Math.abs((value ?? 0) - prev.current);
  useEffect(() => {
    prev.current = value ?? 0;
  });
  const dur = Math.round(Math.min(900, Math.max(380, 900 - Math.sqrt(change) * 25)));
  const chars = (value ?? 0).toFixed(decimals).split('');
  return (
    <span className="roll" aria-hidden="true">
      {chars.map((c, i) => {
        const key = chars.length - i;
        return c === '.' ? (
          <span key={key} className="dot">.</span>
        ) : (
          <Digit key={key} d={Number(c)} dur={dur} />
        );
      })}
    </span>
  );
}

/* ---------------- Gauge ---------------- */

const SPEED_MARKS = [0, 5, 10, 25, 50, 100, 250, 500, 1000];
const PING_MARKS = [0, 25, 50, 100, 200];
const START = -210;
const END = 30;
const SWEEP = END - START;

const toFraction = (v, marks) => {
  const x = Math.max(0, Math.min(v, marks[marks.length - 1]));
  for (let i = 0; i < marks.length - 1; i++) {
    if (x <= marks[i + 1]) return (i + (x - marks[i]) / (marks[i + 1] - marks[i])) / (marks.length - 1);
  }
  return 1;
};

const polar = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: 150 + r * Math.cos(a), y: 150 + r * Math.sin(a) };
};
const arcPath = (r, a0, a1) => {
  const s = polar(r, a0);
  const e = polar(r, a1);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
};

function Gauge({ tone, label, unit, value, marks, decimals, active, isFinal, prev, lowerIsBetter, icon }) {
  const shown = useCountTo(value);
  const frac = toFraction(shown, marks);
  const angle = START + frac * SWEEP;

  const ticks = useMemo(() => {
    const sub = 4;
    const segs = marks.length - 1;
    const out = [];
    for (let i = 0; i <= segs * sub; i++) {
      const major = i % sub === 0;
      const a = START + (i / (segs * sub)) * SWEEP;
      out.push({
        major,
        p1: polar(major ? 106 : 111, a),
        p2: polar(117, a),
        label: major ? { ...polar(94, a), text: marks[i / sub] } : null,
      });
    }
    return out;
  }, [marks]);

  const diff = isFinal && prev != null && value != null ? value - prev : null;
  const good = diff === null ? true : lowerIsBetter ? diff <= 0 : diff >= 0;

  return (
    <div className={`gauge-card tone-${tone} ${active ? 'live' : ''}`}>
      <div className="gauge-head">
        <span className="gauge-icon">{icon}</span>
        <span className="gauge-label">{label}</span>
        {active && <span className="gauge-live-dot" />}
      </div>

      <div className="gauge-body">
        <svg viewBox="0 0 300 236" className="gauge-svg" role="img" aria-label={`${label}: ${(value ?? 0).toFixed(decimals)} ${unit}`}>
          <defs>
            <linearGradient id={`grad-${tone}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--c1)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--c2)' }} />
            </linearGradient>
            <filter id={`glow-${tone}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path d={arcPath(126, START, END)} className="g-track" />
          {frac > 0.003 && (
            <path d={arcPath(126, START, angle)} className="g-progress" stroke={`url(#grad-${tone})`} filter={`url(#glow-${tone})`} />
          )}

          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={t.p1.x} y1={t.p1.y} x2={t.p2.x} y2={t.p2.y} className={t.major ? 'g-tick major' : 'g-tick'} />
              {t.label && (
                <text x={t.label.x} y={t.label.y} className="g-tick-label" textAnchor="middle" dominantBaseline="central">
                  {t.label.text}
                </text>
              )}
            </g>
          ))}

          <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '150px 150px' }}>
            <line x1="140" y1="150" x2="226" y2="150" className="g-needle" />
            <circle cx="150" cy="150" r="10" className="g-hub" />
            <circle cx="150" cy="150" r="4" className="g-pin" />
          </g>
        </svg>

        <div className="gauge-center">
          <div className={`gauge-number ${value == null ? 'idle' : ''}`}>
            <RollingNumber value={value} decimals={decimals} />
          </div>
          <div className="gauge-unit-row">
            <span className="gauge-unit">{unit}</span>
            {diff !== null && (
              <span className={`delta ${good ? 'good' : 'bad'}`} key={value}>
                {diff >= 0 ? '▲ +' : '▼ −'}
                {Math.abs(diff).toFixed(decimals)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Toasts ---------------- */

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          onAnimationEnd={(e) => e.animationName === 'toastOut' && onDismiss(t.id)}
        >
          <div className="toast-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              {t.type === 'start' && <path d="M12 7v5l3 3" />}
              {t.type === 'success' && <path d="M8 12l3 3 5-6" />}
              {t.type === 'error' && <path d="M12 8v5M12 16v.5" />}
            </svg>
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

/* ---------------- App ---------------- */

const PHASES = ['ping', 'download', 'upload'];
const PHASE_LABEL = { ping: 'Ping', download: 'Download', upload: 'Upload' };

const ICONS = {
  ping: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V8m0 0l-4 4m4-4l4 4M5 4h14" />
    </svg>
  ),
};

function App() {
  const [ping, setPing] = useState(null);
  const [downloadSpeed, setDownloadSpeed] = useState(null);
  const [uploadSpeed, setUploadSpeed] = useState(null);
  const [liveDl, setLiveDl] = useState(null);
  const [liveUl, setLiveUl] = useState(null);
  const [phase, setPhase] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [status, setStatus] = useState('Ready to test');
  const [elapsed, setElapsed] = useState('0.0');
  const [theme, setTheme] = useState(initialTheme);
  const [toasts, setToasts] = useState([]);
  const [prevResult, setPrevResult] = useState(null);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('speedtest-history') || '[]');
    } catch {
      return [];
    }
  });

  const [networkInfo, setNetworkInfo] = useState(null);
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);

  const toastId = useRef(0);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem('speedtest-history', JSON.stringify(history.slice(0, 6))); } catch { /* ignore */ }
  }, [history]);

  useEffect(() => {
    if (!isTesting) return;
    const start = performance.now();
    setElapsed('0.0');
    const id = setInterval(() => setElapsed(((performance.now() - start) / 1000).toFixed(1)), 100);
    return () => clearInterval(id);
  }, [isTesting]);

  const fetchNetworkInfo = useCallback(async () => {
    setIsFetchingInfo(true);
    try {
      const res = await fetch(`${API_URL}/network-info`);
      const data = await res.json();
      setNetworkInfo(data);
    } catch (error) {
      console.error('Failed to fetch network info:', error);
    } finally {
      setIsFetchingInfo(false);
    }
  }, []);

  useEffect(() => {
    fetchNetworkInfo();
  }, [fetchNetworkInfo]);

  const pushToast = useCallback((type, title, message) => {
    setToasts((p) => [...p, { id: ++toastId.current, type, title, message }]);
  }, []);
  const dismissToast = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  const runTest = async () => {
    const last = history[0];
    setPrevResult(last ? { ping: Number(last.ping), download: Number(last.download), upload: Number(last.upload) } : null);
    setIsTesting(true);
    setComplete(false);
    setPing(null);
    setDownloadSpeed(null);
    setUploadSpeed(null);
    setLiveDl(null);
    setLiveUl(null);
    pushToast('start', 'Speed test started', 'Measuring your connection…');

    try {
      setPhase('ping');
      setStatus('Measuring latency…');
      const pStart = performance.now();
      await fetch(`${API_URL}/ping`);
      const pingVal = Math.round(performance.now() - pStart);
      setPing(pingVal);

      setPhase('download');
      setStatus('Testing download…');
      const dlStart = performance.now();
      const resp = await fetch(`${API_URL}/download?size=25000000`);
      if (!resp.ok) throw new Error(`Download failed (${resp.status})`);
      const reader = resp.body.getReader();
      let received = 0;
      let lastUpdate = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        const now = performance.now();
        const secs = (now - dlStart) / 1000;
        if (secs > 0.15 && now - lastUpdate > 100) {
          lastUpdate = now;
          setLiveDl(calculateMbps(received, secs));
        }
      }
      const dl = calculateMbps(received, (performance.now() - dlStart) / 1000);
      setLiveDl(dl);
      setDownloadSpeed(dl);

      setPhase('upload');
      setStatus('Testing upload…');
      const ulSize = 10000000;
      const fd = new FormData();
      fd.append('file', new Blob([new ArrayBuffer(ulSize)]), 'testfile.bin');
      let lastUl = 0;
      const { seconds } = await uploadWithProgress(`${API_URL}/upload`, fd, (mbps) => {
        const now = performance.now();
        if (now - lastUl < 100) return;
        lastUl = now;
        setLiveUl(mbps);
      });
      const ul = calculateMbps(ulSize, seconds);
      setLiveUl(ul);
      setUploadSpeed(ul);

      setStatus('Test complete');
      setComplete(true);
      pushToast('success', 'Test complete!', `↓ ${dl.toFixed(1)} Mbps · ↑ ${ul.toFixed(1)} Mbps · ${pingVal} ms`);
      setHistory((p) => [{ ping: pingVal, download: dl, upload: ul, date: new Date().toLocaleString() }, ...p]);
    } catch (err) {
      console.error(err);
      setStatus('Connection error');
      pushToast('error', 'Test failed', 'Make sure the backend is running.');
    } finally {
      setIsTesting(false);
      setPhase(null);
    }
  };

  const done = { ping: ping !== null, download: downloadSpeed !== null, upload: uploadSpeed !== null };

  return (
    <div className="app-shell">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
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
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="hero">
          <h1>How fast is your internet?</h1>
          <p>Measure ping, download and upload in a few seconds.</p>
        </section>

        {/* ── REPLACED: custom network info block ── */}
        <div style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>
          {networkInfo && networkInfo.ip !== "Unavailable" ? (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <span>📡 <strong>ISP:</strong> {networkInfo.isp || "Detecting..."}</span>
              <span> <strong>IP:</strong> {networkInfo.ip || "Detecting..."}</span>
              <span>📍 <strong>Location:</strong>{' '}
                {[networkInfo.city, networkInfo.country].filter(Boolean).join(", ") || "Detecting..."}
              </span>
            </div>
          ) : (
            <span>⚠️ Network info unavailable. Retrying...</span>
          )}
        </div>

        <div className={`live-bar ${isTesting ? 'active' : ''}`}>
          {PHASES.map((p) => (
            <div key={p} className={`live-step ${phase === p ? 'current' : ''} ${done[p] ? 'done' : ''}`}>
              <span className="live-step-dot" />
              <span className="live-step-label">{PHASE_LABEL[p]}</span>
            </div>
          ))}
        </div>

        <div className="gauge-grid">
          <Gauge
            tone="ping" label="Ping" unit="ms" decimals={0} marks={PING_MARKS} icon={ICONS.ping}
            value={ping} active={phase === 'ping'} isFinal={done.ping && phase !== 'ping'}
            prev={prevResult?.ping} lowerIsBetter
          />
          <Gauge
            tone="download" label="Download" unit="Mbps" decimals={1} marks={SPEED_MARKS} icon={ICONS.download}
            value={phase === 'download' ? liveDl : downloadSpeed} active={phase === 'download'}
            isFinal={done.download && phase !== 'download'} prev={prevResult?.download}
          />
          <Gauge
            tone="upload" label="Upload" unit="Mbps" decimals={1} marks={SPEED_MARKS} icon={ICONS.upload}
            value={phase === 'upload' ? liveUl : uploadSpeed} active={phase === 'upload'}
            isFinal={done.upload && phase !== 'upload'} prev={prevResult?.upload}
          />
        </div>

        <div className="cta-wrap">
          <button className={`cta-button ${isTesting ? 'running' : ''}`} onClick={runTest} disabled={isTesting}>
            {isTesting ? (
              <>
                <span className="spinner" />
                <span>Testing…</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="currentColor" className="cta-icon">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>{complete ? 'Test again' : 'Start test'}</span>
              </>
            )}
          </button>
        </div>

        {history.length > 0 && (
          <section className="history-section">
            <h2 className="history-title">Recent results</h2>
            <div className="history-list">
              {history.slice(0, 6).map((h, i) => (
                <div key={i} className="history-item" style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="history-date">{h.date}</span>
                  <div className="history-metrics">
                    <span className="history-metric ping"><span className="metric-dot" />{Number(h.ping).toFixed(0)} ms</span>
                    <span className="history-metric download"><span className="metric-dot" />{Number(h.download).toFixed(1)} Mbps</span>
                    <span className="history-metric upload"><span className="metric-dot" />{Number(h.upload).toFixed(1)} Mbps</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
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
