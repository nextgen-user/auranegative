import addOnSandboxSdk from "add-on-sdk-document-sandbox";
import { editor, constants, fonts } from "express-document-sdk";

// Get the document sandbox runtime.
const { runtime } = addOnSandboxSdk.instance;

// =============================================================================
// LANGUAGE-TO-FONT MAPPING FOR NON-LATIN SCRIPT SUPPORT
// =============================================================================
// Maps target languages to PostScript font names that support those scripts.
// Uses Noto Sans family as primary (widely available), with fallbacks.
// Adobe Express will try each font in the array until one works.
// =============================================================================

const LANGUAGE_FONT_MAP = {
    // === DEVANAGARI SCRIPT (India) ===
    "hindi": ["NotoSansDevanagari-Regular", "NotoSans-Regular", "Arial Unicode MS"],
    "marathi": ["NotoSansDevanagari-Regular", "NotoSans-Regular", "Arial Unicode MS"],
    "nepali": ["NotoSansDevanagari-Regular", "NotoSans-Regular", "Arial Unicode MS"],
    "sanskrit": ["NotoSansDevanagari-Regular", "NotoSans-Regular", "Arial Unicode MS"],

    // === ARABIC SCRIPT (Middle East, North Africa) ===
    "arabic": ["NotoSansArabic-Regular", "NotoNaskhArabic-Regular", "Arial Unicode MS"],
    "urdu": ["NotoNastaliqUrdu-Regular", "NotoSansArabic-Regular", "Arial Unicode MS"],
    "persian": ["NotoSansArabic-Regular", "NotoNaskhArabic-Regular", "Arial Unicode MS"],
    "farsi": ["NotoSansArabic-Regular", "NotoNaskhArabic-Regular", "Arial Unicode MS"],
    "pashto": ["NotoSansArabic-Regular", "Arial Unicode MS"],

    // === HEBREW SCRIPT ===
    "hebrew": ["NotoSansHebrew-Regular", "NotoSerifHebrew-Regular", "Arial Unicode MS"],
    "yiddish": ["NotoSansHebrew-Regular", "Arial Unicode MS"],

    // === CJK SCRIPTS (East Asia) ===
    "chinese": ["NotoSansSC-Regular", "NotoSansTC-Regular", "NotoSansCJKsc-Regular", "Arial Unicode MS"],
    "chinese (simplified)": ["NotoSansSC-Regular", "NotoSansCJKsc-Regular", "Arial Unicode MS"],
    "chinese (traditional)": ["NotoSansTC-Regular", "NotoSansCJKtc-Regular", "Arial Unicode MS"],
    "japanese": ["NotoSansJP-Regular", "NotoSansCJKjp-Regular", "Arial Unicode MS"],
    "korean": ["NotoSansKR-Regular", "NotoSansCJKkr-Regular", "Arial Unicode MS"],

    // === SOUTH ASIAN SCRIPTS ===
    "tamil": ["NotoSansTamil-Regular", "NotoSerifTamil-Regular", "Arial Unicode MS"],
    "telugu": ["NotoSansTelugu-Regular", "NotoSerifTelugu-Regular", "Arial Unicode MS"],
    "kannada": ["NotoSansKannada-Regular", "NotoSerifKannada-Regular", "Arial Unicode MS"],
    "malayalam": ["NotoSansMalayalam-Regular", "NotoSerifMalayalam-Regular", "Arial Unicode MS"],
    "gujarati": ["NotoSansGujarati-Regular", "NotoSerifGujarati-Regular", "Arial Unicode MS"],
    "bengali": ["NotoSansBengali-Regular", "NotoSerifBengali-Regular", "Arial Unicode MS"],
    "bangla": ["NotoSansBengali-Regular", "NotoSerifBengali-Regular", "Arial Unicode MS"],
    "punjabi": ["NotoSansGurmukhi-Regular", "NotoSerifGurmukhi-Regular", "Arial Unicode MS"],
    "odia": ["NotoSansOriya-Regular", "Arial Unicode MS"],
    "oriya": ["NotoSansOriya-Regular", "Arial Unicode MS"],
    "sinhala": ["NotoSansSinhala-Regular", "Arial Unicode MS"],

    // === SOUTHEAST ASIAN SCRIPTS ===
    "thai": ["NotoSansThai-Regular", "NotoSerifThai-Regular", "Arial Unicode MS"],
    "vietnamese": ["NotoSans-Regular", "Arial Unicode MS"], // Latin with diacritics
    "burmese": ["NotoSansMyanmar-Regular", "Arial Unicode MS"],
    "myanmar": ["NotoSansMyanmar-Regular", "Arial Unicode MS"],
    "khmer": ["NotoSansKhmer-Regular", "Arial Unicode MS"],
    "cambodian": ["NotoSansKhmer-Regular", "Arial Unicode MS"],
    "lao": ["NotoSansLao-Regular", "Arial Unicode MS"],
    "laotian": ["NotoSansLao-Regular", "Arial Unicode MS"],

    // === CYRILLIC SCRIPT (Eastern Europe, Central Asia) ===
    "russian": ["NotoSans-Regular", "Arial Unicode MS"],
    "ukrainian": ["NotoSans-Regular", "Arial Unicode MS"],
    "bulgarian": ["NotoSans-Regular", "Arial Unicode MS"],
    "serbian": ["NotoSans-Regular", "Arial Unicode MS"],
    "kazakh": ["NotoSans-Regular", "Arial Unicode MS"],
    "mongolian": ["NotoSansMongolian-Regular", "NotoSans-Regular", "Arial Unicode MS"],

    // === GREEK SCRIPT ===
    "greek": ["NotoSans-Regular", "Arial Unicode MS"],

    // === ETHIOPIC SCRIPT ===
    "amharic": ["NotoSansEthiopic-Regular", "Arial Unicode MS"],
    "ethiopian": ["NotoSansEthiopic-Regular", "Arial Unicode MS"],
    "tigrinya": ["NotoSansEthiopic-Regular", "Arial Unicode MS"],

    // === GEORGIAN SCRIPT ===
    "georgian": ["NotoSansGeorgian-Regular", "Arial Unicode MS"],

    // === ARMENIAN SCRIPT ===
    "armenian": ["NotoSansArmenian-Regular", "Arial Unicode MS"],

    // === LATIN SCRIPTS (will use default or specified font) ===
    "english": null, // Use existing font
    "spanish": null,
    "french": null,
    "german": null,
    "italian": null,
    "portuguese": null,
    "dutch": null,
    "polish": null,
    "romanian": null,
    "czech": null,
    "swedish": null,
    "norwegian": null,
    "danish": null,
    "finnish": null,
    "indonesian": null,
    "malay": null,
    "tagalog": null,
    "filipino": null,
    "swahili": null,
    "turkish": null,
    "hungarian": null,

    // === DEFAULT FALLBACK ===
    "default": ["NotoSans-Regular", "Arial Unicode MS"]
};

/**
 * Get the appropriate font PostScript names for a target language
 * @param {string} language - Target language name
 * @returns {string[] | null} Array of font PostScript names to try, or null for Latin scripts
 */
function getFontNamesForLanguage(language) {
    if (!language) return null;

    const normalizedLang = language.toLowerCase().trim();

    // Check exact match first
    if (normalizedLang in LANGUAGE_FONT_MAP) {
        return LANGUAGE_FONT_MAP[normalizedLang];
    }

    // Check for partial matches (e.g., "Hindi (India)" should match "hindi")
    for (const [langKey, fontNames] of Object.entries(LANGUAGE_FONT_MAP)) {
        if (normalizedLang.includes(langKey) || langKey.includes(normalizedLang)) {
            return fontNames;
        }
    }

    // Return default fonts for unknown languages
    return LANGUAGE_FONT_MAP["default"];
}

/**
 * Attempt to load a font by trying multiple PostScript names
 * @param {string[]} fontNames - Array of font PostScript names to try
 * @returns {Promise<FontRef|null>} Font reference or null if none available
 */
async function loadFontFromList(fontNames) {
    if (!fontNames || fontNames.length === 0) {
        return null;
    }

    for (const fontName of fontNames) {
        try {
            const fontRef = await fonts.fromPostscriptName(fontName);
            if (fontRef) {
                console.log(`[Sandbox] ✓ Successfully loaded font: ${fontName}`);
                return fontRef;
            }
        } catch (e) {
            console.log(`[Sandbox] Font not available: ${fontName}, trying next...`);
        }
    }

    console.warn(`[Sandbox] ⚠ Could not load any fonts from list:`, fontNames);
    return null;
}

function start() {
    // APIs to be exposed to the UI runtime
    // i.e., to the `index.html` file of this add-on.
    const sandboxApi = {
        // Get entire document structure with ALL details for every node
        getDocumentStructure: () => {
            const structure = {
                documentRoot: null,
                pages: [],
                totalNodes: 0,
                nodeTypes: {},
                allElements: [] // Flat list of all elements with full details
            };

            // Helper to safely get a property value
            const safeGet = (obj, prop) => {
                try {
                    const val = obj[prop];
                    if (val === undefined || val === null) return null;
                    if (typeof val === 'function') return '[Function]';
                    if (typeof val === 'object') {
                        // Handle special object types
                        if (val.red !== undefined) {
                            return { red: val.red, green: val.green, blue: val.blue, alpha: val.alpha };
                        }
                        if (val.x !== undefined && val.y !== undefined) {
                            return { x: val.x, y: val.y, width: val.width, height: val.height };
                        }
                        return JSON.parse(JSON.stringify(val));
                    }
                    return val;
                } catch (e) {
                    return null;
                }
            };

            // Extract ALL possible properties from a node
            const extractAllProperties = (node) => {
                const props = {};

                // === BASIC IDENTITY ===
                props.id = safeGet(node, 'id');
                props.type = safeGet(node, 'type') || 'Unknown';
                props.name = safeGet(node, 'name');

                // === TRANSFORM & POSITION ===
                try {
                    if (node.translation) props.translation = { x: node.translation.x, y: node.translation.y };
                } catch (e) { }
                try {
                    if (node.rotation !== undefined) props.rotation = node.rotation;
                } catch (e) { }
                try {
                    if (node.rotationInScreen !== undefined) props.rotationInScreen = node.rotationInScreen;
                } catch (e) { }
                try {
                    if (node.transformMatrix) props.transformMatrix = safeGet(node, 'transformMatrix');
                } catch (e) { }

                // === BOUNDS & DIMENSIONS ===
                try {
                    if (node.boundsLocal) {
                        props.boundsLocal = {
                            x: node.boundsLocal.x,
                            y: node.boundsLocal.y,
                            width: node.boundsLocal.width,
                            height: node.boundsLocal.height
                        };
                    }
                } catch (e) { }
                try {
                    if (node.centerPointLocal) props.centerPointLocal = { x: node.centerPointLocal.x, y: node.centerPointLocal.y };
                } catch (e) { }
                try {
                    if (node.topLeftLocal) props.topLeftLocal = { x: node.topLeftLocal.x, y: node.topLeftLocal.y };
                } catch (e) { }
                try {
                    if (node.width !== undefined) props.width = node.width;
                } catch (e) { }
                try {
                    if (node.height !== undefined) props.height = node.height;
                } catch (e) { }

                // === VISUAL PROPERTIES ===
                try {
                    if (node.opacity !== undefined) props.opacity = node.opacity;
                } catch (e) { }
                try {
                    if (node.blendMode !== undefined) props.blendMode = node.blendMode;
                } catch (e) { }
                try {
                    if (node.locked !== undefined) props.locked = node.locked;
                } catch (e) { }
                try {
                    if (node.visible !== undefined) props.visible = node.visible;
                } catch (e) { }

                // === FILL PROPERTIES ===
                try {
                    if (node.fill) {
                        props.fill = {};
                        if (node.fill.type) props.fill.type = node.fill.type;
                        if (node.fill.color) {
                            props.fill.color = {
                                red: node.fill.color.red,
                                green: node.fill.color.green,
                                blue: node.fill.color.blue,
                                alpha: node.fill.color.alpha
                            };
                        }
                    }
                } catch (e) { }
                try {
                    if (node.fills) props.fills = safeGet(node, 'fills');
                } catch (e) { }

                // === STROKE PROPERTIES ===
                try {
                    if (node.stroke) {
                        props.stroke = {};
                        if (node.stroke.color) {
                            props.stroke.color = {
                                red: node.stroke.color.red,
                                green: node.stroke.color.green,
                                blue: node.stroke.color.blue,
                                alpha: node.stroke.color.alpha
                            };
                        }
                        if (node.stroke.width !== undefined) props.stroke.width = node.stroke.width;
                        if (node.stroke.position !== undefined) props.stroke.position = node.stroke.position;
                        if (node.stroke.dashPattern) props.stroke.dashPattern = node.stroke.dashPattern;
                        if (node.stroke.dashOffset !== undefined) props.stroke.dashOffset = node.stroke.dashOffset;
                    }
                } catch (e) { }
                try {
                    if (node.strokes) props.strokes = safeGet(node, 'strokes');
                } catch (e) { }

                // === SHAPE-SPECIFIC PROPERTIES ===
                try {
                    if (node.rx !== undefined) props.cornerRadiusX = node.rx;
                } catch (e) { }
                try {
                    if (node.ry !== undefined) props.cornerRadiusY = node.ry;
                } catch (e) { }
                try {
                    if (node.cornerRadius !== undefined) props.cornerRadius = node.cornerRadius;
                } catch (e) { }
                try {
                    if (node.startX !== undefined) props.startX = node.startX;
                } catch (e) { }
                try {
                    if (node.startY !== undefined) props.startY = node.startY;
                } catch (e) { }
                try {
                    if (node.endX !== undefined) props.endX = node.endX;
                } catch (e) { }
                try {
                    if (node.endY !== undefined) props.endY = node.endY;
                } catch (e) { }

                // === TEXT-SPECIFIC PROPERTIES ===
                try {
                    if (node.fullContent) {
                        props.textContent = {
                            text: node.fullContent.text || '',
                            length: node.fullContent.length
                        };
                    }
                } catch (e) { }
                // Fallback: Try to get text directly from node.text property
                try {
                    if (!props.textContent && node.text) {
                        props.textContent = {
                            text: node.text || '',
                            length: node.text?.length || 0
                        };
                    }
                } catch (e) { }
                // Additional fallback: Check for textContent or content properties
                try {
                    if (!props.textContent) {
                        if (node.textContent) {
                            props.textContent = {
                                text: typeof node.textContent === 'string' ? node.textContent : (node.textContent.text || ''),
                                length: typeof node.textContent === 'string' ? node.textContent.length : (node.textContent.length || 0)
                            };
                        } else if (node.content && typeof node.content === 'string') {
                            props.textContent = {
                                text: node.content,
                                length: node.content.length
                            };
                        }
                    }
                } catch (e) { }
                try {
                    if (node.textAlignment !== undefined) props.textAlignment = node.textAlignment;
                } catch (e) { }
                try {
                    if (node.textLayout) props.textLayout = safeGet(node, 'textLayout');
                } catch (e) { }
                try {
                    if (node.characterStyles) props.characterStyles = safeGet(node, 'characterStyles');
                } catch (e) { }
                try {
                    if (node.paragraphStyles) props.paragraphStyles = safeGet(node, 'paragraphStyles');
                } catch (e) { }

                // === MEDIA-SPECIFIC PROPERTIES ===
                try {
                    if (node.mediaType !== undefined) props.mediaType = node.mediaType;
                } catch (e) { }

                // === EFFECTS ===
                try {
                    if (node.effects) props.effects = safeGet(node, 'effects');
                } catch (e) { }
                try {
                    if (node.shadow) props.shadow = safeGet(node, 'shadow');
                } catch (e) { }

                // === HIERARCHY INFO ===
                try {
                    if (node.parent) props.parentId = node.parent.id;
                } catch (e) { }
                try {
                    props.hasChildren = !!(node.children && node.children.length > 0);
                    if (node.children) {
                        let count = 0;
                        for (const c of node.children) count++;
                        props.childCount = count;
                    }
                } catch (e) { }

                return props;
            };

            try {
                const documentRoot = editor.documentRoot;
                structure.documentRoot = {
                    id: documentRoot.id,
                    type: documentRoot.type || 'DocumentRoot'
                };

                let elementIndex = 0;

                // Recursive function to traverse nodes with FULL details
                const traverseNode = (node, depth = 0, path = '') => {
                    const allProps = extractAllProperties(node);
                    allProps.depth = depth;
                    allProps.path = path;
                    allProps.index = elementIndex++;

                    // Add to flat list
                    structure.allElements.push(allProps);

                    // Count node types
                    structure.totalNodes++;
                    const nodeType = allProps.type;
                    structure.nodeTypes[nodeType] = (structure.nodeTypes[nodeType] || 0) + 1;

                    // Build tree structure
                    const nodeInfo = {
                        ...allProps,
                        children: []
                    };

                    // Traverse children
                    if (node.children) {
                        try {
                            let childIdx = 0;
                            for (const child of node.children) {
                                const childPath = path ? `${path} > ${child.type || 'Unknown'}[${childIdx}]` : `${child.type || 'Unknown'}[${childIdx}]`;
                                nodeInfo.children.push(traverseNode(child, depth + 1, childPath));
                                childIdx++;
                            }
                        } catch (e) { /* children iteration failed */ }
                    }

                    return nodeInfo;
                };

                // Traverse all pages
                if (documentRoot.pages) {
                    let pageIdx = 0;
                    for (const page of documentRoot.pages) {
                        const pageProps = extractAllProperties(page);
                        pageProps.pageIndex = pageIdx;

                        structure.allElements.push({
                            ...pageProps,
                            depth: 0,
                            index: elementIndex++,
                            path: `Page[${pageIdx}]`
                        });

                        const pageInfo = {
                            ...pageProps,
                            artboards: []
                        };
                        structure.totalNodes++;
                        structure.nodeTypes['Page'] = (structure.nodeTypes['Page'] || 0) + 1;

                        // Traverse artboards
                        if (page.artboards) {
                            let artboardIdx = 0;
                            for (const artboard of page.artboards) {
                                const artboardPath = `Page[${pageIdx}] > Artboard[${artboardIdx}]`;
                                const artboardInfo = traverseNode(artboard, 1, artboardPath);
                                pageInfo.artboards.push(artboardInfo);
                                artboardIdx++;
                            }
                        }

                        structure.pages.push(pageInfo);
                        pageIdx++;
                    }
                }

                console.log("[Sandbox] FULL Document structure extracted:", structure);
                console.log("[Sandbox] Total elements:", structure.allElements.length);
                return structure;

            } catch (error) {
                console.error("[Sandbox] Error getting document structure:", error);
                return { error: error.message, structure };
            }
        },

        createRectangle: () => {
            const rectangle = editor.createRectangle();
            rectangle.width = 240;
            rectangle.height = 180;
            rectangle.translation = { x: 10, y: 10 };
            const color = { red: 0.32, green: 0.34, blue: 0.89, alpha: 1 };
            const rectangleFill = editor.makeColorFill(color);
            rectangle.fill = rectangleFill;
            const insertionParent = editor.context.insertionParent;
            insertionParent.children.append(rectangle);
        },

        // Attempt to get a rendition of the current selection or page
        getSelectedImage: async () => {
            const blobToBase64 = (blob) => {
                const reader = new FileReader();
                return new Promise((resolve, reject) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            };

            try {
                console.log("[Sandbox] BRUTEFORCE: Attempting to capture canvas/selection...");

                // Strategy 1: Try the selected node directly
                if (editor.context.selection.length > 0) {
                    const selectedNode = editor.context.selection[0];
                    if (selectedNode.createRenditions) {
                        try {
                            console.log("[Sandbox] Trying to render selection...");
                            const renditions = await selectedNode.createRenditions({ format: "png" });
                            return await blobToBase64(renditions[0].blob);
                        } catch (e) {
                            console.warn("[Sandbox] Selection render failed, trying page fallback.", e);
                        }
                    }
                }

                // Strategy 2: Try the Current Page (Full Canvas Snapshot)
                if (editor.context.currentPage && editor.context.currentPage.createRenditions) {
                    try {
                        console.log("[Sandbox] Trying to render full page...");
                        const renditions = await editor.context.currentPage.createRenditions({ format: "png" });
                        return await blobToBase64(renditions[0].blob);
                    } catch (e) {
                        console.warn("[Sandbox] Page render failed.", e);
                    }
                }

                // Strategy 3: Try iterating children of the page to find an Image/Bitmap
                console.log("[Sandbox] Searching for any renderable image on page...");
                const page = editor.context.currentPage;
                let foundImage = null;

                const traverse = (node) => {
                    if (foundImage) return;
                    if (node.type === "Image" || node.type === "Bitmap" || node.createRenditions) {
                        foundImage = node;
                        return;
                    }
                    if (node.children) {
                        node.children.forEach(traverse);
                    }
                };

                if (page.children) page.children.forEach(traverse);

                if (foundImage && foundImage.createRenditions) {
                    console.log("[Sandbox] Found an image node, rendering...", foundImage.type);
                    const renditions = await foundImage.createRenditions({ format: "png" });
                    return await blobToBase64(renditions[0].blob);
                }

                console.error("[Sandbox] All extraction strategies failed.");
                return null;

            } catch (error) {
                console.error("[Sandbox] Fatal error getting rendition:", error);
                throw error;
            }
        },

        // Add a base64 image to the canvas
        addImageToCanvas: async (base64Image) => {
            try {
                // Helper function to decode base64 string to Uint8Array
                // (inline since sandboxApi helpers may not be accessible here)
                const base64ToUint8Array = (base64String) => {
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                    let base64 = base64String.replace(/=+$/, '');
                    const outputLength = Math.floor(base64.length * 3 / 4);
                    const bytes = new Uint8Array(outputLength);
                    let byteIndex = 0;

                    for (let i = 0; i < base64.length; i += 4) {
                        const a = chars.indexOf(base64[i]);
                        const b = chars.indexOf(base64[i + 1]);
                        const c = i + 2 < base64.length ? chars.indexOf(base64[i + 2]) : 0;
                        const d = i + 3 < base64.length ? chars.indexOf(base64[i + 3]) : 0;

                        if (byteIndex < outputLength) bytes[byteIndex++] = (a << 2) | (b >> 4);
                        if (byteIndex < outputLength) bytes[byteIndex++] = ((b & 15) << 4) | (c >> 2);
                        if (byteIndex < outputLength) bytes[byteIndex++] = ((c & 3) << 6) | d;
                    }
                    return bytes;
                };

                // Parse the data URL and convert to blob without using fetch or atob
                const matches = base64Image.match(/^data:([^;]+);base64,(.+)$/);
                if (!matches) {
                    throw new Error('Invalid data URL format');
                }

                const mimeType = matches[1];
                const base64Data = matches[2];
                const bytes = base64ToUint8Array(base64Data);
                const blob = new Blob([bytes], { type: mimeType });

                // Create an image container (or bitmap)
                const imageContainer = editor.createImageContainer(blob);

                // Set initial position (optional, defaults to center or top-left)
                imageContainer.translation = { x: 50, y: 50 };

                // Add to document
                const insertionParent = editor.context.insertionParent;
                insertionParent.children.append(imageContainer);

                return true;
            } catch (error) {
                console.error("Error adding image to canvas:", error);
                throw error;
            }
        },

        // Get canvas data for backend (returns structure for UI to send via HTTP)
        getDataForBackend: () => {
            try {
                console.log("[Sandbox] Getting document structure for backend...");

                // Get the document structure using existing function
                const structure = sandboxApi.getDocumentStructure();

                if (structure.error) {
                    throw new Error(structure.error);
                }

                console.log("[Sandbox] Structure ready with", structure.allElements?.length, "elements");
                return { success: true, data: structure };

            } catch (error) {
                console.error("[Sandbox] Error getting data for backend:", error);
                return { success: false, error: error.message };
            }
        },

        // Helper function to find a node by ID in the document tree
        findNodeById: (targetId) => {
            let foundNode = null;

            const searchNode = (node) => {
                if (foundNode) return;

                try {
                    if (node.id === targetId) {
                        foundNode = node;
                        return;
                    }
                } catch (e) { }

                // Search children
                if (node.children) {
                    try {
                        for (const child of node.children) {
                            searchNode(child);
                            if (foundNode) return;
                        }
                    } catch (e) { }
                }
            };

            try {
                const documentRoot = editor.documentRoot;

                // Search through all pages and artboards
                if (documentRoot.pages) {
                    for (const page of documentRoot.pages) {
                        if (page.id === targetId) {
                            foundNode = page;
                            break;
                        }

                        if (page.artboards) {
                            for (const artboard of page.artboards) {
                                searchNode(artboard);
                                if (foundNode) break;
                            }
                        }
                        if (foundNode) break;
                    }
                }
            } catch (e) {
                console.error("[Sandbox] Error searching for node:", e);
            }

            return foundNode;
        },

        // Load canvas data to canvas (UI passes data fetched from backend)
        // This function UPDATES existing elements rather than creating new ones
        loadDataToCanvas: async (data) => {
            try {
                console.log("[Sandbox] Loading data to canvas (UPDATE MODE)...");

                if (!data) {
                    console.log("[Sandbox] No data provided");
                    return { success: true, message: "No data to load", elementsUpdated: 0 };
                }

                console.log("[Sandbox] Data received, elements:", data.allElements?.length);

                // Update existing elements on canvas - MUST await since updateExistingElements is async
                const result = await sandboxApi.updateExistingElements(data);

                return {
                    success: true,
                    elementsUpdated: result.updated,
                    elementsNotFound: result.notFound,
                    message: `Updated ${result.updated} elements on canvas (${result.notFound} not found)`
                };

            } catch (error) {
                console.error("[Sandbox] Error loading data to canvas:", error);
                return { success: false, error: error.message };
            }
        },

        // Update existing elements from saved data structure
        // This function updates ALL writable properties for each node
        // CRITICAL: All updates must happen within editor.queueAsyncEdit()
        // NOTE: queueAsyncEdit returns Promise<void>, so we must capture results in outer scope
        updateExistingElements: async (data) => {
            if (!data || !data.allElements) {
                console.warn("[Sandbox] No elements to update");
                return { updated: 0, notFound: 0 };
            }

            console.log("[Sandbox] Updating", data.allElements.length, "elements...");

            // === PRE-LOAD FONT FOR TARGET LANGUAGE ===
            // Font loading is async and must happen BEFORE entering queueAsyncEdit
            let targetFont = null;
            const targetLanguage = data.targetLanguage;

            if (targetLanguage) {
                console.log(`[Sandbox] Target language for translation: ${targetLanguage}`);
                const fontNames = getFontNamesForLanguage(targetLanguage);

                if (fontNames) {
                    console.log(`[Sandbox] Loading fonts for ${targetLanguage}:`, fontNames);
                    targetFont = await loadFontFromList(fontNames);

                    if (targetFont) {
                        console.log(`[Sandbox] ✓ Font loaded for ${targetLanguage}, will apply to text elements`);
                    } else {
                        console.warn(`[Sandbox] ⚠ No compatible font found for ${targetLanguage}, text may not render correctly`);
                    }
                } else {
                    console.log(`[Sandbox] Language ${targetLanguage} uses Latin script, keeping existing fonts`);
                }
            }

            // Capture results in outer scope since queueAsyncEdit returns Promise<void>
            let updated = 0;
            let notFound = 0;
            let propertyUpdateCount = 0;

            // PRE-LOAD STEP: Load bitmaps for new images BEFORE entering queueAsyncEdit
            // Adobe Express requires async operations (loadBitmapImage) to be done OUTSIDE the edit context
            const newImageBitmaps = [];
            for (const element of data.allElements) {
                if (element._newImage === true && element._imageBase64) {
                    try {
                        console.log(`[Sandbox] 🖼️ Pre-loading bitmap for new image: ${element.id}`);
                        console.log(`  Prompt: "${element._prompt?.substring(0, 50)}..."`);

                        // Convert base64 to blob
                        const imageBlob = sandboxApi.base64DataUrlToBlob(element._imageBase64);
                        console.log(`[Sandbox] Image blob created, size: ${imageBlob.size}`);

                        // Load bitmap OUTSIDE queueAsyncEdit
                        const bitmapImage = await editor.loadBitmapImage(imageBlob);
                        console.log(`[Sandbox] ✓ Bitmap loaded for: ${element.id}`);

                        newImageBitmaps.push({
                            element: element,
                            bitmap: bitmapImage
                        });
                    } catch (loadError) {
                        console.error(`[Sandbox] ✗ Failed to pre-load bitmap for ${element.id}:`, loadError.message);
                    }
                }
            }
            console.log(`[Sandbox] Pre-loaded ${newImageBitmaps.length} new image bitmaps`);

            // Wrap ALL updates in an edit context for Adobe Express
            await editor.queueAsyncEdit(async () => {

                for (const element of data.allElements) {
                    try {
                        // Skip container types
                        if (element.type === "Page" || element.type === "ab:Artboard" ||
                            element.type === "Artboard" || element.type === "DocumentRoot" ||
                            element.type === "Unknown" || element.type === "ArtworkRoot") {
                            continue;
                        }

                        // === HANDLE NEW AI-GENERATED IMAGES ===
                        // If element is marked as a new image, use the PRE-LOADED bitmap
                        if (element._newImage === true && element._imageBase64) {
                            // Find the pre-loaded bitmap for this element
                            const preloaded = newImageBitmaps.find(item => item.element.id === element.id);

                            if (!preloaded) {
                                console.error(`[Sandbox] ✗ No pre-loaded bitmap found for ${element.id}`);
                                notFound++;
                                continue;
                            }

                            try {
                                console.log(`[Sandbox] 🖼️ Adding new AI-generated image to canvas: ${element.id}`);
                                console.log(`  Position: (${element.translation?.x}, ${element.translation?.y})`);
                                console.log(`  Size: ${element.width}x${element.height}`);

                                // Create image container using PRE-LOADED bitmap (NO async operation here)
                                const imageContainer = editor.createImageContainer(preloaded.bitmap);

                                // Set position
                                if (element.translation) {
                                    imageContainer.translation = {
                                        x: element.translation.x || 0,
                                        y: element.translation.y || 0
                                    };
                                }

                                // Add to canvas
                                const insertionParent = editor.context.insertionParent;
                                insertionParent.children.append(imageContainer);

                                console.log(`  ✓ Successfully added new image ${element.id}`);
                                propertyUpdateCount++;
                                updated++;
                                continue; // Skip other processing for new images
                            } catch (imageError) {
                                console.error(`  ✗ Could not add new image:`, imageError.message);
                                notFound++;
                                continue;
                            }
                        }

                        // Find the existing node by ID
                        const existingNode = sandboxApi.findNodeById(element.id);

                        if (!existingNode) {
                            console.warn("[Sandbox] Node not found for ID:", element.id, "Type:", element.type);
                            notFound++;
                            continue;
                        }

                        // === HANDLE DELETION ===
                        // If element is marked for deletion, remove it from the canvas
                        if (element._deleted === true) {
                            try {
                                console.log(`[Sandbox] 🗑️ Deleting node: ${element.id} (Type: ${element.type})`);
                                if (element._deleteReason) {
                                    console.log(`  Reason: ${element._deleteReason}`);
                                }
                                existingNode.removeFromParent();
                                console.log(`  ✓ Successfully deleted node ${element.id}`);
                                propertyUpdateCount++;
                                updated++;
                                continue; // Skip other updates for deleted elements
                            } catch (deleteError) {
                                console.warn(`  ✗ Could not delete node:`, deleteError.message);
                                // Continue with updates if deletion fails
                            }
                        }

                        console.log("[Sandbox] Updating node:", element.id, "Type:", element.type);
                        let nodeUpdated = false;

                        // === UPDATE COMMON VISUAL PROPERTIES (for all node types) ===

                        // Update translation (coordinates/position)
                        if (element.translation && existingNode.translation) {
                            try {
                                const currentTrans = existingNode.translation;
                                if (element.translation.x !== currentTrans.x || element.translation.y !== currentTrans.y) {
                                    existingNode.translation = {
                                        x: element.translation.x,
                                        y: element.translation.y
                                    };
                                    console.log(`  ✓ Updated translation to (${element.translation.x}, ${element.translation.y})`);
                                    propertyUpdateCount++;
                                    nodeUpdated = true;
                                }
                            } catch (e) {
                                console.warn(`  ✗ Could not update translation:`, e.message);
                            }
                        }

                        // Update rotation
                        if (element.rotation !== undefined && existingNode.rotation !== undefined) {
                            try {
                                if (element.rotation !== existingNode.rotation) {
                                    // Use setRotationInParent for proper rotation around center
                                    if (existingNode.setRotationInParent) {
                                        existingNode.setRotationInParent(element.rotation, existingNode.centerPointLocal);
                                    } else {
                                        existingNode.rotation = element.rotation;
                                    }
                                    console.log(`  ✓ Updated rotation to ${element.rotation}°`);
                                    propertyUpdateCount++;
                                    nodeUpdated = true;
                                }
                            } catch (e) {
                                console.warn(`  ✗ Could not update rotation:`, e.message);
                            }
                        }

                        // Update opacity
                        if (element.opacity !== undefined && existingNode.opacity !== undefined) {
                            try {
                                if (element.opacity !== existingNode.opacity) {
                                    existingNode.opacity = element.opacity;
                                    console.log(`  ✓ Updated opacity to ${element.opacity}`);
                                    propertyUpdateCount++;
                                    nodeUpdated = true;
                                }
                            } catch (e) {
                                console.warn(`  ✗ Could not update opacity:`, e.message);
                            }
                        }

                        // Update blendMode
                        if (element.blendMode !== undefined && existingNode.blendMode !== undefined) {
                            try {
                                if (element.blendMode !== existingNode.blendMode) {
                                    existingNode.blendMode = element.blendMode;
                                    console.log(`  ✓ Updated blendMode to ${element.blendMode}`);
                                    propertyUpdateCount++;
                                    nodeUpdated = true;
                                }
                            } catch (e) {
                                console.warn(`  ✗ Could not update blendMode:`, e.message);
                            }
                        }

                        // Update locked state
                        if (element.locked !== undefined && existingNode.locked !== undefined) {
                            try {
                                if (element.locked !== existingNode.locked) {
                                    existingNode.locked = element.locked;
                                    console.log(`  ✓ Updated locked to ${element.locked}`);
                                    propertyUpdateCount++;
                                    nodeUpdated = true;
                                }
                            } catch (e) {
                                console.warn(`  ✗ Could not update locked:`, e.message);
                            }
                        }

                        // === UPDATE TYPE-SPECIFIC PROPERTIES ===

                        // TEXT NODES - update text content
                        if (element.type === "Text" || element.type === "TextNode" ||
                            element.type === "StandaloneTextNode" || element.type === "ThreadedTextNode") {

                            if (element.textContent && element.textContent.text !== undefined && existingNode.fullContent) {
                                try {
                                    // Ensure newText is a string
                                    let newText = element.textContent.text;

                                    // Convert to string if needed (handle null, undefined, numbers, etc.)
                                    if (typeof newText !== 'string') {
                                        console.warn(`  ⚠ Text value is not a string (${typeof newText}), converting...`);
                                        newText = String(newText);
                                    }

                                    const currentText = existingNode.fullContent?.text || '';

                                    if (newText !== currentText) {
                                        const textLength = existingNode.fullContent.length || currentText.length;

                                        if (textLength > 0) {
                                            // Correct API: replaceText(newText, range)
                                            existingNode.fullContent.replaceText(
                                                newText,
                                                { start: 0, length: textLength }
                                            );
                                        } else {
                                            existingNode.fullContent.appendText(newText);
                                        }

                                        console.log(`  ✓ Updated text content to: "${newText}"`);
                                        propertyUpdateCount++;
                                        nodeUpdated = true;

                                        // === APPLY TARGET LANGUAGE FONT ===
                                        // If we have a pre-loaded font for non-Latin scripts, apply it now
                                        if (targetFont) {
                                            try {
                                                const newTextLength = existingNode.fullContent.length || newText.length;
                                                existingNode.fullContent.applyCharacterStyles(
                                                    { font: targetFont },
                                                    { start: 0, length: newTextLength }
                                                );
                                                console.log(`  ✓ Applied font for ${targetLanguage} to text element`);
                                                propertyUpdateCount++;
                                            } catch (fontError) {
                                                console.warn(`  ⚠ Could not apply font for ${targetLanguage}:`, fontError.message);
                                            }
                                        }
                                    }
                                } catch (textError) {
                                    console.warn(`  ✗ Could not update text:`, textError.message);
                                }
                            }

                            // TEXT STYLES - apply color, fontSize, letterSpacing, underline, baselineShift
                            if (element.textStyles && existingNode.fullContent) {
                                try {
                                    const styles = {};
                                    let hasStyles = false;

                                    // Apply text color
                                    if (element.textStyles.color) {
                                        styles.color = {
                                            red: element.textStyles.color.red || 0,
                                            green: element.textStyles.color.green || 0,
                                            blue: element.textStyles.color.blue || 0,
                                            alpha: element.textStyles.color.alpha !== undefined ? element.textStyles.color.alpha : 1
                                        };
                                        hasStyles = true;
                                        console.log(`  ✓ Applying text color: rgb(${Math.round(styles.color.red * 255)}, ${Math.round(styles.color.green * 255)}, ${Math.round(styles.color.blue * 255)})`);
                                    }

                                    // Apply font size
                                    if (element.textStyles.fontSize !== undefined) {
                                        styles.fontSize = element.textStyles.fontSize;
                                        hasStyles = true;
                                        console.log(`  ✓ Applying fontSize: ${styles.fontSize}pt`);
                                    }

                                    // Apply letter spacing
                                    if (element.textStyles.letterSpacing !== undefined) {
                                        styles.letterSpacing = element.textStyles.letterSpacing;
                                        hasStyles = true;
                                        console.log(`  ✓ Applying letterSpacing: ${styles.letterSpacing}`);
                                    }

                                    // Apply underline
                                    if (element.textStyles.underline !== undefined) {
                                        styles.underline = element.textStyles.underline;
                                        hasStyles = true;
                                        console.log(`  ✓ Applying underline: ${styles.underline}`);
                                    }

                                    // Apply baseline shift (superscript/subscript)
                                    if (element.textStyles.baselineShift !== undefined) {
                                        // Map string to constants if available
                                        if (typeof constants !== 'undefined' && constants.TextScriptStyle) {
                                            switch (element.textStyles.baselineShift) {
                                                case 'superscript':
                                                    styles.baselineShift = constants.TextScriptStyle.superscript;
                                                    break;
                                                case 'subscript':
                                                    styles.baselineShift = constants.TextScriptStyle.subscript;
                                                    break;
                                                case 'normal':
                                                default:
                                                    styles.baselineShift = constants.TextScriptStyle.normal;
                                                    break;
                                            }
                                        } else {
                                            // Fallback: use raw value
                                            styles.baselineShift = element.textStyles.baselineShift;
                                        }
                                        hasStyles = true;
                                        console.log(`  ✓ Applying baselineShift: ${element.textStyles.baselineShift}`);
                                    }

                                    // Apply all styles to entire text content
                                    if (hasStyles) {
                                        const textLength = existingNode.fullContent.length ||
                                            (existingNode.fullContent.text?.length) || 0;
                                        if (textLength > 0) {
                                            existingNode.fullContent.applyCharacterStyles(
                                                styles,
                                                { start: 0, length: textLength }
                                            );
                                            console.log(`  ✓ Applied character styles to entire text (${textLength} chars)`);
                                            propertyUpdateCount++;
                                            nodeUpdated = true;
                                        }
                                    }
                                } catch (styleError) {
                                    console.warn(`  ✗ Could not apply text styles:`, styleError.message);
                                }
                            }
                        }

                        // RECTANGLE/ELLIPSE/SHAPE NODES - update dimensions, fill, stroke
                        if (element.type === "RectangleNode" || element.type === "Rectangle" ||
                            element.type === "EllipseNode" || element.type === "Ellipse") {

                            // Update width
                            if (element.width !== undefined && existingNode.width !== undefined) {
                                try {
                                    if (element.width !== existingNode.width) {
                                        existingNode.width = element.width;
                                        console.log(`  ✓ Updated width to ${element.width}`);
                                        propertyUpdateCount++;
                                        nodeUpdated = true;
                                    }
                                } catch (e) {
                                    console.warn(`  ✗ Could not update width:`, e.message);
                                }
                            }

                            // Update height
                            if (element.height !== undefined && existingNode.height !== undefined) {
                                try {
                                    if (element.height !== existingNode.height) {
                                        existingNode.height = element.height;
                                        console.log(`  ✓ Updated height to ${element.height}`);
                                        propertyUpdateCount++;
                                        nodeUpdated = true;
                                    }
                                } catch (e) {
                                    console.warn(`  ✗ Could not update height:`, e.message);
                                }
                            }
                        }

                        // LINE NODES - update start and end points
                        if (element.type === "Line" || element.type === "LineNode") {
                            // Update startX
                            if (element.startX !== undefined && existingNode.startX !== undefined) {
                                try {
                                    if (element.startX !== existingNode.startX) {
                                        existingNode.startX = element.startX;
                                        console.log(`  ✓ Updated startX to ${element.startX}`);
                                        propertyUpdateCount++;
                                        nodeUpdated = true;
                                    }
                                } catch (e) {
                                    console.warn(`  ✗ Could not update startX:`, e.message);
                                }
                            }

                            // Update startY
                            if (element.startY !== undefined && existingNode.startY !== undefined) {
                                try {
                                    if (element.startY !== existingNode.startY) {
                                        existingNode.startY = element.startY;
                                        console.log(`  ✓ Updated startY to ${element.startY}`);
                                        propertyUpdateCount++;
                                        nodeUpdated = true;
                                    }
                                } catch (e) {
                                    console.warn(`  ✗ Could not update startY:`, e.message);
                                }
                            }

                            // Update endX
                            if (element.endX !== undefined && existingNode.endX !== undefined) {
                                try {
                                    if (element.endX !== existingNode.endX) {
                                        existingNode.endX = element.endX;
                                        console.log(`  ✓ Updated endX to ${element.endX}`);
                                        propertyUpdateCount++;
                                        nodeUpdated = true;
                                    }
                                } catch (e) {
                                    console.warn(`  ✗ Could not update endX:`, e.message);
                                }
                            }

                            // Update endY
                            if (element.endY !== undefined && existingNode.endY !== undefined) {
                                try {
                                    if (element.endY !== existingNode.endY) {
                                        existingNode.endY = element.endY;
                                        console.log(`  ✓ Updated endY to ${element.endY}`);
                                        propertyUpdateCount++;
                                        nodeUpdated = true;
                                    }
                                } catch (e) {
                                    console.warn(`  ✗ Could not update endY:`, e.message);
                                }
                            }
                        }

                        // TEXT ALIGNMENT - update for text nodes
                        if ((element.type === "Text" || element.type === "TextNode" ||
                            element.type === "StandaloneTextNode" || element.type === "ThreadedTextNode") &&
                            element.textAlignment !== undefined) {
                            try {
                                if (existingNode.textAlignment !== undefined &&
                                    element.textAlignment !== existingNode.textAlignment) {
                                    existingNode.textAlignment = element.textAlignment;
                                    console.log(`  ✓ Updated textAlignment to ${element.textAlignment}`);
                                    propertyUpdateCount++;
                                    nodeUpdated = true;
                                }
                            } catch (e) {
                                console.warn(`  ✗ Could not update textAlignment:`, e.message);
                            }
                        }

                        // NODE NAME - update for all nodes that support naming
                        if (element.name !== undefined && element.name !== null) {
                            try {
                                if (existingNode.name !== undefined && element.name !== existingNode.name) {
                                    existingNode.name = element.name;
                                    console.log(`  ✓ Updated name to "${element.name}"`);
                                    propertyUpdateCount++;
                                    nodeUpdated = true;
                                }
                            } catch (e) {
                                console.warn(`  ✗ Could not update name:`, e.message);
                            }
                        }

                        // Update fill (for all nodes that support it)
                        if (element.fill && element.fill.color && existingNode.fill !== undefined) {
                            try {
                                const fillColor = editor.makeColorFill({
                                    red: element.fill.color.red || 0,
                                    green: element.fill.color.green || 0,
                                    blue: element.fill.color.blue || 0,
                                    alpha: element.fill.color.alpha !== undefined ? element.fill.color.alpha : 1
                                });
                                existingNode.fill = fillColor;
                                console.log(`  ✓ Updated fill color`);
                                propertyUpdateCount++;
                                nodeUpdated = true;
                            } catch (e) {
                                console.warn(`  ✗ Could not update fill:`, e.message);
                            }
                        }

                        // Update stroke (for all nodes that support it)
                        if (element.stroke && existingNode.stroke !== undefined) {
                            try {
                                if (element.stroke.color) {
                                    const strokeColor = {
                                        red: element.stroke.color.red || 0,
                                        green: element.stroke.color.green || 0,
                                        blue: element.stroke.color.blue || 0,
                                        alpha: element.stroke.color.alpha !== undefined ? element.stroke.color.alpha : 1
                                    };

                                    const stroke = {
                                        color: strokeColor,
                                        width: element.stroke.width !== undefined ? element.stroke.width : existingNode.stroke?.width || 1,
                                        position: element.stroke.position !== undefined ? element.stroke.position : existingNode.stroke?.position || 0,
                                        dashPattern: element.stroke.dashPattern || existingNode.stroke?.dashPattern || [],
                                        dashOffset: element.stroke.dashOffset !== undefined ? element.stroke.dashOffset : existingNode.stroke?.dashOffset || 0
                                    };

                                    existingNode.stroke = stroke;
                                    console.log(`  ✓ Updated stroke`);
                                    propertyUpdateCount++;
                                    nodeUpdated = true;
                                }
                            } catch (e) {
                                console.warn(`  ✗ Could not update stroke:`, e.message);
                            }
                        }

                        if (nodeUpdated) {
                            updated++;
                            console.log(`[Sandbox] ✓ Node ${element.id} updated successfully`);
                        } else {
                            console.log(`[Sandbox] ○ Node ${element.id} - no changes needed`);
                        }

                    } catch (e) {
                        console.warn("[Sandbox] Failed to update element:", element.type, element.id, e.message);
                    }
                }

                console.log(`[Sandbox] Update complete. Updated ${updated} nodes with ${propertyUpdateCount} property changes. ${notFound} not found.`);
            });

            // Return results captured in outer scope
            return { updated, notFound, propertyUpdateCount };
        },

        // Get all image/media nodes from the canvas with their position and size metadata
        // This is used for backend to crop individual images from the full page rendition
        getImageNodes: () => {
            const imageNodes = [];

            const extractImageMetadata = (node, path = '') => {
                try {
                    // Check for MediaContainerNode and related image types
                    const isImageNode =
                        node.type === 'MediaContainerNode' ||
                        node.type === 'MediaContainer' ||
                        node.type === 'ImageRectangleNode' ||
                        node.type === 'Image' ||
                        node.type === 'ComplexShapeNode' ||
                        node.type === 'BitmapImage';

                    if (isImageNode) {
                        const metadata = {
                            id: node.id,
                            type: node.type,
                            path: path
                        };

                        // Extract position/translation
                        try {
                            if (node.translation) {
                                metadata.translation = {
                                    x: node.translation.x,
                                    y: node.translation.y
                                };
                            }
                        } catch (e) { }

                        // Extract bounds (critical for cropping)
                        try {
                            if (node.boundsLocal) {
                                metadata.boundsLocal = {
                                    x: node.boundsLocal.x,
                                    y: node.boundsLocal.y,
                                    width: node.boundsLocal.width,
                                    height: node.boundsLocal.height
                                };
                            }
                        } catch (e) { }

                        // Extract size if available
                        try {
                            if (node.width !== undefined) metadata.width = node.width;
                            if (node.height !== undefined) metadata.height = node.height;
                        } catch (e) { }

                        // Extract rotation (needed for proper cropping)
                        try {
                            if (node.rotation !== undefined) metadata.rotation = node.rotation;
                            if (node.rotationInScreen !== undefined) metadata.rotationInScreen = node.rotationInScreen;
                        } catch (e) { }

                        // Extract opacity
                        try {
                            if (node.opacity !== undefined) metadata.opacity = node.opacity;
                        } catch (e) { }

                        // Extract center point (useful for rotated crops)
                        try {
                            if (node.centerPointLocal) {
                                metadata.centerPointLocal = {
                                    x: node.centerPointLocal.x,
                                    y: node.centerPointLocal.y
                                };
                            }
                        } catch (e) { }

                        // Extract top-left point
                        try {
                            if (node.topLeftLocal) {
                                metadata.topLeftLocal = {
                                    x: node.topLeftLocal.x,
                                    y: node.topLeftLocal.y
                                };
                            }
                        } catch (e) { }

                        imageNodes.push(metadata);
                    }

                    // Traverse children
                    if (node.children) {
                        let childIdx = 0;
                        for (const child of node.children) {
                            const childPath = path ? `${path} > ${child.type || 'Unknown'}[${childIdx}]` : `${child.type || 'Unknown'}[${childIdx}]`;
                            extractImageMetadata(child, childPath);
                            childIdx++;
                        }
                    }
                } catch (e) {
                    console.error("[Sandbox] Error extracting image metadata:", e);
                }
            };

            try {
                const documentRoot = editor.documentRoot;

                // Traverse all pages
                if (documentRoot.pages) {
                    let pageIdx = 0;
                    for (const page of documentRoot.pages) {
                        if (page.artboards) {
                            let artboardIdx = 0;
                            for (const artboard of page.artboards) {
                                const artboardPath = `Page[${pageIdx}] > Artboard[${artboardIdx}]`;
                                extractImageMetadata(artboard, artboardPath);
                                artboardIdx++;
                            }
                        }
                        pageIdx++;
                    }
                }

                console.log("[Sandbox] Found", imageNodes.length, "image nodes");
                return { success: true, imageNodes: imageNodes, count: imageNodes.length };

            } catch (error) {
                console.error("[Sandbox] Error getting image nodes:", error);
                return { success: false, error: error.message, imageNodes: [] };
            }
        },

        // Helper function to decode base64 string to Uint8Array
        // This is needed because 'atob' and 'fetch' are not available in document sandbox
        base64ToUint8Array: (base64String) => {
            // Base64 character set
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

            // Remove padding characters
            let base64 = base64String.replace(/=+$/, '');

            // Calculate the output length
            const outputLength = Math.floor(base64.length * 3 / 4);
            const bytes = new Uint8Array(outputLength);

            let byteIndex = 0;

            for (let i = 0; i < base64.length; i += 4) {
                // Get the index of each base64 character
                const a = chars.indexOf(base64[i]);
                const b = chars.indexOf(base64[i + 1]);
                const c = i + 2 < base64.length ? chars.indexOf(base64[i + 2]) : 0;
                const d = i + 3 < base64.length ? chars.indexOf(base64[i + 3]) : 0;

                // Combine 4 base64 characters into 3 bytes
                if (byteIndex < outputLength) bytes[byteIndex++] = (a << 2) | (b >> 4);
                if (byteIndex < outputLength) bytes[byteIndex++] = ((b & 15) << 4) | (c >> 2);
                if (byteIndex < outputLength) bytes[byteIndex++] = ((c & 3) << 6) | d;
            }

            return bytes;
        },

        // Helper function to convert base64 data URL to Blob without using fetch or atob
        base64DataUrlToBlob: (dataUrl) => {
            // Parse the data URL
            const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
                throw new Error('Invalid data URL format');
            }

            const mimeType = matches[1];
            const base64Data = matches[2];

            // Convert base64 to Uint8Array using our custom decoder
            const bytes = sandboxApi.base64ToUint8Array(base64Data);

            // Create and return the Blob
            return new Blob([bytes], { type: mimeType });
        },

        // Replace an image in a MediaContainerNode by node ID with a new image blob
        // Used for replacing original images with translated versions
        replaceImageById: async (nodeId, imageBase64) => {
            try {
                console.log("[Sandbox] Attempting to replace image for node:", nodeId);

                // Find the node by ID
                const node = sandboxApi.findNodeById(nodeId);

                if (!node) {
                    console.error("[Sandbox] Node not found:", nodeId);
                    return { success: false, error: `Node not found: ${nodeId}` };
                }

                console.log("[Sandbox] Found node:", node.type, node.id);

                // Check if this is a MediaContainerNode using constants
                const isMediaContainer = node.type === constants.SceneNodeType.mediaContainer ||
                    node.type === 'MediaContainerNode' ||
                    node.type === 'MediaContainer';

                if (!isMediaContainer) {
                    console.error("[Sandbox] Node is not a MediaContainerNode:", node.type);
                    return { success: false, error: `Node is not a MediaContainerNode: ${node.type}` };
                }

                // Convert base64 data URL to Blob using our custom function (no fetch or atob)
                console.log("[Sandbox] Converting base64 to blob using custom decoder...");

                const imageBlob = sandboxApi.base64DataUrlToBlob(imageBase64);

                console.log("[Sandbox] Image blob created, size:", imageBlob.size, "type:", imageBlob.type);

                // Load the bitmap image
                console.log("[Sandbox] Loading bitmap image...");
                const bitmapImage = await editor.loadBitmapImage(imageBlob);

                console.log("[Sandbox] Bitmap image loaded, scheduling replacement...");

                // Replace the media using queueAsyncEdit since loadBitmapImage is async
                // IMPORTANT: Must await queueAsyncEdit to ensure the edit completes before returning
                // Otherwise, simultaneous edits will conflict and cause "Editing not permitted" errors
                await editor.queueAsyncEdit(() => {
                    console.log("[Sandbox] Executing replaceMedia...");
                    node.replaceMedia(bitmapImage);
                    console.log("[Sandbox] replaceMedia executed");
                });

                console.log("[Sandbox] Media replacement completed successfully");
                return { success: true, nodeId: nodeId };

            } catch (error) {
                console.error("[Sandbox] Error replacing image:", error);
                console.error("[Sandbox] Error stack:", error.stack);
                return { success: false, error: error.message || String(error) };
            }
        },

        // Replace multiple images by their node IDs
        // Takes an array of { nodeId, translatedImageBase64 } objects
        // IMPORTANT: Uses batched approach - load all bitmaps first, then do all edits in single queueAsyncEdit
        replaceMultipleImages: async (imagesToReplace) => {
            const results = [];
            let successCount = 0;
            let errorCount = 0;

            console.log("[Sandbox] Replacing", imagesToReplace.length, "images using batched approach...");

            // Step 1: Prepare all data - find nodes, convert base64 to blobs
            const preparedImages = [];

            for (const imageData of imagesToReplace) {
                try {
                    // Find the node
                    const node = sandboxApi.findNodeById(imageData.nodeId);

                    if (!node) {
                        console.error("[Sandbox] Node not found:", imageData.nodeId);
                        results.push({
                            nodeId: imageData.nodeId,
                            success: false,
                            error: `Node not found: ${imageData.nodeId}`
                        });
                        errorCount++;
                        continue;
                    }

                    // Check if this is a MediaContainerNode
                    const isMediaContainer = node.type === constants.SceneNodeType.mediaContainer ||
                        node.type === 'MediaContainerNode' ||
                        node.type === 'MediaContainer';

                    if (!isMediaContainer) {
                        console.error("[Sandbox] Node is not a MediaContainerNode:", node.type);
                        results.push({
                            nodeId: imageData.nodeId,
                            success: false,
                            error: `Node is not a MediaContainerNode: ${node.type}`
                        });
                        errorCount++;
                        continue;
                    }

                    // Convert base64 to blob
                    const imageBlob = sandboxApi.base64DataUrlToBlob(imageData.translatedImageBase64);

                    preparedImages.push({
                        nodeId: imageData.nodeId,
                        node: node,
                        imageBlob: imageBlob
                    });

                    console.log("[Sandbox] Prepared image for node:", imageData.nodeId);

                } catch (err) {
                    console.error("[Sandbox] Error preparing image:", imageData.nodeId, err);
                    results.push({
                        nodeId: imageData.nodeId,
                        success: false,
                        error: err.message
                    });
                    errorCount++;
                }
            }

            if (preparedImages.length === 0) {
                console.log("[Sandbox] No images to replace after preparation");
                return {
                    success: errorCount === 0,
                    results: results,
                    successCount: 0,
                    errorCount: errorCount
                };
            }

            // Step 2: Load ALL bitmap images (these are async operations)
            console.log("[Sandbox] Loading", preparedImages.length, "bitmap images...");
            const loadedImages = [];

            for (const prepared of preparedImages) {
                try {
                    const bitmapImage = await editor.loadBitmapImage(prepared.imageBlob);
                    loadedImages.push({
                        nodeId: prepared.nodeId,
                        node: prepared.node,
                        bitmapImage: bitmapImage
                    });
                    console.log("[Sandbox] Loaded bitmap for node:", prepared.nodeId);
                } catch (err) {
                    console.error("[Sandbox] Error loading bitmap:", prepared.nodeId, err);
                    results.push({
                        nodeId: prepared.nodeId,
                        success: false,
                        error: `Failed to load bitmap: ${err.message}`
                    });
                    errorCount++;
                }
            }

            if (loadedImages.length === 0) {
                console.log("[Sandbox] No bitmaps loaded successfully");
                return {
                    success: false,
                    results: results,
                    successCount: 0,
                    errorCount: errorCount
                };
            }

            // Step 3: Execute ALL document edits in a SINGLE queueAsyncEdit call
            console.log("[Sandbox] Executing", loadedImages.length, "replacements in single queueAsyncEdit...");

            try {
                await editor.queueAsyncEdit(() => {
                    for (const loaded of loadedImages) {
                        try {
                            console.log("[Sandbox] Replacing media for node:", loaded.nodeId);
                            loaded.node.replaceMedia(loaded.bitmapImage);
                            results.push({
                                nodeId: loaded.nodeId,
                                success: true
                            });
                            successCount++;
                            console.log("[Sandbox] Successfully replaced:", loaded.nodeId);
                        } catch (editErr) {
                            console.error("[Sandbox] Error in replaceMedia:", loaded.nodeId, editErr);
                            results.push({
                                nodeId: loaded.nodeId,
                                success: false,
                                error: `replaceMedia failed: ${editErr.message}`
                            });
                            errorCount++;
                        }
                    }
                });

                console.log("[Sandbox] queueAsyncEdit completed");

            } catch (queueErr) {
                console.error("[Sandbox] queueAsyncEdit failed:", queueErr);
                // Mark all remaining as failed
                for (const loaded of loadedImages) {
                    if (!results.find(r => r.nodeId === loaded.nodeId)) {
                        results.push({
                            nodeId: loaded.nodeId,
                            success: false,
                            error: `queueAsyncEdit failed: ${queueErr.message}`
                        });
                        errorCount++;
                    }
                }
            }

            console.log("[Sandbox] Replacement complete:", successCount, "success,", errorCount, "errors");

            return {
                success: errorCount === 0,
                results: results,
                successCount: successCount,
                errorCount: errorCount
            };
        },

        // Legacy: Render elements from saved data structure (creates NEW elements)
        renderFromData: (data) => {
            let count = 0;
            const insertionParent = editor.context.insertionParent;

            if (!data || !data.allElements) {
                console.warn("[Sandbox] No elements to render");
                return { count: 0 };
            }

            console.log("[Sandbox] Rendering", data.allElements.length, "elements...");

            for (const element of data.allElements) {
                try {
                    // Skip Page and Artboard types - they're containers
                    if (element.type === "Page" || element.type === "Artboard" ||
                        element.type === "DocumentRoot" || element.type === "Unknown") {
                        continue;
                    }

                    // Handle RectangleNode
                    if (element.type === "RectangleNode" || element.type === "Rectangle") {
                        const rect = editor.createRectangle();

                        // Set dimensions
                        if (element.width) rect.width = element.width;
                        if (element.height) rect.height = element.height;

                        // Set position
                        if (element.translation) {
                            rect.translation = {
                                x: element.translation.x || 0,
                                y: element.translation.y || 0
                            };
                        }

                        // Set fill color
                        if (element.fill && element.fill.color) {
                            const fillColor = editor.makeColorFill({
                                red: element.fill.color.red || 0,
                                green: element.fill.color.green || 0,
                                blue: element.fill.color.blue || 0,
                                alpha: element.fill.color.alpha !== undefined ? element.fill.color.alpha : 1
                            });
                            rect.fill = fillColor;
                        }

                        // Set opacity
                        if (element.opacity !== undefined) {
                            rect.opacity = element.opacity;
                        }

                        // Add to canvas
                        insertionParent.children.append(rect);
                        count++;
                        console.log("[Sandbox] Created rectangle:", rect.width, "x", rect.height);
                    }

                    // Handle other types in the future...
                    // TODO: Add support for LineNode, TextNode, EllipseNode, etc.

                } catch (e) {
                    console.warn("[Sandbox] Failed to render element:", element.type, e.message);
                }
            }

            console.log("[Sandbox] Rendering complete. Created", count, "elements");
            return { count };
        }
    };

    // Expose `sandboxApi` to the UI runtime.
    runtime.exposeApi(sandboxApi);
}

start();
