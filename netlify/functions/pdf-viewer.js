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
          }
          .loading {
            text-align: center;
            padding: 20px;
            font-size: 16px;
            color: #666;
          }
          .linkLayer {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            padding: 20px;
            position: relative;
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
              annotations
                .filter(a => a.subtype === 'Link' && a.url)
                .forEach(link => {
                  const linkElement = document.createElement('a');
                  linkElement.href = link.url;
                  linkElement.target = '_blank';
                  
                  const rect = viewport.convertToViewportRectangle(link.rect);
                  const [x1, y1, x2, y2] = rect;
                  
                  linkElement.style.left = \`\${Math.min(x1, x2)}px\`;
                  linkElement.style.top = \`\${Math.max(y1, y2)}px\`;
                  linkElement.style.width = \`\${Math.abs(x2 - x1)}px\`;
                  linkElement.style.height = \`\${Math.abs(y2 - y1)}px\`;
                  
                  linkLayer.appendChild(linkElement);
                });

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
