// static/js/components/chat-assistant.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User } from 'lucide-react';



const ChatAssistant = ({ selectedFolder, folderContents }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);  // Changed from error to errorMessage
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (selectedFolder) {
            loadChatHistory();
        } else {
            setMessages([]);
        }
    }, [selectedFolder]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const loadChatHistory = async () => {
        if (!selectedFolder) return;

        try {
            console.log("Loading chat history for folder:", selectedFolder);
            const response = await fetch(`/api/chat/history/${selectedFolder}`);
            const data = await response.json();

            if (data.success) {
                console.log("Chat history loaded:", data.messages);
                setMessages(data.messages);
            } else {
                throw new Error(data.error || 'Failed to load chat history');
            }
        } catch (err) {
            console.error('Error loading chat history:', err);
            setErrorMessage('Failed to load chat history');  // Using setErrorMessage instead of setError
        }
    };

    const handleSend = async () => {
        if (!input.trim() || !selectedFolder) return;

        const userMessage = {
            content: input,
            type: 'user',
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);
        setErrorMessage(null);  // Reset error message before new request

        try {
            const response = await fetch('/api/chat/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: input,
                    folderId: selectedFolder,
                    folderContents: folderContents || [],
                }),
            });

            const data = await response.json();
            if (data.success) {
                const assistantMessage = {
                    content: data.response,
                    type: 'assistant',
                    timestamp: new Date().toISOString(),
                    provider: data.provider
                };
                setMessages(prev => [...prev, assistantMessage]);
            } else {
                throw new Error(data.error || 'Failed to process message');
            }
        } catch (err) {
            console.error('Error sending message:', err);
            setErrorMessage(err.message);  // Using setErrorMessage
        } finally {
            setLoading(false);
            scrollToBottom();
        }
    };

    return (
        <div className="flex flex-col h-full">
            {errorMessage && (  // Changed from error to errorMessage
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
                    {errorMessage}
                </div>
            )}
            
            <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                {!selectedFolder ? (
                    <div className="text-center text-gray-500 p-4">
                        Select a folder to start chatting about its contents
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-gray-500 p-4">
                        No messages yet. Start a conversation about the folder's contents!
                    </div>
                ) : (
                    messages.map((message, index) => (
                        <div
                            key={index}
                            className={`flex items-start space-x-2 ${
                                message.type === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                        >
                            {message.type === 'assistant' && <Bot className="w-6 h-6 text-blue-500" />}
                            <div
                                className={`p-3 rounded-lg max-w-[80%] ${
                                    message.type === 'user' 
                                        ? 'bg-blue-500 text-white' 
                                        : 'bg-gray-100'
                                }`}
                            >
                                {message.content}
                            </div>
                            {message.type === 'user' && <User className="w-6 h-6 text-blue-500" />}
                        </div>
                    ))
                )}
                
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

            <div className="border-t border-gray-200 p-4">
                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                        placeholder={selectedFolder 
                            ? "Ask about the contents of this folder..." 
                            : "Select a folder to start chatting"}
                        disabled={!selectedFolder || loading}
                        className="flex-1 p-2 border rounded-md focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!selectedFolder || !input.trim() || loading}
                        className="bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

const formatMessage = (content) => {
    if (!content) return '';
  
    // Helper function to wrap text in proper HTML tags
    const wrapWithTag = (text, tag) => `<${tag}>${text}</${tag}>`;
  
    // Format the message with proper HTML structure
    let formattedContent = content
      // Handle paragraphs (double newlines)
      .split('\n\n')
      .map(para => wrapWithTag(para.trim(), 'p'))
      .join('')
      
      // Handle numbered lists
      .replace(/^\d+\.\s+(.+)$/gm, (match, item) => `<li>${item}</li>`)
      .replace(/(<li>.*<\/li>\n?)+/g, list => `<ol>${list}</ol>`)
      
      // Handle bullet points
      .replace(/^[-•]\s+(.+)$/gm, (match, item) => `<li>${item}</li>`)
      .replace(/(<li>.*<\/li>\n?)+/g, list => `<ul>${list}</ul>`)
      
      // Handle headers
      .replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, text) => {
        const level = hashes.length;
        return wrapWithTag(text, `h${level}`);
      })
      
      // Handle bold text
      .replace(/\*\*(.*?)\*\*/g, (match, text) => `<strong>${text}</strong>`)
      
      // Handle italic text
      .replace(/\*(.*?)\*/g, (match, text) => `<em>${text}</em>`)
      
      // Handle code blocks
      .replace(/`([^`]+)`/g, (match, code) => `<code>${code}</code>`);
  
    return formattedContent;
  };
  
  const MessageContent = ({ content, type }) => {
    return (
      <div 
        className={`prose max-w-none ${type === 'user' ? 'text-white prose-invert' : 'text-gray-800'}`}
        dangerouslySetInnerHTML={{ __html: formatMessage(content) }}
      />
    );
  };

export default ChatAssistant;