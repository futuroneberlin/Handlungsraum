(() => {
    'use strict';

    const canvas = document.getElementById('roomCanvas');
    const context = canvas.getContext('2d', { alpha: false });
    const fontStack = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    const PDF_JS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const PDF_SOURCES = [
        ['pdf/konzeptpapier.pdf'],
        ['pdf/kunstraum.pdf']
    ];
    const MAX_FRAGMENT_COUNT = 24;
    const MIN_FRAGMENT_COUNT = 12;
    const MAX_PDF_FRAGMENTS = 8;

    const fragments = [];

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
                source: sourceLabel === 'pdf' ? 'pdf' : undefined
            }))
            .filter((fragment) => fragment.text.length > 18)
            .slice(0, MAX_PDF_FRAGMENTS);
    }

    function appendFragments(nextFragments) {
        const remainingSlots = Math.max(0, MAX_FRAGMENT_COUNT - fragments.length);
        if (!remainingSlots) return;

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
        return fragments.length > 0;
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
                    console.log('[PDF] fragments:prepared', pdfFragments.length);
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

    function initialize() {
        const cols = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(fragments.length))));
        const rows = Math.max(2, Math.ceil(fragments.length / cols));
        const paddingX = Math.max(48, Math.floor(state.width * 0.08));
        const paddingY = Math.max(48, Math.floor(state.height * 0.08));
        const usableWidth = Math.max(1, state.width - (paddingX * 2));
        const usableHeight = Math.max(1, state.height - (paddingY * 2));
        const gapX = Math.max(36, Math.floor(usableWidth * 0.045));
        const gapY = Math.max(44, Math.floor(usableHeight * 0.06));
        const cellW = Math.max(180, Math.floor((usableWidth - (gapX * (cols - 1))) / cols));
        const cellH = Math.max(96, Math.floor((usableHeight - (gapY * (rows - 1))) / rows));

        fragments.forEach((fragment, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            fragment.gridIndex = index;
            fragment.gridX = col;
            fragment.gridY = row;
            fragment.cellW = cellW;
            fragment.cellH = cellH;
            fragment.baseX = paddingX + (col * (cellW + gapX)) + (cellW * 0.5);
            fragment.baseY = paddingY + (row * (cellH + gapY)) + (cellH * 0.5);
            fragment.offsetX = 0;
            fragment.offsetY = 0;
            fragment.x = fragment.baseX;
            fragment.y = fragment.baseY;
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
    }

    function applyMotion(fragment, time) {
        const phase = fragment.seed * 6.283185307179586;
        const microX = Math.sin((time * 0.00012) + phase) * 1.2;
        const microY = Math.cos((time * 0.00009) + (phase * 1.37)) * 0.75;
        fragment.x = fragment.baseX + microX;
        fragment.y = fragment.baseY + microY;
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

    function drawFragment(fragment, time) {
        const size = 18;
        const lineHeight = Math.max(22, size * 1.2);
        const maxWidth = Math.max(160, Math.min(280, (fragment.cellW || (state.width * 0.22)) * 0.82));
        context.font = `400 ${size}px ${fontStack}`;
        context.fillStyle = `rgba(243, 241, 234, 0.86)`;

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

    resize();
    console.log('[PDF] chain:before-extract', { fragmentsLength: fragments.length });
    extractPdfFragments().then(() => {
        console.log('[PDF] chain:after-extract', { fragmentsLength: fragments.length });

        if (!ensureMinimumFragments()) {
            console.warn('[PDF] no-pdf-fragments-after-load');
            return;
        }

        initialize();
        console.log('[PDF] chain:completed', { fragmentsLength: fragments.length });
        requestAnimationFrame(render);
    });
})();