async function testAllTracks() {
  const videoId = '8YdAAYPfwnI';
  const resp = await fetch('https://www.youtube.com/watch?v=' + videoId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const html = await resp.text();
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  const player = JSON.parse(match[1]);
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

  console.log(`Testing all ${tracks.length} tracks...`);

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const r = await fetch(t.baseUrl);
    const text = await r.text();
    console.log(`[${i}] lang: ${t.languageCode}, vssId: ${t.vssId}, status: ${r.status}, len: ${text.length}`);
    if (text.length > 0) {
      console.log('   FOUND NON-EMPTY TRACK! snippet:', text.slice(0, 150));
    }
  }
}

testAllTracks();
