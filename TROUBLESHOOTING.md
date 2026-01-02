# Troubleshooting Guide

## Panel Not Showing?

### Step 1: Reload the Extension
1. Go to `chrome://extensions/` (or `edge://extensions/`)
2. Find "Genius Transcription Assistant"
3. Click the refresh/reload icon 🔄
4. Make sure the extension is **enabled** (toggle should be ON)

### Step 2: Reload the Genius.com Page
1. Go to any Genius.com song page (e.g., `https://genius.com/artist-song-name`)
2. Press `F5` or `Ctrl+R` to reload the page
3. Wait 2-3 seconds for the panel to appear

### Step 3: Check Browser Console
1. Press `F12` to open Developer Tools
2. Click the "Console" tab
3. Look for messages starting with "Genius Transcription Assistant"
4. If you see errors, note them down

### Step 4: Verify Extension is Active
1. Click the extension icon in your browser toolbar
2. You should see the popup with instructions
3. If the popup doesn't appear, the extension may not be installed correctly

### Step 5: Check Page URL
- Make sure you're on a Genius.com page (not another site)
- The URL should start with `https://genius.com/` or `https://www.genius.com/`

### Step 6: Manual Panel Check
1. Open browser console (F12)
2. Type: `document.getElementById('genius-transcriber-panel')`
3. If it returns `null`, the panel wasn't created
4. If it returns an element, the panel exists but might be hidden

### Common Issues:

**Issue: "Extension not loading"**
- Solution: Make sure you selected the correct folder when loading unpacked
- The folder should contain `manifest.json`, `content.js`, etc.

**Issue: "Panel appears but is invisible"**
- Solution: Check if you have any browser extensions that block elements
- Try disabling other extensions temporarily

**Issue: "Script errors in console"**
- Solution: Check the error message
- Common causes: Page structure changed, JavaScript conflicts

**Issue: "Panel appears but buttons don't work"**
- Solution: Reload the page after the panel appears
- Check console for JavaScript errors

### Still Not Working?

1. Check that all files are present:
   - manifest.json
   - content.js
   - styles.css
   - popup.html
   - icon16.png, icon48.png, icon128.png

2. Verify manifest.json is valid JSON (no syntax errors)

3. Try a different Genius.com page

4. Check if the page is fully loaded before the script runs
