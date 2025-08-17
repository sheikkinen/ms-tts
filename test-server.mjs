#!/usr/bin/env node

/**
 * Test Suite for MS-TTS MCP Server
 * 
 * This test suite validates the text-to-speech server functionality
 * including tool listing, speech synthesis, and error handling.
 */

import { config } from 'dotenv';
import { spawn } from 'child_process';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const SERVER_FILE = './ms-tts.mjs';
const TEST_AUDIO_DIR = './audio/test-output';
const TIMEOUT_MS = 30000; // 30 seconds timeout for each test

// Ensure test output directory exists
if (!existsSync(TEST_AUDIO_DIR)) {
    mkdirSync(TEST_AUDIO_DIR, { recursive: true });
}

class MCPTestClient {
    constructor() {
        this.server = null;
        this.requestId = 1;
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.server = spawn('node', [SERVER_FILE], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let initialized = false;

            this.server.stderr.on('data', (data) => {
                const output = data.toString();
                console.log('Server stderr:', output);
                
                if (output.includes('MCP Text-to-Speech Server running') && !initialized) {
                    initialized = true;
                    resolve();
                }
            });

            this.server.on('error', (error) => {
                if (!initialized) {
                    reject(error);
                }
            });

            // Set timeout
            setTimeout(() => {
                if (!initialized) {
                    reject(new Error('Server startup timeout'));
                }
            }, 10000);
        });
    }

    async sendRequest(method, params = {}) {
        const request = {
            jsonrpc: '2.0',
            id: this.requestId++,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            let responseData = '';
            let timer;

            const onData = (data) => {
                responseData += data.toString();
                
                try {
                    const response = JSON.parse(responseData);
                    this.server.stdout.removeListener('data', onData);
                    clearTimeout(timer);
                    
                    if (response.error) {
                        reject(new Error(`MCP Error: ${response.error.message}`));
                    } else {
                        resolve(response.result);
                    }
                } catch (e) {
                    // Response might be partial, continue listening
                }
            };

            this.server.stdout.on('data', onData);

            // Set timeout
            timer = setTimeout(() => {
                this.server.stdout.removeListener('data', onData);
                reject(new Error(`Request timeout: ${method}`));
            }, TIMEOUT_MS);

            // Send request
            this.server.stdin.write(JSON.stringify(request) + '\n');
        });
    }

    async stop() {
        if (this.server) {
            this.server.kill();
            this.server = null;
        }
    }
}

// Test cases
class TestSuite {
    constructor() {
        this.client = new MCPTestClient();
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log('🧪 Starting MS-TTS MCP Server Test Suite\n');

        // Check environment
        const hasCredentials = !!(process.env.AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY_FREE);
        if (!hasCredentials) {
            console.log('⚠️  Warning: Azure Speech credentials not found. Speech synthesis tests will be limited.\n');
        }

        try {
            console.log('🚀 Starting server...');
            await this.client.start();
            console.log('✅ Server started successfully\n');

            // Run all tests
            for (const test of this.tests) {
                await this.runTest(test);
            }

        } catch (error) {
            console.error('❌ Failed to start server:', error.message);
            this.failed++;
        } finally {
            await this.client.stop();
        }

        // Print results
        console.log('\n📊 Test Results:');
        console.log(`✅ Passed: ${this.passed}`);
        console.log(`❌ Failed: ${this.failed}`);
        console.log(`📈 Total: ${this.tests.length}`);

        if (this.failed === 0) {
            console.log('\n🎉 All tests passed!');
            process.exit(0);
        } else {
            console.log('\n💥 Some tests failed!');
            process.exit(1);
        }
    }

    async runTest(test) {
        try {
            console.log(`🔍 Testing: ${test.name}`);
            await test.fn(this.client);
            console.log(`✅ ${test.name}`);
            this.passed++;
        } catch (error) {
            console.log(`❌ ${test.name}: ${error.message}`);
            this.failed++;
        }
    }
}

// Initialize test suite
const suite = new TestSuite();

// Test: List tools
suite.test('List available tools', async (client) => {
    const result = await client.sendRequest('tools/list');
    
    if (!result || !result.tools || !Array.isArray(result.tools)) {
        throw new Error('Expected tools array in response');
    }

    if (result.tools.length === 0) {
        throw new Error('No tools returned');
    }

    const ttsTools = result.tools.filter(tool => tool.name === 'synthesize_speech');
    if (ttsTools.length !== 1) {
        throw new Error('Expected exactly one synthesize_speech tool');
    }

    const tool = ttsTools[0];
    if (!tool.description || !tool.inputSchema) {
        throw new Error('Tool missing description or inputSchema');
    }

    console.log(`   📋 Found ${result.tools.length} tool(s)`);
});

// Test: Basic speech synthesis (English)
suite.test('Synthesize English speech', async (client) => {
    const hasCredentials = !!(process.env.AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY_FREE);
    if (!hasCredentials) {
        console.log('   ⚠️  Skipped: No Azure credentials');
        return;
    }

    const result = await client.sendRequest('tools/call', {
        name: 'synthesize_speech',
        arguments: {
            sentence: 'Hello, this is a test of the text-to-speech system.',
            language: 'en-US'
        }
    });

    if (!result || !result.content || !Array.isArray(result.content)) {
        throw new Error('Expected content array in response');
    }

    const textContent = result.content.find(c => c.type === 'text');
    if (!textContent || !textContent.text) {
        throw new Error('Expected text content in response');
    }

    if (!textContent.text.includes('Speech synthesis completed successfully')) {
        throw new Error('Response does not indicate success');
    }

    console.log('   🎵 English synthesis successful');
});

// Test: Finnish speech synthesis
suite.test('Synthesize Finnish speech', async (client) => {
    const hasCredentials = !!(process.env.AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY_FREE);
    if (!hasCredentials) {
        console.log('   ⚠️  Skipped: No Azure credentials');
        return;
    }

    const result = await client.sendRequest('tools/call', {
        name: 'synthesize_speech',
        arguments: {
            sentence: 'Hei, tämä on testi.',
            language: 'fi-FI'
        }
    });

    if (!result || !result.content || !Array.isArray(result.content)) {
        throw new Error('Expected content array in response');
    }

    const textContent = result.content.find(c => c.type === 'text');
    if (!textContent || !textContent.text) {
        throw new Error('Expected text content in response');
    }

    if (!textContent.text.includes('Speech synthesis completed successfully')) {
        throw new Error('Response does not indicate success');
    }

    console.log('   🇫🇮 Finnish synthesis successful');
});

// Test: Custom voice
suite.test('Synthesize with specific voice', async (client) => {
    const hasCredentials = !!(process.env.AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY_FREE);
    if (!hasCredentials) {
        console.log('   ⚠️  Skipped: No Azure credentials');
        return;
    }

    const result = await client.sendRequest('tools/call', {
        name: 'synthesize_speech',
        arguments: {
            sentence: 'Testing with Jenny voice.',
            language: 'en-US',
            voice: 'en-US-JennyMultilingualNeural'
        }
    });

    if (!result || !result.content || !Array.isArray(result.content)) {
        throw new Error('Expected content array in response');
    }

    const textContent = result.content.find(c => c.type === 'text');
    if (!textContent || !textContent.text) {
        throw new Error('Expected text content in response');
    }

    if (!textContent.text.includes('JennyMultilingualNeural')) {
        throw new Error('Response does not mention the requested voice');
    }

    console.log('   🎤 Custom voice synthesis successful');
});

// Test: Error handling - missing sentence
suite.test('Handle missing sentence parameter', async (client) => {
    try {
        await client.sendRequest('tools/call', {
            name: 'synthesize_speech',
            arguments: {
                language: 'en-US'
            }
        });
        throw new Error('Expected error for missing sentence');
    } catch (error) {
        if (!error.message.includes('sentence')) {
            throw new Error('Expected error message about missing sentence');
        }
    }

    console.log('   ❌ Correctly handled missing sentence');
});

// Test: Error handling - unsupported language
suite.test('Handle unsupported language', async (client) => {
    try {
        await client.sendRequest('tools/call', {
            name: 'synthesize_speech',
            arguments: {
                sentence: 'Test sentence',
                language: 'xx-XX'
            }
        });
        throw new Error('Expected error for unsupported language');
    } catch (error) {
        if (!error.message.includes('Unsupported language')) {
            throw new Error('Expected error message about unsupported language');
        }
    }

    console.log('   🌍 Correctly handled unsupported language');
});

// Test: Error handling - unknown tool
suite.test('Handle unknown tool', async (client) => {
    try {
        await client.sendRequest('tools/call', {
            name: 'unknown_tool',
            arguments: {}
        });
        throw new Error('Expected error for unknown tool');
    } catch (error) {
        if (!error.message.includes('Unknown tool')) {
            throw new Error('Expected error message about unknown tool');
        }
    }

    console.log('   🔧 Correctly handled unknown tool');
});

// Test: Performance - multiple quick requests
suite.test('Handle multiple concurrent requests', async (client) => {
    const hasCredentials = !!(process.env.AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY_FREE);
    if (!hasCredentials) {
        console.log('   ⚠️  Skipped: No Azure credentials');
        return;
    }

    const requests = [
        { sentence: 'First test', language: 'en-US' },
        { sentence: 'Second test', language: 'en-US' },
        { sentence: 'Third test', language: 'en-US' }
    ];

    // Note: We run these sequentially to avoid overwhelming the service
    for (let i = 0; i < requests.length; i++) {
        const result = await client.sendRequest('tools/call', {
            name: 'synthesize_speech',
            arguments: requests[i]
        });

        if (!result || !result.content) {
            throw new Error(`Request ${i + 1} failed`);
        }
    }

    console.log('   🚀 Multiple requests handled successfully');
});

// Run the test suite
suite.run().catch((error) => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
});
