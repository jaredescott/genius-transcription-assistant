// Background service worker for YouTube transcript extraction
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Message received:', request.action, request);
  
  if (request.action === 'fetchTranscript') {
    console.log(`[Background] Starting transcript fetch for video: ${request.videoId}, lang: ${request.lang}`);
    
    // Get user preference for YouTube captions (default: false = use Python server first)
    const preferYouTubeCaptions = request.preferYouTubeCaptions || false;
    
    // Start the async operation
    fetchTranscriptWithFallback(request.videoId, request.lang, preferYouTubeCaptions)
      .then(transcript => {
        console.log('[Background] ✓ Transcript fetch successful');
        sendResponse({ success: true, transcript });
      })
      .catch(error => {
        console.error('[Background] ✗ Transcript fetch failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }
  
  if (request.action === 'setApiKey') {
    chrome.storage.local.set({ transcriptionApiKey: request.apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'getApiKey') {
    chrome.storage.local.get(['transcriptionApiKey'], (result) => {
      sendResponse({ apiKey: result.transcriptionApiKey || null });
    });
    return true;
  }
  
  if (request.action === 'getVideoInfo') {
    getVideoInfo(request.videoId)
      .then(info => sendResponse({ success: true, info }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'extractVideoId') {
    const videoId = extractVideoId(request.url);
    sendResponse({ success: !!videoId, videoId });
    return false;
  }
});

// Extract video ID from various YouTube URL formats
function extractVideoId(url) {
  if (!url) return null;
  
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

// Fetch video info (title, channel, etc.)
async function getVideoInfo(videoId) {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
  const html = await response.text();
  
  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  let title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'Unknown';
  
  // Extract channel name
  const channelMatch = html.match(/"ownerChannelName":"([^"]+)"/);
  const channel = channelMatch ? channelMatch[1] : 'Unknown';
  
  return { title, channel, videoId };
}

// Fetch transcript with fallback: try Python server first (default), YouTube captions as fallback
async function fetchTranscriptWithFallback(videoId, preferredLang = 'en', preferYouTubeCaptions = false) {
  console.log(`[Fallback] ===== Starting transcript fetch =====`);
  console.log(`[Fallback] Video ID: ${videoId}, Language: ${preferredLang}, Prefer YouTube: ${preferYouTubeCaptions}`);
  
  if (preferYouTubeCaptions) {
    // User explicitly wants YouTube captions first
    try {
      console.log(`[Fallback] Step 1: Attempting YouTube captions (user preference)...`);
      const result = await fetchYouTubeTranscript(videoId, preferredLang);
      console.log(`[Fallback] ✓ YouTube captions successful!`);
      return result;
    } catch (error) {
      console.log(`[Fallback] ✗ YouTube captions failed: ${error.message}`);
      console.log(`[Fallback] Step 2: Falling back to Python server transcription...`);
      
      try {
        const result = await fetchTranscriptFromAPI(videoId, preferredLang);
        console.log(`[Fallback] ✓ Python server transcription successful!`);
        return result;
      } catch (apiError) {
        console.error(`[Fallback] ✗ Python server transcription failed:`, apiError);
        throw new Error(`YouTube captions unavailable and transcription failed: ${apiError.message}`);
      }
    }
  } else {
    // Default: Try Python server first (faster, more accurate)
    try {
      console.log(`[Fallback] Step 1: Attempting Python server transcription (default)...`);
      const result = await fetchTranscriptFromAPI(videoId, preferredLang);
      console.log(`[Fallback] ✓ Python server transcription successful!`);
      return result;
    } catch (apiError) {
      console.log(`[Fallback] ✗ Python server transcription failed: ${apiError.message}`);
      console.log(`[Fallback] Step 2: Falling back to YouTube captions...`);
      
      try {
        const result = await fetchYouTubeTranscript(videoId, preferredLang);
        console.log(`[Fallback] ✓ YouTube captions successful!`);
        return result;
      } catch (error) {
        console.error(`[Fallback] ✗ YouTube captions failed:`, error);
        throw new Error(`Transcription failed and YouTube captions unavailable: ${apiError.message}`);
      }
    }
  }
}

// Fetch YouTube transcript using the captions API
async function fetchYouTubeTranscript(videoId, preferredLang = 'en') {
  // Step 1: Get the video page to extract caption track info
  console.log(`[YouTube] Fetching page for video: ${videoId}`);
  
  // Use Promise.race for timeout (more reliable than AbortController in service workers)
  const fetchPromise = fetch(`https://www.youtube.com/watch?v=${videoId}`);
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('TIMEOUT')), 10000); // 10 second timeout
  });
  
  let pageResponse;
  try {
    pageResponse = await Promise.race([fetchPromise, timeoutPromise]);
    console.log(`[YouTube] Page fetched, status: ${pageResponse.status}`);
    
    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch YouTube page: ${pageResponse.status}`);
    }
  } catch (error) {
    if (error.message === 'TIMEOUT') {
      console.log(`[YouTube] Request timed out after 10 seconds`);
      throw new Error('YouTube request timed out - trying fallback transcription');
    }
    console.error(`[YouTube] Fetch error:`, error);
    throw error;
  }
  
  let pageHtml;
  try {
    pageHtml = await pageResponse.text();
    console.log(`[YouTube] Page HTML received (${pageHtml.length} chars), extracting captions...`);
  } catch (error) {
    console.error(`[YouTube] Error reading page text:`, error);
    throw new Error('Failed to read YouTube page content');
  }
  
  // Step 2: Extract caption tracks from the page
  const captionTracks = extractCaptionTracks(pageHtml);
  
  if (captionTracks.length === 0) {
    throw new Error('No captions available');
  }
  
  // Step 3: Find the best caption track (prefer manual, then auto-generated)
  let selectedTrack = null;
  
  // First try to find preferred language (manual)
  selectedTrack = captionTracks.find(t => 
    t.languageCode === preferredLang && !t.kind
  );
  
  // Then try auto-generated in preferred language
  if (!selectedTrack) {
    selectedTrack = captionTracks.find(t => 
      t.languageCode === preferredLang && t.kind === 'asr'
    );
  }
  
  // Fall back to any English track
  if (!selectedTrack) {
    selectedTrack = captionTracks.find(t => 
      t.languageCode.startsWith('en')
    );
  }
  
  // Fall back to first available track
  if (!selectedTrack) {
    selectedTrack = captionTracks[0];
  }
  
  // Step 4: Fetch the transcript
  console.log(`Fetching transcript from track: ${selectedTrack.languageCode}`);
  const transcriptResponse = await fetch(selectedTrack.baseUrl);
  const transcriptXml = await transcriptResponse.text();
  
  // Step 5: Parse the XML transcript
  const transcript = parseTranscriptXml(transcriptXml);
  console.log(`Transcript parsed, ${transcript.segments.length} segments`);
  
  return {
    text: transcript.text,
    segments: transcript.segments,
    language: selectedTrack.languageCode,
    isAutoGenerated: selectedTrack.kind === 'asr',
    availableLanguages: captionTracks.map(t => ({
      code: t.languageCode,
      name: t.name?.simpleText || t.languageCode,
      isAuto: t.kind === 'asr'
    }))
  };
}

// Extract caption track URLs from YouTube page HTML
function extractCaptionTracks(html) {
  const tracks = [];
  
  // Method 1: Look for playerCaptionsTracklistRenderer
  const captionsMatch = html.match(/"captionTracks":\s*(\[[^\]]+\])/);
  
  if (captionsMatch) {
    try {
      // Fix JSON formatting issues (YouTube sometimes uses single quotes or unquoted keys)
      let jsonStr = captionsMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      
      // Parse the JSON
      const captionData = JSON.parse(jsonStr);
      
      for (const track of captionData) {
        if (track.baseUrl) {
          tracks.push({
            baseUrl: track.baseUrl,
            languageCode: track.languageCode || 'en',
            kind: track.kind,
            name: track.name
          });
        }
      }
    } catch (e) {
      console.error('Error parsing caption tracks:', e);
    }
  }
  
  // Method 2: Alternative extraction using ytInitialPlayerResponse
  if (tracks.length === 0) {
    const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (playerResponseMatch) {
      try {
        const playerResponse = JSON.parse(playerResponseMatch[1]);
        const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        
        if (captions) {
          for (const track of captions) {
            tracks.push({
              baseUrl: track.baseUrl,
              languageCode: track.languageCode || 'en',
              kind: track.kind,
              name: track.name
            });
          }
        }
      } catch (e) {
        console.error('Error parsing player response:', e);
      }
    }
  }
  
  return tracks;
}

// Parse the transcript XML into text
function parseTranscriptXml(xml) {
  const segments = [];
  let fullText = '';
  
  // Parse XML using regex (simple but effective for this format)
  const textRegex = /<text[^>]*start="([^"]*)"[^>]*dur="([^"]*)"[^>]*>([^<]*)<\/text>/g;
  let match;
  
  while ((match = textRegex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    let text = match[3];
    
    // Decode HTML entities
    text = decodeHtmlEntities(text);
    
    // Clean up the text
    text = text.replace(/\n/g, ' ').trim();
    
    if (text) {
      segments.push({
        start,
        duration,
        text
      });
    }
  }
  
  // Build full text with intelligent line breaks
  // Group segments into sentences/phrases
  let currentLine = '';
  let lastEnd = 0;
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const gap = segment.start - lastEnd;
    
    // Add line break for longer pauses (> 1.5 seconds) or sentence endings
    const endsWithPunctuation = /[.!?]$/.test(currentLine.trim());
    
    if (currentLine && (gap > 1.5 || endsWithPunctuation)) {
      fullText += currentLine.trim() + '\n';
      currentLine = '';
    }
    
    currentLine += (currentLine ? ' ' : '') + segment.text;
    lastEnd = segment.start + segment.duration;
  }
  
  // Add remaining text
  if (currentLine.trim()) {
    fullText += currentLine.trim();
  }
  
  return {
    text: fullText,
    segments
  };
}

// Decode HTML entities
function decodeHtmlEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#32;': ' ',
    '&nbsp;': ' '
  };
  
  // Replace named entities
  for (const [entity, char] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'g'), char);
  }
  
  // Replace numeric entities
  text = text.replace(/&#(\d+);/g, (match, num) => String.fromCharCode(parseInt(num, 10)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  return text;
}

// Fetch transcript using fast transcription API (fallback when YouTube captions unavailable)
async function fetchTranscriptFromAPI(videoId, preferredLang = 'en') {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Get settings from storage
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(['transcriptionApiKey', 'localServerPort', 'useLocalServer'], resolve);
  });
  
  const useLocalServer = result.useLocalServer !== false; // Default to true
  const localServerPort = result.localServerPort || 8765;
  const apiKey = result.transcriptionApiKey;
  
  // Option 1: Try local Python server first (if enabled)
  if (useLocalServer) {
    try {
      return await transcribeWithLocalServer(youtubeUrl, localServerPort, preferredLang);
    } catch (e) {
      console.error('Local server transcription failed:', e);
      // Fall through to other options
    }
  }
  
  // Option 2: AssemblyAI (if API key provided)
  if (apiKey) {
    try {
      return await transcribeWithAssemblyAI(youtubeUrl, apiKey, preferredLang);
    } catch (e) {
      console.error('AssemblyAI transcription failed:', e);
    }
  }
  
  // If all else fails
  throw new Error('Transcription failed. Start the local Python server or add an API key in settings.');
}

// Transcribe using AssemblyAI (requires API key)
async function transcribeWithAssemblyAI(youtubeUrl, apiKey, lang = 'en') {
  // Step 1: Submit transcription job
  const submitResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'authorization': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      audio_url: youtubeUrl,
      language_code: lang === 'auto' ? 'en' : lang,
      auto_chapters: false,
      speaker_labels: false
    })
  });
  
  if (!submitResponse.ok) {
    const error = await submitResponse.json();
    throw new Error(error.error || 'Failed to submit transcription');
  }
  
  const { id } = await submitResponse.json();
  
  // Step 2: Poll for results (with timeout)
  const maxAttempts = 60; // 5 minutes max
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
    const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: {
        'authorization': apiKey
      }
    });
    
    const status = await statusResponse.json();
    
    if (status.status === 'completed') {
      // Format transcript similar to YouTube format
      const segments = status.words || [];
      let fullText = '';
      let currentLine = '';
      let lastEnd = 0;
      
      for (const word of segments) {
        const gap = word.start / 1000 - lastEnd;
        const endsWithPunctuation = /[.!?]$/.test(currentLine.trim());
        
        if (currentLine && (gap > 1.5 || endsWithPunctuation)) {
          fullText += currentLine.trim() + '\n';
          currentLine = '';
        }
        
        currentLine += (currentLine ? ' ' : '') + word.text;
        lastEnd = word.end / 1000;
      }
      
      if (currentLine.trim()) {
        fullText += currentLine.trim();
      }
      
      return {
        text: fullText || status.text || '',
        segments: segments.map(w => ({
          start: w.start / 1000,
          duration: (w.end - w.start) / 1000,
          text: w.text
        })),
        language: lang,
        isAutoGenerated: true,
        availableLanguages: [],
        source: 'assemblyai'
      };
    } else if (status.status === 'error') {
      throw new Error(status.error || 'Transcription failed');
    }
    
    attempts++;
  }
  
  throw new Error('Transcription timeout - video may be too long');
}

// Transcribe using local Python server
async function transcribeWithLocalServer(youtubeUrl, port = 8765, lang = 'en') {
  try {
    console.log(`Checking local server health on port ${port}...`);
    // First check if server is running
    const healthResponse = await fetch(`http://localhost:${port}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!healthResponse.ok) {
      throw new Error(`Local server not responding on port ${port}. Make sure transcription_server.py is running.`);
    }
    
    const health = await healthResponse.json();
    console.log('Server health check:', health);
    if (health.status !== 'ok') {
      throw new Error(health.message || 'Local server dependencies not installed');
    }
    
    console.log(`Submitting transcription request for: ${youtubeUrl}`);
    // Submit transcription request with insane mode enabled
    const transcribeResponse = await fetch(`http://localhost:${port}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: youtubeUrl,
        language: lang === 'auto' ? 'en' : lang,
        model: 'base', // Can be made configurable
        use_insane: true // Enable insane mode for maximum speed
      })
    });
    
    console.log(`Transcription response status: ${transcribeResponse.status}`);
    
    if (!transcribeResponse.ok) {
      const error = await transcribeResponse.json();
      throw new Error(error.error || 'Transcription failed');
    }
    
    const result = await transcribeResponse.json();
    
    if (result.success && result.transcript) {
      return {
        text: result.transcript.text,
        segments: result.transcript.segments || [],
        language: result.transcript.language || lang,
        isAutoGenerated: true,
        availableLanguages: [],
        source: result.transcript.source || 'local-server'
      };
    } else {
      throw new Error(result.error || 'Transcription failed');
    }
  } catch (e) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      throw new Error(`Cannot connect to local server on port ${port}. Make sure transcription_server.py is running.`);
    }
    throw e;
  }
}

console.log('Genius Transcription Assistant background service worker loaded');
