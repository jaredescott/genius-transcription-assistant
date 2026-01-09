// Genius Transcription Assistant - Content Script
(function() {
  'use strict';

  // Check if we're on a song page (not artist/album/search pages)
  function isSongPage() {
    const url = window.location.href;
    const pathname = window.location.pathname;
    
    // Explicitly include "add a song" pages
    if (pathname.match(/^\/songs\/new/) || pathname.match(/^\/songs\/create/) || pathname.match(/^\/songs\/add/)) {
      return true;
    }
    
    // Exclude non-song pages
    const excludePatterns = [
      /^\/artists\//,           // Artist pages: /artists/artist-name
      /^\/albums\//,            // Album pages: /albums/album-name
      /^\/search/,              // Search pages
      /^\/users\//,             // User profiles
      /^\/$/,                   // Home page
      /^\/explore/,             // Explore page
      /^\/videos/,              // Videos page
      /^\/news/,                // News page
      /^\/community/,           // Community pages
    ];
    
    // Check if URL matches exclude patterns
    for (const pattern of excludePatterns) {
      if (pattern.test(pathname)) {
        return false;
      }
    }
    
    // Song pages typically have format: /artist-song-name or /songs/song-id
    // They should have a lyrics editor (including add song page)
    const hasLyricsEditor = document.querySelector('[contenteditable="true"]') || 
                           document.querySelector('textarea') ||
                           document.querySelector('[data-testid="lyrics-editor"]') ||
                           document.querySelector('[name="lyrics"]') ||
                           document.querySelector('.lyrics-editor') ||
                           document.querySelector('#lyrics');
    
    // Also check for common song page indicators
    const hasSongIndicators = document.querySelector('[data-testid="song-header"]') ||
                             document.querySelector('.SongHeader') ||
                             pathname.match(/^\/[^\/]+$/) || // Single path segment (artist-song-name format)
                             pathname.match(/^\/songs\/\d+/); // Song ID format: /songs/12345
    
    return hasLyricsEditor || hasSongIndicators;
  }

  // Only proceed if on a song page
  if (!isSongPage()) {
    console.log('Genius Transcription Assistant: Not a song page, skipping initialization');
    return;
  }

  console.log('Genius Transcription Assistant script loaded');

  // Check if already injected
  if (document.getElementById('genius-transcriber-panel')) {
    console.log('Panel already exists, skipping initialization');
    return;
  }

  // State management
  const state = {
    history: [],
    historyIndex: -1,
    maxHistorySize: 10,
    currentDraft: null,
    detectedArtists: [],
    sectionCounts: {
      'Verse': 0,
      'Chorus': 0,
      'Bridge': 0,
      'Intro': 0,
      'Outro': 0
    }
  };

  // Initialize extension
  function init() {
    // Check if we're on a song page
    if (!isSongPage()) {
      // Remove panel if it exists (user navigated away from song page)
      const existingPanel = document.getElementById('genius-transcriber-panel');
      if (existingPanel) {
        existingPanel.remove();
      }
      return;
    }

    // Don't prevent re-initialization on SPA navigation
    if (document.getElementById('genius-transcriber-panel')) {
      return; // Already exists
    }
    
    try {
      createUI();
      loadDraft();
      setupKeyboardShortcuts();
      setupAutoSave();
      // detectArtists() is called in setupEventListeners after UI is ready
      console.log('Genius Transcription Assistant initialized');
    } catch (error) {
      console.error('Genius Transcription Assistant initialization error:', error);
    }
  }

  // Create main UI panel
  function createUI() {
    // Remove any existing panel first
    const existingPanel = document.getElementById('genius-transcriber-panel');
    if (existingPanel) {
      existingPanel.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'genius-transcriber-panel';
    panel.innerHTML = `
      <div class="gft-header" id="gft-header">
        <h3>🎵 Genius Transcription Assistant</h3>
            <button class="gft-toggle-btn" id="gft-toggle-panel">+</button>
          </div>
          <div class="gft-content" id="gft-content" style="display: none;">
            <!-- Smart Tags Section -->
            <div class="gft-section">
              <h4>Smart Tags</h4>
              <div class="gft-btn-group">
                <button class="gft-btn" data-tag="Intro" data-section="Intro">Intro</button>
                <button class="gft-btn" data-tag="Verse" data-section="Verse">Verse</button>
                <button class="gft-btn" data-tag="Chorus" data-section="Chorus">Chorus</button>
                <button class="gft-btn" data-tag="Bridge" data-section="Bridge">Bridge</button>
                <button class="gft-btn" data-tag="Outro" data-section="Outro">Outro</button>
              </div>
              <button class="gft-btn gft-btn-secondary" id="gft-number-sections">Number Verses</button>
              <div id="gft-artist-list" class="gft-artist-list" style="display: none; margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 12px;">
                <strong>Artists:</strong> <span id="gft-artists-display">Loading...</span>
              </div>
            </div>

            <!-- Text Formatting Section -->
            <div class="gft-section">
              <h4>Text Formatting</h4>
              <div class="gft-btn-group">
                <button class="gft-btn" id="gft-bold" title="Ctrl+B">Bold</button>
                <button class="gft-btn" id="gft-italic" title="Ctrl+I">Italic</button>
              </div>
            </div>

            <!-- Corrections Section -->
            <div class="gft-section">
              <h4>Corrections</h4>
              <button class="gft-btn gft-btn-primary" id="gft-correct-all">✨ Correct All</button>
              <button class="gft-btn gft-btn-secondary" id="gft-check-brackets">Check Brackets</button>
            </div>

            <!-- YouTube Controls -->
            <div class="gft-section">
              <h4>YouTube Controls</h4>
              <div class="gft-btn-group">
                <button class="gft-btn" id="gft-yt-play">▶ Play</button>
                <button class="gft-btn" id="gft-yt-pause">⏸ Pause</button>
                <button class="gft-btn" id="gft-yt-rewind">⏪ -5s</button>
                <button class="gft-btn" id="gft-yt-forward">⏩ +5s</button>
              </div>
            </div>

            <!-- History Section -->
            <div class="gft-section">
              <h4>History</h4>
              <div class="gft-btn-group">
                <button class="gft-btn" id="gft-undo" title="Ctrl+Z">↶ Undo</button>
                <button class="gft-btn" id="gft-redo" title="Ctrl+Y">↷ Redo</button>
              </div>
            </div>

            <!-- Status -->
            <div class="gft-status" id="gft-status"></div>
          </div>
    `;

    // Always insert panel into body for visibility
    document.body.appendChild(panel);
    
    // Ensure initial bottom positioning if no saved position
    const savedPos = localStorage.getItem('gft-panel-position');
    if (!savedPos) {
      panel.style.bottom = '20px';
      panel.style.right = '20px';
      panel.style.top = 'auto';
      panel.style.left = 'auto';
    }
    applyPanelAnchor(panel);
    clampOrResetPosition(panel);
    
    console.log('Genius Transcription Assistant panel created');

    // Setup drag functionality
    setupDragFunctionality(panel);

    // Setup event listeners after a short delay to ensure DOM is ready
    setTimeout(() => {
      try {
        setupEventListeners();
        detectArtists(); // Detect artists after UI is ready
      } catch (error) {
        console.error('Error setting up event listeners:', error);
      }
    }, 100);
  }

  // Setup drag functionality for the panel
  function setupDragFunctionality(panel) {
    const header = panel.querySelector('.gft-header');
    if (!header) return;

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    // Load saved position (convert stored top to bottom anchoring)
    const savedPos = localStorage.getItem('gft-panel-position');
    if (savedPos) {
      try {
        const pos = JSON.parse(savedPos);
        // Calculate bottom based on stored top/left and current height
        const rect = panel.getBoundingClientRect();
        const bottom = Math.max(10, window.innerHeight - pos.y - rect.height);
        const clampedLeft = Math.max(10, Math.min(pos.x, window.innerWidth - rect.width - 10));
        panel.style.left = clampedLeft + 'px';
        panel.style.right = 'auto';
        panel.style.top = 'auto';
        panel.style.bottom = bottom + 'px';
        xOffset = clampedLeft;
        yOffset = window.innerHeight - bottom - rect.height;
        ensurePanelWithinViewport(panel);
      } catch (e) {
        console.error('Error loading panel position:', e);
      }
    } else {
      // Default to bottom-right if no saved position
      panel.style.top = 'auto';
      panel.style.left = 'auto';
      panel.style.bottom = '20px';
      panel.style.right = '20px';
      panel.style.height = 'auto';
    }
    applyPanelAnchor(panel);
    clampOrResetPosition(panel);

    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
      // Don't drag if clicking the toggle button
      if (e.target.id === 'gft-toggle-panel' || e.target.closest('#gft-toggle-panel')) {
        return;
      }

      // Get current position
      const rect = panel.getBoundingClientRect();
      
      // Get current X position
      if (panel.style.left) {
        xOffset = parseInt(panel.style.left) || rect.left;
      } else if (panel.style.right) {
        xOffset = window.innerWidth - parseInt(panel.style.right) - rect.width;
      } else {
        xOffset = rect.left;
      }
      
      // Get current Y position
      if (panel.style.top && panel.style.top !== 'auto') {
        yOffset = parseInt(panel.style.top) || rect.top;
      } else if (panel.style.bottom && panel.style.bottom !== 'auto') {
        // Convert bottom positioning to top for dragging
        const bottomValue = parseInt(panel.style.bottom) || 20;
        yOffset = window.innerHeight - bottomValue - rect.height;
      } else {
        // Default: calculate from current position
        yOffset = rect.top;
      }

      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      if (e.target === header || header.contains(e.target)) {
        isDragging = true;
        header.style.cursor = 'grabbing';
        // Clear right/bottom positioning when dragging, ensure top/left is set
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.top = yOffset + 'px';
        panel.style.left = xOffset + 'px';
        applyPanelAnchor(panel);
      }
    }

    function drag(e) {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        // Keep panel within viewport bounds
        const maxX = window.innerWidth - panel.offsetWidth;
        const maxY = window.innerHeight - panel.offsetHeight;
        currentX = Math.max(0, Math.min(currentX, maxX));
        currentY = Math.max(0, Math.min(currentY, maxY));

        panel.style.left = currentX + 'px';
        panel.style.top = currentY + 'px';
        xOffset = currentX;
        yOffset = currentY;
      }
    }

    function dragEnd(e) {
      if (isDragging) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        header.style.cursor = 'grab';

        // Save position
        const rect = panel.getBoundingClientRect();
      clampOrResetPosition(panel);
        localStorage.setItem('gft-panel-position', JSON.stringify({
          x: rect.left,
          y: rect.top
        }));
        applyPanelAnchor(panel);
      }
    }

    // Set cursor style
    header.style.cursor = 'grab';
    header.style.userSelect = 'none';
  }

  // Setup event listeners
  function setupEventListeners() {
    // Smart tag buttons - now with artist selection
    document.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sectionType = btn.dataset.section;
        showSectionDialog(sectionType);
      });
    });

    // Number all sections
    const numberSectionsBtn = document.getElementById('gft-number-sections');
    if (numberSectionsBtn) numberSectionsBtn.addEventListener('click', numberAllSections);

    // Text formatting buttons
    const boldBtn = document.getElementById('gft-bold');
    if (boldBtn) boldBtn.addEventListener('click', () => toggleFormatting('bold'));
    const italicBtn = document.getElementById('gft-italic');
    if (italicBtn) italicBtn.addEventListener('click', () => toggleFormatting('italic'));

    // Correct all
    const correctAllBtn = document.getElementById('gft-correct-all');
    if (correctAllBtn) correctAllBtn.addEventListener('click', correctAll);

    // Check brackets
    const checkBracketsBtn = document.getElementById('gft-check-brackets');
    if (checkBracketsBtn) checkBracketsBtn.addEventListener('click', checkBrackets);

    // YouTube controls
    const ytPlay = document.getElementById('gft-yt-play');
    if (ytPlay) ytPlay.addEventListener('click', () => controlYouTube('play'));
    const ytPause = document.getElementById('gft-yt-pause');
    if (ytPause) ytPause.addEventListener('click', () => controlYouTube('pause'));
    const ytRewind = document.getElementById('gft-yt-rewind');
    if (ytRewind) ytRewind.addEventListener('click', () => controlYouTube('rewind'));
    const ytForward = document.getElementById('gft-yt-forward');
    if (ytForward) ytForward.addEventListener('click', () => controlYouTube('forward'));

    // History
    const undoBtn = document.getElementById('gft-undo');
    if (undoBtn) undoBtn.addEventListener('click', undo);
    const redoBtn = document.getElementById('gft-redo');
    if (redoBtn) redoBtn.addEventListener('click', redo);

    // Toggle panel
    const toggleBtn = document.getElementById('gft-toggle-panel');
    if (toggleBtn) toggleBtn.addEventListener('click', togglePanel);
  }

  // Get the lyrics editor element
  function getLyricsEditor() {
    // Try different selectors for Genius lyrics editor
    const selectors = [
      '[contenteditable="true"]',
      '.lyrics textarea',
      '.lyrics input',
      '[data-testid="lyrics-editor"]',
      '.lyrics'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && (element.contentEditable === 'true' || element.tagName === 'TEXTAREA' || element.tagName === 'INPUT')) {
        return element;
      }
    }

    // Fallback: find any contenteditable or textarea
    return document.querySelector('[contenteditable="true"]') || 
           document.querySelector('textarea') ||
           document.querySelector('input[type="text"]');
  }

  // Show dialog for section with artist selection
  function showSectionDialog(sectionType) {
    // Only verses should be numbered per Genius.com guidelines
    const shouldNumber = sectionType === 'Verse';
    
    // Count existing verses to suggest next number (only for verses)
    const editor = getLyricsEditor();
    if (!editor) {
      showStatus('Could not find lyrics editor', 'error');
      return;
    }

    let nextNumber = 1;
    if (shouldNumber) {
      const content = editor.contentEditable === 'true' ? editor.textContent : editor.value;
      const verseRegex = /\[Verse\s+(\d+)(?:\s*:\s*[^\]]+)?\]/gi;
      const matches = content.match(verseRegex) || [];
      if (matches.length > 0) {
        // Extract highest verse number
        const verseNumbers = matches.map(m => {
          const numMatch = m.match(/\[Verse\s+(\d+)/);
          return numMatch ? parseInt(numMatch[1]) : 0;
        });
        nextNumber = Math.max(...verseNumbers) + 1;
      }
    }

    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.id = 'gft-section-dialog';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      min-width: 300px;
      max-width: 400px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px 0; font-size: 18px;">Insert ${sectionType}</h3>
      ${shouldNumber ? `
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; font-weight: 600;">Verse Number:</label>
        <input type="number" id="gft-section-number" value="${nextNumber}" min="1" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
        <p style="margin: 4px 0 0 0; font-size: 11px; color: #666;">Note: Only verses are numbered per Genius.com guidelines</p>
      </div>
      ` : ''}
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; font-weight: 600;">Artists (up to 4, optional):</label>
        <div id="gft-artist-inputs" style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; gap: 8px; align-items: center;">
            <select class="gft-artist-select" data-index="0" style="flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px;">
              <option value="">None</option>
              ${state.detectedArtists.map(artist => `<option value="${artist}">${artist}</option>`).join('')}
            </select>
            <input type="text" class="gft-artist-custom" data-index="0" placeholder="Custom" 
                   style="flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px; display: none;">
            <span style="font-size: 12px; color: #666; min-width: 60px;">Normal</span>
          </div>
        </div>
        <button id="gft-add-artist" style="margin-top: 8px; padding: 6px 12px; border: 1px solid #ddd; background: #f8f8f8; border-radius: 4px; cursor: pointer; font-size: 12px;">+ Add Artist</button>
        <p style="margin: 8px 0 0 0; font-size: 11px; color: #666; line-height: 1.4;">
          Format: 1st normal, 2nd <em>italic</em>, 3rd <strong>bold</strong>, 4th normal
        </p>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button id="gft-dialog-cancel" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
        <button id="gft-dialog-insert" style="padding: 8px 16px; border: none; background: #667eea; color: white; border-radius: 4px; cursor: pointer; font-weight: 600;">Insert</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const artistInputsContainer = dialog.querySelector('#gft-artist-inputs');
    let artistCount = 1;

    // Format labels for artists (per Genius guidelines: 1st normal, 2nd italic, 3rd bold, 4th normal)
    function getFormatLabel(index) {
      if (index === 0) return 'Normal';
      if (index === 1) return '<em>Italic</em>';
      if (index === 2) return '<strong>Bold</strong>';
      return 'Normal';
    }

    // Create artist input row
    function createArtistRow(index) {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
      
      const select = document.createElement('select');
      select.className = 'gft-artist-select';
      select.dataset.index = index;
      select.style.cssText = 'flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px;';
      select.innerHTML = `<option value="">None</option>${state.detectedArtists.map(artist => `<option value="${artist}">${artist}</option>`).join('')}`;
      
      const customInput = document.createElement('input');
      customInput.type = 'text';
      customInput.className = 'gft-artist-custom';
      customInput.dataset.index = index;
      customInput.placeholder = 'Custom artist name';
      customInput.style.cssText = 'flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px; display: none;';
      
      const formatLabel = document.createElement('span');
      formatLabel.style.cssText = 'font-size: 12px; color: #666; min-width: 60px;';
      formatLabel.innerHTML = getFormatLabel(index);
      
      const removeBtn = index > 0 ? document.createElement('button') : null;
      if (removeBtn) {
        removeBtn.textContent = '×';
        removeBtn.style.cssText = 'padding: 4px 8px; border: 1px solid #ddd; background: #f8f8f8; border-radius: 4px; cursor: pointer; font-size: 16px; line-height: 1;';
        removeBtn.addEventListener('click', () => {
          row.remove();
          artistCount--;
          updateArtistRows();
        });
      }

      select.addEventListener('change', () => {
        if (select.value === '__custom__') {
          customInput.style.display = 'block';
          customInput.focus();
        } else {
          customInput.style.display = 'none';
        }
      });

      const customOption = document.createElement('option');
      customOption.value = '__custom__';
      customOption.textContent = 'Custom...';
      select.appendChild(customOption);

      row.appendChild(select);
      row.appendChild(customInput);
      row.appendChild(formatLabel);
      if (removeBtn) row.appendChild(removeBtn);
      
      return row;
    }

    function updateArtistRows() {
      const rows = artistInputsContainer.querySelectorAll('.gft-artist-select');
      rows.forEach((select, index) => {
        const label = select.parentElement.querySelector('span');
        if (label) label.innerHTML = getFormatLabel(index);
      });
    }

    // Add artist button
    dialog.querySelector('#gft-add-artist').addEventListener('click', () => {
      if (artistCount >= 4) {
        showStatus('Maximum 4 artists allowed', 'error');
        return;
      }
      artistInputsContainer.appendChild(createArtistRow(artistCount));
      artistCount++;
    });

    // Insert button
    dialog.querySelector('#gft-dialog-insert').addEventListener('click', () => {
      // Only verses get numbers per Genius.com guidelines
      const number = shouldNumber ? (parseInt(dialog.querySelector('#gft-section-number')?.value) || 1) : null;
      
      // Collect artists
      const artists = [];
      artistInputsContainer.querySelectorAll('.gft-artist-select').forEach((select, index) => {
        let artistName = '';
        if (select.value === '__custom__') {
          const customInput = select.parentElement.querySelector('.gft-artist-custom');
          artistName = customInput ? customInput.value.trim() : '';
        } else {
          artistName = select.value.trim();
        }
        
        if (artistName) {
          // Format according to Genius guidelines: 1st normal, 2nd italic, 3rd bold, 4th normal
          if (index === 1) {
            artistName = `<i>${artistName}</i>`; // Italic (using HTML tags)
          } else if (index === 2) {
            artistName = `<b>${artistName}</b>`; // Bold (using HTML tags)
          }
          artists.push(artistName);
        }
      });

      // Build tag per Genius.com guidelines: only verses are numbered
      let tag = `[${sectionType}`;
      if (shouldNumber && number) {
        tag += ` ${number}`;
      }
      if (artists.length > 0) {
        tag += `: ${artists.join(', ')}`;
      }
      tag += ']';

      insertTag(tag);
      overlay.remove();
    });

    // Cancel button
    dialog.querySelector('#gft-dialog-cancel').addEventListener('click', () => {
      overlay.remove();
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }

  // Insert tag at cursor position with smart whitespace handling
  function insertTag(tag) {
    const editor = getLyricsEditor();
    if (!editor) {
      showStatus('Could not find lyrics editor', 'error');
      return;
    }

    saveToHistory();

    // Helper function to normalize whitespace around section headers
    function normalizeWhitespaceAroundHeader(text, insertPos, tag) {
      const beforeText = text.substring(0, insertPos);
      const afterText = text.substring(insertPos);
      
      // Get the last line before insertion (excluding trailing whitespace)
      const beforeLines = beforeText.split('\n');
      const lastLineBefore = beforeLines[beforeLines.length - 1] || '';
      const hasContentBefore = beforeText.trim().length > 0;
      
      // Get the first line after insertion (excluding leading whitespace)
      const afterLines = afterText.split('\n');
      const firstLineAfter = afterLines[0] || '';
      const hasContentAfter = afterText.trim().length > 0;
      
      // Check if we're at the start of document
      const isAtStart = !hasContentBefore;
      
      // Check if we're at the end of document
      const isAtEnd = !hasContentAfter;
      
      // Check trailing newlines before insertion
      const trailingNewlinesBefore = beforeText.match(/\n+$/);
      const hasBlankLineBefore = trailingNewlinesBefore && trailingNewlinesBefore[0].length >= 2;
      
      // Check leading newlines after insertion
      const leadingNewlinesAfter = afterText.match(/^\n+/);
      const hasBlankLineAfter = leadingNewlinesAfter && leadingNewlinesAfter[0].length >= 1;
      
      // Build the insertion with proper spacing
      let insertion = '';
      
      // Add blank line before header (if not at start and there's content before)
      if (!isAtStart && hasContentBefore && !hasBlankLineBefore) {
        // Check if last line before is empty (already has blank line)
        if (lastLineBefore.trim().length > 0) {
          insertion += '\n';
        }
      }
      
      // Add the tag
      insertion += tag;
      
      // Add blank line after header (before content)
      if (!isAtEnd && hasContentAfter && !hasBlankLineAfter) {
        // Check if first line after is empty (already has blank line)
        if (firstLineAfter.trim().length > 0) {
          insertion += '\n';
        }
      } else if (!isAtEnd) {
        // If there's whitespace but no content yet, ensure one newline
        insertion += '\n';
      }
      
      // Clean up whitespace: remove trailing spaces/tabs from before, leading from after
      const cleanedBefore = beforeText.replace(/[ \t]+$/, '').replace(/\n{3,}/g, '\n\n');
      const cleanedAfter = afterText.replace(/^[ \t]+/, '').replace(/^\n{3,}/g, '\n\n');
      
      return cleanedBefore + insertion + cleanedAfter;
    }

    if (editor.contentEditable === 'true' || editor.tagName === 'DIV') {
      // ContentEditable div
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const fullText = editor.textContent || editor.innerText || '';
        
        // Get insertion position
        const preRange = range.cloneRange();
        preRange.selectNodeContents(editor);
        preRange.setEnd(range.startContainer, range.startOffset);
        const insertPos = preRange.toString().length;
        
        // Normalize whitespace
        const newText = normalizeWhitespaceAroundHeader(fullText, insertPos, tag);
        
        // Update content
        editor.textContent = newText;
        
        // Position cursor after the inserted tag
        // Find the tag in the new text (search from a position near where we inserted)
        const searchStart = Math.max(0, insertPos - 50);
        const tagIndex = newText.indexOf(tag, searchStart);
        if (tagIndex !== -1) {
          const tagEndPos = tagIndex + tag.length + 1; // +1 for newline after tag
          const textNode = editor.firstChild || editor;
          if (textNode.nodeType === Node.TEXT_NODE) {
            const newRange = document.createRange();
            const cursorPos = Math.min(tagEndPos, textNode.textContent.length);
            newRange.setStart(textNode, cursorPos);
            newRange.setEnd(textNode, cursorPos);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        }
      } else {
        // No selection, append to end
        const currentText = editor.textContent || '';
        const newText = normalizeWhitespaceAroundHeader(currentText, currentText.length, tag);
        editor.textContent = newText;
      }
    } else {
      // Textarea or input
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const text = editor.value;
      
      // Normalize whitespace
      const newText = normalizeWhitespaceAroundHeader(text, start, tag);
      
      // Calculate new cursor position
      // Find the tag in the new text (search from a position near where we inserted)
      const searchStart = Math.max(0, start - 50);
      const tagIndex = newText.indexOf(tag, searchStart);
      let newCursorPos = start + tag.length + 1; // Default fallback
      if (tagIndex !== -1) {
        newCursorPos = tagIndex + tag.length + 1; // +1 for newline after tag
      }
      
      editor.value = newText;
      editor.selectionStart = editor.selectionEnd = Math.min(newCursorPos, newText.length);
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    showStatus(`Inserted ${tag}`, 'success');
  }

  // Toggle bold/italic formatting (using HTML tags: <i>italic</i>, <b>bold</b>)
  function toggleFormatting(formatType) {
    const editor = getLyricsEditor();
    if (!editor) {
      showStatus('Could not find lyrics editor', 'error');
      return;
    }

    saveToHistory();

    let selectedText = '';
    let start = 0;
    let end = 0;

    if (editor.contentEditable === 'true' || editor.tagName === 'DIV') {
      // ContentEditable div
      const selection = window.getSelection();
      if (selection.rangeCount === 0 || selection.toString().length === 0) {
        showStatus('Please select text to format', 'error');
        return;
      }

      selectedText = selection.toString();
      const range = selection.getRangeAt(0);
      
      // Get text content to find position
      const textContent = editor.textContent || editor.innerText || '';
      const preRange = range.cloneRange();
      preRange.selectNodeContents(editor);
      preRange.setEnd(range.startContainer, range.startOffset);
      start = preRange.toString().length;
      end = start + selectedText.length;
    } else {
      // Textarea or input
      start = editor.selectionStart;
      end = editor.selectionEnd;
      selectedText = editor.value.substring(start, end);
      
      if (selectedText.length === 0) {
        showStatus('Please select text to format', 'error');
        return;
      }
    }

    // Helper function to strip HTML tags and get plain text
    function stripHtmlTags(text) {
      return text.replace(/<\/?[bi]>/gi, '').replace(/<\/?strong>/gi, '').replace(/<\/?em>/gi, '');
    }

    // Helper function to check if text is wrapped in HTML tags (as text strings)
    function isWrappedInTag(text, tagNames) {
      for (const tag of tagNames) {
        const openTag = `<${tag}>`;
        const closeTag = `</${tag}>`;
        if (text.startsWith(openTag) && text.endsWith(closeTag)) {
          return true;
        }
      }
      return false;
    }

    // Get plain text (strip any existing HTML tags)
    const plainText = stripHtmlTags(selectedText);
    
    // Check if already formatted with HTML tags (check for both <b>/<strong> and <i>/<em>)
    const isBold = isWrappedInTag(selectedText, ['b', 'strong']);
    const isItalic = isWrappedInTag(selectedText, ['i', 'em']);
    
    let newText = plainText;
    
    if (formatType === 'bold') {
      if (isBold) {
        // Already bold, remove formatting
        newText = plainText;
      } else {
        // Remove italic if present, then add bold
        if (isItalic) {
          newText = plainText;
        }
        newText = `<b>${newText}</b>`;
      }
    } else if (formatType === 'italic') {
      if (isItalic) {
        // Already italic, remove formatting
        newText = plainText;
      } else if (isBold) {
        // Can't have both, so remove bold and add italic
        newText = `<i>${plainText}</i>`;
      } else {
        // Add italic formatting
        newText = `<i>${plainText}</i>`;
      }
    }

    // Replace the selected text
    if (editor.contentEditable === 'true' || editor.tagName === 'DIV') {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        
        // Get the full text content (as plain text, HTML tags are inserted as text strings)
        const fullText = editor.textContent || editor.innerText || '';
        const preRange = range.cloneRange();
        preRange.selectNodeContents(editor);
        preRange.setEnd(range.startContainer, range.startOffset);
        const beforeText = preRange.toString();
        const afterText = fullText.substring(beforeText.length + selectedText.length);
        
        // Replace in the full text (HTML tags inserted as text strings)
        const newFullText = beforeText + newText + afterText;
        editor.textContent = newFullText;
        
        // Restore selection
        const newStart = beforeText.length;
        const newEnd = newStart + newText.length;
        const newRange = document.createRange();
        const textNode = editor.firstChild || editor;
        if (textNode.nodeType === Node.TEXT_NODE) {
          newRange.setStart(textNode, newStart);
          newRange.setEnd(textNode, newEnd);
        } else {
          // If no text node, create one
          const textNode2 = document.createTextNode(newFullText);
          editor.textContent = '';
          editor.appendChild(textNode2);
          newRange.setStart(textNode2, newStart);
          newRange.setEnd(textNode2, newEnd);
        }
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } else {
      // Textarea or input - insert HTML tags as text
      const text = editor.value;
      editor.value = text.substring(0, start) + newText + text.substring(end);
      editor.selectionStart = start;
      editor.selectionEnd = start + newText.length;
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    showStatus(`${formatType === 'bold' ? 'Bold' : 'Italic'} formatting ${isBold || isItalic ? 'removed' : 'applied'}`, 'success');
  }

  // Number all verses (per Genius.com guidelines: only verses are numbered)
  function numberAllSections() {
    const editor = getLyricsEditor();
    if (!editor) {
      showStatus('Could not find lyrics editor', 'error');
      return;
    }

    saveToHistory();

    let content = editor.contentEditable === 'true' ? editor.textContent : editor.value;
    
    // Per Genius.com guidelines: Only verses are numbered
    // Remove numbers from Chorus, Bridge, Intro, Outro if they exist
    const nonVerseSections = ['Chorus', 'Bridge', 'Intro', 'Outro'];
    nonVerseSections.forEach(sectionType => {
      const regex = new RegExp(`\\[${sectionType}\\s+\\d+(?:\\s*:\\s*[^\\]]+)?\\]`, 'gi');
      content = content.replace(regex, (match) => {
        // Remove number, keep artist if present
        const artistMatch = match.match(/:\s*([^\]]+)/);
        const artist = artistMatch ? artistMatch[1] : '';
        let newTag = `[${sectionType}`;
        if (artist) {
          newTag += `: ${artist}`;
        }
        newTag += ']';
        return newTag;
      });
    });
    
    // Number verses sequentially
    const verseRegex = /\[Verse(?:\s+\d+)?(?:\s*:\s*[^\]]+)?\]/gi;
    let verseCount = 0;
    
    content = content.replace(verseRegex, (match) => {
      // Extract existing artist if present
      const artistMatch = match.match(/:\s*([^\]]+)/);
      const artist = artistMatch ? artistMatch[1] : '';
      
      verseCount++;
      let newTag = `[Verse ${verseCount}`;
      if (artist) {
        newTag += `: ${artist}`;
      }
      newTag += ']';
      return newTag;
    });

    // Update content
    if (editor.contentEditable === 'true') {
      editor.textContent = content;
    } else {
      editor.value = content;
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    showStatus(`Numbered ${verseCount} verse(s) (per Genius.com guidelines: only verses are numbered)`, 'success');
  }

  // Correct all formatting (following Genius.com transcription guidelines)
  // Guidelines followed:
  // - Use curly apostrophes (') for contractions and possessives
  // - Use proper opening/closing quotes (" ")
  // - Capitalize first letter of each line only (avoid capitalizing every word)
  // - Preserve double line breaks for stanzas, single for regular lines
  // - Proper spacing around section tags [Chorus], [Verse], etc.
  // - Preserve unclear lyrics markers [?]
  // - Maintain accurate transcription without altering artist's wording
  function correctAll() {
    const editor = getLyricsEditor();
    if (!editor) {
      showStatus('Could not find lyrics editor', 'error');
      return;
    }

    saveToHistory();

    let content = editor.contentEditable === 'true' ? editor.textContent : editor.value;
    
    // Fix straight apostrophes to curved apostrophes (for contractions and possessives)
    // Replace apostrophes in contractions and possessives with curly apostrophe
    content = content.replace(/(\w)'(\w)/g, '$1\u2019$2'); // don't, it's, we're, etc.
    content = content.replace(/(\w)'(\s|$|,|\.|!|\?|;|:)/g, '$1\u2019$2'); // possessive endings: John's, etc.
    
    // Fix straight quotes to curved quotes (opening and closing)
    // Match pairs of quotes and convert to proper opening/closing quotes
    let quoteCount = 0;
    content = content.replace(/"/g, (match) => {
      quoteCount++;
      // Odd positions are opening quotes, even are closing
      return quoteCount % 2 === 1 ? '\u201C' : '\u201D';
    });
    
    // Fix capitalization (first letter of each line only, per Genius guidelines)
    // Genius: "avoid capitalizing every word" - only capitalize first letter of lines
    content = content.split('\n').map(line => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return line; // Preserve empty lines
      
      // Don't modify section tags
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) return line;
      
      // Don't modify lines that start with [?] (unclear lyrics marker)
      if (trimmed.startsWith('[?]')) return line;
      
      // Find first non-whitespace character and capitalize it
      const firstCharIndex = line.search(/\S/);
      if (firstCharIndex === -1) return line;
      
      // Preserve leading whitespace, capitalize first letter
      return line.substring(0, firstCharIndex) + 
             line.charAt(firstCharIndex).toUpperCase() + 
             line.substring(firstCharIndex + 1);
    }).join('\n');
    
    // Fix multiple spaces (but preserve intentional spacing)
    content = content.replace(/[ \t]+/g, ' '); // Replace multiple spaces/tabs with single space
    content = content.replace(/[ \t]+\n/g, '\n'); // Remove trailing spaces before line breaks
    content = content.replace(/\n[ \t]+/g, '\n'); // Remove leading spaces after line breaks
    
    // Fix spacing around brackets (section tags)
    // Ensure proper spacing: [Tag] should have space before if not start of line
    content = content.replace(/([^\s\n])\[/g, '$1 ['); // Add space before [ if needed
    content = content.replace(/\]\s*([^\s\n])/g, '] $1'); // Ensure space after ] if needed
    // But don't add space if bracket is at start of line
    content = content.replace(/^\s*\[/gm, '['); // Remove leading space before [ at line start
    
    // Normalize line breaks (preserve double breaks for stanzas, single for regular lines)
    content = content.replace(/\r\n/g, '\n'); // Normalize Windows line breaks
    content = content.replace(/\r/g, '\n'); // Normalize Mac line breaks
    content = content.replace(/\n{3,}/g, '\n\n'); // More than 2 line breaks becomes 2 (stanza break)

    // Update content
    if (editor.contentEditable === 'true') {
      editor.textContent = content;
    } else {
      editor.value = content;
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    showStatus('All corrections applied per Genius.com guidelines!', 'success');
  }

  // Check for unclosed brackets
  function checkBrackets() {
    const editor = getLyricsEditor();
    if (!editor) {
      showStatus('Could not find lyrics editor', 'error');
      return;
    }

    const content = editor.contentEditable === 'true' ? editor.textContent : editor.value;
    
    // Check parentheses
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    
    // Check square brackets
    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/\]/g) || []).length;
    
    const errors = [];
    if (openParens !== closeParens) {
      errors.push(`${Math.abs(openParens - closeParens)} unclosed parentheses`);
    }
    if (openBrackets !== closeBrackets) {
      errors.push(`${Math.abs(openBrackets - closeBrackets)} unclosed brackets`);
    }
    
    if (errors.length === 0) {
      showStatus('✓ All brackets are properly closed', 'success');
    } else {
      showStatus('⚠ ' + errors.join(', '), 'error');
    }
  }

  // Control YouTube video
  function controlYouTube(action) {
    // Find YouTube iframes - Genius.com typically uses youtube-nocookie.com
    const iframes = document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtu.be"], iframe[src*="youtube-nocookie.com"]');
    
    if (iframes.length === 0) {
      showStatus('No YouTube video found on page', 'error');
      return;
    }

    let success = false;
    const iframe = iframes[0]; // Use first iframe

    try {
      // Extract video ID from iframe src if needed
      const src = iframe.src || iframe.getAttribute('src') || '';
      
      // Method 1: YouTube IFrame API postMessage (most reliable)
      let origin = '*';
      try {
        if (src) {
          origin = new URL(src).origin;
        }
      } catch (e) {
        // If URL parsing fails, use wildcard
        origin = '*';
      }
      
      let message;
      if (action === 'play') {
        message = JSON.stringify({ event: 'command', func: 'playVideo', args: '' });
      } else if (action === 'pause') {
        message = JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' });
      } else if (action === 'rewind') {
        message = JSON.stringify({ event: 'command', func: 'seekBy', args: -5 });
      } else if (action === 'forward') {
        message = JSON.stringify({ event: 'command', func: 'seekBy', args: 5 });
      }

      // Send message to iframe - try both specific origin and wildcard
      if (origin !== '*') {
        iframe.contentWindow.postMessage(message, origin);
      }
      iframe.contentWindow.postMessage(message, '*');
      success = true;

      // Method 2: Try to find and click video controls (fallback)
      // This won't work due to cross-origin restrictions, but we try anyway
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          const video = iframeDoc.querySelector('video');
          if (video) {
            if (action === 'play') {
              video.play().then(() => success = true);
            } else if (action === 'pause') {
              video.pause();
              success = true;
            } else if (action === 'rewind') {
              video.currentTime = Math.max(0, video.currentTime - 5);
              success = true;
            } else if (action === 'forward') {
              video.currentTime = Math.min(video.duration, video.currentTime + 5);
              success = true;
            }
          }
        }
      } catch (e) {
        // Cross-origin restriction expected - this is normal
      }

    } catch (e) {
      console.error('YouTube control error:', e);
    }

    if (success) {
      showStatus(`YouTube: ${action}`, 'success');
    } else {
      showStatus('YouTube control sent. If it doesn\'t work, click the video first to activate it.', 'info');
    }
  }

  // History management
  function saveToHistory() {
    const editor = getLyricsEditor();
    if (!editor) return;

    const content = editor.contentEditable === 'true' ? editor.textContent : editor.value;
    
    // Remove old history if we're in the middle
    if (state.historyIndex < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIndex + 1);
    }
    
    // Add to history
    state.history.push(content);
    
    // Limit history size
    if (state.history.length > state.maxHistorySize) {
      state.history.shift();
    } else {
      state.historyIndex++;
    }
    
    // Update buttons
    updateHistoryButtons();
  }

  function undo() {
    if (state.historyIndex <= 0) {
      showStatus('Nothing to undo', 'error');
      return;
    }

    const editor = getLyricsEditor();
    if (!editor) return;

    state.historyIndex--;
    const content = state.history[state.historyIndex];
    
    if (editor.contentEditable === 'true') {
      editor.textContent = content;
    } else {
      editor.value = content;
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    updateHistoryButtons();
    showStatus('Undone', 'success');
  }

  function redo() {
    if (state.historyIndex >= state.history.length - 1) {
      showStatus('Nothing to redo', 'error');
      return;
    }

    const editor = getLyricsEditor();
    if (!editor) return;

    state.historyIndex++;
    const content = state.history[state.historyIndex];
    
    if (editor.contentEditable === 'true') {
      editor.textContent = content;
    } else {
      editor.value = content;
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    updateHistoryButtons();
    showStatus('Redone', 'success');
  }

  function updateHistoryButtons() {
    document.getElementById('gft-undo').disabled = state.historyIndex <= 0;
    document.getElementById('gft-redo').disabled = state.historyIndex >= state.history.length - 1;
  }

  // Keyboard shortcuts
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Only work when not typing in input fields (but allow in editor)
      const isInDialog = document.getElementById('gft-section-dialog');
      if (!isInDialog && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true')) {
        // Ctrl+1-5 for tags (opens dialog)
        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '5') {
          e.preventDefault();
          const sections = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro'];
          showSectionDialog(sections[parseInt(e.key) - 1]);
        }
        
        // Ctrl+Shift+C for correct all
        if (e.ctrlKey && e.shiftKey && e.key === 'C') {
          e.preventDefault();
          correctAll();
        }
        
        // Ctrl+Z for undo
        if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
          e.preventDefault();
          undo();
        }
        
        // Ctrl+Y for redo
        if (e.ctrlKey && !e.shiftKey && e.key === 'y') {
          e.preventDefault();
          redo();
        }

        // Ctrl+B for bold
        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'b') {
          e.preventDefault();
          toggleFormatting('bold');
        }

        // Ctrl+I for italic
        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'i') {
          e.preventDefault();
          toggleFormatting('italic');
        }
      }
      
      // Ctrl+Alt+Space for YouTube play/pause
      if (e.ctrlKey && e.altKey && e.key === ' ') {
        e.preventDefault();
        controlYouTube('play');
      }
      
      // Ctrl+Alt+Arrow keys for YouTube seek
      if (e.ctrlKey && e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        controlYouTube('rewind');
      }
      if (e.ctrlKey && e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        controlYouTube('forward');
      }
    });
  }

  // Helper function to safely check if chrome.storage is available
  function isStorageAvailable() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        return false;
      }
      // Check if runtime context is still valid by trying to access runtime.id
      // This will throw if the extension context is invalidated
      if (chrome.runtime) {
        try {
          const id = chrome.runtime.id;
          if (!id) return false;
        } catch (e) {
          // Extension context invalidated
          return false;
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  // Auto-save draft
  function setupAutoSave() {
    const editor = getLyricsEditor();
    if (!editor) return;

    const saveDraft = () => {
      if (!isStorageAvailable()) {
        return; // Extension context invalidated, skip saving silently
      }

      try {
        const content = editor.contentEditable === 'true' ? editor.textContent : editor.value;
        const url = window.location.href;
        
        // Double-check before calling storage API
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
          return;
        }
        
        chrome.storage.local.set({
          [`draft_${url}`]: {
            content,
            timestamp: Date.now()
          }
        }, () => {
          // Check for errors in callback
          if (chrome.runtime && chrome.runtime.lastError) {
            // Silently ignore - extension context likely invalidated
            return;
          }
        });
      } catch (e) {
        // Silently ignore storage errors (extension context invalidated)
        // Don't log to avoid cluttering console
        return;
      }
    };

    // Save on input
    editor.addEventListener('input', saveDraft);
    
    // Save periodically
    setInterval(saveDraft, 30000); // Every 30 seconds
  }

  // Load draft
  function loadDraft() {
    if (!isStorageAvailable()) {
      return; // Extension context invalidated, skip loading
    }

    try {
      const url = window.location.href;
      
      // Double-check before calling storage API
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        return;
      }
      
      chrome.storage.local.get([`draft_${url}`], (result) => {
        // Check for errors in callback
        if (chrome.runtime && chrome.runtime.lastError) {
          // Silently ignore - extension context likely invalidated
          return;
        }

        const draft = result[`draft_${url}`];
        if (draft && draft.content) {
          const editor = getLyricsEditor();
          if (editor) {
            if (editor.contentEditable === 'true') {
              editor.textContent = draft.content;
            } else {
              editor.value = draft.content;
            }
            showStatus('Draft restored', 'success');
          }
        }
      });
    } catch (e) {
      // Silently ignore storage errors (extension context invalidated)
      return;
    }
  }

  // Detect artists on page
  function detectArtists() {
    const artists = new Set();
    
    // Helper function to validate artist name
    function isValidArtistName(text) {
      if (!text || typeof text !== 'string') return false;
      
      const trimmed = text.trim();
      
      // Must be reasonable length (1-50 characters)
      if (trimmed.length < 1 || trimmed.length > 50) return false;
      
      // Must not contain HTML tags
      if (trimmed.match(/<[^>]+>/)) return false;
      
      // Must not contain URLs
      if (trimmed.match(/https?:\/\//)) return false;
      
      // Must not contain image tags or other HTML entities
      if (trimmed.match(/&[a-z]+;/i)) return false;
      
      // Must not be common navigation/footer text
      const excludedTerms = [
        'Artists', 'More', 'View', 'All', 'Charts', 'Videos', 'Promote', 
        'Forums', 'Add A Song', 'Feed', 'Messages', 'Earn IQ', 'Genius',
        'Stay With You Lyrics', 'Contributor', 'Viewer', 'Following',
        'Manage Lyrics', 'Edit Metadata', 'Admin'
      ];
      if (excludedTerms.some(term => trimmed.toLowerCase() === term.toLowerCase())) {
        return false;
      }
      
      // Must contain at least one letter
      if (!trimmed.match(/[a-zA-Z]/)) return false;
      
      // Must not be mostly numbers or special characters
      const letterRatio = (trimmed.match(/[a-zA-Z]/g) || []).length / trimmed.length;
      if (letterRatio < 0.5) return false;
      
      return true;
    }
    
    // Method 1: Look for artist name in song header area (most reliable)
    try {
      // Look for the main artist name near the song title
      const songHeader = document.querySelector('[class*="SongHeader"]') || 
                        document.querySelector('[class*="Header"]') ||
                        document.querySelector('h1')?.closest('div');
      
      if (songHeader) {
        // Find artist links within the header area only
        const headerArtistLinks = songHeader.querySelectorAll('a[href*="/artists/"]');
        headerArtistLinks.forEach(link => {
          const text = link.textContent?.trim();
          if (isValidArtistName(text)) {
            artists.add(text);
          }
        });
        
        // Also check for artist text in header (not just links)
        const headerText = songHeader.textContent || '';
        const artistMatch = headerText.match(/(?:by|artist|performed by)[:\s]+([A-Z][a-zA-Z\s&]+)/i);
        if (artistMatch && artistMatch[1]) {
          const artistName = artistMatch[1].trim();
          if (isValidArtistName(artistName)) {
            artists.add(artistName);
          }
        }
      }
    } catch (e) {
      // Ignore
    }
    
    // Method 2: Look for specific Genius.com data attributes
    try {
      const artistElements = document.querySelectorAll('[data-testid="artist-name"], [class*="Artist"][class*="Name"]');
      artistElements.forEach(el => {
        const text = el.textContent?.trim();
        if (isValidArtistName(text)) {
          artists.add(text);
        }
      });
    } catch (e) {
      // Ignore
    }
    
    // Method 3: Extract from page title (usually reliable)
    try {
      const pageTitle = document.title;
      // Format: "Song Name - Artist Name | Genius Lyrics"
      const titleMatch = pageTitle.match(/(.+?)\s*[-–—]\s*([^-|]+?)\s*[|]/i);
      if (titleMatch && titleMatch[2]) {
        const artistName = titleMatch[2].trim();
        if (isValidArtistName(artistName)) {
          artists.add(artistName);
        }
      }
    } catch (e) {
      // Ignore
    }
    
    // Method 4: Look for featured artists in lyrics area only
    try {
      const lyricsArea = document.querySelector('[class*="lyrics"]') || 
                        document.querySelector('[contenteditable="true"]') ||
                        document.querySelector('textarea');
      if (lyricsArea) {
        const lyricsText = lyricsArea.textContent || '';
        const featMatch = lyricsText.match(/\[.*?feat\.?\s+([^\]]+)\]/i);
        if (featMatch && featMatch[1]) {
          const featArtist = featMatch[1].trim();
          if (isValidArtistName(featArtist)) {
            artists.add(featArtist);
          }
        }
      }
    } catch (e) {
      // Ignore
    }

    // Convert to array and limit
    state.detectedArtists = Array.from(artists).slice(0, 10);
    
    // Update UI
    const artistDisplay = document.getElementById('gft-artists-display');
    const artistList = document.getElementById('gft-artist-list');
    if (artistDisplay && artistList) {
      if (state.detectedArtists.length > 0) {
        artistDisplay.textContent = state.detectedArtists.join(', ');
        artistList.style.display = 'block';
      } else {
        artistDisplay.textContent = 'None detected';
        artistList.style.display = 'block';
      }
    }

    return state.detectedArtists;
  }

  // Toggle panel visibility
  function togglePanel() {
    const panel = document.getElementById('genius-transcriber-panel');
    const content = document.getElementById('gft-content');
    const btn = document.getElementById('gft-toggle-panel');
    
    if (content.style.display === 'none') {
      content.style.display = 'block';
      btn.textContent = '−';
      
      // Always force bottom anchoring when opening (so header stays accessible)
      panel.style.top = 'auto';
      panel.style.left = 'auto';
      panel.style.bottom = '20px';
      panel.style.right = '20px';
      applyPanelAnchor(panel);
      clampOrResetPosition(panel);
    } else {
      content.style.display = 'none';
      btn.textContent = '+';
    }
  }

  // Decide whether to anchor top or bottom and adjust layout (header position)
  function applyPanelAnchor(panel) {
    const cs = window.getComputedStyle(panel);
    const topVal = cs.top;
    const bottomVal = cs.bottom;
    const topNum = parseInt(topVal, 10);
    const bottomNum = parseInt(bottomVal, 10);

    const hasBottom = bottomVal !== 'auto' && !isNaN(bottomNum);
    const hasTop = topVal !== 'auto' && !isNaN(topNum);

    // Prefer bottom anchor if it exists and is closer than top, otherwise top
    const useBottom = hasBottom && (!hasTop || bottomNum <= topNum);

    panel.classList.remove('anchor-top', 'anchor-bottom');
    if (useBottom) {
      panel.classList.add('anchor-bottom');
      // Ensure top is cleared when bottom-anchored
      panel.style.top = 'auto';
    } else {
      panel.classList.add('anchor-top');
      // Ensure bottom is cleared when top-anchored
      panel.style.bottom = 'auto';
    }
  }

  // Keep panel within viewport bounds to avoid it going off-screen
  function ensurePanelWithinViewport(panel) {
    const rect = panel.getBoundingClientRect();

    // Horizontal bounds
    if (rect.right > window.innerWidth - 10) {
      const newRight = Math.max(10, window.innerWidth - rect.width - 10);
      panel.style.right = `${newRight}px`;
      panel.style.left = 'auto';
    } else if (rect.left < 0) {
      panel.style.left = '10px';
      panel.style.right = 'auto';
    }

    // Vertical bounds
    if (rect.bottom > window.innerHeight - 10) {
      const newBottom = Math.max(10, window.innerHeight - rect.height - 10);
      panel.style.bottom = `${newBottom}px`;
      panel.style.top = 'auto';
    } else if (rect.top < 0) {
      panel.style.top = '10px';
      panel.style.bottom = 'auto';
    }
  }

  // Reset to bottom-right if off-screen after clamping
  function clampOrResetPosition(panel) {
    ensurePanelWithinViewport(panel);
    const rect = panel.getBoundingClientRect();
    const outOfView =
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth;
    if (outOfView) {
      panel.style.top = 'auto';
      panel.style.left = 'auto';
      panel.style.bottom = '20px';
      panel.style.right = '20px';
      applyPanelAnchor(panel);
      ensurePanelWithinViewport(panel);
    }
  }

  // Show status message
  function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('gft-status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `gft-status gft-status-${type}`;
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'gft-status';
      }, 3000);
    }
  }

  // Initialize function with retry logic
  function initializeWithRetry(retries = 5) {
    if (document.body && document.body.querySelector) {
      init();
    } else if (retries > 0) {
      setTimeout(() => initializeWithRetry(retries - 1), 500);
    } else {
      console.error('Genius Transcription Assistant: Could not initialize - body not ready');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initializeWithRetry, 500);
    });
  } else {
    setTimeout(initializeWithRetry, 500);
  }

  // Re-initialize on navigation (for SPAs like Genius.com)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // Remove old panel if it exists
      const oldPanel = document.getElementById('genius-transcriber-panel');
      if (oldPanel) {
        oldPanel.remove();
      }
      // Re-initialize after navigation
      setTimeout(() => initializeWithRetry(), 1000);
    }
  });
  
  // Observe for URL changes
  observer.observe(document, { subtree: true, childList: true });
  
  // Also listen for popstate (back/forward navigation)
  window.addEventListener('popstate', () => {
    setTimeout(() => initializeWithRetry(), 500);
  });

})();

