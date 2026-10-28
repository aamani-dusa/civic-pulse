const API = (window.location.protocol === "file:" || (window.location.port && window.location.port !== "3000"))
  ? "http://localhost:3000/api"
  : "/api";

const categorySymbols = {
  "Pothole": "⌁", "Water leakage": "≈", "Overflowing garbage": "▤",
  "Broken streetlight": "☼", "Other": "＋"
};
let reports = [];
let adminKey = "admin123";

const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

function showNotice(message) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.hidden = !message;
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  } catch (error) {
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      throw new Error(`Cannot reach backend at ${API}. Make sure 'node server.js' is running in the civicpulse/backend folder.`);
    }
    throw error;
  }
}

function statusClass(status) {
  if (status === "Resolved") return "status-resolved";
  if (status === "Under review") return "status-under-review";
  return "";
}

function renderStats(data) {
  const total = data.length;
  const open = data.filter((item) => item.status !== "Resolved").length;
  const locations = new Set(data.map((item) => (item.location || "").trim().toLowerCase()).filter(Boolean)).size;
  const locationCounts = new Map();
  data.forEach((item) => {
    const key = (item.location || "").trim().toLowerCase();
    if (key) locationCounts.set(key, (locationCounts.get(key) || 0) + 1);
  });
  $("#stat-total").textContent = total;
  $("#stat-open").textContent = open;
  $("#stat-locations").textContent = locations;
  $("#stat-hotspots").textContent = [...locationCounts.values()].filter((count) => count >= 3).length;
}

function renderCategories(data) {
  const counts = new Map();
  ["Pothole", "Water leakage", "Overflowing garbage", "Broken streetlight", "Other"].forEach((category) => counts.set(category, 0));
  data.forEach((item) => {
    if (counts.has(item.category)) {
      counts.set(item.category, (counts.get(item.category) || 0) + 1);
    }
  });
  const max = Math.max(1, ...counts.values());
  $("#category-chart").innerHTML = [...counts.entries()].map(([category, count]) => `
    <div class="category-row">
      <span class="category-label">${escapeHTML(category)}</span>
      <div class="bar-track" role="img" aria-label="${escapeHTML(category)}: ${count} reports"><div class="bar-fill" style="width:${count / max * 100}%"></div></div>
      <span class="category-count">${count}</span>
    </div>`).join("");
}

function renderHotspots(data) {
  const counts = new Map();
  data.forEach((item) => {
    const key = (item.location || "").trim();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
  if (!ranked.length) {
    $("#hotspot-list").innerHTML = '<p class="muted">No locations reported yet. Your first report can start a pattern.</p>';
    return;
  }
  $("#hotspot-list").innerHTML = ranked.map(([location, count], index) => `
    <div class="hotspot-item"><span class="hotspot-rank">${String(index + 1).padStart(2, "0")}</span>
    <div><strong>${escapeHTML(location)}</strong><small>${count === 1 ? "1 report so far" : `${count} reports in this location`}</small></div>
    <span class="hotspot-count">${count} ${count === 1 ? "report" : "reports"}</span></div>`).join("");
}

function renderReports() {
  const query = $("#search").value.trim().toLowerCase();
  const category = $("#category-filter").value;
  const status = $("#status-filter").value;
  const filtered = reports.filter((item) => {
    const text = `${item.category || ""} ${item.location || ""} ${item.description || ""}`.toLowerCase();
    return (!query || text.includes(query)) && (!category || item.category === category) && (!status || item.status === status);
  });
  const tbody = $("#reports-body");
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No matching reports. Try changing your filters or submit a new report.</td></tr>';
  } else {
    tbody.innerHTML = filtered.map((item) => `
      <tr>
        <td><div class="issue-cell"><span class="issue-symbol" aria-hidden="true">${escapeHTML(categorySymbols[item.category] || "＋")}</span><div><strong>${escapeHTML(item.category)}</strong><small>${escapeHTML((item.description || "").length > 65 ? (item.description || "").slice(0, 65) + "…" : item.description)}</small><small>ID: ${escapeHTML(item.id)}</small></div></div></td>
        <td>${escapeHTML(item.location)}</td>
        <td><span class="severity severity-${escapeHTML((item.severity || "medium").toLowerCase())}">${escapeHTML(item.severity || "Medium")}</span></td>
        <td><span class="status-pill ${statusClass(item.status)}">${escapeHTML(item.status || "Reported")}</span></td>
        <td>${formatDate(item.created_at)}</td>
      </tr>`).join("");
  }
  $("#results-count").textContent = `Showing ${filtered.length} of ${reports.length} reports`;
}

async function loadReports() {
  $("#refresh").disabled = true;
  $("#refresh").textContent = "Loading…";
  try {
    const data = await apiRequest("/reports");
    reports = data.reports || [];
    renderStats(reports);
    renderCategories(reports);
    renderHotspots(reports);
    renderReports();
    showNotice("");
  } catch (error) {
    showNotice(`Could not load reports: ${error.message}`);
    $("#reports-body").innerHTML = '<tr><td colspan="5" class="empty-cell">Reports are unavailable right now.</td></tr>';
    $("#category-chart").innerHTML = '<p class="muted">Category data is unavailable.</p>';
    $("#hotspot-list").innerHTML = '<p class="muted">Location data is unavailable.</p>';
  } finally {
    $("#refresh").disabled = false;
    $("#refresh").textContent = "↻ Refresh data";
  }
}

$("#report-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const message = $("#form-message");
  message.className = "form-message";
  message.textContent = "";
  button.disabled = true;
  button.textContent = "Submitting…";
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  try {
    await apiRequest("/reports", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    message.textContent = "Your report was submitted. Thank you for helping your community.";
    showToast("Report submitted successfully");
    await loadReports();
  } catch (error) {
    message.className = "form-message error";
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Submit report <span aria-hidden="true">→</span>';
  }
});

["#search", "#category-filter", "#status-filter"].forEach((selector) => $(selector).addEventListener("input", renderReports));
$("#refresh").addEventListener("click", loadReports);

$("#admin-open").addEventListener("click", () => {
  $("#admin-dialog").showModal();
  $("#admin-key").value = adminKey;
});

$("#admin-key").addEventListener("input", (event) => { adminKey = event.target.value; });

async function adminAction(method) {
  const id = $("#admin-report-id").value.trim();
  const message = $("#admin-message");
  message.className = "form-message";
  if (!id) { message.className = "form-message error"; message.textContent = "Enter a report ID from the report list."; return; }
  if (!adminKey) { message.className = "form-message error"; message.textContent = "Enter the admin key first."; return; }
  const options = { method, headers: { "x-admin-key": adminKey } };
  if (method === "PATCH") options.body = JSON.stringify({ status: $("#admin-status").value });
  const button = method === "PATCH" ? $("#admin-update") : $("#admin-delete");
  button.disabled = true;
  try {
    await apiRequest(`/reports/${encodeURIComponent(id)}`, options);
    message.textContent = method === "PATCH" ? "Report status updated." : "Report deleted.";
    showToast(method === "PATCH" ? "Status updated" : "Report deleted");
    await loadReports();
  } catch (error) {
    message.className = "form-message error";
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

$("#admin-update").addEventListener("click", () => adminAction("PATCH"));
$("#admin-delete").addEventListener("click", () => {
  if (window.confirm("Delete this report permanently? This cannot be undone.")) adminAction("DELETE");
});

loadReports();
