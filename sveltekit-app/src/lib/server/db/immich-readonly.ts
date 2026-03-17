import pg from 'pg';
import { IMMICH_DB_URL } from '../env.js';

const { Pool } = pg;

export const immichPool = new Pool({
	connectionString: IMMICH_DB_URL,
	max: 5,
	idleTimeoutMillis: 30000
});
