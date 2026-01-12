# Local Python Transcription Server Setup

The extension uses a local Python server with **transcribe-anything in INSANE mode** for blazingly fast GPU-accelerated transcription when YouTube captions aren't available.

## Quick Start

1. **Install Python dependencies:**
   ```bash
   pip install transcribe-anything flask flask-cors
   ```

   That's it! `transcribe-anything` includes everything needed (Whisper, yt-dlp, etc.) and runs in an isolated environment.

2. **Start the server:**
   ```bash
   python transcription_server.py
   ```

   The server will start on `http://localhost:8765` by default.

3. **Use the extension:**
   - Open the extension popup
   - Go to the "Transcribe" tab
   - Click "⚙️ Settings"
   - Make sure "Use local server" is checked
   - Click "Test Connection" to verify it's working
   - Now fetch transcripts - it will automatically use the local server when YouTube captions aren't available!

## How It Works

1. Extension tries YouTube captions first (instant, if available)
2. If no captions, automatically falls back to your local Python server
3. Server uses **transcribe-anything in INSANE mode** for GPU-accelerated transcription
4. Downloads audio from YouTube and transcribes using blazingly fast [insanely-fast-whisper](https://github.com/Vaibhavs10/insanely-fast-whisper) backend
5. Returns formatted transcript to the extension

## Performance

- **INSANE mode**: Uses GPU acceleration automatically (CUDA on Windows/Linux, MLX on Mac)
- **Speed**: Up to 10x faster than standard Whisper implementations
- **Models**: Supports tiny, base, small, medium, large, large-v2, large-v3
- **Languages**: Auto-detects or specify language code (en, es, fr, etc.)

## Configuration

- **Port**: Default is 8765. Change in extension settings if needed.
- **Model**: Currently uses 'base' model. Edit `transcription_server.py` to change.
- **Language**: Set in extension popup (defaults to English)

## Troubleshooting

**Server won't start:**
- Make sure Python 3.7+ is installed
- Install dependencies: `pip install transcribe-anything flask flask-cors`
- Check if port 8765 is already in use

**"Cannot connect to server" error:**
- Make sure `transcription_server.py` is running
- Check the port matches in extension settings
- Try clicking "Test Connection" button

**Transcription is slow:**
- INSANE mode should be fast! If slow, check GPU availability:
  - Windows/Linux: Needs NVIDIA GPU with CUDA
  - Mac: Use `--device mlx` for Apple Silicon acceleration
- Use a smaller model (edit `model='tiny'` or `model='base'` in the code)
- Larger models (medium, large) are more accurate but slower

**GPU not detected:**
- INSANE mode falls back to CPU if GPU unavailable
- For Mac: The server will use MLX backend automatically if available
- Check GPU with: `nvidia-smi` (Windows/Linux) or check Activity Monitor (Mac)

**yt-dlp errors:**
- `transcribe-anything` includes yt-dlp automatically
- Some videos may be region-locked or unavailable
- Update: `pip install --upgrade transcribe-anything`

## Alternative: AssemblyAI API

If you prefer not to run a local server, you can use AssemblyAI's cloud API:
1. Get a free API key at https://www.assemblyai.com/
2. Add it in extension settings
3. Uncheck "Use local server"

The extension will try local server first, then fall back to AssemblyAI if configured.
