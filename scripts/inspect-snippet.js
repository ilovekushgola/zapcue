async function inspectGetTranscriptSnippet() {
  const videoId = '8YdAAYPfwnI';
  const resp = await fetch('https://www.youtube.com/watch?v=' + videoId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const html = await resp.text();
  const idx = html.indexOf('get_transcript');
  if (idx !== -1) {
    console.log(html.slice(Math.max(0, idx - 200), idx + 500));
  }
}

inspectGetTranscriptSnippet();
