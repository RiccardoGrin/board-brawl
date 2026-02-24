/**
 * One-time importer for the BGG ranks CSV into Firestore "games" collection.
 *
 * Usage (ESM-friendly):
 * 1) Ensure you have a service account key for your Firebase project.
 *    Export GOOGLE_APPLICATION_CREDENTIALS pointing to that JSON:
 *      PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\key.json"
 *      Bash: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
 * 2) Install dependencies if needed:
 *      npm install firebase-admin csv-parse
 * 3) Run:
 *      node scripts/import-bgg-csv.js data/boardgames_ranks.csv
 *
 * Notes:
 * - Maps columns: id, name, yearpublished, average (rating), bayesaverage, is_expansion
 * - Creates/updates docs in "games" keyed by generated gameId; reuses doc if sourceIds.bgg matches.
 * - Writes in batches of 400 to stay under Firestore limits.
 */

import fs from 'fs';
import { parse } from 'csv-parse';
import admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import path from 'path';
import url from 'url';

if (!process.argv[2]) {
  console.error('Usage: node scripts/import-bgg-csv.js <path-to-csv> [--no-lookup] [--limit=N]');
  process.exit(1);
}

const argv = process.argv.slice(2);
const csvArg = argv[0];
const noLookup = argv.includes('--no-lookup');
const limitArg = argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvPath = path.isAbsolute(csvArg) ? csvArg : path.join(__dirname, '..', csvArg);
if (!fs.existsSync(csvPath)) {
  console.error('CSV file not found:', csvPath);
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Please set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();
const gamesCollection = db.collection('games');
const BATCH_SIZE = 450;

const normalize = (s) => s.trim().toLowerCase();

const clean = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(
      ([, v]) => v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v)),
    ),
  );

async function findByBggId(bggId) {
  const snap = await gamesCollection.where('sourceIds.bgg', '==', String(bggId)).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, data: doc.data() };
}

function mapRow(row) {
  const id = (row.id || '').trim();
  const name = (row.name || '').trim();
  return clean({
    primaryName: name,
    normalized: normalize(name),
    sourceIds: { bgg: String(id) },
    sources: ['bgg-csv'],
    year: row.yearpublished ? Number(row.yearpublished) : undefined,
    rating: row.average ? Number(row.average) : undefined,
    bayesAverage: row.bayesaverage ? Number(row.bayesaverage) : undefined,
    isExpansion: row.is_expansion === '1',
    ranks: [],
    fetchedAt: new Date().toISOString(),
    altNames: [],
    designers: [],
    publishers: [],
    categories: [],
    mechanics: [],
  });
}

async function run() {
  console.log('Starting import from', csvPath, { noLookup, limit, batchSize: BATCH_SIZE });
  const parser = fs
    .createReadStream(csvPath)
    .pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );

  let batch = db.batch();
  let count = 0;
  let written = 0;
  let skipped = 0;

  for await (const row of parser) {
    if (limit && count >= limit) break;
    count += 1;
    const rawId = (row.id || '').trim();
    const rawName = (row.name || '').trim();
    if (!rawId || !rawName) {
      skipped += 1;
      continue;
    }

    const mapped = mapRow(row);
    let targetId = null;

    if (!noLookup) {
      const existing = await findByBggId(row.id);
      if (existing) {
        targetId = existing.id;
      }
    }
    if (!targetId) {
      targetId = mapped.gameId || randomUUID();
    }

    const docRef = gamesCollection.doc(targetId);
    batch.set(docRef, mapped, { merge: true });

    if (count % BATCH_SIZE === 0) {
      await batch.commit();
      written += BATCH_SIZE;
      console.log(`Committed ${written} rows...`);
      batch = db.batch();
    }
  }

  if (count % BATCH_SIZE !== 0) {
    await batch.commit();
    written += count % BATCH_SIZE;
  }

  console.log(`Import complete. Total rows processed: ${count}, written: ${written}, skipped: ${skipped}`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Import failed', err);
  process.exit(1);
});

