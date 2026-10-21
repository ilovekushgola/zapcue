async function testGetTranscript() {
  const videoId = '8YdAAYPfwnI';
  
  // First fetch watch page to get ytcfg (INNERTUBE_API_KEY, INNERTUBE_CONTEXT, etc.)
  const resp = await fetch('https://www.youtube.com/watch?v=' + videoId, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const html = await resp.text();

  // Extract ytcfg
  const keyMatch = html.match(/"INNERTUBE_API_KEY":\s*"([^"]+)"/);
  const clientVersionMatch = html.match(/"INNERTUBE_CLIENT_VERSION":\s*"([^"]+)"/);
  const apiKey = keyMatch ? keyMatch[1] : '';
  const clientVersion = clientVersionMatch ? clientVersionMatch[1] : '2.20241021.00.00';

  console.log('API Key:', apiKey ? 'Found' : 'Missing', 'clientVersion:', clientVersion);

  // Extract params for get_transcript from ytInitialData
  // Look for engagementPanelSectionListRenderer with targetId engagement-panel-transcript
  const dataMatch = html.match(/ytInitialData\s*=\s*(\{.+?\});<\/script>/s) ||
                    html.match(/var ytInitialData = (\{.+?\});/);
  
  if (dataMatch) {
    const ytData = JSON.parse(dataMatch[1]);
    const panels = ytData.engagementPanels || [];
    console.log('Engagement panels found:', panels.length);
    const transcriptPanel = panels.find((p) => 
      p.engagementPanelSectionListRenderer?.targetId === 'engagement-panel-transcript'
    );
    console.log('Transcript panel found:', Boolean(transcriptPanel));
    if (transcriptPanel) {
      console.log('Transcript panel content keys:', Object.keys(transcriptPanel.engagementPanelSectionListRenderer));
      const continuation = transcriptPanel.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
      console.log('Continuation token:', continuation ? continuation.slice(0, 50) + '...' : 'None');
      
      if (continuation) {
        console.log('\nFetching get_transcript with continuation...');
        const transResp = await fetch(`https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion
              }
            },
            params: continuation
          })
        });
        console.log('get_transcript status:', transResp.status);
        const transData = await transResp.json();
        console.log('get_transcript response keys:', Object.keys(transData));
        const actions = transData.actions || [];
        console.log('Actions count:', actions.length);
        if (actions[0]) {
          const renderer = actions[0].updateEngagementPanelAction?.content?.transcriptRenderer;
          const body = renderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;
          console.log('Segments count in get_transcript:', body ? body.length : 0);
          if (body && body[0]) {
            console.log('Sample segment:', JSON.stringify(body[0], null, 2));
          }
        }
      }
    }
  }

  // Also test why timedtext had length 0
  // timedtext in browser needs cookies or specific params
}

testGetTranscript();
