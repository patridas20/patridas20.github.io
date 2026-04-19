const TOKEN_KEY = "resume_admin_api_token_v1";

const authForm = document.getElementById("authForm");
const authStatus = document.getElementById("authStatus");
const tokenInput = document.getElementById("adminToken");
const clearSessionBtn = document.getElementById("clearSessionBtn");
const dashboardPanel = document.getElementById("dashboardPanel");
const metricGrid = document.getElementById("metricGrid");
const alertList = document.getElementById("alertList");
const profilesTableBody = document.getElementById("profilesTableBody");
const messagesTableBody = document.getElementById("messagesTableBody");
const statusFilter = document.getElementById("statusFilter");
const refreshMessagesBtn = document.getElementById("refreshMessagesBtn");

function setAuthStatus(text, isError = false) {
  authStatus.textContent = text;
  authStatus.style.color = isError ? "#ff9292" : "";
}

function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function loadToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  tokenInput.value = "";
}

function formatTimestamp(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleString();
}

function el(tag, text, className = "") {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function buildMetric(title, value, tone = "neutral") {
  const card = el("article", undefined, `card admin-metric tone-${tone}`);
  const titleNode = el("p", title, "meta");
  const valueNode = el("p", String(value), "admin-metric-value");
  card.append(titleNode, valueNode);
  return card;
}

async function apiFetch(path) {
  const token = loadToken();
  if (!token) throw new Error("Missing admin token");

  const response = await fetch(path, {
    headers: {
      Accept: "application/json",
      "x-admin-token": token
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return response.json();
}

function renderOverview(data) {
  metricGrid.innerHTML = "";
  metricGrid.append(
    buildMetric("Profiles (total)", data.profiles.total),
    buildMetric("Profiles (public)", data.profiles.public, "good"),
    buildMetric("Profiles (private)", data.profiles.private),
    buildMetric("Messages queued", data.messages.queued, data.messages.queued > 0 ? "warn" : "good"),
    buildMetric("Messages failed", data.messages.failed, data.messages.failed > 0 ? "danger" : "good"),
    buildMetric("Messages sent", data.messages.sent, "good")
  );

  alertList.innerHTML = "";
  if (!Array.isArray(data.alerts) || data.alerts.length === 0) {
    const item = el("li", "No active delivery alerts.", "admin-alert admin-alert-ok");
    alertList.append(item);
  } else {
    data.alerts.forEach((alert) => {
      const level = alert.severity || "info";
      const item = el("li", `[${level.toUpperCase()}] ${alert.message}`, `admin-alert admin-alert-${level}`);
      alertList.append(item);
    });
  }
}

function renderProfiles(data) {
  profilesTableBody.innerHTML = "";
  data.rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.append(
      el("td", row.slug || "n/a"),
      el("td", row.full_name || "n/a"),
      el("td", row.template_name || row.template_key || "n/a"),
      el("td", row.is_public ? "Yes" : "No"),
      el("td", formatTimestamp(row.updated_at)),
      el("td", formatTimestamp(row.last_message_at))
    );
    profilesTableBody.append(tr);
  });
}

function renderMessages(data) {
  messagesTableBody.innerHTML = "";
  data.rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.append(
      el("td", formatTimestamp(row.created_at)),
      el("td", row.profile_slug || "n/a"),
      el("td", `${row.sender_name || "Unknown"} (${row.sender_email || "n/a"})`),
      el("td", row.subject || "(no subject)"),
      el("td", row.delivery_status || "n/a"),
      el("td", row.delivery_error || "")
    );
    messagesTableBody.append(tr);
  });
}

async function refreshMessages() {
  const status = statusFilter.value;
  const query = new URLSearchParams({ limit: "50" });
  if (status) query.set("status", status);
  const messages = await apiFetch(`/admin-api/messages?${query.toString()}`);
  renderMessages(messages);
}

async function loadDashboard() {
  setAuthStatus("Loading dashboard...");
  const [overview, profiles] = await Promise.all([
    apiFetch("/admin-api/overview"),
    apiFetch("/admin-api/profiles?limit=50")
  ]);
  renderOverview(overview);
  renderProfiles(profiles);
  await refreshMessages();
  dashboardPanel.classList.remove("hidden");
  setAuthStatus(`Dashboard loaded at ${new Date().toLocaleTimeString()}`);
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) {
    setAuthStatus("Admin token is required.", true);
    return;
  }

  saveToken(token);
  try {
    await apiFetch("/admin-api/health");
    await loadDashboard();
  } catch (err) {
    clearToken();
    dashboardPanel.classList.add("hidden");
    setAuthStatus(String(err.message || err), true);
  }
});

clearSessionBtn.addEventListener("click", () => {
  clearToken();
  dashboardPanel.classList.add("hidden");
  setAuthStatus("Saved token cleared.");
});

refreshMessagesBtn.addEventListener("click", async () => {
  try {
    await refreshMessages();
    setAuthStatus(`Messages refreshed at ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    setAuthStatus(String(err.message || err), true);
  }
});

statusFilter.addEventListener("change", async () => {
  try {
    await refreshMessages();
  } catch (err) {
    setAuthStatus(String(err.message || err), true);
  }
});

(() => {
  const token = loadToken();
  if (!token) return;
  tokenInput.value = token;
  apiFetch("/admin-api/health")
    .then(() => loadDashboard())
    .catch((err) => {
      clearToken();
      setAuthStatus(String(err.message || err), true);
    });
})();
