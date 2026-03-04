'use strict'

const { toZonedTime, fromZonedTime } = require('date-fns-tz');

const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Calculates the date of the next occurrence of a delivery day.
 * 
 * @param {number} targetDayIndex - Desired delivery weekday (0=Sunday, 1=Monday, ..., 6=Saturday).
 * @param {number} currentDayIndex - Current weekday index (Date.getDay()).
 * @returns {Date} - The calculated next delivery date.
 */
function calculateNextDeliveryDay(targetDayIndex, currentDayIndex) {
  const todayInBrazil = toZonedTime(new Date(), BRAZIL_TIME_ZONE); // Always using Brazil's timezone for consistency
  todayInBrazil.setHours(0, 0, 0, 0); // Normalize to midnight

  let daysUntilNext = targetDayIndex - currentDayIndex;

  // If target day has passed for this week, schedule for next week
  if (daysUntilNext <= 0) {
    daysUntilNext += 7;
  }

  const nextDeliveryDateInBrazil = new Date(todayInBrazil);
  nextDeliveryDateInBrazil.setDate(todayInBrazil.getDate() + daysUntilNext);

   return fromZonedTime(nextDeliveryDateInBrazil, BRAZIL_TIME_ZONE);
}

/**
 * Validates the user's preferred delivery day value and calculates the corresponding delivery date.
 * 
 * @param {object} agent - Dialogflow agent object for adding error responses if needed.
 * @param {number} dayValue - The delivery day code provided by the user (e.g., 1 for Monday, 2 for Thursday).
 * @returns {Date} - The next valid delivery date.
 */
function validateDeliveryDayValue(agent, dayValue) {
  // Map user-provided option numbers to real weekday indices
  const validDaysMap = {
    1: 1,  // Monday
    2: 4,  // Thursday
  };

  const validDayNumbers = Object.keys(validDaysMap).map(Number);

  if (typeof dayValue !== 'number' || !validDayNumbers.includes(dayValue)) {
    console.warn(`Validation failed: Invalid preferred delivery day received: ${dayValue}`);
    throw new Error(`Invalid preferred delivery day value: ${dayValue}`);
  }

  const targetDayIndex = validDaysMap[dayValue];
  const today = toZonedTime(new Date(), BRAZIL_TIME_ZONE);
  const currentDayIndex = today.getDay();

  return calculateNextDeliveryDay(targetDayIndex, currentDayIndex);
}

module.exports = {
  calculateNextDeliveryDay,
  validateDeliveryDayValue
};