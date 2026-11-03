import fs from 'node:fs';

let js = fs.readFileSync('js/dashboard.js', 'utf8');

// 1. Update chartCanvases
js = js.replace(
`const chartCanvases = {
  intervention: document.getElementById("interventionChart"),
  category: document.getElementById("categoryChart"),
  subcategory: document.getElementById("subcategoryChart"),
};`,
`const chartCanvases = {
  intervention: document.getElementById("interventionChart"),
  category: document.getElementById("categoryChart"),
  categoryDonut: document.getElementById("categoryDonutChart"),
  subcategory: document.getElementById("subcategoryChart"),
};`
);

// 2. Add institution map cache & Category metadata
const helperCode = `
let institutionsMap = {};
async function getInstitutionsMap() {
  if (Object.keys(institutionsMap).length) return institutionsMap;
  try {
    const list = await api("/api/admin/institutions");
    institutionsMap = Object.fromEntries(list.map((i) => [i.id, i]));
  } catch (e) {
    // ignore
  }
  return institutionsMap;
}

const CATEGORY_META = {
  "Solid Waste Management": { icon: "🗑️", short: "Solid Waste" },
  "Road Dust Mitigation": { icon: "🛣️", short: "Road Dust" },
  "Plantation": { icon: "🌱", short: "Plantation" },
  "Pruning & Maintenance": { icon: "✂️", short: "Pruning" },
  "Vehicular Emission Mitigation": { icon: "🚗", short: "Vehicular Emission" },
  "Single-use plastic": { icon: "🛍️", short: "Plastic Ban" },
  "Sensitisation / IEC": { icon: "📢", short: "Awareness / IEC" },
  "Other Intervention": { icon: "⚙️", short: "Other" },
};
`;

if (!js.includes('getInstitutionsMap')) {
  js = js.replace('const charts = {};', 'const charts = {};' + helperCode);
}

// 3. Update upsertChart to support multiple datasets (e.g. stacked bar chart)
const oldUpsert = `function upsertChart(key, config) {
  const existing = charts[key];
  if (existing) {
    existing.data.labels = config.data.labels;
    existing.data.datasets[0].data = config.data.datasets[0].data;
    existing.update();
    return;
  }
  charts[key] = new Chart(chartCanvases[key], config);
}`;

const newUpsert = `function upsertChart(key, config) {
  const existing = charts[key];
  if (existing) {
    existing.data.labels = config.data.labels;
    existing.data.datasets = config.data.datasets;
    if (config.options) existing.options = config.options;
    existing.update();
    return;
  }
  const canvas = chartCanvases[key];
  if (canvas) {
    charts[key] = new Chart(canvas, config);
  }
}`;

js = js.replace(oldUpsert, newUpsert);

// 4. Update updateAnalyticsCharts
const oldAnalyticsFnStart = `async function updateAnalyticsCharts() {`;
const oldAnalyticsFnEnd = `  renderBarChart("intervention", interventionLabels, interventionData, "#0b8a62");
  renderDonutChart("category", categories.map(([k]) => k), categories.map(([, v]) => v));
  renderBarChart("subcategory", subcategories.map(([k]) => k), subcategories.map(([, v]) => v), "#2f9e75");
}`;

const newAnalyticsFn = `async function updateAnalyticsCharts() {
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

  // Master Category List (8 Official PPCB Heads)
  const masterCategories = [
    "Solid Waste Management",
    "Road Dust Mitigation",
    "Plantation",
    "Pruning & Maintenance",
    "Vehicular Emission Mitigation",
    "Single-use plastic",
    "Sensitisation / IEC",
    "Other Intervention",
  ];

  // Category-wise Breakdown: Total, Reported, Verified, Pending, Completed
  const categoryStats = masterCategories.map((cat) => {
    const catIssues = issues.filter((i) => parentCategory(i.category || "Other Intervention") === cat);
    const total = catIssues.length;
    const reported = catIssues.filter((i) => (i.status || "Reported") === "Reported").length;
    const verified = catIssues.filter((i) => ["Validated", "Verified"].includes(i.status)).length;
    const completed = catIssues.filter((i) => ["Completed", "Closed"].includes(i.status)).length;
    // Pending: in-progress, assigned for action, returned or open non-completed
    const pending = Math.max(0, total - (reported + verified + completed));
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const meta = CATEGORY_META[cat] || { icon: "📌", short: cat };
    return { category: cat, total, reported, verified, pending, completed, rate, meta };
  });

  // Render Category Cards Grid
  const categoryCardsGrid = document.getElementById("categoryCardsGrid");
  if (categoryCardsGrid) {
    categoryCardsGrid.innerHTML = categoryStats
      .map(
        (st) => \`<div class="col-12 col-sm-6 col-xl-3">
          <div class="category-stat-card card-pad p-3 h-100">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
              <div class="d-flex align-items-center gap-2 text-truncate">
                <span class="category-icon-bubble" aria-hidden="true">\${st.meta.icon}</span>
                <strong class="category-card-title text-truncate" title="\${escapeHtml(st.category)}">\${escapeHtml(st.category)}</strong>
              </div>
              <span class="badge text-bg-light border fw-bold text-dark" title="Total Registered Cases">\${st.total}</span>
            </div>
            
            <div class="category-metrics-grid mt-2 pt-2 border-top">
              <div class="cat-metric cat-metric--reported" title="Newly Reported">
                <span class="cat-metric-label">Reported</span>
                <span class="cat-metric-val">\${st.reported}</span>
              </div>
              <div class="cat-metric cat-metric--verified" title="Verified / Validated">
                <span class="cat-metric-label">Verified</span>
                <span class="cat-metric-val">\${st.verified}</span>
              </div>
              <div class="cat-metric cat-metric--pending" title="Pending / In Progress">
                <span class="cat-metric-label">Pending</span>
                <span class="cat-metric-val">\${st.pending}</span>
              </div>
              <div class="cat-metric cat-metric--completed" title="Completed / Resolved">
                <span class="cat-metric-label">Completed</span>
                <span class="cat-metric-val">\${st.completed}</span>
              </div>
            </div>

            <div class="mt-3">
              <div class="d-flex justify-content-between align-items-center small text-secondary mb-1">
                <span>Resolution Rate</span>
                <span class="fw-bold text-dark">\${st.rate}%</span>
              </div>
              <div class="progress" style="height: 6px;">
                <div class="progress-bar bg-success" style="width: \${st.rate}%;" role="progressbar" aria-valuenow="\${st.rate}" aria-valuemin="0" aria-valuemax="100"></div>
              </div>
            </div>
          </div>
        </div>\`
      )
      .join("");
  }

  // Render Category Table Rows
  const categoryTableRows = document.getElementById("categoryTableRows");
  if (categoryTableRows) {
    categoryTableRows.innerHTML = categoryStats
      .map(
        (st) => \`<tr>
          <td>
            <div class="d-flex align-items-center gap-2">
              <span class="category-icon-bubble" style="width: 28px; height: 28px; font-size: 0.85rem;">\${st.meta.icon}</span>
              <strong class="text-dark">\${escapeHtml(st.category)}</strong>
            </div>
          </td>
          <td class="text-center"><span class="fw-bold fs-6 text-dark">\${st.total}</span></td>
          <td class="text-center"><span class="badge badge-stat-reported">\${st.reported}</span></td>
          <td class="text-center"><span class="badge badge-stat-verified">\${st.verified}</span></td>
          <td class="text-center"><span class="badge badge-stat-pending">\${st.pending}</span></td>
          <td class="text-center"><span class="badge badge-stat-completed">\${st.completed}</span></td>
          <td style="min-width: 140px;">
            <div class="d-flex align-items-center gap-2">
              <div class="progress flex-grow-1" style="height: 6px;">
                <div class="progress-bar bg-success" style="width: \${st.rate}%;"></div>
              </div>
              <span class="small fw-semibold text-dark" style="min-width: 36px;">\${st.rate}%</span>
            </div>
          </td>
        </tr>\`
      )
      .join("");
  }

  const categoryTotalBadge = document.getElementById("categoryTotalBadge");
  if (categoryTotalBadge) {
    categoryTotalBadge.textContent = \`\${issues.length} Total Cases\`;
  }

  // Render Category Stacked Bar Chart
  upsertChart("category", {
    type: "bar",
    data: {
      labels: categoryStats.map((st) => st.meta.short || st.category),
      datasets: [
        { label: "Reported", data: categoryStats.map((st) => st.reported), backgroundColor: "#3b82f6", borderRadius: 4, maxBarThickness: 32 },
        { label: "Verified", data: categoryStats.map((st) => st.verified), backgroundColor: "#8b5cf6", borderRadius: 4, maxBarThickness: 32 },
        { label: "Pending", data: categoryStats.map((st) => st.pending), backgroundColor: "#f59e0b", borderRadius: 4, maxBarThickness: 32 },
        { label: "Completed", data: categoryStats.map((st) => st.completed), backgroundColor: "#10b981", borderRadius: 4, maxBarThickness: 32 },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, padding: 14, font: { weight: 600 } } },
      },
      scales: {
        x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        y: { stacked: true, grid: { display: false } },
      },
    },
  });

  // Render Category Donut Share Chart
  const activeCategories = categoryStats.filter((st) => st.total > 0);
  const donutLabels = (activeCategories.length ? activeCategories : categoryStats).map((st) => st.category);
  const donutData = (activeCategories.length ? activeCategories : categoryStats).map((st) => st.total);
  renderDonutChart("categoryDonut", donutLabels, donutData);

  // Subcategories breakdown
  const subcategories = sorted(countBy((i) => i.subcategory || "Awaiting sub-category"), 10);
  renderBarChart("subcategory", subcategories.map(([k]) => k), subcategories.map(([, v]) => v), "#2f9e75");

  // Assessment status chart
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
}`;

// Find start and end of updateAnalyticsCharts in js
const startIndex = js.indexOf(oldAnalyticsFnStart);
const endIndex = js.indexOf(oldAnalyticsFnEnd);
if (startIndex !== -1 && endIndex !== -1) {
  js = js.slice(0, startIndex) + newAnalyticsFn + js.slice(endIndex + oldAnalyticsFnEnd.length);
  console.log('updateAnalyticsCharts replaced successfully');
} else {
  console.error('Could not locate updateAnalyticsCharts bounds', { startIndex, endIndex });
}

// 5. Update loadAssessments for Reported By column in PPCB login
const oldLoadAssessments = `async function loadAssessments() {
  const rows = await api("/api/assessments");
  assessmentRows.innerHTML = rows.length
    ? rows
        .map(
          (item) => {
            const issueDetails = item.issues?.length
              ? item.issues
                  .map(
                    (issue) => \`<div class=\"assessment-issue\">
                      <b>\${escapeHtml(issue.issueCode)} · \${escapeHtml(issue.subcategory || issue.category || \"Issue\")}</b>
                      <span class=\"text-secondary small d-block\">Category: \${escapeHtml(issue.category || \"—\")}\${issue.subcategoryDetails ? \` — \${escapeHtml(issue.subcategoryDetails)}\` : \"\"}</span>
                      <span>\${escapeHtml(issue.description || issue.recommendation || \"No description provided\")}</span>
                      <small>Recommendation: \${escapeHtml(issue.recommendation || \"—\")} · Location: \${escapeHtml(issue.latitude || \"—\")}, \${escapeHtml(issue.longitude || \"—\")}</small>
                      \${attachmentLink(issue)}
                      \${photoLinks(issue)}
                    </div>\`,
                  )
                  .join(\"\")
              : \"No issues added\";
            return \`<tr>
            <td data-label=\"Assessment\"><span class=\"fw-bold text-success\">#\${escapeHtml(item.id)}</span></td>
            <td data-label=\"Assessor\">\${escapeHtml(item.assessorName || \"—\")}</td>
            <td data-label=\"Assigned Road\"><strong>\${escapeHtml(item.road?.name || \"—\")}</strong></td>
            <td data-label=\"Road Stretch\">\${escapeHtml(item.road?.stretch || \"—\")}</td>
            <td data-label=\"Status\"><span class=\"badge \${item.status === \"Submitted\" ? \"text-bg-success\" : \"text-bg-warning\"}\">\${escapeHtml(item.status || \"—\")}</span></td>
            <td data-label=\"Issues / Interventions\">\${issueDetails}</td>
            <td data-label=\"Created\">\${escapeHtml(formatDate(item.createdAt))}</td>
            <td data-label=\"Submitted\">\${escapeHtml(formatDate(item.submittedAt))}</td>
          </tr>\`;
          },
        )
        .join(\"\")
    : '<tr><td colspan=\"8\" class=\"text-center text-secondary py-4\">No assessments found.</td></tr>';
}`;

const newLoadAssessments = `async function loadAssessments() {
  const isOfficer = s.user.role !== "institution";
  const thReportedBy = document.getElementById("thReportedBy");
  if (thReportedBy) {
    thReportedBy.classList.toggle("d-none", !isOfficer);
  }
  const titleEl = document.getElementById("assessmentsTableTitle");
  if (titleEl) {
    titleEl.textContent = isOfficer ? "Road Assessments" : "My Assessments";
  }

  // Pre-load institutions map if officer, ensuring "Reported By" displays immediately
  let instMap = {};
  if (isOfficer) {
    instMap = await getInstitutionsMap().catch(() => ({}));
  }

  const rows = await api("/api/assessments");
  const totalCols = isOfficer ? 9 : 8;

  assessmentRows.innerHTML = rows.length
    ? rows
        .map((item) => {
          const instName =
            item.institution?.name ||
            instMap[item.institutionId]?.name ||
            (item.institutionId ? \`Institution #\${item.institutionId}\` : "—");

          const issueDetails = item.issues?.length
            ? item.issues
                .map(
                  (issue) => \`<div class="assessment-issue">
                    <b>\${escapeHtml(issue.issueCode)} · \${escapeHtml(issue.subcategory || issue.category || "Issue")}</b>
                    <span class="text-secondary small d-block">Category: \${escapeHtml(issue.category || "—")}\${issue.subcategoryDetails ? \` — \${escapeHtml(issue.subcategoryDetails)}\` : ""}</span>
                    <span>\${escapeHtml(issue.description || issue.recommendation || "No description provided")}</span>
                    <small>Recommendation: \${escapeHtml(issue.recommendation || "—")} · Location: \${escapeHtml(issue.latitude || "—")}, \${escapeHtml(issue.longitude || "—")}</small>
                    \${attachmentLink(issue)}
                    \${photoLinks(issue)}
                  </div>\`,
                )
                .join("")
            : "No issues added";

          return \`<tr>
          \${isOfficer ? \`<td data-label="Reported By"><strong class="text-dark">\${escapeHtml(instName)}</strong></td>\` : ""}
          <td data-label="Assessment"><span class="fw-bold text-success">#\${escapeHtml(item.id)}</span></td>
          <td data-label="Assessor">\${escapeHtml(item.assessorName || "—")}</td>
          <td data-label="Assigned Road"><strong>\${escapeHtml(item.road?.name || "—")}</strong></td>
          <td data-label="Road Stretch">\${escapeHtml(item.road?.stretch || "—")}</td>
          <td data-label="Status"><span class="badge \${item.status === "Submitted" ? "text-bg-success" : "text-bg-warning"}">\${escapeHtml(item.status || "—")}</span></td>
          <td data-label="Issues / Interventions">\${issueDetails}</td>
          <td data-label="Created">\${escapeHtml(formatDate(item.createdAt))}</td>
          <td data-label="Submitted">\${escapeHtml(formatDate(item.submittedAt))}</td>
        </tr>\`;
        })
        .join("")
    : \`<tr><td colspan="\${totalCols}" class="text-center text-secondary py-4">No assessments found.</td></tr>\`;
}`;

if (js.includes(oldLoadAssessments)) {
  js = js.replace(oldLoadAssessments, newLoadAssessments);
  console.log('loadAssessments replaced successfully');
} else {
  console.error('Could not find oldLoadAssessments');
}

// 6. Update renderKpis to be more accurate and informative
const oldRenderKpis = `function renderKpis(stats) {
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
  ];`;

const newRenderKpis = `function renderKpis(stats) {
  const cards = [
    {
      key: "assessments",
      label: "Assessments",
      value: stats.assessments,
      note: "Road assessments conducted",
      icon: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M9 10h6M9 14h6M9 18h3"/>',
    },
    {
      key: "issues",
      label: "Total Issues",
      value: stats.issues,
      note: "Field interventions logged",
      icon: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M12.5 7.5v4M12.5 15h.01"/>',
    },
    {
      key: "pending",
      label: "Pending",
      value: stats.pending,
      note: "Awaiting remediation",
      icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    },
    {
      key: "completed",
      label: "Completed",
      value: stats.completed,
      note: "Ground remediation verified",
      icon: '<path d="M20 11.1V12a8 8 0 1 1-4.75-7.32"/><path d="m8.5 11.5 3 3L21 5"/>',
    },
  ];`;

if (js.includes(oldRenderKpis)) {
  js = js.replace(oldRenderKpis, newRenderKpis);
  console.log('renderKpis updated successfully');
} else {
  console.error('Could not find oldRenderKpis');
}

fs.writeFileSync('js/dashboard.js', js, 'utf8');
console.log('js/dashboard.js written.');
