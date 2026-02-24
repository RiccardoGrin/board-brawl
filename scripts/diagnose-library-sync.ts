/**
 * Diagnostic script to check library sync prerequisites
 * 
 * This will help identify if:
 * 1. The parent library exists in Firestore
 * 2. The user is authenticated
 * 3. The user ID matches the library path
 * 
 * Add this code to your browser console when you get the permission error
 */

console.log('=== Library Sync Diagnostics ===\n');

// Check 1: Authentication
console.log('1. Checking authentication...');
import { getAuth } from 'firebase/auth';

const auth = getAuth();
const user = auth.currentUser;

if (!user) {
  console.error('❌ NOT AUTHENTICATED - No user signed in');
  console.log('   Solution: Sign in to your account');
} else {
  console.log('✓ User authenticated');
  console.log('  UID:', user.uid);
  console.log('  Email:', user.email);
}

// Check 2: Library path match
if (user) {
  const libraryPath = 'users/t3YwozSkr0XrAE9VUYtb8dLDqai2/libraries/dc2334cd-23f5-4efa-8b30-8db1e68c020b';
  const userIdInPath = 't3YwozSkr0XrAE9VUYtb8dLDqai2';
  
  console.log('\n2. Checking user ID match...');
  if (user.uid === userIdInPath) {
    console.log('✓ User ID matches path');
  } else {
    console.error('❌ USER ID MISMATCH');
    console.log('  Authenticated UID:', user.uid);
    console.log('  UID in path:', userIdInPath);
    console.log('  Solution: This is the problem! The library belongs to a different user.');
  }
}

// Check 3: Library document exists
console.log('\n3. Checking if parent library exists...');
console.log('  (Run this in browser console to check live database)');
console.log('  You can also check manually in Firebase Console:');
console.log('  → Firestore Database');
console.log('  → users/{yourUserId}/libraries/{libraryId}');
console.log('  If the library document doesn\'t exist, items cannot be created.');

// Check 4: Firestore rules deployed
console.log('\n4. Checking Firestore rules...');
console.log('  Run: firebase deploy --only firestore:rules');
console.log('  Then check Firebase Console → Firestore → Rules tab');
console.log('  Ensure the rules match your local firestore.rules file');

console.log('\n=== Next Steps ===');
console.log('Copy/paste this into your browser console:');
console.log(`
// Check library existence
import { doc, getDoc } from 'firebase/firestore';
import { db } from './lib/firebase';

const libraryRef = doc(db, 'users/YOUR_USER_ID/libraries/YOUR_LIBRARY_ID');
const librarySnap = await getDoc(libraryRef);

if (librarySnap.exists()) {
  console.log('✓ Library exists:', librarySnap.data());
} else {
  console.error('❌ Library does NOT exist - this is the problem!');
  console.log('Solution: Create the library first before adding items');
}
`);

