(() => {
    'use strict';

    const canvas = document.getElementById('roomCanvas');
    const context = canvas.getContext('2d', { alpha: false });
    const fontStack = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.js';
    const PDF_JS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.js';
    const PDF_SOURCES = [
        ['pdf/konzeptpapier.pdf', 'konzeptpapier.pdf'],
        ['kunst.pdf', 'pdf/kunst.pdf']
    ];
    const LIVE_QUERIES = ['Soziale Plastik', 'Social Sculpture'];
    const LIVE_FALLBACKS = [
        {
            title: 'Soziale Plastik',
            text: 'Soziale Plastik beschreibt gesellschaftliche Formung als offenen, sozialen Prozess.',
            seed: 21.7
        },
        {
            title: 'Social Sculpture',
            text: 'Social Sculpture versteht künstlerische Praxis als gemeinsames Gestalten des Sozialen.',
            seed: 23.4
        }
    ];
    const MAX_FRAGMENT_COUNT = 24;
    const MIN_FRAGMENT_COUNT = 12;
    const MAX_PDF_FRAGMENTS = 8;
    const MAX_LIVE_FRAGMENTS = 4;
    const ROOM_FALLBACKS = [
        { text: 'Raum bleibt in Bewegung', seed: 31.1 },
        { text: 'Sprache hält den Raum offen', seed: 32.4 },
        { text: 'langsame Typografie im Feld', seed: 33.8 },
        { text: 'ruhige Drift statt Leere', seed: 35.2 }
    ];

    const fragments = [
        { text: 'Handlungsraum', seed: 1.1 },
        { text: 'soziale plastik', seed: 2.3 },
        { text: 'wasser', seed: 3.7 },
        { text: 'luft', seed: 4.9 },
        { text: 'feuer', seed: 6.1 },
        { text: 'erde', seed: 7.4 },
        { text: 'raum bleibt offen', seed: 8.8 },
        { text: 'langsame drift', seed: 10.2 }
    ].map((fragment, index) => ({
        ...fragment,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        phase: index * 0.9
    }));

    const pointer = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 };
    const state = {
        width: 0,
        height: 0,
        dpr: Math.min(window.devicePixelRatio || 1, 2)
    };

    function loadExternalScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Script konnte nicht geladen werden: ${url}`));
            document.head.appendChild(script);
        });
    }

    async function ensurePdfJs() {
        if (window.pdfjsLib) {
            return window.pdfjsLib;
        }

        await loadExternalScript(PDF_JS_URL);

        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
            return window.pdfjsLib;
        }

        throw new Error('PDF.js konnte nicht initialisiert werden');
    }

    function cleanText(text) {
        return text.replace(/\s+/g, ' ').trim();
    }

    function splitIntoFragments(text, sourceLabel) {
        const words = cleanText(text).split(' ').filter(Boolean);
        const chunks = [];
        let current = [];

        for (const word of words) {
            current.push(word);

            if (current.length >= 16) {
                chunks.push(current.join(' '));
                current = [];
            }
        }

        if (current.length) {
            chunks.push(current.join(' '));
        }

        return chunks
            .map((chunk, index) => ({
                text: chunk,
                seed: hashToSeed(`${sourceLabel}-${index}-${chunk}`),
                phase: index * 0.7
            }))
            .slice(0, MAX_PDF_FRAGMENTS)
            .filter((fragment) => fragment.text.length > 18);
    }

    function createLiveFragment(title, text, seedOffset) {
        const cleanedText = cleanText(`${title}: ${text}`);
        return {
            text: cleanedText,
            seed: hashToSeed(`live-${title}-${seedOffset}-${cleanedText}`),
            phase: seedOffset * 0.7,
            source: 'live'
        };
    }

    function mapWikipediaResults(query, results) {
        return results.slice(0, 2).map((result, index) => {
            const snippet = cleanText(String(result.snippet || '').replace(/<[^>]*>/g, ' '));
            const title = cleanText(String(result.title || query));
            return createLiveFragment(title, snippet || query, index + 1);
        });
    }

    async function fetchWikipediaFragments(query) {
        const url = `https://de.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=2&format=json&origin=*`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Wikipedia status ${response.status}`);
        }

        const data = await response.json();
        const results = data?.query?.search;

        if (!Array.isArray(results) || !results.length) {
            throw new Error('Wikipedia lieferte keine Treffer');
        }

        return mapWikipediaResults(query, results);
    }

    async function loadLiveFragments() {
        try {
            const batches = await Promise.all(LIVE_QUERIES.map((query) => fetchWikipediaFragments(query)));
            const liveFragments = batches.flat().filter(Boolean).slice(0, MAX_LIVE_FRAGMENTS);

            if (liveFragments.length) {
                appendFragments(liveFragments);
                return;
            }
        } catch (error) {
            // Fallback unten.
        }

        const fallbackFragments = LIVE_FALLBACKS.map((item) => createLiveFragment(item.title, item.text, item.seed)).slice(0, MAX_LIVE_FRAGMENTS);
        appendFragments(fallbackFragments);
    }

    function appendFragments(nextFragments) {
        const remainingSlots = Math.max(0, MAX_FRAGMENT_COUNT - fragments.length);

        if (!remainingSlots) {
            return;
        }

        fragments.push(...nextFragments.slice(0, remainingSlots));
    }

    function ensureMinimumFragments() {
        if (fragments.length >= MIN_FRAGMENT_COUNT) {
            return;
        }

        const needed = MIN_FRAGMENT_COUNT - fragments.length;
        const fallbackFragments = ROOM_FALLBACKS.map((item) => ({
            text: item.text,
            seed: item.seed,
            phase: item.seed * 0.07
        })).slice(0, needed);

        appendFragments(fallbackFragments);
    }

    function hashToSeed(value) {
        let hash = 0;
        for (let index = 0; index < value.length; index += 1) {
            hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
        }

        return Math.abs(hash) / 1000000;
    }

    async function extractPdfFragments() {
        try {
            const pdfjsLib = await ensurePdfJs();

            for (const sources of PDF_SOURCES) {
                let extractedText = '';

                for (const pdfPath of sources) {
                    try {
                        const loadingTask = pdfjsLib.getDocument({ url: pdfPath, useWorkerFetch: false });
                        const pdf = await loadingTask.promise;
                        const pageCount = Math.min(pdf.numPages, 6);

                        for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
                            const page = await pdf.getPage(pageIndex);
                            const content = await page.getTextContent();
                            const pageText = content.items.map((item) => item.str).join(' ');
                            extractedText += ` ${pageText}`;
                        }

                        break;
                    } catch (error) {
                        extractedText = '';
                    }
                }

                if (extractedText.trim()) {
                    const pdfFragments = splitIntoFragments(extractedText, 'pdf');
                    appendFragments(pdfFragments);
                }
            }
        } catch (error) {
            // Fallback: vorhandene Raumfragmente bleiben sichtbar.
        }
    }

    function resize() {
        state.width = Math.max(1, window.innerWidth);
        state.height = Math.max(1, window.innerHeight);
        state.dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(state.width * state.dpr);
        canvas.height = Math.floor(state.height * state.dpr);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
        context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    }

    function seedToValue(seed, offset) {
        const value = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
        return value - Math.floor(value);
    }

    function initialize() {
        for (const fragment of fragments) {
            fragment.x = seedToValue(fragment.seed, 1) * state.width;
            fragment.y = seedToValue(fragment.seed, 2) * state.height;
            fragment.vx = (seedToValue(fragment.seed, 3) - 0.5) * 0.10;
            fragment.vy = (seedToValue(fragment.seed, 4) - 0.5) * 0.08;
        }
    }

    function wrap(value, limit) {
        if (value < -120) {
            return limit + 120;
        }

        if (value > limit + 120) {
            return -120;
        }

        return value;
    }

    function drawBackground(time) {
        context.fillStyle = '#000000';
        context.fillRect(0, 0, state.width, state.height);

        const pulseX = pointer.x * state.width;
        const pulseY = pointer.y * state.height;
        const haze = context.createRadialGradient(pulseX, pulseY, 0, pulseX, pulseY, Math.max(state.width, state.height) * 0.45);
        haze.addColorStop(0, 'rgba(255,255,255,0.02)');
        haze.addColorStop(1, 'rgba(0,0,0,0)');
        context.fillStyle = haze;
        context.fillRect(0, 0, state.width, state.height);

        const grain = 0.004 + Math.sin(time * 0.0002) * 0.0015;
        context.fillStyle = `rgba(255,255,255,${grain})`;
        for (let index = 0; index < 12; index += 1) {
            const x = (index * 137.5 + time * 0.01) % state.width;
            const y = (index * 83.1 + time * 0.008) % state.height;
            context.fillRect(x, y, 1, 1);
        }
    }

    function applyMotion(fragment, time) {
        const lowerText = fragment.text.toLowerCase();
        const isWater = lowerText.includes('wasser') || lowerText.includes('fluss') || lowerText.includes('strom') || lowerText.includes('drift');
        const isAir = lowerText.includes('luft') || lowerText.includes('atem') || lowerText.includes('sprache') || lowerText.includes('leicht');
        const isFire = lowerText.includes('feuer') || lowerText.includes('glut') || lowerText.includes('funken') || lowerText.includes('energie');
        const isEarth = lowerText.includes('erde') || lowerText.includes('boden') || lowerText.includes('material') || lowerText.includes('arbeit');
        const isLive = fragment.source === 'live';

        const centerWeight = isLive ? 0.00000024 : 0.00000042;
        const pointerWeight = isLive ? 0.00000008 : 0.00000012;
        const centerPullX = (state.width * 0.5 - fragment.x) * centerWeight;
        const centerPullY = (state.height * 0.5 - fragment.y) * centerWeight;
        const pointerPullX = (pointer.x * state.width - fragment.x) * pointerWeight;
        const pointerPullY = (pointer.y * state.height - fragment.y) * pointerWeight;

        let nextVx = fragment.vx;
        let nextVy = fragment.vy;

        if (isWater) {
            const horizontalDrift = Math.sin(time * 0.00005 + fragment.phase) * (isLive ? 0.008 : 0.014);
            nextVx = (nextVx * 0.996) + horizontalDrift + centerPullX + pointerPullX;
            nextVy = (nextVy * 0.994) + centerPullY + pointerPullY;
        } else if (isAir) {
            const verticalOscillation = Math.sin(time * 0.000045 + fragment.phase) * (isLive ? 0.007 : 0.011);
            nextVx = (nextVx * 0.995) + centerPullX + pointerPullX;
            nextVy = (nextVy * 0.997) + verticalOscillation + centerPullY + pointerPullY;
        } else if (isFire) {
            const impulsePhase = Math.floor(time * 0.0008 + fragment.phase * 1.3) % 9;
            const impulse = impulsePhase === 0 ? (isLive ? 0.006 : 0.012) : 0;
            const impulseX = (fragment.phase % 2 === 0 ? 1 : -1) * impulse;
            const impulseY = (fragment.phase % 3 === 0 ? -1 : 1) * impulse * 0.7;
            nextVx = (nextVx * 0.989) + impulseX + centerPullX + pointerPullX;
            nextVy = (nextVy * 0.989) + impulseY + centerPullY + pointerPullY;
        } else if (isEarth) {
            nextVx = (nextVx * (isLive ? 0.993 : 0.989)) + centerPullX + pointerPullX;
            nextVy = (nextVy * (isLive ? 0.995 : 0.992)) + centerPullY + pointerPullY + 0.00002;
        } else {
            const ambientDrift = Math.sin(time * 0.00004 + fragment.phase) * (isLive ? 0.004 : 0.006);
            nextVx = (nextVx * (isLive ? 0.996 : 0.994)) + ambientDrift + centerPullX + pointerPullX;
            nextVy = (nextVy * (isLive ? 0.996 : 0.994)) + centerPullY + pointerPullY;
        }

        fragment.vx = nextVx;
        fragment.vy = nextVy;
        fragment.x = wrap(fragment.x + fragment.vx, state.width);
        fragment.y = wrap(fragment.y + fragment.vy, state.height);
    }

    function wrapText(text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            if (context.measureText(candidate).width <= maxWidth || !currentLine) {
                currentLine = candidate;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines;
    }

    function drawRelations(time) {
        const maxDistance = Math.min(state.width, state.height) * 0.22;
        const maxDistanceSquared = maxDistance * maxDistance;

        for (let leftIndex = 0; leftIndex < fragments.length; leftIndex += 1) {
            const left = fragments[leftIndex];
            let nearest = null;
            let nearestDistanceSquared = maxDistanceSquared;

            for (let rightIndex = leftIndex + 1; rightIndex < fragments.length; rightIndex += 1) {
                const right = fragments[rightIndex];
                const dx = left.x - right.x;
                const dy = left.y - right.y;
                const distanceSquared = (dx * dx) + (dy * dy);

                if (distanceSquared < nearestDistanceSquared) {
                    nearest = right;
                    nearestDistanceSquared = distanceSquared;
                }
            }

            if (!nearest) {
                continue;
            }

            const distance = Math.sqrt(nearestDistanceSquared);
            const proximity = 1 - (distance / maxDistance);
            const pulse = 0.5 + (Math.sin(time * 0.0004 + left.phase + nearest.phase) * 0.5);
            const alpha = Math.max(0, (0.06 * proximity * pulse));

            if (alpha < 0.008) {
                continue;
            }

            context.beginPath();
            context.moveTo(left.x, left.y);
            context.lineTo(nearest.x, nearest.y);
            context.strokeStyle = `rgba(214, 201, 74, ${alpha})`;
            context.lineWidth = 0.35 + (0.35 * proximity);
            context.lineCap = 'round';
            context.stroke();
        }
    }

    function drawFragment(fragment, time) {
        const isLive = fragment.source === 'live';
        const alpha = isLive
            ? 0.42 + Math.sin(time * 0.0005 + fragment.phase) * 0.05
            : 0.55 + Math.sin(time * 0.0006 + fragment.phase) * 0.08;
        const size = isLive
            ? 16 + Math.sin(fragment.phase + time * 0.00035) * 1.1
            : 18 + Math.sin(fragment.phase + time * 0.0004) * 1.5;
        const lineHeight = Math.max(26, size * 1.6);
        const maxWidth = Math.min(320, Math.max(180, state.width * 0.26));
        context.font = `400 ${size}px ${fontStack}`;
        context.fillStyle = isLive ? `rgba(214, 201, 74, ${alpha})` : `rgba(243, 241, 234, ${alpha})`;

        const lines = wrapText(fragment.text, maxWidth);
        const totalHeight = (lines.length - 1) * lineHeight;
        let y = fragment.y - (totalHeight * 0.5);

        for (const line of lines) {
            context.fillText(line, fragment.x, y);
            y += lineHeight;
        }
    }

    function render(time) {
        drawBackground(time);
        drawRelations(time);

        for (const fragment of fragments) {
            applyMotion(fragment, time);
            drawFragment(fragment, time);
        }

        requestAnimationFrame(render);
    }

    window.addEventListener('resize', () => {
        resize();
        initialize();
    }, { passive: true });

    window.addEventListener('pointermove', (event) => {
        pointer.targetX = event.clientX / Math.max(window.innerWidth, 1);
        pointer.targetY = event.clientY / Math.max(window.innerHeight, 1);
        pointer.x += (pointer.targetX - pointer.x) * 0.12;
        pointer.y += (pointer.targetY - pointer.y) * 0.12;
    }, { passive: true });

    resize();
    initialize();
    extractPdfFragments().then(() => {
        return loadLiveFragments();
    }).then(() => {
        ensureMinimumFragments();
        initialize();
    });
    requestAnimationFrame(render);
})();