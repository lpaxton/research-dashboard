import React from 'react';
import { createRoot } from 'react-dom/client';
import FolderViewer from './components/folder-viewer';

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('app-root');
    if (container) {
        const root = createRoot(container);
        root.render(
            <React.StrictMode>
                <FolderViewer />
            </React.StrictMode>
        );
    } else {
        console.error('Could not find app-root element');
    }
});

const FoldersView = () => {
    const [folders, setFolders] = useState([]);
    const [expandedFolders, setExpandedFolders] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchFolders();
    }, []);

    const fetchFolders = async () => {
        try {
            const response = await fetch('/api/folders');
            if (!response.ok) throw new Error('Failed to fetch folders');
            const data = await response.json();
            if (data.success) {
                setFolders(data.folders);
                // Fetch contents for each folder
                await Promise.all(data.folders.map(folder => fetchFolderContents(folder.id)));
            }
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchFolderContents = async (folderId) => {
        try {
            const response = await fetch(`/api/folders/${folderId}/results`);
            if (!response.ok) throw new Error('Failed to fetch folder contents');
            const data = await response.json();
            if (data.success) {
                setExpandedFolders(prev => ({
                    ...prev,
                    [folderId]: data.results
                }));
            }
        } catch (error) {
            console.error(`Error fetching contents for folder ${folderId}:`, error);
        }
    };

    const deleteFolder = async (folderId) => {
        if (!confirm('Are you sure you want to delete this folder and all its contents?')) return;
        
        try {
            const response = await fetch(`/api/folders/${folderId}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Failed to delete folder');
            const data = await response.json();
            if (data.success) {
                setFolders(folders.filter(folder => folder.id !== folderId));
                const newExpandedFolders = { ...expandedFolders };
                delete newExpandedFolders[folderId];
                setExpandedFolders(newExpandedFolders);
            }
        } catch (error) {
            console.error('Error deleting folder:', error);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>;
    }

    if (error) {
        return <div className="text-red-500">Error: {error}</div>;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {folders.map(folder => (
                <div key={folder.id} className="bg-white rounded-lg shadow-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                            <Folder className="w-6 h-6 text-blue-500" />
                            <h2 className="text-xl font-semibold">{folder.name}</h2>
                        </div>
                        <button
                            onClick={() => deleteFolder(folder.id)}
                            className="text-red-500 hover:text-red-700"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {expandedFolders[folder.id]?.map(item => (
                            <div key={item.id} className="border-l-2 border-blue-200 pl-4">
                                <div className="flex items-start justify-between">
                                    <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 flex items-center"
                                    >
                                        <span className="mr-2">{item.title}</span>
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                </div>
                                {item.ai_summary && (
                                    <div className="mt-2 text-sm text-gray-600">
                                        <div className="font-semibold">Summary:</div>
                                        <div className="whitespace-pre-line">{item.ai_summary}</div>
                                    </div>
                                )}
                                {item.custom_notes && (
                                    <div className="mt-2 text-sm bg-gray-50 p-2 rounded">
                                        <div className="font-semibold">Notes:</div>
                                        <div>{item.custom_notes}</div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

// Initialize the component
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('folders-container');
    if (container) {
        const root = createRoot(container);
        root.render(<FoldersView />);
    }
});