// Extension Popup Controller
document.addEventListener('DOMContentLoaded', () => {
  const autoExtractToggle = document.getElementById('auto-extract-toggle') as HTMLInputElement | null;
  const langSelect = document.getElementById('lang-select') as HTMLSelectElement | null;

  if (chrome?.storage?.local) {
    chrome.storage.local.get(['autoExtract', 'preferredLanguage'], (res) => {
      if (autoExtractToggle && res.autoExtract !== undefined) {
        autoExtractToggle.checked = Boolean(res.autoExtract);
      }
      if (langSelect && res.preferredLanguage) {
        langSelect.value = res.preferredLanguage;
      }
    });

    autoExtractToggle?.addEventListener('change', () => {
      chrome.storage.local.set({ autoExtract: autoExtractToggle.checked });
    });

    langSelect?.addEventListener('change', () => {
      chrome.storage.local.set({ preferredLanguage: langSelect.value });
    });
  }
});
