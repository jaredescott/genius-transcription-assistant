// YouTube content script - helps extract video info from YouTube pages
(function() {
  'use strict';

  // Listen for messages from the popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getYouTubeVideoInfo') {
      const videoInfo = getVideoInfoFromPage();
      sendResponse(videoInfo);
      return false;
    }
  });

  // Extract video information from the current YouTube page
  function getVideoInfoFromPage() {
    const url = window.location.href;
    
    // Extract video ID
    const videoIdMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    
    if (!videoId) {
      return { success: false, error: 'Not a YouTube video page' };
    }
    
    // Get video title
    let title = '';
    const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer, h1.ytd-watch-metadata, #title h1');
    if (titleEl) {
      title = titleEl.textContent?.trim() || '';
    }
    if (!title) {
      title = document.title.replace(' - YouTube', '').trim();
    }
    
    // Get channel name
    let channel = '';
    const channelEl = document.querySelector('#channel-name a, ytd-channel-name a, #owner-name a');
    if (channelEl) {
      channel = channelEl.textContent?.trim() || '';
    }
    
    return {
      success: true,
      videoId,
      title,
      channel,
      url
    };
  }

  console.log('Genius Transcription Assistant YouTube helper loaded');
})();
