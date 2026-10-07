function createOriginPolicy(config) {
  return (request) => {
    const origin = request.headers.origin;
    if (origin === undefined) return true;
    if (typeof origin !== 'string' || origin.length > 256) return false;
    let parsed;
    try { parsed = new URL(origin); } catch { return false; }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
    if (config.frontendOrigins.has(origin)) return true;
    let protocol = request.socket.encrypted ? 'https' : 'http';
    if (config.trustProxy && request.headers['x-forwarded-proto']) {
      const forwarded = request.headers['x-forwarded-proto'];
      if (!['http', 'https'].includes(forwarded)) return false;
      protocol = forwarded;
    }
    try {
      return new URL(`${protocol}://${request.headers.host}`).origin === origin;
    } catch {
      return false;
    }
  };
}

module.exports = { createOriginPolicy };
