// static/js/components/folder-manager.jsx

import React, { useState, useEffect } from 'react';
import { FolderPlus, Save } from 'lucide-react';

const FolderManager = ({ resultData, onBeforeSave, onSave }) => {
    const [folders, setFolders] = useState([]);
    const [selectedFolder, setSelectedFolder] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchFolders();
    }, []);

    const fetchFolders = async () => {
        try {
            const response = await fetch('/api/folders');
            const data = await response.json();
            if (data.success) {
                setFolders(data.folders);
            }
        } catch (error) {
            console.error('Error fetching folders:', error);
            setError('Failed to load folders');
        }
    };

    const handleSave = async () => {
        if (!selectedFolder) {
            setError('Please select a folder');
            return;
        }

        try {
            // Get latest data from onSave callback if provided
            const dataToSave = onSave ? onSave() : resultData;
            
            console.log('Saving data to folder:', dataToSave); // Debug log

            const response = await fetch('/api/folders/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    folderId: selectedFolder,
                    result: {
                        ...dataToSave,
                        custom_notes: dataToSave.custom_notes || '',
                        ai_summary: dataToSave.ai_summary || '',
                    }
                }),
            });

            const data = await response.json();
            
            if (data.success) {
                showNotification('Saved successfully!');
                console.log('Save response:', data); // Debug log
            } else {
                throw new Error(data.error || 'Failed to save');
            }
        } catch (error) {
            console.error('Error saving to folder:', error);
            setError(error.message);
        }
    };

    const createFolder = async () => {
        if (!newFolderName.trim()) {
            setError('Please enter a folder name');
            return;
        }

        try {
            const response = await fetch('/api/folders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: newFolderName }),
            });

            const data = await response.json();
            if (data.success) {
                setFolders([...folders, { id: data.folderId, name: data.name }]);
                setSelectedFolder(data.folderId);
                setIsCreating(false);
                setNewFolderName('');
                setError(null);
            } else {
                throw new Error(data.error || 'Failed to create folder');
            }
        } catch (error) {
            console.error('Error creating folder:', error);
            setError(error.message);
        }
    };

    if (isCreating) {
        return (
            <div className="flex flex-col space-y-2">
                {error && (
                    <div className="text-red-500 text-sm">{error}</div>
                )}
                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Enter folder name"
                        className="flex-1 border p-2 rounded focus:ring-2 focus:ring-blue-500"
                        onKeyPress={(e) => e.key === 'Enter' && createFolder()}
                    />
                    <button
                        onClick={createFolder}
                        className="bg-green-500 text-white p-2 rounded hover:bg-green-600"
                    >
                        <Save className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => {
                            setIsCreating(false);
                            setError(null);
                        }}
                        className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-2">
            {error && (
                <div className="text-red-500 text-sm">{error}</div>
            )}
            <div className="flex space-x-2">
                <select
                    value={selectedFolder}
                    onChange={(e) => {
                        setSelectedFolder(e.target.value);
                        setError(null);
                    }}
                    className="flex-1 border p-2 rounded focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">Select folder...</option>
                    {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                            {folder.name}
                        </option>
                    ))}
                </select>
                <button
                    onClick={() => {
                        setIsCreating(true);
                        setError(null);
                    }}
                    className="bg-green-500 text-white p-2 rounded hover:bg-green-600"
                    title="Create new folder"
                >
                    <FolderPlus className="w-5 h-5" />
                </button>
                <button
                    onClick={handleSave}
                    className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
                    title="Save to selected folder"
                >
                    <Save className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export default FolderManager;
