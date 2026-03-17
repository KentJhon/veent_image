import {
	pgTable,
	uuid,
	varchar,
	text,
	timestamp,
	integer
} from 'drizzle-orm/pg-core';

// ── Auth.js tables ──────────────────────────────────
// These are required by @auth/drizzle-adapter

export const users = pgTable('users', {
	id: text('id').primaryKey(),
	name: text('name'),
	email: text('email').notNull().unique(),
	emailVerified: timestamp('email_verified', { mode: 'date' }),
	image: text('image'),
	role: varchar('role', { length: 50 }).default('user') // user | photographer | admin
});

export const accounts = pgTable('accounts', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	type: text('type').notNull(),
	provider: text('provider').notNull(),
	providerAccountId: text('provider_account_id').notNull(),
	refresh_token: text('refresh_token'),
	access_token: text('access_token'),
	expires_at: integer('expires_at'),
	token_type: text('token_type'),
	scope: text('scope'),
	id_token: text('id_token'),
	session_state: text('session_state')
});

export const sessions = pgTable('sessions', {
	sessionToken: text('session_token').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expires: timestamp('expires', { mode: 'date' }).notNull()
});

export const verificationTokens = pgTable('verification_tokens', {
	identifier: text('identifier').notNull(),
	token: text('token').notNull().unique(),
	expires: timestamp('expires', { mode: 'date' }).notNull()
});

// ── Core event tables ───────────────────────────────

export const events = pgTable('events', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 255 }).notNull(),
	description: text('description'),
	date: timestamp('date', { mode: 'date' }).notNull(),
	venue: varchar('venue', { length: 255 }),
	coverImageUrl: text('cover_image_url'),
	pricingPerPhoto: integer('pricing_per_photo_cents').default(500),
	pricingBundle: integer('pricing_bundle_cents').default(2000),
	createdBy: text('created_by').references(() => users.id),
	createdAt: timestamp('created_at', { mode: 'date' }).defaultNow()
});

export const eventAlbums = pgTable('event_albums', {
	id: uuid('id').primaryKey().defaultRandom(),
	eventId: uuid('event_id')
		.notNull()
		.references(() => events.id, { onDelete: 'cascade' }),
	immichAlbumId: uuid('immich_album_id').notNull(),
	createdAt: timestamp('created_at', { mode: 'date' }).defaultNow()
});

export const photographerAssignments = pgTable('photographer_assignments', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	eventId: uuid('event_id')
		.notNull()
		.references(() => events.id, { onDelete: 'cascade' }),
	role: varchar('role', { length: 50 }).default('photographer')
});

// ── Face matching sessions ──────────────────────────

export const faceMatchSessions = pgTable('face_match_sessions', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id').references(() => users.id),
	eventId: uuid('event_id')
		.notNull()
		.references(() => events.id, { onDelete: 'cascade' }),
	matchedAssetIds: text('matched_asset_ids').array(),
	matchedPersonIds: text('matched_person_ids').array(),
	createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
	expiresAt: timestamp('expires_at', { mode: 'date' })
});

// ── Commerce ────────────────────────────────────────

export const purchases = pgTable('purchases', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	eventId: uuid('event_id')
		.notNull()
		.references(() => events.id),
	assetId: uuid('asset_id').notNull(),
	amountCents: integer('amount_cents').notNull(),
	currency: varchar('currency', { length: 3 }).default('USD'),
	paymentProvider: varchar('payment_provider', { length: 50 }),
	paymentIntentId: varchar('payment_intent_id', { length: 255 }),
	status: varchar('status', { length: 20 }).default('pending'),
	createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
	completedAt: timestamp('completed_at', { mode: 'date' })
});

export const purchaseBundles = pgTable('purchase_bundles', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	eventId: uuid('event_id')
		.notNull()
		.references(() => events.id),
	personId: uuid('person_id'),
	assetIds: text('asset_ids').array().notNull(),
	amountCents: integer('amount_cents').notNull(),
	status: varchar('status', { length: 20 }).default('pending'),
	createdAt: timestamp('created_at', { mode: 'date' }).defaultNow()
});
