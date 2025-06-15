/**
 * Given a Firestore Timestamp object, returns a formatted string
 * in Brazilian Portuguese locale, e.g. "31/12/2024".
 *
 * @param {object} timestamp  Firestore Timestamp, with a toDate() method or a Date instance.
 * @returns {string}          Formatted date/time or a fallback message.
 */
function formatOrderDate(timestamp) {
  // Validate that we received a proper Firestore Timestamp
  if (!timestamp ) {
    console.warn('Invalid timestamp provided for formatting:', timestamp);
    return 'Data desconhecida';
  }

  try {

    let date;
    if (typeof timestamp.toDate === 'function') {
      // Convert Firestore Timestamp to a native JavaScript Date
      date = timestamp.toDate();
    } 
    
    else if (timestamp instanceof Date) {
      date = timestamp;
    } 
    
    else {
      console.warn('Invalid date object:', timestamp);
      return 'Data desconhecida';
    }

    // Options object for toLocaleString:
    // - day/month/year with 2 digits each
    const options = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };

    // Format the date according to 'pt-BR' locale
    return date.toLocaleString('pt-BR', options);

  } catch (error) {
    // Catch any unexpected errors during formatting
    console.error('Error formatting date:', error);
    return 'Erro na data';
  }
}

/**
 * Returns today's date based on Brazil's timezone (UTC-3).
 * 
 * This function calculates the current date adjusted to Brazil's standard timezone,
 * ignoring daylight saving time. The returned Date object represents midnight (00:00:00)
 * of the current day in Brazil.
 * 
 * @returns {Date} - The current date in Brazil, with time set to 00:00:00.
 */
function getBrazilToday() {
  const now = new Date();

  // Brazil standard timezone offset (UTC-3) in minutes
  const utc3Offset = -3 * 60;

  // Calculate the local Brazil time considering the user's current timezone offset
  const localDate = new Date(now.getTime() + (utc3Offset - now.getTimezoneOffset()) * 60 * 1000);

  // Set hours to midnight to normalize the date
  localDate.setHours(0, 0, 0, 0);

  return localDate;
}

module.exports = {
  formatOrderDate,
  getBrazilToday
};