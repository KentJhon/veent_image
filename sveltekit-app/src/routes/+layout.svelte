<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { signIn, signOut } from '@auth/sveltekit/client';

	let { data, children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>EventSnap - Find Your Event Photos</title>
</svelte:head>

<div class="app">
	<header>
		<nav>
			<a href="/" class="logo">EventSnap</a>
			<div class="nav-links">
				<a href="/events">Events</a>
				{#if data.session?.user}
					<a href="/purchases">My Purchases</a>
					<a href="/admin" class="admin-link">Admin</a>
					<span class="user-name">{data.session.user.name}</span>
					<button onclick={() => signOut()}>Sign out</button>
				{:else}
					<button onclick={() => signIn('credentials', { email: 'dev@example.com', redirectTo: '/' })}>Dev Sign in</button>
				{/if}
			</div>
		</nav>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<p>EventSnap &mdash; Find yourself in every moment</p>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #0a0a0a;
		color: #e0e0e0;
	}

	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	header {
		background: #111;
		border-bottom: 1px solid #222;
		padding: 0 2rem;
	}

	nav {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		justify-content: space-between;
		align-items: center;
		height: 64px;
	}

	.logo {
		font-size: 1.5rem;
		font-weight: 700;
		color: #fff;
		text-decoration: none;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.nav-links a {
		color: #aaa;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.admin-link {
		color: #666 !important;
		font-size: 0.8rem !important;
	}

	.nav-links a:hover {
		color: #fff;
	}

	.user-name {
		color: #888;
		font-size: 0.85rem;
	}

	button {
		background: #2563eb;
		color: #fff;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
	}

	button:hover {
		background: #1d4ed8;
	}

	main {
		flex: 1;
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
		width: 100%;
		box-sizing: border-box;
	}

	footer {
		text-align: center;
		padding: 2rem;
		color: #555;
		font-size: 0.8rem;
		border-top: 1px solid #222;
	}
</style>
