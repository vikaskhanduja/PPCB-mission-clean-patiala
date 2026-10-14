/**
 * One-time migration script: data/db.json → MongoDB Atlas
 * Usage: node scripts/migrate.js
 * Make sure MONGODB_URI is set in your .env file first.
 */

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

// ── Same models as src/db.js ──────────────────────────────────────────────────
const opts = { versionKey: false };

const Counter      = mongoose.model('Counter',      new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }));
const User         = mongoose.model('User',         new mongoose.Schema({ id: Number, name: String, email: String, passwordHash: String, role: String, institutionId: Number }, opts));
const Institution  = mongoose.model('Institution',  new mongoose.Schema({ id: Number, code: String, name: String }, opts));
const Road         = mongoose.model('Road',         new mongoose.Schema({ id: Number, institutionId: Number, name: String, stretch: String, ward: String }, opts));
const Assessment   = mongoose.model('Assessment',   new mongoose.Schema({ id: Number, institutionId: Number, roadId: Number, userId: Number, assessorName: String, designation: String, contact: String, remarks: String, status: String, createdAt: String, updatedAt: String, submittedAt: String }, opts));
const Issue        = mongoose.model('Issue',        new mongoose.Schema({ id: Number, assessmentId: Number, issueCode: String, category: String, subcategory: String, subcategoryDetails: String, legacyCategory: String, description: String, recommendation: String, latitude: String, longitude: String, accuracy: String, priority: String, responsibleAgency: String, status: String, targetDate: String, adminRemarks: String, createdAt: String, updatedAt: String }, opts));
const Photo        = mongoose.model('Photo',        new mongoose.Schema({ id: Number, issueId: Number, path: String, originalName: String, type: String, uploadedAt: String }, opts));

// ─────────────────────────────────────────────────────────────────────────────
async function migrate() {
  if (!process.env.MONGODB_URI) {
    console.error('❌  MONGODB_URI not set in .env — aborting.');
    process.exit(1);
  }

  console.log('🔗  Connecting to MongoDB Atlas…');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅  Connected.\n');

  // Read local db.json
  const raw  = await readFile('data/db.json', 'utf-8');
  const data = JSON.parse(raw);

  // Helper: insert only records that don't already exist (safe to re-run)
  async function upsertMany(Model, records, label) {
    if (!records?.length) { console.log(`⏭   ${label}: no records to migrate`); return; }
    let inserted = 0;
    for (const rec of records) {
      await Model.updateOne({ id: rec.id }, { $setOnInsert: rec }, { upsert: true });
      inserted++;
    }
    console.log(`✅  ${label}: ${inserted} records migrated`);
  }

  await upsertMany(User,        data.users,        'Users');
  await upsertMany(Institution, data.institutions, 'Institutions');
  await upsertMany(Road,        data.roads,        'Roads');
  await upsertMany(Assessment,  data.assessments,  'Assessments');
  await upsertMany(Issue,       data.issues,       'Issues');
  await upsertMany(Photo,       data.photos,       'Photos');

  // Sync counters to match max IDs so new records don't clash
  async function syncCounter(name, records) {
    const maxId = data.counters?.[name] ?? Math.max(0, ...(records || []).map(r => r.id ?? 0));
    if (maxId > 0) {
      await Counter.updateOne({ _id: name }, { $max: { seq: maxId } }, { upsert: true });
      console.log(`🔢  Counter "${name}" set to ${maxId}`);
    }
  }

  await syncCounter('users',        data.users);
  await syncCounter('institutions', data.institutions);
  await syncCounter('roads',        data.roads);
  await syncCounter('assessments',  data.assessments);
  await syncCounter('issues',       data.issues);
  await syncCounter('photos',       data.photos);

  console.log('\n🎉  Migration complete! All local data is now in MongoDB Atlas.');
  await mongoose.disconnect();
}

migrate().catch(err => { console.error('❌ Migration failed:', err.message); process.exit(1); });
