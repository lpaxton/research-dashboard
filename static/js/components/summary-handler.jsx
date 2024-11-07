// Create a new file: static/js/components/summary-handler.jsx
import React, { useState } from 'react';

export const handleSummarize = async (result) => {
    try {
        console.log('Generating summary for:', result.title);
        
        const response = await fetch('/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                url: result.url,
                title: result.title
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Summary response error:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Summary response:', data);

        if (data.success && data.summary) {
            return data.summary;
        } else {
            throw new Error(data.error || 'Failed to generate summary');
        }
    } catch (error) {
        console.error('Error in handleSummarize:', error);
        throw error;
    }
};