/**
 * Validate a library item payload against Firestore rules
 * This simulates what the rules check, helping us identify which validation is failing
 */

// Simulated payload from your error
const payload = {
  "libraryId": "dc2334cd-23f5-4efa-8b30-8db1e68c020b",
  "gameId": "277f5fbb-efcd-4c9d-a62c-09f3ec396ea6",
  "gameName": "Res Arcana",
  "gameThumbnail": null,
  "gameYear": 2019,
  "status": "owned",
  "quantity": 1,
  "favorite": false,
  "playCount": 0,
  "forTrade": false,
  "forSale": false,
  "myRating": 0.5,
  "notes": "aaa",
  "createdAt": "2026-01-05T00:22:10.193Z",
  "updatedAt": { "_methodName": "serverTimestamp" }
};

const libraryId = "dc2334cd-23f5-4efa-8b30-8db1e68c020b";

console.log('=== Firestore Rules Validation Simulation ===\n');

// Helper functions (matching firestore.rules)
const isStringMax = (val: any, max: number) => {
  return typeof val === 'string' && val.length > 0 && val.length <= max;
};

const isOptionalStringMax = (val: any, max: number) => {
  return val === null || val === undefined || (typeof val === 'string' && val.length <= max);
};

const isNonNegativeNumber = (val: any) => {
  return (typeof val === 'number') && val >= 0;
};

const isOptionalNonNegativeNumber = (val: any) => {
  return val === null || val === undefined || isNonNegativeNumber(val);
};

const isTimestampLike = (val: any) => {
  return val === null || val === undefined 
    || typeof val === 'string' 
    || (typeof val === 'object' && val._methodName === 'serverTimestamp');
};

const isOptionalListMax = (val: any, max: number) => {
  return val === null || val === undefined || (Array.isArray(val) && val.length <= max);
};

// Run validations (line by line from validItemFields function)
interface ValidationResult {
  field: string;
  check: string;
  passed: boolean;
  actual?: any;
  expected?: string;
}

const results: ValidationResult[] = [];

const check = (field: string, checkDesc: string, passed: boolean, actual?: any, expected?: string) => {
  results.push({ field, check: checkDesc, passed, actual, expected });
  const status = passed ? '✓' : '✗';
  console.log(`${status} ${field}: ${checkDesc}`);
  if (!passed) {
    console.log(`   Actual: ${JSON.stringify(actual)}`);
    if (expected) console.log(`   Expected: ${expected}`);
  }
};

console.log('Checking validItemFields(data):');
console.log('================================\n');

// Line 240: data.libraryId == libraryId
check('libraryId', 'matches path libraryId', 
  payload.libraryId === libraryId, 
  payload.libraryId, 
  libraryId);

// Line 241: isStringMax(data.gameId, 50)
check('gameId', 'isStringMax(50)', 
  isStringMax(payload.gameId, 50), 
  payload.gameId);

// Line 242: isStringMax(data.gameName, 100)
check('gameName', 'isStringMax(100)', 
  isStringMax(payload.gameName, 100), 
  payload.gameName);

// Line 243: isOptionalStringMax(data.gameThumbnail, 500)
check('gameThumbnail', 'isOptionalStringMax(500)', 
  isOptionalStringMax(payload.gameThumbnail, 500), 
  payload.gameThumbnail);

// Line 244: isOptionalNonNegativeNumber(data.gameYear)
check('gameYear', 'isOptionalNonNegativeNumber()', 
  isOptionalNonNegativeNumber(payload.gameYear), 
  payload.gameYear);

// Line 245-246: data.status is string && in [...]
const validStatuses = ['owned', 'wishlist', 'preordered', 'formerlyOwned', 'played'];
check('status', 'is string', 
  typeof payload.status === 'string', 
  typeof payload.status);
check('status', `in [${validStatuses.join(', ')}]`, 
  validStatuses.includes(payload.status as string), 
  payload.status);

// Line 247: isNonNegativeNumber(data.quantity)
check('quantity', 'isNonNegativeNumber()', 
  isNonNegativeNumber(payload.quantity), 
  payload.quantity);

// Line 248: myRating == null || (isNonNegativeNumber && <= 10)
const ratingValid = payload.myRating === null || payload.myRating === undefined 
  || (isNonNegativeNumber(payload.myRating) && payload.myRating <= 10);
check('myRating', 'null or (isNonNegativeNumber() && <= 10)', 
  ratingValid, 
  payload.myRating, 
  'null or 0-10');

// Line 249: data.favorite is bool
check('favorite', 'is bool', 
  typeof payload.favorite === 'boolean', 
  payload.favorite);

// Line 250: isOptionalStringMax(data.notes, 500)
check('notes', 'isOptionalStringMax(500)', 
  isOptionalStringMax(payload.notes, 500), 
  payload.notes);

// Line 251: isOptionalListMax(data.tags, 20)
check('tags', 'isOptionalListMax(20)', 
  isOptionalListMax((payload as any).tags, 20), 
  (payload as any).tags);

// Line 252: isNonNegativeNumber(data.playCount)
check('playCount', 'isNonNegativeNumber()', 
  isNonNegativeNumber(payload.playCount), 
  payload.playCount);

// Line 253: lastPlayedAt == null || isTimestampLike
check('lastPlayedAt', 'null or isTimestampLike()', 
  isTimestampLike((payload as any).lastPlayedAt), 
  (payload as any).lastPlayedAt);

// Line 254: firstPlayedAt == null || isTimestampLike
check('firstPlayedAt', 'null or isTimestampLike()', 
  isTimestampLike((payload as any).firstPlayedAt), 
  (payload as any).firstPlayedAt);

// Line 255: data.forTrade is bool
check('forTrade', 'is bool', 
  typeof payload.forTrade === 'boolean', 
  payload.forTrade);

// Line 256: data.forSale is bool
check('forSale', 'is bool', 
  typeof payload.forSale === 'boolean', 
  payload.forSale);

// Line 257: boxSizeClass == null || in [...]
const validSizes = ['S', 'M', 'L', 'XL', 'Tall'];
const boxSizeClass = (payload as any).boxSizeClass;
check('boxSizeClass', `null or in [${validSizes.join(', ')}]`, 
  boxSizeClass === null || boxSizeClass === undefined || validSizes.includes(boxSizeClass), 
  boxSizeClass);

// Line 258-260: box dimensions
check('boxWidthMm', 'isOptionalNonNegativeNumber()', 
  isOptionalNonNegativeNumber((payload as any).boxWidthMm), 
  (payload as any).boxWidthMm);
check('boxHeightMm', 'isOptionalNonNegativeNumber()', 
  isOptionalNonNegativeNumber((payload as any).boxHeightMm), 
  (payload as any).boxHeightMm);
check('boxDepthMm', 'isOptionalNonNegativeNumber()', 
  isOptionalNonNegativeNumber((payload as any).boxDepthMm), 
  (payload as any).boxDepthMm);

// Line 261-262: shelf positions
check('shelfCellIndex', 'null or is int', 
  (payload as any).shelfCellIndex === null || 
  (payload as any).shelfCellIndex === undefined || 
  Number.isInteger((payload as any).shelfCellIndex), 
  (payload as any).shelfCellIndex);
check('cellPosition', 'null or is int', 
  (payload as any).cellPosition === null || 
  (payload as any).cellPosition === undefined || 
  Number.isInteger((payload as any).cellPosition), 
  (payload as any).cellPosition);

// Line 263: condition
const validConditions = ['new', 'likeNew', 'good', 'fair', 'worn'];
const condition = (payload as any).condition;
check('condition', `null or in [${validConditions.join(', ')}]`, 
  condition === null || condition === undefined || validConditions.includes(condition), 
  condition);

// Line 264-265: language and edition
check('language', 'isOptionalStringMax(50)', 
  isOptionalStringMax((payload as any).language, 50), 
  (payload as any).language);
check('edition', 'isOptionalStringMax(100)', 
  isOptionalStringMax((payload as any).edition, 100), 
  (payload as any).edition);

// Line 266: visibilityOverride
const validVisibility = ['public', 'followers', 'private'];
const visibilityOverride = (payload as any).visibilityOverride;
check('visibilityOverride', `null or in [${validVisibility.join(', ')}]`, 
  visibilityOverride === null || visibilityOverride === undefined || validVisibility.includes(visibilityOverride), 
  visibilityOverride);

// Line 267-268: timestamps
check('createdAt', 'isTimestampLike()', 
  isTimestampLike(payload.createdAt), 
  payload.createdAt);
check('updatedAt', 'isTimestampLike()', 
  isTimestampLike(payload.updatedAt), 
  payload.updatedAt);

// Summary
console.log('\n=== Summary ===');
const failedChecks = results.filter(r => !r.passed);
if (failedChecks.length === 0) {
  console.log('✅ All validations passed!');
  console.log('\nIf rules still fail, the issue is likely:');
  console.log('  1. Authentication: request.auth.uid != userId');
  console.log('  2. Parent library doesn\'t exist');
  console.log('  3. Rules not deployed: firebase deploy --only firestore:rules');
} else {
  console.log(`❌ ${failedChecks.length} validation(s) failed:\n`);
  failedChecks.forEach(f => {
    console.log(`  - ${f.field}: ${f.check}`);
    console.log(`    Actual: ${JSON.stringify(f.actual)}`);
    if (f.expected) console.log(`    Expected: ${f.expected}`);
  });
}

console.log('\n=== Additional Debug Info ===');
console.log('All fields in payload:', Object.keys(payload).join(', '));
console.log('Field count:', Object.keys(payload).length);
console.log('\nExpected by rules: libraryId, gameId, gameName, gameThumbnail, gameYear, status,');
console.log('  quantity, myRating, favorite, notes, tags, playCount, lastPlayedAt, firstPlayedAt,');
console.log('  forTrade, forSale, boxSizeClass, boxWidthMm, boxHeightMm, boxDepthMm,');
console.log('  shelfCellIndex, cellPosition, condition, language, edition,');
console.log('  visibilityOverride, createdAt, updatedAt');

process.exit(failedChecks.length > 0 ? 1 : 0);

