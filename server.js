
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ─── DATABASE CONNECTION ───────────────────────────────
const db = mysql.createConnection({
  host:     process.env.MYSQL_HOST,
  user:     process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'aqi_monitor',
  port:     process.env.MYSQL_PORT || 3306
});
db.connect(err => {
  if (err) {
    console.error("❌ Database connection error:", err);
  } else {
    console.log("✅ Connected to MySQL database");
  }
});

// ─── ROOT ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "running", message: "AQI Monitor Server v2.0 🌱" });
});

// ─── POST: Store sensor data (ESP32 sends here) ────────
app.post("/api/sensor-data", (req, res) => {
  const { aqi, pm25, co2, temperature, humidity, latitude, longitude } = req.body;

  const sql = `
    INSERT INTO sensor_data
    (aqi, pm25, co2, temperature, humidity, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [aqi, pm25, co2, temperature, humidity, latitude, longitude],
    (err, result) => {
      if (err) {
        console.error(err);
        res.status(500).json({ error: "Database error" });
      } else {
        res.json({ success: true, message: "Sensor data stored", id: result.insertId });
      }
    }
  );
});

// ─── GET: Latest single reading (for live dashboard) ───
app.get("/api/latest", (req, res) => {
  const sql = `
    SELECT * FROM sensor_data
    ORDER BY timestamp DESC
    LIMIT 1
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.status(404).json({ error: "No data yet" });
    res.json(rows[0]);
  });
});

// ─── GET: History (for chart & table) ─────────────────
// Usage: /api/history?limit=20
app.get("/api/history", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const sql = `
    SELECT * FROM sensor_data
    ORDER BY timestamp DESC
    LIMIT ?
  `;
  db.query(sql, [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.reverse()); // oldest first for charts
  });
});

// ─── GET: All data (full history) ─────────────────────
app.get("/api/all", (req, res) => {
  const sql = `SELECT * FROM sensor_data ORDER BY timestamp ASC`;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ─── GET: Stats summary ────────────────────────────────
app.get("/api/stats", (req, res) => {
  const sql = `
    SELECT
      AVG(aqi)         AS avg_aqi,
      MAX(aqi)         AS max_aqi,
      MIN(aqi)         AS min_aqi,
      AVG(pm25)        AS avg_pm25,
      AVG(co2)         AS avg_co2,
      AVG(temperature) AS avg_temp,
      AVG(humidity)    AS avg_humidity,
      COUNT(*)         AS total_readings
    FROM sensor_data
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows[0]);
  });
});

// ─── POST: AI Advice proxy (optional — avoids CORS) ───
// Requires: npm install node-fetch
// Uncomment after: npm install node-fetch@2
/*
const fetch = require('node-fetch');

app.post("/api/ai-advice", async (req, res) => {
  const { location, sensitive, sensorData } = req.body;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY; // set in .env

  const prompt = `You are an Air Quality Safety Expert. Analyze the following data and give 5-7 safety rules for a ${location}.
Sensor Data: AQI=${sensorData.aqi}, PM2.5=${sensorData.pm25} μg/m³, CO₂=${sensorData.co2} ppm, Temp=${sensorData.temperature}°C, Humidity=${sensorData.humidity}%
Sensitive groups: ${sensitive}
Format each rule with an emoji and keep it concise.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await response.json();
    res.json({ advice: data.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
*/

// ─── START SERVER ──────────────────────────────────────
app.listen(3000, () => {
  console.log("🚀 AQI Server running on http://localhost:3000");
  console.log("   Endpoints:");
  console.log("   POST /api/sensor-data  → Store new reading");
  console.log("   GET  /api/latest       → Latest reading");
  console.log("   GET  /api/history      → Recent history (add ?limit=20)");
  console.log("   GET  /api/stats        → Summary statistics");
});
