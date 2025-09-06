# AI Provider Configuration

The web application supports multiple AI providers through environment variables. Choose one of the following options:

## Option 1: OpenAI

```bash
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4-turbo-preview  # Optional, defaults to gpt-4-turbo-preview
# OPENAI_BASE_URL=https://api.openai.com/v1  # Optional, for custom endpoints
```

Available models:

- `gpt-4-turbo-preview`
- `gpt-4`
- `gpt-3.5-turbo`

## Option 2: Anthropic Claude

The application supports Claude through Anthropic's OpenAI-compatible endpoint.

```bash
ANTHROPIC_API_KEY=your-anthropic-api-key
CLAUDE_MODEL=claude-3-5-sonnet-latest  # Optional, defaults to claude-3-5-sonnet-latest
```

Available models:

- `claude-3-5-sonnet-latest` - Best balance of speed and capability
- `claude-3-5-haiku-latest` - Fastest, most cost-effective
- `claude-3-opus-latest` - Most capable model

### Alternative Configuration

You can also use standard OpenAI environment variables:

```bash
OPENAI_API_KEY=your-anthropic-api-key
OPENAI_BASE_URL=https://api.anthropic.com/v1
OPENAI_MODEL=claude-3-5-sonnet-latest
```

## Option 3: Google Gemini

```bash
GEMINI_API_KEY=your-gemini-api-key
```

## Option 4: Custom OpenAI-Compatible Endpoints

For other providers that offer OpenAI-compatible APIs (like Ollama, LocalAI, etc.):

```bash
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://your-custom-endpoint.com/v1
OPENAI_MODEL=your-model-name
```

## Priority Order

When multiple API keys are present, the service uses this priority order:

1. Anthropic Claude (if `ANTHROPIC_API_KEY` is set)
2. OpenAI (if `OPENAI_API_KEY` is set)
3. Google Gemini (if `GEMINI_API_KEY` is set)

## Notes

- The Anthropic integration uses their OpenAI compatibility layer, which has some limitations compared to the native API
- For production use with Claude, consider using the native Anthropic SDK for full feature support
- All providers support streaming responses for real-time chat interactions
