import { definePrismaConfig, env } from 'prisma/config';

export default definePrismaConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
  skills: {
    agents: ['claude', 'cursor', 'agents', 'devin'],
  },
});
