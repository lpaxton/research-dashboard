// static/js/utils/search-utils.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ExternalLink } from 'lucide-react';
import FolderManager from '../components/folder-manager.jsx';

// Notification function
export const showNotification = (message, type = 'success') => {
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
    } text-white px-6 py-3 rounded shadow-lg z-50`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('opacity-0', 'transition-opacity', 'duration-500');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
};

// Create result card function
export const createResultCard = (result, engine) => {
    const resultId = `result-${Date.now()}`;
    
    // Create base result data object with all required fields
    const resultData = {
        ...result,
        id: resultId,
        engine: engine,
        description: result.description || '',
        ai_summary: result.ai_summary || '',
        custom_notes: result.custom_notes || '',
        url: result.url || '',
        title: result.title || ''
    };
    
    // Store data globally for access by summary handler
    window[`resultData_${resultId}`] = resultData;
    
    // Escape any quotes in the URL for safety
    const safeUrl = resultData.url.replace(/"/g, '&quot;');
    
    const card = document.createElement('div');
    card.className = 'bg-white p-4 rounded-lg shadow mb-4 search-card';
    
    card.innerHTML = `
        <div class="space-y-2">
            <div class="flex items-center justify-between">
                <a 
                    href="${safeUrl}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-lg font-medium text-blue-600 hover:text-blue-800 flex items-center"
                >
                    ${resultData.title}
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                </a>
                ${resultData.pdf_url ? `
                    <button 
                        onclick="window.handlePdfDownload('${resultData.pdf_url}', '${engine}')"
                        class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded flex items-center space-x-1 text-sm"
                    >
                        <span>PDF</span>
                    </button>
                ` : ''}
            </div>
            
            <p class="text-gray-600">${resultData.description}</p>
            
            <div id="summary-${resultId}" class="mt-4">
                ${resultData.ai_summary ? `
                    <div class="prose">
                        <h4 class="text-lg font-semibold mb-2">AI Summary</h4>
                        <div class="summary-content whitespace-pre-line text-gray-700 bg-blue-50 p-3 rounded">
                            ${resultData.ai_summary}
                        </div>
                    </div>
                ` : ''}
            </div>
            
            <div class="mt-4">
                <label class="block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                    id="notes-${resultId}"
                    class="w-full h-24 p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="Add your notes here..."
                >${resultData.custom_notes}</textarea>
            </div>
            
            <div class="flex space-x-2 mt-4">
                ${['arxiv', 'biorxiv', 'semantic_scholar'].includes(engine) ? `
                    <button 
                        onclick="window.handleSummarize('${resultId}')"
                        class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded flex items-center space-x-2"
                    >
                        <span>Summarize</span>
                    </button>
                ` : ''}
            </div>
            
            <div id="folder-manager-${resultId}" class="mt-4"></div>
        </div>
    `;

    // Mount FolderManager
    const folderManagerContainer = card.querySelector(`#folder-manager-${resultId}`);
    const root = createRoot(folderManagerContainer);
    
    if (root) {
        root.render(React.createElement(FolderManager, {
            resultData: resultData,
            onSave: () => {
                const notesElem = card.querySelector(`#notes-${resultId}`);
                const summaryElem = card.querySelector('.summary-content');
                
                const updatedResult = {
                    ...resultData,
                    custom_notes: notesElem ? notesElem.value : '',
                    ai_summary: summaryElem ? summaryElem.textContent.trim() : resultData.ai_summary
                };

                // Update stored data
                window[`resultData_${resultId}`] = updatedResult;
                console.log('Saving updated result:', updatedResult); // Debug log
                
                return updatedResult;
            }
        }));
    }

    return card;
};

// PDF download handler
export const handlePdfDownload = async (pdfUrl, engine) => {
    if (!pdfUrl) {
        showNotification('No PDF URL provided', 'error');
        return;
    }

    try {
        if (engine === 'arxiv') {
            window.open(pdfUrl, '_blank');
            return;
        }

        const response = await fetch('/proxy_pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: pdfUrl })
        });

        if (!response.ok) throw new Error('PDF download failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `paper_${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Error downloading PDF:', error);
        showNotification('Failed to download PDF', 'error');
    }
};

// Summary handler
export const handleSummarize = async (resultId) => {
    const resultData = window[`resultData_${resultId}`];
    const summaryContainer = document.getElementById(`summary-${resultId}`);
    
    if (!resultData || !summaryContainer) {
        console.error('Missing required data for summary');
        return;
    }

    try {
        // Show loading state
        summaryContainer.innerHTML = `
            <div class="animate-pulse flex space-x-4 items-center">
                <div class="flex-1 space-y-4 py-1">
                    <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div class="h-4 bg-gray-200 rounded"></div>
                </div>
            </div>
        `;

        const response = await fetch('/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: resultData.url,
                title: resultData.title
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success) {
            summaryContainer.innerHTML = `
                <div class="prose">
                    <h4 class="text-lg font-semibold mb-2">AI Summary</h4>
                    <div class="summary-content whitespace-pre-line text-gray-700 bg-blue-50 p-3 rounded">
                        ${data.summary}
                    </div>
                </div>
            `;
            
            // Update the stored result data
            resultData.ai_summary = data.summary;
            window[`resultData_${resultId}`] = resultData;
            
            showNotification('Summary generated successfully');
        } else {
            throw new Error(data.error || 'Failed to generate summary');
        }
    } catch (error) {
        console.error('Error generating summary:', error);
        summaryContainer.innerHTML = `
            <div class="text-red-500 p-3 rounded-lg bg-red-50">
                Failed to generate summary: ${error.message}
            </div>
        `;
        showNotification('Failed to generate summary', 'error');
    }
};

// Make handlers available globally
window.handlePdfDownload = handlePdfDownload;
window.handleSummarize = handleSummarize;
