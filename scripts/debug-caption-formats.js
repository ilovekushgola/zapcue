async function testFormats() {
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

  console.log(`Found ${tracks.length} tracks.`);
  tracks.forEach((t, i) => console.log(`[${i}] lang: ${t.languageCode}, name: ${t.name?.simpleText || t.name?.runs?.[0]?.text}, vssId: ${t.vssId}`));

  // Find English track
  const enTrack = tracks.find(t => t.languageCode === 'en' || t.vssId?.includes('.en'));
  console.log('\nEnglish track:', enTrack ? enTrack.vssId : 'NOT FOUND');

  if (enTrack) {
    console.log('Testing en baseUrl directly:');
    const r1 = await fetch(enTrack.baseUrl);
    const t1 = await r1.text();
    console.log('Raw status:', r1.status, 'len:', t1.length, 'snippet:', t1.slice(0, 150));

    console.log('Testing en baseUrl + &fmt=json3:');
    const r2 = await fetch(enTrack.baseUrl + '&fmt=json3');
    const t2 = await r2.text();
    console.log('json3 status:', r2.status, 'len:', t2.length, 'snippet:', t2.slice(0, 150));

    console.log('Testing en baseUrl + &fmt=srv3:');
    const r3 = await fetch(enTrack.baseUrl + '&fmt=srv3');
    const t3 = await r3.text();
    console.log('srv3 status:', r3.status, 'len:', t3.length, 'snippet:', t3.slice(0, 150));
  }
}

testFormats();
