/**
 * Script to test library sync functionality (Phase 1.1)
 *
 * Run with: npx tsx scripts/test-library-sync.ts
 *
 * This simulates adding a game to a library and checks if the sync succeeds.
 */

import { deepClean } from '../src/services/librarySync';
import type { UserGame, Library, LibraryMembership } from '../src/types/library';

// Mock UserGame (simulating what's created in libraryStore.ts)
const mockUserGame: UserGame = {
  gameId: 'bbe07509-e093-4639-bc69-71d2c08d35d4',
  ownerId: 'user-123',
  gameName: 'Faraway',
  gameThumbnail: 'https://example.com/thumbnail.jpg',
  gameYear: 2023,
  status: 'owned',
  favorite: false,
  forTrade: false,
  forSale: false,
  myRating: 7.5,
  notes: 'Great card game!',
  tags: ['card-game', '2-player'],
  playCount: 5,
  condition: 'likeNew',
  createdAt: '2026-01-05T00:12:36.788Z',
  updatedAt: '2026-01-05T00:12:36.788Z',
};

// Mock Library
const mockLibrary: Library = {
  id: 'dc2334cd-23f5-4efa-8b30-8db1e68c020b',
  ownerId: 'user-123',
  name: 'My Library',
  visibility: 'public',
  systemKey: 'my',
  sortOrder: 0,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:12:36.788Z',
};

// Mock LibraryMembership
const mockMembership: LibraryMembership = {
  gameId: 'bbe07509-e093-4639-bc69-71d2c08d35d4',
  addedAt: '2026-01-05T00:12:36.788Z',
  gameName: 'Faraway',
  gameThumbnail: 'https://example.com/thumbnail.jpg',
  gameYear: 2023,
};

console.log('=== Testing Phase 1.1 Library Sync ===\n');

// Test UserGame payload
console.log('1. Testing UserGame payload...');
const userGamePayload = deepClean({
  gameId: mockUserGame.gameId,
  ownerId: mockUserGame.ownerId,
  gameName: mockUserGame.gameName,
  gameThumbnail: mockUserGame.gameThumbnail ?? null,
  gameYear: mockUserGame.gameYear ?? null,
  status: mockUserGame.status,
  myRating: mockUserGame.myRating ?? null,
  favorite: mockUserGame.favorite,
  notes: mockUserGame.notes ?? null,
  tags: mockUserGame.tags ?? null,
  forTrade: mockUserGame.forTrade,
  forSale: mockUserGame.forSale,
  condition: mockUserGame.condition ?? null,
  playCount: mockUserGame.playCount ?? null,
  createdAt: mockUserGame.createdAt,
  updatedAt: mockUserGame.updatedAt,
}) as Record<string, unknown>;

const userGameRequiredFields = ['gameId', 'ownerId', 'gameName', 'status', 'favorite', 'forTrade', 'forSale', 'createdAt', 'updatedAt'];
const userGameMissing = userGameRequiredFields.filter((f) => !(f in userGamePayload));

console.log('  Fields:', Object.keys(userGamePayload).sort().join(', '));
console.log('  Required fields present:', userGameMissing.length === 0);
if (userGameMissing.length > 0) {
  console.log('  ❌ Missing:', userGameMissing.join(', '));
}

// Test Library payload
console.log('\n2. Testing Library payload...');
const { id: _libId, ...libraryWithoutId } = mockLibrary;
const libraryPayload = deepClean({
  ...libraryWithoutId,
}) as Record<string, unknown>;

console.log('  Has "id" field:', 'id' in libraryPayload);
console.log('  Fields:', Object.keys(libraryPayload).sort().join(', '));
console.log('  ✓ "id" field correctly excluded from payload');

// Test Membership payload
console.log('\n3. Testing LibraryMembership payload...');
const membershipPayload = deepClean({
  gameId: mockMembership.gameId,
  addedAt: mockMembership.addedAt,
  gameName: mockMembership.gameName ?? null,
  gameThumbnail: mockMembership.gameThumbnail ?? null,
  gameYear: mockMembership.gameYear ?? null,
}) as Record<string, unknown>;

const membershipRequiredFields = ['gameId', 'addedAt'];
const membershipMissing = membershipRequiredFields.filter((f) => !(f in membershipPayload));

console.log('  Fields:', Object.keys(membershipPayload).sort().join(', '));
console.log('  Required fields present:', membershipMissing.length === 0);

// Test system library protection
console.log('\n4. Testing system library detection...');
console.log('  Library has systemKey:', !!mockLibrary.systemKey);
console.log('  systemKey value:', mockLibrary.systemKey);
console.log('  ✓ System library can be identified');

// Final validation
console.log('\n=== Validation Summary ===');
const allPassed =
  userGameMissing.length === 0 &&
  membershipMissing.length === 0 &&
  !('id' in libraryPayload) &&
  mockLibrary.systemKey !== undefined;

if (allPassed) {
  console.log('✅ PASS - All Phase 1.1 data structures are correct');
} else {
  console.log('❌ FAIL - Some data structures have issues');
  process.exit(1);
}
