<script lang="ts">
	interface Props {
		onCapture: (file: File) => void;
		disabled?: boolean;
	}

	let { onCapture, disabled = false }: Props = $props();

	let fileInput: HTMLInputElement;
	let videoRef = $state<HTMLVideoElement | null>(null);
	let stream: MediaStream | null = $state(null);
	let showCamera = $state(false);
	let preview = $state<string | null>(null);
	let validationError = $state('');
	let captured = $state(false);
	let facingMode = $state<'user' | 'environment'>('user');

	async function openCamera() {
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode, width: { ideal: 720 }, height: { ideal: 720 } }
			});
			showCamera = true;
		} catch {
			fileInput?.click();
		}
	}

	async function switchCamera() {
		facingMode = facingMode === 'user' ? 'environment' : 'user';
		stream?.getTracks().forEach((t) => t.stop());
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode, width: { ideal: 720 }, height: { ideal: 720 } }
			});
			if (videoRef) videoRef.srcObject = stream;
		} catch {
			// fallback: switch back if the other camera isn't available
			facingMode = facingMode === 'user' ? 'environment' : 'user';
		}
	}

	function captureFromCamera() {
		if (!videoRef || !stream) return;
		const canvas = document.createElement('canvas');
		canvas.width = videoRef.videoWidth;
		canvas.height = videoRef.videoHeight;
		canvas.getContext('2d')?.drawImage(videoRef, 0, 0);
		canvas.toBlob((blob) => {
			if (blob) {
				processFile(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }));
			}
		}, 'image/jpeg', 0.9);
	}

	function stopCamera() {
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		showCamera = false;
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) processFile(file);
		input.value = '';
	}

	function processFile(file: File) {
		validationError = '';

		// Client-side validation
		if (!file.type.startsWith('image/')) {
			validationError = 'Please select an image file (JPEG, PNG, etc.)';
			return;
		}

		if (file.size > 10 * 1024 * 1024) {
			validationError = 'Image must be under 10MB.';
			return;
		}

		// Check image dimensions via loading it
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			if (img.width < 100 || img.height < 100) {
				validationError = 'Image is too small. Please use a photo at least 100x100 pixels.';
				URL.revokeObjectURL(url);
				return;
			}

			preview = url;
			captured = true;
			stopCamera();
			onCapture(file);
		};
		img.onerror = () => {
			validationError = 'Could not read image. The file may be corrupted.';
			URL.revokeObjectURL(url);
		};
		img.src = url;
	}

	export function reset() {
		if (preview) URL.revokeObjectURL(preview);
		preview = null;
		captured = false;
		validationError = '';
		showCamera = false;
	}

	$effect(() => {
		if (showCamera && videoRef && stream) {
			videoRef.srcObject = stream;
		}
	});
</script>

<div class="selfie-capture">
	{#if captured && preview}
		<div class="preview">
			<img src={preview} alt="Your selfie" />
			<button class="retake-btn" onclick={reset} type="button" {disabled}>
				Retake
			</button>
		</div>
	{:else if showCamera}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={videoRef} autoplay playsinline class="camera-view" class:mirrored={facingMode === 'user'}>
			<track kind="captions" />
		</video>
		<div class="camera-controls">
			<button onclick={switchCamera} class="secondary switch-btn" type="button" title="Switch camera">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M20 16v4H4v-4"/><path d="M4 8V4h16v4"/>
					<polyline points="7 20 4 16 7 12"/><polyline points="17 4 20 8 17 12"/>
				</svg>
			</button>
			<button onclick={captureFromCamera} {disabled} type="button">Capture</button>
			<button onclick={stopCamera} class="secondary" type="button">Cancel</button>
		</div>
	{:else}
		<div class="capture-area">
			<div class="selfie-icon">
				<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<circle cx="12" cy="8" r="4"/>
					<path d="M20 21a8 8 0 1 0-16 0"/>
					<path d="M3 3l18 18" stroke-opacity="0"/>
				</svg>
			</div>
			<div class="capture-options">
				<button onclick={openCamera} {disabled} type="button">
					Take a Selfie
				</button>
				<span class="or">or</span>
				<button onclick={() => fileInput?.click()} class="secondary" {disabled} type="button">
					Upload Photo
				</button>
			</div>
			<div class="tips">
				<p>For best results:</p>
				<ul>
					<li>Use a clear, well-lit photo</li>
					<li>Face the camera directly</li>
					<li>Remove sunglasses or masks</li>
				</ul>
			</div>
		</div>
	{/if}

	{#if validationError}
		<p class="validation-error">{validationError}</p>
	{/if}
</div>

<input
	bind:this={fileInput}
	type="file"
	accept="image/jpeg,image/png,image/webp,image/heic"
	onchange={handleFileSelect}
	hidden
/>

<style>
	.selfie-capture {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.preview {
		position: relative;
		display: inline-block;
	}

	.preview img {
		max-width: 300px;
		max-height: 300px;
		border-radius: 12px;
		border: 2px solid #333;
		object-fit: cover;
	}

	.retake-btn {
		position: absolute;
		bottom: 8px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.7);
		color: #fff;
		border: 1px solid #555;
		padding: 0.35rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.retake-btn:hover {
		background: rgba(0, 0, 0, 0.9);
	}

	.camera-view {
		max-width: 400px;
		width: 100%;
		border-radius: 12px;
		background: #111;
	}

	.camera-view.mirrored {
		transform: scaleX(-1);
	}

	.camera-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.switch-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.7rem;
	}

	.capture-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.selfie-icon {
		color: #444;
	}

	.capture-options {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.or {
		color: #555;
		font-size: 0.85rem;
	}

	.tips {
		background: #151515;
		border: 1px solid #222;
		border-radius: 10px;
		padding: 1rem 1.25rem;
		font-size: 0.8rem;
		max-width: 320px;
	}

	.tips p {
		color: #888;
		margin-bottom: 0.4rem;
		font-weight: 600;
	}

	.tips ul {
		margin: 0;
		padding-left: 1.2rem;
		color: #666;
	}

	.tips li {
		margin-bottom: 0.15rem;
	}

	button {
		background: #2563eb;
		color: #fff;
		border: none;
		padding: 0.7rem 1.5rem;
		border-radius: 8px;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 600;
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

	button.secondary:hover:not(:disabled) {
		background: #444;
	}

	.validation-error {
		color: #ef4444;
		font-size: 0.85rem;
		margin-top: 0.25rem;
	}
</style>
