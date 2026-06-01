// netlify/functions/pdf-viewer.js
const projectId = encodeURIComponent("jioshya/other");
const filePath = encodeURIComponent("tempcontent/resume.pdf");
const branch = "main";

const apiUrl = `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${filePath}/raw?ref=${branch}`;

exports.handler = async (event, context) => {
  // 处理CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  // 处理OPTIONS请求
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  const pdfUrl = apiUrl;

  try {
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error("PDF file not found");
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Resume PDF Viewer</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/element-ui/2.15.6/theme-chalk/index.css">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/element-ui/2.15.6/index.js"></script>
        <style>
          body { margin: 0; padding: 0; background: #f5f5f5; font-family: Arial, sans-serif; }
          #controls { 
            margin-bottom: 20px;
            padding: 10px;
            background: white;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            position: sticky;
            top: 0;
          }
          #zoomControls, .download {
            display: inline-block;
          }
          button {
            padding: 5px 15px;
            margin: 0 5px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: #fff;
            cursor: pointer;
          }
          button:hover {
            background: #f0f0f0;
          }

          #pdfContainer {
            padding: 20px;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .page-container {
            position: relative;
            margin-bottom: 20px;
          }
          canvas { 
            max-width: 100%; 
            height: auto; 
            display: block;
          }
          .loading {
            text-align: center;
            padding: 20px;
            font-size: 16px;
            color: #666;
          }
          .linkLayer {
            position: relative;
            pointer-events: none;
          }
          .linkLayer a {
            position: absolute;
            pointer-events: auto;
            background: rgba(0,0,0,0.05);
            transition: background 0.2s;
          }
          .linkLayer a:hover {
            background: rgba(0,0,0,0.1);
          }
        </style>
      </head>
      <body>
      <div id="controls">
        <button id="prev"><< Previous</button>
        <button id="next">Next >></button>
        <span style="margin-left: 15px;">Page: <span id="page_num"></span> / <span id="page_count"></span></span>
        <div id="zoomControls">
          <button id="zoomOut">-</button>
          <span id="zoomLevel">100%</span>
          <button id="zoomIn">+</button>
        </div>
        <div class="download">
          <button class="downloadBtn" id="downloadBtn">Download PDF</button>
        </div>
      </div>
        <div id="pdfContainer">
          <div class="loading">Loading PDF...</div>
        </div>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
          
          let pdfDoc = null;
          let pageNum = 1;
          let pageRendering = false;
          let pageNumPending = null;
          let scale = 1.5;

          function updateZoomLevel() {
            document.getElementById('zoomLevel').textContent = \`\${Math.round(scale * 100)}%\`;
          }

          function decodePdfString(value) {
            if (!value) return '';

            const text = String(value);
            if (!text.startsWith('\\u00fe\\u00ff')) return text;

            let decoded = '';
            for (let i = 2; i + 1 < text.length; i += 2) {
              decoded += String.fromCharCode((text.charCodeAt(i) << 8) | text.charCodeAt(i + 1));
            }
            return decoded;
          }

          function normalizeUrl(value) {
            if (!value) return null;

            const url = String(value).trim();
            if (/^https?:/i.test(url)) return url;
            if (/^9shi\\.cc\\//i.test(url)) return 'https://' + url;
            return null;
          }

          function extractUrls(value) {
            const decoded = decodePdfString(value);
            const matches = decoded.match(/(?:https?:\\/\\/)?9shi\\.cc\\/[A-Za-z0-9]+/gi) || [];
            return matches.map(normalizeUrl).filter(Boolean);
          }

          function resolveAnnotationUrl(link, unsafeUrlUseCounts) {
            const sourceUrl = String(link.url || '');
            const sourceUrls = extractUrls(sourceUrl);
            if (sourceUrls.length) {
              const index = unsafeUrlUseCounts.get(sourceUrl) || 0;
              unsafeUrlUseCounts.set(sourceUrl, index + 1);
              return sourceUrls[Math.min(index, sourceUrls.length - 1)];
            }

            const unsafeUrl = String(link.unsafeUrl || '');
            const urls = extractUrls(unsafeUrl);
            if (!urls.length) return null;

            const index = unsafeUrlUseCounts.get(unsafeUrl) || 0;
            unsafeUrlUseCounts.set(unsafeUrl, index + 1);
            return urls[Math.min(index, urls.length - 1)];
          }

          function comparableUrl(href) {
            return String(href).replace(/^https?:\\/\\//i, '').toLowerCase();
          }

          function appendLinkElement(linkLayer, href, rect) {
            const linkElement = document.createElement('a');
            linkElement.href = href;
            linkElement.target = '_blank';
            linkElement.rel = 'noopener noreferrer';
            
            const [x1, y1, x2, y2] = rect;
            
            linkElement.style.left = \`\${Math.min(x1, x2)}px\`;
            linkElement.style.top = \`\${Math.min(y1, y2)}px\`;
            linkElement.style.width = \`\${Math.abs(x2 - x1)}px\`;
            linkElement.style.height = \`\${Math.abs(y2 - y1)}px\`;
            
            linkLayer.appendChild(linkElement);
          }

          async function appendMissingTextLinks(page, viewport, linkLayer, renderedUrls) {
            const textContent = await page.getTextContent();

            textContent.items.forEach(item => {
              const text = String(item.str || '').trim();
              const urls = extractUrls(text);
              if (urls.length !== 1) return;

              const href = urls[0];
              const displayUrl = href.replace(/^https?:\\/\\//i, '');
              if (text !== displayUrl || renderedUrls.has(comparableUrl(href))) return;

              const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
              const width = item.width * scale;
              const height = Math.abs(transform[3]) || item.height * scale;
              const left = transform[4];
              const top = Math.min(transform[5], transform[5] + transform[3]);

              appendLinkElement(linkLayer, href, [left, top, left + width, top + height]);
              renderedUrls.add(comparableUrl(href));
            });
          }

          async function downloadPDF() {
            try {
              const response = await fetch("${pdfUrl}");
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = "前端开发-石仁骄.pdf";
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
            } catch (error) {
              console.error('Error downloading PDF:', error);
              alert('Failed to download PDF. Please try again.');
            }
          }

          async function renderPage(num) {
            pageRendering = true;
            try {
              const page = await pdfDoc.getPage(num);
              const viewport = page.getViewport({scale});
              
              const container = document.getElementById('pdfContainer');
              container.innerHTML = '';

              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              const linkLayer = document.createElement('div');
              linkLayer.className = 'linkLayer';
              linkLayer.style.width = \`\${viewport.width}px\`;
              linkLayer.style.height = \`\${viewport.height}px\`;

              linkLayer.appendChild(canvas);
              container.appendChild(linkLayer);

              await page.render({
                canvasContext: ctx,
                viewport: viewport
              }).promise;

              const annotations = await page.getAnnotations();
              const unsafeUrlUseCounts = new Map();
              const renderedUrls = new Set();
              annotations
                .filter(a => a.subtype === 'Link')
                .forEach(link => {
                  const href = resolveAnnotationUrl(link, unsafeUrlUseCounts);
                  if (!href) return;

                  const rect = viewport.convertToViewportRectangle(link.rect);
                  appendLinkElement(linkLayer, href, rect);
                  renderedUrls.add(comparableUrl(href));
                });

              await appendMissingTextLinks(page, viewport, linkLayer, renderedUrls);

              pageRendering = false;
              document.getElementById('page_num').textContent = num;
              updateZoomLevel();
            } catch (error) {
              console.error('Error rendering page:', error);
              document.getElementById('pdfContainer').innerHTML = 
                '<p style="color: red; text-align: center;">Error rendering page. Please try again.</p>';
            }
          }

          function queueRenderPage(num) {
            if (pageRendering) {
              pageNumPending = num;
            } else {
              renderPage(num);
            }
          }

          async function loadPDF() {
            try {
              pdfDoc = await pdfjsLib.getDocument("${pdfUrl}").promise;
              document.getElementById('page_count').textContent = pdfDoc.numPages;
              renderPage(pageNum);
              
              document.getElementById('prev').addEventListener('click', () => {
                if (pageNum <= 1) return;
                pageNum--;
                queueRenderPage(pageNum);
              });

              document.getElementById('next').addEventListener('click', () => {
                if (pageNum >= pdfDoc.numPages) return;
                pageNum++;
                queueRenderPage(pageNum);
              });

              document.getElementById('zoomIn').addEventListener('click', () => {
                scale *= 1.25;
                renderPage(pageNum);
              });

              document.getElementById('zoomOut').addEventListener('click', () => {
                scale /= 1.25;
                renderPage(pageNum);
              });

              document.getElementById('downloadBtn').addEventListener('click', downloadPDF);

            } catch (error) {
              console.error('Error loading PDF:', error);
              document.getElementById('pdfContainer').innerHTML = 
                '<p style="color: red; text-align: center;">Error loading PDF. Please try again.</p>';
            }
          }

          loadPDF();
        </script>
      </body>
      </html>
    `;

    return {
      statusCode: 200,
      headers: {
        ...headers,
        "Content-Type": "text/html",
        "Cache-Control": "public, max-age=3600",
      },
      body: html,
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Error loading PDF: " + error.message,
      }),
    };
  }
};
