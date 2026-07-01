import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { AppConfigService } from '../common/app-config.service';

export function createRedisClient(config: AppConfigService): Redis {
  const options: RedisOptions = {
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
  };

  return new Redis(options);
}
