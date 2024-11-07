# app.py
from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
from openai import OpenAI
import os
import requests
from bs4 import BeautifulSoup
import arxiv
import json
import logging
from urllib.parse import quote_plus, urljoin
from datetime import datetime, timedelta
from io import BytesIO
from time import sleep
from functools import wraps
import time
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId, json_util
import certifi
from anthropic import Anthropic
from enum import Enum
from collections import defaultdict
from werkzeug.utils import secure_filename
from PyPDF2 import PdfReader
import docx
import tempfile

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configure upload settings
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ALLOWED_EXTENSIONS'] = {'pdf', 'doc', 'docx'}

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class AIProvider(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"

# Create uploads directory if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

class RateLimiter:
    def __init__(self):
        self.calls = defaultdict(list)
        
    def can_call(self, key, calls_per_second=1, burst_limit=5):
        now = datetime.now()
        min_interval = timedelta(seconds=1.0/calls_per_second)
        
        # Clean old calls
        self.calls[key] = [
            call_time for call_time in self.calls[key]
            if now - call_time < timedelta(seconds=1)
        ]
        
        # Check burst limit
        if len(self.calls[key]) >= burst_limit:
            return False
            
        # Check rate limit
        if self.calls[key] and (now - self.calls[key][-1]) < min_interval:
            return False
            
        self.calls[key].append(now)
        return True

rate_limiter = RateLimiter()

def rate_limit(calls_per_second=1, burst_limit=5):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            while not rate_limiter.can_call(func.__name__, calls_per_second, burst_limit):
                time.sleep(0.1)
            return func(*args, **kwargs)
        return wrapper
    return decorator

class APIError(Exception):
    """Custom exception for API-related errors"""
    pass

def handle_api_error(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed: {str(e)}")
            raise APIError(f"External API request failed: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            raise
    return wrapper

# Load environment variables and initialize APIs
def initialize_apis():
    load_dotenv()
    
    credentials = {
        'OPENAI_API_KEY': os.getenv("OPENAI_API_KEY"),
        'ANTHROPIC_API_KEY': os.getenv("ANTHROPIC_API_KEY"),
        'MONGODB_URI': os.getenv("MONGODB_URI")
    }
    
    missing_credentials = [key for key, value in credentials.items() if not value]
    if missing_credentials:
        raise ValueError(f"Missing required credentials: {', '.join(missing_credentials)}")
    
    clients = {
        'openai': OpenAI(api_key=credentials['OPENAI_API_KEY']),
        'anthropic': Anthropic(api_key=credentials['ANTHROPIC_API_KEY'])
    }
    
    return credentials, clients

# Initialize APIs and MongoDB
credentials, api_clients = initialize_apis()
openai_client = api_clients['openai']
anthropic_client = api_clients['anthropic']

# Initialize MongoDB
try:
    mongo_client = MongoClient(
        credentials['MONGODB_URI'],
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=5000,
        tlsCAFile=certifi.where()
    )
    
    # Test connection
    mongo_client.admin.command('ping')
    db = mongo_client.research_dashboard
    
    # Create indexes
    db.folders.create_index([("name", 1)], unique=True)
    db.saved_results.create_index([("folder_id", 1)])
    db.chat_messages.create_index([("folder_id", 1)])
    db.chat_messages.create_index([("timestamp", 1)])
    
    logger.info("Successfully connected to MongoDB Atlas")
except Exception as e:
    logger.error(f"Failed to connect to MongoDB Atlas: {str(e)}")
    raise

class SearchEngines:
    @staticmethod
    @handle_api_error
    def duckduckgo(query):
        try:
            url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            results = []
            
            for result in soup.select('.result')[:5]:
                title_elem = result.select_one('.result__title')
                snippet_elem = result.select_one('.result__snippet')
                url_elem = result.select_one('.result__url')
                
                if title_elem and snippet_elem:
                    title = title_elem.get_text(strip=True)
                    description = snippet_elem.get_text(strip=True)
                    url = url_elem.get('href') if url_elem else '#'
                    
                    results.append({
                        'title': title,
                        'description': description,
                        'url': url
                    })
            
            return results
        except Exception as e:
            logger.error(f"DuckDuckGo search error: {str(e)}")
            return []

    @staticmethod
    @rate_limit(calls_per_second=1)
    @handle_api_error
    def arxiv(query):
        try:
            client = arxiv.Client()
            search = arxiv.Search(
                query=query,
                max_results=5,
                sort_by=arxiv.SortCriterion.Relevance
            )
            
            results = []
            for paper in client.results(search):
                try:
                    result = {
                        'title': paper.title,
                        'description': paper.summary[:200] + '...' if paper.summary else 'No summary available',
                        'url': paper.entry_id,
                        'pdf_url': paper.pdf_url,
                        'authors': ', '.join([author.name for author in paper.authors]),
                        'published': paper.published.strftime('%Y-%m-%d')
                    }
                    results.append(result)
                except Exception as e:
                    logger.error(f"Error processing arXiv paper: {str(e)}")
                    continue
            
            return results
        except Exception as e:
            logger.error(f"arXiv search error: {str(e)}")
            return []

    @staticmethod
    @rate_limit(calls_per_second=1)
    @handle_api_error
    def biorxiv(query):
        try:
            base_url = "https://www.biorxiv.org/search"
            params = {
                'text': query,
                'sort': 'relevance',
                'page': 0
            }
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            response = requests.get(base_url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            results = []
            
            for article in soup.select('.highwire-article-citation')[:5]:
                try:
                    title_elem = article.select_one('.highwire-cite-title')
                    title = title_elem.get_text(strip=True) if title_elem else 'No title available'
                    
                    link = title_elem.find('a')['href'] if title_elem and title_elem.find('a') else ''
                    full_url = f"https://www.biorxiv.org{link}" if link else '#'
                    
                    authors_elem = article.select_one('.highwire-citation-authors')
                    authors = authors_elem.get_text(strip=True) if authors_elem else 'No authors listed'
                    
                    abstract_elem = article.select_one('.highwire-cite-snippet')
                    abstract = abstract_elem.get_text(strip=True) if abstract_elem else 'No abstract available'
                    
                    date_elem = article.select_one('.highwire-cite-metadata-date')
                    date = date_elem.get_text(strip=True) if date_elem else 'Date not available'
                    
                    pdf_url = f"{full_url}.full.pdf" if full_url != '#' else None
                    
                    result = {
                        'title': title,
                        'description': abstract[:200] + '...' if len(abstract) > 200 else abstract,
                        'url': full_url,
                        'pdf_url': pdf_url,
                        'authors': authors,
                        'published': date
                    }
                    
                    results.append(result)
                except Exception as e:
                    logger.error(f"Error processing bioRxiv paper: {str(e)}")
                    continue
            
            return results
        except Exception as e:
            logger.error(f"bioRxiv search error: {str(e)}")
            return []

    @staticmethod
    @rate_limit(calls_per_second=1)
    @handle_api_error
    def semantic_scholar(query):
        try:
            url = "https://api.semanticscholar.org/graph/v1/paper/search"
            params = {
                'query': query,
                'limit': 5,
                'fields': 'title,abstract,authors,year,citationCount,url,openAccessPdf,tldr'
            }
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }

            response = requests.get(url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            results = []

            if 'data' in data:
                for paper in data['data']:
                    try:
                        abstract = None
                        if paper.get('tldr'):
                            abstract = paper['tldr'].get('text')
                        if not abstract and paper.get('abstract'):
                            abstract = paper['abstract']
                        if not abstract:
                            abstract = 'No abstract available'

                        authors = []
                        if paper.get('authors'):
                            authors = [author.get('name', '') for author in paper['authors']]
                        
                        result = {
                            'title': paper.get('title', 'No title'),
                            'description': abstract[:200] + '...' if len(abstract) > 200 else abstract,
                            'url': paper.get('url') or f"https://www.semanticscholar.org/paper/{paper.get('paperId', '')}",
                            'pdf_url': paper.get('openAccessPdf', {}).get('url'),
                            'authors': ', '.join(authors) or 'Authors not available',
                            'published': str(paper.get('year', 'Year not available')),
                            'citations': paper.get('citationCount', 0)
                        }
                        results.append(result)
                    except Exception as e:
                        logger.error(f"Error processing paper: {str(e)}")
                        continue

            return results
        except Exception as e:
            logger.error(f"Semantic Scholar search error: {str(e)}")
            return []

# Flask Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/folders')
def folders():
    return render_template('folders.html')

@app.route('/search/<engine>', methods=['POST'])
@handle_api_error
def search(engine):
    query = request.form.get('query', '')
    logger.info(f"Search request received for engine: {engine}, query: {query}")
    
    search_functions = {
        'duckduckgo': SearchEngines.duckduckgo,
        'arxiv': SearchEngines.arxiv,
        'biorxiv': SearchEngines.biorxiv,
        'semantic_scholar': SearchEngines.semantic_scholar
    }
    
    if engine not in search_functions:
        return jsonify({
            'success': False,
            'error': 'Invalid search engine'
        }), 400

    try:
        results = search_functions[engine](query)
        logger.info(f"Search completed for {engine}. Found {len(results)} results.")
        
        return jsonify({
            'success': True,
            'results': results,
            'engine': engine
        })
    except APIError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/chat/history/<folder_id>', methods=['GET'])
def get_chat_history(folder_id):
    try:
        if not ObjectId.is_valid(folder_id):
            return jsonify({
                'success': False,
                'error': 'Invalid folder ID format'
            }), 400

        messages = list(db.chat_messages.find(
            {'folder_id': ObjectId(folder_id)}
        ).sort('timestamp', 1))

        processed_messages = []
        for message in messages:
            processed_message = {
                'id': str(message['_id']),
                'content': message['content'],
                'type': message['type'],
                'timestamp': message['timestamp'].isoformat(),
                'ai_provider': message.get('ai_provider', 'unknown')
            }
            processed_messages.append(processed_message)

        return jsonify({
            'success': True,
            'messages': processed_messages
        })

    except Exception as e:
        logger.error(f"Error fetching chat history: {str(e)}")
        return json.loads(json_util.dumps({
            'success': False,
            'error': str(e)
        })), 500

@app.route('/api/chat/message', methods=['POST'])
def send_chat_message():
    try:
        data = request.get_json()
        message = data.get('message')
        folder_id = data.get('folderId')
        folder_contents = data.get('folderContents', [])
        
        logger.debug(f"Received message request for folder: {folder_id}")
        logger.debug(f"Folder contents received: {folder_contents}")
        
        if not message or not folder_id:
            return jsonify({
                'success': False,
                'error': 'Message and folder ID are required'
            }), 400

        # Create context from folder contents
        context = "\n".join([
            f"Title: {item.get('title', '')}\n"
            f"Summary: {item.get('ai_summary', '')}\n"
            f"Notes: {item.get('custom_notes', '')}\n"
            f"Description: {item.get('description', '')}\n"
            for item in folder_contents
        ])

        # Get chat history for context
        chat_history = list(db.chat_messages.find(
            {'folder_id': ObjectId(folder_id)}
        ).sort('timestamp', 1).limit(5))  # Get last 5 messages for context
        
        chat_context = "\n".join([
            f"{'User' if msg['type'] == 'user' else 'Assistant'}: {msg['content']}"
            for msg in chat_history
        ])

        prompt = f"""You are a research assistant helping with the following research materials.
Your role is to provide insights, analysis, and answer questions about these materials.

Research Materials in this folder:
{context}

Recent Conversation:
{chat_context}

User question: {message}

Please provide a clear, well-structured response based on the research materials and conversation history. 
If the question cannot be directly answered using the available materials, acknowledge this and suggest what additional information might be helpful."""

        try:
            # Use Claude 3.5 Sonnet as primary model
            response = anthropic_client.messages.create(
                model="claude-3-sonnet-20240229",
                max_tokens=1000,
                temperature=0.7,
                system="You are a knowledgeable research assistant that excels at analyzing academic papers and research materials. You provide thorough, nuanced responses while maintaining academic rigor.",
                messages=[{"role": "user", "content": prompt}]
            )
            ai_response = response.content[0].text
            provider_used = AIProvider.ANTHROPIC
            
        except Exception as e:
            logger.error(f"Anthropic API error: {str(e)}")
            # Fallback to OpenAI
            try:
                response = openai_client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[
                        {"role": "system", "content": "You are a helpful research assistant that analyzes and discusses research papers and their contents."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=500,
                    temperature=0.7
                )
                ai_response = response.choices[0].message.content
                provider_used = AIProvider.OPENAI
            except Exception as openai_error:
                logger.error(f"OpenAI API error: {str(openai_error)}")
                return jsonify({
                    'success': False,
                    'error': 'Failed to generate response from both AI providers'
                }), 500

        # Save messages to database
        timestamp = datetime.utcnow()
        
        # Save user message
        user_message = {
            'folder_id': ObjectId(folder_id),
            'content': message,
            'type': 'user',
            'timestamp': timestamp,
            'ai_provider': provider_used
        }
        db.chat_messages.insert_one(user_message)
        
        # Save assistant response
        assistant_message = {
            'folder_id': ObjectId(folder_id),
            'content': ai_response,
            'type': 'assistant',
            'timestamp': timestamp,
            'ai_provider': provider_used
        }
        db.chat_messages.insert_one(assistant_message)

        return jsonify({
            'success': True,
            'response': ai_response,
            'provider': provider_used
        })

    except Exception as e:
        logger.error(f"Error processing chat message: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Folder Management Routes
@app.route('/api/folders', methods=['GET'])
def get_folders():
    try:
        folders = list(db.folders.find({}, {'name': 1}))
        for folder in folders:
            folder['id'] = str(folder['_id'])
            del folder['_id']
        
        return jsonify({
            'success': True,
            'folders': folders
        })
    except Exception as e:
        logger.error(f"Error fetching folders: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/folders', methods=['POST'])
def create_folder():
    try:
        data = request.get_json()
        folder_name = data.get('name')
        
        if not folder_name:
            return jsonify({
                'success': False,
                'error': 'Folder name is required'
            }), 400
        
        result = db.folders.insert_one({
            'name': folder_name,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        })
        
        return jsonify({
            'success': True,
            'folderId': str(result.inserted_id),
            'name': folder_name
        })
    except Exception as e:
        logger.error(f"Error creating folder: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/folders/<folder_id>/results', methods=['GET'])
def get_folder_results(folder_id):
    try:
        results = list(db.saved_results.find({'folder_id': ObjectId(folder_id)}))
        for result in results:
            result['id'] = str(result['_id'])
            result['folder_id'] = str(result['folder_id'])
            del result['_id']
        
        return jsonify({
            'success': True,
            'results': results
        })
    except Exception as e:
        logger.error(f"Error fetching folder results: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/folders/save', methods=['POST'])
def save_to_folder():
    try:
        data = request.get_json()
        logger.debug(f"Received save request data: {data}")
        
        folder_id = data.get('folderId')
        result_data = data.get('result', {})
        
        if not folder_id or not result_data:
            return jsonify({
                'success': False,
                'error': 'Folder ID and result data are required'
            }), 400
        
        # Create save data with explicit field mapping
        save_data = {
            'folder_id': ObjectId(folder_id),
            'url': result_data.get('url'),
            'title': result_data.get('title'),
            'description': result_data.get('description', ''),
            'ai_summary': result_data.get('ai_summary', ''),
            'custom_notes': result_data.get('custom_notes', ''),
            'engine': result_data.get('engine', ''),
            'saved_at': datetime.utcnow(),
            'last_modified': datetime.utcnow()
        }
        
        logger.debug(f"Processed save data: {save_data}")
        
        # Check for existing entry
        existing_result = db.saved_results.find_one({
            'folder_id': ObjectId(folder_id),
            'url': result_data.get('url')
        })
        
        if existing_result:
            # Update existing document
            update_result = db.saved_results.update_one(
                {'_id': existing_result['_id']},
                {'$set': {
                    'description': save_data['description'],
                    'ai_summary': save_data['ai_summary'],
                    'custom_notes': save_data['custom_notes'],
                    'last_modified': save_data['last_modified']
                }}
            )
            logger.info(f"Updated existing document: {update_result.modified_count} modified")
            message = 'Result updated successfully'
        else:
            # Insert new document
            insert_result = db.saved_results.insert_one(save_data)
            logger.info(f"Inserted new document with ID: {insert_result.inserted_id}")
            message = 'Result saved successfully'
        
        return jsonify({
            'success': True,
            'message': message
        })
    except Exception as e:
        logger.error(f"Error saving to folder: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
@app.route('/api/folders/<folder_id>/results/<result_id>', methods=['DELETE'])
def delete_folder_content(folder_id, result_id):
    try:
        result = db.saved_results.delete_one({
            '_id': ObjectId(result_id),
            'folder_id': ObjectId(folder_id)
        })

        if result.deleted_count:
            return jsonify({'success': True})
        
        return jsonify({
            'success': False,
            'error': 'Content not found'
        }), 404

    except Exception as e:
        logger.error(f"Error deleting folder content: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/folders/<folder_id>', methods=['DELETE'])
def delete_folder(folder_id):
    try:
        # Delete all related content first
        db.saved_results.delete_many({'folder_id': ObjectId(folder_id)})
        db.chat_messages.delete_many({'folder_id': ObjectId(folder_id)})
        
        # Delete the folder itself
        result = db.folders.delete_one({'_id': ObjectId(folder_id)})
        
        if result.deleted_count:
            return jsonify({'success': True})
            
        return jsonify({
            'success': False,
            'error': 'Folder not found'
        }), 404

    except Exception as e:
        logger.error(f"Error deleting folder: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/summarize', methods=['POST'])
@handle_api_error
def summarize_paper():
    try:
        data = request.get_json()
        if not data:
            logger.error("No JSON data received")
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400

        url = data.get('url')
        title = data.get('title', '')

        logger.info(f"Summarizing paper: {title}")
        logger.debug(f"URL: {url}")

        if not url:
            return jsonify({
                'success': False,
                'error': 'URL is required'
            }), 400

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')
        content = ''

        # Extract content based on source
        if 'arxiv.org' in url:
            abstract_elem = soup.select_one('.abstract')
            if abstract_elem:
                content = abstract_elem.text.replace('Abstract:', '').strip()
        elif 'biorxiv.org' in url:
            abstract_elem = soup.select_one('.abstract-content')
            if abstract_elem:
                content = abstract_elem.text.strip()
        else:
            tldr_elem = soup.select_one('.tldr-abstract-replacement.text-truncator')
            if tldr_elem:
                content = tldr_elem.text.strip()
            else:
                abstract = soup.find('meta', {'name': 'description'})
                if abstract and abstract.get('content'):
                    content = abstract['content']

        if not content:
            return jsonify({
                'success': False,
                'error': 'Could not extract paper content'
            }), 400

        prompt = f"""Please provide a concise summary of this research paper:
        Title: {title}
        Content: {content}
        
        Please format the summary in the following structure:
        1. Main objective: (2-3 sentences about the paper's main goal)
        2. Key findings: (2-3 sentences about the main results)
        3. Significance: (2-3 sentences about why this matters)
        4. Disruption: (2-3 sentences about how this might be disruptive to current processes)"""

        # Use Claude for summarization
        try:
            response = anthropic_client.messages.create(
                model="claude-3-sonnet-20240229",
                messages=[
                    {"role": "system", "content": "You are a research assistant specializing in creating clear, accurate summaries of academic papers. Focus on extracting and explaining the key points concisely."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=1000,
                temperature=0.7
            )
            summary = response.content[0].text
        except Exception as e:
            logger.error(f"Claude API error, falling back to OpenAI: {str(e)}")
            # Fallback to OpenAI if Claude fails
            response = openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are a helpful AI assistant specializing in summarizing academic papers clearly and concisely."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500,
                temperature=0.7
            )
            summary = response.choices[0].message.content

        logger.info("Successfully generated summary")

        return jsonify({
            'success': True,
            'summary': summary
        })

    except Exception as e:
        logger.error(f"Error in summarize_paper: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/proxy_pdf', methods=['POST'])
@handle_api_error
def proxy_pdf():
    try:
        data = request.get_json()
        pdf_url = data.get('url')
        
        if not pdf_url:
            return jsonify({'error': 'No URL provided'}), 400
        
        response = requests.get(pdf_url, stream=True)
        response.raise_for_status()
        
        pdf_io = BytesIO(response.content)
        pdf_io.seek(0)
        
        return send_file(
            pdf_io,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'paper_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf'
        )
    
    except Exception as e:
        logger.error(f"PDF proxy error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/folders/upload', methods=['POST'])
def upload_files():
    """Handle file uploads to folders and generate AI summaries."""
    try:
        logger.info("Received file upload request")
        logger.debug(f"Request form data: {request.form}")
        logger.debug(f"Request files: {request.files}")
        
        # Validate request
        folder_id = request.form.get('folder_id')
        if not folder_id or not ObjectId.is_valid(folder_id):
            return jsonify({'success': False, 'error': 'Invalid folder ID'}), 400

        if 'files' not in request.files:
            return jsonify({'success': False, 'error': 'No files provided'}), 400

        processed_files = process_uploaded_files(request.files.getlist('files'), folder_id)
        
        if processed_files:
            return jsonify({
                'success': True,
                'message': f'Successfully uploaded {len(processed_files)} files',
                'files': processed_files
            })
        
        return jsonify({'success': False, 'error': 'No valid files were processed'}), 400

    except Exception as e:
        logger.error(f"Error uploading files: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

def process_uploaded_files(files, folder_id):
    """Process uploaded files and generate summaries."""
    processed_files = []

    for file in files:
        if not file or not allowed_file(file.filename):
            continue

        try:
            filename = secure_filename(file.filename)
            logger.info(f"Processing file: {filename}")
            
            # Process file content
            content = extract_file_content(file, filename)
            if not content:
                continue

            # Save to MongoDB
            result_id = save_file_to_db(folder_id, filename, content)
            if result_id:
                processed_files.append({
                    'filename': filename,
                    'id': str(result_id)
                })
                
                # Generate summary asynchronously
                generate_ai_summary(result_id, content)

        except Exception as e:
            logger.error(f"Error processing file {file.filename}: {str(e)}")
            continue

    return processed_files

def extract_file_content(file, filename):
    """Extract text content from uploaded file."""
    try:
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            file.save(temp_file.name)
            file_ext = filename.rsplit('.', 1)[1].lower()
            
            content = None
            if file_ext == 'pdf':
                content = extract_text_from_pdf(temp_file.name)
            elif file_ext in ['doc', 'docx']:
                content = extract_text_from_docx(temp_file.name)
            
            os.unlink(temp_file.name)
            return content
    except Exception as e:
        logger.error(f"Error extracting content from {filename}: {str(e)}")
        return None

def save_file_to_db(folder_id, filename, content):
    """Save file information to MongoDB."""
    try:
        file_ext = filename.rsplit('.', 1)[1].lower()
        save_data = {
            'folder_id': ObjectId(folder_id),
            'title': filename,
            'description': f"Uploaded {file_ext.upper()} document",
            'content_type': file_ext,
            'content': content[:1000] + "..." if len(content) > 1000 else content,
            'ai_summary': "Processing summary...",
            'custom_notes': '',
            'engine': 'upload',
            'saved_at': datetime.utcnow(),
            'url': '#'
        }
        
        result = db.saved_results.insert_one(save_data)
        return result.inserted_id
    except Exception as e:
        logger.error(f"Error saving file to database: {str(e)}")
        return None

def generate_ai_summary(result_id, content):
    """Generate AI summary for the uploaded content."""
    try:
        summary_prompt = f"Please summarize this document:\n\n{content[:2000]}..."
        
        try:
            # Try Claude first with custom research assistant prompt
            ai_summary = generate_claude_summary(summary_prompt)
        except Exception as claude_error:
            logger.error(f"Claude API error, falling back to OpenAI: {str(claude_error)}")
            # Fallback to OpenAI
            ai_summary = generate_openai_summary(summary_prompt)

        # Update MongoDB with summary
        db.saved_results.update_one(
            {'_id': result_id},
            {'$set': {'ai_summary': ai_summary}}
        )

    except Exception as e:
        logger.error(f"Error generating summary: {str(e)}")
        db.saved_results.update_one(
            {'_id': result_id},
            {'$set': {'ai_summary': "Failed to generate summary"}}
        )

def generate_claude_summary(prompt):
    """Generate summary using Claude with custom research assistant prompt."""
    response = anthropic_client.messages.create(
        model="claude-3-sonnet-20240229",
        messages=[
            {"role": "system", "content": """You are a helpful research assistant AI tasked with aiding in the creation of a professional research report. Your goal is to collaborate with the user to develop a comprehensive and well-structured report based on the available information and further inquiries.

First, review the contents of the research folder:
<folder_contents>
{{FOLDER_CONTENTS}}
</folder_contents>

Next, review the previous chat history to understand the context and progress of the research:
<chat_history>
{{CHAT_HISTORY}}
</chat_history>

After reviewing the folder contents and chat history, your task is to:

1. Ask questions to better understand the research topic. Focus on the following areas:
   - Who uses the topic of research?
   - Why would they use the topic of research?
   - What are the potential areas of disruption?
   - Any other relevant questions that would help clarify the research scope and objectives

2. Continue asking questions until you feel you have a comprehensive understanding of the research topic and its implications.

3. Once you believe all necessary questions have been answered, ask the user if they would like to create a formalized outline for the research report.

4. If the user agrees to create an outline, propose a structure for the research report based on the information gathered. Include main sections and subsections that would effectively organize the research findings.

Throughout this process, maintain a professional and collaborative tone. Be prepared to adapt your approach based on the user's responses and preferences.

Please format your output as follows:

<research_assistant>
[Your questions, comments, and proposed outline go here]
</research_assistant>

Begin by introducing yourself and asking your first question about the research topic."""},
            {"role": "user", "content": prompt}
        ],
        max_tokens=1000,
        temperature=0.7
    )
    return response.content[0].text

def generate_openai_summary(prompt):
    """Generate summary using OpenAI as fallback."""
    response = openai_client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that summarizes documents."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=500
    )
    return response.choices[0].message.content

# Utility function to check allowed file extensions
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def extract_text_from_pdf(file_path):
    try:
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {str(e)}")
        return None

def extract_text_from_docx(file_path):
    try:
        doc = docx.Document(file_path)
        text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        return text
    except Exception as e:
        logger.error(f"Error extracting text from DOCX: {str(e)}")
        return None

# Configuration endpoint
@app.route('/api/config')
def get_config():
    """Get application configuration (safe values only)"""
    config = {
        'search_engines': [
            'duckduckgo',
            'arxiv',
            'biorxiv',
            'semantic_scholar'
        ],
        'ai_providers': [
            'openai',
            'anthropic'
        ],
        'rate_limits': {
            'search': 1,  # calls per second
            'summarize': 1,
            'chat': 1
        },
        'max_results_per_search': 5,
        'features': {
            'pdf_proxy': True,
            'chat': True,
            'summarize': True,
            'folders': True
        }
    }
    
    return jsonify(config), 200

# Error Handlers
@app.errorhandler(404)
def not_found_error(error):
    return jsonify({
        'success': False,
        'error': 'Resource not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

# Health check endpoint
@app.route('/health')
def health_check():
    """Health check endpoint for monitoring"""
    try:
        # Check MongoDB connection
        mongo_status = mongo_client.admin.command('ping')
        
        # Check API clients
        openai_status = bool(openai_client.api_key)
        anthropic_status = bool(anthropic_client.api_key)
        
        status = {
            'status': 'healthy',
            'mongodb': bool(mongo_status),
            'openai_api': openai_status,
            'anthropic_api': anthropic_status,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        return jsonify(status), 200
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

# Metrics endpoint
@app.route('/metrics')
def metrics():
    """Basic metrics endpoint for monitoring"""
    try:
        metrics_data = {
            'folder_count': db.folders.count_documents({}),
            'saved_results_count': db.saved_results.count_documents({}),
            'chat_messages_count': db.chat_messages.count_documents({}),
            'timestamp': datetime.utcnow().isoformat()
        }
        
        return jsonify(metrics_data), 200
    except Exception as e:
        logger.error(f"Metrics collection failed: {str(e)}")
        return jsonify({
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 500

def validate_mongodb_connection():
    """Validate MongoDB connection and create required collections"""
    try:
        collections = db.list_collection_names()
        required_collections = ['folders', 'saved_results', 'chat_messages']
        
        for collection in required_collections:
            if collection not in collections:
                db.create_collection(collection)
                logger.info(f"Created collection: {collection}")
        
        return True
    except Exception as e:
        logger.error(f"MongoDB validation error: {str(e)}")
        return False

def cleanup_old_sessions():
    """Cleanup old chat sessions older than 30 days"""
    try:
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        result = db.chat_messages.delete_many({
            'timestamp': {'$lt': thirty_days_ago}
        })
        logger.info(f"Cleaned up {result.deleted_count} old chat messages")
    except Exception as e:
        logger.error(f"Session cleanup error: {str(e)}")

def init_scheduler():
    """Initialize background task scheduler"""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
        
        scheduler = BackgroundScheduler()
        
        # Add cleanup job to run daily at midnight
        scheduler.add_job(
            cleanup_old_sessions,
            CronTrigger(hour=0, minute=0),
            id='cleanup_sessions'
        )
        
        scheduler.start()
        logger.info("Scheduler initialized successfully")
        return scheduler
    except Exception as e:
        logger.error(f"Scheduler initialization error: {str(e)}")
        return None

def initialize_app():
    """Initialize all application components"""
    try:
        # Validate MongoDB connection and collections
        if not validate_mongodb_connection():
            raise Exception("MongoDB validation failed")
            
        # Initialize scheduler
        scheduler = init_scheduler()
        if not scheduler:
            logger.warning("Background scheduler initialization failed")
        
        # Initialize rate limiter
        rate_limiter = RateLimiter()
        
        logger.info("Application initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Application initialization failed: {str(e)}")
        return False

# Application startup
if __name__ == '__main__':
    try:
        if initialize_app():
            # Set host to '0.0.0.0' to make it accessible from other machines
            app.run(host='0.0.0.0', port=5000, debug=True)
        else:
            logger.error("Failed to initialize application")
            exit(1)
    except Exception as e:
        logger.error(f"Application startup error: {str(e)}")
        exit(1)
