import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { User, Institution, Road, Assessment, Issue, Photo, nextId } from './db.js';
import { auth, allow } from './auth.js';
import { issueCategories, officerCategories, institutionIssues, categoryForIssue, isValidIssue, normalizeIssueCategory } from './issue-categories.js';
import { storePhoto, storeFile } from './storage.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/') || ATTACHMENT_TYPES.has(file.mimetype)),
});
export const router = express.Router();
const now = () => new Date().toISOString();

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login', async (req, res) => {
  const email = String(req.body.email || '').toLowerCase();
  const user = await User.findOne({ email }).lean();
  if (!user || !await bcrypt.compare(req.body.password || '', user.passwordHash))
    return res.status(401).json({ message: 'Invalid credentials' });
  const institution = await Institution.findOne({ id: user.institutionId }).lean();
  const token = jwt.sign(
    { id: user.id, role: user.role, institutionId: user.institutionId },
    process.env.JWT_SECRET || 'development-secret-change-me',
    { expiresIn: '8h' }
  );
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, institution: institution?.name || '' } });
});

router.use(auth);

// ─── Master data ──────────────────────────────────────────────────────────────
router.get('/master/categories', (req, res) => res.json({
  mapping: issueCategories,
  officerCategories,
  institutionIssues,
  ...issueCategories,
}));

// ─── Dashboard stats ──────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const query = req.user.role === 'institution' ? { institutionId: req.user.institutionId } : {};
  const assessments = await Assessment.find(query).lean();
  const ids = assessments.map(a => a.id);
  const issues = await Issue.find({ assessmentId: { $in: ids } }).lean();
  const completed = issues.filter(i => ['Completed', 'Verified', 'Closed'].includes(i.status)).length;
  res.json({ assessments: assessments.length, issues: issues.length, completed, pending: issues.length - completed });
});

// ─── Institution details ──────────────────────────────────────────────────────
router.get('/institution/details', allow('institution'), async (req, res) => {
  const institution = await Institution.findOne({ id: req.user.institutionId }).lean();
  if (!institution) return res.status(404).json({ message: 'Institution not found' });
  const road = await Road.findOne({ institutionId: institution.id }).lean();
  res.json({ institutionName: institution.name, assignedRoad: road?.name || '', roadStretch: road?.stretch || '' });
});

// ─── Assessments ──────────────────────────────────────────────────────────────
router.get('/assessments', async (req, res) => {
  const query = req.user.role === 'institution' ? { institutionId: req.user.institutionId } : {};
  const assessments = await Assessment.find(query).lean();

  // Batch-load roads and issues to avoid N+1 queries
  const roadIds = [...new Set(assessments.map(a => a.roadId))];
  const roads = await Road.find({ id: { $in: roadIds } }).lean();
  const roadMap = Object.fromEntries(roads.map(r => [r.id, r]));

  const assessmentIds = assessments.map(a => a.id);
  const issues = await Issue.find({ assessmentId: { $in: assessmentIds } }).lean();
  const issueIds = issues.map(i => i.id);
  const photos = await Photo.find({ issueId: { $in: issueIds } }).lean();
  const photosByIssue = {};
  photos.forEach(p => {
    (photosByIssue[p.issueId] = photosByIssue[p.issueId] || []).push(p);
  });

  const issuesByAssessment = {};
  issues.forEach(i => {
    (issuesByAssessment[i.assessmentId] = issuesByAssessment[i.assessmentId] || []).push({
      ...normalizeIssueCategory(i),
      photos: photosByIssue[i.id] || [],
    });
  });

  const rows = assessments.map(a => ({
    ...a,
    road: roadMap[a.roadId],
    issues: issuesByAssessment[a.id] || [],
  }));
  res.json(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
});

router.post('/assessments', allow('institution'), async (req, res) => {
  const road = await Road.findOne({ institutionId: req.user.institutionId }).lean();
  if (!road) return res.status(400).json({ message: 'No assigned road' });
  const row = {
    id: await nextId('assessments'),
    institutionId: req.user.institutionId,
    roadId: road.id,
    userId: req.user.id,
    assessorName: req.body.assessorName || '',
    designation: req.body.designation || '',
    contact: req.body.contact || '',
    remarks: req.body.remarks || '',
    status: 'Draft',
    createdAt: now(),
    updatedAt: now(),
    submittedAt: null,
  };
  await Assessment.create(row);
  res.status(201).json(row);
});

router.post('/assessments/:id/issues', allow('institution'), async (req, res) => {
  const assessment = await Assessment.findOne({ id: Number(req.params.id), institutionId: req.user.institutionId }).lean();
  if (!assessment) return res.sendStatus(404);

  const selectedIssue = String(req.body.category || req.body.subcategory || req.body.issue || '').trim();
  if (!selectedIssue || !isValidIssue(selectedIssue))
    return res.status(400).json({ message: 'Select a valid issue category' });
  if (!req.body.recommendation)
    return res.status(400).json({ message: 'Recommendation is required' });

  const isOther = selectedIssue === 'Other';
  const otherDetails = String(req.body.subcategoryDetails || req.body.categoryDetails || '').trim();
  if (isOther && !otherDetails)
    return res.status(400).json({ message: 'Specify the other intervention' });

  const parentCat = categoryForIssue(selectedIssue);

  const number = await Issue.countDocuments({ assessmentId: assessment.id }) + 1;
  const row = {
    id: await nextId('issues'),
    assessmentId: assessment.id,
    issueCode: `MCP-PAT-ROAD${String(assessment.roadId).padStart(3, '0')}-ISSUE-${String(number).padStart(3, '0')}`,
    category: parentCat,
    subcategory: selectedIssue,
    subcategoryDetails: isOther ? otherDetails : '',
    description: req.body.description || '',
    recommendation: req.body.recommendation,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    accuracy: req.body.accuracy || null,
    responsibleAgency: '',
    status: 'Reported',
    targetDate: null,
    adminRemarks: '',
    createdAt: now(),
    updatedAt: now(),
  };
  await Issue.create(row);
  await Assessment.updateOne({ id: assessment.id }, { updatedAt: now() });
  res.status(201).json(row);
});

// ─── Recommendation attachment (optional) ─────────────────────────────────────
router.post('/issues/:id/attachment', allow('institution'), attachmentUpload.single('attachment'), async (req, res) => {
  const issue = await Issue.findOne({ id: Number(req.params.id) }).lean();
  if (!issue) return res.sendStatus(404);
  const owner = await Assessment.exists({ id: issue.assessmentId, institutionId: req.user.institutionId });
  if (!owner) return res.sendStatus(403);
  if (!req.file) return res.status(400).json({ message: 'Attach an image, PDF, Word or Excel file (max 10 MB)' });
  const { url, publicId } = await storeFile(req.file, 'mission-clean-patiala/attachments');
  const updated = await Issue.findOneAndUpdate(
    { id: issue.id },
    { attachmentUrl: url, attachmentName: req.file.originalname, attachmentPublicId: publicId, updatedAt: now() },
    { new: true, lean: true }
  );
  res.status(201).json(updated);
});

// ─── Photos ───────────────────────────────────────────────────────────────────
router.post('/issues/:id/photos', allow('institution', 'officer', 'department'), upload.single('photo'), async (req, res) => {
  const issue = await Issue.findOne({ id: Number(req.params.id) }).lean();
  if (!issue || !req.file) return res.status(400).json({ message: 'Issue and image photo required' });
  const { url, publicId } = await storePhoto(req.file);
  const row = {
    id: await nextId('photos'),
    issueId: issue.id,
    path: url,
    publicId,
    originalName: req.file.originalname,
    type: req.body.type || 'Before',
    uploadedAt: now(),
  };
  await Photo.create(row);
  res.status(201).json(row);
});

// ─── Submit assessment ────────────────────────────────────────────────────────
router.patch('/assessments/:id/submit', allow('institution'), async (req, res) => {
  const a = await Assessment.findOne({ id: Number(req.params.id), institutionId: req.user.institutionId }).lean();
  if (!a) return res.sendStatus(404);
  if (!await Issue.exists({ assessmentId: a.id }))
    return res.status(400).json({ message: 'Add at least one issue' });
  const updated = await Assessment.findOneAndUpdate(
    { id: a.id },
    { status: 'Submitted', submittedAt: now(), updatedAt: now() },
    { new: true, lean: true }
  );
  res.json(updated);
});

// ─── Officer / admin views ────────────────────────────────────────────────────
router.get('/admin/issues', allow('officer', 'superadmin', 'department'), async (req, res) => {
  const [issues, assessments, roads, institutions, photos] = await Promise.all([
    Issue.find({}).lean(),
    Assessment.find({}).lean(),
    Road.find({}).lean(),
    Institution.find({}).lean(),
    Photo.find({}).lean(),
  ]);
  const assessmentMap  = Object.fromEntries(assessments.map(a => [a.id, a]));
  const roadMap        = Object.fromEntries(roads.map(r => [r.id, r]));
  const institutionMap = Object.fromEntries(institutions.map(i => [i.id, i]));
  const photosByIssue  = {};
  photos.forEach(p => { (photosByIssue[p.issueId] = photosByIssue[p.issueId] || []).push(p); });

  res.json(
    issues.map(i => {
      const a = assessmentMap[i.assessmentId];
      return {
        ...normalizeIssueCategory(i),
        assessment: a,
        road: roadMap[a?.roadId],
        institution: institutionMap[a?.institutionId],
        photos: photosByIssue[i.id] || [],
      };
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  );
});

router.patch('/admin/issues/:id', allow('officer', 'superadmin', 'department'), async (req, res) => {
  const issue = await Issue.findOne({ id: Number(req.params.id) }).lean();
  if (!issue) return res.sendStatus(404);

  const updates = {};

  if (req.body.category !== undefined) {
    if (!officerCategories.includes(req.body.category) && !Object.hasOwn(issueCategories, req.body.category))
      return res.status(400).json({ message: 'Select a valid category' });
    updates.category = req.body.category;
  }

  if (req.body.subcategory !== undefined) {
    updates.subcategory = req.body.subcategory;
  }
  if (req.body.subcategoryDetails !== undefined) {
    updates.subcategoryDetails = String(req.body.subcategoryDetails || '').trim();
  }

  for (const key of ['responsibleAgency', 'status', 'targetDate', 'adminRemarks'])
    if (req.body[key] !== undefined) updates[key] = req.body[key];

  updates.updatedAt = now();
  const updated = await Issue.findOneAndUpdate({ id: Number(req.params.id) }, updates, { new: true, lean: true });
  res.json(updated);
});

// ─── Admin: Institution Management ───────────────────────────────────────────
router.get('/admin/institutions', allow('officer', 'superadmin'), async (req, res) => {
  const [institutions, roads, users] = await Promise.all([
    Institution.find({}).lean(),
    Road.find({}).lean(),
    User.find({ role: 'institution' }).lean(),
  ]);

  const roadMap = Object.fromEntries(roads.map(r => [r.institutionId, r]));
  const userMap = Object.fromEntries(users.map(u => [u.institutionId, u]));

  const result = institutions.map(inst => {
    const user = userMap[inst.id];
    const road = roadMap[inst.id];
    return {
      id: inst.id,
      code: inst.code,
      name: inst.name,
      username: user?.email || '',
      userId: user?.id || null,
      roadName: road?.name || '',
      roadStretch: road?.stretch || '',
    };
  });

  res.json(result);
});

router.post('/admin/institutions', allow('officer', 'superadmin'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  const code = String(req.body.code || '').trim().toUpperCase();
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const roadName = String(req.body.roadName || '').trim();
  const roadStretch = String(req.body.roadStretch || '').trim();

  if (!name || !code || !username || !password) {
    return res.status(400).json({ message: 'Name, Code, Username, and Password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const existingUser = await User.findOne({ email: username });
  if (existingUser) {
    return res.status(400).json({ message: 'Username / Email already in use' });
  }

  const instId = await nextId('institutions');
  const institution = await Institution.create({
    id: instId,
    code,
    name,
  });

  if (roadName || roadStretch) {
    const roadId = await nextId('roads');
    await Road.create({
      id: roadId,
      institutionId: instId,
      name: roadName,
      stretch: roadStretch,
      ward: '',
    });
  }

  const userId = await nextId('users');
  await User.create({
    id: userId,
    name,
    email: username,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'institution',
    institutionId: instId,
  });

  res.status(201).json({
    id: instId,
    code,
    name,
    username,
    roadName,
    roadStretch,
  });
});

router.post('/admin/institutions/:id/reset-password', allow('officer', 'superadmin'), async (req, res) => {
  const instId = Number(req.params.id);
  const institution = await Institution.findOne({ id: instId }).lean();
  if (!institution) return res.status(404).json({ message: 'Institution not found' });

  const password = String(req.body.password || '');
  if (!password || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const user = await User.findOne({ institutionId: instId });
  if (!user) return res.status(404).json({ message: 'User account not found for this institution' });

  const passwordHash = await bcrypt.hash(password, 12);
  await User.updateOne({ id: user.id }, { passwordHash });

  res.json({ message: 'Password successfully reset for ' + institution.name });
});

// ─── CSV export ───────────────────────────────────────────────────────────────
router.get('/admin/export.csv', allow('officer', 'superadmin'), async (req, res) => {
  const issues = await Issue.find({}).lean();
  const esc = v => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  const rows = [
    ['Issue ID', 'Category', 'Subcategory', 'Other Intervention Details', 'Description', 'Recommendation', 'Recommendation Attachment', 'Agency', 'Status', 'Target Date'],
    ...issues.map(x => [x.issueCode, normalizeIssueCategory(x).category, x.subcategory, x.subcategoryDetails, x.description, x.recommendation, x.attachmentUrl, x.responsibleAgency, x.status, x.targetDate]),
  ];
  res.type('text/csv').attachment('mission-clean-patiala-issues.csv').send(rows.map(r => r.map(esc).join(',')).join('\n'));
});
