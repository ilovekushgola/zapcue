async function inspectYtInitialData() {
  const videoId = '8YdAAYPfwnI';
  const resp = await fetch('https://www.youtube.com/watch?v=' + videoId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const html = await resp.text();

  // Search for "get_transcript" or "transcript" in html
  const idx = html.indexOf('get_transcript');
  console.log('IndexOf get_transcript:', idx);

  // Search for "engagement-panel-transcript" in html
  const epIdx = html.indexOf('engagement-panel-transcript');
  console.log('IndexOf engagement-panel-transcript:', epIdx);

  if (epIdx !== -1) {
    console.log('Snippet around engagement-panel-transcript:');
    console.log(html.slice(epIdx - 100, epIdx + 400));
  }

  // Search for "continuationCommand" near transcript
  const tMatch = html.match(/"targetId":\s*"engagement-panel-transcript".+?"continuationCommand":\s*\{\s*"token":\s*"([^"]+)"/s);
  console.log('continuationCommand match:', tMatch ? tMatch[1].slice(0, 40) : 'null');
}

inspectYtInitialData();
