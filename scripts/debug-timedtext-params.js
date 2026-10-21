async function testTimedTextParams() {
  const videoId = '8YdAAYPfwnI';
  const resp = await fetch('https://www.youtube.com/watch?v=' + videoId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const html = await resp.text();
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  const player = JSON.parse(match[1]);
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const enTrack = tracks.find(t => t.languageCode === 'en' || t.vssId?.includes('.en'));

  if (!enTrack) {
    console.log('No enTrack');
    return;
  }

  console.log('Base URL:', enTrack.baseUrl);

  // Test with Referer & Origin headers
  const tests = [
    { name: 'With Referer & Origin', url: enTrack.baseUrl, headers: { 'Referer': 'https://www.youtube.com/watch?v=' + videoId, 'Origin': 'https://www.youtube.com' } },
    { name: 'fmt=vtt', url: enTrack.baseUrl + '&fmt=vtt', headers: {} },
    { name: 'fmt=srv1', url: enTrack.baseUrl + '&fmt=srv1', headers: {} },
    { name: 'fmt=json3 + referer', url: enTrack.baseUrl + '&fmt=json3', headers: { 'Referer': 'https://www.youtube.com/watch?v=' + videoId } }
  ];

  for (const t of tests) {
    const res = await fetch(t.url, { headers: t.headers });
    const body = await res.text();
    console.log(`[${t.name}] status: ${res.status}, len: ${body.length}, snippet: ${body.slice(0, 80)}`);
  }
}

testTimedTextParams();
