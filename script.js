const canvas = document.getElementById('roomCanvas');
const ctx = canvas.getContext('2d');

const PDF_JS_URL =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';

const PDF_JS_WORKER_URL =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

const PDF_SOURCES = [
    './pdf/KUNST.pdf',
    './pdf/Konzeptpapier.pdf'
];

const WIKI_TERMS = [
    'Soziale Plastik',
    'Joseph Beuys',
    'Kunst als Erfahrung',
    'Georg W. Bertram'
];

let fragments = [];
let wikiFragments = [];

let animationTime = 0;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

async function loadExternalScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');

        script.src = url;
        script.onload = resolve;
        script.onerror = reject;

        document.head.appendChild(script);
    });
}

async function ensurePdfJs() {
    if (window.pdfjsLib) {
        return window.pdfjsLib;
    }

    await loadExternalScript(
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    );

    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        return window.pdfjsLib;
    }

    throw new Error('PDF.js konnte nicht initialisiert werden');
}

function cleanText(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function splitIntoFragments(text) {
    const words = cleanText(text)
        .split(' ')
        .filter(Boolean);

    const chunks = [];
    let current = [];

    for (const word of words) {
        current.push(word);

        if (current.length >= 12) {
            chunks.push(current.join(' '));
            current = [];
        }
    }

    if (current.length) {
        chunks.push(current.join(' '));
    }

    return chunks;
}

async function extractPdfFragments(path) {
    try {
        const pdfjs = await ensurePdfJs();

        const loadingTask = pdfjs.getDocument(path);
        const pdf = await loadingTask.promise;

        let fullText = '';

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);

            const textContent = await page.getTextContent();

            const pageText = textContent.items
                .map(item => item.str)
                .join(' ');

            fullText += ` ${pageText}`;
        }

        return splitIntoFragments(fullText);

    } catch (error) {
        console.error('PDF Fehler:', path, error);
        return [];
    }
}

async function loadAllPdfFragments() {
    const allFragments = [];

    for (const source of PDF_SOURCES) {
        const extracted = await extractPdfFragments(source);

        for (const text of extracted) {
            allFragments.push({
                text,
                source,
                x: 0,
                y: 0,
                gridX: 0,
                gridY: 0,
                opacity: 0.8,
                size: 15 + Math.random() * 6
            });
        }
    }

    return allFragments;
}

async function fetchWikipediaRelations() {
    const collected = [];

    for (const term of WIKI_TERMS) {
        try {
            const response = await fetch(
                `https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`
            );

            const data = await response.json();

            if (data.extract) {
                collected.push({
                    term,
                    text: data.extract.slice(0, 180)
                });
            }

        } catch (error) {
            console.warn('Wikipedia Fehler:', term);
        }
    }

    wikiFragments = collected;
}

function initializeFragments() {
    const spacingX = 260;
    const spacingY = 90;

    const cols = Math.max(
        1,
        Math.floor(canvas.width / spacingX)
    );

    fragments.forEach((fragment, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);

        const offsetX =
            (Math.random() - 0.5) * 30;

        const offsetY =
            (Math.random() - 0.5) * 20;

        fragment.gridX =
            120 + col * spacingX + offsetX;

        fragment.gridY =
            120 + row * spacingY + offsetY;

        fragment.x = fragment.gridX;
        fragment.y = fragment.gridY;
    });
}

function applyMotion(fragment, index) {
    const t = performance.now() * 0.00012;

    fragment.x =
        fragment.gridX +
        Math.sin(t + index * 0.12) * 18;

    fragment.y =
        fragment.gridY +
        Math.cos(t + index * 0.08) * 10;
}

function drawBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createLinearGradient(
        0,
        0,
        0,
        canvas.height
    );

    gradient.addColorStop(0, '#18191a');
    gradient.addColorStop(0.5, '#121314');
    gradient.addColorStop(1, '#090909');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 120; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;

        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(x, y, 2, 2);
    }
}

function drawFragment(fragment) {
    ctx.save();

    ctx.font = `${fragment.size}px "Arial Narrow", sans-serif`;

    ctx.fillStyle = `rgba(239,235,224,${fragment.opacity})`;

    ctx.fillText(
        fragment.text,
        fragment.x,
        fragment.y
    );

    ctx.restore();
}

function drawWikipediaRelations() {
    if (!wikiFragments.length) return;

    const visibleCount = Math.min(
        wikiFragments.length,
        fragments.length
    );

    for (let i = 0; i < visibleCount; i++) {
        const fragment = fragments[i];

        ctx.save();

        ctx.beginPath();

        ctx.arc(
            fragment.x - 18,
            fragment.y - 8,
            3,
            0,
            Math.PI * 2
        );

        ctx.fillStyle = '#d1bf58';
        ctx.fill();

        ctx.restore();
    }
}

function render() {
    animationTime += 0.01;

    drawBackground();

    fragments.forEach((fragment, index) => {
        applyMotion(fragment, index);
        drawFragment(fragment);
    });

    drawWikipediaRelations();

    requestAnimationFrame(render);
}

async function bootstrap() {
    fragments = await loadAllPdfFragments();

    if (!fragments.length) {
        console.error('Keine PDF-Fragmente geladen');
        return;
    }

    initializeFragments();

    fetchWikipediaRelations();

    render();
}

bootstrap();
