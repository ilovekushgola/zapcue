async function testHiTrack() {
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

  // Find Hindi track
  const hiTrack = tracks.find(t => t.languageCode === 'hi');
  if (hiTrack) {
    console.log('Testing Hindi baseUrl:', hiTrack.baseUrl);
    const r = await fetch(hiTrack.baseUrl);
    const text = await r.text();
    console.log('Hindi track status:', r.status, 'len:', text.length, 'snippet:', text.slice(0, 200));

    // Also test Hindi track with &tlang=en
    const rEn = await fetch(hiTrack.baseUrl + '&tlang=en');
    const textEn = await rEn.text();
    console.log('Hindi track with &tlang=en status:', rEn.status, 'len:', textEn.length, 'snippet:', textEn.slice(0, 200));
  } else {
    console.log('No Hindi track found');
  }
}

testHiTrack();
