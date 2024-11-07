// static/js/main.js
import { createResultCard, showNotification } from './utils/search-utils.js';

// Update notes in stored result data
window.updateNotes = (resultId) => {
    const notesElem = document.querySelector(`#notes-${resultId}`);
    if (notesElem && window[`resultData_${resultId}`]) {
        window[`resultData_${resultId}`].custom_notes = notesElem.value;
    }
};

// Handle PDF downloads
window.downloadPdf = async (pdfUrl, engine) => {
    if (engine === 'arxiv') {
        window.open(pdfUrl, '_blank');
        return;
    }

    try {
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

// Handle summary generation
window.generateSummary = async (resultId) => {
    const result = window[`resultData_${resultId}`];
    if (!result) {
        console.error('Result data not found');
        return;
    }

    const summaryContainer = document.getElementById(`summary-${resultId}`);
    if (!summaryContainer) {
        console.error('Summary container not found');
        return;
    }

    try {
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
                url: result.url,
                title: result.title
            })
        });

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
            window[`resultData_${resultId}`].ai_summary = data.summary;
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
    }
};

// Handle save to folder
window.saveToFolder = async (folderId, resultId) => {
    const result = window[`resultData_${resultId}`];
    if (!result) {
        console.error('Result data not found');
        return false;
    }

    try {
        const response = await fetch('/api/folders/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                folderId: folderId,
                result: {
                    ...result,
                    custom_notes: result.custom_notes || document.querySelector(`#notes-${resultId}`).value
                }
            })
        });

        const data = await response.json();
        
        if (data.success) {
            showNotification('Saved successfully!');
            return true;
        } else {
            throw new Error(data.error || 'Failed to save to folder');
        }
    } catch (error) {
        console.error('Error saving to folder:', error);
        showNotification('Failed to save to folder', 'error');
        return false;
    }
};

// Handle search functionality
async function handleSearch(engine) {
    const input = document.querySelector(`input[data-engine="${engine}"]`);
    const query = input?.value.trim();
    
    if (!query) return;

    const loadingEl = document.getElementById('loading');
    const resultsContainer = document.getElementById('results-container');
    
    if (!loadingEl || !resultsContainer) {
        console.error('Required DOM elements not found');
        return;
    }

    loadingEl.classList.remove('hidden');
    resultsContainer.innerHTML = '';

    try {
        const formData = new FormData();
        formData.append('query', query);

        const response = await fetch(`/search/${engine}`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success && data.results) {
            resultsContainer.innerHTML = '';
            data.results.forEach(result => {
                const card = createResultCard(result, engine);
                if (card) resultsContainer.appendChild(card);
            });

            if (data.results.length === 0) {
                resultsContainer.innerHTML = '<p class="text-gray-500">No results found</p>';
            }
        } else {
            throw new Error(data.error || 'Failed to perform search');
        }
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = `
            <p class="text-red-500 bg-red-50 p-4 rounded-lg">
                ${error.message || 'An error occurred while searching'}
            </p>
        `;
    } finally {
        loadingEl.classList.add('hidden');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Setup search input handlers
    document.querySelectorAll('input[data-engine]').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(input.dataset.engine);
            }
        });
    });

    // Setup search button handlers
    document.querySelectorAll('button[data-engine]').forEach(button => {
        button.addEventListener('click', () => {
            handleSearch(button.dataset.engine);
        });
    });
});