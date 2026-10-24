from fastapi import FastAPI, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import secrets
import time
import requests

app = FastAPI(title="Personal Speed Test API")

# --- CORS Configuration ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Helper: Fast Random Data Generation ---
def generate_random_data(size: int):
    chunk_size = 65536
    generated = 0
    while generated < size:
        to_generate = min(chunk_size, size - generated)
        yield secrets.token_bytes(to_generate)
        generated += to_generate

# --- 1. Network Info Endpoint (FIXED) ---
@app.get("/network-info")
async def get_network_info(client_ip: str = None):
    """
    CRITICAL FIX: Now correctly uses the client_ip parameter 
    passed from the frontend instead of defaulting to server IP.
    """
    # ✅ FIX: Use the provided IP, don't let it be None
    target_ip = client_ip
    
    # If no IP was provided, fallback to auto-detect (for debugging only)
    if not target_ip:
        print("[NETWORK] ⚠️ No client_ip provided, using server IP")
        target_ip = ""  # Empty string tells ip-api to use requester IP
    
    print(f"[NETWORK] 🔍 Looking up info for IP: {target_ip}")
    
    # APIs to try (in order of reliability)
    apis = [
        {
            "name": "ip-api.com",
            "url": f"http://ip-api.com/json/{target_ip}?fields=status,message,country,regionName,city,isp,query",
            "parser": lambda d: {
                "ip": d.get("query"),
                "isp": d.get("isp"),
                "city": d.get("city"),
                "region": d.get("regionName"),
                "country": d.get("country")
            } if d.get("status") == "success" else None
        },
        {
            "name": "ipinfo.io",
            "url": f"https://ipinfo.io/{target_ip}/json",
            "parser": lambda d: {
                "ip": d.get("ip"),
                "isp": d.get("org"),
                "city": d.get("city"),
                "region": d.get("region"),
                "country": d.get("country")
            }
        }
    ]
    
    for api in apis:
        try:
            resp = requests.get(api["url"], timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                parsed = api["parser"](data)
                
                # ✅ Validate we got the CORRECT IP back (not server IP)
                if parsed and parsed.get("ip"):
                    # If we sent a specific IP, verify the response matches
                    if target_ip and parsed["ip"] != target_ip:
                        print(f"[NETWORK] ⚠️ IP mismatch! Sent: {target_ip}, Got: {parsed['ip']}")
                        continue
                    
                    print(f"[NETWORK] ✅ Success via {api['name']} for IP: {parsed['ip']}")
                    return {
                        **parsed,
                        "server_location": "Render Cloud (Global)",
                        "server_name": "SpeedTest-Backend-v2"
                    }
        except Exception as e:
            print(f"[NETWORK] ❌ Failed {api['name']}: {e}")
            continue
    
    return {
        "ip": "Unavailable",
        "isp": "Lookup Failed",
        "city": "Check Logs",
        "region": "",
        "country": "",
        "server_location": "Render Cloud (Global)"
    }

# --- 2. Ping Test ---
@app.get("/ping")
async def ping():
    return {"status": "ok", "timestamp": time.time()}

# --- 3. Download Test (Multi-Thread Ready) ---
@app.get("/download")
async def download(
    size: int = Query(default=25000000), 
    connections: int = Query(default=1)
):
    return StreamingResponse(
        generate_random_data(size), 
        media_type="application/octet-stream",
        headers={"Content-Length": str(size)}
    )

# --- 4. Upload Test ---
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    return {"received_bytes": len(content)}

# --- 5. Test Configuration ---
@app.get("/config")
async def get_config():
    return {
        "download": {
            "sizes": [1000000, 5000000, 25000000],
            "threads": 4,
            "warmup_time": 2
        },
        "upload": {
            "sizes": [1000000, 5000000, 10000000],
            "threads": 3,
            "warmup_time": 2
        }
    }
