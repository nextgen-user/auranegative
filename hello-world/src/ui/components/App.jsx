import React, { useState, useRef, useEffect } from "react";
import { Button } from "@swc-react/button";
import { Theme } from "@swc-react/theme";
import { Radio, RadioGroup } from "@swc-react/radio";
import { Picker } from "@swc-react/picker";
import { Menu, MenuItem } from "@swc-react/menu";
import { FieldLabel } from "@swc-react/field-label";
import { Divider } from "@swc-react/divider";
import { Textfield } from "@swc-react/textfield";
import { NumberField } from "@swc-react/number-field";
import { ActionButton } from "@swc-react/action-button";
import "@spectrum-web-components/theme/express/scale-medium.js";
import "@spectrum-web-components/theme/express/theme-light.js";
import "./App.css";

const App = ({ addOnUISdk, sandboxProxy }) => {
    const [image, setImage] = useState(null);
    const [preview, setPreview] = useState(null);
    const [language, setLanguage] = useState("Spanish");
    const [customPrompt, setCustomPrompt] = useState("");
    const [isCustom, setIsCustom] = useState(false);
    const [loading, setLoading] = useState(false);
    const [resultImage, setResultImage] = useState(null);
    const [error, setError] = useState(null);
    const [documentStructure, setDocumentStructure] = useState(null);
    const [structureLoading, setStructureLoading] = useState(false);
    const [showRawJson, setShowRawJson] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [canvasImage, setCanvasImage] = useState(null);
    const [canvasLoading, setCanvasLoading] = useState(false);
    const [saveLoading, setSaveLoading] = useState(false);
    const [loadLoading, setLoadLoading] = useState(false);
    const [translateLoading, setTranslateLoading] = useState(false);
    const [extractLoading, setExtractLoading] = useState(false);
    const [syncMessage, setSyncMessage] = useState(null);
    const [progress, setProgress] = useState(0);
    const [enhanceLoading, setEnhanceLoading] = useState(false);

    // Iterative enhance layout settings
    const [enhanceIterations, setEnhanceIterations] = useState(1);
    const [enhanceCustomPrompt, setEnhanceCustomPrompt] = useState("");

    // Undo/Redo state
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [undoLoading, setUndoLoading] = useState(false);

    // Live Status Feed State
    const [liveStatusEntries, setLiveStatusEntries] = useState([]);
    const statusFeedRef = useRef(null);

    // Auto-scroll status feed to bottom when new entries are added
    useEffect(() => {
        if (statusFeedRef.current) {
            statusFeedRef.current.scrollTop = statusFeedRef.current.scrollHeight;
        }
    }, [liveStatusEntries]);

    // Helper to add a live status entry
    const addLiveStatus = (type, message, details = null) => {
        const entry = {
            id: Date.now() + Math.random(),
            type,
            message,
            details,
            timestamp: new Date().toLocaleTimeString()
        };
        setLiveStatusEntries(prev => [...prev.slice(-50), entry]); // Keep last 50 entries
    };

    // Clear live status entries
    const clearLiveStatus = () => {
        setLiveStatusEntries([]);
    };

    // Guided Form State
    const [currentStep, setCurrentStep] = useState(1);
    const TOTAL_STEPS = 5;
    const [formData, setFormData] = useState({
        language: "Spanish",
        region: "Global",
        audience: "general",
        layoutStyle: "balanced",
        toneStyle: "neutral",
        customSuggestions: "",
        iterations: 2,
    });
    const [selectedChips, setSelectedChips] = useState([]);

    // Suggestion chip options
    const SUGGESTION_CHIPS = [
        "Use formal language",
        "Keep text concise",
        "Add local cultural references",
        "Make colors more vibrant",
        "Use modern typography",
        "Align elements symmetrically",
        "Increase contrast",
        "Add breathing room"
    ];

    const updateFormData = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const toggleChip = (chip) => {
        setSelectedChips(prev =>
            prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]
        );
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result); // Base64 string
                setPreview(reader.result);
                setResultImage(null);
            };
            reader.readAsDataURL(file);
        }
    };

    // Helper to convert blob to base64
    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    // Handler to capture the entire canvas frame as an image
    const handleCaptureCanvasFrame = async () => {
        if (!addOnUISdk) {
            setError("SDK not available.");
            return;
        }
        setCanvasLoading(true);
        setError(null);
        try {
            // Create rendition options for the current page
            const renditionOptions = {
                range: addOnUISdk.constants.Range.currentPage,
                format: addOnUISdk.constants.RenditionFormat.png,
            };

            // Use 'preview' intent - always allowed, no permission check needed
            const renditions = await addOnUISdk.app.document.createRenditions(
                renditionOptions,
                addOnUISdk.constants.RenditionIntent.preview
            );

            if (renditions && renditions.length > 0) {
                // Convert blob to base64 for display
                const blob = renditions[0].blob;
                const base64 = await blobToBase64(blob);
                setCanvasImage(base64);
                console.log("Canvas frame captured successfully!");
            } else {
                setError("No rendition returned from the document.");
            }
        } catch (err) {
            console.error("Error capturing canvas frame:", err);
            setError(`Error capturing canvas: ${err.message || 'Unknown error'}`);
        } finally {
            setCanvasLoading(false);
        }
    };

    const handleGetFromCanvas = async () => {
        if (!sandboxProxy) {
            setError("Sandbox not available.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const imageData = await sandboxProxy.getSelectedImage();
            if (imageData) {
                setImage(imageData);
                setPreview(imageData);
                setResultImage(null);
            } else {
                setError("Could not get image from canvas. Please select an image element or upload one.");
            }
        } catch (err) {
            console.error(err);
            setError("Error getting image from canvas. Feature might not be supported in this environment.");
        } finally {
            setLoading(false);
        }
    };

    // Handler to get and display document structure
    const handleGetDocumentStructure = async () => {
        if (!sandboxProxy) {
            setError("Sandbox not available.");
            return;
        }
        setStructureLoading(true);
        setError(null);
        setDocumentStructure(null);
        try {
            const structure = await sandboxProxy.getDocumentStructure();
            setDocumentStructure(structure);
            console.log("Document Structure:", structure);
        } catch (err) {
            console.error(err);
            setError("Error getting document structure.");
        } finally {
            setStructureLoading(false);
        }
    };

    // Handler to save canvas data to backend
    const handleSaveToBackend = async () => {
        if (!sandboxProxy) {
            setError("Sandbox not available.");
            return false;
        }
        setSaveLoading(true);
        setError(null);
        setSyncMessage(null);
        try {
            // Step 1: Get data from sandbox
            const sandboxResult = await sandboxProxy.getDataForBackend();
            if (!sandboxResult.success) {
                throw new Error(sandboxResult.error || "Failed to get data from sandbox");
            }

            // Step 2: Send data to backend via HTTP
            const response = await fetch("http://localhost:3000/save-canvas-data", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(sandboxResult.data),
            });

            const result = await response.json();

            if (result.success) {
                setSyncMessage(`✅ Saved ${result.elementsCount} elements to backend`);
                return true;
            } else {
                throw new Error(result.error || "Failed to save data");
            }
        } catch (err) {
            console.error(err);
            setError(err.message || "Error saving to backend. Is it running?");
            return false;
        } finally {
            setSaveLoading(false);
        }
    };

    // Handler to load canvas data from backend and render
    const handleLoadFromBackend = async () => {
        if (!sandboxProxy) {
            setError("Sandbox not available.");
            return;
        }
        setLoadLoading(true);
        setError(null);
        setSyncMessage(null);
        try {
            // Step 1: Fetch data from backend via HTTP
            const response = await fetch("http://localhost:3000/get-canvas-data");
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || "Failed to get data from backend");
            }

            if (!result.data) {
                setSyncMessage("ℹ️ No saved data found on backend");
                return;
            }

            // Step 2: Pass data to sandbox to render on canvas
            const renderResult = await sandboxProxy.loadDataToCanvas(result.data);

            if (renderResult.success) {
                setSyncMessage(`✅ ${renderResult.message}`);
            } else {
                throw new Error(renderResult.error || "Failed to render data");
            }
        } catch (err) {
            console.error(err);
            setError(err.message || "Error loading from backend. Is it running?");
        } finally {
            setLoadLoading(false);
        }
    };

    // Handler to translate all text in canvas data via backend
    // Note: languageOverride is passed directly to avoid React state timing issues
    const handleTranslateText = async (languageOverride = null) => {
        setTranslateLoading(true);
        setError(null);
        setSyncMessage(null);

        try {
            // First, ensure we have the latest data saved
            // (Optional: could auto-save here, but assuming user syncs manually for now)

            // Use passed language if available, otherwise fall back to state
            const targetLang = languageOverride || (isCustom ? customPrompt : language);
            console.log("[handleTranslateText] Translating to:", targetLang, "(override:", languageOverride, ", state:", language, ")");

            const response = await fetch("http://localhost:3000/translate-canvas-text", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    targetLanguage: targetLang
                }),
            });

            const result = await response.json();

            if (result.success) {
                setSyncMessage(`✅ Translated ${result.translatedCount} elements. Loading updates...`);

                // Automatically load the translated data back to canvas
                await handleLoadFromBackend();

                setSyncMessage(`✅ Translated & Loaded ${result.translatedCount} elements to ${targetLang}`);
                return true;
            } else {
                throw new Error(result.error || "Failed to translate text");
            }

        } catch (err) {
            console.error(err);
            setError(err.message || "Error translating text. Is backend running?");
            return false;
        } finally {
            setTranslateLoading(false);
        }
    };

    // Helper to format color objects
    const formatColor = (color) => {
        if (!color) return null;
        const r = Math.round((color.red || 0) * 255);
        const g = Math.round((color.green || 0) * 255);
        const b = Math.round((color.blue || 0) * 255);
        const a = color.alpha !== undefined ? color.alpha.toFixed(2) : '1.00';
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    };

    // Helper to format any value for display
    const formatValue = (val) => {
        if (val === null || val === undefined) return 'null';
        if (typeof val === 'object') {
            if (val.red !== undefined) return formatColor(val);
            return JSON.stringify(val);
        }
        if (typeof val === 'number') return val.toFixed ? val.toFixed(2) : val;
        return String(val);
    };

    // Render all properties of a node
    const renderAllProperties = (node) => {
        // Properties to skip in display (handled separately or internal)
        const skipProps = ['children', 'depth', 'index', 'path'];

        return Object.entries(node)
            .filter(([key]) => !skipProps.includes(key))
            .map(([key, value], idx) => {
                if (value === null || value === undefined) return null;

                // Special handling for nested objects
                if (typeof value === 'object' && !Array.isArray(value)) {
                    return (
                        <div key={idx} style={{ marginLeft: 8, marginTop: 2 }}>
                            <span style={{ color: '#ce93d8' }}>{key}:</span>
                            <div style={{ marginLeft: 12, color: '#aaa' }}>
                                {Object.entries(value).map(([k, v], i) => (
                                    <div key={i}>
                                        <span style={{ color: '#90caf9' }}>{k}:</span>{' '}
                                        <span style={{ color: '#fff' }}>{formatValue(v)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                }

                return (
                    <div key={idx} style={{ marginLeft: 8 }}>
                        <span style={{ color: '#ce93d8' }}>{key}:</span>{' '}
                        <span style={{ color: '#fff' }}>{formatValue(value)}</span>
                    </div>
                );
            });
    };

    // Render a node and its children recursively with FULL details
    const renderNode = (node, key = 0) => {
        const indent = node.depth ? node.depth * 16 : 0;
        const bgColors = ['#1e293b', '#1a1a2e', '#1f2937', '#18181b'];
        const bgColor = bgColors[node.depth % bgColors.length];

        return (
            <div key={key} style={{
                marginLeft: indent,
                borderLeft: '2px solid #4fc3f7',
                paddingLeft: 8,
                marginBottom: 8,
                marginTop: 4,
                background: bgColor,
                borderRadius: 4,
                padding: 8
            }}>
                {/* Header */}
                <div style={{
                    fontSize: 11,
                    color: '#fff',
                    fontFamily: 'monospace',
                    borderBottom: '1px solid #333',
                    paddingBottom: 4,
                    marginBottom: 4
                }}>
                    <strong style={{ color: '#4fc3f7', fontSize: 12 }}>▸ {node.type}</strong>
                    <span style={{ color: '#888', marginLeft: 8 }}>ID: {node.id || 'N/A'}</span>
                    {node.path && (
                        <div style={{ color: '#666', fontSize: 9, marginTop: 2 }}>
                            Path: {node.path}
                        </div>
                    )}
                </div>

                {/* All Properties */}
                <div style={{ fontSize: 9, lineHeight: 1.4 }}>
                    {renderAllProperties(node)}
                </div>

                {/* Children */}
                {node.children && node.children.length > 0 && (
                    <div style={{ marginTop: 8, borderTop: '1px dashed #444', paddingTop: 8 }}>
                        <div style={{ color: '#ff9800', fontSize: 10, marginBottom: 4 }}>
                            Children ({node.children.length}):
                        </div>
                        {node.children.map((child, i) => renderNode(child, i))}
                    </div>
                )}
            </div>
        );
    };

    // Note: languageOverride is passed directly to avoid React state timing issues
    const handleCompositeTranslation = async (languageOverride = null) => {
        if (!sandboxProxy) {
            setError("Sandbox not available.");
            return;
        }

        // Use passed language if available, otherwise fall back to state
        const targetLang = languageOverride || (isCustom ? customPrompt : language);
        console.log(`[handleCompositeTranslation] Target language: ${targetLang} (override: ${languageOverride}, state: ${language})`);
        if (!targetLang) {
            setError("Please select a target language.");
            return;
        }

        setLoading(true);
        setError(null);
        setProgress(0);
        clearLiveStatus(); // Clear previous status entries
        setSyncMessage("Starting translation sequence...");
        addLiveStatus('info', `Starting translation to ${targetLang}`);

        try {
            // Step 1: Save (0-10%)
            setSyncMessage(`Step 1: Saving canvas data...`);
            addLiveStatus('tool', 'Saving canvas data to backend...');
            setProgress(5);
            const saved = await handleSaveToBackend();
            if (!saved) {
                addLiveStatus('error', 'Failed to save canvas data');
                return;
            }
            addLiveStatus('success', 'Canvas data saved');
            setProgress(10);

            // Step 2: Translate Text (10-40%)
            setSyncMessage(`Step 2: Translating text to ${targetLang}...`);
            addLiveStatus('thinking', `AI translating text to ${targetLang}...`);
            setProgress(15);
            const translated = await handleTranslateText(targetLang);
            if (!translated) {
                addLiveStatus('error', 'Translation failed');
                return;
            }
            addLiveStatus('success', `Text translated to ${targetLang}`);
            setProgress(100);

            // Step 3: Translate Images (40-100%)
            // setSyncMessage(`Step 3: Translating images...`);
            // Pass the range 40-100 to the image translation handler
            // const imagesTranslated = await handleTranslateImages(40, 100);

            // if (imagesTranslated) {
            //     setProgress(100);
            //     setSyncMessage("✅ Translation Complete!");
            // }

        } catch (err) {
            console.error(err);
            setError("Error during translation sequence.");
            addLiveStatus('error', 'Translation sequence failed');
        } finally {
            setLoading(false);
            // Optional: reset progress after a delay?
            // setTimeout(() => setProgress(0), 5000);
        }
    };


    const handleAddToDocument = async (imgData) => {
        const imgToAdd = imgData || resultImage;
        if (imgToAdd && sandboxProxy) {
            try {
                await sandboxProxy.addImageToCanvas(imgToAdd);
            } catch (e) {
                console.error("Failed to add to canvas", e);
                setError("Translated image created, but failed to add to canvas. You can download it.");
            }
        }
    };

    // Handler to extract all images from canvas and send to backend for cropping
    const handleExtractAndSendImages = async () => {
        if (!sandboxProxy || !addOnUISdk) {
            setError("SDK not available.");
            return;
        }

        setExtractLoading(true);
        setError(null);
        setSyncMessage("Extracting images from canvas...");

        try {
            // Step 1: Capture entire canvas using existing functionality
            setSyncMessage("Step 1/3: Capturing canvas...");
            const renditionOptions = {
                range: addOnUISdk.constants.Range.currentPage,
                format: addOnUISdk.constants.RenditionFormat.png,
            };

            const renditions = await addOnUISdk.app.document.createRenditions(
                renditionOptions,
                addOnUISdk.constants.RenditionIntent.preview
            );

            if (!renditions || renditions.length === 0) {
                throw new Error("No rendition returned from the document.");
            }

            // Convert blob to base64
            const pageImageBase64 = await blobToBase64(renditions[0].blob);
            console.log("Canvas captured successfully");

            // Step 2: Get image node metadata from sandbox
            setSyncMessage("Step 2/3: Getting image node metadata...");
            const imageNodesResult = await sandboxProxy.getImageNodes();

            if (!imageNodesResult.success) {
                console.warn("Could not get image nodes:", imageNodesResult.error);
            }

            console.log("Found", imageNodesResult.count, "image nodes");

            // Step 3: Send both to backend
            setSyncMessage("Step 3/3: Sending to backend for processing...");
            const response = await fetch("http://localhost:3000/save-canvas-images", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    imageNodes: imageNodesResult.imageNodes || [],
                    pageRendition: pageImageBase64,
                    timestamp: new Date().toISOString()
                }),
            });

            const result = await response.json();

            if (result.success) {
                setSyncMessage(`✅ ${result.message}`);
            } else {
                throw new Error(result.error || "Failed to save images");
            }

        } catch (err) {
            console.error("Error extracting images:", err);
            setError(err.message || "Error extracting images from canvas.");
            setSyncMessage(null);
        } finally {
            setExtractLoading(false);
        }
    };

    // Handler to translate all images on canvas and replace them with translated versions
    // Added progressStart and progressEnd to support composite progress tracking
    const handleTranslateImages = async (progressStart = 0, progressEnd = 100) => {
        if (!sandboxProxy || !addOnUISdk) {
            setError("SDK not available.");
            return;
        }

        const targetLang = isCustom ? customPrompt : language;
        if (!targetLang) {
            setError("Please select a target language.");
            return;
        }

        setExtractLoading(true);
        setError(null);
        // Only reset progress if running standalone (0-100 default)
        if (progressStart === 0 && progressEnd === 100) {
            setProgress(0);
        }
        setSyncMessage("Starting image translation...");

        // Helper to map 0-1 keyframes to the allocated progress range
        const updateProgress = (pct) => {
            const range = progressEnd - progressStart;
            setProgress(Math.round(progressStart + (range * pct)));
        };

        try {
            // Step 1: Capture entire canvas (Start -> 10% of this task)
            setSyncMessage("Step 1/4: Capturing canvas...");
            updateProgress(0.1);

            const renditionOptions = {
                range: addOnUISdk.constants.Range.currentPage,
                format: addOnUISdk.constants.RenditionFormat.png,
            };

            const renditions = await addOnUISdk.app.document.createRenditions(
                renditionOptions,
                addOnUISdk.constants.RenditionIntent.preview
            );

            if (!renditions || renditions.length === 0) {
                throw new Error("No rendition returned from the document.");
            }

            const pageImageBase64 = await blobToBase64(renditions[0].blob);
            console.log("Canvas captured successfully");
            updateProgress(0.2);

            // Step 2: Get image node metadata from sandbox (20% -> 30%)
            setSyncMessage("Step 2/4: Getting image node metadata...");
            const imageNodesResult = await sandboxProxy.getImageNodes();

            if (!imageNodesResult.success || imageNodesResult.count === 0) {
                setSyncMessage("ℹ️ No image nodes found on canvas to translate.");
                setExtractLoading(false);
                updateProgress(1.0);
                return;
            }

            console.log("Found", imageNodesResult.count, "image nodes");
            updateProgress(0.3);

            // Step 3: Send to backend for translation (30% -> 60%)
            setSyncMessage(`Step 3/4: Translating ${imageNodesResult.count} images to ${targetLang}...`);
            const response = await fetch("http://localhost:3000/translate-canvas-images", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    imageNodes: imageNodesResult.imageNodes || [],
                    pageRendition: pageImageBase64,
                    targetLanguage: targetLang,
                    timestamp: new Date().toISOString()
                }),
            });

            const result = await response.json();
            updateProgress(0.6);

            if (!result.success) {
                throw new Error(result.error || "Failed to translate images");
            }

            console.log("Translation result:", result);

            if (result.translatedImages.length === 0) {
                setSyncMessage("ℹ️ No images were translated. The images may not contain text.");
                setExtractLoading(false);
                updateProgress(1.0);
                return;
            }

            // Step 4: Replace original images with translated versions on canvas (60% -> 100%)
            // IMPORTANT: Call replaceImageById for each image SEQUENTIALLY from UI
            // Each UI->sandbox call starts fresh in synchronous context, avoiding the async edit error
            setSyncMessage(`Step 4/4: Replacing ${result.translatedImages.length} images on canvas...`);

            let successCount = 0;
            let errorCount = 0;
            const failedResults = [];

            const totalImages = result.translatedImages.length;

            for (let i = 0; i < totalImages; i++) {
                // Calculate progress within this loop (mapped from 0.6 to 1.0)
                const loopProgressStr = 0.6 + (0.4 * (i / totalImages));
                updateProgress(loopProgressStr);

                const imageData = result.translatedImages[i];
                setSyncMessage(`Step 4/4: Replacing image ${i + 1}/${totalImages}...`);

                try {
                    const replaceResult = await sandboxProxy.replaceImageById(
                        imageData.nodeId,
                        imageData.translatedImageBase64
                    );

                    if (replaceResult.success) {
                        successCount++;
                        console.log(`[UI] Successfully replaced image ${i + 1}:`, imageData.nodeId);
                    } else {
                        errorCount++;
                        failedResults.push({
                            nodeId: imageData.nodeId,
                            error: replaceResult.error || 'Unknown error'
                        });
                        console.error(`[UI] Failed to replace image ${i + 1}:`, imageData.nodeId, replaceResult.error);
                    }
                } catch (replaceErr) {
                    errorCount++;
                    failedResults.push({
                        nodeId: imageData.nodeId,
                        error: replaceErr.message || 'Unknown error'
                    });
                    console.error(`[UI] Exception replacing image ${i + 1}:`, imageData.nodeId, replaceErr);
                }
            }

            updateProgress(1.0);

            if (errorCount === 0) {
                setSyncMessage(`✅ Successfully translated and replaced ${successCount} images to ${targetLang}`);
                return true;
            } else {
                const errorDetails = failedResults.map(r =>
                    `• Node ${r.nodeId}: ${r.error}`
                ).join('\n');
                setSyncMessage(`⚠️ Replaced ${successCount} images, ${errorCount} failed:\n${errorDetails}`);
                return false;
            }

        } catch (err) {
            console.error("Error translating images:", err);
            setError(err.message || "Error translating images.");
            setSyncMessage(null);
            return false;
        } finally {
            setExtractLoading(false);
        }
    };

    // Helper: Clear canvas images on backend
    const clearCanvasData = async () => {
        try {
            const response = await fetch("http://localhost:3000/clear-canvas-data", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clearJson: false })
            });
            const result = await response.json();
            return result.success;
        } catch (err) {
            console.error("Error clearing canvas data:", err);
            return false;
        }
    };

    // Helper: Save canvas snapshot for undo
    const saveCanvasSnapshot = async () => {
        try {
            const response = await fetch("http://localhost:3000/save-canvas-snapshot", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            const result = await response.json();
            if (result.success) {
                setCanUndo(true);
                setCanRedo(false);
            }
            return result.success;
        } catch (err) {
            console.error("Error saving snapshot:", err);
            return false;
        }
    };

    // Helper: Fetch undo/redo state
    const refreshHistoryState = async () => {
        try {
            const response = await fetch("http://localhost:3000/canvas-history");
            const result = await response.json();
            if (result.success) {
                setCanUndo(result.canUndo);
                setCanRedo(result.canRedo);
            }
        } catch (err) {
            console.error("Error fetching history:", err);
        }
    };

    // Handler: Undo canvas changes
    const handleUndo = async () => {
        if (!sandboxProxy) return;
        setUndoLoading(true);
        setError(null);
        try {
            const response = await fetch("http://localhost:3000/undo-canvas", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            const result = await response.json();
            if (result.success) {
                setCanUndo(result.canUndo);
                setCanRedo(result.canRedo);
                await handleLoadFromBackend();
                setSyncMessage(`↩️ Undo: Restored to snapshot ${result.restoredIndex}`);
            } else {
                setSyncMessage(`⚠️ ${result.error}`);
            }
        } catch (err) {
            setError("Error during undo");
        } finally {
            setUndoLoading(false);
        }
    };

    // Handler: Redo canvas changes
    const handleRedo = async () => {
        if (!sandboxProxy) return;
        setUndoLoading(true);
        setError(null);
        try {
            const response = await fetch("http://localhost:3000/redo-canvas", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            const result = await response.json();
            if (result.success) {
                setCanUndo(result.canUndo);
                setCanRedo(result.canRedo);
                await handleLoadFromBackend();
                setSyncMessage(`↪️ Redo: Restored to snapshot ${result.restoredIndex}`);
            } else {
                setSyncMessage(`⚠️ ${result.error}`);
            }
        } catch (err) {
            setError("Error during redo");
        } finally {
            setUndoLoading(false);
        }
    };

    // Handler to enhance layout using AI (with iterations)
    // Note: options object is passed directly to avoid React state timing issues
    const handleEnhanceLayout = async (options = {}) => {
        if (!sandboxProxy || !addOnUISdk) {
            setError("SDK not available.");
            return;
        }

        // Extract options with fallbacks to state values
        const {
            iterations: iterationsOverride = null,
            customPrompt: customPromptOverride = null,
            region: regionOverride = null,
            audience: audienceOverride = null,
            layoutStyle: layoutStyleOverride = null,
            toneStyle: toneStyleOverride = null
        } = options;

        // Use passed values if available, otherwise fall back to state
        const iterations = Math.max(1, Math.min(10, iterationsOverride !== null ? iterationsOverride : enhanceIterations));
        const customPrompt = customPromptOverride !== null ? customPromptOverride : enhanceCustomPrompt;

        console.log(`[handleEnhanceLayout] Running ${iterations} iterations with customPrompt: "${customPrompt?.substring(0, 50)}..."`);
        console.log(`[handleEnhanceLayout] Options - region: ${regionOverride}, audience: ${audienceOverride}, layoutStyle: ${layoutStyleOverride}, toneStyle: ${toneStyleOverride}`);

        setEnhanceLoading(true);
        setError(null);
        setProgress(0);
        clearLiveStatus(); // Clear previous status entries
        setSyncMessage(`Starting layout enhancement (${iterations} iteration${iterations > 1 ? 's' : ''})...`);
        addLiveStatus('info', `Starting layout enhancement with ${iterations} iteration${iterations > 1 ? 's' : ''}`);

        // Track summaries of what was done in each iteration for context
        const iterationSummaries = [];

        // Define default iteration focuses for multi-iteration mode
        const defaultIterationFocus = {
            1: "Generate new images and decorative elements",
            2: "Move and reposition image elements",
            3: "Move and adjust text elements",
            4: "Final polish and refinement"
        };

        let totalChanges = 0;

        try {
            for (let iter = 1; iter <= iterations; iter++) {
                const iterPrefix = iterations > 1 ? `[${iter}/${iterations}] ` : '';
                const progressBase = ((iter - 1) / iterations) * 100;
                const progressPerIter = 100 / iterations;

                // Get focus for this iteration
                const iterationFocus = defaultIterationFocus[Math.min(iter, 4)] || "General layout improvement";

                if (iterations > 1) {
                    addLiveStatus('info', `Iteration ${iter}: ${iterationFocus}`);
                }

                // Step 1: Save snapshot for undo (before making changes)
                setSyncMessage(`${iterPrefix}Saving undo snapshot...`);
                setProgress(progressBase + progressPerIter * 0.05);
                await saveCanvasSnapshot();

                // Step 2: Clear canvas-images folder
                setSyncMessage(`${iterPrefix}Clearing previous images...`);
                setProgress(progressBase + progressPerIter * 0.1);
                await clearCanvasData();

                // Step 3: Save current canvas data to backend
                setSyncMessage(`${iterPrefix}Saving canvas data...`);
                setProgress(progressBase + progressPerIter * 0.2);
                const saved = await handleSaveToBackend();
                if (!saved) {
                    setEnhanceLoading(false);
                    return;
                }

                // Step 4: Capture canvas for AI analysis
                setSyncMessage(`${iterPrefix}Capturing canvas for analysis...`);
                setProgress(progressBase + progressPerIter * 0.35);
                const renditionOptions = {
                    range: addOnUISdk.constants.Range.currentPage,
                    format: addOnUISdk.constants.RenditionFormat.png,
                };

                const renditions = await addOnUISdk.app.document.createRenditions(
                    renditionOptions,
                    addOnUISdk.constants.RenditionIntent.preview
                );

                let pageImageBase64 = null;
                if (renditions && renditions.length > 0) {
                    pageImageBase64 = await blobToBase64(renditions[0].blob);
                }

                // Step 5: Call enhance layout endpoint with SSE streaming
                setSyncMessage(`${iterPrefix}Analyzing layout with AI...`);
                setProgress(progressBase + progressPerIter * 0.5);

                let changesCount = 0;
                let iterationAppliedChanges = []; // Track changes for this iteration's summary

                try {
                    const response = await fetch("http://localhost:3000/enhancelayout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            pageRendition: pageImageBase64,
                            customPrompt: customPrompt || null,
                            // Additional form data for context
                            region: regionOverride,
                            audience: audienceOverride,
                            layoutStyle: layoutStyleOverride,
                            toneStyle: toneStyleOverride,
                            // Iteration info for multi-iteration mode
                            iterationInfo: iterations > 1 ? {
                                currentIteration: iter,
                                totalIterations: iterations,
                                previousSummary: iterationSummaries.length > 0
                                    ? iterationSummaries.join(" | ")
                                    : null,
                                planForThisIteration: iterationFocus
                            } : null
                        }),
                    });

                    // Handle SSE stream
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    let currentEventType = null;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            // Capture event type
                            if (line.startsWith('event: ')) {
                                currentEventType = line.slice(7).trim();
                                continue;
                            }

                            if (line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.slice(6));

                                    // Handle different event types based on currentEventType or data
                                    if (currentEventType === 'thought' || data.thought) {
                                        // AI thinking/reasoning
                                        const thoughtText = data.text || data.thought || '';
                                        if (thoughtText) {
                                            addLiveStatus('thinking', thoughtText.substring(0, 200) + (thoughtText.length > 200 ? '...' : ''));
                                        }
                                    } else if (currentEventType === 'analysis') {
                                        // Analysis text
                                        if (data.text) {
                                            addLiveStatus('analysis', data.text.substring(0, 150) + (data.text.length > 150 ? '...' : ''));
                                        }
                                    } else if (currentEventType === 'functionCall') {
                                        // Function call from AI
                                        const funcName = data.name || 'Unknown function';
                                        const argsPreview = data.args ? JSON.stringify(data.args).substring(0, 100) : '';
                                        addLiveStatus('tool', `Calling: ${funcName}`, argsPreview);
                                    } else if (currentEventType === 'functionResult') {
                                        // Function result
                                        const resultMsg = data.message || (data.success ? 'Success' : 'Failed');
                                        addLiveStatus(data.success ? 'success' : 'error', resultMsg);
                                    } else if (currentEventType === 'imageGeneration' || data.status) {
                                        // Image generation status updates
                                        switch (data.status) {
                                            case 'starting':
                                                setSyncMessage(`${iterPrefix}🎨 Generating image: ${data.prompt || '...'}`);
                                                addLiveStatus('image', `Generating: ${data.prompt || '...'}`);
                                                break;
                                            case 'generating':
                                                setSyncMessage(`${iterPrefix}🎨 AI is creating image...`);
                                                addLiveStatus('image', 'AI is creating image...');
                                                break;
                                            case 'generated':
                                                setSyncMessage(`${iterPrefix}✓ Image generated, processing...`);
                                                addLiveStatus('success', 'Image generated successfully');
                                                break;
                                            case 'removing_background':
                                                setSyncMessage(`${iterPrefix}🔲 Removing background...`);
                                                addLiveStatus('image', 'Removing background with Cloudinary...');
                                                break;
                                            case 'bg_removed':
                                                addLiveStatus('success', 'Background removed');
                                                break;
                                            case 'complete':
                                                setSyncMessage(`${iterPrefix}✓ Image added at ${data.gridCell || 'canvas'}`);
                                                addLiveStatus('success', `Image placed at ${data.gridCell || 'canvas'}`);
                                                break;
                                            case 'failed':
                                                console.warn("Image generation failed:", data.error);
                                                addLiveStatus('error', `Image failed: ${data.error || 'Unknown error'}`);
                                                break;
                                            case 'bg_removal_failed':
                                                addLiveStatus('warning', `Background removal failed: ${data.error || 'Unknown'}`);
                                                break;
                                        }
                                    }

                                    // Track applied changes for final count
                                    if (data.appliedChanges) {
                                        changesCount = data.appliedChanges.length;
                                        // Store changes for iteration summary
                                        iterationAppliedChanges = data.appliedChanges;
                                    }
                                    // Track generated images count
                                    if (data.generatedImages) {
                                        console.log(`Generated ${data.generatedImages.length} images`);
                                        addLiveStatus('info', `Generated ${data.generatedImages.length} images`);
                                        // Add image generation to applied changes for summary
                                        data.generatedImages.forEach(img => {
                                            iterationAppliedChanges.push({
                                                function: 'generate_and_apply_image',
                                                result: {
                                                    message: `Generated image: ${img.prompt?.substring(0, 30)}...`,
                                                    isReplacement: img.isReplacement
                                                }
                                            });
                                        });
                                    }

                                    // Reset event type after processing
                                    currentEventType = null;
                                } catch (e) {
                                    // JSON parse error - AI may still be working
                                    console.log("Waiting for AI to complete...");
                                }
                            }
                        }
                    }
                } catch (streamErr) {
                    // Handle JSON parse errors by waiting and retrying load
                    console.error("Stream error:", streamErr);
                    setSyncMessage(`${iterPrefix}Waiting for AI to complete changes...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                totalChanges += changesCount;
                setProgress(progressBase + progressPerIter * 0.8);

                // Step 6: Load enhanced data back to canvas
                setSyncMessage(`${iterPrefix}Applying ${changesCount} layout changes...`);
                await handleLoadFromBackend();
                setProgress(progressBase + progressPerIter);

                // Build summary for this iteration to pass to subsequent iterations
                if (iterations > 1 && iterationAppliedChanges.length > 0) {
                    const summaryParts = [];

                    // Count changes by type
                    const moveCount = iterationAppliedChanges.filter(c => c.function?.includes('move_element')).length;
                    const imageCount = iterationAppliedChanges.filter(c => c.function === 'generate_and_apply_image').length;
                    const deleteCount = iterationAppliedChanges.filter(c => c.function === 'delete_element').length;
                    const textCount = iterationAppliedChanges.filter(c => c.function?.includes('text')).length;

                    if (moveCount > 0) summaryParts.push(`Moved ${moveCount} elements`);
                    if (imageCount > 0) summaryParts.push(`Generated/replaced ${imageCount} images`);
                    if (deleteCount > 0) summaryParts.push(`Deleted ${deleteCount} elements`);
                    if (textCount > 0) summaryParts.push(`Modified ${textCount} text elements`);

                    const iterSummary = `Iteration ${iter}: ${summaryParts.join(', ') || `Applied ${changesCount} changes`}`;
                    iterationSummaries.push(iterSummary);
                    console.log(`[handleEnhanceLayout] ${iterSummary}`);
                }

                // Small delay between iterations
                if (iter < iterations) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            setProgress(100);
            setSyncMessage(`✅ Layout enhanced! Applied ${totalChanges} total changes across ${iterations} iteration${iterations > 1 ? 's' : ''}.`);
            await refreshHistoryState();

        } catch (err) {
            console.error("Error enhancing layout:", err);
            setError(err.message || "Error enhancing layout. Is backend running?");
            setSyncMessage(null);
        } finally {
            setEnhanceLoading(false);
        }
    };

    return (
        <Theme system="express" scale="medium" color="light">
            <div className="container">
                <header>
                    <h1>VoiceFlow Translator</h1>
                    <p>Translate text in images instantly.</p>
                </header>




                {/* ===== GUIDED TRANSLATION FORM ===== */}
                <div className="guided-form">
                    {/* Step Progress Indicator */}
                    <div className="form-stepper">
                        {[1, 2, 3, 4, 5].map((step) => (
                            <div
                                key={step}
                                className={`step-dot ${currentStep === step ? 'active' : ''} ${currentStep > step ? 'completed' : ''}`}
                                onClick={() => setCurrentStep(step)}
                            >
                                {currentStep > step ? '✓' : step}
                            </div>
                        ))}
                    </div>
                    <div className="step-labels">
                        <span className={currentStep >= 1 ? 'active' : ''}>Language</span>
                        <span className={currentStep >= 2 ? 'active' : ''}>Audience</span>
                        <span className={currentStep >= 3 ? 'active' : ''}>Layout</span>
                        <span className={currentStep >= 4 ? 'active' : ''}>Tone</span>
                        <span className={currentStep >= 5 ? 'active' : ''}>Extras</span>
                    </div>

                    <Divider size="s" style={{ margin: '16px 0' }} />

                    {/* Step 1: Target Language */}
                    {currentStep === 1 && (
                        <div className="form-step">
                            <h3 className="form-step-header">🌍 Which language do you want to translate to?</h3>
                            <Picker
                                label="Select Language"
                                value={formData.language}
                                onchange={(e) => updateFormData('language', e.target.value)}
                                style={{ width: '100%' }}
                            >
                                <Menu>
                                    {/* === LATIN SCRIPT (WESTERN) === */}
                                    <MenuItem value="English">🇬🇧 English</MenuItem>
                                    <MenuItem value="Spanish">🇪🇸 Spanish</MenuItem>
                                    <MenuItem value="French">🇫🇷 French</MenuItem>
                                    <MenuItem value="German">🇩🇪 German</MenuItem>
                                    <MenuItem value="Portuguese">🇧🇷 Portuguese</MenuItem>
                                    <MenuItem value="Italian">🇮🇹 Italian</MenuItem>
                                    <MenuItem value="Dutch">🇳🇱 Dutch</MenuItem>
                                    <MenuItem value="Polish">🇵🇱 Polish</MenuItem>
                                    <MenuItem value="Romanian">🇷🇴 Romanian</MenuItem>
                                    <MenuItem value="Swedish">🇸🇪 Swedish</MenuItem>
                                    <MenuItem value="Turkish">🇹🇷 Turkish</MenuItem>
                                    <MenuItem value="Indonesian">🇮🇩 Indonesian</MenuItem>

                                    {/* === DEVANAGARI SCRIPT (SOUTH ASIA) === */}
                                    <MenuItem value="Hindi">🇮🇳 Hindi</MenuItem>
                                    <MenuItem value="Marathi">🇮🇳 Marathi</MenuItem>
                                    <MenuItem value="Nepali">🇳🇵 Nepali</MenuItem>

                                    {/* === OTHER INDIC SCRIPTS === */}
                                    <MenuItem value="Tamil">🇮🇳 Tamil</MenuItem>
                                    <MenuItem value="Telugu">🇮🇳 Telugu</MenuItem>
                                    <MenuItem value="Kannada">🇮🇳 Kannada</MenuItem>
                                    <MenuItem value="Malayalam">🇮🇳 Malayalam</MenuItem>
                                    <MenuItem value="Bengali">🇧🇩 Bengali</MenuItem>
                                    <MenuItem value="Gujarati">🇮🇳 Gujarati</MenuItem>
                                    <MenuItem value="Punjabi">🇮🇳 Punjabi</MenuItem>
                                    <MenuItem value="Sinhala">🇱🇰 Sinhala</MenuItem>

                                    {/* === ARABIC SCRIPT === */}
                                    <MenuItem value="Arabic">🇸🇦 Arabic</MenuItem>
                                    <MenuItem value="Urdu">🇵🇰 Urdu</MenuItem>
                                    <MenuItem value="Persian">🇮🇷 Persian (Farsi)</MenuItem>

                                    {/* === HEBREW SCRIPT === */}
                                    <MenuItem value="Hebrew">🇮🇱 Hebrew</MenuItem>

                                    {/* === CJK SCRIPTS (EAST ASIA) === */}
                                    <MenuItem value="Chinese">🇨🇳 Chinese (Simplified)</MenuItem>
                                    <MenuItem value="Chinese (Traditional)">🇹🇼 Chinese (Traditional)</MenuItem>
                                    <MenuItem value="Japanese">🇯🇵 Japanese</MenuItem>
                                    <MenuItem value="Korean">🇰🇷 Korean</MenuItem>

                                    {/* === SOUTHEAST ASIAN SCRIPTS === */}
                                    <MenuItem value="Thai">🇹🇭 Thai</MenuItem>
                                    <MenuItem value="Vietnamese">🇻🇳 Vietnamese</MenuItem>
                                    <MenuItem value="Burmese">🇲🇲 Burmese</MenuItem>
                                    <MenuItem value="Khmer">🇰🇭 Khmer (Cambodian)</MenuItem>
                                    <MenuItem value="Lao">🇱🇦 Lao</MenuItem>

                                    {/* === CYRILLIC SCRIPT === */}
                                    <MenuItem value="Russian">🇷🇺 Russian</MenuItem>
                                    <MenuItem value="Ukrainian">🇺🇦 Ukrainian</MenuItem>
                                    <MenuItem value="Bulgarian">🇧🇬 Bulgarian</MenuItem>

                                    {/* === OTHER SCRIPTS === */}
                                    <MenuItem value="Greek">🇬🇷 Greek</MenuItem>
                                    <MenuItem value="Georgian">🇬🇪 Georgian</MenuItem>
                                    <MenuItem value="Armenian">🇦🇲 Armenian</MenuItem>
                                    <MenuItem value="Amharic">🇪🇹 Amharic</MenuItem>
                                </Menu>
                            </Picker>
                        </div>
                    )}

                    {/* Step 2: Target Audience */}
                    {currentStep === 2 && (
                        <div className="form-step">
                            <h3 className="form-step-header">🎯 Who is your target audience?</h3>
                            <FieldLabel>Target Region</FieldLabel>
                            <Picker
                                value={formData.region}
                                onchange={(e) => updateFormData('region', e.target.value)}
                                style={{ width: '100%', marginBottom: '16px' }}
                            >
                                <Menu>
                                    <MenuItem value="Global">🌐 Global (International)</MenuItem>
                                    <MenuItem value="North America">🌎 North America</MenuItem>
                                    <MenuItem value="Europe">🌍 Europe</MenuItem>
                                    <MenuItem value="Asia">🌏 Asia</MenuItem>
                                    <MenuItem value="Latin America">🌎 Latin America</MenuItem>
                                    <MenuItem value="Middle East">🌍 Middle East</MenuItem>
                                </Menu>
                            </Picker>
                            <FieldLabel style={{ marginTop: '12px' }}>Audience Type</FieldLabel>
                            <div className="radio-cards audience-cards">
                                {[
                                    { value: 'general', emoji: '👥', title: 'General Public' },
                                    { value: 'business', emoji: '💼', title: 'Business Professionals' },
                                    { value: 'youth', emoji: '🎮', title: 'Youth / Teens' },
                                    { value: 'seniors', emoji: '👴', title: 'Seniors' },
                                    { value: 'academic', emoji: '🎓', title: 'Academic' }
                                ].map(opt => (
                                    <div
                                        key={opt.value}
                                        className={`radio-card compact ${formData.audience === opt.value ? 'selected' : ''}`}
                                        onClick={() => updateFormData('audience', opt.value)}
                                    >
                                        <span className="radio-card-emoji">{opt.emoji}</span>
                                        <span className="radio-card-title">{opt.title}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Layout Style */}
                    {currentStep === 3 && (
                        <div className="form-step">
                            <h3 className="form-step-header">🎨 What layout style do you prefer?</h3>
                            <div className="radio-cards">
                                {[
                                    { value: 'minimal', emoji: '✨', title: 'Minimal & Clean', desc: 'Simple, lots of whitespace' },
                                    { value: 'balanced', emoji: '⚖️', title: 'Balanced', desc: 'Professional and harmonious' },
                                    { value: 'bold', emoji: '🔥', title: 'Bold & Catchy', desc: 'Eye-catching, attention-grabbing' },
                                    { value: 'premium', emoji: '💎', title: 'Premium & Elegant', desc: 'Luxurious, sophisticated' }
                                ].map(opt => (
                                    <div
                                        key={opt.value}
                                        className={`radio-card ${formData.layoutStyle === opt.value ? 'selected' : ''}`}
                                        onClick={() => updateFormData('layoutStyle', opt.value)}
                                    >
                                        <span className="radio-card-emoji">{opt.emoji}</span>
                                        <span className="radio-card-title">{opt.title}</span>
                                        <span className="radio-card-desc">{opt.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Tone & Style */}
                    {currentStep === 4 && (
                        <div className="form-step">
                            <h3 className="form-step-header">💬 What tone should the content have?</h3>
                            <div className="radio-cards">
                                {[
                                    { value: 'neutral', emoji: '😐', title: 'Neutral', desc: 'Straightforward and clear' },
                                    { value: 'casual', emoji: '😊', title: 'Casual & Friendly', desc: 'Warm and approachable' },
                                    { value: 'professional', emoji: '👔', title: 'Professional', desc: 'Formal and business-like' },
                                    { value: 'playful', emoji: '🎉', title: 'Playful & Fun', desc: 'Energetic and lively' }
                                ].map(opt => (
                                    <div
                                        key={opt.value}
                                        className={`radio-card ${formData.toneStyle === opt.value ? 'selected' : ''}`}
                                        onClick={() => updateFormData('toneStyle', opt.value)}
                                    >
                                        <span className="radio-card-emoji">{opt.emoji}</span>
                                        <span className="radio-card-title">{opt.title}</span>
                                        <span className="radio-card-desc">{opt.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 5: Custom Suggestions & Iterations */}
                    {currentStep === 5 && (
                        <div className="form-step">
                            <h3 className="form-step-header">✨ Any other suggestions?</h3>
                            <p className="form-hint">Click to add suggestions, or type your own:</p>
                            <div className="suggestion-chips">
                                {SUGGESTION_CHIPS.map(chip => (
                                    <ActionButton
                                        key={chip}
                                        quiet={!selectedChips.includes(chip)}
                                        selected={selectedChips.includes(chip)}
                                        onClick={() => toggleChip(chip)}
                                        style={{
                                            background: selectedChips.includes(chip) ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(99, 102, 241, 0.1)',
                                            color: selectedChips.includes(chip) ? '#fff' : '#6366f1',
                                            borderRadius: '20px',
                                            fontSize: '11px',
                                            padding: '4px 12px'
                                        }}
                                    >
                                        {chip}
                                    </ActionButton>
                                ))}
                            </div>
                            <Textfield
                                placeholder="Add your own suggestion..."
                                value={formData.customSuggestions}
                                onchange={(e) => updateFormData('customSuggestions', e.target.value)}
                                style={{ width: '100%', marginTop: '12px' }}
                            />
                            <Divider size="s" style={{ margin: '16px 0' }} />
                            <FieldLabel>Enhancement Iterations (1-10)</FieldLabel>
                            <NumberField
                                value={formData.iterations}
                                min={1}
                                max={10}
                                onchange={(e) => updateFormData('iterations', parseInt(e.target.value) || 1)}
                                style={{ width: '100px' }}
                            />
                        </div>
                    )}

                    {/* Step Navigation */}
                    <div className="form-nav">
                        <Button
                            variant="secondary"
                            disabled={currentStep === 1}
                            onClick={() => setCurrentStep(s => Math.max(1, s - 1))}
                        >
                            ← Previous
                        </Button>
                        {currentStep < TOTAL_STEPS ? (
                            <Button
                                variant="primary"
                                onClick={() => setCurrentStep(s => Math.min(TOTAL_STEPS, s + 1))}
                            >
                                Next →
                            </Button>
                        ) : null}
                    </div>
                </div>

                {/* ===== ACTION BUTTONS ===== */}
                <div className="action-buttons-section">
                    <Button
                        variant="cta"
                        onClick={async () => {
                            // Build custom prompt from chips + custom text
                            const allSuggestions = [...selectedChips, formData.customSuggestions].filter(Boolean).join('. ');

                            // Update states for display purposes
                            setLanguage(formData.language);
                            setEnhanceIterations(formData.iterations);
                            setEnhanceCustomPrompt(allSuggestions);

                            // Run composite translation - pass language directly
                            await handleCompositeTranslation(formData.language);

                            // Run enhance layout - pass ALL form data directly to avoid React state timing issues
                            await handleEnhanceLayout({
                                iterations: formData.iterations,
                                customPrompt: allSuggestions,
                                region: formData.region,
                                audience: formData.audience,
                                layoutStyle: formData.layoutStyle,
                                toneStyle: formData.toneStyle
                            });
                        }}
                        disabled={currentStep !== TOTAL_STEPS || loading || saveLoading || translateLoading || enhanceLoading}
                        style={{ width: '100%', opacity: currentStep !== TOTAL_STEPS ? 0.5 : 1 }}
                    >
                        {loading || translateLoading || enhanceLoading ? "🔄 Processing..." : "🚀 Translate & Enhance"}
                    </Button>

                    <Button
                        variant="secondary"
                        onClick={async () => {
                            // Update language state for display purposes
                            setLanguage(formData.language);
                            // Run translation only - pass language directly
                            await handleCompositeTranslation(formData.language);
                        }}
                        disabled={currentStep !== TOTAL_STEPS || loading || saveLoading || translateLoading || enhanceLoading}
                        style={{ width: '100%', marginTop: '8px', opacity: currentStep !== TOTAL_STEPS ? 0.5 : 1 }}
                    >
                        {translateLoading || loading ? "🌐 Translating..." : "🌐 Translate Only"}
                    </Button>

                    <Button
                        variant="secondary"
                        onClick={async () => {
                            // Build custom prompt from chips + custom text
                            const allSuggestions = [...selectedChips, formData.customSuggestions].filter(Boolean).join('. ');

                            // Update states for display purposes
                            setEnhanceIterations(formData.iterations);
                            setEnhanceCustomPrompt(allSuggestions);

                            // Run enhance layout - pass ALL form data directly to avoid React state timing issues
                            await handleEnhanceLayout({
                                iterations: formData.iterations,
                                customPrompt: allSuggestions,
                                region: formData.region,
                                audience: formData.audience,
                                layoutStyle: formData.layoutStyle,
                                toneStyle: formData.toneStyle
                            });
                        }}
                        disabled={currentStep !== TOTAL_STEPS || loading || saveLoading || translateLoading || enhanceLoading}
                        style={{ width: '100%', marginTop: '8px', opacity: currentStep !== TOTAL_STEPS ? 0.5 : 1 }}
                    >
                        {enhanceLoading ? "🎨 Enhancing..." : "🎨 Enhance Layout Only"}
                    </Button>

                    {/* Undo / Redo */}
                    <div className="undo-redo-row">
                        <Button
                            variant="secondary"
                            onClick={handleUndo}
                            disabled={!canUndo || undoLoading || enhanceLoading}
                            style={{ flex: 1, opacity: canUndo ? 1 : 0.5 }}
                        >
                            {undoLoading ? "↩️ ..." : "↩️ Undo"}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleRedo}
                            disabled={!canRedo || undoLoading || enhanceLoading}
                            style={{ flex: 1, opacity: canRedo ? 1 : 0.5 }}
                        >
                            {undoLoading ? "↪️ ..." : "↪️ Redo"}
                        </Button>
                    </div>
                </div>

                {/* ===== PROGRESS & STATUS ===== */}
                {(loading || extractLoading || translateLoading || enhanceLoading || (syncMessage && !syncMessage.includes('✅') && !syncMessage.includes('⚠️'))) && (
                    <div className="progress-wrapper">
                        <div className="progress-info">
                            <span>{syncMessage || "Processing..."}</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="progress-container">
                            <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                        </div>

                        {/* ===== LIVE STATUS FEED ===== */}
                        {liveStatusEntries.length > 0 && (
                            <div className="live-status-feed" ref={statusFeedRef}>
                                <div className="live-status-header">
                                    <span className="live-status-indicator"></span>
                                    <span>Live Activity</span>
                                </div>
                                {liveStatusEntries.map(entry => (
                                    <div key={entry.id} className={`status-entry status-entry-${entry.type}`}>
                                        <span className="status-icon">
                                            {entry.type === 'thinking' && '🧠'}
                                            {entry.type === 'analysis' && '📊'}
                                            {entry.type === 'tool' && '🔧'}
                                            {entry.type === 'image' && '🖼️'}
                                            {entry.type === 'success' && '✅'}
                                            {entry.type === 'error' && '❌'}
                                            {entry.type === 'warning' && '⚠️'}
                                            {entry.type === 'info' && 'ℹ️'}
                                        </span>
                                        <span className="status-message">{entry.message}</span>
                                        <span className="status-time">{entry.timestamp}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}


                {syncMessage && (syncMessage.includes('✅') || syncMessage.includes('⚠️')) && !loading && !extractLoading && !enhanceLoading && (
                    <div className="success-message" style={syncMessage.includes('⚠️') ? { background: '#fff3e0', color: '#ef6c00', border: '1px solid #ffe0b2' } : {}}>
                        {syncMessage}
                    </div>
                )}

                {error && <div className="error-message">{error}</div>}

                {resultImage && (
                    <div className="result-section">
                        <h3>Result</h3>
                        <div className="result-container">
                            <img src={resultImage} alt="Translated" className="result-image" />
                        </div>
                        <div className="actions">
                            <a href={resultImage} download="translated.png" style={{ textDecoration: 'none' }}>
                                <Button variant="primary">Download</Button>
                            </a>
                        </div>
                    </div>
                )}




            </div>
        </Theme>
    );
};

export default App;
