const canvas = document.getElementById('roomCanvas');
const ctx = canvas.getContext('2d');

const PDF_JS_URL =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';

const PDF_JS_WORKER_URL =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

const PDF_SOURCES = [
    './pdf/konzeptpapier.pdf',
    './pdf/kunstraum.pdf'
];

const WIKI_TERMS = [
    'Soziale Plastik',
    'Joseph Beuys',
    'Kunst als Erfahrung',
    'Georg W. Bertram',
    `Kunst`,
    `Bildhauerei`,
];

let fragments = [];
let wikiFragments = [];

let animationTime = 0;
let layoutTime = 0;

const LAYOUT = {
    spacingX: 260,
    spacingY: 88,
    marginX: 100,
    marginY: 110,
    rowDelay: 0.88,
    cellDelay: 0.045,
    riseDistance: 34,
    driftX: 5,
    driftY: 3
};

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    if (fragments.length) {
        layoutFragments();
    }
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
                size: 14.5 + (text.length % 7) * 0.55
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

function layoutFragments() {
    const usableWidth = Math.max(1, canvas.width - LAYOUT.marginX * 2);
    const cols = Math.max(1, Math.floor(usableWidth / LAYOUT.spacingX));

    fragments.forEach((fragment, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);

        fragment.row = row;
        fragment.col = col;
        fragment.rowOrder = row * cols + col;

        fragment.targetX =
            LAYOUT.marginX + col * LAYOUT.spacingX;

        fragment.targetY =
            LAYOUT.marginY + row * LAYOUT.spacingY;

        fragment.revealDelay =
            row * LAYOUT.rowDelay + col * LAYOUT.cellDelay;

        fragment.x = fragment.targetX;
        fragment.y = fragment.targetY + LAYOUT.riseDistance;
        fragment.opacity = 0;
    });

    fragments.sort((left, right) => left.rowOrder - right.rowOrder);
}

function getFragmentProgress(fragment) {
    const elapsed = layoutTime - fragment.revealDelay;

    if (elapsed <= 0) {
        return 0;
    }

    return Math.min(1, elapsed / 1.8);
}

function applyMotion(fragment, index) {
    const progress = getFragmentProgress(fragment);
    const eased = 1 - Math.pow(1 - progress, 3);
    const t = animationTime * 0.16;

    const driftX = Math.sin(t + index * 0.21) * LAYOUT.driftX;
    const driftY = Math.cos(t * 0.72 + index * 0.14) * LAYOUT.driftY;

    fragment.x =
        fragment.targetX +
        driftX * eased * 0.55;

    fragment.y =
        fragment.targetY +
        (1 - eased) * LAYOUT.riseDistance +
        driftY * eased * 0.45;

    fragment.opacity = 0.1 + progress * 0.88;
}

function drawBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createLinearGradient(
        0,
        0,
        0,
        canvas.height
    );

    gradient.addColorStop(0, '#1a1a18');
    gradient.addColorStop(0.45, '#131412');
    gradient.addColorStop(1, '#090909');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gridSpacing = 72;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.028)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= canvas.width; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y <= canvas.height; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 86.5);
    ctx.lineTo(canvas.width, canvas.height - 86.5);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    for (let i = 0; i < 7; i++) {
        const x = 96 + i * 220;
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - 86);
        ctx.lineTo(x, canvas.height - 320 - (i % 2) * 26);
        ctx.stroke();
    }

    ctx.restore();

    const stains = [
        [0.18, 0.2, 260, 180, 0.16],
        [0.7, 0.27, 320, 210, 0.12],
        [0.52, 0.72, 380, 240, 0.1],
        [0.84, 0.78, 220, 170, 0.14],
        [0.32, 0.58, 240, 150, 0.08]
    ];

    stains.forEach(([fx, fy, width, height, opacity], index) => {
        const x = canvas.width * fx;
        const y = canvas.height * fy;

        const stain = ctx.createRadialGradient(x, y, 0, x, y, Math.max(width, height));
        stain.addColorStop(0, `rgba(255,255,255,${opacity})`);
        stain.addColorStop(0.55, 'rgba(255,255,255,0.02)');
        stain.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = stain;
        ctx.beginPath();
        ctx.ellipse(
            x,
            y,
            width * (0.82 + index * 0.04),
            height * (0.78 + index * 0.03),
            index * 0.2,
            0,
            Math.PI * 2
        );
        ctx.fill();
    });

    const grainStep = 22;
    for (let y = 0; y < canvas.height; y += grainStep) {
        for (let x = 0; x < canvas.width; x += grainStep) {
            const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            const value = seed - Math.floor(seed);

            if (value > 0.75) {
                ctx.fillStyle = `rgba(255,255,255,${0.012 + (value - 0.75) * 0.024})`;
                ctx.fillRect(x, y, 2, 2);
            }
        }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.012)';
    for (let i = 0; i < 8; i++) {
        const x = (canvas.width / 9) * (i + 0.35);
        ctx.fillRect(x, 0, 1, canvas.height);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.015)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        const y = (canvas.height / 6) * (i + 0.6);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
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

function getRelationAnchor(index) {
    const total = Math.max(1, wikiFragments.length);
    const baseY = 120 + index * 92;
    const wave = Math.sin(animationTime * 0.06 + index * 0.9) * 18;

    return {
        x: canvas.width - 188 + Math.cos(animationTime * 0.05 + index) * 10,
        y: Math.min(canvas.height - 124, baseY + wave),
        phase: index / total
    };
}

function drawWikipediaRelations() {
    if (!wikiFragments.length) return;

    const visibleCount = Math.min(
        wikiFragments.length,
        fragments.length
    );

    for (let i = 0; i < visibleCount; i++) {
        const fragment = fragments[i];
        const wiki = wikiFragments[i];
        const anchor = getRelationAnchor(i);
        const targetX = fragment.x + 20;
        const targetY = fragment.y - 10;
        const pulse = 0.18 + Math.sin(animationTime * 0.12 + i * 0.8) * 0.07;
        const labelY = fragment.y - 16;

        ctx.save();

        ctx.strokeStyle = `rgba(209,191,88,${pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y);
        ctx.lineTo((anchor.x + targetX) * 0.5, anchor.y + Math.sin(animationTime * 0.08 + i) * 6);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();

        ctx.fillStyle = `rgba(209,191,88,${pulse + 0.1})`;
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(209,191,88,${pulse + 0.16})`;
        ctx.beginPath();
        ctx.arc(targetX, targetY, 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '12px "Arial Narrow", sans-serif';
        ctx.fillStyle = `rgba(209,191,88,${0.55 + pulse})`;
        ctx.fillText(wiki.term, anchor.x - 132, anchor.y - 6);

        ctx.strokeStyle = `rgba(209,191,88,${pulse * 0.85})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(targetX - 18, labelY + 1);
        ctx.lineTo(targetX + 18, labelY + 1);
        ctx.stroke();

        ctx.strokeStyle = `rgba(209,191,88,${pulse * 0.55})`;
        ctx.beginPath();
        ctx.moveTo(targetX - 26, targetY + 13);
        ctx.lineTo(targetX - 2, targetY + 13);
        ctx.stroke();

        ctx.restore();
    }
}

function render() {
    animationTime += 0.01;
    layoutTime += 0.01;

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

    layoutFragments();

    fetchWikipediaRelations();

    render();
}

bootstrap();
