#!/usr/bin/env node
/**
 * Canvas Layout CLI Tool
 * 
 * Interactive CLI for manually editing canvas-data.json
 * Supports grid-based positioning and all layout modification functions
 * 
 * Usage: node cli.js
 */

import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CANVAS_DATA_FILE = path.join(__dirname, 'canvas-data.json');
const IMAGES_DIR = path.join(__dirname, 'canvas-images');

// Grid configuration (must match index.js)
const GRID_COLS = 20;
const GRID_ROWS = 20;

// ======= GRID UTILITY FUNCTIONS =======

function gridIdToPixels(gridId, canvasWidth, canvasHeight, alignment = "center", options = {}) {
    // Parse grid ID with optional sub-position
    // Formats: "C-5", "C-5-TL", "C-5-TR", "C-5-BL", "C-5-BR", "C-5-TC", "C-5-BC", "C-5-LC", "C-5-RC", "C-5-C"
    const match = gridId.match(/^([A-T])-(\d+)(?:-(TL|TR|BL|BR|TC|BC|LC|RC|C))?$/i);
    if (!match) {
        throw new Error(`Invalid grid ID format: ${gridId}. Expected format like 'A-1', 'C-5-TL', 'C-5-TC'`);
    }

    const colLetter = match[1].toUpperCase();
    const rowNumber = parseInt(match[2], 10);
    const subPosition = match[3]?.toUpperCase() || null;

    const col = colLetter.charCodeAt(0) - 65;
    const row = rowNumber - 1;

    if (col < 0 || col >= GRID_COLS) {
        throw new Error(`Column ${colLetter} out of range. Valid: A-T`);
    }
    if (row < 0 || row >= GRID_ROWS) {
        throw new Error(`Row ${rowNumber} out of range. Valid: 1-${GRID_ROWS}`);
    }

    const cellWidth = canvasWidth / GRID_COLS;
    const cellHeight = canvasHeight / GRID_ROWS;

    let x = col * cellWidth;
    let y = row * cellHeight;

    // Use sub-position from gridId if present, otherwise use alignment parameter
    let effectiveAlignment = alignment;
    if (subPosition) {
        switch (subPosition) {
            case 'TL': effectiveAlignment = 'top-left'; break;
            case 'TR': effectiveAlignment = 'top-right'; break;
            case 'BL': effectiveAlignment = 'bottom-left'; break;
            case 'BR': effectiveAlignment = 'bottom-right'; break;
            case 'TC': effectiveAlignment = 'top-center'; break;
            case 'BC': effectiveAlignment = 'bottom-center'; break;
            case 'LC': effectiveAlignment = 'left-center'; break;
            case 'RC': effectiveAlignment = 'right-center'; break;
            case 'C': effectiveAlignment = 'center'; break;
        }
    }

    const margin = 10;
    switch (effectiveAlignment) {
        case "center":
            x += cellWidth / 2;
            y += cellHeight / 2;
            break;
        case "top-left":
            x += margin;
            y += margin;
            break;
        case "top-right":
            x += cellWidth - margin;
            y += margin;
            break;
        case "bottom-left":
            x += margin;
            y += cellHeight - margin;
            break;
        case "bottom-right":
            x += cellWidth - margin;
            y += cellHeight - margin;
            break;
        case "top-center":
            x += cellWidth / 2;
            y += margin;
            break;
        case "bottom-center":
            x += cellWidth / 2;
            y += cellHeight - margin;
            break;
        case "left-center":
            x += margin;
            y += cellHeight / 2;
            break;
        case "right-center":
            x += cellWidth - margin;
            y += cellHeight / 2;
            break;
        default:
            x += cellWidth / 2;
            y += cellHeight / 2;
    }

    // Apply axis locking if specified
    if (options.lockAxis === 'horizontal' && options.currentX !== undefined) {
        x = options.currentX;
    } else if (options.lockAxis === 'vertical' && options.currentY !== undefined) {
        y = options.currentY;
    }

    return { x: Math.round(x), y: Math.round(y) };
}


function pixelsToGridId(x, y, canvasWidth, canvasHeight) {
    const cellWidth = canvasWidth / GRID_COLS;
    const cellHeight = canvasHeight / GRID_ROWS;

    let col = Math.floor(x / cellWidth);
    let row = Math.floor(y / cellHeight);

    col = Math.max(0, Math.min(col, GRID_COLS - 1));
    row = Math.max(0, Math.min(row, GRID_ROWS - 1));

    const colLetter = String.fromCharCode(65 + col);
    const rowNumber = row + 1;

    return `${colLetter}-${rowNumber}`;
}

// ======= CANVAS DATA FUNCTIONS =======

async function loadCanvasData() {
    try {
        const content = await fs.readFile(CANVAS_DATA_FILE, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Error loading canvas data:', error.message);
        return null;
    }
}

async function saveCanvasData(canvasData) {
    try {
        await fs.writeFile(CANVAS_DATA_FILE, JSON.stringify(canvasData, null, 2), 'utf8');
        console.log('✅ Canvas data saved successfully!');
        return true;
    } catch (error) {
        console.error('Error saving canvas data:', error.message);
        return false;
    }
}

function getCanvasDimensions(canvasData) {
    const artboard = canvasData.pages?.[0]?.artboards?.[0];
    return {
        width: artboard?.width || 2550,
        height: artboard?.height || 3300
    };
}

function findElementById(canvasData, elementId) {
    const findInArray = (elements) => {
        for (const el of elements) {
            if (el.id === elementId || el.id?.startsWith(elementId)) return el;
            if (el.children) {
                const found = findInArray(el.children);
                if (found) return found;
            }
        }
        return null;
    };

    if (canvasData.allElements) {
        const found = findInArray(canvasData.allElements);
        if (found) return found;
    }

    if (canvasData.pages) {
        for (const page of canvasData.pages) {
            if (page.artboards) {
                for (const artboard of page.artboards) {
                    if (artboard.children) {
                        const found = findInArray(artboard.children);
                        if (found) return found;
                    }
                }
            }
        }
    }

    return null;
}

function findElementByGridId(canvasData, gridId) {
    const { width, height } = getCanvasDimensions(canvasData);
    const elements = canvasData.allElements || [];
    const matches = [];

    for (const el of elements) {
        if (!el.translation || el.type === "Page" || el.type === "ab:Artboard") continue;

        // CORRECT: Screen position = translation + boundsLocal offset
        const boundsOffsetX = el.boundsLocal?.x || 0;
        const boundsOffsetY = el.boundsLocal?.y || 0;
        const screenX = el.translation.x + boundsOffsetX;
        const screenY = el.translation.y + boundsOffsetY;
        const elWidth = el.boundsLocal?.width || el.width || 100;
        const elHeight = el.boundsLocal?.height || el.height || 50;

        // Center is relative to screen position
        const centerX = screenX + elWidth / 2;
        const centerY = screenY + elHeight / 2;

        const elGridId = pixelsToGridId(centerX, centerY, width, height);
        if (elGridId.toUpperCase() === gridId.toUpperCase()) {
            matches.push(el);
        }
    }

    return matches;
}

function updateElementInBothStructures(canvasData, elementId, updateFn) {
    // Update in allElements
    if (canvasData.allElements) {
        for (const el of canvasData.allElements) {
            if (el.id === elementId) {
                updateFn(el);
            }
        }
    }

    // Update in pages structure
    if (canvasData.pages) {
        for (const page of canvasData.pages) {
            if (page.artboards) {
                for (const artboard of page.artboards) {
                    if (artboard.children) {
                        const updateInChildren = (children) => {
                            for (const child of children) {
                                if (child.id === elementId) {
                                    updateFn(child);
                                }
                                if (child.children) {
                                    updateInChildren(child.children);
                                }
                            }
                        };
                        updateInChildren(artboard.children);
                    }
                }
            }
        }
    }
}

// ======= CLI COMMANDS =======

function printHelp() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║              CANVAS LAYOUT CLI - COMMANDS                      ║
╠════════════════════════════════════════════════════════════════╣
║  list                 - List all elements with grid positions  ║
║  find <grid-id>       - Find elements at grid position (e.g., C-5)  ║
║  info <element-id>    - Show detailed info for an element      ║
║  move <id> <grid-id>  - Move element to grid cell (e.g., C-5)  ║
║  movepx <id> <x> <y>  - Move element to pixel coordinates      ║
║  resize <id> <w> <h>  - Resize element to width x height       ║
║  opacity <id> <0-1>   - Set element opacity                    ║
║  grid                 - Show grid reference                    ║
║  save                 - Save changes to file                   ║
║  reload               - Reload from file (discard changes)     ║
║  annotate             - Generate annotated grid image          ║
║  help                 - Show this help                         ║
║  exit                 - Exit CLI                               ║
╚════════════════════════════════════════════════════════════════╝
`);
}

function printGridReference() {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════════════╗
║                           GRID REFERENCE (20x20)                                  ║
╠═══════════════════════════════════════════════════════════════════════════════════╣
║  Columns: A B C D E F G H I J K L M N O P Q R S T  (left to right)               ║
║  Rows:    1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20  (top to bottom)    ║
╠═══════════════════════════════════════════════════════════════════════════════════╣
║  Basic:    A-1 = Cell at column A, row 1 (defaults to center)                     ║
╠═══════════════════════════════════════════════════════════════════════════════════╣
║  Sub-positions (append to grid ID):                                               ║
║   Corners:  C-5-TL (Top-Left), C-5-TR (Top-Right), C-5-BL (Bot-Left), C-5-BR     ║
║   Centers:  C-5-TC (Top-Center), C-5-BC (Bot-Center), C-5-LC (Left), C-5-RC      ║
║   Middle:   C-5-C or C-5 (Center of cell)                                         ║
╠═══════════════════════════════════════════════════════════════════════════════════╣
║  Axis Locking:  move <id> <grid-id> --lock-h  (only vertical movement)           ║
║                 move <id> <grid-id> --lock-v  (only horizontal movement)          ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
`);
}



function listElements(canvasData) {
    const { width, height } = getCanvasDimensions(canvasData);
    const elements = canvasData.allElements || [];

    console.log('\n┌─────────────────────────────────────────────────────────────────────────────────┐');
    console.log('│                              CANVAS ELEMENTS                                    │');
    console.log('├─────────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ # │ Type            │ Grid  │ Position (px)  │ Size          │ ID (short)      │');
    console.log('├───┼─────────────────┼───────┼────────────────┼───────────────┼─────────────────┤');

    let idx = 0;
    for (const el of elements) {
        if (!el.translation || el.type === "Page" || el.type === "ab:Artboard") continue;

        idx++;
        // CORRECT: Screen position = translation + boundsLocal offset
        const boundsOffsetX = el.boundsLocal?.x || 0;
        const boundsOffsetY = el.boundsLocal?.y || 0;
        const screenX = Math.round(el.translation.x + boundsOffsetX);
        const screenY = Math.round(el.translation.y + boundsOffsetY);
        const elWidth = Math.round(el.boundsLocal?.width || el.width || 0);
        const elHeight = Math.round(el.boundsLocal?.height || el.height || 0);
        const gridId = pixelsToGridId(screenX + elWidth / 2, screenY + elHeight / 2, width, height);

        let typeStr = el.type.padEnd(15).substring(0, 15);
        let gridStr = gridId.padEnd(5);
        let posStr = `${screenX},${screenY}`.padEnd(14);
        let sizeStr = `${elWidth}x${elHeight}`.padEnd(13);
        let idStr = el.id.substring(0, 15);

        // Add text preview for text elements
        if (el.textContent?.text) {
            const preview = el.textContent.text.substring(0, 20);
            console.log(`│${String(idx).padStart(2)} │ ${typeStr} │ ${gridStr} │ ${posStr} │ ${sizeStr} │ ${idStr} │`);
            console.log(`│   │ 📝 "${preview}${el.textContent.text.length > 20 ? '...' : ''}"`.padEnd(86) + '│');
        } else {
            console.log(`│${String(idx).padStart(2)} │ ${typeStr} │ ${gridStr} │ ${posStr} │ ${sizeStr} │ ${idStr} │`);
        }
    }

    console.log('└─────────────────────────────────────────────────────────────────────────────────┘');
    console.log(`Total: ${idx} elements | Canvas: ${width}x${height}px | Grid: ${GRID_COLS}x${GRID_ROWS}`);
}

function showElementInfo(canvasData, elementId) {
    const element = findElementById(canvasData, elementId);
    if (!element) {
        console.log(`❌ Element not found: ${elementId}`);
        return;
    }

    const { width, height } = getCanvasDimensions(canvasData);
    // CORRECT: Screen position = translation + boundsLocal offset
    const boundsOffsetX = element.boundsLocal?.x || 0;
    const boundsOffsetY = element.boundsLocal?.y || 0;
    const screenX = (element.translation?.x || 0) + boundsOffsetX;
    const screenY = (element.translation?.y || 0) + boundsOffsetY;
    const elWidth = element.boundsLocal?.width || element.width || 0;
    const elHeight = element.boundsLocal?.height || element.height || 0;
    const gridId = pixelsToGridId(screenX + elWidth / 2, screenY + elHeight / 2, width, height);

    console.log(`
┌──────────────────────────────────────────────────────────────────┐
│ ELEMENT DETAILS                                                  │
├──────────────────────────────────────────────────────────────────┤
│ ID:       ${element.id}
│ Type:     ${element.type}
│ Grid:     ${gridId}
│ Screen:   x=${Math.round(screenX)}, y=${Math.round(screenY)} (visual top-left)
│ Translate:x=${Math.round(element.translation?.x || 0)}, y=${Math.round(element.translation?.y || 0)} (anchor)
│ Size:     ${Math.round(elWidth)} x ${Math.round(elHeight)}
│ Opacity:  ${element.opacity !== undefined ? element.opacity : 'N/A'}
│ Rotation: ${element.rotation !== undefined ? element.rotation + '°' : 'N/A'}
│ Locked:   ${element.locked !== undefined ? element.locked : 'N/A'}
${element.textContent?.text ? `│ Text:     "${element.textContent.text}"` : ''}
└──────────────────────────────────────────────────────────────────┘
`);
}

async function generateAnnotatedImage(canvasData) {
    const { width, height } = getCanvasDimensions(canvasData);

    // Try to find the latest canvas page image to use as background
    let baseImageBuffer;
    try {
        const files = await fs.readdir(IMAGES_DIR);
        const canvasImages = files
            .filter(f => f.startsWith('canvas-page-') && f.endsWith('.png'))
            .sort()
            .reverse(); // Most recent first (by timestamp in filename)

        if (canvasImages.length > 0) {
            const latestImage = path.join(IMAGES_DIR, canvasImages[0]);
            console.log(`📷 Using canvas image: ${canvasImages[0]}`);
            baseImageBuffer = await fs.readFile(latestImage);
        }
    } catch (e) {
        console.log('⚠️ No canvas image found, using blank background');
    }

    // If no image found, create a blank canvas
    if (!baseImageBuffer) {
        baseImageBuffer = await sharp({
            create: {
                width: width,
                height: height,
                channels: 4,
                background: { r: 240, g: 240, b: 240, alpha: 1 }
            }
        }).png().toBuffer();
    }

    const cellWidth = width / GRID_COLS;
    const cellHeight = height / GRID_ROWS;

    // Build improved SVG overlay (semi-transparent to show background)
    let svgParts = [];
    svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`);

    // Semi-transparent overlay to improve contrast
    svgParts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="rgba(0,0,0,0.1)"/>`);

    // Draw grid with semi-transparent cells
    for (let col = 0; col < GRID_COLS; col++) {
        for (let row = 0; row < GRID_ROWS; row++) {
            const x = Math.round(col * cellWidth);
            const y = Math.round(row * cellHeight);
            // Semi-transparent grid cells
            svgParts.push(`<rect x="${x}" y="${y}" width="${Math.round(cellWidth)}" height="${Math.round(cellHeight)}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>`);

            // Cell label in center (semi-transparent)
            const label = `${String.fromCharCode(65 + col)}-${row + 1}`;
            const labelX = x + cellWidth / 2;
            const labelY = y + cellHeight / 2 + 8;
            svgParts.push(`<text x="${labelX}" y="${labelY}" fill="rgba(255,255,255,0.4)" font-size="20" font-family="Arial, sans-serif" font-weight="bold" text-anchor="middle">${label}</text>`);
        }
    }

    // Element type colors (vibrant)
    const typeColors = {
        'Text': '#E91E63',
        'Rectangle': '#4CAF50',
        'SolidColorShape': '#00BCD4',
        'MediaContainer': '#FF9800',
        'Image': '#FF5722',
        'Line': '#9C27B0',
        'Ellipse': '#673AB7',
        'Group': '#009688',
        'default': '#607D8B'
    };

    // Draw elements with clear markers
    const elements = canvasData.allElements || [];
    let elementIndex = 0;

    for (const el of elements) {
        if (!el.translation || el.type === "Page" || el.type === "ab:Artboard") continue;

        elementIndex++;
        // CORRECT: Screen position = translation + boundsLocal offset
        const boundsOffsetX = el.boundsLocal?.x || 0;
        const boundsOffsetY = el.boundsLocal?.y || 0;
        const x = Math.round(el.translation.x + boundsOffsetX);
        const y = Math.round(el.translation.y + boundsOffsetY);
        const elWidth = Math.round(el.boundsLocal?.width || el.width || 100);
        const elHeight = Math.round(el.boundsLocal?.height || el.height || 50);
        const color = typeColors[el.type] || typeColors['default'];
        const gridId = pixelsToGridId(x + elWidth / 2, y + elHeight / 2, width, height);

        // Solid fill with transparency
        svgParts.push(`<rect x="${x}" y="${y}" width="${elWidth}" height="${elHeight}" fill="${color}40" stroke="${color}" stroke-width="4"/>`);

        // Element number badge
        svgParts.push(`<circle cx="${x + 20}" cy="${y + 20}" r="18" fill="${color}"/>`);
        svgParts.push(`<text x="${x + 20}" y="${y + 26}" fill="white" font-size="16" font-family="Arial" font-weight="bold" text-anchor="middle">${elementIndex}</text>`);

        // Label with type and content
        let labelText = `#${elementIndex} ${el.type}`;
        if (el.textContent?.text) {
            labelText += `: "${el.textContent.text.substring(0, 15)}${el.textContent.text.length > 15 ? '...' : ''}"`;
        }
        labelText = labelText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const labelY = y > 60 ? y - 15 : y + elHeight + 30;
        const labelWidth = Math.min(labelText.length * 10 + 20, 400);

        svgParts.push(`<rect x="${x}" y="${labelY - 25}" width="${labelWidth}" height="35" fill="rgba(255,255,255,0.9)" stroke="${color}" stroke-width="2" rx="5"/>`);
        svgParts.push(`<text x="${x + 10}" y="${labelY - 5}" fill="${color}" font-size="14" font-family="Arial" font-weight="bold">${labelText}</text>`);
        svgParts.push(`<text x="${x + 10}" y="${labelY + 12}" fill="#666" font-size="11" font-family="Arial">Grid: ${gridId} | ID: ${el.id.substring(0, 12)}...</text>`);
    }

    // Add legend at bottom (semi-transparent background)
    const legendY = height - 80;
    svgParts.push(`<rect x="20" y="${legendY}" width="${width - 40}" height="60" fill="rgba(255,255,255,0.9)" stroke="#ccc" stroke-width="2" rx="5"/>`);
    svgParts.push(`<text x="40" y="${legendY + 25}" fill="#333" font-size="14" font-family="Arial" font-weight="bold">LEGEND:</text>`);

    let legendX = 140;
    for (const [type, color] of Object.entries(typeColors)) {
        if (type === 'default') continue;
        svgParts.push(`<rect x="${legendX}" y="${legendY + 10}" width="20" height="20" fill="${color}"/>`);
        svgParts.push(`<text x="${legendX + 25}" y="${legendY + 25}" fill="#333" font-size="12" font-family="Arial">${type}</text>`);
        legendX += type.length * 8 + 50;
        if (legendX > width - 200) {
            legendX = 140;
        }
    }

    svgParts.push('</svg>');

    const svgOverlay = svgParts.join('\n');

    // Create the annotated image by compositing SVG over the base image
    const annotatedBuffer = await sharp(baseImageBuffer)
        .resize(width, height, { fit: 'fill' }) // Ensure correct dimensions
        .composite([{
            input: Buffer.from(svgOverlay),
            gravity: 'northwest'
        }])
        .png()
        .toBuffer();

    // Save to file
    try {
        await fs.mkdir(IMAGES_DIR, { recursive: true });
    } catch (e) { }

    const timestamp = Date.now();
    const outputPath = path.join(IMAGES_DIR, `cli-annotated-${timestamp}.png`);
    await fs.writeFile(outputPath, annotatedBuffer);

    console.log(`✅ Annotated image saved to: ${outputPath}`);
    return outputPath;
}


// ======= MAIN CLI LOOP =======

async function runCLI() {
    console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║           🎨 CANVAS LAYOUT CLI - Interactive Editor 🎨           ║
╠═══════════════════════════════════════════════════════════════════╣
║  Edit canvas-data.json using grid coordinates                     ║
║  Type 'help' for available commands                               ║
╚═══════════════════════════════════════════════════════════════════╝
`);

    let canvasData = await loadCanvasData();
    if (!canvasData) {
        console.log('❌ Could not load canvas-data.json. Make sure the file exists.');
        process.exit(1);
    }

    console.log(`✅ Loaded canvas data with ${canvasData.allElements?.length || 0} elements`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const prompt = () => {
        rl.question('\n📍 canvas> ', async (input) => {
            const parts = input.trim().split(/\s+/);
            const cmd = parts[0]?.toLowerCase();
            const args = parts.slice(1);

            try {
                switch (cmd) {
                    case 'help':
                    case '?':
                        printHelp();
                        break;

                    case 'list':
                    case 'ls':
                        listElements(canvasData);
                        break;

                    case 'grid':
                        printGridReference();
                        break;

                    case 'find':
                        if (!args[0]) {
                            console.log('Usage: find <grid-id>  (e.g., find C-5)');
                        } else {
                            const matches = findElementByGridId(canvasData, args[0]);
                            if (matches.length === 0) {
                                console.log(`No elements found at grid position ${args[0]}`);
                            } else {
                                console.log(`\nFound ${matches.length} element(s) at ${args[0]}:`);
                                for (const el of matches) {
                                    console.log(`  - ${el.type}: ${el.id.substring(0, 20)}...`);
                                    if (el.textContent?.text) {
                                        console.log(`    Text: "${el.textContent.text.substring(0, 40)}..."`);
                                    }
                                }
                            }
                        }
                        break;

                    case 'info':
                        if (!args[0]) {
                            console.log('Usage: info <element-id>');
                        } else {
                            showElementInfo(canvasData, args[0]);
                        }
                        break;

                    case 'move':
                        if (args.length < 2) {
                            console.log('Usage: move <element-id> <grid-id> [--lock-h|--lock-v]');
                            console.log('       grid-id: C-5, C-5-TL, C-5-TC, etc.');
                            console.log('       --lock-h: Lock horizontal (only vertical movement)');
                            console.log('       --lock-v: Lock vertical (only horizontal movement)');
                            console.log('Example: move b6658a97 C-5-TL');
                            console.log('Example: move b6658a97 D-8 --lock-h');
                        } else {
                            const element = findElementById(canvasData, args[0]);
                            if (!element) {
                                console.log(`❌ Element not found: ${args[0]}`);
                            } else {
                                const { width, height } = getCanvasDimensions(canvasData);

                                // Parse flags
                                const hasLockH = args.includes('--lock-h');
                                const hasLockV = args.includes('--lock-v');
                                const alignment = args.find(a => !a.startsWith('--') && a !== args[0] && a !== args[1]) || 'center';

                                // Get current position for locking
                                const currentX = element.translation?.x || 0;
                                const currentY = element.translation?.y || 0;

                                // Get element dimensions for center-based positioning
                                const boundsOffsetX = element.boundsLocal?.x || 0;
                                const boundsOffsetY = element.boundsLocal?.y || 0;
                                const elWidth = element.boundsLocal?.width || element.width || 0;
                                const elHeight = element.boundsLocal?.height || element.height || 0;

                                const options = {};
                                if (hasLockH) {
                                    options.lockAxis = 'horizontal';
                                    options.currentX = currentX;
                                } else if (hasLockV) {
                                    options.lockAxis = 'vertical';
                                    options.currentY = currentY;
                                }

                                const { x: targetX, y: targetY } = gridIdToPixels(args[1], width, height, alignment, options);

                                // Calculate the translation needed to place the element's CENTER at the target position
                                // Screen position = translation + boundsOffset
                                // We want: screenX + elWidth/2 = targetX  and  screenY + elHeight/2 = targetY
                                // So: translation.x + boundsOffsetX + elWidth/2 = targetX
                                // Therefore: translation.x = targetX - boundsOffsetX - elWidth/2
                                const x = Math.round(targetX - boundsOffsetX - elWidth / 2);
                                const y = Math.round(targetY - boundsOffsetY - elHeight / 2);

                                const lockInfo = hasLockH ? ' (H-locked)' : hasLockV ? ' (V-locked)' : '';

                                updateElementInBothStructures(canvasData, element.id, (el) => {
                                    if (!el.translation) el.translation = {};
                                    el.translation.x = x;
                                    el.translation.y = y;
                                    if (el.transformMatrix) {
                                        el.transformMatrix["4"] = x;
                                        el.transformMatrix["5"] = y;
                                    }
                                });

                                console.log(`✅ Moved ${element.type} center to grid ${args[1]}${lockInfo} -> center at (${targetX}, ${targetY})px, translation (${x}, ${y})px`);
                                console.log('   Use "save" to persist changes');
                            }
                        }
                        break;


                    case 'movepx':
                        if (args.length < 3) {
                            console.log('Usage: movepx <element-id> <x> <y>');
                        } else {
                            const element = findElementById(canvasData, args[0]);
                            if (!element) {
                                console.log(`❌ Element not found: ${args[0]}`);
                            } else {
                                const newX = parseFloat(args[1]);
                                const newY = parseFloat(args[2]);

                                updateElementInBothStructures(canvasData, element.id, (el) => {
                                    if (!el.translation) el.translation = {};
                                    el.translation.x = newX;
                                    el.translation.y = newY;
                                    if (el.transformMatrix) {
                                        el.transformMatrix["4"] = newX;
                                        el.transformMatrix["5"] = newY;
                                    }
                                });

                                console.log(`✅ Moved ${element.type} to (${newX}, ${newY})px`);
                                console.log('   Use "save" to persist changes');
                            }
                        }
                        break;

                    case 'resize':
                        if (args.length < 3) {
                            console.log('Usage: resize <element-id> <width> <height>');
                        } else {
                            const element = findElementById(canvasData, args[0]);
                            if (!element) {
                                console.log(`❌ Element not found: ${args[0]}`);
                            } else {
                                const newWidth = parseFloat(args[1]);
                                const newHeight = parseFloat(args[2]);

                                updateElementInBothStructures(canvasData, element.id, (el) => {
                                    if (el.width !== undefined) el.width = newWidth;
                                    if (el.height !== undefined) el.height = newHeight;
                                    if (el.boundsLocal) {
                                        el.boundsLocal.width = newWidth;
                                        el.boundsLocal.height = newHeight;
                                    }
                                });

                                console.log(`✅ Resized ${element.type} to ${newWidth}x${newHeight}`);
                                console.log('   Use "save" to persist changes');
                            }
                        }
                        break;

                    case 'opacity':
                        if (args.length < 2) {
                            console.log('Usage: opacity <element-id> <value 0-1>');
                        } else {
                            const element = findElementById(canvasData, args[0]);
                            if (!element) {
                                console.log(`❌ Element not found: ${args[0]}`);
                            } else {
                                const newOpacity = Math.max(0, Math.min(1, parseFloat(args[1])));

                                updateElementInBothStructures(canvasData, element.id, (el) => {
                                    el.opacity = newOpacity;
                                });

                                console.log(`✅ Set ${element.type} opacity to ${newOpacity}`);
                                console.log('   Use "save" to persist changes');
                            }
                        }
                        break;

                    case 'save':
                        await saveCanvasData(canvasData);
                        break;

                    case 'reload':
                        canvasData = await loadCanvasData();
                        if (canvasData) {
                            console.log('✅ Reloaded canvas data from file');
                        }
                        break;

                    case 'annotate':
                        console.log('Generating annotated grid image...');
                        await generateAnnotatedImage(canvasData);
                        break;

                    case 'exit':
                    case 'quit':
                    case 'q':
                        console.log('👋 Goodbye!');
                        rl.close();
                        process.exit(0);
                        break;

                    case '':
                        // Empty input, just show prompt again
                        break;

                    default:
                        console.log(`Unknown command: ${cmd}. Type 'help' for available commands.`);
                }
            } catch (error) {
                console.error(`❌ Error: ${error.message}`);
            }

            prompt();
        });
    };

    prompt();
}

// Run the CLI
runCLI().catch(console.error);
