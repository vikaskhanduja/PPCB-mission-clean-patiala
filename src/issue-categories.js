// 8 PPCB Officer Categories
export const officerCategories = [
  "Plantation",
  "Pruning & Maintenance",
  "Solid Waste Management",
  "Single-use plastic",
  "Road Dust Mitigation",
  "Vehicular Emission Mitigation",
  "Sensitisation / IEC",
  "Other Intervention",
];

// Mapping of Categories (PPCB officer) to specific Issues (Institution)
export const issueCategories = {
  Plantation: [
    "Plantation",
    "Tree guard requirement",
    "Opportunity for beautification",
  ],
  "Pruning & Maintenance": [
    "Pruning",
    "Horticulture waste",
  ],
  "Solid Waste Management": [
    "Waste accumulation",
    "Construction & demolition waste",
    "Open burning",
    "Garbage Vulnerable Points on Road",
    "Garbage Vulnerable Points at Vacant Plot",
  ],
  "Single-use plastic": [
    "Sale/purchase of single-use plastic",
  ],
  "Road Dust Mitigation": [
    "Patchwork",
    "Pavement on road sides",
    "Green landscaping on road sides",
    "Pavement at divider",
    "Green landscaping at divider",
  ],
  "Vehicular Emission Mitigation": [
    "Traffic congestion",
    "Idling hotspot",
    "Parking-related congestion",
    "Encroachment affecting traffic flow",
  ],
  "Sensitisation / IEC": [
    "Awareness required for residents",
    "Awareness required for RWA",
    "Awareness required for shopkeepers/vendors",
    "Awareness required for market associations",
    "Awareness required for other commercial establishments",
  ],
  "Other Intervention": [
    "Other",
  ],
};

// 26 Specific Issues in exact required order for Institution dropdown
export const institutionIssues = [
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

export const issueToCategory = new Map(
  Object.entries(issueCategories).flatMap(([category, issues]) =>
    issues.map((issue) => [issue, category]),
  ),
);

// Older issue names still present in saved records
const legacyIssueToCategory = new Map([
  ["Heavy/commercial vehicle movement", "Vehicular Emission Mitigation"],
  ["Removal of Garbage Vulnerable Points", "Solid Waste Management"],
  ["Awareness required for other commercial establishment", "Sensitisation / IEC"],
]);

export function categoryForIssue(issue) {
  if (officerCategories.includes(issue) || Object.hasOwn(issueCategories, issue)) {
    return issue;
  }
  return issueToCategory.get(issue) || legacyIssueToCategory.get(issue) || "Other Intervention";
}

export function isValidIssue(issue) {
  return issueToCategory.has(issue) || legacyIssueToCategory.has(issue) || Object.hasOwn(issueCategories, issue);
}

export function normalizeIssueCategory(issue) {
  const category = categoryForIssue(issue.category) || issue.category;
  return {
    ...issue,
    category,
    // "subcategory" holds the specific issue selected by the institution
    subcategory:
      issue.subcategory ||
      (issue.category !== category ? issue.category : issue.subcategory || ""),
    legacyCategory:
      legacyIssueToCategory.has(issue.category) ? issue.category : undefined,
  };
}
