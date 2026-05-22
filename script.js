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
    spacingX: 280,
    spacingY: 102,
    marginX: 96,
    marginBottom: 112,
    rowDelay: 1.15,
    cellDelay: 0.08,
    riseDistance: 18,
    driftX: 1.4,
    driftY: 0.6,
    fragmentWidth: 330,
    lineHeight: 24,
    visibleWikiRelations: 5
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

function splitIntoSemanticUnits(text) {
    const normalized = cleanText(text);
    const sentenceMatches = normalized.match(/[^.!?;:]+[.!?;:]?|[^.!?;:]+/g) || [];
    const sentences = sentenceMatches
        .map(sentence => cleanText(sentence))
        .filter(Boolean);

    const units = [];
    let current = '';
    const maxLength = 148;

    function pushCurrent() {
        if (current) {
            units.push(current);
            current = '';
        }
    }

    for (const sentence of sentences) {
        const pieces = sentence.length > 180
            ? sentence.split(/,\s+/)
            : [sentence];

        for (const piece of pieces) {
            const candidate = current ? `${current} ${piece}` : piece;

            if (candidate.length <= maxLength) {
                current = candidate;
            } else {
                pushCurrent();
                current = piece;
            }
        }
    }

    pushCurrent();

    return units
        .map(unit => unit.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
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

        return splitIntoSemanticUnits(fullText);

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
                opacity: 0,
                size: Math.min(19, 15.5 + Math.min(7, text.length / 28)),
                maxWidth: LAYOUT.fragmentWidth,
                lineHeight: LAYOUT.lineHeight,
                lines: []
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
    const rows = Math.ceil(fragments.length / cols);
    const baselineY = canvas.height - LAYOUT.marginBottom;
    const fragmentWidth = Math.min(
        LAYOUT.fragmentWidth,
        Math.max(220, Math.floor((usableWidth - 24) / cols))
    );

    fragments.forEach((fragment, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);

        fragment.row = row;
        fragment.col = col;
        fragment.rowOrder = row * cols + col;

        fragment.targetX =
            LAYOUT.marginX + col * LAYOUT.spacingX;

        fragment.targetY =
            baselineY - (rows - 1 - row) * LAYOUT.spacingY;

        fragment.maxWidth = fragmentWidth;
        fragment.lines = wrapFragmentText(fragment.text, fragment.maxWidth, fragment.size);

        fragment.revealDelay =
            (rows - 1 - row) * LAYOUT.rowDelay + col * LAYOUT.cellDelay;

        fragment.x = fragment.targetX;
        fragment.y = fragment.targetY + LAYOUT.riseDistance;
        fragment.opacity = 0;
    });

    fragments.sort((left, right) => left.revealDelay - right.revealDelay);
}

function wrapFragmentText(text, maxWidth, fontSize) {
    ctx.save();
    ctx.font = `${fontSize}px "Arial Narrow", sans-serif`;

    const words = cleanText(text).split(' ').filter(Boolean);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;

        if (ctx.measureText(candidate).width <= maxWidth || !currentLine) {
            currentLine = candidate;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    ctx.restore();

    return lines;
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
    ctx.textBaseline = 'top';

    ctx.fillStyle = `rgba(239,235,224,${fragment.opacity})`;

    const lines = fragment.lines.length ? fragment.lines : wrapFragmentText(fragment.text, fragment.maxWidth, fragment.size);

    let cursorY = fragment.y;

    for (const line of lines) {
        ctx.fillText(line, fragment.x, cursorY);
        cursorY += fragment.lineHeight;
    }

    ctx.restore();
}

function getRelationAnchor(index) {
    const total = Math.max(1, wikiFragments.length);
    const rowStep = 108;
    const baseY = canvas.height - LAYOUT.marginBottom - index * rowStep;
    const wave = Math.sin(animationTime * 0.03 + index * 0.9) * 8;

    return {
        x: canvas.width - 176 + Math.cos(animationTime * 0.02 + index) * 6,
        y: Math.max(96, baseY + wave),
        phase: index / total
    };
}

function drawWikipediaRelations() {
    if (!wikiFragments.length) return;

    const visibleCount = Math.min(
        LAYOUT.visibleWikiRelations,
        wikiFragments.length,
        fragments.length
    );

    for (let i = 0; i < visibleCount; i++) {
        const fragment = fragments[i];
        const wiki = wikiFragments[i];
        const anchor = getRelationAnchor(i);
        const targetX = fragment.x - 12;
        const targetY = fragment.y + fragment.lineHeight * 0.5;
        const pulse = 0.12 + Math.sin(animationTime * 0.05 + i * 0.8) * 0.05;

        ctx.save();

        ctx.strokeStyle = `rgba(209,191,88,${pulse})`;
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y);
        ctx.lineTo((anchor.x + targetX) * 0.5, anchor.y + Math.sin(animationTime * 0.03 + i) * 4);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();

        ctx.fillStyle = `rgba(209,191,88,${pulse + 0.1})`;
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(209,191,88,${pulse + 0.14})`;
        ctx.beginPath();
        ctx.arc(targetX, targetY, 1.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '11px "Arial Narrow", sans-serif';
        ctx.fillStyle = `rgba(209,191,88,${0.45 + pulse})`;
        ctx.fillText(wiki.term, anchor.x - 124, anchor.y - 5);

        ctx.strokeStyle = `rgba(209,191,88,${pulse * 0.85})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(targetX - 16, targetY + 10);
        ctx.lineTo(targetX + 16, targetY + 10);
        ctx.stroke();

        ctx.restore();
    }
}

function render() {
    animationTime += 0.005;
    layoutTime += 0.005;

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
