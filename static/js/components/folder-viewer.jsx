// static/js/components/folder-viewer.jsx
import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Folder, MessageSquare, Trash2, Upload, Plus } from 'lucide-react';
import ChatAssistant from './chat-assistant';

const FolderViewer = () => {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [folderContents, setFolderContents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchFolders();
  }, []);

  useEffect(() => {
    if (selectedFolder) {
      fetchFolderContents(selectedFolder);
    } else {
      setFolderContents([]);
    }
  }, [selectedFolder]);

  const fetchFolders = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/folders');
      const data = await response.json();
      
      if (data.success) {
        setFolders(data.folders);
      } else {
        throw new Error(data.error || 'Failed to fetch folders');
      }
    } catch (error) {
      console.error('Error fetching folders:', error);
      setError('Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const fetchFolderContents = async (folderId) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/folders/${folderId}/results`);
      const data = await response.json();
      
      if (data.success) {
        setFolderContents(data.results);
      } else {
        throw new Error(data.error || 'Failed to fetch folder contents');
      }
    } catch (error) {
      console.error('Error fetching folder contents:', error);
      setError('Failed to load folder contents');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setError('Please enter a folder name');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });

      const data = await response.json();
      if (data.success) {
        const newFolder = { id: data.folderId, name: newFolderName.trim() };
        setFolders([...folders, newFolder]);
        setSelectedFolder(data.folderId);
        setNewFolderName('');
        setShowNewFolderInput(false);
        setError(null);
      } else {
        throw new Error(data.error || 'Failed to create folder');
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFolder = async (folderId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this folder and all its contents?')) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/folders/${folderId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setFolders(folders.filter(f => f.id !== folderId));
        if (selectedFolder === folderId) {
          setSelectedFolder(null);
          setFolderContents([]);
        }
      } else {
        throw new Error(data.error || 'Failed to delete folder');
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    if (!selectedFolder) {
      setError('Please select a folder first');
      return;
    }

    const files = event.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    formData.append('folder_id', selectedFolder);
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });

    try {
      setLoading(true);
      const response = await fetch('/api/folders/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        fetchFolderContents(selectedFolder);
      } else {
        throw new Error(data.error || 'Failed to upload files');
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      setError(error.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteContent = async (contentId) => {
    if (!confirm('Are you sure you want to delete this item?')) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/folders/${selectedFolder}/results/${contentId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setFolderContents(folderContents.filter(item => item.id !== contentId));
      } else {
        throw new Error(data.error || 'Failed to delete item');
      }
    } catch (error) {
      console.error('Error deleting content:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Research Folders</h2>
            <div className="flex space-x-2">
              {selectedFolder && (
                <div className="relative">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    multiple
                    accept=".pdf,.doc,.docx"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-blue-300 flex items-center"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Files
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowNewFolderInput(true)}
                disabled={loading}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-green-300 flex items-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Folder
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
              {error}
            </div>
          )}

          {showNewFolderInput && (
            <div className="flex space-x-2 mb-4">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Enter folder name"
                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <button
                onClick={handleCreateFolder}
                disabled={loading}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-green-300"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewFolderInput(false);
                  setNewFolderName('');
                }}
                disabled={loading}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 disabled:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="space-y-2">
            {folders.map(folder => (
              <div
                key={folder.id}
                onClick={() => setSelectedFolder(folder.id)}
                className={`p-4 rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
                  selectedFolder === folder.id
                    ? 'bg-blue-100 hover:bg-blue-200'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Folder className={`w-5 h-5 ${selectedFolder === folder.id ? 'text-blue-500' : 'text-gray-500'}`} />
                  <span className="font-medium">{folder.name}</span>
                </div>
                <button
                  onClick={(e) => handleDeleteFolder(folder.id, e)}
                  disabled={loading}
                  className="text-red-500 hover:text-red-700 disabled:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {folders.length === 0 && !loading && (
              <div className="text-center text-gray-500 py-4">
                No folders yet. Create one to get started!
              </div>
            )}

            {loading && (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            )}
          </div>
        </div>

        {selectedFolder && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4">Folder Contents</h2>
            <div className="space-y-4">
              {folderContents.map((item) => (
                <div key={item.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      {item.title}
                      <ExternalLink className="w-4 h-4 ml-1" />
                    </a>
                    <button
                      onClick={() => handleDeleteContent(item.id)}
                      disabled={loading}
                      className="text-red-500 hover:text-red-700 disabled:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {item.ai_summary && (
                    <div className="mt-2">
                      <div className="font-medium">Summary:</div>
                      <div className="text-gray-600 text-sm whitespace-pre-line">{item.ai_summary}</div>
                    </div>
                  )}
                  {item.custom_notes && (
                    <div className="mt-2">
                      <div className="font-medium">Notes:</div>
                      <div className="text-gray-600 text-sm">{item.custom_notes}</div>
                    </div>
                  )}
                </div>
              ))}

              {folderContents.length === 0 && !loading && (
                <div className="text-center text-gray-500 py-4">
                  No items in this folder yet. Add some from the search results!
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6 h-[calc(100vh-2rem)]">
        <ChatAssistant
          selectedFolder={selectedFolder}
          folderContents={folderContents}
        />
      </div>
    </div>
  );
};

export default FolderViewer;