/**
 * Checks if a street-address string likely contains a house number or complement.
 * @param {string} streetAddressString The address string to check.
 * @returns {boolean} True if a number or complement keyword is found, false otherwise.
 */
function hasNumberInAddress(streetAddressString) {
  if (!streetAddressString) return false;
    const regex = /(\d|apt|apto|apartamento|bloco|nº|casa)/i;
  return regex.test(streetAddressString);
}

module.exports = {
  hasNumberInAddress
};