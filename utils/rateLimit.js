function checkRateLimit(userId, commandName) {
  const key = `${userId}:${commandName}`;
  const now = Date.now();
  const lastExecution = global.rateLimits.get(key) || 0;
  const cooldown = 1000; // 1-second cooldown
  if (now - lastExecution < cooldown) {
    return false;
  }
  global.rateLimits.set(key, now);
  return true;
}

module.exports = { checkRateLimit };