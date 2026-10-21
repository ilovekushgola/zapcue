async function testGetTranscriptWithParams() {
  const videoId = '8YdAAYPfwnI';
  const resp = await fetch('https://www.youtube.com/watch?v=' + videoId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const html = await resp.text();

  const keyMatch = html.match(/"INNERTUBE_API_KEY":\s*"([^"]+)"/);
  const clientVersionMatch = html.match(/"INNERTUBE_CLIENT_VERSION":\s*"([^"]+)"/);
  const paramsMatch = html.match(/"getTranscriptEndpoint":\s*\{\s*"params":\s*"([^"]+)"/);

  const apiKey = keyMatch ? keyMatch[1] : '';
  const clientVersion = clientVersionMatch ? clientVersionMatch[1] : '2.20241021.00.00';
  const params = paramsMatch ? paramsMatch[1] : '';

  console.log('API Key:', apiKey ? 'Found' : 'Missing');
  console.log('clientVersion:', clientVersion);
  console.log('getTranscript params:', params ? params : 'Missing');

  if (params) {
    const postUrl = `https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`;
    console.log('POSTing to:', postUrl);

    const postResp = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.youtube.com'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion,
            hl: 'en'
          }
        },
        params
      })
    });

    console.log('Response Status:', postResp.status);
    const data = await postResp.json();
    console.log('Top keys:', Object.keys(data));
    
    // Check actions
    const actions = data.actions || [];
    console.log('Actions count:', actions.length);
    if (actions.length > 0) {
      const panelAction = actions[0].updateEngagementPanelAction;
      const transRenderer = panelAction?.content?.transcriptRenderer;
      console.log('transRenderer found:', Boolean(transRenderer));
      const body = transRenderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;
      console.log('Segments count:', body ? body.length : 0);
      if (body && body.length > 0) {
        console.log('First segment raw:', JSON.stringify(body[0], null, 2));
        
        // Parse segments
        const parsed = body.map((item) => {
          const seg = item.transcriptSegmentRenderer;
          if (!seg) return null;
          return {
            start: parseInt(seg.startMs, 10) / 1000,
            timestamp: seg.timestamp?.simpleText || '',
            text: seg.snippet?.runs?.map(r => r.text).join('') || ''
          };
        }).filter(Boolean);
        
        console.log('\n--- FIRST 5 PARSED SEGMENTS ---');
        console.log(parsed.slice(0, 5));
      }
    }
  }
}

testGetTranscriptWithParams();
