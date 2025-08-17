#!/usr/bin/env node

/**
 * MCP Text-to-Speech Server
 * 
 * This server exposes a text-to-speech tool via Model Context Protocol (MCP).
 * It accepts sentence, language, and optional voice parameters and returns
 * synthesized speech using Microsoft Cognitive Services Speech SDK.
 */

import { config } from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SpeechConfig, SpeechSynthesizer, AudioConfig } from 'microsoft-cognitiveservices-speech-sdk';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY_FREE;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_REGION_FREE || 'westeurope';
const AUDIO_OUTPUT_DIR = process.env.AUDIO_OUTPUT_DIR || './audio/mcp-generated';

// Ensure output directory exists
if (!existsSync(AUDIO_OUTPUT_DIR)) {
    mkdirSync(AUDIO_OUTPUT_DIR, { recursive: true });
}

// Voice configuration mapping (from our research)
const VOICE_CONFIG = {
    // English voices
    'en-US': {
        default: 'en-US-RyanMultilingualNeural',
        alternatives: ['en-US-JennyMultilingualNeural', 'en-US-AndrewMultilingualNeural']
    },
    // Finnish voices
    'fi-FI': {
        default: 'en-US-RyanMultilingualNeural', // Best choice from our testing
        alternatives: ['en-US-JennyMultilingualNeural', 'fi-FI-SelmaNeural', 'fi-FI-NooraNeural', 'fi-FI-HarriNeural']
    },
    // Spanish voices
    'es-ES': {
        default: 'es-ES-AlvaroNeural',
        alternatives: ['es-ES-ElviraNeural']
    },
    // German voices
    'de-DE': {
        default: 'de-DE-ConradNeural',
        alternatives: ['de-DE-KatjaNeural']
    },
    // French voices
    'fr-FR': {
        default: 'fr-FR-DeniseNeural',
        alternatives: ['fr-FR-HenriNeural']
    },
    // Swedish voices
    'sv-SE': {
        default: 'sv-SE-MattiasNeural',
        alternatives: ['sv-SE-SofieNeural']
    }
};

/**
 * Get the best voice for a language/voice combination
 */
function getVoiceForLanguage(language, requestedVoice = null) {
    const langConfig = VOICE_CONFIG[language];
    if (!langConfig) {
        // Fallback to English
        return VOICE_CONFIG['en-US'].default;
    }
    
    if (requestedVoice) {
        // Check if requested voice is in alternatives or is the default
        if (requestedVoice === langConfig.default || langConfig.alternatives.includes(requestedVoice)) {
            return requestedVoice;
        }
    }
    
    return langConfig.default;
}

/**
 * Create SSML for speech synthesis
 */
function createSSML(text, voice, language, rate = '1.0', pitch = '0%') {
    return `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${language}">
    <voice name="${voice}">
        <prosody rate="${rate}" pitch="${pitch}">
            ${text}
        </prosody>
    </voice>
</speak>`.trim();
}

/**
 * Synthesize speech from text
 */
async function synthesizeSpeech(sentence, language, voice = null) {
    return new Promise((promiseResolve, promiseReject) => {
        try {
            if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
                promiseReject(new Error('Azure Speech Service credentials not configured. Please set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables.'));
                return;
            }

            // Get the appropriate voice
            const selectedVoice = getVoiceForLanguage(language, voice);
            
            // Create speech configuration
            const speechConfig = SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
            speechConfig.speechSynthesisLanguage = language;
            speechConfig.speechSynthesisVoiceName = selectedVoice;

            // Generate unique filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const languageCode = language.replace('-', '_');
            const voiceName = selectedVoice.replace(/[^a-zA-Z0-9]/g, '-');
            const filename = `mcp-tts-${languageCode}-${voiceName}-${timestamp}.wav`;
            const outputPath = resolve(AUDIO_OUTPUT_DIR, filename);

            // Create synthesizer (use default audio config to get proper audio data)
            const synthesizer = new SpeechSynthesizer(speechConfig);

            // Track metrics
            const startTime = Date.now();
            let wordCount = sentence.split(/\s+/).length; // Simple word count
            
            // Synthesize speech using simple text instead of SSML
            synthesizer.speakTextAsync(
                sentence,
                (result) => {
                    const duration = Date.now() - startTime;
                    
                    console.error('DEBUG: Speech synthesis callback result:', {
                        resultId: result.resultId,
                        reason: result.reason,
                        errorDetails: result.errorDetails,
                        audioDuration: result.audioDuration,
                        audioDataLength: result.audioData ? result.audioData.byteLength : 0
                    });
                    
                    if (result.errorDetails) {
                        synthesizer.close();
                        promiseReject(new Error(`Speech synthesis failed: ${result.errorDetails}`));
                        return;
                    }
                    
                    if (!result.audioData || result.audioData.byteLength === 0) {
                        synthesizer.close();
                        promiseReject(new Error('Speech synthesis produced no audio data'));
                        return;
                    }
                    
                    try {
                        // Save the audio data to file
                        writeFileSync(outputPath, Buffer.from(result.audioData));
                        
                        const audioDuration = result.audioDuration ? (result.audioDuration / 10000) : 0; // Convert to ms
                        const audioSeconds = audioDuration / 1000;
                        
                        const resultObj = {
                            success: true,
                            audioFile: outputPath,
                            filename: filename,
                            voice: selectedVoice,
                            language: language,
                            sentence: sentence,
                            metrics: {
                                synthesisTime: duration,
                                audioDuration: audioDuration,
                                wordCount: wordCount,
                                charactersPerSecond: duration > 0 ? (sentence.length / (duration / 1000)).toFixed(2) : '0.00',
                                wordsPerMinute: audioSeconds > 0 ? ((wordCount / audioSeconds) * 60).toFixed(2) : '0.00'
                            }
                        };
                        
                        console.error('DEBUG: Resolving with result:', JSON.stringify(resultObj, null, 2));
                        synthesizer.close();
                        promiseResolve(resultObj);
                    } catch (fileError) {
                        synthesizer.close();
                        promiseReject(new Error(`Failed to save audio file: ${fileError.message}`));
                    }
                },
                (error) => {
                    synthesizer.close();
                    promiseReject(new Error(`Speech synthesis error: ${error}`));
                }
            );

        } catch (error) {
            promiseReject(new Error(`Speech synthesis setup error: ${error.message}`));
        }
    });
}// Create MCP server
const server = new Server(
    {
        name: 'audio-mcp-tts-server',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Register the text-to-speech tool
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'synthesize_speech',
                description: 'Convert text to speech using Microsoft Azure Speech Services. Supports multiple languages and voices.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sentence: {
                            type: 'string',
                            description: 'The text to convert to speech',
                            minLength: 1,
                            maxLength: 1000
                        },
                        language: {
                            type: 'string',
                            description: 'Language code (e.g., en-US, fi-FI, es-ES, de-DE, fr-FR, sv-SE)',
                            enum: ['en-US', 'fi-FI', 'es-ES', 'de-DE', 'fr-FR', 'sv-SE'],
                            default: 'en-US'
                        },
                        voice: {
                            type: 'string',
                            description: 'Optional specific voice name. If not provided, uses the best voice for the language.',
                            examples: [
                                'en-US-RyanMultilingualNeural',
                                'fi-FI-SelmaNeural',
                                'es-ES-AlvaroNeural',
                                'de-DE-ConradNeural',
                                'fr-FR-DeniseNeural',
                                'sv-SE-MattiasNeural'
                            ]
                        }
                    },
                    required: ['sentence', 'language']
                }
            }
        ]
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    if (name !== 'synthesize_speech') {
        throw new Error(`Unknown tool: ${name}`);
    }

    const { sentence, language, voice } = args;

    // Validate required parameters
    if (!sentence || typeof sentence !== 'string') {
        throw new Error('Invalid or missing "sentence" parameter');
    }
    
    if (!language || typeof language !== 'string') {
        throw new Error('Invalid or missing "language" parameter');
    }

    // Validate language is supported
    const supportedLanguages = ['en-US', 'fi-FI', 'es-ES', 'de-DE', 'fr-FR', 'sv-SE'];
    if (!supportedLanguages.includes(language)) {
        throw new Error(`Unsupported language: ${language}. Supported languages: ${supportedLanguages.join(', ')}`);
    }

    try {
        console.error('DEBUG: Starting synthesizeSpeech with params:', { sentence, language, voice });
        const result = await synthesizeSpeech(sentence, language, voice);
        
        console.error('DEBUG: Got result from synthesizeSpeech:', result ? 'object received' : 'null/undefined');
        console.error('DEBUG: Result has metrics:', !!(result && result.metrics));
        
        // Defensive check to ensure result has metrics
        if (!result || !result.metrics) {
            console.error('DEBUG: Result object structure:', JSON.stringify(result, null, 2));
            throw new Error('Invalid result from synthesizeSpeech - missing metrics');
        }
        
        return {
            content: [
                {
                    type: 'text',
                    text: `🎵 Speech synthesis completed successfully!

**Audio Details:**
- File: ${result.filename}
- Path: ${result.audioFile}
- Voice: ${result.voice}
- Language: ${result.language}

**Performance Metrics:**
- Synthesis Time: ${result.metrics.synthesisTime}ms
- Audio Duration: ${result.metrics.audioDuration}ms
- Word Count: ${result.metrics.wordCount}
- Characters/Second: ${result.metrics.charactersPerSecond}
- Words/Minute: ${result.metrics.wordsPerMinute}

**Original Text:**
"${result.sentence}"

The audio file has been saved and is ready for playback.`
                }
            ]
        };
        
    } catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `❌ Speech synthesis failed: ${error.message}

**Troubleshooting Tips:**
- Check that Azure Speech Service credentials are properly configured
- Verify the language code is supported: en-US, fi-FI, es-ES, de-DE, fr-FR, sv-SE
- Ensure the sentence is not empty and under 1000 characters
- Check that the voice name (if specified) is valid for the selected language`
                }
            ]
        };
    }
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('🎵 MCP Text-to-Speech Server running');
    console.error('📍 Supported languages: en-US, fi-FI, es-ES, de-DE, fr-FR, sv-SE');
    console.error('🔊 Audio output directory:', AUDIO_OUTPUT_DIR);
}

main().catch((error) => {
    console.error('❌ Server error:', error);
    process.exit(1);
});
