// Chrome Extension Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('[YT Extractor] Extension installed successfully');
  // Initialize default preferences
  chrome.storage.local.get(['autoExtract', 'preferredLanguage', 'theme'], (res) => {
    chrome.storage.local.set({
      autoExtract: res.autoExtract ?? true,
      preferredLanguage: res.preferredLanguage ?? 'en',
      theme: res.theme ?? 'auto'
    });
  });
});
