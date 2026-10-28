const express = require("express");
const crypto = require("node:crypto");
const rateLimit = require("express-rate-limit");
const supabase = require("../supabase");
const { requireAdmin } = require("../middleware/adminAuth");

const router = express.Router();
const CATEGORIES = ["Pothole", "Water leakage", "Overflowing garbage", "Broken streetlight", "Other"];
const SEVERITIES = ["Low", "Medium", "High"];
const STATUSES = ["Reported", "Under review", "Resolved"];

const createReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many reports from this connection. Please try again later." }
});

// Fallback in-memory store so the frontend dashboard functions immediately even before
// running database/schema.sql in the Supabase SQL editor.
const fallbackStore = [
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
    category: "Pothole",
    location: "Main Street & 4th Avenue",
    description: "Deep pothole on the right lane near the traffic light, causing vehicles to swerve abruptly.",
    severity: "High",
    status: "Under review",
    reporter_name: "Community Member",
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    id: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
    category: "Broken streetlight",
    location: "Oakwood Park North Entrance",
    description: "Streetlight fixture is flickering intermittently and stays completely dark after midnight.",
    severity: "Medium",
    status: "Reported",
    reporter_name: null,
    created_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString()
  },
  {
    id: "c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f",
    category: "Water leakage",
    location: "Cedar Road, near House 14",
    description: "Water constantly leaking across pedestrian footpath from an underground pipe connection.",
    severity: "High",
    status: "Reported",
    reporter_name: "Resident",
    created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 18).toISOString()
  },
  {
    id: "d4e5f6a1-b2c3-4d4e-bf5a-6b7c8d9e0f1a",
    category: "Overflowing garbage",
    location: "Market Square Bus Stop",
    description: "Public bin overflowing onto sidewalk for over 3 days attracting stray animals.",
    severity: "Medium",
    status: "Resolved",
    reporter_name: "Shopkeeper",
    created_at: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 6).toISOString()
  },
  {
    id: "e5f6a1b2-c3d4-4e5f-8a6b-7c8d9e0f1a2b",
    category: "Pothole",
    location: "Main Street & 4th Avenue",
    description: "Another pothole forming right beside the first one near the pedestrian crossing.",
    severity: "Medium",
    status: "Reported",
    reporter_name: null,
    created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 8).toISOString()
  }
];

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateNewReport(body) {
  const category = cleanText(body.category);
  const location = cleanText(body.location);
  const description = cleanText(body.description);
  const severity = cleanText(body.severity || "Medium");
  const reporterName = cleanText(body.reporter_name || "");
  const errors = [];
  if (!CATEGORIES.includes(category)) errors.push("Choose a valid issue category.");
  if (location.length < 3 || location.length > 120) errors.push("Location must be between 3 and 120 characters.");
  if (description.length < 10 || description.length > 1000) errors.push("Description must be between 10 and 1,000 characters.");
  if (!SEVERITIES.includes(severity)) errors.push("Choose a valid severity.");
  if (reporterName.length > 80) errors.push("Name must be 80 characters or fewer.");
  return { errors, data: { category, location, description, severity, reporter_name: reporterName || null } };
}

router.get("/", async (req, res, next) => {
  try {
    const { category, status, search } = req.query;
    if (category && !CATEGORIES.includes(category)) return res.status(400).json({ error: "Invalid category filter." });
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status filter." });

    if (supabase) {
      let query = supabase.from("reports")
        .select("id, category, location, description, severity, status, reporter_name, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (category) query = query.eq("category", category);
      if (status) query = query.eq("status", status);
      if (search && typeof search === "string") {
        const safeSearch = search.trim().replace(/[,%()]/g, " ").slice(0, 80);
        if (safeSearch) query = query.or(`location.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`);
      }
      const { data, error } = await query;
      if (!error && data) {
        return res.json({ reports: data });
      }
      if (error && error.code === "PGRST205") {
        console.info("[CivicPulse] Table 'reports' not found in Supabase yet. Using local in-memory storage. (Run database/schema.sql in Supabase to enable cloud persistence).");
      } else if (error) {
        console.warn("[CivicPulse Supabase query warning]:", error.message);
      }
    }

    // Local fallback store
    let filtered = [...fallbackStore];
    if (category) filtered = filtered.filter(r => r.category === category);
    if (status) filtered = filtered.filter(r => r.status === status);
    if (search && typeof search === "string") {
      const q = search.trim().toLowerCase();
      if (q) filtered = filtered.filter(r => r.location.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    }
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ reports: filtered });
  } catch (error) { next(error); }
});

router.post("/", createReportLimiter, async (req, res, next) => {
  try {
    const { errors, data } = validateNewReport(req.body || {});
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });

    if (supabase) {
      const { data: created, error } = await supabase.from("reports")
        .insert({ ...data, status: "Reported" })
        .select("id, category, location, description, severity, status, reporter_name, created_at, updated_at")
        .single();
      if (!error && created) {
        return res.status(201).json({ report: created });
      }
      if (error && error.code !== "PGRST205") {
        console.warn("[CivicPulse Supabase insert warning]:", error.message);
      }
    }

    // Local fallback insert
    const newReport = {
      id: crypto.randomUUID(),
      ...data,
      status: "Reported",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    fallbackStore.unshift(newReport);
    res.status(201).json({ report: newReport });
  } catch (error) { next(error); }
});

router.patch("/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;
    const status = cleanText(req.body?.status);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: "Invalid report ID format (expected UUID)." });
    }
    if (!STATUSES.includes(status)) return res.status(400).json({ error: "Choose a valid status (Reported, Under review, or Resolved)." });

    if (supabase) {
      const { data, error } = await supabase.from("reports").update({ status }).eq("id", id)
        .select("id, category, location, description, severity, status, reporter_name, created_at, updated_at").maybeSingle();
      if (!error && data) {
        return res.json({ report: data });
      }
    }

    const item = fallbackStore.find(r => r.id.toLowerCase() === id.toLowerCase());
    if (!item) return res.status(404).json({ error: "Report not found." });
    item.status = status;
    item.updated_at = new Date().toISOString();
    res.json({ report: item });
  } catch (error) { next(error); }
});

router.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: "Invalid report ID format (expected UUID)." });
    }

    if (supabase) {
      const { data, error } = await supabase.from("reports").delete().eq("id", id).select("id").maybeSingle();
      if (!error && data) {
        return res.json({ message: "Report deleted.", id: data.id });
      }
    }

    const idx = fallbackStore.findIndex(r => r.id.toLowerCase() === id.toLowerCase());
    if (idx === -1) return res.status(404).json({ error: "Report not found." });
    const [deleted] = fallbackStore.splice(idx, 1);
    res.json({ message: "Report deleted.", id: deleted.id });
  } catch (error) { next(error); }
});

module.exports = router;
