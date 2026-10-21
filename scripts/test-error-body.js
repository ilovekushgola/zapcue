async function testErrorBody() {
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

  const postUrl = `https://www.youtube.com/youtubei/v1/get_transcript?key=${keyMatch[1]}`;
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
          clientVersion: clientVersionMatch[1]
        }
      },
      params: paramsMatch[1]
    })
  });

  const data = await postResp.json();
  console.log('Error data:', JSON.stringify(data, null, 2));
}

testErrorBody();
