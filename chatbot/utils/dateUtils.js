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
    
    else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
      
      if (isNaN(date.getTime())) {
         console.warn('Invalid date string provided:', timestamp);
         return 'Data desconhecida';
      }
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
      timeZone: 'America/Sao_Paulo'
    };

    // Format the date according to 'pt-BR' locale
    return date.toLocaleString('pt-BR', options);

  } catch (error) {
    // Catch any unexpected errors during formatting
    console.error('Error formatting date:', error);
    return 'Erro na data';
  }
}

module.exports = {
  formatOrderDate
};