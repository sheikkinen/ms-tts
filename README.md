# MCP Text-to-Speech Server

Model Context Protocol server for text-to-speech synthesis using Azure Speech Services.

## Features

- 🎵 **High-Quality Speech**: Azure Neural voices with natural sound
- 🌍 **6 Languages**: English, Finnish, Spanish, German, French, Swedish
- 🗣️ **Smart Voice Selection**: Auto-select optimal voices or specify manually
- 📊 **Performance Metrics**: Synthesis timing and audio stats
- 🔧 **MCP Compatible**: Works with Claude Desktop, VS Code, other MCP clients

## Supported Voices

| Language | Default Voice | Alternatives |
|----------|---------------|--------------|
| **English (en-US)** | `en-US-RyanMultilingualNeural` | `en-US-JennyMultilingualNeural`, `en-US-AndrewMultilingualNeural` |
| **Finnish (fi-FI)** | `en-US-RyanMultilingualNeural` | `en-US-JennyMultilingualNeural`, `fi-FI-SelmaNeural`, `fi-FI-NooraNeural` |
| **Spanish (es-ES)** | `es-ES-AlvaroNeural` | `es-ES-ElviraNeural` |
| **German (de-DE)** | `de-DE-ConradNeural` | `de-DE-KatjaNeural` |
| **French (fr-FR)** | `fr-FR-DeniseNeural` | `fr-FR-HenriNeural` |
| **Swedish (sv-SE)** | `sv-SE-MattiasNeural` | `sv-SE-SofieNeural` |

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure (copy from parent or create .env)
cp ../.env .env

# 3. Test
npm run test:basic

# 4. Start
npm start
```

Required `.env`:
```env
AZURE_SPEECH_KEY=your-key
AZURE_SPEECH_REGION=westeurope
```

## MCP Integration

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "audio-tts": {
      "command": "node",
      "args": ["/path/to/mcp-server/mcp-server.mjs"],
      "env": {"AZURE_SPEECH_KEY": "your-key", "AZURE_SPEECH_REGION": "westeurope"}
    }
  }
}
```

### VS Code
Use included `.vscode/mcp.json` or install MCP extension.

## Usage

**Natural language:** "Convert to Finnish speech: Hei kaikki, olen Jenny."

**Direct tool call:**
```json
{
  "tool": "synthesize_speech",
  "parameters": {
    "sentence": "Hei kaikki, olen Jenny ja puhun suomea.",
    "language": "fi-FI", 
    "voice": "en-US-JennyMultilingualNeural"
  }
}
```

## Tool Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `sentence` | ✅ | Text to convert (1-1000 chars) |
| `language` | ✅ | Language code (`en-US`, `fi-FI`, `es-ES`, `de-DE`, `fr-FR`, `sv-SE`) |
| `voice` | ❌ | Specific voice (uses language default if not specified) |

## Output

Audio saved to `./audio/mcp-generated/` as:
```
mcp-tts-fi_FI-en-US-JennyMultilingualNeural-2025-08-17T16-30-45-123Z.wav
```

Returns: file path, voice used, performance metrics (synthesis time, duration, etc.)

## Troubleshooting

**Server won't start:** Check Azure credentials in `.env`, ensure Node.js 16+, run `npm install`

**No audio output:** Verify output directory exists, check Azure quota/billing, confirm supported language

**Voice issues:** Use exact voice names from table above, try language default, check Azure region support

**Debug mode:** `DEBUG=* npm start`

## Requirements

- Node.js 16+
- Azure Speech Services API key  
- MCP-compatible client (Claude Desktop, VS Code with MCP extension)

---

*Built with Model Context Protocol for universal AI integration*
