(() => {
    'use strict';

    const canvas = document.getElementById('roomCanvas');
    const context = canvas.getContext('2d', { alpha: false });
    const fontStack = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.js';
    const PDF_JS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.js';
    const PDF_SOURCES = [
        ['pdf/konzeptpapier.pdf'],
        ['pdf/kunstraum.pdf']
    ];
    const BUILD_INTERVAL = 1000; // ms between brick placements
    let pdfBuildCounter = 0;
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

    function extractKeywordSet(text) {
        const stopwords = new Set(['und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'mit', 'für', 'auf', 'im', 'in', 'zu', 'von', 'the', 'and', 'or', 'to', 'of', 'is', 'are']);
        return new Set(
            cleanText(text)
                .toLowerCase()
                .split(/[^a-z0-9äöüß]+/i)
                .map((word) => word.trim())
                .filter((word) => word.length > 3 && !stopwords.has(word))
        );
    }

    function hasKeywordOverlap(leftText, rightText) {
        const leftKeywords = extractKeywordSet(leftText);
        const rightKeywords = extractKeywordSet(rightText);

        for (const keyword of leftKeywords) {
            if (rightKeywords.has(keyword)) {
                return true;
            }
        }

        return false;
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
                phase: index * 0.7,
                source: sourceLabel === 'pdf' ? 'pdf' : (sourceLabel === 'live' ? 'live' : undefined),
                buildOrder: sourceLabel === 'pdf' ? (pdfBuildCounter++) : undefined
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
        if (!remainingSlots) return;

        // deduplicate by normalized text to avoid repeated Wikipedia snippets
        const existing = new Set(fragments.map((f) => (f.text || '').toLowerCase().trim()));
        const filtered = [];
        for (const nf of nextFragments) {
            const key = (nf.text || '').toLowerCase().trim();
            if (existing.has(key)) continue;
            existing.add(key);
            filtered.push(nf);
            if (filtered.length >= remainingSlots) break;
        }

        fragments.push(...filtered.slice(0, remainingSlots));
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
            console.log('[PDF] extractPdfFragments:start');
            const pdfjsLib = await ensurePdfJs();
            console.log('[PDF] pdfjsLib:ready', Boolean(pdfjsLib));

            for (const sources of PDF_SOURCES) {
                console.log('[PDF] sources:start', sources);
                const pageTexts = [];

                for (const pdfPath of sources) {
                    try {
                        console.log('[PDF] loader:before', pdfPath);
                        const loadingTask = pdfjsLib.getDocument({ url: pdfPath, useWorkerFetch: false });
                        const pdf = await loadingTask.promise;
                        const pageCount = Number(pdf?.numPages) || 0;
                        console.log('[PDF] loaded', pdfPath, { numPages: pdf.numPages, pageCount });

                        if (!pageCount) {
                            console.warn('[PDF] no-pages', pdfPath);
                            continue;
                        }

                        for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
                            try {
                                const page = await pdf.getPage(pageIndex);
                                const content = await page.getTextContent();
                                const pageText = content.items.map((item) => item.str).join(' ');
                                pageTexts.push(pageText);
                                console.log('[PDF] page:text', pdfPath, { pageIndex, pageTextLength: pageText.length, collectedPages: pageTexts.length, pageText });
                            } catch (pageError) {
                                console.error('[PDF] page/error', pdfPath, { pageIndex, pageError });
                            }
                        }

                        break;
                    } catch (error) {
                        console.error('[PDF] load/error', pdfPath, error);
                    }
                }

                const rawText = pageTexts.join(' ');

                console.log('[PDF] rawText', rawText);

                if (rawText.trim()) {
                    const pdfFragments = splitIntoFragments(rawText, 'pdf');
                    console.log('[PDF] fragments:prepared', pdfFragments.length, pdfFragments);
                    appendFragments(pdfFragments);
                    console.log('[PDF] fragments:length-after-append', fragments.length);
                } else {
                    console.log('[PDF] no-text-for-source-group', sources);
                }
            }
        } catch (error) {
            console.error('[PDF] extractPdfFragments:outer-error', error);
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
        const cols = Math.max(3, Math.ceil(Math.sqrt(fragments.length)));
        const rows = Math.max(2, Math.ceil(fragments.length / cols));
        const cellW = state.width / cols;
        const cellH = state.height / rows;

        fragments.forEach((fragment, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            fragment.gridIndex = index;
            fragment.gridX = col;
            fragment.gridY = row;
            fragment.baseX = (col + 0.5) * cellW;
            fragment.baseY = (row + 0.5) * cellH;
            fragment.offsetX = 0;
            fragment.offsetY = 0;
            fragment.x = fragment.baseX;
            fragment.y = fragment.baseY;
            fragment.vx = (seedToValue(fragment.seed, 3) - 0.5) * 0.10;
            fragment.vy = (seedToValue(fragment.seed, 4) - 0.5) * 0.08;
        });
        // mark build start time for brick-by-brick reveal
        state.buildStart = performance.now();
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
        const isLive = fragment.source === 'live';

        // Live fragments: slight, minimal perpetual motion (markers)
        if (isLive) {
            fragment.offsetX = (fragment.offsetX || 0) * 0.92 + Math.sin(time * 0.0006 + fragment.phase) * 0.02;
            fragment.offsetY = (fragment.offsetY || 0) * 0.92 + Math.cos(time * 0.00055 + fragment.phase) * 0.02;
            fragment.x = wrap(fragment.baseX + fragment.offsetX, state.width);
            fragment.y = wrap(fragment.baseY + fragment.offsetY, state.height);
            return;
        }

        // PDF / room fragments: motion as offset on a stable base cell
        const dx = -fragment.offsetX;
        const dy = -fragment.offsetY;

        // gentle correction towards the grid base and strong damping for stabilization
        fragment.vx = (fragment.vx || 0) * 0.86 + dx * 0.02;
        fragment.vy = (fragment.vy || 0) * 0.86 + dy * 0.02;
        fragment.offsetX += fragment.vx;
        fragment.offsetY += fragment.vy;
        fragment.x = wrap(fragment.baseX + fragment.offsetX, state.width);
        fragment.y = wrap(fragment.baseY + fragment.offsetY, state.height);
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
            const leftIsLive = left.source === 'live';
            let nearest = null;
            let nearestDistanceSquared = maxDistanceSquared;

            for (let rightIndex = leftIndex + 1; rightIndex < fragments.length; rightIndex += 1) {
                const right = fragments[rightIndex];
                const rightIsLive = right.source === 'live';
                if (leftIsLive === rightIsLive) {
                    continue;
                }

                if (!hasKeywordOverlap(left.text, right.text)) {
                    continue;
                }

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

        if (isLive) {
            // Only draw live (Wikipedia) markers when they share keywords with a non-live fragment
            let nearest = null;
            let nearestDist = Infinity;
            for (const f of fragments) {
                if (f === fragment || f.source === 'live') continue;
                if (!hasKeywordOverlap(fragment.text, f.text)) continue;
                const dx = f.x - fragment.x;
                const dy = f.y - fragment.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < nearestDist) { nearestDist = d2; nearest = f; }
            }

            const threshold = Math.min(state.width, state.height) * 0.18;
            if (!nearest || Math.sqrt(nearestDist) > threshold) {
                return; // do not render when not near a brick
            }

            const size = 16;
            const lineHeight = Math.max(22, size * 1.4);
            const maxWidth = Math.min(300, Math.max(160, state.width * 0.2));
            context.font = `400 ${size}px ${fontStack}`;
            context.fillStyle = `rgba(214, 201, 74, 0.9)`;

            const lines = wrapText(fragment.text, maxWidth);
            const totalHeight = (lines.length - 1) * lineHeight;
            let y = fragment.y - (totalHeight * 0.5);
            for (const line of lines) {
                context.fillText(line, fragment.x, y);
                y += lineHeight;
            }
            return;
        }

        // PDF / room fragments: stable brick typography, minimal motion
        const size = 18;
        const lineHeight = Math.max(24, size * 1.4);
        const maxWidth = Math.min(320, Math.max(160, state.width * 0.22));
        context.font = `400 ${size}px ${fontStack}`;
        context.fillStyle = `rgba(243, 241, 234, 0.86)`;
        // If this fragment is a PDF brick with a build order, only draw it when its time has come
        if (fragment.source === 'pdf' && typeof fragment.buildOrder === 'number') {
            const start = state.buildStart || 0;
            if (time < start + fragment.buildOrder * BUILD_INTERVAL) {
                return; // not yet placed
            }
        }

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
    console.log('[PDF] chain:before-extract', { fragmentsLength: fragments.length });
    extractPdfFragments().then(() => {
        console.log('[PDF] chain:after-extract', { fragmentsLength: fragments.length });
        return loadLiveFragments();
    }).then(() => {
        console.log('[PDF] chain:after-live', { fragmentsLength: fragments.length });
        ensureMinimumFragments();
        initialize();
        console.log('[PDF] chain:completed', { fragmentsLength: fragments.length });
    });
    requestAnimationFrame(render);
})();