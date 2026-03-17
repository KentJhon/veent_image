import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { APP_DATABASE_URL } from '../env.js';

const client = postgres(APP_DATABASE_URL);
export const db = drizzle(client, { schema });
