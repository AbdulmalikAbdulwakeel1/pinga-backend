// Redis config - used by BullMQ for job queues
// BullMQ connects to Redis directly via REDIS_URL

const redisConfig = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }
};

module.exports = { redisConfig };
