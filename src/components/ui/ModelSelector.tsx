import React, { useState, useEffect } from 'react';

interface ModelConfig {
  provider: "ollama" | "gemini" | "openai";
  model: string;
  isOllama: boolean;
}

interface ModelSelectorProps {
  onModelChange?: (provider: "ollama" | "gemini", model: string) => void;
  onChatOpen?: () => void;
  transcribeProvider?: 'gemini' | 'openai-whisper' | 'openai-realtime'
  onTranscribeProviderChange?: (p: 'gemini' | 'openai-whisper' | 'openai-realtime') => void
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange, onChatOpen, transcribeProvider = 'gemini', onTranscribeProviderChange }) => {
  const [currentConfig, setCurrentConfig] = useState<ModelConfig | null>(null);
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'testing' | 'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<"ollama" | "gemini" | "openai">("gemini");
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>("");
  const [ollamaUrl, setOllamaUrl] = useState<string>("http://localhost:11434");
  const [openaiApiKey, setOpenaiApiKey] = useState<string>("");
  const [openaiModel, setOpenaiModel] = useState<string>("gpt-4o-mini");

  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    try {
      setIsLoading(true);
      const config = await window.electronAPI.getCurrentLlmConfig();
      setCurrentConfig(config);
      setSelectedProvider(config.provider);
      
      if (config.isOllama) {
        setSelectedOllamaModel(config.model);
        await loadOllamaModels();
      }
    } catch (error) {
      console.error('Error loading current config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOllamaModels = async () => {
    try {
      const models = await window.electronAPI.getAvailableOllamaModels();
      setAvailableOllamaModels(models);
      
      // Auto-select first model if none selected
      if (models.length > 0 && !selectedOllamaModel) {
        setSelectedOllamaModel(models[0]);
      }
    } catch (error) {
      console.error('Error loading Ollama models:', error);
      setAvailableOllamaModels([]);
    }
  };

  const testConnection = async () => {
    try {
      setConnectionStatus('testing');
      const result = await window.electronAPI.testLlmConnection();
      setConnectionStatus(result.success ? 'success' : 'error');
      if (!result.success) {
        setErrorMessage(result.error || 'Unknown error');
      }
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(String(error));
    }
  };

  const handleProviderSwitch = async () => {
    try {
      setConnectionStatus('testing');
      let result;
      
      if (selectedProvider === 'ollama') {
        result = await window.electronAPI.switchToOllama(selectedOllamaModel, ollamaUrl);
      } else if (selectedProvider === 'gemini') {
        result = await window.electronAPI.switchToGemini(geminiApiKey || undefined);
      } else {
        result = await window.electronAPI.switchToOpenAI(openaiApiKey || undefined, openaiModel || undefined);
      }

      if (result.success) {
        await loadCurrentConfig();
        setConnectionStatus('success');
        onModelChange?.(selectedProvider === 'openai' ? 'gemini' : selectedProvider, selectedProvider === 'ollama' ? selectedOllamaModel : (selectedProvider === 'openai' ? openaiModel : 'gemini-2.0-flash'));
        // Auto-open chat window after successful model change
        setTimeout(() => {
          onChatOpen?.();
        }, 500);
      } else {
        setConnectionStatus('error');
        setErrorMessage(result.error || 'Switch failed');
      }
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(String(error));
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'testing': return 'text-yellow-600';
      case 'success': return 'text-green-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'testing': return 'Testing connection...';
      case 'success': return 'Connected successfully';
      case 'error': return `Error: ${errorMessage}`;
      default: return 'Ready';
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-black/40 backdrop-blur-md rounded-lg border border-gray-700/50">
        <div className="animate-pulse text-sm text-gray-300">Loading model configuration...</div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-black/40 backdrop-blur-md rounded-lg border border-gray-700/50 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">AI Model Selection</h3>
        <div className={`text-xs ${getStatusColor()}`}>
          {getStatusText()}
        </div>
      </div>

      {/* Current Status */}
      {currentConfig && (
        <div className="text-xs text-gray-300 bg-black/40 p-2 rounded border border-gray-700/50">
          Current: {currentConfig.provider === 'ollama' ? '🏠' : '☁️'} {currentConfig.model}
        </div>
      )}

      {/* Provider Selection */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-300">Provider</label>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedProvider('gemini')}
            className={`flex-1 px-3 py-2 rounded text-xs transition-all ${
              selectedProvider === 'gemini'
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-black/40 text-gray-200 hover:bg-black/60'
            }`}
          >
            ☁️ Gemini (Cloud)
          </button>
          <button
            onClick={() => setSelectedProvider('openai')}
            className={`flex-1 px-3 py-2 rounded text-xs transition-all ${
              selectedProvider === 'openai'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-black/40 text-gray-200 hover:bg-black/60'
            }`}
          >
            ☁️ OpenAI (Cloud)
          </button>
          <button
            onClick={() => setSelectedProvider('ollama')}
            className={`flex-1 px-3 py-2 rounded text-xs transition-all ${
              selectedProvider === 'ollama'
                ? 'bg-green-500 text-white shadow-md'
                : 'bg-black/40 text-gray-200 hover:bg-black/60'
            }`}
          >
            🏠 Ollama (Local)
          </button>
        </div>
      </div>

      {/* Provider-specific settings */}
      {selectedProvider === 'gemini' ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-300">Gemini API Key (optional if already set)</label>
          <input
            type="password"
            placeholder="Enter API key to update..."
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-black/40 text-gray-200 border border-gray-600/60 rounded focus:outline-none focus:ring-2 focus:ring-blue-400/40 placeholder-gray-400"
          />
        </div>
      ) : selectedProvider === 'openai' ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-300">OpenAI API Key (optional if already set)</label>
          <input
            type="password"
            placeholder="Enter OpenAI API key..."
            value={openaiApiKey}
            onChange={(e) => setOpenaiApiKey(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-black/40 text-gray-200 border border-gray-600/60 rounded focus:outline-none focus:ring-2 focus:ring-purple-400/40 placeholder-gray-400"
          />
          <label className="text-xs font-medium text-gray-300">Model</label>
          <input
            type="text"
            value={openaiModel}
            onChange={(e) => setOpenaiModel(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-black/40 text-gray-200 border border-gray-600/60 rounded focus:outline-none focus:ring-2 focus:ring-purple-400/40 placeholder-gray-400"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-gray-300">Ollama URL</label>
            <input
              type="url"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-black/40 text-gray-200 border border-gray-600/60 rounded focus:outline-none focus:ring-2 focus:ring-green-400/40 placeholder-gray-400"
            />
          </div>
          
          <div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-300">Model</label>
              <button
                onClick={loadOllamaModels}
                className="px-2 py-1 text-xs bg-black/60 hover:bg-black/80 text-gray-200 rounded transition-all"
                title="Refresh models"
              >
                🔄
              </button>
            </div>
            
            {availableOllamaModels.length > 0 ? (
              <select
                value={selectedOllamaModel}
                onChange={(e) => setSelectedOllamaModel(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-black/40 text-gray-200 border border-gray-600/60 rounded focus:outline-none focus:ring-2 focus:ring-green-400/40"
              >
                {availableOllamaModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-gray-200 bg-yellow-900/40 p-2 rounded border border-yellow-700/40">
                No Ollama models found. Make sure Ollama is running and models are installed.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transcription Provider */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-300">Transcription</label>
        <div className="flex flex-col gap-1 text-gray-200">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="transcribe" checked={transcribeProvider === 'gemini'} onChange={() => onTranscribeProviderChange?.('gemini')} />
            <span>Gemini (chunked)</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="transcribe" checked={transcribeProvider === 'openai-whisper'} onChange={() => onTranscribeProviderChange?.('openai-whisper')} />
            <span>OpenAI Whisper (REST)</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="transcribe" checked={transcribeProvider === 'openai-realtime'} onChange={() => onTranscribeProviderChange?.('openai-realtime')} />
            <span>GPT Realtime (WebRTC)</span>
          </label>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={handleProviderSwitch}
          disabled={connectionStatus === 'testing'}
          className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-xs rounded transition-all shadow-md"
        >
          {connectionStatus === 'testing' ? 'Switching...' : 'Apply Changes'}
        </button>
        
        <button
          onClick={testConnection}
          disabled={connectionStatus === 'testing'}
          className="px-3 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white text-xs rounded transition-all shadow-md"
        >
          Test
        </button>
      </div>

      {/* Help text */}
      <div className="text-xs text-gray-300 space-y-1">
        <div>💡 <strong>Gemini:</strong> Fast, cloud-based, requires API key</div>
        <div>💡 <strong>Ollama:</strong> Private, local, requires Ollama installation</div>
      </div>
    </div>
  );
};

export default ModelSelector;