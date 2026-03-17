<script lang="ts">
	interface Stats {
		timestamp: string;
		app: {
			events: number;
			eventsWithAlbum: number;
			users: number;
			photographers: number;
			completedPurchases: number;
			pendingPurchases: number;
			faceMatchSessions: number;
			revenueCents: number;
		};
		immich: {
			status: string;
			version: string;
			assets: number;
			albums: number;
			people: number;
			latencyMs: number;
		};
		ml: {
			status: string;
			latencyMs: number;
		};
		watermarkCache: {
			files: number;
			sizeMb: number;
		};
	}

	interface LogEntry {
		timestamp: string;
		message: string;
	}

	let stats = $state<Stats | null>(null);
	let logs = $state<LogEntry[]>([]);
	let selectedService = $state('immich-server');
	let loading = $state(true);
	let logsLoading = $state(false);
	let autoRefresh = $state(true);
	let refreshInterval: ReturnType<typeof setInterval> | null = null;

	async function fetchStats() {
		try {
			const res = await fetch('/api/admin/stats');
			if (res.ok) stats = await res.json();
		} catch { /* ignore */ }
		loading = false;
	}

	async function fetchLogs() {
		logsLoading = true;
		try {
			const res = await fetch(`/api/admin/logs?service=${selectedService}&lines=100`);
			if (res.ok) {
				const data = await res.json();
				logs = data.logs ?? [];
			}
		} catch { /* ignore */ }
		logsLoading = false;
	}

	async function clearCache() {
		await fetch('/api/admin/watermark-cache', { method: 'DELETE' });
		fetchStats();
	}

	function startAutoRefresh() {
		if (refreshInterval) clearInterval(refreshInterval);
		refreshInterval = setInterval(fetchStats, 10000);
	}

	function stopAutoRefresh() {
		if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	}

	$effect(() => {
		fetchStats();
		fetchLogs();
		if (autoRefresh) startAutoRefresh();
		return () => stopAutoRefresh();
	});

	$effect(() => {
		// Re-fetch logs when service changes
		if (selectedService) fetchLogs();
	});

	$effect(() => {
		if (autoRefresh) startAutoRefresh();
		else stopAutoRefresh();
	});

	function statusColor(s: string): string {
		if (s === 'healthy') return '#22c55e';
		if (s === 'degraded') return '#eab308';
		return '#ef4444';
	}
</script>

<div class="page-header">
	<h1>Admin Dashboard</h1>
	<div class="header-actions">
		<label class="auto-refresh">
			<input type="checkbox" bind:checked={autoRefresh} />
			Auto-refresh (10s)
		</label>
		<button onclick={fetchStats} class="refresh-btn">Refresh Now</button>
	</div>
</div>

{#if loading}
	<p class="loading">Loading dashboard...</p>
{:else if stats}
	<!-- Service Health -->
	<section class="section">
		<h2>Service Health</h2>
		<div class="health-grid">
			<div class="health-card">
				<div class="health-indicator" style="background: {statusColor(stats.immich.status)}"></div>
				<div class="health-info">
					<h3>Immich Server</h3>
					<span class="health-status">{stats.immich.status}</span>
					{#if stats.immich.version}
						<span class="health-detail">v{stats.immich.version}</span>
					{/if}
					<span class="health-detail">{stats.immich.latencyMs}ms</span>
				</div>
			</div>
			<div class="health-card">
				<div class="health-indicator" style="background: {statusColor(stats.ml.status)}"></div>
				<div class="health-info">
					<h3>ML Service</h3>
					<span class="health-status">{stats.ml.status}</span>
					<span class="health-detail">{stats.ml.latencyMs}ms</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Stats Grid -->
	<section class="section">
		<h2>Application Metrics</h2>
		<div class="stats-grid">
			<div class="stat-card">
				<div class="stat-value">{stats.app.events}</div>
				<div class="stat-label">Events</div>
				<div class="stat-sub">{stats.app.eventsWithAlbum} with albums</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{stats.app.users}</div>
				<div class="stat-label">Users</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{stats.app.photographers}</div>
				<div class="stat-label">Photographers</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{stats.app.faceMatchSessions}</div>
				<div class="stat-label">Face Matches</div>
			</div>
			<div class="stat-card highlight">
				<div class="stat-value">${(stats.app.revenueCents / 100).toFixed(2)}</div>
				<div class="stat-label">Revenue</div>
				<div class="stat-sub">{stats.app.completedPurchases} completed, {stats.app.pendingPurchases} pending</div>
			</div>
		</div>
	</section>

	<!-- Immich Stats -->
	<section class="section">
		<h2>Immich Storage</h2>
		<div class="stats-grid">
			<div class="stat-card">
				<div class="stat-value">{stats.immich.assets}</div>
				<div class="stat-label">Assets</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{stats.immich.albums}</div>
				<div class="stat-label">Albums</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{stats.immich.people}</div>
				<div class="stat-label">People Detected</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{stats.watermarkCache.files}</div>
				<div class="stat-label">Cached Watermarks</div>
				<div class="stat-sub">
					{stats.watermarkCache.sizeMb} MB
					<button class="clear-cache-btn" onclick={clearCache}>Clear</button>
				</div>
			</div>
		</div>
	</section>

	<!-- Logs -->
	<section class="section">
		<div class="logs-header">
			<h2>Service Logs</h2>
			<div class="logs-controls">
				<select bind:value={selectedService} class="service-select">
					<option value="immich-server">Immich Server</option>
					<option value="immich-ml">ML Service</option>
					<option value="immich-db">Database</option>
					<option value="immich-redis">Redis</option>
				</select>
				<button onclick={fetchLogs} class="refresh-btn" disabled={logsLoading}>
					{logsLoading ? 'Loading...' : 'Refresh'}
				</button>
			</div>
		</div>
		<div class="log-viewer">
			{#if logs.length === 0}
				<p class="log-empty">No logs available</p>
			{:else}
				{#each logs as entry}
					<div class="log-line">
						{#if entry.timestamp}
							<span class="log-ts">{new Date(entry.timestamp).toLocaleTimeString()}</span>
						{/if}
						<span class="log-msg" class:error={entry.message.toLowerCase().includes('error')} class:warn={entry.message.toLowerCase().includes('warn')}>{entry.message}</span>
					</div>
				{/each}
			{/if}
		</div>
	</section>

	<p class="last-updated">Last updated: {new Date(stats.timestamp).toLocaleTimeString()}</p>
{/if}

<style>
	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	h1 { font-size: 1.8rem; }

	.header-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.auto-refresh {
		color: #888;
		font-size: 0.8rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
	}

	.refresh-btn {
		background: #333;
		color: #fff;
		border: none;
		padding: 0.4rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.refresh-btn:hover { background: #444; }

	.section {
		background: #151515;
		border: 1px solid #222;
		border-radius: 12px;
		padding: 1.25rem;
		margin-bottom: 1.25rem;
	}

	h2 {
		font-size: 1rem;
		color: #aaa;
		margin-bottom: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	/* Health cards */
	.health-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 0.75rem;
	}

	.health-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: #0a0a0a;
		padding: 1rem;
		border-radius: 8px;
		border: 1px solid #1a1a1a;
	}

	.health-indicator {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.health-info h3 {
		font-size: 0.9rem;
		color: #fff;
		margin-bottom: 0.15rem;
	}

	.health-status {
		font-size: 0.75rem;
		color: #888;
		text-transform: capitalize;
	}

	.health-detail {
		font-size: 0.7rem;
		color: #555;
		margin-left: 0.5rem;
	}

	/* Stats grid */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 0.75rem;
	}

	.stat-card {
		background: #0a0a0a;
		padding: 1rem;
		border-radius: 8px;
		border: 1px solid #1a1a1a;
	}

	.stat-card.highlight {
		border-color: #22c55e33;
		background: #0a120a;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #fff;
		margin-bottom: 0.15rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.stat-sub {
		font-size: 0.7rem;
		color: #555;
		margin-top: 0.25rem;
	}

	.clear-cache-btn {
		background: #333;
		color: #aaa;
		border: none;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.65rem;
		margin-left: 0.4rem;
	}

	/* Logs */
	.logs-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.logs-header h2 { margin-bottom: 0; }

	.logs-controls {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.service-select {
		background: #0a0a0a;
		color: #ddd;
		border: 1px solid #333;
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
		font-size: 0.8rem;
	}

	.log-viewer {
		background: #050505;
		border: 1px solid #1a1a1a;
		border-radius: 8px;
		padding: 0.75rem;
		max-height: 400px;
		overflow-y: auto;
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
		font-size: 0.72rem;
		line-height: 1.5;
	}

	.log-line {
		display: flex;
		gap: 0.5rem;
		padding: 0.1rem 0;
		border-bottom: 1px solid #0a0a0a;
	}

	.log-ts {
		color: #555;
		flex-shrink: 0;
		min-width: 75px;
	}

	.log-msg {
		color: #aaa;
		word-break: break-all;
	}

	.log-msg.error { color: #ef4444; }
	.log-msg.warn { color: #eab308; }

	.log-empty {
		color: #555;
		text-align: center;
		padding: 2rem;
		font-family: inherit;
	}

	.last-updated {
		text-align: center;
		color: #444;
		font-size: 0.75rem;
		margin-top: 0.5rem;
	}

	.loading {
		color: #888;
		text-align: center;
		padding: 4rem 0;
	}
</style>
