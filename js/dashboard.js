import { API_BASE } from './config.js';
const s = JSON.parse(localStorage.getItem("mcp") || "null");
if (!s) location = "index.html";
const H = {
  Authorization: "Bearer " + s.token,
  "Content-Type": "application/json",
};
const pageTitle = document.getElementById("pageTitle");
const assessmentStatusChartCanvas = document.getElementById(
  "assessmentStatusChart",
);
const chartCanvases = {
  intervention: document.getElementById("interventionChart"),
  category: document.getElementById("categoryChart"),
  subcategory: document.getElementById("subcategoryChart"),
};
const tabLinks = [...document.querySelectorAll("[data-tab]")];
const tabTitles = {
  dashboardTab: "Dashboard",
  detailsTab: "My Details",
  assessmentsTab: "My Assessments",
  officerView: "Issues & Interventions",
  institutionsTab: "Manage Institutions",
};
pageTitle.textContent = "Dashboard";
roleBadge.textContent = s.user.role.toUpperCase();
logout.onclick = () => {
  localStorage.removeItem("mcp");
  location = "index.html";
};
async function api(u, o = {}) {
  const r = await fetch(`${API_BASE}${u}`, { ...o, headers: { ...H, ...o.headers } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.message || "Request failed");
  return d;
}
let assessmentId;
let categoriesLoaded = false;
let issueCategories;
let assessmentStatusChart;
const charts = {};
const OFFICER_STATUSES = ["Reported", "Validated", "Returned", "Assigned for Action", "In Progress", "Completed", "Closed"];

function parentCategory(category) {
  const mapping = issueCategories?.mapping || issueCategories || {};
  if (mapping[category]) return category;
  return Object.entries(mapping).find(([, issues]) =>
    Array.isArray(issues) && issues.includes(category),
  )?.[0] || category;
}

async function updateAnalyticsCharts() {
  if (typeof Chart === "undefined") {
    throw new Error("Analytics charts could not be loaded. Check your internet connection and refresh.");
  }

  const assessments = await api("/api/assessments");
  const statusCounts = assessments.reduce(
    (counts, item) => {
      const status = item.status === "Submitted" ? "Submitted" : "Draft";
      counts[status] += 1;
      return counts;
    },
    { Draft: 0, Submitted: 0 },
  );
  const issues = assessments.flatMap((item) => item.issues || []);
  const countBy = (keyFn) =>
    issues.reduce((counts, issue) => {
      const key = keyFn(issue);
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  const sorted = (counts, limit) =>
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);

  // Intervention breakdown — by workflow status, in workflow order
  const statusOrder = ["Reported", "Validated", "Returned", "Assigned for Action", "In Progress", "Completed", "Closed"];
  const interventionCounts = countBy((i) => i.status || "Reported");
  const interventionLabels = [
    ...statusOrder.filter((st) => interventionCounts[st]),
    ...Object.keys(interventionCounts).filter((st) => !statusOrder.includes(st)),
  ];
  const interventionData = interventionLabels.map((st) => interventionCounts[st]);

  const categories = sorted(countBy((i) => parentCategory(i.category || "Other Intervention")), 8);
  const subcategories = sorted(countBy((i) => i.subcategory || "Awaiting sub-category"), 10);
  const statusData = [statusCounts.Draft, statusCounts.Submitted];

  if (assessmentStatusChart) {
    assessmentStatusChart.data.datasets[0].data = statusData;
    assessmentStatusChart.update();
  } else {
    assessmentStatusChart = new Chart(assessmentStatusChartCanvas, {
      type: "doughnut",
      data: {
        labels: ["Draft", "Submitted"],
        datasets: [
          {
            data: statusData,
            backgroundColor: ["#c5ed78", "#087653"],
            borderColor: "#ffffff",
            borderWidth: 4,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: { legend: { position: "bottom" } },
      },
    });
  }

  renderBarChart("intervention", interventionLabels, interventionData, "#0b8a62");
  renderDonutChart("category", categories.map(([k]) => k), categories.map(([, v]) => v));
  renderBarChart("subcategory", subcategories.map(([k]) => k), subcategories.map(([, v]) => v), "#2f9e75");
}

const PALETTE = ["#087653", "#0b8a62", "#2f9e75", "#5fb88f", "#8fd1a8", "#c5ed78", "#e3f5b8", "#9aa5a0"];

function upsertChart(key, config) {
  const existing = charts[key];
  if (existing) {
    existing.data.labels = config.data.labels;
    existing.data.datasets[0].data = config.data.datasets[0].data;
    existing.update();
    return;
  }
  charts[key] = new Chart(chartCanvases[key], config);
}

function renderBarChart(key, labels, data, color) {
  upsertChart(key, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Interventions", data, backgroundColor: color, borderRadius: 7, maxBarThickness: 38 }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: { grid: { display: false } },
      },
    },
  });
}

function renderDonutChart(key, labels, data) {
  upsertChart(key, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: PALETTE, borderColor: "#ffffff", borderWidth: 3, hoverOffset: 8 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "60%",
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } },
    },
  });
}

function activateTab(tabId) {
  document.querySelectorAll(".dashboard-tab").forEach((tab) => {
    tab.classList.toggle("d-none", tab.id !== tabId);
  });
  tabLinks.forEach((link) => {
    const active = link.dataset.tab === tabId;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  pageTitle.textContent = tabTitles[tabId];
  if (tabId === "assessmentsTab") loadAssessments().catch((e) => alert(e.message));
  if (tabId === "officerView") officer().catch((e) => alert(e.message));
  if (tabId === "institutionsTab") loadInstitutions().catch((e) => alert(e.message));
}
tabLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    activateTab(link.dataset.tab);
  });
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function attachmentLink(issue) {
  if (!issue.attachmentUrl) return "";
  const url = /^https?:\/\//.test(issue.attachmentUrl) ? issue.attachmentUrl : API_BASE + issue.attachmentUrl;
  return `<a class="d-inline-block small mt-1" href="${escapeHtml(url)}" target="_blank" rel="noopener">📎 ${escapeHtml(issue.attachmentName || "Recommendation attachment")}</a>`;
}

async function loadAssessments() {
  const rows = await api("/api/assessments");
  assessmentRows.innerHTML = rows.length
    ? rows
        .map(
          (item) => {
            const issueDetails = item.issues?.length
              ? item.issues
                  .map(
                    (issue) => `<div class="assessment-issue">
                      <b>${escapeHtml(issue.issueCode)} · ${escapeHtml(issue.subcategory || issue.category || "Issue")}</b>
                      <span class="text-secondary small d-block">Category: ${escapeHtml(issue.category || "—")}${issue.subcategoryDetails ? ` — ${escapeHtml(issue.subcategoryDetails)}` : ""}</span>
                      <span>${escapeHtml(issue.description || issue.recommendation || "No description provided")}</span>
                      <small>Recommendation: ${escapeHtml(issue.recommendation || "—")} · Location: ${escapeHtml(issue.latitude || "—")}, ${escapeHtml(issue.longitude || "—")}</small>
                      ${attachmentLink(issue)}
                    </div>`,
                  )
                  .join("")
              : "No issues added";
            return `<tr>
            <td data-label="Assessment"><span class="fw-bold text-success">#${escapeHtml(item.id)}</span></td>
            <td data-label="Assessor">${escapeHtml(item.assessorName || "—")}</td>
            <td data-label="Assigned Road"><strong>${escapeHtml(item.road?.name || "—")}</strong></td>
            <td data-label="Road Stretch">${escapeHtml(item.road?.stretch || "—")}</td>
            <td data-label="Status"><span class="badge ${item.status === "Submitted" ? "text-bg-success" : "text-bg-warning"}">${escapeHtml(item.status || "—")}</span></td>
            <td data-label="Issues / Interventions">${issueDetails}</td>
            <td data-label="Created">${escapeHtml(formatDate(item.createdAt))}</td>
            <td data-label="Submitted">${escapeHtml(formatDate(item.submittedAt))}</td>
          </tr>`;
          },
        )
        .join("")
    : '<tr><td colspan="8" class="text-center text-secondary py-4">No assessments found.</td></tr>';
}

function renderKpis(stats) {
  const cards = [
    {
      key: "assessments",
      label: "Issues",
      value: stats.assessments,
      note: "Total issues raised",
      icon: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M9 10h6M9 14h6M9 18h3"/>',
    },
    {
      key: "pending",
      label: "Pending",
      value: stats.pending,
      note: "Awaiting resolution",
      icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    },
    {
      key: "issues",
      label: "Verified",
      value: stats.issues,
      note: "Interventions logged for action",
      icon: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M12.5 7.5v4M12.5 15h.01"/>',
    },
    {
      key: "completed",
      label: "Completed",
      value: stats.completed,
      note: "Issues resolved",
      icon: '<path d="M20 11.1V12a8 8 0 1 1-4.75-7.32"/><path d="m8.5 11.5 3 3L21 5"/>',
    },
  ];
  kpis.innerHTML = cards
    .map(
      (card) => `<div class="col-12 col-sm-6 col-xl-3">
        <article class="card-pad kpi kpi--${card.key}">
          <div class="kpi-topline">
            <span class="kpi-label">${card.label}</span>
            <span class="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${card.icon}</svg>
            </span>
          </div>
          <strong class="kpi-value">${escapeHtml(card.value)}</strong>
          <span class="kpi-note">${card.note}</span>
        </article>
      </div>`,
    )
    .join("");
}

async function init() {
  const k = await api("/api/dashboard");
  renderKpis(k);
  if (s.user.role === "institution") {
    await institution();
  } else {
    document.querySelectorAll("[data-institution-tab]").forEach((link) => {
      link.classList.add("d-none");
    });
    document.querySelector('[data-tab="assessmentsTab"]').textContent =
      "Assessments";
    document.querySelector('[data-tab="officerView"]').classList.remove("d-none");
    document.getElementById("detailsTab").classList.add("d-none");
  }
  try {
    await updateAnalyticsCharts();
  } catch (error) {
    alert(`Dashboard analytics could not be loaded: ${error.message}`);
  }
}
async function institution() {
  let savedIssuesCount = 0;

  startBtn.onclick = async () => {
    assessment.classList.remove("d-none");
    issueEditor.classList.add("d-none");
    assessment.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      if (!categoriesLoaded) {
        issueCategories =
          issueCategories || (await api("/api/master/categories"));
        const issuesList = issueCategories?.institutionIssues || [
          "Plantation",
          "Tree guard requirement",
          "Opportunity for beautification",
          "Pruning",
          "Horticulture waste",
          "Waste accumulation",
          "Construction & demolition waste",
          "Open burning",
          "Garbage Vulnerable Points on Road",
          "Garbage Vulnerable Points at Vacant Plot",
          "Sale/purchase of single-use plastic",
          "Patchwork",
          "Pavement on road sides",
          "Green landscaping on road sides",
          "Pavement at divider",
          "Green landscaping at divider",
          "Traffic congestion",
          "Idling hotspot",
          "Parking-related congestion",
          "Encroachment affecting traffic flow",
          "Awareness required for residents",
          "Awareness required for RWA",
          "Awareness required for shopkeepers/vendors",
          "Awareness required for market associations",
          "Awareness required for other commercial establishments",
          "Other",
        ];
        category.innerHTML =
          '<option value="">Select category</option>' +
          issuesList
            .map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
            .join("");
        categoriesLoaded = true;
      }
    } catch (e) {
      alert(`The assessment form is open, but categories could not be loaded: ${e.message}`);
    }
  };
  assessmentForm.onsubmit = async (e) => {
    e.preventDefault();
    const saveDraftButton = assessmentForm.querySelector("button[type=submit]");
    saveDraftButton.disabled = true;
    try {
      const a = await api("/api/assessments", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
      });
      assessmentId = a.id;
      savedIssuesCount = 0;
      saveDraftButton.textContent = "Draft Saved";
      saveDraftButton.disabled = true;
      issueEditor.classList.remove("d-none");
      issueEditor.scrollIntoView({ behavior: "smooth", block: "start" });
      addIssueBtn.disabled = false;
      issueDraftHint.classList.add("d-none");
      startBtn.disabled = true;
      try {
        await loadAssessments();
        await updateAnalyticsCharts();
      } catch (error) {
        alert(`Draft saved, but dashboard data could not be refreshed: ${error.message}`);
      }
    } catch (error) {
      saveDraftButton.disabled = false;
      alert(error.message);
    }
  };
  gps.onclick = () =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lat.value = p.coords.latitude;
        lng.value = p.coords.longitude;
      },
      () => alert("Enter coordinates manually"),
    );

  category.addEventListener("change", () => {
    const isOther = category.value === "Other";
    subcategoryDetailsWrap.classList.toggle("d-none", !isOther);
    subcategoryDetails.required = isOther;
    if (!isOther) subcategoryDetails.value = "";
  });

  const uploadFile = async (url, field, file) => {
    const fd = new FormData();
    fd.append(field, file);
    const r = await fetch(`${API_BASE}${url}`, {
      method: "POST",
      headers: { Authorization: "Bearer " + s.token },
      body: fd,
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.message || `Upload failed (${r.status})`);
    }
  };

  const saveCurrentIssue = async () => {
    if (!assessmentId) {
      alert("Save the assessment draft before adding an issue.");
      return false;
    }
    if (!category.value || !lat.value || !lng.value || !recommendation.value) {
      issueForm.reportValidity();
      return false;
    }
    const attachment = recommendationAttachment.files[0];
    if (attachment && attachment.size > 10 * 1024 * 1024) {
      alert("Recommendation attachment must be 10 MB or smaller.");
      return false;
    }

    const i = await api(`/api/assessments/${assessmentId}/issues`, {
      method: "POST",
      body: JSON.stringify({
        category: category.value,
        subcategoryDetails: subcategoryDetails.value,
        description: description.value,
        recommendation: recommendation.value,
        latitude: lat.value,
        longitude: lng.value,
      }),
    });
    const uploadErrors = [];
    if (photo.files[0]) {
      await uploadFile(`/api/issues/${i.id}/photos`, "photo", photo.files[0]).catch((err) =>
        uploadErrors.push(`Photo: ${err.message}`),
      );
    }
    if (attachment) {
      await uploadFile(`/api/issues/${i.id}/attachment`, "attachment", attachment).catch((err) =>
        uploadErrors.push(`Attachment: ${err.message}`),
      );
    }
    if (uploadErrors.length) alert(`Issue saved, but some files failed to upload:\n${uploadErrors.join("\n")}`);
    issueList.insertAdjacentHTML(
      "beforeend",
      `<div class="issue-pill"><b>${escapeHtml(i.issueCode)}</b> • ${escapeHtml(i.subcategory || i.category)}<br><small>${escapeHtml(i.recommendation)}</small></div>`,
    );
    issueForm.reset();
    category.dispatchEvent(new Event("change"));
    savedIssuesCount++;
    try {
      await updateAnalyticsCharts();
    } catch (error) {
      console.error(error);
    }
    return true;
  };

  issueForm.onsubmit = async (e) => {
    e.preventDefault();
    addIssueBtn.disabled = true;
    try {
      const saved = await saveCurrentIssue();
      if (saved) {
        alert("Issue added successfully! You can add another issue, or click 'Submit Final Assessment' to complete.");
      }
    } catch (error) {
      alert(error.message);
    } finally {
      addIssueBtn.disabled = false;
    }
  };

  submitAssessment.onclick = async () => {
    if (!assessmentId) {
      alert("Save the assessment draft before submitting.");
      return;
    }

    // If user filled in the issue fields but clicked "Submit Final Assessment" directly, auto-save the issue first!
    const hasFormInput = Boolean(category.value || recommendation.value || description.value || photo.files[0]);
    if (hasFormInput) {
      submitAssessment.disabled = true;
      submitAssessment.textContent = "Saving issue & submitting...";
      try {
        const saved = await saveCurrentIssue();
        if (!saved) {
          submitAssessment.disabled = false;
          submitAssessment.textContent = "Submit Final Assessment";
          return;
        }
      } catch (err) {
        submitAssessment.disabled = false;
        submitAssessment.textContent = "Submit Final Assessment";
        alert("Failed to save issue: " + err.message);
        return;
      }
    }

    // Verify at least one issue is saved before final submission
    if (savedIssuesCount === 0 && issueList.children.length === 0) {
      alert("Please fill in and add at least one issue before submitting.");
      issueForm.reportValidity();
      return;
    }

    submitAssessment.disabled = true;
    submitAssessment.textContent = "Submitting Final Assessment...";
    try {
      await api(`/api/assessments/${assessmentId}/submit`, {
        method: "PATCH",
      });
    } catch (e) {
      submitAssessment.disabled = false;
      submitAssessment.textContent = "Submit Final Assessment";
      alert(e.message);
      return;
    }
    submitAssessment.textContent = "Assessment Submitted";
    assessmentSuccessModal.showModal();
    try {
      const stats = await api("/api/dashboard");
      renderKpis(stats);
      await updateAnalyticsCharts();
    } catch (e) {
      console.error(e);
    }
  };

  try {
    const details = await api("/api/institution/details");
    institutionName.textContent = details.institutionName || "—";
    assignedRoad.textContent = details.assignedRoad || "No road assigned";
    roadStretch.textContent = details.roadStretch || "—";
  } catch (error) {
    institutionName.textContent = s.user.institution || "—";
    assignedRoad.textContent = "Details unavailable";
    roadStretch.textContent = "Details unavailable";
    alert(`Assessment forms are ready, but institution details could not be loaded: ${error.message}`);
  }
}

assessmentSuccessModal.addEventListener("close", async () => {
  assessment.classList.add("d-none");
  assessmentForm.reset();
  issueForm.reset();
  category.dispatchEvent(new Event("change"));
  issueEditor.classList.add("d-none");
  issueList.replaceChildren();
  assessmentId = undefined;
  startBtn.disabled = false;
  addIssueBtn.disabled = true;
  issueDraftHint.classList.remove("d-none");
  submitAssessment.disabled = false;
  submitAssessment.textContent = "Submit Final Assessment";
  activateTab("assessmentsTab");
});

async function officer() {
  issueCategories = issueCategories || (await api("/api/master/categories"));
  const officerCats = issueCategories?.officerCategories || [
    "Plantation",
    "Pruning & Maintenance",
    "Solid Waste Management",
    "Single-use plastic",
    "Road Dust Mitigation",
    "Vehicular Emission Mitigation",
    "Sensitisation / IEC",
    "Other Intervention",
  ];
  const xs = await api("/api/admin/issues");
  adminRows.innerHTML = xs
    .map(
      (i) => {
        const category = parentCategory(i.category);
        const categoryOptions = officerCats
          .map(
            (cat) =>
              `<option value="${escapeHtml(cat)}"${cat === category ? " selected" : ""}>${escapeHtml(cat)}</option>`,
          )
          .join("");
        const currentStatus = i.status || "Reported";
        const statusOptions = [...new Set([currentStatus, ...OFFICER_STATUSES])]
          .map((st) => `<option${st === currentStatus ? " selected" : ""}>${escapeHtml(st)}</option>`)
          .join("");
        return `<tr>
          <td data-label="Issue">
            <span class="badge text-bg-light border mb-1">${escapeHtml(i.issueCode)}</span>
            <div class="small fw-semibold text-dark">${escapeHtml(i.subcategory || i.category || "")}${i.subcategoryDetails ? ` — ${escapeHtml(i.subcategoryDetails)}` : ""}</div>
            ${i.description ? `<small class="text-secondary d-block mt-1">${escapeHtml(i.description)}</small>` : ""}
            ${attachmentLink(i) ? `<div class="mt-1">${attachmentLink(i)}</div>` : ""}
          </td>
          <td data-label="Category">
            <select class="form-select form-select-sm" data-key="category" required>
              ${categoryOptions}
            </select>
            ${i.legacyCategory ? `<small class="d-block text-secondary mt-1">Previously: ${escapeHtml(i.legacyCategory)}</small>` : ""}
          </td>
          <td data-label="Road"><strong>${escapeHtml(i.road?.name || "")}</strong></td>
          <td data-label="Agency"><input class="form-control form-control-sm" data-key="responsibleAgency" placeholder="Assign agency" value="${escapeHtml(i.responsibleAgency || "")}"></td>
          <td data-label="Status"><select class="form-select form-select-sm" data-key="status">${statusOptions}</select></td>
          <td data-label="Update"><button class="btn btn-success btn-sm save w-100" data-id="${i.id}">Save</button></td>
        </tr>`;
      },
    )
    .join("");

  document.querySelectorAll(".save").forEach(
    (b) =>
      (b.onclick = async () => {
        const row = b.closest("tr");
        const categorySelect = row.querySelector('[data-key="category"]');
        if (categorySelect && !categorySelect.reportValidity()) {
          return;
        }
        const body = {};
        row
          .querySelectorAll("[data-key]")
          .forEach((x) => (body[x.dataset.key] = x.value));
        b.disabled = true;
        try {
          await api("/api/admin/issues/" + b.dataset.id, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          b.textContent = "Saved";
        } catch (error) {
          alert(error.message);
        } finally {
          b.disabled = false;
        }
      }),
  );
  exportBtn.onclick = async () => {
    const r = await fetch(`${API_BASE}/api/admin/export.csv`, {
        headers: { Authorization: "Bearer " + s.token },
      }),
      blob = await r.blob(),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mission-clean-patiala-issues.csv";
    a.click();
  };
}

let activeResetInstId = null;

async function loadInstitutions() {
  const rows = await api("/api/admin/institutions");
  institutionRows.innerHTML = rows.length
    ? rows
        .map(
          (inst, index) => `<tr>
            <td data-label="#">${index + 1}</td>
            <td data-label="Institution"><b>${escapeHtml(inst.name)}</b></td>
            <td data-label="Code"><span class="badge text-bg-light border">${escapeHtml(inst.code)}</span></td>
            <td data-label="Login Username"><code>${escapeHtml(inst.username || "—")}</code></td>
            <td data-label="Assigned Road & Stretch">
              <div><strong>${escapeHtml(inst.roadName || "—")}</strong></div>
              <small class="text-secondary">${escapeHtml(inst.roadStretch || "—")}</small>
            </td>
            <td data-label="Manage">
              <button class="btn btn-outline-warning btn-sm reset-pass-btn w-100" data-id="${inst.id}" data-name="${escapeHtml(inst.name)}">
                Reset Password
              </button>
            </td>
          </tr>`
        )
        .join("")
    : '<tr><td colspan="6" class="text-center text-secondary py-4">No institutions found.</td></tr>';

  document.querySelectorAll(".reset-pass-btn").forEach((btn) => {
    btn.onclick = () => {
      activeResetInstId = btn.dataset.id;
      resetInstName.textContent = `Institution: ${btn.dataset.name}`;
      newPasswordInput.value = "";
      resetPasswordModal.showModal();
    };
  });
}

// Modal & Form handlers
toggleAddInstBtn.onclick = () => {
  addInstitutionCard.classList.toggle("d-none");
  if (!addInstitutionCard.classList.contains("d-none")) {
    addInstitutionCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

cancelAddInstBtn.onclick = () => {
  addInstitutionCard.classList.add("d-none");
  addInstitutionForm.reset();
};

addInstitutionForm.onsubmit = async (e) => {
  e.preventDefault();
  const submitBtn = addInstitutionForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    await api("/api/admin/institutions", {
      method: "POST",
      body: JSON.stringify({
        name: newInstName.value,
        code: newInstCode.value,
        username: newInstUser.value,
        roadName: newInstRoad.value,
        roadStretch: newInstStretch.value,
        password: newInstPass.value,
      }),
    });
    alert("Institution and login credentials successfully created!");
    addInstitutionForm.reset();
    addInstitutionCard.classList.add("d-none");
    await loadInstitutions();
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.disabled = false;
  }
};

cancelResetPassBtn.onclick = () => {
  resetPasswordModal.close();
  activeResetInstId = null;
};

resetPasswordForm.onsubmit = async (e) => {
  e.preventDefault();
  if (!activeResetInstId) return;
  const submitBtn = resetPasswordForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    const res = await api(`/api/admin/institutions/${activeResetInstId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password: newPasswordInput.value }),
    });
    alert(res.message || "Password updated successfully!");
    resetPasswordModal.close();
    activeResetInstId = null;
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.disabled = false;
  }
};

init().catch((e) => alert(e.message));
