// DOM Elements
const inputField = document.getElementById('input-field');
const submitBtn = document.getElementById('submit-btn');
const loadingEl = document.getElementById('loading');
const errorContainer = document.getElementById('error-container');
const errorMessage = document.getElementById('error-message');
const errorDismiss = document.getElementById('error-dismiss');
const resultContainer = document.getElementById('result-container');
const summaryList = document.getElementById('summary-list');

// CORS Proxies for fetching web content
const corsProxies = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://cors-anywhere.herokuapp.com/',
  'https://crossorigin.me/'
];

// Event Listeners
submitBtn.addEventListener('click', handleSubmit);
errorDismiss.addEventListener('click', () => {
  errorContainer.classList.add('hidden');
});

// Main submit handler
async function handleSubmit() {
  const input = inputField.value.trim();

  if (!input) {
    showError('Please enter some text or a URL');
    return;
  }

  // Clear previous results
  hideError();
  resultContainer.classList.add('hidden');
  summaryList.innerHTML = '';

  // Show loading
  loadingEl.classList.remove('hidden');
  submitBtn.disabled = true;

  try {
    let contentToSummarize;

    // Check if input is a URL
    if (isValidUrl(input)) {
      contentToSummarize = await fetchWebContent(input);
    } else {
      // Use the input text directly
      contentToSummarize = input;
    }

    // Generate summary using AI
    const summary = await generateSummary(contentToSummarize);
    displaySummary(summary);
  } catch (error) {
    showError(error.message);
  } finally {
    // Hide loading
    loadingEl.classList.add('hidden');
    submitBtn.disabled = false;
  }
}

// Check if string is a valid URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Fetch web content using multiple CORS proxies with fallback
async function fetchWebContent(url) {
  let content = null;
  let lastError = null;

  // Try each proxy in order
  for (const proxy of corsProxies) {
    try {
      const proxyUrl = proxy + encodeURIComponent(url);
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const html = await response.text();

      // Extract readable content using DOMParser
      content = extractReadableContent(html);

      // If we got content, break the loop
      if (content) {
        break;
      }
    } catch (error) {
      lastError = error;
      console.warn(`Proxy ${proxy} failed:`, error);
      // Continue to next proxy
    }
  }

  if (!content && lastError) {
    throw new Error('Failed to fetch web content. This may be due to CORS restrictions or network issues.');
  }

  return content || 'No readable content found';
}

// Extract readable content from HTML
function extractReadableContent(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove scripts, styles, and other non-content elements
    const elementsToRemove = doc.querySelectorAll('script, style, iframe, nav, footer, header, aside');
    elementsToRemove.forEach(el => el.remove());

    // Get main content areas
    const mainElements = doc.querySelectorAll('main, article, .content, .main, #content, #main');

    if (mainElements.length > 0) {
      // Use the first main content area
      return Array.from(mainElements).map(el => el.textContent).join(' ');
    }

    // Fallback: get all paragraphs
    const paragraphs = doc.querySelectorAll('p');
    if (paragraphs.length > 0) {
      return Array.from(paragraphs).map(p => p.textContent).join(' ');
    }

    // Last resort: just get the body text
    return doc.body.textContent;
  } catch (error) {
    console.error('Error parsing HTML:', error);
    return html; // Return the raw HTML if parsing fails
  }
}

// Generate summary using AI
async function generateSummary(text) {
  // Limit text length to avoid overwhelming the AI model
  const truncatedText = text.length > 10000 ? text.substring(0, 10000) + '...' : text;

  try {
    const completion = await websim.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a text summarization assistant. Create a concise summary of the provided text as a list of bullet points. Each bullet point should be a separate item in a JSON array. Focus on the main ideas and key points. Aim for 5-7 bullet points. Respond ONLY with a JSON array of strings, with each string being a bullet point.`
        },
        {
          role: "user",
          content: truncatedText
        }
      ],
      json: true
    });

    // Parse the response as JSON
    try {
      const bulletPoints = JSON.parse(completion.content);
      if (Array.isArray(bulletPoints)) {
        return bulletPoints;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (jsonError) {
      console.error('Failed to parse JSON response:', jsonError);
      // If JSON parsing fails, try to extract bullet points manually
      return extractBulletPoints(completion.content);
    }
  } catch (error) {
    console.error('AI summarization error:', error);
    throw new Error('Failed to generate summary. Please try again.');
  }
}

// Fallback function to extract bullet points from text if JSON parsing fails
function extractBulletPoints(text) {
  // Try to find anything that looks like a bullet point
  const lines = text.split('\n').filter(line => line.trim());
  const bulletPointsRegex = /^\s*[-•*]\s+(.+)$/

  const bulletPoints = [];

  for (const line of lines) {
    const match = line.match(bulletPointsRegex);
    if (match) {
      bulletPoints.push(match[1]);
    }
  }

  // If no bullet points were found, just split by newlines
  if (bulletPoints.length === 0) {
    return lines;
  }

  return bulletPoints;
}

// Display the summary
function displaySummary(bulletPoints) {
  summaryList.innerHTML = '';

  bulletPoints.forEach(point => {
    const li = document.createElement('li');
    li.textContent = point;
    summaryList.appendChild(li);
  });

  resultContainer.classList.remove('hidden');
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorContainer.classList.remove('hidden');
}

// Hide error message
function hideError() {
  errorContainer.classList.add('hidden');
}