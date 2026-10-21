async function printEnTrack() {
  const videoId = '8YdAAYPfwnI';
  const resp = await fetch('https://www.youtube.com/watch?v=' + videoId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  // Get cookies from watch page response
  const cookies = resp.headers.get('set-cookie') || '';
  console.log('Set-Cookie received:', cookies ? cookies.slice(0, 100) : 'none');

  const html = await resp.text();
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  const player = JSON.parse(match[1]);
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const enTrack = tracks.find(t => t.languageCode === 'en' || t.vssId?.includes('.en'));

  console.log('Full enTrack:', JSON.stringify(enTrack, null, 2));

  // Now fetch with the cookies from the watch page!
  const capResp = await fetch(enTrack.baseUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Cookie': cookies,
      'Referer': 'https://www.youtube.com/watch?v=' + videoId
    }
  });
  console.log('capResp status:', capResp.status);
  const capText = await capResp.text();
  console.log('capText len:', capText.length);
  console.log('capText snippet:', capText.slice(0, 200));
}

printEnTrack();
