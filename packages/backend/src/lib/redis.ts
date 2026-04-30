import { Redis } from 'ioredis';

let redis: Redis | null = null;

export function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  return redis;
}

export async function closeRedis() {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
