import { getSettings, resetSettings, saveSettings } from '../utils/settings';

document.addEventListener('DOMContentLoaded', async () => {
  const savePill = document.getElementById('save-pill');
  let saveTimer: any = null;

  function flashSaveNotice() {
    if (savePill) {
      savePill.classList.add('visible');
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        savePill.classList.remove('visible');
      }, 1600);
    }
  }

  // Input references
  const autoExtract = document.getElementById('opt-auto-extract') as HTMLInputElement;
  const prefLang = document.getElementById('opt-pref-lang') as HTMLSelectElement;
  const theme = document.getElementById('opt-theme') as HTMLSelectElement;

  const thumbPreview = document.getElementById('opt-thumb-preview') as HTMLInputElement;
  const defTranscriptExp = document.getElementById('opt-def-transcript-exp') as HTMLInputElement;
  const defChaptersExp = document.getElementById('opt-def-chapters-exp') as HTMLInputElement;
  const defCommentsExp = document.getElementById('opt-def-comments-exp') as HTMLInputElement;

  const autoComments = document.getElementById('opt-auto-comments') as HTMLInputElement;
  const commentSort = document.getElementById('opt-comment-sort') as HTMLSelectElement;
  const commentLimit = document.getElementById('opt-comment-limit') as HTMLSelectElement;
  const commentReplies = document.getElementById('opt-comment-replies') as HTMLInputElement;
  const commentsInCopy = document.getElementById('opt-comments-in-copy') as HTMLInputElement;

  const exportChapters = document.getElementById('opt-export-chapters') as HTMLInputElement;
  const exportImages = document.getElementById('opt-export-images') as HTMLInputElement;
  const exportComments = document.getElementById('opt-export-comments') as HTMLInputElement;

  const resetBtn = document.getElementById('btn-reset-settings');

  async function populate() {
    const s = await getSettings();

    if (autoExtract) autoExtract.checked = s.autoExtract;
    if (prefLang) prefLang.value = s.preferredLanguage;
    if (theme) theme.value = s.theme;

    if (thumbPreview) thumbPreview.checked = s.showThumbnailPreview;
    if (defTranscriptExp) defTranscriptExp.checked = s.defaultTranscriptExpanded;
    if (defChaptersExp) defChaptersExp.checked = s.defaultChaptersExpanded;
    if (defCommentsExp) defCommentsExp.checked = s.defaultCommentsExpanded;

    if (autoComments) autoComments.checked = s.autoExtractComments;
    if (commentSort) commentSort.value = s.commentSortOrder;
    if (commentLimit) commentLimit.value = s.commentLimit.toString();
    if (commentReplies) commentReplies.checked = s.includeCommentReplies;
    if (commentsInCopy) commentsInCopy.checked = s.includeCommentsInCopy;

    if (exportChapters) exportChapters.checked = s.exportIncludeChapters;
    if (exportImages) exportImages.checked = s.exportIncludeImages;
    if (exportComments) exportComments.checked = s.exportIncludeComments;
  }

  // Load current values
  await populate();

  // Listen to changes and auto-save
  const inputs = [
    autoExtract, prefLang, theme,
    thumbPreview, defTranscriptExp, defChaptersExp, defCommentsExp,
    autoComments, commentSort, commentLimit, commentReplies, commentsInCopy,
    exportChapters, exportImages, exportComments
  ];

  inputs.forEach((input) => {
    input?.addEventListener('change', async () => {
      await saveSettings({
        autoExtract: autoExtract.checked,
        preferredLanguage: prefLang.value,
        theme: theme.value as any,

        showThumbnailPreview: thumbPreview.checked,
        defaultTranscriptExpanded: defTranscriptExp.checked,
        defaultChaptersExpanded: defChaptersExp.checked,
        defaultCommentsExpanded: defCommentsExp.checked,

        autoExtractComments: autoComments.checked,
        commentSortOrder: commentSort.value as any,
        commentLimit: parseInt(commentLimit.value, 10),
        includeCommentReplies: commentReplies.checked,
        includeCommentsInCopy: commentsInCopy.checked,

        exportIncludeChapters: exportChapters.checked,
        exportIncludeImages: exportImages.checked,
        exportIncludeComments: exportComments.checked
      });

      flashSaveNotice();
    });
  });

  // Reset to Defaults
  resetBtn?.addEventListener('click', async () => {
    const ok = confirm('Are you sure you want to restore all Zapcue settings to default values?');
    if (ok) {
      await resetSettings();
      await populate();
      flashSaveNotice();
    }
  });
});
