// Shadow DOM Host Manager
// Injects the extension directly into YouTube's right-hand sidebar (#secondary-inner)

const HOST_ID = 'yt-meta-extractor-root';

/**
 * Finds YouTube's right sidebar column (#secondary-inner or #secondary)
 */
function findYouTubeSecondaryColumn(): HTMLElement | null {
  return (
    document.querySelector('#secondary-inner') as HTMLElement ||
    document.querySelector('#secondary') as HTMLElement ||
    document.querySelector('ytd-watch-next-secondary-results-renderer') as HTMLElement ||
    null
  );
}

/**
 * Returns or creates the Shadow Root embedded at the top of YouTube's right sidebar.
 */
export function getOrCreateShadowRoot(): ShadowRoot {
  let host = document.getElementById(HOST_ID);

  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.display = 'block';
    host.style.width = '100%';
    host.style.marginBottom = '16px';
    host.style.position = 'relative';
    host.style.zIndex = '10';
  }

  // Ensure host is placed at the very top of #secondary-inner
  const targetParent = findYouTubeSecondaryColumn();
  if (targetParent) {
    if (host.parentElement !== targetParent || targetParent.firstChild !== host) {
      targetParent.prepend(host);
    }
  } else if (!host.parentElement) {
    // Temporary fallback if secondary column is still hydrating
    document.body.appendChild(host);
  }

  if (host.shadowRoot) {
    return host.shadowRoot;
  }

  return host.attachShadow({ mode: 'open' });
}

/**
 * Re-anchors host to top of #secondary-inner if YouTube's SPA navigation detached or moved it.
 */
export function ensureHostPosition(): void {
  const host = document.getElementById(HOST_ID);
  if (!host) return;

  const targetParent = findYouTubeSecondaryColumn();
  if (targetParent && (host.parentElement !== targetParent || targetParent.firstChild !== host)) {
    targetParent.prepend(host);
  }
}
