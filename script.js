const canvas = document.getElementById('roomCanvas');
const ctx = canvas.getContext('2d');

// Use a single stable UMD PDF.js build (no .mjs). Try primary CDN then fallback.
const PDF_JS_URL = './vendor/pdfjs/pdf.min.js';
const PDF_JS_WORKER_URL = './vendor/pdfjs/pdf.worker.min.js';

const PDF_SOURCES = [
    './pdf/handlungsraum.pdf?v=20260522',
    './pdf/konzeptpapier.pdf?v=20260522',
    './pdf/kunstraum.pdf?v=20260522'
];

const WIKI_TERMS = [
    'Kunst',
    'Soziale Plastik',
    'Raum',
    'Handlung',
    'Relation'
];

const FORBIDDEN_TERMS = [
    'flüchtling',
    'flüchtlingsunterkunft',
    'kinder',
    'migration'
];

const STOPWORDS = new Set([
    'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'einer', 'eines', 'dem', 'den', 'des',
    'im', 'in', 'am', 'an', 'auf', 'aus', 'mit', 'von', 'für', 'zu', 'als', 'ist', 'sind', 'war',
    'wird', 'werden', 'sich', 'nicht', 'mehr', 'nur', 'auch', 'wie', 'durch', 'bei', 'zwischen',
    'the', 'and', 'of', 'to', 'in', 'for', 'with', 'as', 'is', 'are', 'be', 'this', 'that',
    'pdf', 'seite', 'seiten', 'text', 'fragment', 'fragmente', 'raum', 'handlungsraum'
]);

const THEME_ALIASES = new Map([
    ['kunst', 'kunst'],
    ['beuys', 'sozial'],
    ['plastik', 'sozial'],
    ['sozial', 'sozial'],
    ['gesellschaft', 'praxis'],
    ['praxis', 'praxis'],
    ['handlung', 'handlung'],
    ['handeln', 'handlung'],
    ['raum', 'raum'],
    ['relation', 'relation'],
    ['bezug', 'relation'],
    ['aufbau', 'aufbau'],
    ['struktur', 'aufbau'],
    ['material', 'material'],
    ['beton', 'material'],
    ['asphalt', 'material'],
    ['bewegung', 'bewegung'],
    ['dynamik', 'bewegung'],
    ['leere', 'leere'],
    ['negativ', 'leere']
]);

const THEME_AXIS_ORDER = ['aufbau', 'relation', 'praxis', 'sozial', 'raum', 'handlung', 'bewegung', 'material', 'leere'];

let fragments = [];
let wikiFragments = [];

// Fragment state constants
const FRAGMENT_STATE = {
    QUEUED: 'queued',
    ACTIVE: 'active',
    FOUNDATION: 'foundation'
};

const MAX_ACTIVE = 3; // allow 2-3 active fragments
const ACTIVE_MIN_DISPLAY = 1.6; // seconds after reveal to remain active


let animationTime = 0;
let layoutTime = 0;
// UX state
let isPlaying = true;
let speedMultiplier = 1.0;
let density = 'medium'; // low, medium, high
let renderStarted = false;

function setupUI() {
    const playBtn = document.getElementById('playPause');
    const speedEl = document.getElementById('speed');
    const densityEl = document.getElementById('density');
    const refreshBtn = document.getElementById('refreshFragments');

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            isPlaying = !isPlaying;
            playBtn.textContent = isPlaying ? 'Pause' : 'Play';
        });
    }

    if (speedEl) {
        speedEl.addEventListener('input', (e) => {
            speedMultiplier = parseFloat(e.target.value) || 1.0;
        });
    }

    if (densityEl) {
        densityEl.addEventListener('change', (e) => {
            density = e.target.value;
            // reload fragments with new density
            bootstrap();
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => bootstrap());
    }
}

function curateFragments(extracted) {
    // stronger curatorial rules to prefer semantically complete sentences
    const minLen = 0;

    const candidates = extracted
        .map(t => sanitizeFragment(t))
        .filter(Boolean)
        .filter(t => t.length >= minLen)
        .map(text => ({ text, score: scoreFragmentText(text) }))
        .sort((a, b) => a.score - b.score);

    // prioritize sentence endings and punctuation variety
    return candidates.map(c => c.text);
}

function tokenizeForClusters(text) {
    return cleanText(text)
        .toLowerCase()
        .replace(/[^a-zà-žäöüß0-9\s-]/gi, ' ')
        .split(/\s+/)
        .map(token => token.replace(/^-+|-+$/g, ''))
        .filter(token => token.length > 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

function buildSemanticProfile(items) {
    const counts = new Map();

    for (const item of items) {
        const tokens = tokenizeForClusters(item.text);
        const uniqueTokens = new Set(tokens);

        for (const token of uniqueTokens) {
            counts.set(token, (counts.get(token) || 0) + 1);
        }
    }

    return counts;
}

function assignClusterKey(text, profile) {
    const tokens = tokenizeForClusters(text);
    for (const token of tokens) {
        if (THEME_ALIASES.has(token)) {
            return THEME_ALIASES.get(token);
        }
    }

    let bestToken = '';
    let bestScore = -1;

    for (const token of tokens) {
        const score = profile.get(token) || 0;
        if (score > bestScore) {
            bestToken = token;
            bestScore = score;
        }
    }

    return THEME_ALIASES.get(bestToken) || bestToken || tokens[0] || 'grund';
}

function jitter(seed, spread) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return ((value - Math.floor(value)) - 0.5) * 2 * spread;
}

const LAYOUT = {
    spacingX: 280,
    spacingY: 220,
    marginX: 88,
    marginBottom: 220,
    rowDelay: 1.7,
    cellDelay: 0.1,
    riseDistance: 18,
    driftX: 1.0,
    driftY: 0.45,
    fragmentWidth: 380,
    lineHeight: 30,
    visibleWikiRelations: 6,
    maxFragmentsPerSource: 999,
    targetFragmentLength: 140
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

async function ensurePdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = PDF_JS_URL;
        script.async = true;
        script.onload = () => {
            try {
                window.pdfjsLib = window.pdfjsLib || window.pdfjsViewer || window['pdfjs-dist/build/pdf'] || window['pdfjs-dist'];
                if (!window.pdfjsLib) {
                    console.warn('[PDF] script loaded but pdfjsLib not on window');
                    return reject(new Error('pdfjsLib not found'));
                }

                window.pdfjsLib.GlobalWorkerOptions = window.pdfjsLib.GlobalWorkerOptions || {};
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
                console.log('[PDF] loaded');
                resolve(window.pdfjsLib);
            } catch (err) {
                console.error('[PDF] init error after load', err);
                reject(err);
            }
        };
        script.onerror = (e) => {
            console.error('[PDF] script load error', PDF_JS_URL, e);
            reject(e);
        };
        document.head.appendChild(script);
    });
}

// global error handlers to catch silent promise rejections or load errors
window.addEventListener('unhandledrejection', (e) => {
    console.error('[UnhandledRejection]', e.reason);
});

window.addEventListener('error', (e) => {
    console.error('[WindowError]', e.message, e.filename, e.lineno, e.colno);
});

function cleanText(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function sanitizeFragment(text) {
    if (!text) return null;

    // remove hyphenation artifacts and strange line-break remnants
    let t = text.replace(/-\s+/g, '');

    // remove URLs and file paths
    t = t.replace(/https?:\/\/\S+|www\.\S+|\/\S+\.pdf/gi, '');

    // remove repeated punctuation or parser markers
    t = t.replace(/\.{2,}/g, '.');
    t = t.replace(/[\u00A0\u200B\u200C\u200D]/g, '');

    t = cleanText(t);

    // drop fragments that are too short or single words
    const words = t.split(' ').filter(Boolean);
    if (words.length < 3) return null;

    // drop fragments with many non-letter characters (parsing artefacts)
        const nonLetterCount = (t.match(/[^A-Za-zÀ-ž\s,\.\-\'\"]/g) || []).length;
    if (nonLetterCount > Math.max(2, words.length * 0.12)) return null;

    // drop fragments that include forbidden terms
    if (isForbiddenText(t)) return null;

    return t;
}

function isForbiddenText(text) {
    const normalized = cleanText(text).toLowerCase();

    return FORBIDDEN_TERMS.some(term => normalized.includes(term));
}

function scoreFragmentText(text) {
    const length = text.length;
    const targetDistance = Math.abs(length - LAYOUT.targetFragmentLength);
    const sentenceBonus = /[.!?]$/.test(text) ? -10 : 0;
    const commaBonus = text.includes(',') ? -4 : 0;

    return targetDistance + sentenceBonus + commaBonus;
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

    // sanitize and filter units
    return units
        .map(unit => sanitizeFragment(unit))
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

        const units = splitIntoSemanticUnits(fullText);
        console.log(`PDF geladen: ${path} — Einheiten: ${units.length}`);
        console.log('[PDF] loaded', path);
        return units;

    } catch (error) {
        console.error('PDF Fehler:', path, error);
        return [];
    }
}

async function loadAllPdfFragments() {
    const allFragments = [];

    for (const source of PDF_SOURCES) {
        const extracted = await extractPdfFragments(source);

        const curated = curateFragments(extracted);

        for (const text of curated) {
            allFragments.push({
                text,
                source,
                sourceName: source.split('/').pop() || source,
                x: 0,
                y: 0,
                opacity: 0,
                size: Math.min(20, 16.5 + Math.min(5.5, text.length / 34)),
                maxWidth: LAYOUT.fragmentWidth,
                lineHeight: LAYOUT.lineHeight,
                lines: []
                ,
                // state machine defaults
                state: FRAGMENT_STATE.QUEUED,
                stateTime: 0,
                activatedAt: null,
                revealedAt: null
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

            if (!response.ok) {
                continue;
            }

            const data = await response.json();

            if (data.extract) {
                collected.push({
                    term,
                    text: data.extract.slice(0, 180)
                });
            }

        } catch (error) {
            continue;
        }
    }

    wikiFragments = collected;
    console.log('[WIKI] loaded:', collected.length);
}

function layoutFragments() {
    const usableWidth = Math.max(1, canvas.width - LAYOUT.marginX * 2);
    const fragmentWidth = Math.min(LAYOUT.fragmentWidth, Math.max(250, Math.floor(usableWidth * 0.46)));

    // prepare lines and heights
    fragments.forEach(f => {
        f.maxWidth = fragmentWidth;
        f.lines = wrapFragmentText(f.text, f.maxWidth, f.size);
        f.height = Math.max(1, f.lines.length) * f.lineHeight + 8; // padding
    });

    const profile = buildSemanticProfile(fragments);

    fragments.forEach(fragment => {
        fragment.clusterKey = assignClusterKey(fragment.text, profile);
        fragment.clusterWeight = profile.get(fragment.clusterKey) || 1;
    });

    const clusters = new Map();
    for (const fragment of fragments) {
        if (!clusters.has(fragment.clusterKey)) {
            clusters.set(fragment.clusterKey, []);
        }
        clusters.get(fragment.clusterKey).push(fragment);
    }

    const clusterEntries = Array.from(clusters.entries()).sort((left, right) => {
        const leftWeight = left[1].length;
        const rightWeight = right[1].length;
        return rightWeight - leftWeight || left[0].localeCompare(right[0]);
    });

    const axes = [0.83, 0.68, 0.53, 0.38, 0.23];
    const axisXCenters = [0.14, 0.31, 0.49, 0.67, 0.84, 0.95];
    const axisSpacing = Math.max(112, (canvas.height - LAYOUT.marginBottom * 1.15) / axes.length);

    clusterEntries.forEach(([key, clusterFragments], clusterIndex) => {
        const themeIndex = Math.max(0, THEME_AXIS_ORDER.indexOf(key));
        const axisIndex = themeIndex >= 0 ? themeIndex % axes.length : clusterIndex % axes.length;
        const xSeed = axisXCenters[axisIndex % axisXCenters.length];
        const clusterCenterX = LAYOUT.marginX + usableWidth * xSeed + jitter(clusterIndex + key.length, usableWidth * 0.025);
        const clusterCenterY = canvas.height - LAYOUT.marginBottom - axisIndex * axisSpacing;

        clusterFragments.forEach((fragment, index) => {
            fragment.clusterIndex = clusterIndex;
            fragment.clusterOrder = index;
            fragment.clusterSize = clusterFragments.length;

            const localSpread = Math.min(72, 12 + clusterFragments.length * 4);
            const xOffset = (index - (clusterFragments.length - 1) / 2) * 14 + jitter(index + clusterIndex, localSpread * 0.18);
            const yOffset = (index % 2 === 0 ? -1 : 1) * Math.min(14, 5 + index * 1.5) + jitter(index + 3, 6);

            fragment.targetX = Math.min(
                canvas.width - LAYOUT.marginX - fragment.maxWidth,
                Math.max(LAYOUT.marginX, clusterCenterX + xOffset)
            );

            fragment.targetY = Math.max(78, clusterCenterY + yOffset);

            fragment.baseScale = Math.min(1.1, Math.max(0.9, 0.95 + clusterFragments.length * 0.01 - index * 0.004));
            fragment.scale = 0.9;
            fragment.revealDelay = clusterIndex * 0.5 + index * 0.12;

            fragment.x = fragment.targetX;
            fragment.y = fragment.targetY + LAYOUT.riseDistance;
            fragment.opacity = 0;
        });
    });

    fragments.sort((left, right) => left.revealDelay - right.revealDelay);
}

function wrapFragmentText(text, maxWidth, fontSize) {
    ctx.save();
    ctx.font = `${fontSize}px Inter, sans-serif`;

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
    // progress is state-aware: for queued -> 0, for active -> ramp during reveal
    if (!fragment) return 0;

    if (fragment.state === FRAGMENT_STATE.QUEUED) return 0;

    // reveal duration tuned for readable typewriter
    const revealDuration = 1.8;

    if (fragment.state === FRAGMENT_STATE.ACTIVE) {
        const since = (layoutTime - (fragment.activatedAt || fragment.revealDelay || 0));
        if (since <= 0) return 0;
        return Math.min(1, since / revealDuration);
    }

    // foundation: fully revealed
    return 1;
}

function applyMotion(fragment, index) {
    const progress = getFragmentProgress(fragment);

    // heavy, slow, architectural motions — remove particle-like drift
    const lerp = (from, to, t) => from + (to - from) * Math.max(0, Math.min(1, t));

    if (fragment.state === FRAGMENT_STATE.QUEUED) {
        // keep queued fragments subtle and out of focus under the horizon
        fragment.x = lerp(fragment.x, fragment.targetX, 0.02);
        fragment.y = lerp(fragment.y, fragment.targetY + LAYOUT.riseDistance * 0.6, 0.02);
        fragment.opacity = Math.min(0.12, fragment.opacity + 0.01);
        fragment.scale = lerp(fragment.scale || 0.9, 0.92, 0.02);
        return;
    }

    if (fragment.state === FRAGMENT_STATE.ACTIVE) {
        // active fragments appear with a slight heavy rise then settle into foreground
        const eased = 1 - Math.pow(1 - progress, 3);
        fragment.x = lerp(fragment.x, fragment.targetX, 0.08 + eased * 0.12);
        fragment.y = lerp(fragment.y, fragment.targetY - 6 - eased * 8, 0.06 + eased * 0.18);
        fragment.opacity = Math.min(1, 0.6 + progress * 0.45);
        const scaleTarget = fragment.baseScale || 1.02;
        fragment.scale = lerp(fragment.scale || 0.95, scaleTarget, 0.06 + eased * 0.24);
        return;
    }

    // FOUNDATION: minimal, slow settling to exact grid, no sinus drift
    if (fragment.state === FRAGMENT_STATE.FOUNDATION) {
        const settle = 0.015; // very slow, heavy movement
        fragment.x = lerp(fragment.x, fragment.targetX, settle);
        fragment.y = lerp(fragment.y, fragment.targetY, settle);
        fragment.opacity = Math.max(0.18, lerp(fragment.opacity, 0.34, 0.01));
        fragment.scale = lerp(fragment.scale || 1, fragment.baseScale || 1.0, 0.01);
        return;
    }
}

function tokenizeSet(text) {
    return new Set(tokenizeForClusters(text));
}

function tokenOverlapScore(aText, bText) {
    const a = tokenizeSet(aText);
    const b = tokenizeSet(bText);
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    // normalized by smaller set so that short but precise overlap counts
    return inter / Math.min(a.size, b.size);
}

function manageFragmentStates() {
    // activate queued fragments based on revealDelay and limit active count
    const activeCount = fragments.filter(f => f.state === FRAGMENT_STATE.ACTIVE).length;
    const queued = fragments.filter(f => f.state === FRAGMENT_STATE.QUEUED).sort((a,b)=>a.revealDelay - b.revealDelay);

    // activate up to MAX_ACTIVE
    for (const frag of queued) {
        if ((fragments.filter(f=>f.state===FRAGMENT_STATE.ACTIVE).length) >= MAX_ACTIVE) break;
        if (layoutTime >= (frag.revealDelay || 0)) {
            frag.state = FRAGMENT_STATE.ACTIVE;
            frag.activatedAt = layoutTime;
            frag.stateTime = 0;
            // ensure starting position is near target for calm entrance
            frag.x = frag.targetX + (Math.random() * 24 - 12);
            frag.y = frag.targetY + LAYOUT.riseDistance * 0.6;
        }
    }

    // progress active fragments to foundation after reveal + display time
    for (const frag of fragments.filter(f => f.state === FRAGMENT_STATE.ACTIVE)) {
        const since = layoutTime - (frag.activatedAt || 0);
        // when fully revealed and displayed sufficiently, move to foundation
        if (since > 1.8 + ACTIVE_MIN_DISPLAY) {
            frag.state = FRAGMENT_STATE.FOUNDATION;
            frag.revealedAt = layoutTime;
            // foundation alignment: small y offset to form base row
            frag.targetY = Math.max(canvas.height - 140, frag.targetY);
            // ensure slight ordering left-to-right for foundation
        }
    }

    // when fragments enter foundation, optionally compress them horizontally
    const foundation = fragments.filter(f => f.state === FRAGMENT_STATE.FOUNDATION).sort((a,b)=>a.revealedAt - b.revealedAt || a.targetX - b.targetX);
    if (foundation.length) {
        const baseY = canvas.height - 110;
        const totalWidth = Math.min(canvas.width * 0.8, foundation.length * (LAYOUT.fragmentWidth * 0.62 + 12));
        const startX = (canvas.width - totalWidth) * 0.5 + LAYOUT.marginX * 0.5;
        const spacing = totalWidth / Math.max(1, foundation.length);

        foundation.forEach((f, i) => {
            f.targetX = Math.min(canvas.width - LAYOUT.marginX - f.maxWidth, Math.max(LAYOUT.marginX, startX + i * spacing));
            f.targetY = baseY;
            f.opacity = Math.max(0.18, f.opacity);
            f.lineHeight = LAYOUT.lineHeight; // foundation uses calmer line height
        });
    }
}

function drawBackground() {
    // heavy material background: concrete/asphalt layers, grain and horizontal compression bands
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // base matte fill (concrete grey)
    ctx.fillStyle = '#8f8d86';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // deep layer: darker, low-contrast blotches to suggest distant depth
    const deepCount = Math.max(3, Math.floor(canvas.width / 800));
    for (let i = 0; i < deepCount; i++) {
        const w = canvas.width * (0.3 + Math.random() * 0.7);
        const h = canvas.height * (0.18 + Math.random() * 0.25);
        const x = Math.random() * (canvas.width - w);
        const y = Math.random() * (canvas.height * 0.5);
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        const a = 0.06 + Math.random() * 0.06;
        g.addColorStop(0, `rgba(50,50,52,${a})`);
        g.addColorStop(1, `rgba(80,78,74,${a * 0.5})`);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
    }

    // mid layer: horizontal compression bands and formwork shadows
    const bands = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < bands; i++) {
        const bandHeight = 28 + Math.random() * 38;
        const y = canvas.height * (0.28 + (i / bands) * 0.6) + (Math.random() - 0.5) * 24;
        ctx.fillStyle = `rgba(30,30,30,${0.03 + Math.random() * 0.06})`;
        ctx.fillRect(0, y, canvas.width, bandHeight);

        // occasional darker streaks (formwork seams)
        if (Math.random() > 0.5) {
            ctx.fillStyle = `rgba(20,20,20,${0.02 + Math.random() * 0.04})`;
            const segW = 60 + Math.random() * 260;
            const segX = Math.random() * canvas.width;
            ctx.fillRect(segX, y + bandHeight * 0.2, segW, Math.min(6, bandHeight * 0.4));
        }
    }

    // foreground: concrete stains, dust and small aggregates
    const stains = 28;
    for (let i = 0; i < stains; i++) {
        const fx = Math.random();
        const fy = 0.35 + Math.random() * 0.55;
        const w = 40 + Math.random() * 360;
        const h = 20 + Math.random() * 220;
        const opacity = 0.02 + Math.random() * 0.06;
        const x = Math.floor(canvas.width * fx - w * 0.5);
        const y = Math.floor(canvas.height * fy - h * 0.5);
        const g = ctx.createRadialGradient(x + w * 0.5, y + h * 0.5, 0, x + w * 0.5, y + h * 0.5, Math.max(w, h));
        g.addColorStop(0, `rgba(20,20,18,${opacity})`);
        g.addColorStop(0.5, `rgba(80,78,74,${opacity * 0.6})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y + h * 0.5, w * (0.8 + Math.random() * 0.6), h * (0.6 + Math.random() * 0.9), Math.random() * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    // subtle surface noise (dust / micrograin)
    const grainDensity = Math.min(9000, Math.floor((canvas.width * canvas.height) / 12000));
    for (let i = 0; i < grainDensity; i++) {
        const x = Math.floor(Math.random() * canvas.width);
        const y = Math.floor(Math.random() * canvas.height);
        const a = Math.random() * 0.04;
        if (Math.random() > 0.995) {
            ctx.fillStyle = `rgba(255,255,255,${a * 0.6})`;
            ctx.fillRect(x, y, 1, 1);
        } else if (Math.random() > 0.9975) {
            ctx.fillStyle = `rgba(0,0,0,${a * 0.9})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }

    // vignette and fog to create depth zones: deeper darkness at top and bottom edges
    const fog = ctx.createLinearGradient(0, 0, 0, canvas.height);
    fog.addColorStop(0, 'rgba(20,20,20,0.28)');
    fog.addColorStop(0.25, 'rgba(20,20,20,0.06)');
    fog.addColorStop(0.6, 'rgba(20,20,20,0.02)');
    fog.addColorStop(1, 'rgba(8,8,8,0.36)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // remove UI/grid lines — replaced by subtle horizontal material cues above
}

function drawFragment(fragment) {
    ctx.save();
    ctx.textBaseline = 'top';
    // visual tuning per state
    const scaledSize = Math.max(10, Math.round(fragment.size * (fragment.scale || 1)));
    ctx.font = `${scaledSize}px Inter, sans-serif`;

    // state-specific readability adjustments
    let lines = [];
    if (fragment.state === FRAGMENT_STATE.ACTIVE) {
        // typewriter reveal: compute reveal progress and slice text
        const progress = getFragmentProgress(fragment);
        const chars = Math.max(1, Math.floor(fragment.text.length * progress));
        const visibleText = fragment.text.slice(0, chars);
        lines = wrapFragmentText(visibleText, fragment.maxWidth, fragment.size);

        ctx.fillStyle = `rgba(239,235,224,${Math.min(1, fragment.opacity || 1)})`;
        ctx.lineHeight = fragment.lineHeight * 1.35;
        fragment.lineHeight = Math.round(LAYOUT.lineHeight * 1.35);
        ctx.shadowColor = 'rgba(0,0,0,0.36)';
        ctx.shadowBlur = 2.6;
    } else {
        // foundation or queued: show full text but with calmer style
        lines = fragment.lines.length ? fragment.lines : wrapFragmentText(fragment.text, fragment.maxWidth, fragment.size);
        if (fragment.state === FRAGMENT_STATE.FOUNDATION) {
            ctx.fillStyle = `rgba(239,235,224,${Math.max(0.18, fragment.opacity)})`;
            fragment.lineHeight = LAYOUT.lineHeight;
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        } else {
            // queued
            ctx.fillStyle = `rgba(239,235,224,${Math.min(0.12, fragment.opacity)})`;
            fragment.lineHeight = Math.round(LAYOUT.lineHeight * 0.98);
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }
    }

    // compute block width for anchor shadow
    let blockWidth = 0;
    for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > blockWidth) blockWidth = w;
    }

    // draw contact anchor shadow to ground the text
    const anchorX = fragment.x + blockWidth * 0.5;
    const anchorY = fragment.y + lines.length * fragment.lineHeight + 6;
    let anchorAlpha = 0.08;
    let anchorBlur = 8;
    let anchorRy = 6;
    if (fragment.state === FRAGMENT_STATE.FOUNDATION) {
        anchorAlpha = 0.28;
        anchorBlur = 10;
        anchorRy = 8;
    } else if (fragment.state === FRAGMENT_STATE.ACTIVE) {
        anchorAlpha = 0.18;
        anchorBlur = 6;
        anchorRy = 6;
    }

    ctx.save();
    ctx.fillStyle = `rgba(8,8,6,${anchorAlpha})`;
    ctx.shadowColor = `rgba(0,0,0,${anchorAlpha})`;
    ctx.shadowBlur = anchorBlur;
    ctx.beginPath();
    ctx.ellipse(anchorX, anchorY, Math.max(18, blockWidth * 0.42), anchorRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    let cursorY = fragment.y;
    for (const line of lines) {
        ctx.fillText(line, fragment.x, cursorY);
        cursorY += fragment.lineHeight;
    }

    if (fragment.clusterOrder === 0) {
        ctx.font = '9px IBM Plex Mono, monospace';
        ctx.fillStyle = 'rgba(209,191,88,0.3)';
        ctx.fillText(`${fragment.sourceName || ''} · ${fragment.clusterKey || ''}`, fragment.x, fragment.y - 12);
    }

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.restore();
}

function drawContentRelations() {
    if (!fragments.length) return;

    const chain = fragments.slice().sort((left, right) => left.revealDelay - right.revealDelay || left.y - right.y);
    ctx.save();
    ctx.lineWidth = 0.8;

    for (let i = 1; i < chain.length; i++) {
        const previous = chain[i - 1];
        const current = chain[i];
        // only draw sequential relations when there is meaningful token overlap
        const overlap = tokenOverlapScore(previous.text, current.text);
        if (overlap < 0.06) continue;
        const relationOpacity = 0.04 + Math.min(0.12, current.opacity * 0.08) * overlap * 2.5;
        const midX = (previous.x + current.x) * 0.5;
        const midY = (previous.y + current.y) * 0.5 - 18;
        ctx.strokeStyle = `rgba(209,191,88,${relationOpacity})`;
        ctx.beginPath();
        ctx.moveTo(previous.x + previous.maxWidth * 0.5, previous.y + previous.lineHeight * 0.6);
        ctx.lineTo(midX, midY);
        ctx.lineTo(current.x + current.maxWidth * 0.25, current.y + current.lineHeight * 0.6);
        ctx.stroke();
    }

    const clustered = new Map();
    for (const fragment of fragments) {
        if (!clustered.has(fragment.clusterKey)) clustered.set(fragment.clusterKey, []);
        clustered.get(fragment.clusterKey).push(fragment);
    }

    clustered.forEach(clusterFragments => {
        if (clusterFragments.length < 2) return;

        const sorted = clusterFragments.slice().sort((a, b) => a.targetY - b.targetY || a.targetX - b.targetX);
        for (let i = 1; i < sorted.length; i++) {
            const left = sorted[i - 1];
            const right = sorted[i];
            const overlap = tokenOverlapScore(left.text, right.text);
            if (overlap < 0.08) continue;
            ctx.strokeStyle = `rgba(209,191,88,${0.12 + overlap * 0.18})`;
            ctx.beginPath();
            ctx.moveTo(left.targetX + left.maxWidth * 0.25, left.targetY + left.lineHeight * 0.6);
            ctx.lineTo((left.targetX + right.targetX) * 0.5, (left.targetY + right.targetY) * 0.5 - 12);
            ctx.lineTo(right.targetX + right.maxWidth * 0.25, right.targetY + right.lineHeight * 0.6);
            ctx.stroke();
        }
    });

    ctx.restore();
}

function getRelationAnchor(index) {
    // compute small anchor positions for Wikipedia relation markers
    const rowStep = Math.max(40, LAYOUT.spacingY * 0.5);
    const total = Math.max(1, Math.min(LAYOUT.visibleWikiRelations, wikiFragments.length));
    const baseY = canvas.height - LAYOUT.marginBottom - index * rowStep;
    const wave = Math.sin(animationTime * 0.02 + index * 0.7) * 5;

    return {
        x: canvas.width - 172 + Math.cos(animationTime * 0.018 + index) * 4,
        y: Math.max(96, baseY + wave),
        phase: index / total
    };
}

function drawWikipediaRelations() {
    if (!wikiFragments.length) return;
    // For each wiki fragment find the best matching fragment based on token overlap
    const matches = [];
    for (const wiki of wikiFragments) {
        let best = null;
        let bestScore = 0;
        for (const frag of fragments) {
            const score = tokenOverlapScore(wiki.text || wiki.term || '', frag.text || '');
            if (score > bestScore) {
                bestScore = score;
                best = frag;
            }
        }

        if (best && bestScore > 0.10) {
            matches.push({ wiki, frag: best, score: bestScore });
        }
    }

    // limit visual clutter
    matches.slice(0, LAYOUT.visibleWikiRelations).forEach((m, i) => {
        const anchor = getRelationAnchor(i);
        const fragment = m.frag;
        const wiki = m.wiki;
        const targetX = fragment.x - 18;
        const targetY = fragment.y + fragment.lineHeight * 0.45;
        const pulse = 0.04 + m.score * 0.5;

        ctx.save();
        ctx.strokeStyle = `rgba(209,191,88,${Math.min(0.34, pulse)})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y);
        ctx.lineTo((anchor.x + targetX) * 0.5, anchor.y + 2);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();

        ctx.fillStyle = `rgba(209,191,88,${Math.min(0.34, pulse + 0.06)})`;
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, 1.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '10px IBM Plex Mono, monospace';
        ctx.fillStyle = `rgba(209,191,88,${0.24 + pulse})`;
        ctx.fillText(wiki.term, anchor.x - 118, anchor.y - 5);
        ctx.restore();
    });
}

function render() {
    if (isPlaying) {
        const step = 0.0035 * Math.max(0.12, Math.min(3, speedMultiplier));
        animationTime += step;
        layoutTime += step;
    }

    if (!renderStarted) {
        console.log('render() running');
        renderStarted = true;
    }

    drawBackground();

    // update state machine (activations, foundation alignment) before motion
    manageFragmentStates();

    // first update motion for all fragments according to their state
    fragments.forEach((fragment, index) => {
        applyMotion(fragment, index);
    });

    // then draw in Y order (top to bottom) so lower elements render on top
    const drawOrder = fragments.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    for (const fragment of drawOrder) {
        drawFragment(fragment);
    }

    drawContentRelations();
    drawWikipediaRelations();

    requestAnimationFrame(render);
}

async function bootstrap() {
    console.log('[Bootstrap] start');
    setupUI();
    try {
        fragments = await loadAllPdfFragments();
        console.log('[PDF] fragments:', fragments.length);
    } catch (err) {
        console.error('[Bootstrap] error loading fragments', err);
        fragments = [];
    }

    console.log('[Bootstrap] loaded fragments count', fragments.length);

    if (!fragments.length) {
        console.warn('Keine PDF-Fragmente geladen — zeige Hintergrund und versuche Wikipedia-Relationen');
        // Ensure background and wiki relations still run so the page isn't blank
        layoutFragments();
        fetchWikipediaRelations();
        render();
        return;
    }

    layoutFragments();

    fetchWikipediaRelations();

    render();
}

bootstrap();
