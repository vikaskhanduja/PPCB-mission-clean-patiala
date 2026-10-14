import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// ─── Auto-increment counter (keeps numeric IDs compatible with existing routes) ─
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model('Counter', counterSchema);

export async function nextId(name) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

// ─── Shared schema options ────────────────────────────────────────────────────
const opts = {
  versionKey: false,
  toJSON: { transform: (_, ret) => { delete ret._id; return ret; } },
};

// ─── Models ──────────────────────────────────────────────────────────────────
export const User = mongoose.model('User', new mongoose.Schema({
  id:           { type: Number, unique: true },
  name:         String,
  email:        { type: String, lowercase: true },
  passwordHash: String,
  role:         String,
  institutionId: Number,
}, opts));

export const Institution = mongoose.model('Institution', new mongoose.Schema({
  id:   { type: Number, unique: true },
  code: String,
  name: String,
}, opts));

export const Road = mongoose.model('Road', new mongoose.Schema({
  id:            { type: Number, unique: true },
  institutionId: Number,
  name:          String,
  stretch:       String,
  ward:          String,
}, opts));

export const Assessment = mongoose.model('Assessment', new mongoose.Schema({
  id:            { type: Number, unique: true },
  institutionId: Number,
  roadId:        Number,
  userId:        Number,
  assessorName:  String,
  designation:   String,
  contact:       String,
  remarks:       String,
  status:        String,
  createdAt:     String,
  updatedAt:     String,
  submittedAt:   String,
}, opts));

export const Issue = mongoose.model('Issue', new mongoose.Schema({
  id:                 { type: Number, unique: true },
  assessmentId:       Number,
  issueCode:          String,
  category:           String,
  subcategory:        String,
  subcategoryDetails: String,
  legacyCategory:     String,
  description:        String,
  recommendation:     String,
  attachmentUrl:      String,
  attachmentName:     String,
  attachmentPublicId: String,
  latitude:           String,
  longitude:          String,
  accuracy:           String,
  priority:           String,
  responsibleAgency:  String,
  status:             String,
  targetDate:         String,
  adminRemarks:       String,
  createdAt:          String,
  updatedAt:          String,
}, opts));

export const Photo = mongoose.model('Photo', new mongoose.Schema({
  id:           { type: Number, unique: true },
  issueId:      Number,
  path:         String,
  publicId:     String,
  originalName: String,
  type:         String,
  uploadedAt:   String,
}, opts));

// ─── Connect ─────────────────────────────────────────────────────────────────
export async function connect() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB Atlas');
}

import { initialInstitutions } from './institutions-data.js';

// ─── Seed default data (seeds officer & all 26 institutions) ─────────────────
export async function seed() {
  // Ensure default officer exists
  let officerUser = await User.findOne({ email: 'officer@ppcb.gov.in' });
  if (!officerUser) {
    const officerId = await nextId('users');
    await User.create({
      id: officerId,
      name: 'PPCB Officer',
      email: 'officer@ppcb.gov.in',
      passwordHash: await bcrypt.hash('Officer@123', 12),
      role: 'officer',
      institutionId: null,
    });
    console.log('✅ Created default PPCB Officer account');
  }

  // Ensure default fallback institution user still exists for legacy testing
  const legacyInst = await User.findOne({ email: 'institution@mcpatiala.in' });
  if (!legacyInst) {
    let tietInst = await Institution.findOne({ code: 'TIET' });
    if (!tietInst) {
      const instId = await nextId('institutions');
      tietInst = await Institution.create({ id: instId, code: 'TIET', name: 'Thapar Institute of Engineering & Technology' });
    }
    await User.create({
      id: await nextId('users'),
      name: 'Institution User',
      email: 'institution@mcpatiala.in',
      passwordHash: await bcrypt.hash('Institution@123', 12),
      role: 'institution',
      institutionId: tietInst.id,
    });
  }

  // Seed / update all 26 institutions & roads
  for (const item of initialInstitutions) {
    let inst = await Institution.findOne({ code: item.code });
    if (!inst) {
      const instId = await nextId('institutions');
      inst = await Institution.create({
        id: instId,
        code: item.code,
        name: item.name,
      });
    }

    let road = await Road.findOne({ institutionId: inst.id });
    if (!road) {
      const roadId = await nextId('roads');
      await Road.create({
        id: roadId,
        institutionId: inst.id,
        name: item.roadName,
        stretch: item.roadStretch,
        ward: '',
      });
    }

    let user = await User.findOne({ email: item.username.toLowerCase() });
    if (!user) {
      const userId = await nextId('users');
      // Default secure password for initial login: Patiala@2026 or Code@123
      const defaultPassword = `${item.code}@Patiala2026`;
      await User.create({
        id: userId,
        name: item.name,
        email: item.username.toLowerCase(),
        passwordHash: await bcrypt.hash(defaultPassword, 12),
        role: 'institution',
        institutionId: inst.id,
      });
    }
  }

  console.log('✅ Database verified: all 26 institutions, roads, and accounts ready');
}
