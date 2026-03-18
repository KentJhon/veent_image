<script lang="ts">
	interface Props {
		eventId: string;
		onUploadComplete?: () => void;
	}

	interface UploadItem {
		file: File;
		id: string;
		progress: number;
		status: 'pending' | 'uploading' | 'success' | 'duplicate' | 'error';
		error?: string;
		previewUrl?: string;
	}

	let { eventId, onUploadComplete }: Props = $props();

	let items = $state<UploadItem[]>([]);
	let dragOver = $state(false);
	let uploading = $state(false);
	let fileInput: HTMLInputElement;

	function addFiles(files: FileList | File[]) {
		const newItems: UploadItem[] = Array.from(files)
			.filter((f) => f.type.startsWith('image/'))
			.map((file) => ({
				file,
				id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
				progress: 0,
				status: 'pending' as const,
				previewUrl: URL.createObjectURL(file)
			}));

		items = [...items, ...newItems];
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (e.dataTransfer?.files) {
			addFiles(e.dataTransfer.files);
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) {
			addFiles(input.files);
			input.value = '';
		}
	}

	function removeItem(id: string) {
		const item = items.find((i) => i.id === id);
		if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
		items = items.filter((i) => i.id !== id);
	}

	function clearCompleted() {
		items = items.filter((i) => i.status !== 'success' && i.status !== 'duplicate');
	}

	async function uploadAll() {
		uploading = true;
		const pending = items.filter((i) => i.status === 'pending' || i.status === 'error');

		// Upload files sequentially to avoid overwhelming the server
		for (const item of pending) {
			item.status = 'uploading';
			item.progress = 0;

			try {
				const formData = new FormData();
				formData.append('photos', item.file);

				const res = await fetch(`/api/events/${eventId}/upload`, {
					method: 'POST',
					body: formData
				});

				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					item.status = 'error';
					item.error = data.message ?? `Upload failed (${res.status})`;
				} else {
					const data = await res.json();
					if (data.failed > 0 && data.errors?.[0]) {
						item.status = 'error';
						item.error = data.errors[0].message;
					} else if (data.results?.[0]?.status === 'duplicate') {
						item.status = 'duplicate';
						item.progress = 100;
					} else {
						item.status = 'success';
						item.progress = 100;
					}
				}
			} catch {
				item.status = 'error';
				item.error = 'Network error';
			}
		}

		uploading = false;
		onUploadComplete?.();
	}

	let pendingCount = $derived(items.filter((i) => i.status === 'pending' || i.status === 'error').length);
	let successCount = $derived(items.filter((i) => i.status === 'success' || i.status === 'duplicate').length);
	let duplicateCount = $derived(items.filter((i) => i.status === 'duplicate').length);
	let totalSize = $derived(
		items
			.filter((i) => i.status === 'pending' || i.status === 'error')
			.reduce((sum, i) => sum + i.file.size, 0)
	);
</script>

<div
	class="uploader"
	class:drag-over={dragOver}
	ondrop={handleDrop}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	role="region"
	aria-label="Photo upload area"
>
	{#if items.length === 0}
		<div class="drop-zone">
			<div class="drop-icon">+</div>
			<p class="drop-text">Drag and drop photos here</p>
			<p class="drop-sub">or</p>
			<button onclick={() => fileInput?.click()} type="button">
				Select Files
			</button>
			<p class="drop-hint">Supports JPG, PNG, WebP, RAW</p>
		</div>
	{:else}
		<div class="upload-header">
			<div class="upload-stats">
				<span>{items.length} photo{items.length === 1 ? '' : 's'}</span>
				{#if successCount > 0}
					<span class="stat-success">{successCount} uploaded</span>
				{/if}
				{#if duplicateCount > 0}
					<span class="stat-duplicate">{duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'}</span>
				{/if}
				{#if pendingCount > 0}
					<span class="stat-pending">{pendingCount} pending ({(totalSize / 1024 / 1024).toFixed(1)} MB)</span>
				{/if}
			</div>
			<div class="upload-actions">
				<button onclick={() => fileInput?.click()} type="button" class="secondary">
					Add More
				</button>
				{#if successCount > 0}
					<button onclick={clearCompleted} type="button" class="tertiary">
						Clear Done
					</button>
				{/if}
				{#if pendingCount > 0}
					<button onclick={uploadAll} disabled={uploading} type="button">
						{uploading ? 'Uploading...' : `Upload ${pendingCount}`}
					</button>
				{/if}
			</div>
		</div>

		<div class="file-grid">
			{#each items as item (item.id)}
				<div class="file-item" class:success={item.status === 'success'} class:duplicate={item.status === 'duplicate'} class:error={item.status === 'error'}>
					{#if item.previewUrl}
						<img src={item.previewUrl} alt="" class="file-preview" />
					{/if}
					<div class="file-overlay">
						<span class="file-name">{item.file.name}</span>
						<span class="file-size">{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>

						{#if item.status === 'uploading'}
							<div class="progress-bar">
								<div class="progress-fill" style="width: 50%"></div>
							</div>
						{:else if item.status === 'duplicate'}
							<span class="status-badge duplicate-badge">Duplicate</span>
						{:else if item.status === 'success'}
							<span class="status-badge success-badge">Uploaded</span>
						{:else if item.status === 'error'}
							<span class="status-badge error-badge" title={item.error}>Failed</span>
						{/if}

						{#if item.status !== 'uploading'}
							<button
								class="remove-btn"
								onclick={() => removeItem(item.id)}
								type="button"
								aria-label="Remove"
							>
								&times;
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<input
	bind:this={fileInput}
	type="file"
	accept="image/*"
	multiple
	onchange={handleFileSelect}
	hidden
/>

<style>
	.uploader {
		border: 2px dashed #333;
		border-radius: 12px;
		transition: border-color 0.2s, background 0.2s;
		min-height: 200px;
	}

	.uploader.drag-over {
		border-color: #2563eb;
		background: rgba(37, 99, 235, 0.05);
	}

	.drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		text-align: center;
	}

	.drop-icon {
		font-size: 3rem;
		color: #444;
		margin-bottom: 0.5rem;
		line-height: 1;
	}

	.drop-text {
		font-size: 1.1rem;
		color: #888;
		margin-bottom: 0.25rem;
	}

	.drop-sub {
		color: #555;
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
	}

	.drop-hint {
		color: #555;
		font-size: 0.8rem;
		margin-top: 0.75rem;
	}

	.upload-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #222;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.upload-stats {
		display: flex;
		gap: 1rem;
		font-size: 0.85rem;
		color: #888;
	}

	.stat-success {
		color: #22c55e;
	}

	.stat-pending {
		color: #eab308;
	}

	.upload-actions {
		display: flex;
		gap: 0.5rem;
	}

	button {
		background: #2563eb;
		color: #fff;
		border: none;
		padding: 0.5rem 1.2rem;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
	}

	button:hover:not(:disabled) {
		background: #1d4ed8;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	button.secondary {
		background: #333;
	}

	button.secondary:hover {
		background: #444;
	}

	button.tertiary {
		background: transparent;
		border: 1px solid #333;
		color: #aaa;
	}

	.file-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 0.5rem;
		padding: 0.75rem;
	}

	.file-item {
		position: relative;
		aspect-ratio: 1;
		border-radius: 8px;
		overflow: hidden;
		background: #111;
		border: 2px solid transparent;
	}

	.file-item.success {
		border-color: #22c55e;
	}

	.file-item.duplicate {
		border-color: #eab308;
	}

	.file-item.error {
		border-color: #ef4444;
	}

	.file-preview {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.file-overlay {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
		padding: 2rem 0.5rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.file-name {
		font-size: 0.7rem;
		color: #ccc;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-size {
		font-size: 0.65rem;
		color: #888;
	}

	.progress-bar {
		height: 3px;
		background: #333;
		border-radius: 2px;
		overflow: hidden;
		margin-top: 0.25rem;
	}

	.progress-fill {
		height: 100%;
		background: #2563eb;
		border-radius: 2px;
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.status-badge {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		width: fit-content;
		margin-top: 0.15rem;
	}

	.success-badge {
		background: rgba(34, 197, 94, 0.2);
		color: #22c55e;
	}

	.duplicate-badge {
		background: rgba(234, 179, 8, 0.2);
		color: #eab308;
	}

	.stat-duplicate {
		color: #eab308;
	}

	.error-badge {
		background: rgba(239, 68, 68, 0.2);
		color: #ef4444;
	}

	.remove-btn {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.7);
		color: #fff;
		border: none;
		font-size: 16px;
		line-height: 1;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.remove-btn:hover {
		background: rgba(239, 68, 68, 0.8);
	}
</style>
