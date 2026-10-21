async function testAndroidCaptions() {
  const videoId = '8YdAAYPfwnI';
  console.log('Testing Android client Innertube player for video:', videoId);

  const resp = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/19.29.37 (Linux; U; Android 14; US) gzip'
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '19.29.37',
          androidSdkVersion: 34,
          hl: 'en',
          gl: 'US'
        }
      },
      videoId
    })
  });

  console.log('Player response status:', resp.status);
  const data = await resp.json();
  console.log('Title:', data.videoDetails?.title);
  const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  console.log('Caption tracks count from ANDROID client:', tracks.length);

  if (tracks.length > 0) {
    console.log('Track 0:', tracks[0]);
    // Try fetching with fmt=json3
    const cResp = await fetch(tracks[0].baseUrl + '&fmt=json3');
    console.log('Caption fetch status:', cResp.status);
    const text = await cResp.text();
    console.log('Caption length:', text.length);
    console.log('Caption snippet:', text.slice(0, 300));
  }
}

testAndroidCaptions();
