#!/usr/bin/env python3
"""
Local Transcription Server for Genius Transcription Assistant
Uses transcribe-anything in INSANE mode for blazingly fast GPU transcription
Based on: https://github.com/zackees/transcribe-anything
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import sys
import os
import json
import tempfile
import shutil
from pathlib import Path

app = Flask(__name__)
CORS(app)  # Allow browser extension to access

# Configuration
DEFAULT_PORT = 8765
SUPPORTED_MODELS = ['tiny', 'base', 'small', 'medium', 'large', 'large-v2', 'large-v3', 'distil-whisper/distil-large-v2']

def install_dependencies():
    """Install missing dependencies"""
    print("Installing missing dependencies...")
    dependencies = ['transcribe-anything', 'flask', 'flask-cors']
    
    for dep in dependencies:
        try:
            print(f"Installing {dep}...")
            result = subprocess.run(
                [sys.executable, '-m', 'pip', 'install', '--quiet', dep],
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            if result.returncode == 0:
                print(f"✓ {dep} installed successfully")
            else:
                print(f"✗ Failed to install {dep}: {result.stderr}")
                return False
        except Exception as e:
            print(f"✗ Error installing {dep}: {e}")
            return False
    
    print("All dependencies installed!")
    return True

def check_dependencies():
    """Check if dependencies are installed, install if missing"""
    # Check Flask
    try:
        import flask
        import flask_cors
    except ImportError:
        print("Flask dependencies missing, installing...")
        if not install_dependencies():
            return False, None
    
    # Check transcribe-anything
    try:
        # Try importing the Python API
        from transcribe_anything import transcribe
        return True, 'transcribe-anything'
    except ImportError:
        pass
    
    try:
        # Check for CLI version
        result = subprocess.run(['transcribe-anything', '--version'], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            return True, 'transcribe-anything-cli'
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    # If not found, try installing
    print("transcribe-anything not found, installing...")
    if install_dependencies():
        # Try again after installation
        try:
            from transcribe_anything import transcribe
            return True, 'transcribe-anything'
        except ImportError:
            try:
                result = subprocess.run(['transcribe-anything', '--version'], 
                                      capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    return True, 'transcribe-anything-cli'
            except:
                pass
    
    return False, None

def transcribe_with_transcribe_anything(youtube_url, model='base', language='en', use_insane=True):
    """Transcribe using transcribe-anything in insane mode for maximum speed"""
    try:
        # Try Python API first (preferred)
        try:
            from transcribe_anything import transcribe
            
            print(f"Transcribing {youtube_url} using transcribe-anything (insane mode)")
            
            with tempfile.TemporaryDirectory() as tmpdir:
                # Use transcribe-anything Python API
                device = 'insane' if use_insane else 'cuda'
                
                output_file = transcribe(
                    url_or_file=youtube_url,
                    output_dir=tmpdir,
                    model=model,
                    task='transcribe',
                    language=language if language != 'auto' else None,
                    device=device,
                    other_args=['--verbose'] if use_insane else None
                )
                
                # Find output files
                output_path = Path(tmpdir)
                
                # Look for JSON output (most reliable)
                json_files = list(output_path.glob('*.json'))
                if json_files:
                    with open(json_files[0], 'r', encoding='utf-8') as f:
                        transcript_data = json.load(f)
                else:
                    # Fallback: look for text file
                    txt_files = list(output_path.glob('*.txt'))
                    if txt_files:
                        with open(txt_files[0], 'r', encoding='utf-8') as f:
                            full_text = f.read()
                        transcript_data = {'text': full_text, 'segments': []}
                    else:
                        raise Exception("No output files found")
                
                # Format transcript
                segments = []
                full_text = ''
                
                if 'segments' in transcript_data and transcript_data['segments']:
                    # Use segments if available
                    current_line = ''
                    last_end = 0
                    
                    for segment in transcript_data['segments']:
                        start = segment.get('start', 0)
                        end = segment.get('end', 0)
                        text = segment.get('text', '').strip()
                        
                        if not text:
                            continue
                        
                        gap = start - last_end
                        ends_with_punctuation = current_line and current_line.strip()[-1] in '.!?'
                        
                        if current_line and (gap > 1.5 or ends_with_punctuation):
                            full_text += current_line.strip() + '\n'
                            current_line = ''
                        
                        current_line += (current_line and ' ' or '') + text
                        last_end = end
                        
                        segments.append({
                            'start': start,
                            'duration': end - start,
                            'text': text
                        })
                    
                    if current_line.strip():
                        full_text += current_line.strip()
                else:
                    # Fallback: use text directly
                    full_text = transcript_data.get('text', '')
                    if not full_text:
                        raise Exception("No transcript text found")
                
                return {
                    'text': full_text,
                    'segments': segments,
                    'language': transcript_data.get('language', language),
                    'isAutoGenerated': True,
                    'source': 'transcribe-anything-insane' if use_insane else 'transcribe-anything'
                }
                
        except ImportError:
            # Fallback to CLI if Python API not available
            print("Python API not available, using CLI...")
            return transcribe_with_transcribe_anything_cli(youtube_url, model, language, use_insane)
            
    except Exception as e:
        raise Exception(f"transcribe-anything failed: {str(e)}")

def transcribe_with_transcribe_anything_cli(youtube_url, model='base', language='en', use_insane=True):
    """Transcribe using transcribe-anything CLI (fallback)"""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            output_file = os.path.join(tmpdir, 'transcript.json')
            
            # Build command with insane mode
            cmd = [
                'transcribe-anything',
                youtube_url,
                '--output', output_file,
                '--model', model
            ]
            
            if use_insane:
                cmd.extend(['--device', 'insane'])
            
            if language != 'auto':
                cmd.extend(['--language', language])
            
            print(f"Running: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
            
            if result.returncode != 0:
                raise Exception(f"transcribe-anything failed: {result.stderr}")
            
            # Read transcript
            json_files = list(Path(tmpdir).glob('*.json'))
            if not json_files:
                raise Exception("Transcript file not created")
            
            with open(json_files[0], 'r', encoding='utf-8') as f:
                transcript_data = json.load(f)
            
            # Format transcript
            segments = []
            full_text = ''
            current_line = ''
            last_end = 0
            
            for segment in transcript_data.get('segments', []):
                start = segment.get('start', 0)
                end = segment.get('end', 0)
                text = segment.get('text', '').strip()
                
                if not text:
                    continue
                
                gap = start - last_end
                ends_with_punctuation = current_line and current_line.strip()[-1] in '.!?'
                
                if current_line and (gap > 1.5 or ends_with_punctuation):
                    full_text += current_line.strip() + '\n'
                    current_line = ''
                
                current_line += (current_line and ' ' or '') + text
                last_end = end
                
                segments.append({
                    'start': start,
                    'duration': end - start,
                    'text': text
                })
            
            if current_line.strip():
                full_text += current_line.strip()
            
            return {
                'text': full_text,
                'segments': segments,
                'language': transcript_data.get('language', language),
                'isAutoGenerated': True,
                'source': 'transcribe-anything-insane' if use_insane else 'transcribe-anything'
            }
            
    except Exception as e:
        raise Exception(f"transcribe-anything CLI failed: {str(e)}")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    has_deps, dep_type = check_dependencies()
    return jsonify({
        'status': 'ok' if has_deps else 'error',
        'dependencies': dep_type,
        'message': 'Server is running' if has_deps else 'Missing dependencies'
    })

@app.route('/transcribe', methods=['POST'])
def transcribe():
    """Transcribe YouTube video"""
    try:
        data = request.json
        youtube_url = data.get('url')
        model = data.get('model', 'base')
        language = data.get('language', 'en')
        
        print(f"\n{'='*60}")
        print(f"TRANSCRIPTION REQUEST RECEIVED")
        print(f"{'='*60}")
        print(f"URL: {youtube_url}")
        print(f"Model: {model}")
        print(f"Language: {language}")
        
        if not youtube_url:
            print("ERROR: No YouTube URL provided")
            return jsonify({'error': 'YouTube URL is required'}), 400
        
        if model not in SUPPORTED_MODELS:
            model = 'base'
            print(f"Model not in supported list, using 'base'")
        
        # Check dependencies
        print("\nChecking dependencies...")
        has_deps, dep_type = check_dependencies()
        if not has_deps:
            print("ERROR: Dependencies not found")
            return jsonify({
                'error': 'transcribe-anything not found. Install: pip install transcribe-anything'
            }), 500
        
        print(f"✓ Dependencies OK (using {dep_type})")
        
        # Check if insane mode should be used (default: yes for speed)
        use_insane = data.get('use_insane', True)
        print(f"INSANE mode: {use_insane}")
        
        print(f"\nStarting transcription...")
        print(f"This may take a few minutes depending on video length...")
        
        # Always use transcribe-anything (with insane mode for GPU acceleration)
        result = transcribe_with_transcribe_anything(youtube_url, model, language, use_insane)
        
        print(f"\n✓ Transcription completed successfully!")
        print(f"Text length: {len(result.get('text', ''))} characters")
        print(f"{'='*60}\n")
        
        return jsonify({
            'success': True,
            'transcript': result
        })
        
    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        print(f"{'='*60}\n")
        return jsonify({
            'error': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', DEFAULT_PORT))
    print(f"Starting transcription server on http://localhost:{port}")
    print("=" * 60)
    print("Using transcribe-anything in INSANE mode for maximum speed!")
    print("=" * 60)
    
    # Check and install dependencies on startup
    print("\nChecking dependencies...")
    has_deps, dep_type = check_dependencies()
    
    if not has_deps:
        print("\n✗ Failed to install dependencies automatically.")
        print("Please install manually:")
        print("  pip install transcribe-anything flask flask-cors")
        print("\nServer will start but transcription may not work.")
    else:
        print(f"\n✓ Dependencies OK (using {dep_type})")
    
    print("\nFor GPU acceleration (recommended):")
    print("  - Windows/Linux: Uses CUDA automatically with --device insane")
    print("  - Mac: Use --device mlx for Apple Silicon acceleration")
    print("\nServer ready! The extension will connect automatically.")
    print("Transcription will use blazingly fast GPU acceleration when available.")
    app.run(host='127.0.0.1', port=port, debug=False)
