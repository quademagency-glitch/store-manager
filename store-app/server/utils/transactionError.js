// PL/pgSQL business rejections are safe, deliberate messages. Infrastructure
// failures stay generic so database details never reach the cashier.
function transactionError(res, error, fallback, recordedOperation = false) {
  const status = { P0001: 400, P0002: 404, P0003: 409, '23514': 400, PGRST202: 503 }[error?.code] || 500;
  const message = status < 500 ? error.message : status === 503
    ? 'Checkout is being updated. Please retry shortly.' : fallback;
  return res.status(status).json({ error: message, ...(recordedOperation && ['P0001','P0002','P0003','23514'].includes(error?.code) && !/Reference already used/.test(message) ? {requestRejected:true} : {}) });
}
module.exports = { transactionError };
