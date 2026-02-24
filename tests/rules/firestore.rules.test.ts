import { readFileSync } from 'fs';
import path from 'path';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

const rules = readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
const projectId = 'demo-boardbrawl';
const hostFromEnv = process.env.FIRESTORE_EMULATOR_HOST;
const [envHost, envPort] = hostFromEnv ? hostFromEnv.split(':') : [];
const emulatorHost = envHost || '127.0.0.1';
const emulatorPort = envPort ? Number(envPort) : 8080;

const baseTournament = (overrides: Record<string, unknown> = {}) => ({
  name: 'Test',
  format: 'accumulative',
  players: [
    { id: 'p1', name: 'A', color: '#ef4444' },
    { id: 'p2', name: 'B', color: '#3b82f6' },
  ],
  gameSessions: [],
  state: 'active',
  date: '2026-01-01T00:00:00.000Z',
  ownerId: 'owner-uid',
  memberIds: ['owner-uid'],
  memberRoles: { 'owner-uid': 'owner' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: serverTimestamp(),
  ownerName: 'Owner',
  ...overrides,
});

const bracketConfig = {
  gameTitle: 'Chess',
  totalRounds: 1,
  currentRound: 1,
  hasStarted: false,
  bracket: [
    {
      id: 'r1m0',
      round: 1,
      matchNumber: 0,
      player1Id: 'p1',
      player2Id: 'p2',
      isComplete: false,
    },
  ],
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules, host: emulatorHost, port: emulatorPort },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('firestore.rules (tournaments)', () => {
  it('rejects unauthenticated create', async () => {
    const ctx = testEnv.unauthenticatedContext();
    const db = ctx.firestore();
    await assertFails(setDoc(doc(db, 'tournaments', 'unauth'), baseTournament()));
  });

  it('rejects missing ownerId/memberIds', async () => {
    const ctx = testEnv.authenticatedContext('owner-uid');
    const db = ctx.firestore();
    const payload = baseTournament({ ownerId: 'owner-uid', memberIds: [] });
    await assertFails(setDoc(doc(db, 'tournaments', 'no-owner'), payload));
  });

  it('rejects overly long name and empty players', async () => {
    const ctx = testEnv.authenticatedContext('owner-uid');
    const db = ctx.firestore();
    const payload = baseTournament({
      name: 'x'.repeat(26),
      players: [],
    });
    await assertFails(setDoc(doc(db, 'tournaments', 'bad-name'), payload));
  });

  it('allows accumulative tournament create without bracketConfig', async () => {
    const ctx = testEnv.authenticatedContext('owner-uid');
    const db = ctx.firestore();
    await assertSucceeds(setDoc(doc(db, 'tournaments', 'accum-ok'), baseTournament()));
  });

  it('rejects create when ownerId not in memberIds', async () => {
    const ctx = testEnv.authenticatedContext('owner-uid');
    const db = ctx.firestore();
    const payload = baseTournament({
      ownerId: 'owner-uid',
      memberIds: ['someone-else'],
    });

    await assertFails(setDoc(doc(db, 'tournaments', 'bad-owner'), payload));
  });

  it('allows bracket tournament create with bracketConfig', async () => {
    const ctx = testEnv.authenticatedContext('owner-uid');
    const db = ctx.firestore();
    const payload = baseTournament({
      format: 'bracket',
      players: [
        { id: 'p1', name: 'A', color: '#ef4444' },
        { id: 'p2', name: 'B', color: '#3b82f6' },
        { id: 'p3', name: 'C', color: '#10b981' },
        { id: 'p4', name: 'D', color: '#f59e0b' },
      ],
      bracketConfig,
    });

    await assertSucceeds(setDoc(doc(db, 'tournaments', 'bracket-ok'), payload));
  });

  it('rejects bracket tournament with invalid bracketConfig', async () => {
    const ctx = testEnv.authenticatedContext('owner-uid');
    const db = ctx.firestore();
    const payload = baseTournament({
      format: 'bracket',
      bracketConfig: {
        ...bracketConfig,
        currentRound: 0, // invalid per rules (>0 required)
      },
    });

    await assertFails(setDoc(doc(db, 'tournaments', 'bracket-bad'), payload));
  });

  it('rejects update by viewer (not owner/editor)', async () => {
    // Seed a tournament as owner
    const ownerCtx = testEnv.authenticatedContext('owner-uid');
    const ownerDb = ownerCtx.firestore();
    await setDoc(doc(ownerDb, 'tournaments', 't1'), baseTournament());

    // Attempt update as viewer
    const viewerCtx = testEnv.authenticatedContext('viewer-uid');
    const viewerDb = viewerCtx.firestore();
    await assertFails(
      setDoc(doc(viewerDb, 'tournaments', 't1'), { name: 'NewName' }, { merge: true })
    );
  });

  it('allows owner to create valid gameSession and rejects viewer', async () => {
    // Seed tournament
    const ownerCtx = testEnv.authenticatedContext('owner-uid');
    const ownerDb = ownerCtx.firestore();
    await setDoc(doc(ownerDb, 'tournaments', 't2'), baseTournament());

    const sessionPayload = {
      tournamentId: 't2',
      gameName: 'Catan',
      gameType: 'ffa',
      preset: 'quick',
      scoringRules: { first: 3, second: 2, third: 1, others: 0 },
      participants: ['p1', 'p2'],
      results: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    // Owner can create
    await assertSucceeds(
      setDoc(doc(ownerDb, 'tournaments', 't2', 'gameSessions', 's1'), sessionPayload)
    );

    // Viewer cannot create
    const viewerCtx = testEnv.authenticatedContext('viewer-uid');
    const viewerDb = viewerCtx.firestore();
    await assertFails(
      setDoc(doc(viewerDb, 'tournaments', 't2', 'gameSessions', 's2'), sessionPayload)
    );
  });
});

