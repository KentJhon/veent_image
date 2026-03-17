import { SvelteKitAuth } from '@auth/sveltekit';
import Credentials from '@auth/sveltekit/providers/credentials';
import Google from '@auth/sveltekit/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '$lib/server/db/index.js';
import { users, accounts, sessions, verificationTokens } from '$lib/server/db/schema.js';
import { AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } from '$lib/server/env.js';

const hasGoogleCredentials = AUTH_GOOGLE_ID && AUTH_GOOGLE_ID !== 'placeholder';

const providers = [];

if (hasGoogleCredentials) {
	providers.push(
		Google({
			clientId: AUTH_GOOGLE_ID,
			clientSecret: AUTH_GOOGLE_SECRET
		})
	);
}

// Dev-only credentials provider for testing without OAuth
providers.push(
	Credentials({
		name: 'Dev Login',
		credentials: {
			email: { label: 'Email', type: 'email', placeholder: 'dev@example.com' }
		},
		async authorize(credentials) {
			const email = credentials?.email as string;
			if (!email) return null;

			// Upsert a dev user
			const existing = await db.query.users.findFirst({
				where: (u, { eq }) => eq(u.email, email)
			});

			if (existing) {
				return { id: existing.id, email: existing.email, name: existing.name };
			}

			const id = crypto.randomUUID();
			const name = email.split('@')[0];
			await db.insert(users).values({ id, email, name });
			return { id, email, name };
		}
	})
);

export const { handle, signIn, signOut } = SvelteKitAuth({
	adapter: DrizzleAdapter(db, {
		usersTable: users,
		accountsTable: accounts,
		sessionsTable: sessions,
		verificationTokensTable: verificationTokens
	}),
	providers,
	secret: AUTH_SECRET,
	trustHost: true,
	session: { strategy: 'jwt' },
	callbacks: {
		jwt({ token, user }) {
			if (user) {
				token.id = user.id;
			}
			return token;
		},
		session({ session, token }) {
			if (session.user && token.id) {
				session.user.id = token.id as string;
			}
			return session;
		}
	}
});
