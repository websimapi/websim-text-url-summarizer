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
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://thingproxy.freeboard.io/fetch/',
  'https://cors-proxy.htmldriven.com/?url=',
  'https://proxy.cors.sh/',
  'https://corsproxy.org/?',
  'https://cors.bridged.cc/'
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
    let isUrl = isValidUrl(input);

    // Check if input is a URL
    if (isUrl) {
      try {
        contentToSummarize = await fetchWebContent(input);
      } catch (fetchError) {
        console.error('Failed to fetch web content:', fetchError);

        // Show a user-friendly message but don't stop processing
        const fetchErrorMessage = document.createElement('div');
        fetchErrorMessage.className = 'fetch-error';
        fetchErrorMessage.textContent = 'Could not fetch web content directly. Attempting to summarize from URL information.';
        summaryList.appendChild(fetchErrorMessage);

        // Try a different approach: let the AI try to work with just the URL
        contentToSummarize = `URL: ${input}\n\nPlease summarize what you know about this website or topic based on the URL, as I couldn't fetch its content directly.`;
      }
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

  // Try direct fetch first (might work for some sites)
  try {
    const response = await fetch(url, { mode: 'no-cors' });
    if (response.ok) {
      const html = await response.text();
      content = extractReadableContent(html);
      if (content) return content;
    }
  } catch (error) {
    console.warn('Direct fetch failed, trying proxies...', error);
  }

  // If direct fetch fails, try each proxy in order
  for (const proxy of corsProxies) {
    try {
      let proxyUrl;

      // Different proxies have different URL patterns
      if (proxy === 'https://cors-proxy.htmldriven.com/?url=') {
        proxyUrl = `${proxy}${encodeURIComponent(url)}&mode=native`;
      } else if (proxy === 'https://proxy.cors.sh/' || proxy === 'https://cors.bridged.cc/') {
        proxyUrl = proxy + url;
      } else {
        proxyUrl = proxy + encodeURIComponent(url);
      }

      console.log(`Trying proxy: ${proxy}`);
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      let html;

      // Some proxies return JSON with the content in a specific property
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        html = data.contents || data.content || data.body || data.data || '';
      } else {
        html = await response.text();
      }

      if (!html) {
        throw new Error('Empty response from proxy');
      }

      // Extract readable content using DOMParser
      content = extractReadableContent(html);

      // If we got content, break the loop
      if (content && content.length > 100) { // Ensure we have meaningful content
        console.log(`Successfully fetched content using ${proxy}`);
        break;
      }
    } catch (error) {
      lastError = error;
      console.warn(`Proxy ${proxy} failed:`, error);
      // Continue to next proxy
    }
  }

  if (!content || content.length < 100) {
    // If all proxies failed or returned minimal content
    throw new Error('Failed to fetch web content. This may be due to CORS restrictions or the website blocking access. Try pasting the text directly instead.');
  }

  return content;
}

// Extract readable content from HTML
function extractReadableContent(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove scripts, styles, and other non-content elements
    const elementsToRemove = doc.querySelectorAll(
      'script, style, iframe, nav, footer, header, aside, noscript, svg, form, button, input, .banner, .ad, .advertisement, .header, .footer, .nav, .sidebar'
    );
    elementsToRemove.forEach(el => el.remove());

    // Attempt to identify the main content
    const contentHierarchy = [
      // Try to find article content first
      () => Array.from(doc.querySelectorAll('article, [role="article"], .article, .post, .entry, .blog-post')),
      // Then try to find main content areas
      () => Array.from(doc.querySelectorAll('main, [role="main"], #main, .main, #content, .content, #mainContent, .mainContent')),
      // Look for common content containers
      () => Array.from(doc.querySelectorAll('.post-content, .entry-content, .article-content, .content-area, .page-content')),
      // Look for the largest div with substantial text
      () => findLargestTextBlock(doc),
      // Fallback to paragraphs
      () => Array.from(doc.querySelectorAll('p')),
      // Last resort: body text
      () => [doc.body]
    ];

    // Try each method in order until we get content
    for (const method of contentHierarchy) {
      const elements = method();
      if (elements && elements.length > 0) {
        let contentText = elements.map(el => el.textContent).join(' ');
        contentText = cleanText(contentText);

        // Check if we got meaningful content (more than just a few words)
        if (contentText.length > 200 || contentText.split(' ').length > 30) {
          return contentText;
        }
      }
    }

    // If all else fails, use the body content after cleaning
    return cleanText(doc.body.textContent);
  } catch (error) {
    console.error('Error parsing HTML:', error);
    // Try to clean the raw HTML as a last resort
    return cleanText(html.replace(/<[^>]*>/g, ' '));
  }
}

// Find the div with the most text content (likely the main content)
function findLargestTextBlock(doc) {
  const divs = Array.from(doc.querySelectorAll('div'));
  let largestDiv = null;
  let maxLength = 0;

  divs.forEach(div => {
    // Skip tiny divs and those with mostly links
    if (div.querySelectorAll('a').length > div.querySelectorAll('p').length * 2) {
      return;
    }

    const text = div.textContent;
    if (text.length > maxLength) {
      maxLength = text.length;
      largestDiv = div;
    }
  });

  return largestDiv ? [largestDiv] : [];
}

// Clean up extracted text
function cleanText(text) {
  if (!text) return '';

  return text
    .replace(/\s+/g, ' ')              // Replace multiple spaces with a single space
    .replace(/\n+/g, ' ')              // Replace newlines with spaces
    .replace(/\t+/g, ' ')              // Replace tabs with spaces
    .replace(/\s+([.,;:!?])/g, '$1')   // Remove spaces before punctuation
    .replace(/\s+/g, ' ')              // Final cleanup of spaces
    .trim();
}

// Generate summary using AI
async function generateSummary(text) {
  // Check if this is a URL-only request
  const isUrlOnly = text.startsWith('URL:');

  // Limit text length to avoid overwhelming the AI model
  const truncatedText = text.length > 12000 ? text.substring(0, 12000) + '...' : text;

  try {
    const completion = await websim.chat.completions.create({
      messages: [
        {
          role: "system",
          content: isUrlOnly ?
            `You are a URL analyzer and summarizer. The user couldn't access the content of a URL directly, so they're asking you to provide information about what this website or topic might be about based on the URL itself. Create a concise summary as a list of bullet points. Each bullet point should be a separate item in a JSON array. Focus on what you know about this website, organization, or topic. If you have no information, provide general points about what such a website might contain. Aim for 3-5 bullet points. Respond ONLY with a JSON array of strings, with each string being a bullet point.` :
            `You are a text summarization assistant. Create a concise summary of the provided text as a list of bullet points. Each bullet point should be a separate item in a JSON array. Focus on the main ideas and key points. Aim for 5-7 bullet points. Respond ONLY with a JSON array of strings, with each string being a bullet point.`
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

  // Check if there's already a fetch error message (from URL-only mode)
  const hasUrlOnlyWarning = document.querySelector('.fetch-error') !== null;

  // If we don't have a warning yet and the input is a URL, check if we're using URL-only mode
  if (!hasUrlOnlyWarning && isValidUrl(inputField.value.trim())) {
    const contentToSummarize = inputField.value.trim();
    if (document.querySelector('.fetch-error') === null) {
      // Add a note about the source of the summary
      const sourceNote = document.createElement('div');
      sourceNote.className = 'source-note';
      sourceNote.textContent = `Summary based on content from: ${contentToSummarize}`;
      summaryList.appendChild(sourceNote);
    }
  }

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