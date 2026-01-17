import { GoogleGenAI } from "@google/genai";
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';

// Cloudinary configuration for background removal
cloudinary.config({
    cloud_name: 'dxlnneg4j',
    api_key: '134542173624383',
    api_secret: 'UC--P_DNDjFNqqf1o6PGZDqiLz8'
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CANVAS_DATA_FILE = path.join(__dirname, 'canvas-data.json');
const IMAGES_DIR = path.join(__dirname, 'canvas-images');

// ======= GRID SYSTEM CONFIGURATION =======
const GRID_COLS = 20; // Columns A-T
const GRID_ROWS = 20; // Rows 1-20

/**
 * Convert a grid cell ID to pixel coordinates
 * Supports sub-positions: C-5-TL, C-5-TR, C-5-BL, C-5-BR, C-5-TC, C-5-BC, C-5-LC, C-5-RC, C-5-C
 * @param {string} gridId - Grid cell identifier (e.g., "C-5", "C-5-TL", "C-5-TC")
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {string} alignment - Fallback alignment if not specified in gridId
 * @param {object} options - Optional: { lockAxis: 'horizontal'|'vertical', currentX, currentY }
 * @returns {{ x: number, y: number }} Pixel coordinates
 */
function gridIdToPixels(gridId, canvasWidth, canvasHeight, alignment = "center", options = {}) {
    // Parse grid ID with optional sub-position
    // Formats: "C-5", "C-5-TL", "C-5-TR", "C-5-BL", "C-5-BR", "C-5-TC", "C-5-BC", "C-5-LC", "C-5-RC", "C-5-C"
    const match = gridId.match(/^([A-T])-(\d+)(?:-(TL|TR|BL|BR|TC|BC|LC|RC|C))?$/i);
    if (!match) {
        throw new Error(`Invalid grid ID format: ${gridId}. Expected format like 'A-1', 'C-5-TL', 'C-5-TC', 'T-20-BR'`);
    }

    const colLetter = match[1].toUpperCase();
    const rowNumber = parseInt(match[2], 10);
    const subPosition = match[3]?.toUpperCase() || null;

    // Validate ranges
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

    // Calculate base position (top-left of cell)
    let x = col * cellWidth;
    let y = row * cellHeight;

    // Determine alignment from sub-position or parameter
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

    // Apply alignment offset
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
        // Lock horizontal - keep current X, only move vertically
        x = options.currentX;
    } else if (options.lockAxis === 'vertical' && options.currentY !== undefined) {
        // Lock vertical - keep current Y, only move horizontally
        y = options.currentY;
    }

    return { x: Math.round(x), y: Math.round(y) };
}


/**
 * Convert pixel coordinates to a grid ID
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @param {number} canvasWidth - Width of the canvas in pixels
 * @param {number} canvasHeight - Height of the canvas in pixels
 * @returns {string} Grid ID like "A-1", "T-20", etc.
 */
function pixelsToGridId(x, y, canvasWidth, canvasHeight) {
    const cellWidth = canvasWidth / GRID_COLS;
    const cellHeight = canvasHeight / GRID_ROWS;

    // Calculate column and row indices
    let col = Math.floor(x / cellWidth);
    let row = Math.floor(y / cellHeight);

    // Clamp to valid range
    col = Math.max(0, Math.min(col, GRID_COLS - 1));
    row = Math.max(0, Math.min(row, GRID_ROWS - 1));

    const colLetter = String.fromCharCode(65 + col); // 0 -> 'A', 19 -> 'T'
    const rowNumber = row + 1; // 0-indexed to 1-indexed

    return `${colLetter}-${rowNumber}`;
}

/**
 * Create an annotated image with grid overlay and element bounding boxes
 * Optimized for readability by both humans and AI
 * @param {Buffer} baseImageBuffer - The base canvas image as a buffer
 * @param {Object} canvasData - The canvas data JSON object
 * @returns {Promise<Buffer>} The annotated image buffer
 */
async function createAnnotatedImage(baseImageBuffer, canvasData) {
    const metadata = await sharp(baseImageBuffer).metadata();
    const { width, height } = metadata;

    console.log(`Creating annotated image for ${width}x${height} canvas`);

    const cellWidth = width / GRID_COLS;
    const cellHeight = height / GRID_ROWS;

    // Build SVG overlay with improved readability
    let svgParts = [];
    svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`);

    // Define styles for consistency
    svgParts.push(`<defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.3"/>
        </filter>
    </defs>`);

    // Semi-transparent overlay to darken base image slightly for better contrast
    svgParts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="rgba(0,0,0,0.15)"/>`);

    // Draw main grid lines (thicker for major divisions every 5 cells)
    for (let i = 0; i <= GRID_COLS; i++) {
        const x = Math.round(i * cellWidth);
        const isMajor = i % 5 === 0;
        const strokeWidth = isMajor ? 4 : 1;
        const opacity = isMajor ? 0.9 : 0.4;
        svgParts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="rgba(255,255,255,${opacity})" stroke-width="${strokeWidth}"/>`);
    }

    for (let i = 0; i <= GRID_ROWS; i++) {
        const y = Math.round(i * cellHeight);
        const isMajor = i % 5 === 0;
        const strokeWidth = isMajor ? 4 : 1;
        const opacity = isMajor ? 0.9 : 0.4;
        svgParts.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="rgba(255,255,255,${opacity})" stroke-width="${strokeWidth}"/>`);
    }

    // Add column headers (A-T) at top
    for (let col = 0; col < GRID_COLS; col++) {
        const letter = String.fromCharCode(65 + col);
        const x = Math.round(col * cellWidth + cellWidth / 2);
        svgParts.push(`<rect x="${x - 20}" y="5" width="40" height="35" fill="rgba(0,0,0,0.8)" rx="5"/>`);
        svgParts.push(`<text x="${x}" y="32" fill="white" font-size="24" font-family="Arial, sans-serif" font-weight="bold" text-anchor="middle">${letter}</text>`);
    }

    // Add row numbers (1-20) on left side
    for (let row = 0; row < GRID_ROWS; row++) {
        const rowNum = row + 1;
        const y = Math.round(row * cellHeight + cellHeight / 2);
        svgParts.push(`<rect x="5" y="${y - 18}" width="45" height="36" fill="rgba(0,0,0,0.8)" rx="5"/>`);
        svgParts.push(`<text x="27" y="${y + 8}" fill="white" font-size="20" font-family="Arial, sans-serif" font-weight="bold" text-anchor="middle">${rowNum}</text>`);
    }

    // Cell labels in center of each cell (subtle, for reference)
    for (let col = 0; col < GRID_COLS; col++) {
        for (let row = 0; row < GRID_ROWS; row++) {
            const label = `${String.fromCharCode(65 + col)}-${row + 1}`;
            const x = Math.round(col * cellWidth + cellWidth / 2);
            const y = Math.round(row * cellHeight + cellHeight / 2 + 6);

            // Changes: Increased opacity to 0.9, added font-weight="bold", increased size to 16
            svgParts.push(`<text x="${x}" y="${y}" fill="rgba(255,255,255,1)" font-weight="bold" font-size="16" font-family="Arial, sans-serif" text-anchor="middle">${label}</text>`);
        }
    }

    // Vibrant colors for different element types
    const typeColors = {
        'Text': { fill: '#E91E63', name: 'Text' },
        'Rectangle': { fill: '#4CAF50', name: 'Rect' },
        'SolidColorShape': { fill: '#00BCD4', name: 'Shape' },
        'MediaContainer': { fill: '#FF9800', name: 'Media' },
        'Image': { fill: '#FF5722', name: 'Image' },
        'Line': { fill: '#9C27B0', name: 'Line' },
        'Ellipse': { fill: '#673AB7', name: 'Ellipse' },
        'Group': { fill: '#009688', name: 'Group' },
        'default': { fill: '#607D8B', name: 'Other' }
    };

    // Build element lookup map for parent chain traversal
    const elements = canvasData.allElements || [];
    const elementMap = new Map();
    for (const el of elements) {
        if (el.id) {
            elementMap.set(el.id, el);
        }
    }

    /**
     * Calculate absolute screen position by walking up the parent chain
     * Child elements inside Groups have translation relative to their parent
     * @param {Object} element - The element to get absolute position for
     * @returns {{ x: number, y: number }} Absolute translation coordinates
     */
    const getAbsolutePosition = (element) => {
        let absoluteX = element.translation?.x || 0;
        let absoluteY = element.translation?.y || 0;

        // Walk up parent chain to accumulate translations
        let parentId = element.parentId;
        while (parentId && elementMap.has(parentId)) {
            const parent = elementMap.get(parentId);
            // Stop at Artboard/Page - they are the root coordinate system
            if (parent.type === "ab:Artboard" || parent.type === "Page" || parent.type === "Artboard") {
                break;
            }
            // Add parent's translation
            absoluteX += parent.translation?.x || 0;
            absoluteY += parent.translation?.y || 0;
            parentId = parent.parentId;
        }

        return { x: absoluteX, y: absoluteY };
    };

    /**
     * Check if an element is a direct child of an Artboard (not nested in a Group)
     * @param {Object} element - The element to check
     * @returns {boolean} True if element's parent is an Artboard
     */
    const isTopLevelElement = (element) => {
        if (!element.parentId) return false;
        const parent = elementMap.get(element.parentId);
        if (!parent) return false;
        return parent.type === "ab:Artboard" || parent.type === "Artboard";
    };

    // Add element bounding boxes and clear labels
    let elementIndex = 0;
    const elementSummary = []; // For adding element list later

    for (const el of elements) {
        if (!el.translation || el.type === "Page" || el.type === "ab:Artboard" || el.type === "Artboard") {
            continue;
        }

        // IMPORTANT: Skip children of Groups - only annotate top-level elements
        // Children have local coordinates relative to their parent Group which
        // would result in incorrect bounding box positions
        // Groups themselves will be annotated with their full bounds
        if (!isTopLevelElement(el)) {
            continue;
        }

        elementIndex++;

        // Get absolute position by walking up parent chain
        const absolutePos = getAbsolutePosition(el);

        // CORRECT CALCULATION: Screen position = absoluteTranslation + boundsLocal offset
        // boundsLocal.x and boundsLocal.y can be negative (e.g., for text that extends above/left of origin)
        const boundsOffsetX = el.boundsLocal?.x || 0;
        const boundsOffsetY = el.boundsLocal?.y || 0;

        // Calculate the actual screen position of the element's bounding box
        const screenX = Math.round(absolutePos.x + boundsOffsetX);
        const screenY = Math.round(absolutePos.y + boundsOffsetY);
        const elWidth = Math.round(el.boundsLocal?.width || el.width || 100);
        const elHeight = Math.round(el.boundsLocal?.height || el.height || 50);

        const typeInfo = typeColors[el.type] || typeColors['default'];
        const color = typeInfo.fill;

        // Calculate center for grid ID (using actual screen center of the element)
        const centerX = screenX + elWidth / 2;
        const centerY = screenY + elHeight / 2;
        const gridId = pixelsToGridId(centerX, centerY, width, height);

        // Store for summary (with correct coordinates)
        elementSummary.push({
            index: elementIndex,
            type: el.type,
            gridId,
            id: el.id,
            screenX,
            screenY,
            width: elWidth,
            height: elHeight
        });


        // Draw filled bounding box with semi-transparency
        svgParts.push(`<rect x="${screenX}" y="${screenY}" width="${elWidth}" height="${elHeight}" fill="${color}30" stroke="${color}" stroke-width="5"/>`);

        // Large element number in top-left corner of element
        svgParts.push(`<circle cx="${screenX + 25}" cy="${screenY + 25}" r="22" fill="${color}" stroke="white" stroke-width="3" filter="url(#shadow)"/>`);
        svgParts.push(`<text x="${screenX + 25}" y="${screenY + 33}" fill="white" font-size="20" font-family="Arial" font-weight="bold" text-anchor="middle">${elementIndex}</text>`);

        // Element info label (positioned smartly)
        let labelText = `#${elementIndex} ${typeInfo.name}`;
        if (el.textContent?.text) {
            const shortText = el.textContent.text.substring(0, 18).replace(/\n/g, ' ');
            labelText += `: "${shortText}${el.textContent.text.length > 18 ? '...' : ''}"`;
        }
        labelText = labelText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // Position label above or below element
        const labelY = screenY > 80 ? screenY - 20 : screenY + elHeight + 35;
        const labelWidth = Math.min(labelText.length * 10 + 30, 450);

        // Label background with shadow
        svgParts.push(`<rect x="${screenX}" y="${labelY - 28}" width="${labelWidth}" height="42" fill="white" stroke="${color}" stroke-width="3" rx="6" filter="url(#shadow)"/>`);

        // Main label text
        svgParts.push(`<text x="${screenX + 10}" y="${labelY - 8}" fill="${color}" font-size="15" font-family="Arial" font-weight="bold">${labelText}</text>`);

        // Grid position and ID
        svgParts.push(`<text x="${screenX + 10}" y="${labelY + 10}" fill="#666" font-size="12" font-family="Arial">📍 ${gridId} | ID: ${el.id.substring(0, 10)}...</text>`);
    }


    // Add element summary panel at bottom
    const panelHeight = 100;
    const panelY = height - panelHeight - 20;
    svgParts.push(`<rect x="20" y="${panelY}" width="${width - 40}" height="${panelHeight}" fill="rgba(255,255,255,0.95)" stroke="#333" stroke-width="3" rx="10" filter="url(#shadow)"/>`);

    // Panel header
    svgParts.push(`<text x="40" y="${panelY + 30}" fill="#333" font-size="18" font-family="Arial" font-weight="bold">📋 ELEMENT REFERENCE (${elementIndex} elements)</text>`);

    // Element list (compact)
    let summaryX = 40;
    let summaryY = panelY + 55;
    for (const item of elementSummary.slice(0, 12)) { // Show first 12
        const typeInfo = typeColors[item.type] || typeColors['default'];
        svgParts.push(`<rect x="${summaryX}" y="${summaryY - 12}" width="16" height="16" fill="${typeInfo.fill}" rx="3"/>`);
        svgParts.push(`<text x="${summaryX + 20}" y="${summaryY}" fill="#333" font-size="12" font-family="Arial">#${item.index} ${typeInfo.name} @ ${item.gridId}</text>`);
        summaryX += 180;
        if (summaryX > width - 200) {
            summaryX = 40;
            summaryY += 20;
        }
    }
    if (elementSummary.length > 12) {
        svgParts.push(`<text x="${summaryX}" y="${summaryY}" fill="#666" font-size="12" font-family="Arial">... and ${elementSummary.length - 12} more</text>`);
    }

    // Legend for colors
    svgParts.push(`<text x="${width - 400}" y="${panelY + 30}" fill="#333" font-size="14" font-family="Arial" font-weight="bold">LEGEND:</text>`);
    let legendX = width - 400;
    let legendY = panelY + 50;
    const legendItems = Object.entries(typeColors).filter(([k]) => k !== 'default').slice(0, 6);
    for (const [type, info] of legendItems) {
        svgParts.push(`<rect x="${legendX}" y="${legendY - 10}" width="14" height="14" fill="${info.fill}" rx="2"/>`);
        svgParts.push(`<text x="${legendX + 18}" y="${legendY + 2}" fill="#333" font-size="11" font-family="Arial">${info.name}</text>`);
        legendX += 70;
        if (legendX > width - 80) {
            legendX = width - 400;
            legendY += 18;
        }
    }

    svgParts.push('</svg>');

    const svgOverlay = svgParts.join('\n');

    // Composite the SVG overlay onto the base image
    const annotatedBuffer = await sharp(baseImageBuffer)
        .composite([{
            input: Buffer.from(svgOverlay),
            gravity: 'northwest'
        }])
        .png()
        .toBuffer();

    console.log(`Created annotated image with ${elementIndex} element markers`);

    return annotatedBuffer;
}

const app = express();


// Enable CORS for all origins (for development)
app.use(cors());

// Increase limit for base64 images
app.use(bodyParser.json({ limit: '50mb' }));

// Initialize Google Gen AI
// Expects GOOGLE_API_KEY in environment variables
const ai = new GoogleGenAI({
    vertexai: true,
    apiKey: "AQ.Ab8RN6IM4vswNdXQbWrjuek33SSmY4p9_tAiS0mn0X9ldy81LQ",
});

app.post('/translate', async (req, res) => {
    try {
        console.log("Received translation request");
        const { image, prompt } = req.body;

        if (!image) {
            return res.status(400).json({ error: "Missing image data" });
        }

        if (!prompt) {
            return res.status(400).json({ error: "Missing prompt" });
        }

        // Remove data URL prefix if present
        const base64Image = image.replace(/^data:image\/\w+;base64,/, "");

        // Construct the prompt for the model
        // We use the prompt provided by the user, plus the image.
        const contents = [
            { text: prompt },
            {
                inlineData: {
                    mimeType: "image/png", // Assuming PNG for simplicity, usually fine
                    data: base64Image,
                },
            },
        ];

        console.log("Calling Gemini API with prompt:", prompt);

        // Using gemini-2.0-flash-exp as the "Nano banana upgraded version"
        // Adjust model name if necessary based on API availability
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-image-preview",
            contents: contents,
            config: {
                responseModalities: ['TEXT', 'IMAGE'],
            }
        });

        let resultImage = null;
        let resultText = "";

        if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.text) {
                    resultText += part.text;
                } else if (part.inlineData) {
                    resultImage = part.inlineData.data;
                }
            }
        }

        if (resultImage) {
            console.log("Image generated successfully");
            res.json({
                success: true,
                image: `data:image/png;base64,${resultImage}`,
                text: resultText
            });
        } else {
            console.log("No image generated, only text:", resultText);
            res.json({
                success: false,
                text: resultText,
                message: "Model returned text but no image. Try adjusting the prompt."
            });
        }

    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.toString()
        });
    }
});

// === TRANSLATION ENDPOINT (Structured Output) ===

// Define the schema for translation response
// We now expect a simple array of strings to be more robust
const translationResponseSchema = z.object({
    translations: z.array(z.string()).describe("Array of translated text strings in the same order as input")
});

// POST /translate-canvas-text - Translate all text content in canvas-data.json using Gemini
app.post('/translate-canvas-text', async (req, res) => {
    try {
        console.log("Received translate canvas text request");
        const { targetLanguage } = req.body;

        if (!targetLanguage) {
            return res.status(400).json({
                success: false,
                error: "Missing targetLanguage in request body"
            });
        }

        // Check if canvas-data.json exists
        try {
            await fs.access(CANVAS_DATA_FILE);
        } catch {
            return res.status(404).json({
                success: false,
                error: "No canvas data file found. Please save canvas data first."
            });
        }

        // Read the canvas data file
        const fileContent = await fs.readFile(CANVAS_DATA_FILE, 'utf8');
        const canvasData = JSON.parse(fileContent);

        // Extract all text content from elements
        const textsToTranslate = [];
        const textElementsMap = new Map(); // Map original text to element indices

        const extractTexts = (elements) => {
            if (!elements) return;
            for (let i = 0; i < elements.length; i++) {
                const element = elements[i];
                if (element.textContent && element.textContent.text) {
                    const text = element.textContent.text;
                    if (!textsToTranslate.includes(text)) {
                        textsToTranslate.push(text);
                    }
                }
                // Also check nested children
                if (element.children) {
                    extractTexts(element.children);
                }
            }
        };

        // Extract from allElements
        extractTexts(canvasData.allElements);

        // Also extract from pages structure
        if (canvasData.pages) {
            for (const page of canvasData.pages) {
                if (page.artboards) {
                    for (const artboard of page.artboards) {
                        extractTexts(artboard.children);
                    }
                }
            }
        }

        if (textsToTranslate.length === 0) {
            return res.json({
                success: true,
                message: "No text elements found to translate",
                translatedCount: 0
            });
        }

        console.log(`Found ${textsToTranslate.length} unique texts to translate to ${targetLanguage}`);

        // Build prompt for Gemini
        const prompt = `Translate the following array of texts to ${targetLanguage}.
Return a JSON object with a "translations" key containing an array of strings.
Each string must be the direct translation of the corresponding source text, in the exact same order.

Ensure the output adheres strictly to the provided JSON schema.

Source Texts:
${JSON.stringify(textsToTranslate, null, 2)}`;

        console.log("Calling Gemini API for translation...");

        // Call Gemini with structured output
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseJsonSchema: zodToJsonSchema(translationResponseSchema),
            },
        });

        // Parse the structured response
        let parsedJson = JSON.parse(response.text);

        // Handle case where model returns array directly instead of { translations: [...] }
        if (Array.isArray(parsedJson)) {
            console.log("Model returned array directly, wrapping in object");
            parsedJson = { translations: parsedJson };
        }

        const translationResult = translationResponseSchema.parse(parsedJson);
        console.log("Translation result:", translationResult);

        // Create a map of original -> translated text
        // We assume the order is preserved, which is standard for this type of prompt
        const translationMap = new Map();
        if (translationResult.translations.length !== textsToTranslate.length) {
            console.warn(`Warning: Mismatch in translation count. Sent ${textsToTranslate.length}, received ${translationResult.translations.length}.`);
            // We will map as many as possible
        }

        for (let i = 0; i < Math.min(textsToTranslate.length, translationResult.translations.length); i++) {
            translationMap.set(textsToTranslate[i], translationResult.translations[i]);
        }

        // Update all text elements in the canvas data
        let updatedCount = 0;

        const updateTexts = (elements) => {
            if (!elements) return;
            for (const element of elements) {
                if (element.textContent && element.textContent.text) {
                    const original = element.textContent.text;
                    const translated = translationMap.get(original);
                    if (translated) {
                        element.textContent.text = translated;
                        updatedCount++;
                    }
                }
                if (element.children) {
                    updateTexts(element.children);
                }
            }
        };

        // Update allElements
        updateTexts(canvasData.allElements);

        // Update pages structure
        if (canvasData.pages) {
            for (const page of canvasData.pages) {
                if (page.artboards) {
                    for (const artboard of page.artboards) {
                        updateTexts(artboard.children);
                    }
                }
            }
        }

        // Add target language to canvas data so sandbox can apply appropriate fonts
        canvasData.targetLanguage = targetLanguage;

        // Save the updated canvas data
        await fs.writeFile(CANVAS_DATA_FILE, JSON.stringify(canvasData, null, 2), 'utf8');
        console.log(`Updated ${updatedCount} text elements and saved to file (targetLanguage: ${targetLanguage})`);

        res.json({
            success: true,
            message: `Translated ${textsToTranslate.length} unique texts to ${targetLanguage}`,
            translatedCount: updatedCount,
            translations: translationResult.translations
        });

    } catch (error) {
        console.error("Error translating canvas text:", error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.toString()
        });
    }
});

// === CANVAS DATA ENDPOINTS ===

// POST /save-canvas-data - Save canvas JSON data to file
app.post('/save-canvas-data', async (req, res) => {
    try {
        console.log("Received canvas data save request");
        const canvasData = req.body;

        if (!canvasData || Object.keys(canvasData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Missing or empty canvas data"
            });
        }

        // Save to file
        await fs.writeFile(CANVAS_DATA_FILE, JSON.stringify(canvasData, null, 2), 'utf8');
        console.log("Canvas data saved to:", CANVAS_DATA_FILE);

        res.json({
            success: true,
            message: "Canvas data saved successfully",
            elementsCount: canvasData.allElements?.length || 0
        });

    } catch (error) {
        console.error("Error saving canvas data:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /get-canvas-data - Retrieve saved canvas JSON data
app.get('/get-canvas-data', async (req, res) => {
    try {
        console.log("Received canvas data get request");

        // Check if file exists
        try {
            await fs.access(CANVAS_DATA_FILE);
        } catch {
            console.log("No saved canvas data found");
            return res.json({
                success: true,
                data: null,
                message: "No saved canvas data found"
            });
        }

        // Read the file
        const fileContent = await fs.readFile(CANVAS_DATA_FILE, 'utf8');
        const canvasData = JSON.parse(fileContent);

        console.log("Canvas data retrieved, elements:", canvasData.allElements?.length || 0);

        res.json({
            success: true,
            data: canvasData,
            elementsCount: canvasData.allElements?.length || 0
        });

    } catch (error) {
        console.error("Error retrieving canvas data:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// === CANVAS IMAGES ENDPOINT ===

// Track current history index for undo/redo
let historyIndex = 0;

// Helper to get all undo files sorted
async function getUndoFiles() {
    try {
        const files = await fs.readdir(__dirname);
        const undoFiles = files.filter(f => f.match(/^canvas-data-undo-\d+\.json$/));
        return undoFiles.sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0]);
            const numB = parseInt(b.match(/\d+/)[0]);
            return numA - numB;
        });
    } catch {
        return [];
    }
}

// POST /clear-canvas-data - Clear canvas-images folder and optionally canvas-data.json
app.post('/clear-canvas-data', async (req, res) => {
    try {
        console.log("Received clear canvas data request");
        const { clearJson = false } = req.body;

        // Clear all files in IMAGES_DIR
        try {
            const files = await fs.readdir(IMAGES_DIR);
            for (const file of files) {
                await fs.unlink(path.join(IMAGES_DIR, file));
            }
            console.log(`Cleared ${files.length} files from canvas-images`);
        } catch (e) {
            console.log("Images directory empty or doesn't exist");
        }

        // Optionally clear canvas-data.json
        if (clearJson) {
            try {
                await fs.unlink(CANVAS_DATA_FILE);
                console.log("Deleted canvas-data.json");
            } catch {
                console.log("canvas-data.json doesn't exist");
            }
        }

        res.json({ success: true, message: "Canvas data cleared" });
    } catch (error) {
        console.error("Error clearing canvas data:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /save-canvas-snapshot - Save current canvas-data.json as undo snapshot
app.post('/save-canvas-snapshot', async (req, res) => {
    try {
        console.log("Saving canvas snapshot for undo");

        // Check if canvas-data.json exists
        try {
            await fs.access(CANVAS_DATA_FILE);
        } catch {
            return res.json({ success: false, error: "No canvas data to snapshot" });
        }

        // Get existing undo files to determine next index
        const undoFiles = await getUndoFiles();
        const nextIndex = undoFiles.length > 0
            ? parseInt(undoFiles[undoFiles.length - 1].match(/\d+/)[0]) + 1
            : 1;

        // Copy current canvas-data.json to undo file
        const snapshotPath = path.join(__dirname, `canvas-data-undo-${nextIndex}.json`);
        const content = await fs.readFile(CANVAS_DATA_FILE, 'utf8');
        await fs.writeFile(snapshotPath, content, 'utf8');

        // Update history index to point to latest
        historyIndex = nextIndex;

        console.log(`Saved snapshot: canvas-data-undo-${nextIndex}.json`);

        res.json({
            success: true,
            snapshotIndex: nextIndex,
            message: `Saved undo snapshot ${nextIndex}`
        });
    } catch (error) {
        console.error("Error saving snapshot:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /undo-canvas - Restore previous canvas state
app.post('/undo-canvas', async (req, res) => {
    try {
        console.log("Undo canvas requested");

        const undoFiles = await getUndoFiles();
        if (undoFiles.length === 0) {
            return res.json({ success: false, error: "No undo history available" });
        }

        // Find the snapshot to restore (current index - 1, but minimum is first snapshot)
        const targetIndex = Math.max(1, historyIndex - 1);
        const targetFile = `canvas-data-undo-${targetIndex}.json`;
        const targetPath = path.join(__dirname, targetFile);

        try {
            await fs.access(targetPath);
        } catch {
            return res.json({ success: false, error: `Snapshot ${targetFile} not found` });
        }

        // Copy undo file to canvas-data.json
        const content = await fs.readFile(targetPath, 'utf8');
        await fs.writeFile(CANVAS_DATA_FILE, content, 'utf8');

        historyIndex = targetIndex;

        console.log(`Restored from ${targetFile}, historyIndex now ${historyIndex}`);

        res.json({
            success: true,
            restoredIndex: targetIndex,
            canUndo: targetIndex > 1,
            canRedo: true,
            data: JSON.parse(content)
        });
    } catch (error) {
        console.error("Error during undo:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /redo-canvas - Restore next canvas state
app.post('/redo-canvas', async (req, res) => {
    try {
        console.log("Redo canvas requested");

        const undoFiles = await getUndoFiles();
        if (undoFiles.length === 0) {
            return res.json({ success: false, error: "No redo history available" });
        }

        const maxIndex = parseInt(undoFiles[undoFiles.length - 1].match(/\d+/)[0]);

        if (historyIndex >= maxIndex) {
            return res.json({ success: false, error: "Already at latest state" });
        }

        const targetIndex = historyIndex + 1;
        const targetFile = `canvas-data-undo-${targetIndex}.json`;
        const targetPath = path.join(__dirname, targetFile);

        try {
            await fs.access(targetPath);
        } catch {
            return res.json({ success: false, error: `Snapshot ${targetFile} not found` });
        }

        // Copy undo file to canvas-data.json
        const content = await fs.readFile(targetPath, 'utf8');
        await fs.writeFile(CANVAS_DATA_FILE, content, 'utf8');

        historyIndex = targetIndex;

        console.log(`Restored from ${targetFile}, historyIndex now ${historyIndex}`);

        res.json({
            success: true,
            restoredIndex: targetIndex,
            canUndo: true,
            canRedo: targetIndex < maxIndex,
            data: JSON.parse(content)
        });
    } catch (error) {
        console.error("Error during redo:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /canvas-history - Get current undo/redo state
app.get('/canvas-history', async (req, res) => {
    try {
        const undoFiles = await getUndoFiles();
        const maxIndex = undoFiles.length > 0
            ? parseInt(undoFiles[undoFiles.length - 1].match(/\d+/)[0])
            : 0;

        res.json({
            success: true,
            historyIndex,
            historyLength: undoFiles.length,
            canUndo: historyIndex > 1,
            canRedo: historyIndex < maxIndex,
            snapshots: undoFiles
        });
    } catch (error) {
        console.error("Error getting history:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper function to ensure images directory exists
async function ensureImagesDir() {
    try {
        await fs.access(IMAGES_DIR);
    } catch {
        await fs.mkdir(IMAGES_DIR, { recursive: true });
        console.log("Created images directory:", IMAGES_DIR);
    }
}

// POST /save-canvas-images - Save canvas image and crop individual images based on node metadata
app.post('/save-canvas-images', async (req, res) => {
    try {
        console.log("Received canvas images save request");

        await ensureImagesDir();

        const { imageNodes, pageRendition, timestamp } = req.body;

        if (!pageRendition) {
            return res.status(400).json({
                success: false,
                error: "Missing page rendition data"
            });
        }

        // Save page rendition as PNG
        const base64Data = pageRendition.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');

        const timestampStr = Date.now();
        const fullPageFileName = `canvas-page-${timestampStr}.png`;
        const fullPagePath = path.join(IMAGES_DIR, fullPageFileName);

        await fs.writeFile(fullPagePath, imageBuffer);
        console.log("Full page rendition saved to:", fullPagePath);

        // Get image dimensions for cropping calculations
        const imageMetadata = await sharp(imageBuffer).metadata();
        console.log("Page image dimensions:", imageMetadata.width, "x", imageMetadata.height);

        // Crop individual images based on node metadata
        const croppedImages = [];

        if (imageNodes && imageNodes.length > 0) {
            console.log(`Processing ${imageNodes.length} image nodes for cropping...`);

            for (let i = 0; i < imageNodes.length; i++) {
                const node = imageNodes[i];

                try {
                    // Calculate crop region from node metadata
                    // The translation gives us the position, boundsLocal gives us the size
                    let x = 0, y = 0, width = 100, height = 100;

                    if (node.translation) {
                        x = Math.max(0, Math.round(node.translation.x));
                        y = Math.max(0, Math.round(node.translation.y));
                    }

                    if (node.boundsLocal) {
                        width = Math.round(node.boundsLocal.width);
                        height = Math.round(node.boundsLocal.height);
                    } else if (node.width && node.height) {
                        width = Math.round(node.width);
                        height = Math.round(node.height);
                    }

                    // Ensure crop region is within image bounds
                    if (x + width > imageMetadata.width) {
                        width = imageMetadata.width - x;
                    }
                    if (y + height > imageMetadata.height) {
                        height = imageMetadata.height - y;
                    }

                    // Skip if dimensions are invalid
                    if (width <= 0 || height <= 0 || x >= imageMetadata.width || y >= imageMetadata.height) {
                        console.warn(`Skipping node ${node.id}: invalid crop region`);
                        continue;
                    }

                    // Crop the image
                    const croppedFileName = `image-${i + 1}-${node.id?.slice(0, 8) || 'unknown'}-${timestampStr}.png`;
                    const croppedPath = path.join(IMAGES_DIR, croppedFileName);

                    await sharp(imageBuffer)
                        .extract({ left: x, top: y, width, height })
                        .toFile(croppedPath);

                    console.log(`Cropped image saved: ${croppedFileName} (${width}x${height} at ${x},${y})`);

                    croppedImages.push({
                        nodeId: node.id,
                        nodeType: node.type,
                        fileName: croppedFileName,
                        cropRegion: { x, y, width, height }
                    });

                } catch (cropError) {
                    console.error(`Error cropping node ${node.id}:`, cropError.message);
                }
            }
        }

        // Save metadata JSON
        const metadataPath = path.join(IMAGES_DIR, `metadata-${timestampStr}.json`);
        await fs.writeFile(metadataPath, JSON.stringify({
            timestamp: timestamp || new Date().toISOString(),
            pageRenditionFile: fullPageFileName,
            pageSize: { width: imageMetadata.width, height: imageMetadata.height },
            imageNodes: imageNodes || [],
            croppedImages: croppedImages
        }, null, 2), 'utf8');

        console.log(`Saved ${croppedImages.length} cropped images and metadata`);

        res.json({
            success: true,
            message: `Saved full page + ${croppedImages.length} cropped images`,
            pageRenditionFile: fullPageFileName,
            croppedImages: croppedImages,
            imageNodesCount: imageNodes?.length || 0
        });

    } catch (error) {
        console.error("Error saving canvas images:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /translate-canvas-images - Extract images, translate with Gemini, return translated images for replacement
app.post('/translate-canvas-images', async (req, res) => {
    try {
        console.log("Received translate canvas images request");

        await ensureImagesDir();

        const { imageNodes, pageRendition, targetLanguage, timestamp } = req.body;

        if (!pageRendition) {
            return res.status(400).json({
                success: false,
                error: "Missing page rendition data"
            });
        }

        if (!targetLanguage) {
            return res.status(400).json({
                success: false,
                error: "Missing target language"
            });
        }

        // Save page rendition as PNG
        const base64Data = pageRendition.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');

        const timestampStr = Date.now();
        const fullPageFileName = `canvas-page-${timestampStr}.png`;
        const fullPagePath = path.join(IMAGES_DIR, fullPageFileName);

        await fs.writeFile(fullPagePath, imageBuffer);
        console.log("Full page rendition saved to:", fullPagePath);

        // Get image dimensions for cropping calculations
        const imageMetadata = await sharp(imageBuffer).metadata();
        console.log("Page image dimensions:", imageMetadata.width, "x", imageMetadata.height);

        // Process and translate individual images
        const translatedImages = [];

        if (imageNodes && imageNodes.length > 0) {
            console.log(`Processing ${imageNodes.length} image nodes for translation...`);

            for (let i = 0; i < imageNodes.length; i++) {
                const node = imageNodes[i];

                try {
                    // Calculate crop region from node metadata
                    let x = 0, y = 0, width = 100, height = 100;

                    if (node.translation) {
                        x = Math.max(0, Math.round(node.translation.x));
                        y = Math.max(0, Math.round(node.translation.y));
                    }

                    if (node.boundsLocal) {
                        width = Math.round(node.boundsLocal.width);
                        height = Math.round(node.boundsLocal.height);
                    } else if (node.width && node.height) {
                        width = Math.round(node.width);
                        height = Math.round(node.height);
                    }

                    // Ensure crop region is within image bounds
                    if (x + width > imageMetadata.width) {
                        width = imageMetadata.width - x;
                    }
                    if (y + height > imageMetadata.height) {
                        height = imageMetadata.height - y;
                    }

                    // Skip if dimensions are invalid
                    if (width <= 0 || height <= 0 || x >= imageMetadata.width || y >= imageMetadata.height) {
                        console.warn(`Skipping node ${node.id}: invalid crop region`);
                        continue;
                    }

                    // Crop the image
                    const croppedBuffer = await sharp(imageBuffer)
                        .extract({ left: x, top: y, width, height })
                        .png()
                        .toBuffer();

                    const croppedBase64 = croppedBuffer.toString('base64');
                    console.log(`Cropped image ${i + 1}: ${width}x${height} at (${x},${y})`);

                    // Save original cropped image
                    const croppedFileName = `original-${i + 1}-${node.id?.slice(0, 8) || 'unknown'}-${timestampStr}.png`;
                    await fs.writeFile(path.join(IMAGES_DIR, croppedFileName), croppedBuffer);

                    // Check if image contains text
                    console.log(`Checking if image ${i + 1} contains text...`);
                    const checkTextContent = [
                        { text: "Does this image contain any understandable text? - that is not cut out. Answer only with YES or NO." },
                        {
                            inlineData: {
                                mimeType: "image/png",
                                data: croppedBase64,
                            },
                        },
                    ];

                    const checkResponse = await ai.models.generateContent({
                        model: "gemini-2.5-flash",
                        contents: checkTextContent,
                    });

                    let hasText = false;
                    try {
                        const checkText = checkResponse.text ||
                            (checkResponse.candidates?.[0]?.content?.parts?.[0]?.text) || "";
                        console.log(`Text check response: ${checkText}`);
                        if (checkText.trim().toUpperCase().includes("YES")) {
                            hasText = true;
                        }
                    } catch (e) {
                        console.warn("Error parsing text check response, proceeding with translation:", e);
                        hasText = true;
                    }

                    if (!hasText) {
                        console.log(`Skipping translation for image ${i + 1} - no text detected.`);
                        continue;
                    }

                    // Translate using Gemini API
                    console.log(`Translating image ${i + 1} to ${targetLanguage}...`);

                    const translationPrompt = `Translate all the text visible in this image to ${targetLanguage}. 
Keep the exact same layout, design, colors, fonts, and styling. 
Only change the text content to the translated version.
Return the translated image.`;

                    const contents = [
                        { text: translationPrompt },
                        {
                            inlineData: {
                                mimeType: "image/png",
                                data: croppedBase64,
                            },
                        },
                    ];

                    const response = await ai.models.generateContent({
                        model: "gemini-3-pro-image-preview",
                        contents: contents,
                        config: {
                            responseModalities: ['TEXT', 'IMAGE'],
                        }
                    });

                    let translatedImageBase64 = null;
                    let translatedText = "";

                    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
                        for (const part of response.candidates[0].content.parts) {
                            if (part.text) {
                                translatedText += part.text;
                            } else if (part.inlineData) {
                                translatedImageBase64 = part.inlineData.data;
                            }
                        }
                    }

                    if (translatedImageBase64) {
                        // Save translated image
                        const translatedFileName = `translated-${i + 1}-${node.id?.slice(0, 8) || 'unknown'}-${timestampStr}.png`;
                        const translatedBuffer = Buffer.from(translatedImageBase64, 'base64');
                        await fs.writeFile(path.join(IMAGES_DIR, translatedFileName), translatedBuffer);

                        console.log(`Translated image saved: ${translatedFileName}`);

                        translatedImages.push({
                            nodeId: node.id,
                            nodeType: node.type,
                            originalFileName: croppedFileName,
                            translatedFileName: translatedFileName,
                            translatedImageBase64: `data:image/png;base64,${translatedImageBase64}`,
                            cropRegion: { x, y, width, height },
                            translatedText: translatedText
                        });
                    } else {
                        console.warn(`No translated image returned for node ${node.id}. Text response: ${translatedText}`);
                    }

                } catch (translateError) {
                    console.error(`Error translating node ${node.id}:`, translateError.message);
                }
            }
        }

        // Save metadata JSON
        const metadataPath = path.join(IMAGES_DIR, `translation-metadata-${timestampStr}.json`);
        await fs.writeFile(metadataPath, JSON.stringify({
            timestamp: timestamp || new Date().toISOString(),
            targetLanguage,
            pageRenditionFile: fullPageFileName,
            pageSize: { width: imageMetadata.width, height: imageMetadata.height },
            imageNodes: imageNodes || [],
            translatedImages: translatedImages.map(img => ({
                ...img,
                translatedImageBase64: '[base64 data omitted]' // Don't save full base64 in metadata
            }))
        }, null, 2), 'utf8');

        console.log(`Translated ${translatedImages.length} images to ${targetLanguage}`);

        res.json({
            success: true,
            message: `Translated ${translatedImages.length} images to ${targetLanguage}`,
            translatedImages: translatedImages,
            imageNodesCount: imageNodes?.length || 0
        });

    } catch (error) {
        console.error("Error translating canvas images:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Define function declarations for layout modifications
// IMPORTANT: move_element_to_grid is the PREFERRED function for positioning - uses grid coordinates (A-1 to T-20)
const layoutModificationFunctions = [
    {
        name: "move_element_to_grid",
        description: `PREFERRED METHOD for moving elements. Moves an element to a specific grid cell on the canvas. 
The canvas has a 20x20 grid overlay with:
- Columns labeled A through T (left to right, 20 columns)
- Rows labeled 1 through 20 (top to bottom, 20 rows)
Each cell can have sub-positions for precise placement:
- "C-5" or "C-5-C" = center of cell C-5
- "C-5-TL" = top-left, "C-5-TR" = top-right, "C-5-BL" = bottom-left, "C-5-BR" = bottom-right
- "C-5-TC" = top-center, "C-5-BC" = bottom-center, "C-5-LC" = left-center, "C-5-RC" = right-center
You can also lock movement to one axis using lockAxis parameter.
Use this function instead of update_element_position for more accurate placement.
Look at the annotated image to see the grid and current element positions.`,
        parameters: {
            type: "object",
            properties: {
                elementId: {
                    type: "string",
                    description: "The unique ID of the element to move (from the canvas data JSON)"
                },
                gridCell: {
                    type: "string",
                    description: "Target grid cell with optional sub-position. Examples: 'C-5' (center), 'C-5-TL' (top-left), 'C-5-TC' (top-center). Format: [Column A-T]-[Row 1-20][-SubPos]"
                },
                alignment: {
                    type: "string",
                    enum: ["center", "top-left", "top-right", "bottom-left", "bottom-right", "top-center", "bottom-center", "left-center", "right-center"],
                    description: "Fallback alignment if not specified in gridCell. Default is 'center'."
                },
                lockAxis: {
                    type: "string",
                    enum: ["horizontal", "vertical"],
                    description: "Lock movement to one axis. 'horizontal' = only vertical movement (X stays same), 'vertical' = only horizontal movement (Y stays same)."
                }
            },

            required: ["elementId", "gridCell"]
        }
    },

    {
        name: "update_element_position",
        description: "Updates the x and y position (translation) of an element using pixel coordinates. Use move_element_to_grid instead when possible for better accuracy.",
        parameters: {
            type: "object",
            properties: {
                elementId: {
                    type: "string",
                    description: "The unique ID of the element to update"
                },
                x: {
                    type: "number",
                    description: "New x position (translation.x) for the element in pixels"
                },
                y: {
                    type: "number",
                    description: "New y position (translation.y) for the element in pixels"
                }
            },
            required: ["elementId", "x", "y"]
        }
    },
    {
        name: "update_element_size",
        description: "Updates the width and height of an element. Only applicable to elements that have width/height properties like Rectangle, MediaContainer.",
        parameters: {
            type: "object",
            properties: {
                elementId: {
                    type: "string",
                    description: "The unique ID of the element to resize"
                },
                width: {
                    type: "number",
                    description: "New width for the element in pixels"
                },
                height: {
                    type: "number",
                    description: "New height for the element in pixels"
                }
            },
            required: ["elementId", "width", "height"]
        }
    },
    {
        name: "update_element_opacity",
        description: "Updates the opacity of an element. Value should be between 0 (transparent) and 1 (opaque).",
        parameters: {
            type: "object",
            properties: {
                elementId: {
                    type: "string",
                    description: "The unique ID of the element to update"
                },
                opacity: {
                    type: "number",
                    description: "New opacity value between 0 and 1"
                }
            },
            required: ["elementId", "opacity"]
        }
    },
    {
        name: "update_element_fill",
        description: "Updates the fill color of an element that supports fill (Rectangle, shapes). Color values are 0-1 range.",
        parameters: {
            type: "object",
            properties: {
                elementId: {
                    type: "string",
                    description: "The unique ID of the element to update"
                },
                red: {
                    type: "number",
                    description: "Red color component (0-1)"
                },
                green: {
                    type: "number",
                    description: "Green color component (0-1)"
                },
                blue: {
                    type: "number",
                    description: "Blue color component (0-1)"
                },
                alpha: {
                    type: "number",
                    description: "Alpha (opacity) component (0-1)"
                }
            },
            required: ["elementId", "red", "green", "blue"]
        }
    },
    // NEW TEXT-SPECIFIC FUNCTIONS
    {
        name: "update_text_content",
        description: "Updates the text content of a Text element. Use this to change what text is displayed. Works only on Text node types.",
        parameters: {
            type: "object",
            properties: {
                elementId: {
                    type: "string",
                    description: "The unique ID of the Text element to update"
                },
                newText: {
                    type: "string",
                    description: "The new text content to display"
                }
            },
            required: ["elementId", "newText"]
        }
    },
    {
        name: "update_text_color",
        description: "Updates the text color of a Text element. Color values are 0-1 range (not 0-255). Applies to entire text content.",
        parameters: {
            type: "object",
            properties: {
                elementId: {
                    type: "string",
                    description: "The unique ID of the Text element to update"
                },
                red: {
                    type: "number",
                    description: "Red color component (0-1)"
                },
                green: {
                    type: "number",
                    description: "Green color component (0-1)"
                },
                blue: {
                    type: "number",
                    description: "Blue color component (0-1)"
                },
                alpha: {
                    type: "number",
                    description: "Alpha (opacity) component (0-1), default is 1"
                }
            },
            required: ["elementId", "red", "green", "blue"]
        }
    },
    {
        name: "update_text_font_size",
        description: "Updates the font size of a Text element in points. Applies to entire text content.",
        parameters: {
            type: "object",
            properties: {
                elementId: {
                    type: "string",
                    description: "The unique ID of the Text element to update"
                },
                fontSize: {
                    type: "number",
                    description: "New font size in points (e.g., 12, 24, 36, 48)"
                }
            },
            required: ["elementId", "fontSize"]
        }
    },
    {
        name: "update_text_style",
        description: "Updates text styling properties like letter spacing, underline, and baseline shift. Provide at least one style property to update.",
        parameters: {
            type: "object",
            properties: {
                elementId: {
                    type: "string",
                    description: "The unique ID of the Text element to update"
                },
                letterSpacing: {
                    type: "number",
                    description: "Letter spacing in pixels (can be negative for tighter spacing)"
                },
                underline: {
                    type: "boolean",
                    description: "Whether to underline the text (true/false)"
                },
                baselineShift: {
                    type: "string",
                    enum: ["superscript", "subscript", "normal"],
                    description: "Baseline shift for super/subscript effects"
                }
            },
            required: ["elementId"]
        }
    },
    // DELETE ELEMENT FUNCTION
    {
        name: "delete_element",
        description: "Deletes an element from the canvas. The element will be removed completely when the canvas data is loaded. Use this to remove unwanted or cluttering elements.",
        parameters: {
            type: "object",
            properties: {
                elementId: {
                    type: "string",
                    description: "The unique ID of the element to delete"
                },
                reason: {
                    type: "string",
                    description: "Optional: reason for deletion (for logging/debugging)"
                }
            },
            required: ["elementId"]
        }
    },
    // AI IMAGE GENERATION FUNCTION
    {
        name: "generate_and_apply_image",
        description: `Generates an image using AI (Nano Banana/Gemini) based on a text prompt, removes the background using Cloudinary, saves it to canvas-images, and places it on the canvas. 
If replaceExistingGridId is provided, the system will find the nearest image/MediaContainer element to that grid position, remove it, and place the new image at that exact grid position.
Otherwise, places at the specified grid cell with given dimensions.
The image will be upscaled 10X after background removal for best quality, then resized to fit within the specified dimensions.
Use this to add or replace decorative elements, icons, illustrations, or product images to enhance the design.`,
        parameters: {
            type: "object",
            properties: {
                prompt: {
                    type: "string",
                    description: "Detailed text prompt describing the image to generate (e.g., 'a colorful tropical flower', 'modern coffee cup icon', 'professional business person')"
                },
                gridCell: {
                    type: "string",
                    description: "Target grid cell for placement. Format: [Column A-T]-[Row 1-20] with optional sub-position. Examples: 'C-5' (center), 'J-10-TL' (top-left of cell). Not required if replaceExistingGridId is provided."
                },
                width: {
                    type: "number",
                    description: "Target width for the image in pixels (will maintain aspect ratio). Should be larger than expected for best quality."
                },
                height: {
                    type: "number",
                    description: "Target height for the image in pixels (will maintain aspect ratio). Should be larger than expected for best quality."
                },
                removeBackground: {
                    type: "boolean",
                    description: "Whether to remove the background from the generated image using Cloudinary (default: true)"
                },
                replaceExistingGridId: {
                    type: "string",
                    description: "Grid cell ID (e.g., 'C-5', 'J-10') to find the nearest image/MediaContainer element to replace. The nearest image element to this grid position will be removed and the new image will be placed at this grid position. This is the PREFERRED method for replacing images."
                },
                minSizePercent: {
                    type: "number",
                    description: "Minimum size as percentage of original dimensions when replacing. MUST BE MORE THAN 80% (default: 80)"
                }
            },
            required: ["prompt"]
        }
    }
];


// Helper function to execute layout modification functions on canvas data
function executeLayoutFunction(canvasData, functionName, args) {
    const result = { success: false, message: "", elementId: args.elementId };

    // Find element in allElements
    const findElement = (elements, id) => {
        for (const el of elements) {
            if (el.id === id) return el;
            if (el.children) {
                const found = findElement(el.children, id);
                if (found) return found;
            }
        }
        return null;
    };

    // Also find in pages structure
    const findInPages = (pages, id) => {
        for (const page of pages) {
            if (page.id === id) return page;
            if (page.artboards) {
                for (const artboard of page.artboards) {
                    if (artboard.id === id) return artboard;
                    if (artboard.children) {
                        const found = findElement(artboard.children, id);
                        if (found) return found;
                    }
                }
            }
        }
        return null;
    };

    // SPECIAL CASE: Handle functions that don't require an existing element
    // generate_and_apply_image creates a NEW element OR replaces an existing one
    if (functionName === "generate_and_apply_image") {
        console.log("=== Processing generate_and_apply_image ===");

        // Get canvas dimensions for grid calculations
        const artboard = canvasData.pages?.[0]?.artboards?.[0];
        const canvasWidth = artboard?.width || 2550;
        const canvasHeight = artboard?.height || 3300;

        // Check if we're replacing an existing element by grid position
        if (args.replaceExistingGridId) {
            console.log(`Replacement mode: finding nearest image element to grid ${args.replaceExistingGridId}`);

            // Convert grid ID to pixel coordinates
            const { x: gridX, y: gridY } = gridIdToPixels(args.replaceExistingGridId, canvasWidth, canvasHeight, "center");
            console.log(`Grid ${args.replaceExistingGridId} -> pixels (${gridX}, ${gridY})`);

            // Find all image/MediaContainer elements
            const imageElements = [];
            const findImageElements = (elements, parentTranslation = { x: 0, y: 0 }) => {
                for (const el of elements) {
                    if (el.type === 'MediaContainer' || el.type === 'ImageRectangle' ||
                        el.name?.toLowerCase().includes('image') || el._newImage) {
                        const elX = (el.translation?.x || 0) + parentTranslation.x;
                        const elY = (el.translation?.y || 0) + parentTranslation.y;
                        const elCenterX = elX + (el.boundsLocal?.width || el.width || 0) / 2;
                        const elCenterY = elY + (el.boundsLocal?.height || el.height || 0) / 2;

                        // Calculate distance from element center to grid position
                        const distance = Math.sqrt(Math.pow(elCenterX - gridX, 2) + Math.pow(elCenterY - gridY, 2));

                        imageElements.push({
                            element: el,
                            id: el.id,
                            centerX: elCenterX,
                            centerY: elCenterY,
                            distance: distance
                        });
                    }
                    if (el.children) {
                        findImageElements(el.children, {
                            x: (el.translation?.x || 0) + parentTranslation.x,
                            y: (el.translation?.y || 0) + parentTranslation.y
                        });
                    }
                }
            };

            if (canvasData.allElements) {
                findImageElements(canvasData.allElements);
            }

            // Sort by distance and get the nearest one
            imageElements.sort((a, b) => a.distance - b.distance);

            if (imageElements.length > 0) {
                const nearestImage = imageElements[0];
                console.log(`Found nearest image element: ${nearestImage.id} at distance ${nearestImage.distance.toFixed(2)}px`);
                console.log(`  Center: (${nearestImage.centerX.toFixed(0)}, ${nearestImage.centerY.toFixed(0)})`);

                // Mark this element for deletion
                const targetElement = nearestImage.element;

                // Use the grid position for the new image, not the old element's position
                const minPercent = args.minSizePercent || 80;
                const origWidth = targetElement.boundsLocal?.width || targetElement.width || 300;
                const origHeight = targetElement.boundsLocal?.height || targetElement.height || 300;
                const minWidth = Math.round(origWidth * (minPercent / 100));
                const minHeight = Math.round(origHeight * (minPercent / 100));

                result.success = true;
                result.isAsyncImageGeneration = true;
                result.isReplacement = true;
                result.replaceExistingGridId = args.replaceExistingGridId;
                result.replacedElementId = nearestImage.id;
                result.prompt = args.prompt;
                // Use the GRID position for new placement
                result.gridCell = args.replaceExistingGridId;
                // Use provided dimensions or fallback to original (respecting min size)
                result.width = args.width || Math.max(origWidth, minWidth);
                result.height = args.height || Math.max(origHeight, minHeight);
                result.minWidth = minWidth;
                result.minHeight = minHeight;
                result.removeBackground = args.removeBackground !== false;
                result.message = `Queued image replacement at grid ${args.replaceExistingGridId} (replacing element ${nearestImage.id}): "${args.prompt.substring(0, 50)}..." (${result.width}x${result.height})`;
                console.log("Result (grid replacement mode):", JSON.stringify(result, null, 2));
                return result;
            } else {
                console.warn(`No image elements found near grid ${args.replaceExistingGridId}, falling back to new element mode at that grid position`);
                // Fall through to new element mode but use the replacement grid as the target
                args.gridCell = args.replaceExistingGridId;
            }
        }

        // New element mode (original behavior)
        result.success = true;
        result.isAsyncImageGeneration = true;
        result.isReplacement = false;
        result.prompt = args.prompt;
        result.gridCell = args.gridCell || args.replaceExistingGridId || 'J-10';
        result.width = args.width || 300;
        result.height = args.height || 300;
        result.removeBackground = args.removeBackground !== false; // Default to true
        result.message = `Queued image generation: "${args.prompt.substring(0, 50)}..." at ${result.gridCell} (${result.width}x${result.height})`;
        console.log("Result (new element mode):", JSON.stringify(result, null, 2));
        return result;
    }


    // Find element in both structures
    let element = canvasData.allElements ? findElement(canvasData.allElements, args.elementId) : null;
    let pageElement = canvasData.pages ? findInPages(canvasData.pages, args.elementId) : null;

    if (!element && !pageElement) {
        result.message = `Element with ID ${args.elementId} not found`;
        return result;
    }

    // Apply modifications to both element references if they exist
    const elementsToUpdate = [element, pageElement].filter(Boolean);

    switch (functionName) {
        case "move_element_to_grid":
            try {
                // Get canvas dimensions from artboard
                const artboard = canvasData.pages?.[0]?.artboards?.[0];
                const canvasWidth = artboard?.width || 2550;
                const canvasHeight = artboard?.height || 3300;

                // Get current position for axis locking
                const currentX = element?.translation?.x || 0;
                const currentY = element?.translation?.y || 0;

                // Get element dimensions for center-based positioning
                // boundsLocal gives the actual visual bounds, boundsLocal.x/y can be negative for text
                const boundsOffsetX = element?.boundsLocal?.x || 0;
                const boundsOffsetY = element?.boundsLocal?.y || 0;
                const elWidth = element?.boundsLocal?.width || element?.width || 0;
                const elHeight = element?.boundsLocal?.height || element?.height || 0;

                // Convert grid cell to pixel coordinates with options
                const alignment = args.alignment || "center";
                const options = {};
                if (args.lockAxis) {
                    options.lockAxis = args.lockAxis;
                    options.currentX = currentX;
                    options.currentY = currentY;
                }

                const { x: targetX, y: targetY } = gridIdToPixels(args.gridCell, canvasWidth, canvasHeight, alignment, options);

                // Calculate the translation needed to place the element's CENTER at the target position
                // Screen position = translation + boundsOffset
                // We want: screenX + elWidth/2 = targetX  and  screenY + elHeight/2 = targetY
                // So: translation.x + boundsOffsetX + elWidth/2 = targetX
                // Therefore: translation.x = targetX - boundsOffsetX - elWidth/2
                const x = Math.round(targetX - boundsOffsetX - elWidth / 2);
                const y = Math.round(targetY - boundsOffsetY - elHeight / 2);

                const lockInfo = args.lockAxis ? ` (${args.lockAxis} locked)` : '';
                console.log(`Converting grid cell ${args.gridCell} (${alignment})${lockInfo} -> center at (${targetX}, ${targetY}), translation (${x}, ${y})`);

                // Apply position update
                for (const el of elementsToUpdate) {
                    if (!el.translation) {
                        el.translation = { x: 0, y: 0 };
                    }
                    el.translation.x = x;
                    el.translation.y = y;
                    if (el.transformMatrix) {
                        el.transformMatrix["4"] = x;
                        el.transformMatrix["5"] = y;
                    }
                }
                result.success = true;
                result.message = `Moved element ${args.elementId} center to grid cell ${args.gridCell} (${alignment})${lockInfo} -> center at (${targetX}, ${targetY})`;
                result.gridCell = args.gridCell;
                result.pixelPosition = { x: targetX, y: targetY };
                result.translation = { x, y };
                if (args.lockAxis) result.lockAxis = args.lockAxis;
            } catch (gridError) {
                result.success = false;
                result.message = `Error converting grid cell: ${gridError.message}`;
            }
            break;


        case "update_element_position":
            for (const el of elementsToUpdate) {
                if (!el.translation) {
                    el.translation = { x: 0, y: 0 };
                }
                el.translation.x = args.x;
                el.translation.y = args.y;
                // Also update transformMatrix if it exists
                if (el.transformMatrix) {
                    el.transformMatrix["4"] = args.x;
                    el.transformMatrix["5"] = args.y;
                }
            }
            result.success = true;
            result.message = `Updated position of element ${args.elementId} to (${args.x}, ${args.y})`;
            break;


        case "update_element_size":
            for (const el of elementsToUpdate) {
                if (el.width !== undefined) el.width = args.width;
                if (el.height !== undefined) el.height = args.height;
                if (el.boundsLocal) {
                    el.boundsLocal.width = args.width;
                    el.boundsLocal.height = args.height;
                }
            }
            result.success = true;
            result.message = `Updated size of element ${args.elementId} to ${args.width}x${args.height}`;
            break;

        case "update_element_opacity":
            for (const el of elementsToUpdate) {
                el.opacity = Math.max(0, Math.min(1, args.opacity));
            }
            result.success = true;
            result.message = `Updated opacity of element ${args.elementId} to ${args.opacity}`;
            break;

        case "update_element_fill":
            for (const el of elementsToUpdate) {
                if (!el.fill) {
                    el.fill = { type: "Color", color: {} };
                }
                el.fill.color = {
                    red: Math.max(0, Math.min(1, args.red)),
                    green: Math.max(0, Math.min(1, args.green)),
                    blue: Math.max(0, Math.min(1, args.blue)),
                    alpha: args.alpha !== undefined ? Math.max(0, Math.min(1, args.alpha)) : 1
                };
            }
            result.success = true;
            result.message = `Updated fill color of element ${args.elementId}`;
            break;

        // NEW TEXT-SPECIFIC FUNCTION HANDLERS
        case "update_text_content":
            for (const el of elementsToUpdate) {
                // Validate this is a text element
                if (el.type !== "Text" && el.type !== "TextNode" &&
                    el.type !== "StandaloneTextNode" && el.type !== "ThreadedTextNode") {
                    result.message = `Element ${args.elementId} is not a Text element (type: ${el.type})`;
                    return result;
                }
                // Update text content
                if (!el.textContent) {
                    el.textContent = {};
                }
                el.textContent.text = args.newText;
            }
            result.success = true;
            result.message = `Updated text content of element ${args.elementId} to "${args.newText.substring(0, 50)}${args.newText.length > 50 ? '...' : ''}"`;
            break;

        case "update_text_color":
            for (const el of elementsToUpdate) {
                // Validate this is a text element
                if (el.type !== "Text" && el.type !== "TextNode" &&
                    el.type !== "StandaloneTextNode" && el.type !== "ThreadedTextNode") {
                    result.message = `Element ${args.elementId} is not a Text element (type: ${el.type})`;
                    return result;
                }
                // Initialize textStyles if not present
                if (!el.textStyles) {
                    el.textStyles = {};
                }
                el.textStyles.color = {
                    red: Math.max(0, Math.min(1, args.red)),
                    green: Math.max(0, Math.min(1, args.green)),
                    blue: Math.max(0, Math.min(1, args.blue)),
                    alpha: args.alpha !== undefined ? Math.max(0, Math.min(1, args.alpha)) : 1
                };
            }
            result.success = true;
            result.message = `Updated text color of element ${args.elementId} to rgb(${Math.round(args.red * 255)}, ${Math.round(args.green * 255)}, ${Math.round(args.blue * 255)})`;
            break;

        case "update_text_font_size":
            for (const el of elementsToUpdate) {
                // Validate this is a text element
                if (el.type !== "Text" && el.type !== "TextNode" &&
                    el.type !== "StandaloneTextNode" && el.type !== "ThreadedTextNode") {
                    result.message = `Element ${args.elementId} is not a Text element (type: ${el.type})`;
                    return result;
                }
                // Initialize textStyles if not present
                if (!el.textStyles) {
                    el.textStyles = {};
                }
                el.textStyles.fontSize = args.fontSize;
            }
            result.success = true;
            result.message = `Updated font size of element ${args.elementId} to ${args.fontSize}pt`;
            break;

        case "update_text_style":
            for (const el of elementsToUpdate) {
                // Validate this is a text element
                if (el.type !== "Text" && el.type !== "TextNode" &&
                    el.type !== "StandaloneTextNode" && el.type !== "ThreadedTextNode") {
                    result.message = `Element ${args.elementId} is not a Text element (type: ${el.type})`;
                    return result;
                }
                // Initialize textStyles if not present
                if (!el.textStyles) {
                    el.textStyles = {};
                }
                // Apply provided style properties
                const changes = [];
                if (args.letterSpacing !== undefined) {
                    el.textStyles.letterSpacing = args.letterSpacing;
                    changes.push(`letterSpacing: ${args.letterSpacing}`);
                }
                if (args.underline !== undefined) {
                    el.textStyles.underline = args.underline;
                    changes.push(`underline: ${args.underline}`);
                }
                if (args.baselineShift !== undefined) {
                    el.textStyles.baselineShift = args.baselineShift;
                    changes.push(`baselineShift: ${args.baselineShift}`);
                }
                result.success = changes.length > 0;
                result.message = changes.length > 0
                    ? `Updated text style of element ${args.elementId}: ${changes.join(', ')}`
                    : `No style properties provided for element ${args.elementId}`;
            }
            if (!result.message) {
                result.success = true;
                result.message = `Updated text style of element ${args.elementId}`;
            }
            break;

        case "delete_element":
            // Mark element for deletion in both allElements and pages structures
            for (const el of elementsToUpdate) {
                el._deleted = true;
                if (args.reason) {
                    el._deleteReason = args.reason;
                }
            }
            // Also add to a deletedElements array at root level for easy tracking
            if (!canvasData.deletedElements) {
                canvasData.deletedElements = [];
            }
            canvasData.deletedElements.push({
                id: args.elementId,
                reason: args.reason || 'No reason provided',
                deletedAt: new Date().toISOString()
            });
            result.success = true;
            result.message = `Marked element ${args.elementId} for deletion${args.reason ? ` (reason: ${args.reason})` : ''}`;
            break;

        // NOTE: generate_and_apply_image is handled as a special case BEFORE element lookup
        // since it creates a NEW element rather than modifying an existing one

        default:
            result.message = `Unknown function: ${functionName}`;
    }

    return result;
}

// POST /enhancelayout - Use Gemini to analyze and improve canvas layout with streaming + thinking
app.post('/enhancelayout', async (req, res) => {
    try {
        console.log("Received enhance layout request");

        const { pageRendition, improvementFocus, customPrompt, iterationInfo } = req.body;

        // Log iteration info if present
        if (iterationInfo) {
            console.log(`Iteration ${iterationInfo.currentIteration}/${iterationInfo.totalIterations}`);
            if (iterationInfo.previousSummary) {
                console.log(`Previous summary: ${iterationInfo.previousSummary.substring(0, 100)}...`);
            }
            if (iterationInfo.planForThisIteration) {
                console.log(`Plan for this iteration: ${iterationInfo.planForThisIteration}`);
            }
        }

        // Check if canvas-data.json exists
        try {
            await fs.access(CANVAS_DATA_FILE);
        } catch {
            return res.status(404).json({
                success: false,
                error: "No canvas data file found. Please save canvas data first."
            });
        }

        // Read the canvas data file
        const fileContent = await fs.readFile(CANVAS_DATA_FILE, 'utf8');
        let canvasData = JSON.parse(fileContent);

        // Get canvas dimensions
        const artboard = canvasData.pages?.[0]?.artboards?.[0];
        const canvasWidth = artboard?.width || 2550;
        const canvasHeight = artboard?.height || 3300;
        const cellWidth = Math.round(canvasWidth / GRID_COLS);
        const cellHeight = Math.round(canvasHeight / GRID_ROWS);

        // Build iteration context for multi-iteration mode
        let iterationContext = '';
        if (iterationInfo && iterationInfo.totalIterations > 1) {
            const { currentIteration, totalIterations, previousSummary, planForThisIteration } = iterationInfo;

            iterationContext = `
=== MULTI-ITERATION MODE ===
This is iteration ${currentIteration} of ${totalIterations}.
`;

            // Define iteration-specific focuses if no plan provided
            const defaultIterationFocus = {
                1: "Focus on GENERATING NEW IMAGES: Use generate_and_apply_image to add decorative elements, product images, or icons that enhance the design. Position them in empty or sparse areas of the canvas.",
                2: "Focus on MOVING IMAGE ELEMENTS: Reposition MediaContainer and image elements to better grid positions. Ensure images don't overlap with text or other images. Replace existing images with better ones using replaceExistingId parameter.",
                3: "Focus on MOVING TEXT ELEMENTS: Adjust Text element positions for better readability and visual hierarchy. Ensure text doesn't overlap with images or other text.",
                4: "Focus on FINAL POLISH: Check for any remaining overlaps, adjust spacing, ensure visual balance. Make minor adjustments to colors, opacity, or sizes if needed."
            };

            // Get iteration focus - use provided plan or default based on iteration number
            const focusForIteration = planForThisIteration ||
                defaultIterationFocus[Math.min(currentIteration, 4)] ||
                "General layout refinement and polish";

            iterationContext += `
ITERATION FOCUS: ${focusForIteration}
`;

            if (previousSummary && currentIteration > 1) {
                iterationContext += `
PREVIOUS ITERATIONS SUMMARY:
${previousSummary}

Based on the above, continue improving the layout. Do NOT repeat changes that were already made in previous iterations.
`;
            }

            // Iteration-specific instructions
            if (currentIteration === 1) {
                iterationContext += `
FIRST ITERATION INSTRUCTIONS:
- Prioritize generating new images using generate_and_apply_image
- When replacing existing images, use the replaceExistingId parameter to replace in-place
- Set minSizePercent to at least 70 to maintain reasonable image sizes
- Look at existing MediaContainer elements and consider regenerating/improving them
`;
            } else if (currentIteration === 2) {
                iterationContext += `
SECOND ITERATION INSTRUCTIONS:
- Focus on repositioning image and media elements
- Use move_element_to_grid to adjust MediaContainer positions
- If an image needs to be replaced, use generate_and_apply_image with replaceExistingId
- Ensure images are well-distributed across the canvas
`;
            } else if (currentIteration === 3) {
                iterationContext += `
THIRD ITERATION INSTRUCTIONS:
- Focus on Text element positioning
- Ensure text is readable and not overlapping with images
- Adjust text positions, sizes, or colors if needed
- Create visual hierarchy with heading and body text
`;
            } else {
                iterationContext += `
FINAL ITERATION INSTRUCTIONS:
- Review the entire layout for any remaining issues
- Make only minimal, necessary adjustments
- Ensure the design is cohesive and professional
- Check for overlaps, spacing issues, and visual balance
`;
            }
        }

        // Build the enhanced prompt with grid system explanation
        const layoutAnalysisPrompt = `You are an expert UI/UX designer and layout specialist. Analyze the provided canvas design using the ANNOTATED IMAGE and JSON data to suggest and implement layout improvements.
${iterationContext}
=== GRID SYSTEM EXPLANATION ===
The canvas has a ${GRID_COLS}x${GRID_ROWS} GRID OVERLAY visible in the annotated image:
- Canvas size: ${canvasWidth}px wide × ${canvasHeight}px tall
- Grid: ${GRID_COLS} columns (A through T, left to right) × ${GRID_ROWS} rows (1 through 20, top to bottom)
- Each grid cell is approximately ${cellWidth}px wide × ${cellHeight}px tall
- Grid cells are labeled like "A-1" (top-left), "J-10" (center area), "T-20" (bottom-right)

The annotated image shows:
1. WHITE GRID LINES with cell labels (A-1, A-2, ... T-20)
2. COLORED BOUNDING BOXES around each element with:
   - The element TYPE and content preview
   - The element ID (shortened) and current grid position

=== YOUR TASK ===
1. Examine the annotated image to understand the current layout
2. Identify overlapping elements, poor spacing, or misaligned content
3. Use the move_element_to_grid function to reposition elements to better grid cells
4. IMPORTANT: Use grid cell IDs (like "C-5", "H-12") instead of pixel coordinates
5. Consider:
   - Visual balance and symmetry
   - Proper spacing between elements (at least 1-2 grid cells apart)
   - Text elements should not overlap with images or other text
   - Important content should be in prominent grid areas (top rows, center)

=== IMAGE REPLACEMENT ===
To replace an existing image, use generate_and_apply_image with:
- replaceExistingId: the ID of the MediaContainer/image to replace
- minSizePercent: minimum size as % of original (default 70, so 100x100 becomes at least 70x70)
- The new image will be placed at the same position as the original

=== CANVAS DATA JSON ===
${JSON.stringify(canvasData, null, 2)}

${improvementFocus ? `FOCUS AREAS: ${improvementFocus}` : 'General layout improvement requested.'}
${customPrompt ? `\n=== USER CUSTOM INSTRUCTIONS ===\n${customPrompt}` : ''}

=== INSTRUCTIONS ===
- ALWAYS use move_element_to_grid function for repositioning (grid-based is more accurate than pixels)
- Ensure NO elements overlap after your changes
- Make the layout look professional, clean, and balanced
- Call functions for EACH element that needs to be moved
- Very very important:
- When you move an element to a grid cell, the element's CENTER will be placed at that grid position. This matches how element positions are displayed.
- Since we will be using these adjustments in Adobe Express, it is not necessary to center all elements. Ensure elements are not overlapping with images. The overall canvas view should look beautiful after editing.
- Move only those elements , which appear out of place , and we have to absouletely move them.
- replacement is allowed but do not delete an element unless absouletely necessary.
`;
        // ${JSON.stringify(canvasData, null, 2)}
        // - Move only those elements , which appear out of place , and we have to absouletely move them.

        // Prepare contents for Gemini
        const contents = [{ text: layoutAnalysisPrompt }];

        // Create and add annotated image if page rendition is provided
        let annotatedImagePath = null;
        if (pageRendition) {
            try {
                const base64Data = pageRendition.replace(/^data:image\/\w+;base64,/, "");
                const imageBuffer = Buffer.from(base64Data, 'base64');

                // Create annotated image with grid overlay and element markers
                console.log("Creating annotated image with grid overlay...");
                const annotatedBuffer = await createAnnotatedImage(imageBuffer, canvasData);

                // Save annotated image to disk for debugging/reference
                await ensureImagesDir();
                const timestampStr = Date.now();
                annotatedImagePath = path.join(IMAGES_DIR, `annotated-grid-${timestampStr}.png`);
                await fs.writeFile(annotatedImagePath, annotatedBuffer);
                console.log("Annotated image saved to:", annotatedImagePath);

                // Add annotated image to Gemini contents
                const annotatedBase64 = annotatedBuffer.toString('base64');
                contents.push({
                    inlineData: {
                        mimeType: "image/png",
                        data: annotatedBase64,
                    }
                });
                console.log("Including ANNOTATED image (with grid overlay) in analysis");
            } catch (annotateError) {
                console.error("Error creating annotated image:", annotateError);
                // Fall back to original image
                const base64Image = pageRendition.replace(/^data:image\/\w+;base64,/, "");
                contents.push({
                    inlineData: {
                        mimeType: "image/png",
                        data: base64Image,
                    }
                });
                console.log("Falling back to original image (annotation failed)");
            }
        }


        console.log("Calling Gemini API for layout analysis with function calling and streaming + thinking...");

        // Set up SSE (Server-Sent Events) for streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();

        // Helper to send SSE events
        const sendEvent = (eventType, data) => {
            res.write(`event: ${eventType}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Call Gemini with function declarations + thinking enabled + streaming
        const stream = await ai.models.generateContentStream({
            model: "gemini-3-flash-preview",
            contents: contents,
            config: {
                tools: [{
                    functionDeclarations: layoutModificationFunctions
                }],
                thinkingConfig: {
                    includeThoughts: true
                }
            }
        });

        // Process streamed chunks
        const appliedChanges = [];
        let analysisText = "";
        let thoughtsSummary = "";

        for await (const chunk of stream) {
            if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
                for (const part of chunk.candidates[0].content.parts) {
                    if (!part.text && !part.functionCall) continue;

                    if (part.thought && part.text) {
                        // This is a thought summary
                        thoughtsSummary += part.text;
                        console.log("Thought:", part.text);
                        sendEvent('thought', { text: part.text });
                    } else if (part.text) {
                        // Regular analysis text
                        analysisText += part.text;
                        console.log("Analysis:", part.text);
                        sendEvent('analysis', { text: part.text });
                    } else if (part.functionCall) {
                        // Function call from the model
                        const funcCall = part.functionCall;
                        console.log(`Executing function: ${funcCall.name}`, funcCall.args);
                        sendEvent('functionCall', { name: funcCall.name, args: funcCall.args });

                        const result = executeLayoutFunction(canvasData, funcCall.name, funcCall.args);
                        appliedChanges.push({
                            function: funcCall.name,
                            args: funcCall.args,
                            result: result
                        });
                        sendEvent('functionResult', { ...result, function: funcCall.name });
                    }
                }
            }
        }

        // Process any async image generation requests
        console.log("\n=== IMAGE GENERATION PROCESSING ===");
        console.log(`Total applied changes: ${appliedChanges.length}`);

        // Debug: log all changes to see what's coming through
        appliedChanges.forEach((c, i) => {
            console.log(`Change ${i}: function=${c.function}, result.isAsyncImageGeneration=${c.result?.isAsyncImageGeneration}, result.success=${c.result?.success}`);
            if (c.function === 'generate_and_apply_image') {
                console.log(`  -> This IS a generate_and_apply_image call`);
                console.log(`  -> result:`, JSON.stringify(c.result, null, 2));
            }
        });

        const imageGenerationTasks = appliedChanges.filter(c => c.result && c.result.isAsyncImageGeneration === true);
        console.log(`Found ${imageGenerationTasks.length} image generation tasks`);
        const generatedImages = [];

        for (const task of imageGenerationTasks) {
            const {
                prompt, gridCell, width, height, removeBackground,
                isReplacement, replaceExistingGridId, replacedElementId,
                minWidth, minHeight
            } = task.result;

            console.log(`\n--- Processing image generation task ---`);
            console.log(`Prompt: "${prompt}"`);
            console.log(`Mode: ${isReplacement ? 'REPLACEMENT' : 'NEW'}`);
            if (isReplacement) {
                console.log(`Replacing at grid: ${replaceExistingGridId}`);
                console.log(`Element to delete: ${replacedElementId}`);
                console.log(`Min dimensions: ${minWidth}x${minHeight}`);
            } else {
                console.log(`Grid: ${gridCell}, Size: ${width}x${height}, RemoveBg: ${removeBackground}`);
            }
            sendEvent('imageGeneration', {
                status: 'starting',
                prompt: prompt.substring(0, 50) + '...',
                isReplacement,
                replaceExistingGridId,
                replacedElementId
            });

            try {
                // Step 1: Generate image using Nano Banana (Gemini)
                console.log(`Generating image with prompt: "${prompt}"`);
                sendEvent('imageGeneration', { status: 'generating', prompt });

                const generatePrompt = `Generate a high-quality image: ${prompt}. 
The image should be clean, professional, and suitable for use in a design layout.
Output ONLY the image, no text.`;

                const genResponse = await ai.models.generateContent({
                    model: "gemini-3-pro-image-preview",
                    contents: [{ text: generatePrompt }],
                    config: {
                        responseModalities: ['IMAGE'],
                    }
                });

                let generatedImageBase64 = null;
                if (genResponse.candidates && genResponse.candidates[0]?.content?.parts) {
                    for (const part of genResponse.candidates[0].content.parts) {
                        if (part.inlineData) {
                            generatedImageBase64 = part.inlineData.data;
                            break;
                        }
                    }
                }

                if (!generatedImageBase64) {
                    console.error("No image generated for prompt:", prompt);
                    sendEvent('imageGeneration', { status: 'failed', error: 'No image generated' });
                    continue;
                }

                console.log("Image generated successfully");
                sendEvent('imageGeneration', { status: 'generated' });

                // Step 2: Remove background using Cloudinary (if requested)
                let finalImageBuffer = Buffer.from(generatedImageBase64, 'base64');
                let finalImageBase64 = generatedImageBase64;

                if (removeBackground) {
                    try {
                        console.log("\n=== CLOUDINARY BACKGROUND REMOVAL ===");
                        console.log("Removing background with Cloudinary...");
                        sendEvent('imageGeneration', { status: 'removing_background' });

                        // Upload to Cloudinary first (without background_removal option which is async)
                        console.log("Uploading image to Cloudinary...");
                        const uploadResult = await new Promise((resolve, reject) => {
                            const uploadStream = cloudinary.uploader.upload_stream(
                                {
                                    folder: 'ai_generated',
                                    resource_type: 'image'
                                },
                                (error, result) => {
                                    if (error) {
                                        console.error("Cloudinary upload error:", error);
                                        reject(error);
                                    } else {
                                        console.log("Cloudinary upload success:");
                                        console.log("  - public_id:", result.public_id);
                                        console.log("  - secure_url:", result.secure_url);
                                        console.log("  - format:", result.format);
                                        console.log("  - width:", result.width, "height:", result.height);
                                        resolve(result);
                                    }
                                }
                            );
                            uploadStream.end(finalImageBuffer);
                        });

                        // Construct URL with background removal transformation
                        // Cloudinary uses e_background_removal for on-the-fly bg removal
                        const bgRemovedUrl = cloudinary.url(uploadResult.public_id, {
                            transformation: [
                                { effect: 'background_removal' }
                            ],
                            format: 'png',
                            secure: true
                        });

                        console.log("Background removal URL:", bgRemovedUrl);

                        // Download the processed image
                        const fetch = (await import('node-fetch')).default;

                        // Try to fetch with a retry for background removal processing
                        let imageResponse = null;
                        let attempts = 0;
                        const maxAttempts = 3;

                        while (attempts < maxAttempts) {
                            attempts++;
                            console.log(`Fetching bg-removed image (attempt ${attempts}/${maxAttempts})...`);

                            imageResponse = await fetch(bgRemovedUrl);
                            console.log("  Response status:", imageResponse.status, imageResponse.statusText);

                            if (imageResponse.ok) {
                                break;
                            } else if (imageResponse.status === 423 || imageResponse.status === 420) {
                                // 423 or 420 means the transformation is still processing
                                console.log("  Transformation still processing, waiting 2s...");
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            } else {
                                console.warn("  Failed with status:", imageResponse.status);
                                // Try getting the original image without bg removal
                                break;
                            }
                        }

                        if (imageResponse && imageResponse.ok) {
                            finalImageBuffer = Buffer.from(await imageResponse.arrayBuffer());
                            finalImageBase64 = finalImageBuffer.toString('base64');
                            console.log("✓ Background removed successfully!");
                            console.log("  New buffer size:", finalImageBuffer.length, "bytes");
                            sendEvent('imageGeneration', { status: 'bg_removed' });
                        } else {
                            console.warn("✗ Failed to fetch bg-removed image after", attempts, "attempts");
                            console.warn("  Using original image without background removal");
                            // Use the original uploaded image URL as fallback
                            const fallbackResponse = await fetch(uploadResult.secure_url);
                            if (fallbackResponse.ok) {
                                finalImageBuffer = Buffer.from(await fallbackResponse.arrayBuffer());
                                finalImageBase64 = finalImageBuffer.toString('base64');
                                console.log("  Using original image from Cloudinary");
                            }
                        }
                        console.log("=== END CLOUDINARY ===\n");

                    } catch (bgError) {
                        console.error("Background removal failed:", bgError.message);
                        console.error("Stack:", bgError.stack);
                        sendEvent('imageGeneration', { status: 'bg_removal_failed', error: bgError.message });
                        // Continue with original image
                    }
                }

                // Step 3: UPSCALE 10X for best quality before final resize
                console.log("Upscaling image 10X for best quality...");
                const upscaleMetadata = await sharp(finalImageBuffer).metadata();
                const upscaleWidth = Math.round((upscaleMetadata.width || 512) * 10);
                const upscaleHeight = Math.round((upscaleMetadata.height || 512) * 10);

                // Limit upscale to reasonable max to avoid memory issues
                const maxUpscale = 5000;
                const upscaledBuffer = await sharp(finalImageBuffer)
                    .resize(Math.min(upscaleWidth, maxUpscale), Math.min(upscaleHeight, maxUpscale), {
                        fit: 'inside',
                        kernel: 'lanczos3' // High quality upscaling
                    })
                    .png()
                    .toBuffer();

                const upscaledMeta = await sharp(upscaledBuffer).metadata();
                console.log(`Upscaled from ${upscaleMetadata.width}x${upscaleMetadata.height} to ${upscaledMeta.width}x${upscaledMeta.height}`);

                // Step 4: Final resize to target dimensions
                // For replacement mode, ensure minimum size is respected
                let targetWidth = width || 300;
                let targetHeight = height || 300;
                if (isReplacement && minWidth && minHeight) {
                    targetWidth = Math.max(width || minWidth, minWidth);
                    targetHeight = Math.max(height || minHeight, minHeight);
                }

                // Sharp requires positive integers for dimensions
                targetWidth = Math.round(targetWidth);
                targetHeight = Math.round(targetHeight);
                if (targetWidth <= 0) targetWidth = 300;
                if (targetHeight <= 0) targetHeight = 300;

                console.log(`Final resize to fit ${targetWidth}x${targetHeight}...`);
                const resizedBuffer = await sharp(upscaledBuffer)
                    .resize(targetWidth, targetHeight, {
                        fit: 'inside',
                        withoutEnlargement: true // Don't enlarge beyond target
                    })
                    .png()
                    .toBuffer();

                const resizedMetadata = await sharp(resizedBuffer).metadata();
                console.log(`Final size: ${resizedMetadata.width}x${resizedMetadata.height}`);

                // Step 4: Save to canvas-images directory
                await ensureImagesDir();
                const timestampStr = Date.now();
                const sanitizedPrompt = prompt.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
                const imageFileName = `generated-${sanitizedPrompt}-${timestampStr}.png`;
                const imagePath = path.join(IMAGES_DIR, imageFileName);
                await fs.writeFile(imagePath, resizedBuffer);
                console.log("Generated image saved to:", imagePath);

                // Step 5: Calculate position - use gridCell for placement
                const artboard = canvasData.pages?.[0]?.artboards?.[0];
                const canvasWidthPx = artboard?.width || 1500;
                const canvasHeightPx = artboard?.height || 2100;

                let imageX, imageY;
                let finalElementId;

                // Use grid position for both new and replacement modes
                const targetGrid = gridCell || 'J-10';
                const { x: targetX, y: targetY } = gridIdToPixels(targetGrid, canvasWidthPx, canvasHeightPx, "center");

                // Calculate translation to center the image at target position
                imageX = Math.round(targetX - resizedMetadata.width / 2);
                imageY = Math.round(targetY - resizedMetadata.height / 2);

                const timestampStrForId = Date.now();

                if (isReplacement && replacedElementId) {
                    // REPLACEMENT MODE: Mark old element for deletion and create new one
                    finalElementId = `replaced-${replacedElementId.substring(0, 8)}-${timestampStrForId}`;

                    console.log(`Replacing element ${replacedElementId} with new image at grid ${targetGrid} -> (${imageX}, ${imageY})`);

                    // Find and mark old element for deletion
                    const findAndMarkForDeletion = (elements) => {
                        for (const el of elements) {
                            if (el.id === replacedElementId) {
                                el._deleted = true;
                                el._replacedBy = finalElementId;
                                return true;
                            }
                            if (el.children && findAndMarkForDeletion(el.children)) {
                                return true;
                            }
                        }
                        return false;
                    };

                    if (canvasData.allElements) {
                        findAndMarkForDeletion(canvasData.allElements);
                    }

                    sendEvent('imageGeneration', {
                        status: 'replacing',
                        oldElementId: replacedElementId,
                        newElementId: finalElementId
                    });
                } else {
                    // NEW MODE
                    finalElementId = `generated-${timestampStrForId}`;
                    console.log(`Placing new image at grid ${targetGrid} -> translation (${imageX}, ${imageY})`);
                }

                // Step 6: Create new element in canvas data for the generated image
                const newElement = {
                    id: finalElementId,
                    type: "MediaContainer",
                    name: `AI Generated: ${prompt.substring(0, 30)}`,
                    translation: { x: imageX, y: imageY },
                    rotation: 0,
                    rotationInScreen: 0,
                    boundsLocal: {
                        x: 0,
                        y: 0,
                        width: resizedMetadata.width,
                        height: resizedMetadata.height
                    },
                    width: resizedMetadata.width,
                    height: resizedMetadata.height,
                    opacity: 1,
                    blendMode: 2,
                    locked: false,
                    parentId: artboard?.id,
                    hasChildren: false,
                    _newImage: true,
                    _imageBase64: `data:image/png;base64,${resizedBuffer.toString('base64')}`,
                    _imagePath: imagePath,
                    _prompt: prompt,
                    _isReplacement: isReplacement,
                    _replacedElementId: replacedElementId || null
                };

                // Add to allElements
                canvasData.allElements.push(newElement);

                // Also add to pages structure
                if (canvasData.pages?.[0]?.artboards?.[0]?.children) {
                    canvasData.pages[0].artboards[0].children.push(newElement);
                }

                generatedImages.push({
                    elementId: finalElementId,
                    prompt,
                    gridCell: isReplacement ? null : gridCell,
                    isReplacement,
                    replacedElementId: replaceExistingId || null,
                    imagePath: imageFileName,
                    imageBase64: `data:image/png;base64,${resizedBuffer.toString('base64')}`,
                    dimensions: { width: resizedMetadata.width, height: resizedMetadata.height },
                    position: { x: imageX, y: imageY }
                });

                sendEvent('imageGeneration', {
                    status: 'complete',
                    elementId: finalElementId,
                    gridCell: isReplacement ? null : gridCell,
                    isReplacement,
                    replacedElementId: replaceExistingId || null,
                    dimensions: { width: resizedMetadata.width, height: resizedMetadata.height }
                });

            } catch (genError) {
                console.error("Image generation failed:", genError);
                sendEvent('imageGeneration', { status: 'failed', error: genError.message });
            }
        }

        // If we have applied changes or generated images, save the updated canvas data
        if (appliedChanges.length > 0 || generatedImages.length > 0) {
            await fs.writeFile(CANVAS_DATA_FILE, JSON.stringify(canvasData, null, 2), 'utf8');
            console.log(`Applied ${appliedChanges.length} layout modifications, generated ${generatedImages.length} images, and saved to file`);
        }

        // Send final completion event
        sendEvent('complete', {
            success: true,
            message: `Layout analysis complete. Applied ${appliedChanges.length} modifications, generated ${generatedImages.length} images.`,
            analysis: analysisText,
            thoughtsSummary: thoughtsSummary,
            appliedChanges: appliedChanges,
            generatedImages: generatedImages,
            updatedCanvasData: canvasData
        });

        res.end();

    } catch (error) {
        console.error("Error enhancing layout:", error);

        // If headers haven't been sent yet, send JSON error
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: error.message,
                details: error.toString()
            });
        } else {
            // If streaming already started, send error as SSE event
            res.write(`event: error\n`);
            res.write(`data: ${JSON.stringify({ error: error.message, details: error.toString() })}\n\n`);
            res.end();
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
    console.log(`Canvas data file: ${CANVAS_DATA_FILE}`);
    console.log(`Images directory: ${IMAGES_DIR}`);
});
