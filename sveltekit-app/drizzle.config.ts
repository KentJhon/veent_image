import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/server/db/schema.ts',
	out: './src/drizzle/migrations',
	dbCredentials: {
		url: process.env.APP_DATABASE_URL!
	}
});
