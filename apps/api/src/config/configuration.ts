export default () => {
  const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${missing.join(', ')}. Ver .env.example.`,
    );
  }

  return {
    port: Number(process.env.API_PORT || 4000),
    databaseUrl: process.env.DATABASE_URL as string,
    redisUrl: process.env.REDIS_URL as string,
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET as string,
      refreshSecret: process.env.JWT_REFRESH_SECRET as string,
      accessTtl: process.env.JWT_ACCESS_TTL || '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
    },
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
    webUrl: process.env.WEB_URL || 'http://localhost:3000',
    demo: {
      welcomeCredits: Number(process.env.DEMO_WELCOME_CREDITS || 1000),
      dailyDepositLimit: Number(process.env.DEMO_DAILY_DEPOSIT_LIMIT || 10000),
      maxStake: Number(process.env.DEMO_MAX_STAKE || 1000),
    },
    game: {
      moveTimeoutSeconds: Number(process.env.MOVE_TIMEOUT_SECONDS || 60),
      challengeTtlHours: Number(process.env.CHALLENGE_TTL_HOURS || 24),
    },
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'no-reply@elreto.local',
    },
  };
};
