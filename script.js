// --- Element References (Corrected to match HTML IDs) ---
const summariseBtn = document.getElementById('summariseBtn');
const ipTxt = document.getElementById('ipTxt');
const summaryOp = document.getElementById('summaryOp');
const summaryBox = document.getElementById('summaryBox');
const loader = document.getElementById('loader');
const errMsg = document.getElementById('errMsg');
const errTxt = document.getElementById('errTxt');
const copyBtn = document.getElementById('copyBtn');
const summaryLen = document.getElementById('summaryLen');
const domain = document.getElementById('domain');
const tone = document.getElementById('tone');
const dropZone = document.getElementById('dropZone');
const fileIp = document.getElementById('fileIp');
const keywordBox = document.getElementById('keywordBox');
const keywordOp = document.getElementById('keywordOp');


// --- Event Listeners ---
summariseBtn.addEventListener('click', handlesummarise);
copyBtn.addEventListener('click', copySummaryToClipboard);
dropZone.addEventListener('click', () => fileIp.click());
fileIp.addEventListener('change', (e) => handleFile(e.target.files[0]));

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drop-zone--over');
});

['dragleave', 'dragend'].forEach(type => {
    dropZone.addEventListener(type, () => {
        dropZone.classList.remove('drop-zone--over');
    });
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
    dropZone.classList.remove('drop-zone--over');
});

// --- File Handling Logic ---
async function handleFile(file) {
    if (!file) return;

    ipTxt.value = '';
    ipTxt.placeholder = `Processing "${file.name}"... Please wait.`;
    hideError();

    const fileExtension = file.name.split('.').pop().toLowerCase();
    
    try {
        let extractedText = '';
        if (fileExtension === 'pdf') {
            extractedText = await extractTextFromPdf(file);
        } else if (fileExtension === 'docx') {
            extractedText = await extractTextFromDocx(file);
        } else {
            showError("Unsupported file type. Please upload a PDF or DOCX file.");
            ipTxt.placeholder = "Paste your article, report, or any text here...";
            return;
        }
        ipTxt.value = extractedText;
        ipTxt.placeholder = "Paste your article, report, or any text here...";
    } catch (error) {
        console.error('File processing error:', error);
        showError(`Failed to process the file: ${error.message}`);
        ipTxt.placeholder = "Paste your article, report, or any text here...";
    }
}

async function extractTextFromPdf(file) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js`;
    const fileReader = new FileReader();
    return new Promise((resolve, reject) => {
        fileReader.onload = async function() {
            try {
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join(' ') + '\n';
                }
                resolve(fullText);
            } catch (error) {
                reject(error);
            }
        };
        fileReader.onerror = reject;
        fileReader.readAsArrayBuffer(file);
    });
}

async function extractTextFromDocx(file) {
    const fileReader = new FileReader();
    return new Promise((resolve, reject) => {
        fileReader.onload = function(event) {
            mammoth.extractRawText({ arrayBuffer: event.target.result })
                .then(result => resolve(result.value))
                .catch(reject);
        };
        fileReader.onerror = reject;
        fileReader.readAsArrayBuffer(file);
    });
}

// --- Summarization Logic ---
async function handlesummarise() {
    const textTosummarise = ipTxt.value.trim();
    if (!textTosummarise) {
        showError("Please enter some text or upload a file to summarise.");
        return;
    }
    // Corrected variable names to get values
    const lengthValue = summaryLen.value;
    const domainValue = domain.value.trim();
    const toneValue = tone.value;

    hideError();
    summaryBox.classList.add('hidden');
    loader.classList.remove('loader-container');
    loader.classList.add('loader-container'); // Correctly show loader
    summariseBtn.disabled = true;

    try {
        const fullResponse = await callGeminiApi(textTosummarise, lengthValue, domainValue, toneValue);
        
        const separator = "Key Terms:";
        let summaryText = fullResponse;
        let keyTermsText = "";

        if (fullResponse.includes(separator)) {
            const parts = fullResponse.split(separator);
            summaryText = parts[0].trim();
            keyTermsText = parts[1].trim();
        }
        
        displaySummary(summaryText, keyTermsText);

    } catch (error) {
        console.error("Error during summarization:", error);
        showError(error.message || "An unknown error occurred. Please try again.");
    } finally {
        loader.classList.add('hidden');
        summariseBtn.disabled = false;
    }
}

async function callGeminiApi(text, length, domain, tone, retries = 3, delay = 1000) {
    // !!! IMPORTANT: REPLACE WITH YOUR GOOGLE AI API KEY !!!
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
    
    let systemPrompt = `You are an expert in summarizing text. Your primary goal is to provide a clear and accurate summary based on the user's specifications. 
    After the summary, you MUST identify 5-10 of the most important key terms or concepts from the text.
    
    FORMAT YOUR RESPONSE EXACTLY AS FOLLOWS:
    1.  Provide the summary first.
    2.  Then, on a new line, write the separator "Key Terms:".
    3.  After the separator, list the key terms separated by commas.
    
    USER SPECIFICATIONS:
    - The desired length of the summary is: ${length}.
    - The desired tone of the summary is: ${tone}.`;

    if (domain) {
        systemPrompt += `\n- Pay special attention to the following key terms or domain: ${domain}.`;
    }
    
    const payload = {
        contents: [{ parts: [{ text: text }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
            }
            const result = await response.json();
            const candidate = result.candidates?.[0];
            if (candidate && candidate.content?.parts?.[0]?.text) {
                return candidate.content.parts[0].text;
            } else if (candidate && candidate.finishReason === "SAFETY") {
                throw new Error("The response was blocked due to safety settings. Try modifying the text.");
            } else {
                throw new Error("Invalid response structure from the API.");
            }
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
        }
    }
    throw new Error("Failed to get a response after multiple retries.");
}

// --- Helper Functions ---
function displaySummary(summary, keyTerms) {
    summaryOp.textContent = summary;
    keywordOp.innerHTML = ''; // Clear previous terms

    if (keyTerms) {
        keywordBox.classList.remove('hidden');
        const termsArray = keyTerms.split(',').map(term => term.trim()).filter(term => term);
        
        termsArray.forEach(term => {
            const termElement = document.createElement('span');
            termElement.className = 'key-term-tag';
            termElement.textContent = term;
            keywordOp.appendChild(termElement);
        });
    } else {
        keywordBox.classList.add('hidden');
    }
    
    summaryBox.classList.remove('hidden');
}

function showError(message) {
    errTxt.textContent = message;
    errMsg.classList.remove('hidden');
}

function hideError() {
    errMsg.classList.add('hidden');
}

function copySummaryToClipboard() {
    navigator.clipboard.writeText(summaryOp.textContent).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy Summary'; }, 2000);
    }, (err) => {
        console.error('Failed to copy text: ', err);
    });
}