import { useState } from 'react';
import './App.css';

// Change this to your backend URL (Keep as localhost for local testing)
const API_URL = 'https://speedtest-backend-ofvb.onrender.com'; 

function App() {
  const [ping, setPing] = useState(null);
  const [downloadSpeed, setDownloadSpeed] = useState(null);
  const [uploadSpeed, setUploadSpeed] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState('Ready to test');

  // Helper to convert Bytes/Second to Megabits/Second (Mbps)
  const calculateMbps = (bytes, seconds) => {
    const bits = bytes * 8;
    const megabits = bits / 1000000;
    return (megabits / seconds).toFixed(2);
  };

  const runTest = async () => {
    setIsTesting(true);
    setPing(null); setDownloadSpeed(null); setUploadSpeed(null);

    try {
      // --- 1. TEST PING ---
      setStatus('Testing Ping...');
      const pingStart = performance.now();
      await fetch(`${API_URL}/ping`);
      const pingEnd = performance.now();
      setPing((pingEnd - pingStart).toFixed(0));

      // --- 2. TEST DOWNLOAD ---
      setStatus('Testing Download...');
      const downloadSize = 25000000; // 25 MB
      const dlStart = performance.now();
      
      const response = await fetch(`${API_URL}/download?size=${downloadSize}`);
      const reader = response.body.getReader();
      let bytesReceived = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesReceived += value.length;
      }
      
      const dlEnd = performance.now();
      const dlSeconds = (dlEnd - dlStart) / 1000;
      setDownloadSpeed(calculateMbps(bytesReceived, dlSeconds));

      // --- 3. TEST UPLOAD ---
      setStatus('Testing Upload...');
      const uploadSize = 10000000; // 10 MB
      // Generate a dummy blob of data to upload
      const blob = new Blob([new ArrayBuffer(uploadSize)]); 
      const formData = new FormData();
      formData.append('file', blob, 'testfile.bin');

      const ulStart = performance.now();
      await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData
      });
      const ulEnd = performance.now();
      const ulSeconds = (ulEnd - ulStart) / 1000;
      setUploadSpeed(calculateMbps(uploadSize, ulSeconds));

      setStatus('Test Complete!');
    } catch (error) {
      console.error(error);
      setStatus('Error running test. Is the backend running?');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'sans-serif' }}>
      <h1>Personal Speed Test</h1>
      <p>{status}</p>
      
      <button 
        onClick={runTest} 
        disabled={isTesting}
        style={{ padding: '15px 30px', fontSize: '18px', cursor: 'pointer' }}
      >
        {isTesting ? 'Testing...' : 'Start Test'}
      </button>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', marginTop: '40px' }}>
        <div>
          <h3>Ping</h3>
          <p style={{ fontSize: '24px', color: 'green' }}>{ping ? `${ping} ms` : '-'}</p>
        </div>
        <div>
          <h3>Download</h3>
          <p style={{ fontSize: '24px', color: 'blue' }}>{downloadSpeed ? `${downloadSpeed} Mbps` : '-'}</p>
        </div>
        <div>
          <h3>Upload</h3>
          <p style={{ fontSize: '24px', color: 'purple' }}>{uploadSpeed ? `${uploadSpeed} Mbps` : '-'}</p>
        </div>
      </div>
    </div>
  );
}

export default App;
