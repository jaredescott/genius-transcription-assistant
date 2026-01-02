# Genius Transcription Assistant

A Chrome/Edge extension to help you transcribe lyrics faster on Genius.com. Features smart tags, auto-corrections, YouTube controls, and more!

## Features

### 🏗️ Smart Structure & Tags
- **Section Tags with Numbering**: Insert `[Intro]`, `[Verse 1]`, `[Chorus 2]`, `[Bridge]`, `[Outro]` with automatic numbering
- **Multiple Artist Support**: Add up to 4 artists per section with proper formatting:
  - 1st artist: Normal text
  - 2nd artist: *Italic* (automatically formatted)
  - 3rd artist: **Bold** (automatically formatted)
  - 4th artist: Normal text
- **Auto Artist Detection**: Automatically detects artists from the Genius.com page
- **Number All Sections**: Automatically numbers all Verse, Chorus, and Bridge sections

### ✨ Professional Corrections
- **Correct All**: Instantly fixes typography (straight apostrophes to curved '), capitalization, and spacing errors per Genius.com guidelines
- **Bracket Checker**: Highlights unclosed parentheses `()` or brackets `[]` to catch syntax errors

### 🎨 Text Formatting
- **Bold/Italic Buttons**: Easy-to-use buttons for formatting text
- **Toggle Formatting**: Select text and click Bold/Italic buttons or use `Ctrl+B` / `Ctrl+I` to toggle formatting
- **Genius.com Compatible**: Uses markdown format (`*italic*` and `**bold**`) as per Genius.com standards

### 📺 YouTube Control Center
- Control the music video without leaving the lyrics editor
- Play/Pause, Rewind/Forward 5 seconds
- Works with privacy-enhanced (nocookie) players

### 🛡️ History & Drafts
- **Undo/Redo**: Visual history of your last 10 actions
- **Auto-Save**: Your work is saved locally. Browser crash? No problem, your lyrics are restored
- **Privacy First**: No data is sent to external servers. Everything happens in your browser

## Keyboard Shortcuts

- `Ctrl + 1-5`: Insert structure tags (Intro, Verse, Chorus, Bridge, Outro) - opens dialog for numbering and artist selection
- `Ctrl + B`: Toggle bold formatting (**bold**)
- `Ctrl + I`: Toggle italic formatting (*italic*)
- `Ctrl + Shift + C`: Correct all formatting
- `Ctrl + Z`: Undo
- `Ctrl + Y`: Redo
- `Ctrl + Alt + Space`: YouTube play/pause
- `Ctrl + Alt + ←/→`: YouTube seek ±5 seconds

## Installation

### For Chrome:
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `genius-transcription-assistant` folder
5. The extension is now installed!

### For Edge:
1. Open Edge and navigate to `edge://extensions/`
2. Enable "Developer mode" (toggle in bottom left)
3. Click "Load unpacked"
4. Select the `genius-transcription-assistant` folder
5. The extension is now installed!

## Usage

1. Navigate to any song page on Genius.com (e.g., `https://genius.com/artist-song-name`)
2. The extension panel will appear on the right side of the page
3. Click the buttons or use keyboard shortcuts to speed up your transcription!

## How It Works

The extension injects a control panel into Genius.com pages that provides:
- Quick access to common formatting tags
- One-click corrections for common formatting issues
- YouTube video controls for easy reference
- Local history and auto-save functionality

All data is stored locally in your browser - nothing is sent to external servers.

## Development

To modify the extension:
1. Edit the files in this directory
2. Go to `chrome://extensions/` or `edge://extensions/`
3. Click the refresh icon on the extension card
4. Reload the Genius.com page to see changes

### File Structure
- `manifest.json` - Extension configuration
- `content.js` - Main extension logic
- `styles.css` - Extension panel styling
- `popup.html` - Extension popup (click extension icon)
- `icon*.png` - Extension icons

## Notes

- The extension works best on Genius.com song pages with editable lyrics
- Some features may require the page to have specific elements (like YouTube embeds)
- Drafts are saved per URL, so each song page has its own draft

## Acknowledgments

This extension was inspired in part by [Genius Fast Transcriber + Lyric Card Maker](https://chromewebstore.google.com/detail/genius-fast-transcriber-+/cbldlkiakadclpjfkkafpjomilmmgdjm) by Lnkhey.

## License

Free to use and modify!
