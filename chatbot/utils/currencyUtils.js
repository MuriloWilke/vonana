/**
 * Formats an integer number of centavos into a Brazilian
 * real currency string, e.g. 12345 → "R$ 123,45".
 *
 * @param {number} cents  Amount in centavos (e.g. 12345 for R$123,45).
 * @returns {string}      Localized currency string.
 */
function formatCurrency(cents) {
  // Create a NumberFormat for Brazilian real,
  // with exactly two decimal places.
  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

  // Divide by 100 to convert centavos to reais,
  // then format with the Intl API.
  return formatter.format(cents / 100);
}

module.exports = {
  formatCurrency
};