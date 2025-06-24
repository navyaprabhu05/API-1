import os
import json
import time
import random
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore

# === Firebase Setup ===
cred = credentials.Certificate(r"D:\dummy_data\serviceAccountKey.json")  # 🔁 Replace with your actual path
firebase_admin.initialize_app(cred)
db = firestore.client()

# === Configuration ===
DEVICE_IDS = ["device_01", "device_02", "device_03"]
COLLECTION_NAME = "air_quality_data"
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

# === Generate Dummy Sensor Data for One Device ===
def generate_sensor_data(device_id):
    return {
        "timestamp": datetime.utcnow(),  # ✅ Native datetime object for Firestore Timestamp
        "device_id": device_id,
        "pm25": round(random.uniform(10, 120), 1),       # µg/m3
        "pm10": round(random.uniform(20, 200), 1),       # µg/m3
        "temperature": round(random.uniform(20, 40), 1), # °C
        "humidity": round(random.uniform(30, 80), 1)     # %
    }

# === Save to Per-Device JSON File ===
def append_to_json_file(data):
    file_path = os.path.join(LOG_DIR, f"{data['device_id']}_log.json")
    try:
        with open(file_path, 'r') as f:
            log = json.load(f)
    except (FileNotFoundError, json.decoder.JSONDecodeError):
        log = []

    # Convert timestamp to string only in local logs
    data_to_log = data.copy()
    data_to_log['timestamp'] = data['timestamp'].isoformat()
    log.append(data_to_log)

    with open(file_path, 'w') as f:
        json.dump(log, f, indent=2)

# === Upload Data to Firestore ===
def send_to_firebase(data):
    try:
        db.collection(COLLECTION_NAME).add(data)
        print(f"✅ Sent: {data['device_id']} @ {data['timestamp'].isoformat()}")
    except Exception as e:
        print(f"❌ Firebase error for {data['device_id']}: {e}")

# === Main Loop (every 30 seconds) ===
print("🌍 Starting AQI data simulation for all devices every 30 seconds...")
try:
    while True:
        for device_id in DEVICE_IDS:
            data = generate_sensor_data(device_id)
            append_to_json_file(data)
            send_to_firebase(data)
        time.sleep(30)
except KeyboardInterrupt:
    print("\n🛑 Stopped by user.")
except Exception as e:
    print(f"🔥 Error: {e}")
