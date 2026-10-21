async function test() {
  const videoId = '8YdAAYPfwnI';
  console.log('Fetching watch page for video:', videoId);
  const resp = await fetch('https://www.youtube.com/watch?v=' + videoId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const html = await resp.text();
  
  // Find ytInitialPlayerResponse
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  if (!match) {
    // Try other pattern
    const match2 = html.match(/var ytInitialPlayerResponse = (\{.+?\});<\/script>/);
    console.log('Match 1 failed, match 2:', Boolean(match2));
  } else {
    try {
      const player = JSON.parse(match[1]);
      console.log('Title:', player.videoDetails?.title);
      const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      console.log('Caption tracks count:', tracks ? tracks.length : 0);
      if (tracks) {
        console.log('First track:', tracks[0]);
        const cResp = await fetch(tracks[0].baseUrl + '&fmt=json3');
        console.log('Caption fetch status:', cResp.status);
        const text = await cResp.text();
        console.log('Caption response length:', text.length);
        console.log('Caption response snippet:', text.slice(0, 300));
      }
    } catch (e) {
      console.error('Error parsing player response:', e);
    }
  }

  // Also check Innertube get_transcript endpoint
  console.log('\nChecking Innertube get_transcript or player endpoint...');
  const innertubeResp = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20241201.00.00'
        }
      },
      videoId
    })
  });
  const innertubeData = await innertubeResp.json();
  const iTracks = innertubeData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  console.log('Innertube caption tracks:', iTracks ? iTracks.length : 0);
  if (iTracks && iTracks.length > 0) {
    console.log('Innertube track[0]:', iTracks[0]);
    const iCap = await fetch(iTracks[0].baseUrl + '&fmt=json3');
    console.log('Innertube caption fetch status:', iCap.status);
    const iCapText = await iCap.text();
    console.log('Innertube caption snippet:', iCapText.slice(0, 300));
  }
}

test();
