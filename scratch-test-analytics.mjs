import fs from 'node:fs';

const BASE = 'https://mission-clean-patiala.onrender.com';
const login = await (await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'officer@ppcb.gov.in', password: 'Officer@123' }),
})).json();

const assessments = await (await fetch(`${BASE}/api/assessments`, {
  headers: { Authorization: `Bearer ${login.token}` }
})).json();

const insts = await (await fetch(`${BASE}/api/admin/institutions`, {
  headers: { Authorization: `Bearer ${login.token}` }
})).json();

const instMap = Object.fromEntries(insts.map(i => [i.id, i]));

console.log('Assessments loaded:', assessments.length);
assessments.forEach(a => {
  const name = a.institution?.name || instMap[a.institutionId]?.name || `Inst #${a.institutionId}`;
  console.log(`Assessment #${a.id} -> Reported By: "${name}" (Assessor: ${a.assessorName}, Road: ${a.road?.name})`);
});

const issues = assessments.flatMap(a => a.issues || []);
console.log('Total issues:', issues.length);

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

const categoryStats = masterCategories.map(cat => {
  const catIssues = issues.filter(i => (i.category || 'Other Intervention') === cat);
  const total = catIssues.length;
  const reported = catIssues.filter(i => (i.status || 'Reported') === 'Reported').length;
  const verified = catIssues.filter(i => ['Validated', 'Verified'].includes(i.status)).length;
  const completed = catIssues.filter(i => ['Completed', 'Closed'].includes(i.status)).length;
  const pending = Math.max(0, total - (reported + verified + completed));
  return { cat, total, reported, verified, pending, completed };
});

console.log('\nCategory Breakdown Matrix:');
console.table(categoryStats);
