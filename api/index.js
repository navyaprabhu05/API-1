const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const serverless = require("serverless-http");

const app = express();
app.use(cors());
app.use(express.json());

// 🔐 Use Firebase config from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

// ✅ Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const COLLECTION = "air_quality_data";

// ✅ Convert timestamp to IST
function toIST(date) {
  return new Date(date.getTime() + 5.5 * 60 * 60 * 1000).toISOString();
}

// ✅ Format data with units
function formatData(doc, formatIST = false) {
  const data = doc.data();
  let ts = data.timestamp.toDate();
  data.timestamp = formatIST ? toIST(ts) : ts.toISOString();
  data.pm25 = `${data.pm25} µg/m³`;
  data.pm10 = `${data.pm10} µg/m³`;
  data.temperature = `${data.temperature} °C`;
  data.humidity = `${data.humidity} %`;
  return data;
}

// ✅ 1. Latest data from all devices
app.get("/get-latest", async (req, res) => {
  const formatIST = req.query.format === "ist";
  try {
    const snapshot = await db.collection(COLLECTION).orderBy("timestamp", "desc").get();
    const seen = new Set();
    const results = [];

    snapshot.forEach(doc => {
      const d = doc.data();
      if (!seen.has(d.device_id)) {
        seen.add(d.device_id);
        results.push(formatData(doc, formatIST));
      }
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ 2. Latest data for one device
app.get("/device/:id/latest", async (req, res) => {
  const formatIST = req.query.format === "ist";
  const id = req.params.id;

  try {
    const snapshot = await db.collection(COLLECTION)
      .where("device_id", "==", id)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ message: "No data found for device" });
    }

    res.json(formatData(snapshot.docs[0], formatIST));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ 3. 1-hour average if ≥ 45 points
app.get("/device/:id/hourly", async (req, res) => {
  const formatIST = req.query.format === "ist";
  const id = req.params.id;
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  try {
    const snapshot = await db.collection(COLLECTION)
      .where("device_id", "==", id)
      .where("timestamp", ">=", oneHourAgo)
      .get();

    const data = snapshot.docs.map(doc => doc.data());

    if (data.length < 45) {
      return res.status(400).json({ message: "Not enough data for hourly average (requires ≥ 45 points)" });
    }

    const sum = { pm25: 0, pm10: 0, temperature: 0, humidity: 0 };
    data.forEach(d => {
      sum.pm25 += d.pm25;
      sum.pm10 += d.pm10;
      sum.temperature += d.temperature;
      sum.humidity += d.humidity;
    });

    const count = data.length;

    res.json({
      interval: "Average for last 60 minutes",
      average_pm25: `${(sum.pm25 / count).toFixed(1)} µg/m³`,
      average_pm10: `${(sum.pm10 / count).toFixed(1)} µg/m³`,
      average_temperature: `${(sum.temperature / count).toFixed(1)} °C`,
      average_humidity: `${(sum.humidity / count).toFixed(1)} %`,
      count,
      device_id: id,
      timestamp: formatIST ? toIST(now) : now.toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ 4. 15-minute interval averages (last hour)
app.get("/device/:id/15min", async (req, res) => {
  const formatIST = req.query.format === "ist";
  const id = req.params.id;
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  try {
    const snapshot = await db.collection(COLLECTION)
      .where("device_id", "==", id)
      .where("timestamp", ">=", oneHourAgo)
      .orderBy("timestamp")
      .get();

    const data = snapshot.docs.map(doc => doc.data());
    const buckets = [[], [], [], []];

    data.forEach(d => {
      const ts = d.timestamp.toDate();
      const minsAgo = Math.floor((now - ts) / (1000 * 60));

      if (minsAgo < 15) buckets[3].push(d);
      else if (minsAgo < 30) buckets[2].push(d);
      else if (minsAgo < 45) buckets[1].push(d);
      else if (minsAgo < 60) buckets[0].push(d);
    });

    const results = buckets.map((bucket, i) => {
      if (bucket.length === 0) return null;

      const sum = { pm25: 0, pm10: 0, temperature: 0, humidity: 0 };
      bucket.forEach(d => {
        sum.pm25 += d.pm25;
        sum.pm10 += d.pm10;
        sum.temperature += d.temperature;
        sum.humidity += d.humidity;
      });

      const count = bucket.length;
      return {
        interval: `Average for ${45 - i * 15}-${60 - i * 15} min ago`,
        average_pm25: `${(sum.pm25 / count).toFixed(1)} µg/m³`,
        average_pm10: `${(sum.pm10 / count).toFixed(1)} µg/m³`,
        average_temperature: `${(sum.temperature / count).toFixed(1)} °C`,
        average_humidity: `${(sum.humidity / count).toFixed(1)} %`,
        count,
        device_id: id,
        timestamp: formatIST ? toIST(now) : now.toISOString()
      };
    }).filter(Boolean);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Export for Vercel serverless
module.exports = app;
module.exports.handler = serverless(app);
