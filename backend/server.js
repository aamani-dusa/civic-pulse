const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const reportsRouter = require("./routes/reports");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const frontendPath = path.join(__dirname, "..", "frontend");

app.disable("x-powered-by");

// Allow cross-origin requests so frontend can connect even if served from Live Server or file://
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-key, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(express.json({ limit: "20kb" }));

app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait and try again." }
}));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "CivicPulse", timestamp: new Date().toISOString() });
});

app.use("/api/reports", reportsRouter);

// Serve frontend static files
app.use(express.static(frontendPath));

// Fallback for SPA routing to index.html
app.get("*splat", (req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API endpoint not found." });
  res.sendFile(path.join(frontendPath, "index.html"), (error) => { if (error) next(error); });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ error: "The server could not complete this request. Check the server logs and configuration." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`CivicPulse running at: http://localhost:${PORT}`);
    console.log(`Dashboard frontend:   http://localhost:${PORT}`);
    console.log(`API Health check:     http://localhost:${PORT}/api/health`);
    console.log(`====================================================`);
  });
}

module.exports = app;
