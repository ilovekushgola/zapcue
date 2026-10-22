// Extension Popup Controller
import { getSettings, saveSettings } from '../utils/settings';

document.addEventListener('DOMContentLoaded', async () => {
  const autoExtractToggle = document.getElementById('auto-extract-toggle') as HTMLInputElement | null;
  const langSelect = document.getElementById('lang-select') as HTMLSelectElement | null;
  const openOptionsBtn = document.getElementById('open-options-btn');

  // Load current settings via unified source of truth
  const settings = await getSettings();
  if (autoExtractToggle) {
    autoExtractToggle.checked = settings.autoExtract;
  }
  if (langSelect) {
    langSelect.value = settings.preferredLanguage;
  }

  // Auto extract quick toggle
  autoExtractToggle?.addEventListener('change', async () => {
    await saveSettings({ autoExtract: autoExtractToggle.checked });
  });

  // Preferred language quick toggle
  langSelect?.addEventListener('change', async () => {
    await saveSettings({ preferredLanguage: langSelect.value });
  });

  // Open Full Settings Page
  openOptionsBtn?.addEventListener('click', () => {
    if (chrome?.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });
});
