'use strict';

/**
 * Fetches your site-wide order pricing rules from Firestore.
 * @param {Firestore} db  Initialized Firestore instance
 * @returns {Promise<{
 *   extraValue: number,
 *   jumboValue: number,
 *   freeShipping: number,
 *   shippingValue: number
 * }|null>}
 */
async function getOrderConfiguration(db) {
  const docRef = db.collection('configurations').doc('1');
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    console.error("Configuration document '1' not found.");
    return null;
  }

  const { jumboValue, extraValue, freeShipping, shippingValue } = snapshot.data();
  if ([jumboValue, extraValue, freeShipping, shippingValue]
      .some(v => v === undefined)) {
    console.error("Missing fields in config:", snapshot.data());
    return null;
  }

  return { extraValue, jumboValue, freeShipping, shippingValue };
}

module.exports = { getOrderConfiguration };