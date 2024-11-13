import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Settings } from 'lucide-react';

const ChatBot = ({ folderId }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [aiProvider, setAiProvider] = useState('anthropic'); // or 'openai'
    const [showSettings, setShowSettings] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (folderId) {
            loadChatHistory();
        }
    }, [folderId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const loadChatHistory = async () => {
        try {
            const response = await fetch(`/api/chat/history/${folderId}`);
            const data = await response.json();
            if (data.success) {
                setMessages(data.messages);
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSend = async () => {
        if (!input.trim() || !folderId) return;

        const userMessage = {
            content: input,
            type: 'user',
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const response = await fetch('/api/chat/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: input,
                    folderId: folderId,
                    ai_provider: aiProvider
                }),
            });

            const data = await response.json();
            if (data.success) {
                setMessages(prev => [...prev, {
                    content: data.response,
                    type: 'assistant',
                    timestamp: new Date().toISOString(),
                    ai_provider: aiProvider
                }]);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col">
            {/* Settings Button */}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Research Assistant</h2>
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 text-gray-500 hover:text-blue-500"
                >
                    <Settings className="w-5 h-5" />
                </button>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        AI Provider
                    </label>
                    <select
                        value={aiProvider}
                        onChange={(e) => setAiProvider(e.target.value)}
                        className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="openai">OpenAI (GPT)</option>
                    </select>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-4 p-4">
                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`flex items-start space-x-2 ${
                            message.type === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                    >
                        {message.type === 'assistant' && (
                            <Bot className="w-6 h-6 text-blue-500" />
                        )}
                        <div
                            className={`rounded-lg p-3 max-w-[80%] ${
                                message.type === 'user'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-800'
                            }`}
                        >
                            {message.content}
                            {message.type === 'assistant' && message.ai_provider && (
                                <div className="text-xs text-gray-500 mt-1">
                                    via {message.ai_provider === 'anthropic' ? 'Claude' : 'GPT'}
                                </div>
                            )}
                        </div>
                        {message.type === 'user' && (
                            <User className="w-6 h-6 text-blue-500" />
                        )}
                    </div>
                ))}
                {loading && (
                    <div className="flex items-center space-x-2">
                        <Bot className="w-6 h-6 text-blue-500" />
                        <div className="bg-gray-100 rounded-lg p-3">
                            <div className="flex space-x-2">
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100"></div>
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200"></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex items-center space-x-2 p-4 border-t">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask about your research..."
                    className="flex-1 p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                    disabled={!folderId || loading}
                />
                <button
                    onClick={handleSend}
                    disabled={!folderId || loading}
                    className="bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 disabled:bg-gray-300"
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export default ChatBot;
