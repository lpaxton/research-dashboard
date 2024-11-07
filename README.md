# research-dashboard
A centralized dashboard that transforms academic research workflows by aggregating multiple research repositories into a single intuitive interface.


Install Doc: Research Dashboard

# Research Dashboard Installation Guide

## System Requirements
- Python 3.8 or higher
- Node.js 14 or higher
- npm (Node Package Manager)
- MongoDB Atlas account
- Anthropic API key (for Claude)
- OpenAI API key (as fallback)

## Step 1: Clone the Repository
```bash
git clone <your-repository-url>
cd research-dashboard
```

## Step 2: Set Up Python Environment

### Create and Activate Virtual Environment
```bash
# On macOS/Linux
python3 -m venv venv
source venv/bin/activate

# On Windows
python -m venv venv
.\venv\Scripts\activate
```

### Install Python Dependencies
```bash
pip install flask
pip install flask-cors
pip install openai
pip install anthropic
pip install python-dotenv
pip install pymongo
pip install requests
pip install beautifulsoup4
pip install arxiv
pip install PyPDF2
pip install python-docx
pip install apscheduler
pip install certifi
```

Or install all at once using requirements.txt:
```bash
pip install -r requirements.txt
```

## Step 3: Set Up Node.js Dependencies

```bash
npm install
```

This will install:
- React
- React DOM
- Lucide React (for icons)
- Other dependencies defined in package.json

## Step 4: Environment Configuration

Create a `.env` file in the root directory:
```
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
MONGODB_URI=your_mongodb_connection_string
```

### MongoDB Atlas Setup
1. Create a MongoDB Atlas account
2. Create a new cluster
3. Get your connection string
4. Replace `your_mongodb_connection_string` in `.env` with your actual connection string
5. Ensure your IP address is whitelisted in MongoDB Atlas

## Step 5: Project Structure
Ensure your project structure looks like this:
```
research-dashboard/
├── app.py
├── requirements.txt
├── package.json
├── .env
├── static/
│   ├── js/
│   │   ├── main.js
│   │   ├── folders.js
│   │   ├── components/
│   │   │   ├── chat-assistant.jsx
│   │   │   ├── folder-manager.jsx
│   │   │   └── folder-viewer.jsx
│   │   └── utils/
│   │       └── search-utils.js
│   └── css/
│       └── styles.css
├── templates/
│   ├── base.html
│   ├── index.html
│   └── folders.html
└── uploads/  # Will be created automatically
```

## Step 6: Build the Frontend
```bash
# Build the JavaScript files
npm run build
```

## Step 7: Run the Application

### Development Mode
```bash
# Make sure your virtual environment is activated
python app.py
```

The application will be available at `http://localhost:5000`

### Production Mode
For production deployment, consider using:
- Gunicorn as the WSGI server
- Nginx as a reverse proxy
- PM2 for process management

Example production setup:
```bash
# Install Gunicorn
pip install gunicorn

# Run with Gunicorn
gunicorn app:app -w 4 -b 0.0.0.0:5000
```

## Common Issues and Solutions

### MongoDB Connection Issues
- Verify your MongoDB URI is correct
- Check IP whitelist in MongoDB Atlas
- Ensure proper authentication credentials

### API Key Issues
- Verify API keys are correctly set in .env
- Check API key permissions and quotas
- Ensure .env file is in the correct location

### File Upload Issues
- Check upload folder permissions
- Verify allowed file types in configuration
- Check file size limits

### Build Issues
- Clear npm cache: `npm cache clean --force`
- Remove node_modules and reinstall: 
  ```bash
  rm -rf node_modules
  npm install
  ```

## Security Considerations

1. API Keys
- Never commit .env file
- Rotate API keys periodically
- Use environment-specific keys

2. MongoDB
- Use strong passwords
- Keep MongoDB version updated
- Regular security audits

3. File Uploads
- Validate file types
- Scan for malware
- Implement size limits

## Updating the Application

1. Pull latest changes:
```bash
git pull origin main
```

2. Update dependencies:
```bash
pip install -r requirements.txt
npm install
```

3. Rebuild frontend:
```bash
npm run build
```

4. Restart application

## Monitoring

The application includes several monitoring endpoints:

- `/health` - Check application health
- `/metrics` - Basic application metrics
- Logging is configured in `app.py`

## Support

For issues:
1. Check the error logs
2. Review the application logs
3. Check MongoDB logs
4. Verify API quotas

## Development Notes

When making changes:
1. Update requirements.txt:
```bash
pip freeze > requirements.txt
```

2. Update package.json when adding npm packages:
```bash
npm install package-name --save
```

3. Run tests before deploying:
```bash
# Add your test commands here
```

## Maintenance

Regular maintenance tasks:
1. Update dependencies
2. Check log files
3. Monitor disk space
4. Review API usage
5. Backup MongoDB data

Remember to check for updates to:
- Python packages
- Node.js packages
- MongoDB version
- API versions (OpenAI, Anthropic)
