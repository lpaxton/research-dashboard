// static/js/utils/search-utils.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import FolderManager from '../components/folder-manager.jsx';

export const createResultCard = (result, engine) => {
    const resultId = `result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const card = document.createElement('div');
    card.className = 'bg-white p-4 rounded-lg shadow mb-4 search-card';

    // Store result data before creating the HTML
    const safeResult = {
        ...result,
        id: resultId,
        engine: engine,
        custom_notes: result.custom_notes || '',
        ai_summary: result.ai_summary || '',
        description: result.description || '',
        title: result.title || '',
        url: result.url || '#'
    };
    window[`resultData_${resultId}`] = safeResult;
    
    // Create summarize button action that doesn't rely on stringifying the result
    const summarizeAction = `
        (function(e) {
            e.preventDefault();
            window.generateSummary('${resultId}');
        })(event)
    `;
    
    card.innerHTML = `
        <div class="space-y-2">
            <a href="${safeResult.url}" target="_blank" class="text-lg font-medium text-blue-600 hover:text-blue-800">
                ${safeResult.title}
            </a>
            <p class="text-gray-600">${safeResult.description}</p>
            
            <div id="summary-${resultId}" class="mt-4">
                ${safeResult.ai_summary ? `
                    <div class="prose">
                        <h4 class="text-lg font-semibold mb-2">AI Summary</h4>
                        <div class="summary-content whitespace-pre-line text-gray-700 bg-blue-50 p-3 rounded">
                            ${safeResult.ai_summary}
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
                    onchange="window.updateNotes('${resultId}')"
                >${safeResult.custom_notes}</textarea>
            </div>
            
            <div class="flex space-x-2 mt-4">
                ${safeResult.pdf_url ? `
                    <button 
                        class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex items-center space-x-2"
                        onclick="window.downloadPdf('${safeResult.pdf_url}', '${engine}')"
                    >
                        <span>PDF</span>
                    </button>
                ` : ''}
                
                ${['arxiv', 'biorxiv', 'semantic_scholar'].includes(engine) ? `
                    <button 
                        class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded flex items-center space-x-2"
                        onclick="${summarizeAction}"
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
    
    root.render(React.createElement(FolderManager, {
        resultData: window[`resultData_${resultId}`],
        onBeforeSave: () => {
            const notesElem = card.querySelector(`#notes-${resultId}`);
            const summaryElem = card.querySelector('.summary-content');
            
            const updatedResult = {
                ...window[`resultData_${resultId}`],
                custom_notes: notesElem ? notesElem.value : '',
                ai_summary: summaryElem ? summaryElem.textContent.trim() : safeResult.ai_summary
            };
            
            window[`resultData_${resultId}`] = updatedResult;
            return updatedResult;
        }
    }));

    return card;
};

export const showNotification = (message, type = 'success') => {
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
    } text-white px-6 py-3 rounded shadow-lg z-50`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
};