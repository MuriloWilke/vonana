/**
 * Maps numeric payment codes to human‑readable method.
 */
function interpretFinalMethod(methodValue) {
  const paymentMethods = {
    1: 'Pix',
    2: 'Crédito',
    3: 'Débito',
    4: 'Dinheiro'
  };

  const method = paymentMethods[methodValue];
  if (!method) {
    return methodValue;
  }

  return method;
}

module.exports = {
  interpretFinalMethod
};