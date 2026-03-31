console.log("App.jsx is executing...");
const { useState, useEffect, useContext, createContext, useRef } = React;
const { createRoot } = ReactDOM;
const { LightweightCharts } = window;
if (!LightweightCharts) console.error("LightweightCharts is not loaded!");

// ─── ProChart: Advanced Chart with Drawing Tools & Indicators ───────────────

const ProChart = ({ data, symbol, compact = false, brackets = null, patterns = [] }) => {
    const containerRef = useRef();
    const chartRef = useRef();
    const seriesRef = useRef();
    const volSeriesRef = useRef();
    const indicatorSeriesRef = useRef({});
    const bracketLinesRef = useRef({}); // { sl: PriceLine, tp: PriceLine, entry: PriceLine }
    const patternSeriesRef = useRef([]); 
    const drawingCanvasRef = useRef();
    const overlayRef = useRef();
    const audioCtx = useRef(null);

    const [chartType, setChartType] = useState('candlestick');
    const [activeTool, setActiveTool] = useState('crosshair');
    const [activeIndicators, setActiveIndicators] = useState({ sma14: false, sma50: false, ema21: false, bb: false, sao: false, zones: false });
    const [showVolume, setShowVolume] = useState(true);
    const [showRsi, setShowRsi] = useState(false);
    const [drawings, setDrawings] = useState([]);
    const drawState = useRef({ isDrawing: false, startX: 0, startY: 0, currentPath: [] });

    // Initialize chart
    useEffect(() => {
        if (!containerRef.current) return;
        const chart = LightweightCharts.createChart(containerRef.current, {
            autoSize: true,
            layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#94a3b8' },
            grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
            crosshair: { mode: 1 },
            timeScale: { timeVisible: true, secondsVisible: true, borderVisible: false },
            rightPriceScale: { borderVisible: false },
        });
        chartRef.current = chart;

        const main = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444' });
        seriesRef.current = main;

        const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
        chart.priceScale('').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        volSeriesRef.current = vol;

        return () => chart.remove();
    }, []);

    // Update chart type
    useEffect(() => {
        if (!chartRef.current || !data || data.length === 0) return;
        const chart = chartRef.current;

        // Remove and re-add main series on type change
        if (seriesRef.current) { try { chart.removeSeries(seriesRef.current); } catch(e){} }

        let main;
        if (chartType === 'line') {
            main = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2 });
            main.setData(data.map(d => ({ time: d.time, value: d.close })));
        } else if (chartType === 'area') {
            main = chart.addAreaSeries({ topColor: 'rgba(59,130,246,0.4)', bottomColor: 'rgba(59,130,246,0.0)', lineColor: '#3b82f6', lineWidth: 2 });
            main.setData(data.map(d => ({ time: d.time, value: d.close })));
        } else if (chartType === 'bar') {
            main = chart.addBarSeries({ upColor: '#22c55e', downColor: '#ef4444' });
            main.setData(data);
        } else {
            main = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444' });
            main.setData(data);
        }
        seriesRef.current = main;
    }, [chartType]);

    // Push live data
    useEffect(() => {
        if (!seriesRef.current || !data || data.length === 0) return;
        const isCandleType = chartType === 'candlestick' || chartType === 'bar';
        seriesRef.current.setData(isCandleType ? data : data.map(d => ({ time: d.time, value: d.close })));

        if (volSeriesRef.current && showVolume) {
            volSeriesRef.current.setData(data.map(d => ({
                time: d.time, 
                value: d.volume || Math.abs(d.close - d.open) * (200 + Math.random() * 400),
                color: d.close >= d.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'
            })));
        }

        // Indicators
        const chart = chartRef.current;
        const refs = indicatorSeriesRef.current;

        const getSMA = (period) => data.slice(period - 1).map((_, i) => {
            const slice = data.slice(i, i + period);
            return { time: data[i + period - 1].time, value: slice.reduce((s, d) => s + d.close, 0) / period };
        });
        const getEMA = (period) => {
            const k = 2 / (period + 1); let ema = data[0].close;
            return data.map((d, i) => { if (i === 0) { ema = d.close; } else { ema = d.close * k + ema * (1 - k); } return { time: d.time, value: ema }; });
        };

        const getSAO = () => {
            const period = 14;
            return data.slice(period).map((d, i) => {
                const slice = data.slice(i, i + period);
                const avgPrice = slice.reduce((s, x) => s + x.close, 0) / period;
                const vol = Math.sqrt(slice.reduce((s, x) => s + Math.pow(x.close - avgPrice, 2), 0) / period);
                const momentum = (d.close - slice[0].open) / slice[0].open;
                // SAO = Momentum weighted by Volatility + a scaled baseline
                const val = (momentum * (1 + vol / avgPrice) * 1000) + avgPrice;
                return { time: d.time, value: val };
            });
        };

        const indicatorConfig = {
            sma14: { factory: () => chart.addLineSeries({ color: '#facc15', lineWidth: 1, title: 'SMA14', crosshairMarkerVisible: false }), data: () => getSMA(14) },
            sma50: { factory: () => chart.addLineSeries({ color: '#a855f7', lineWidth: 1, title: 'SMA50', crosshairMarkerVisible: false }), data: () => getSMA(50) },
            ema21: { factory: () => chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, title: 'EMA21', crosshairMarkerVisible: false }), data: () => getEMA(21) },
            sao: { factory: () => chart.addLineSeries({ color: '#fb7185', lineWidth: 2, title: 'SAO ALPHA', crosshairMarkerVisible: true, lineStyle: 2 }), data: () => getSAO() },
        };

        Object.entries(activeIndicators).forEach(([key, isOn]) => {
            if (key === 'bb') return;
            if (isOn) {
                if (!refs[key]) refs[key] = indicatorConfig[key].factory();
                refs[key].setData(indicatorConfig[key].data());
            } else {
                if (refs[key]) { try { chart.removeSeries(refs[key]); } catch(e){} refs[key] = null; }
            }
        });

        // Bollinger Bands
        if (activeIndicators.bb) {
            const period = 20; const stdMult = 2;
            const bbData = data.slice(period - 1).map((_, i) => {
                const slice = data.slice(i, i + period);
                const mean = slice.reduce((s, d) => s + d.close, 0) / period;
                const std = Math.sqrt(slice.reduce((s, d) => s + Math.pow(d.close - mean, 2), 0) / period);
                return { time: data[i + period - 1].time, upper: mean + stdMult * std, mid: mean, lower: mean - stdMult * std };
            });
            if (!refs.bbUpper) {
                refs.bbUpper = chart.addLineSeries({ color: 'rgba(148,163,184,0.6)', lineWidth: 1, title: 'BB+', crosshairMarkerVisible: false });
                refs.bbMid   = chart.addLineSeries({ color: 'rgba(148,163,184,0.4)', lineWidth: 1, title: 'BB Mid', crosshairMarkerVisible: false, lineStyle: 2});
                refs.bbLower = chart.addLineSeries({ color: 'rgba(148,163,184,0.6)', lineWidth: 1, title: 'BB-', crosshairMarkerVisible: false });
            }
            refs.bbUpper.setData(bbData.map(d => ({ time: d.time, value: d.upper })));
            refs.bbMid.setData(bbData.map(d => ({ time: d.time, value: d.mid })));
            refs.bbLower.setData(bbData.map(d => ({ time: d.time, value: d.lower })));
        } else {
            ['bbUpper', 'bbMid', 'bbLower'].forEach(k => {
                if (refs[k]) { try { chart.removeSeries(refs[k]); } catch(e){} refs[k] = null; }
            });
        }

    }, [data, showVolume, activeIndicators, chartType]);

    // Update Bracket Lines (Visualizer)
    useEffect(() => {
        if (!seriesRef.current || !brackets) {
            // Clear existing lines if brackets removed
            Object.values(bracketLinesRef.current).forEach(line => {
                if (line) try { seriesRef.current.removePriceLine(line); } catch(e) {}
            });
            bracketLinesRef.current = {};
            return;
        }

        const series = seriesRef.current;
        const refs = bracketLinesRef.current;

        const updateLine = (key, price, color, title) => {
            if (refs[key]) {
                try { series.removePriceLine(refs[key]); } catch(e) {}
            }
            if (price) {
                refs[key] = series.createPriceLine({
                    price: price,
                    color: color,
                    lineWidth: 2,
                    lineStyle: 2, // Dashed
                    axisLabelVisible: true,
                    title: title,
                });
            } else {
                refs[key] = null;
            }
        };

        updateLine('sl', brackets.stopLoss, '#ef4444', 'STOP LOSS');
        updateLine('tp', brackets.takeProfit, '#22c55e', 'TAKE PROFIT');
        updateLine('entry', brackets.entry, '#3b82f6', 'ENTRY');

    }, [brackets, seriesRef.current]);

    // Drawing on canvas overlay
    const getCanvasPos = (e) => {
        const rect = drawingCanvasRef.current.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const redrawCanvas = (allDrawings, inProgress = null) => {
        const canvas = drawingCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const drawShape = (d, ctx) => {
            ctx.beginPath();
            ctx.strokeStyle = d.color || '#3b82f6';
            ctx.lineWidth = d.width || 2;
            ctx.globalAlpha = 0.85;
            if (d.tool === 'pen' || d.tool === 'arrow') {
                if (!d.path || d.path.length < 2) return;
                ctx.moveTo(d.path[0].x, d.path[0].y);
                d.path.forEach(p => ctx.lineTo(p.x, p.y));
            } else if (d.tool === 'line') {
                ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2);
            } else if (d.tool === 'hray') {
                ctx.moveTo(0, d.y1); ctx.lineTo(canvas.width, d.y1);
                ctx.strokeStyle = '#f59e0b';
            } else if (d.tool === 'rect') {
                ctx.strokeRect(d.x1, d.y1, d.x2 - d.x1, d.y2 - d.y1);
            } else if (d.tool === 'fib') {
                const levels = [0, 0.236, 0.382, 0.5, 0.618, 1];
                const dy = d.y2 - d.y1;
                levels.forEach((l, i) => {
                    const y = d.y1 + dy * l;
                    ctx.beginPath();
                    ctx.strokeStyle = `hsl(${200 + i * 25}, 80%, 60%)`;
                    ctx.setLineDash([4, 4]);
                    ctx.moveTo(d.x1, y); ctx.lineTo(d.x2, y);
                    ctx.stroke();
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.font = '10px monospace';
                    ctx.fillText(`${(l * 100).toFixed(1)}%`, d.x2 + 4, y + 3);
                    ctx.setLineDash([]);
                });
                return;
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        };

        allDrawings.forEach(d => drawShape(d, ctx));

        // Draw Supply/Demand Zones (Sentinel Proprietary logic)
        if (activeIndicators.zones) {
            const detectZones = () => {
                if (data.length < 20) return [];
                const zones = [];
                // Find consolidations: chunks where max(high)-min(low) is small over 5+ candles
                for (let i = 0; i < data.length - 10; i += 5) {
                    const slice = data.slice(i, i + 8);
                    const high = Math.max(...slice.map(d => d.high));
                    const low = Math.min(...slice.map(d => d.low));
                    const volSum = slice.reduce((s, d) => s + (d.volume || 0), 0);
                    if (high - low < (high * 0.005)) { // 0.5% range
                        zones.push({ high, low, color: volSum > 2000 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' });
                    }
                }
                return zones;
            };

            const zones = detectZones();
            const prices = data.map(d => d.close);
            const minP = Math.min(...prices) * 0.998;
            const maxP = Math.max(...prices) * 1.002;
            const range = maxP - minP || 1;

            zones.forEach(z => {
                const y1 = canvas.height - ((z.high - minP) / range) * canvas.height;
                const y2 = canvas.height - ((z.low - minP) / range) * canvas.height;
                ctx.fillStyle = z.color;
                ctx.fillRect(0, y1, canvas.width, y2 - y1);
                ctx.strokeStyle = z.color.replace('0.1', '0.4');
                ctx.strokeRect(0, y1, canvas.width, y2 - y1);
            });
        }

        // Draw Pattern Discovery Overlays (Refined)
        if (patterns && patterns.length > 0) {
            patterns.forEach(p => {
                ctx.beginPath();
                ctx.strokeStyle = p.sentiment === 'BULLISH' ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 3]);
                
                // Better mock scaling: x: 0-100 (perc), y: price range
                const prices = data.length > 0 ? data.map(d => d.close) : [p.points[0].y];
                const minP = Math.min(...prices) * 0.998;
                const maxP = Math.max(...prices) * 1.002;
                const range = maxP - minP || 1;

                p.points.forEach((pt, idx) => {
                    const px = (pt.x / 100) * canvas.width;
                    const py = canvas.height - ((pt.y - minP) / range) * canvas.height;
                    if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                });
                ctx.stroke();
                ctx.setLineDash([]);

                // Draw confidence points
                p.points.forEach(pt => {
                    const px = (pt.x / 100) * canvas.width;
                    const py = canvas.height - ((pt.y - minP) / range) * canvas.height;
                    ctx.beginPath();
                    ctx.arc(px, py, 4, 0, Math.PI * 2);
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.fill();
                });

                // Label Badge
                const first = p.points[0];
                const bx = (first.x / 100) * canvas.width;
                const by = canvas.height - ((first.y - minP) / range) * canvas.height - 15;
                const label = `${p.type} ${p.confidence}%`;
                const textWidth = ctx.measureText(label).width;
                
                ctx.fillStyle = p.sentiment === 'BULLISH' ? '#22c55e' : '#ef4444';
                ctx.fillRect(bx - 5, by - 12, textWidth + 10, 16);
                ctx.fillStyle = 'white';
                ctx.font = 'bold 10px sans-serif';
                ctx.fillText(label, bx, by);
                
                // Sonic Cue (on new pattern)
                if (window.playSonicCue) window.playSonicCue(p.sentiment === 'BULLISH' ? 440 : 220);
            });
        }

        if (inProgress) drawShape(inProgress, ctx);
    };

    const handleCanvasMouseDown = (e) => {
        if (activeTool === 'crosshair') return;
        const pos = getCanvasPos(e);
        drawState.current = { isDrawing: true, startX: pos.x, startY: pos.y, currentPath: [pos] };
    };

    const handleCanvasMouseMove = (e) => {
        if (!drawState.current.isDrawing) return;
        const pos = getCanvasPos(e);
        const { startX, startY, currentPath } = drawState.current;
        currentPath.push(pos);
        const preview = { tool: activeTool, x1: startX, y1: startY, x2: pos.x, y2: pos.y, path: [...currentPath], color: '#3b82f6', width: 2 };
        redrawCanvas(drawings, preview);
    };

    const handleCanvasMouseUp = (e) => {
        if (!drawState.current.isDrawing) return;
        const pos = getCanvasPos(e);
        const { startX, startY, currentPath } = drawState.current;
        drawState.current.isDrawing = false;

        if (activeTool === 'eraser') {
            setDrawings([]);
            const ctx = drawingCanvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
            return;
        }
        const newDrawing = { tool: activeTool, x1: startX, y1: startY, x2: pos.x, y2: pos.y, path: currentPath, color: '#3b82f6', width: 2 };
        const updated = [...drawings, newDrawing];
        setDrawings(updated);
        redrawCanvas(updated);
    };

    // Keep canvas sized correctly
    useEffect(() => {
        const resize = () => {
            if (!drawingCanvasRef.current || !containerRef.current) return;
            drawingCanvasRef.current.width = containerRef.current.offsetWidth;
            drawingCanvasRef.current.height = containerRef.current.offsetHeight;
            redrawCanvas(drawings);
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [drawings, patterns]);

    const toggleIndicator = (key) => setActiveIndicators(prev => ({ ...prev, [key]: !prev[key] }));

    const tools = [
        { id: 'crosshair', icon: 'crosshair', label: 'Crosshair' },
        { id: 'pen', icon: 'pencil', label: 'Freehand Pen' },
        { id: 'line', icon: 'minus', label: 'Trend Line' },
        { id: 'hray', icon: 'align-center-horizontal', label: 'Horizontal Ray' },
        { id: 'rect', icon: 'square', label: 'Rectangle' },
        { id: 'fib', icon: 'git-branch', label: 'Fibonacci Levels' },
        { id: 'eraser', icon: 'eraser', label: 'Eraser' },
    ];

    const chartTypes = [
        { id: 'candlestick', icon: 'candlestick-chart', label: 'Candlestick' },
        { id: 'bar', icon: 'bar-chart-2', label: 'Bars' },
        { id: 'line', icon: 'trending-up', label: 'Line' },
        { id: 'area', icon: 'activity', label: 'Area' },
    ];

    const indicators = [
        { id: 'sma14', label: 'SMA 14', color: '#facc15' },
        { id: 'sma50', label: 'SMA 50', color: '#a855f7' },
        { id: 'ema21', label: 'EMA 21', color: '#06b6d4' },
        { id: 'bb', label: 'BB-Volatility', color: '#94a3b8' },
        { id: 'sao', label: 'Sentinel Alpha', color: '#fb7185' },
        { id: 'zones', label: 'Supply/Demand', color: '#818cf8' },
    ];

    const toolCursor = activeTool === 'crosshair' ? 'crosshair' : activeTool === 'eraser' ? 'cell' : 'crosshair';

    return (
        <div className="flex flex-col w-full h-full select-none">
            {/* Toolbar */}
            {!compact && (
                <div className="flex items-center gap-1 px-2 py-1.5 bg-dark border-b border-slate-800 flex-wrap shrink-0 z-10">
                    {/* Chart type buttons */}
                    <div className="flex items-center gap-0.5 border-r border-slate-700 pr-2 mr-1">
                        {chartTypes.map(ct => (
                            <button key={ct.id} onClick={() => setChartType(ct.id)} title={ct.label}
                                className={`p-1.5 rounded transition text-xs ${chartType === ct.id ? 'bg-primary text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                                <i data-lucide={ct.icon} className="w-3.5 h-3.5"></i>
                            </button>
                        ))}
                    </div>

                    {/* Drawing tools */}
                    <div className="flex items-center gap-0.5 border-r border-slate-700 pr-2 mr-1">
                        {tools.map(t => (
                            <button key={t.id} onClick={() => setActiveTool(t.id)} title={t.label}
                                className={`p-1.5 rounded transition ${activeTool === t.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:bg-slate-800'}`}>
                                <i data-lucide={t.icon} className="w-3.5 h-3.5"></i>
                            </button>
                        ))}
                    </div>

                    {/* Indicators */}
                    <div className="flex items-center gap-1 flex-wrap">
                        {indicators.map(ind => (
                            <button key={ind.id} onClick={() => toggleIndicator(ind.id)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${activeIndicators[ind.id] ? 'text-white shadow-sm' : 'text-slate-500 border-slate-700 hover:border-slate-500'}`}
                                style={activeIndicators[ind.id] ? { borderColor: ind.color, backgroundColor: ind.color + '25', color: ind.color } : {}}>
                                {ind.label}
                            </button>
                        ))}
                        <button onClick={() => setShowVolume(v => !v)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${showVolume ? 'bg-slate-600/30 border-slate-500 text-slate-300' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>
                            VOL
                        </button>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        {drawings.length > 0 && (
                            <button onClick={() => { setDrawings([]); const ctx = drawingCanvasRef.current?.getContext('2d'); ctx?.clearRect(0,0,9999,9999); }}
                                className="text-[10px] text-slate-500 hover:text-danger border border-slate-700 hover:border-danger/50 px-2 py-0.5 rounded transition">
                                Clear All
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Chart + Canvas overlay */}
            <div className="flex-1 relative min-h-0">
                <div ref={containerRef} className="w-full h-full" />
                <canvas
                    ref={drawingCanvasRef}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    style={{ position: 'absolute', inset: 0, cursor: toolCursor, pointerEvents: activeTool === 'crosshair' ? 'none' : 'all' }}
                />
            </div>
        </div>
    );
};

// Keep legacy alias for places that still render <RealtimeChart>
const RealtimeChart = ({ data, type = "candlestick", height, showVolume = false, showIndicators = false }) => (
    <ProChart data={data} compact={true} />
);



const OrderBook = ({ symbol, livePrice }) => {
    const [bids, setBids] = useState([]);
    const [asks, setAsks] = useState([]);
    useEffect(() => {
        if(!livePrice) return;
        const generate = () => {
            const newBids = [];
            const newAsks = [];
            let currentBid = livePrice - (livePrice * 0.0005);
            let currentAsk = livePrice + (livePrice * 0.0005);
            for(let i=0; i<5; i++) {
                newBids.push({ price: currentBid, qty: Math.floor(Math.random() * 500) + 10 });
                newAsks.push({ price: currentAsk, qty: Math.floor(Math.random() * 500) + 10 });
                currentBid -= (currentBid * 0.0002);
                currentAsk += (currentAsk * 0.0002);
            }
            setBids(newBids); setAsks(newAsks);
        };
        generate();
        const intv = setInterval(generate, 1500);
        return () => clearInterval(intv);
    }, [livePrice]);

    if(!livePrice) return null;
    return (
        <div className="bg-[#0f172a] rounded overflow-hidden border border-slate-800 text-xs w-48 shrink-0 flex flex-col h-full font-mono">
            <div className="bg-slate-900 px-3 py-1.5 font-bold border-b border-slate-800 text-slate-300 flex justify-between"><span>Price</span><span>Qty</span></div>
            <div className="flex-1 flex flex-col justify-between p-1.5">
                <div className="space-y-0.5 relative">
                    {asks.slice().reverse().map((a, i) => (
                        <div key={i} className="flex justify-between text-danger relative group h-5 items-center px-1">
                           <div className="absolute right-0 top-0 bottom-0 bg-danger/10" style={{width: `${(a.qty/500)*100}%`}}></div>
                           <span className="relative z-10">{a.price.toFixed(2)}</span>
                           <span className="relative z-10">{a.qty}</span>
                        </div>
                    ))}
                </div>
                <div className="py-1.5 text-center text-sm font-bold text-white border-y border-slate-800 my-1 bg-slate-900/50">
                    ₹{livePrice.toFixed(2)}
                </div>
                <div className="space-y-0.5 relative">
                    {bids.map((b, i) => (
                        <div key={i} className="flex justify-between text-success relative group h-5 items-center px-1">
                           <div className="absolute left-0 top-0 bottom-0 bg-success/10" style={{width: `${(b.qty/500)*100}%`}}></div>
                           <span className="relative z-10">{b.price.toFixed(2)}</span>
                           <span className="relative z-10">{b.qty}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// API Helper
const MUTUAL_FUNDS = ["PARAGPARIKH", "QUANTUM", "SBISMALL", "MIRAEASSET", "HDFCMIDCAP", "NIPPONIND", "AXISBLUECHIP", "SBIBLUECHIP", "ICICIPRU", "MOTILALOSWAL", "KOTAKSMALL", "UTINIFTY", "DSPMIDCAP", "FRANKLININD", "TATAELSS", "ABSLFRONTLINE", "PGIMINDIA", "CANARAROB", "SUNDARAM", "EDELWEISS", "INVESCO", "BANDHAN", "SAMCO", "QUANT", "NAVISMALL", "HSBC", "BARODA", "MAHINDRA", "UNION", "TAURUS", "NJ", "WHITEFR", "BANKOFI", "ITI", "SHRIRAM", "GROWW", "ZERODHA", "HELIOS", "TRUST", "OLD-BRIDGE", "PPFAS", "NAVI-F", "KOTAK-G", "SBI-G", "ICICI-G", "HDFC-G", "AXIS-G", "NIPPON-G", "UT-G", "DSP-G", "FRANK-G", "TATA-G", "ABSL-G", "PGIM-G", "CANARA-G", "SUN-G", "EDEL-G", "INV-G", "BAND-G", "SAM-G", "QUA-G", "HSBC-G", "BAR-G", "MAH-G", "UNI-G", "TAU-G", "REL-G", "L&T-G", "IDFC-G", "DHFL-G", "INDI-G", "JM-G", "SR-G", "BOI-G", "ESSEL-G", "MIR-G", "MOT-G", "PAR-G", "QUA-S", "SB-S"];
const CRYPTO_ASSETS = ["BTC_INR", "ETH_INR", "SOL_INR", "DOGE_INR", "PEPE_INR", "ADA_INR", "DOT_INR", "XRP_INR", "LINK_INR", "MATIC_INR", "SHIB_INR", "AVAX_INR", "UNI_INR", "LTC_INR", "BCH_INR", "ATOM_INR", "ALGO_INR", "XLM_INR", "VET_INR", "ICP_INR", "FIL_INR", "THETA_INR", "AAVE_INR", "EOS_INR", "XTZ_INR", "MKR_INR", "AXS_INR", "SAND_INR", "MANA_INR", "GALA_INR", "NEAR_INR", "FTM_INR", "GRT_INR", "LDO_INR", "APT_INR", "OP_INR", "ARB_INR", "RNDR_INR", "INJ_INR", "STX_INR", "IMX_INR", "TIA_INR", "SEI_INR", "SUI_INR", "KAS_INR", "ORDI_INR", "BEAM_INR", "FET_INR", "AGIX_INR", "OCEAN_INR", "FLOKI_INR", "BONK_INR", "WIF_INR", "BOME_INR", "MEW_INR", "TURBO_INR", "MOG_INR", "BRETT_INR", "SLERF_INR", "BOOK_INR", "POPCAT_INR", "MICHI_INR", "GUMMY_INR", "MANEKI_INR", "NOT_INR", "TON_INR", "TRX_INR", "HBAR_INR", "AKT_INR", "RENDER_INR", "JUP_INR", "PYTH_INR", "RAY_INR", "HNT_INR", "MOBILE_INR", "HONEY_INR", "JTO_INR", "BONK2_INR", "PEPE2_INR", "DOGE2_INR"];
const API_BASE = "";
const apiFetch = async (endpoint, method = "GET", body = null, token = null) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const options = { method, headers };
    if (body) {
        if (body instanceof URLSearchParams) {
            headers["Content-Type"] = "application/x-www-form-urlencoded";
            options.body = body;
        } else {
            options.body = JSON.stringify(body);
        }
    }
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        let errStr = "API Error";
        if (err.detail) {
            if (Array.isArray(err.detail)) errStr = err.detail.map(e => e.msg).join(", ");
            else errStr = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
        }
        throw new Error(errStr);
    }
    return res.json();
};

const AuthContext = createContext();

const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem("token"));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (token) {
            apiFetch("/auth/me", "GET", null, token)
                .then(u => { setUser(u); localStorage.setItem("token", token); })
                .catch(() => logout());
        }
        setLoading(false);
    }, [token]);

    const login = async (email, password) => {
        const body = new URLSearchParams();
        body.append('username', email);
        body.append('password', password);
        const data = await apiFetch("/auth/token", "POST", body);
        setToken(data.access_token);
    };

    const register = async (email, password) => {
        await apiFetch("/auth/register", "POST", { email, password });
        await login(email, password);
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem("token");
    };

    return (
        <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

const AuthScreen = () => {
    const { login, register } = useContext(AuthContext);
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        try {
            if (isLogin) await login(email, password);
            else await register(email, password);
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-darker">
            <div className="bg-dark p-8 rounded-xl shadow-2xl w-full max-w-md border border-slate-800">
                <h1 className="text-3xl font-bold mb-6 text-center text-primary">Trading</h1>
                <h2 className="text-xl mb-6 text-center text-slate-300">{isLogin ? "Welcome Back" : "Create Account"}</h2>
                {error && <div className="bg-danger/20 text-danger p-3 rounded mb-4 text-sm">{error}</div>}
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Email</label>
                        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
                            className="w-full bg-slate-900 border border-slate-700 rounded px-4 py-2 text-white focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Password</label>
                        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required
                            className="w-full bg-slate-900 border border-slate-700 rounded px-4 py-2 text-white focus:outline-none focus:border-primary" />
                    </div>
                    <button type="submit" className="w-full bg-primary hover:bg-blue-600 text-white font-semibold py-2 rounded transition">
                        {isLogin ? "Sign In" : "Sign Up"}
                    </button>
                </form>
                <div className="mt-6 text-center text-sm text-slate-400">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button onClick={() => setIsLogin(!isLogin)} className="text-primary ml-2 hover:underline">
                        {isLogin ? "Sign up" : "Sign in"}
                    </button>
                </div>
            </div>
        </div>
    );
};

const SentinelInsightSidebar = ({ isOpen, onClose, biasData, whaleAlerts, news }) => {
    if (!isOpen) return null;
    return (
        <aside className="w-80 border-l border-slate-800 bg-slate-950 flex flex-col shrink-0 animate-in slide-in-from-right-4 duration-300 z-40 relative">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                    <h3 className="font-black text-xs tracking-widest text-slate-300 uppercase italic">SENTINEL-AI Insight</h3>
                </div>
                <button onClick={onClose} className="text-slate-500 hover:text-white transition">
                    <i data-lucide="x" className="w-4 h-4"></i>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Bias Shield Gauge */}
                <div className="p-5 border-b border-white/5 bg-gradient-to-br from-slate-950 to-slate-900">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Behavioral Bias Shield</span>
                        <div className={`p-1 rounded bg-black/40 border ${biasData.tilt_detected ? 'border-danger/30 text-danger' : 'border-success/30 text-success'}`}>
                             <i data-lucide={biasData.tilt_detected ? "flame" : "shield-check"} className="w-3.5 h-3.5"></i>
                        </div>
                    </div>
                    
                    <div className="relative h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-3">
                        <div 
                            className={`h-full transition-all duration-1000 ${biasData.score > 0.7 ? 'bg-success' : biasData.score > 0.4 ? 'bg-yellow-500' : 'bg-danger'}`}
                            style={{ width: `${(biasData.score || 0) * 100}%`, boxShadow: '0 0 10px currentColor' }}
                        ></div>
                    </div>

                    <div className="flex justify-between items-end">
                        <div>
                            <div className="text-xs font-black text-white italic uppercase tracking-tighter">Status: {biasData.recommendation}</div>
                            <div className="text-[9px] text-slate-500 font-medium">Internal Tilt Score: {biasData.score.toFixed(2)}</div>
                        </div>
                        <div className="text-right">
                             <div className="text-[8px] text-slate-500 uppercase font-black">Stability</div>
                             <div className="text-xl font-black text-slate-100 tabular-nums">{(biasData.score * 100).toFixed(0)}<span className="text-[10px] text-slate-600">%</span></div>
                        </div>
                    </div>
                </div>

                {/* Whale Alerts Section */}
                <div className="p-4 border-b border-white/5">
                    <div className="flex items-center gap-2 mb-4">
                        <i data-lucide="waves" className="w-3 h-3 text-cyan-400"></i>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Institutional Whales</span>
                    </div>
                    <div className="space-y-3">
                        {whaleAlerts.length === 0 ? (
                            <div className="text-[10px] text-slate-600 italic py-4 text-center">Scanning depth for block trades...</div>
                        ) : (
                            whaleAlerts.slice().reverse().map((w, idx) => (
                                <div key={idx} className="bg-slate-900/40 border border-white/5 p-3 rounded-xl animate-in fade-in slide-in-from-right-2">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-xs font-black text-slate-200">{w.symbol}</span>
                                        <span className={`text-[9px] font-black italic px-1 rounded ${w.side === 'BUY' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>{w.side} BLOCK</span>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <div className="text-[10px] text-slate-400 font-mono italic">₹{(w.value / 100000).toFixed(1)}L Entry</div>
                                        <div className="text-[8px] text-slate-600 uppercase font-bold">{new Date(w.timestamp * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Tactical Wire Feed */}
                <div className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                        <i data-lucide="radio" className="w-3 h-3 text-primary animate-pulse"></i>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tactical Wire Feed</span>
                    </div>
                    <div className="space-y-4">
                        {news.slice(0, 8).map(item => (
                            <div key={item.id} className="relative pl-3 border-l-2 border-slate-800 hover:border-primary/50 transition-colors py-1">
                                <div className="text-[10px] text-slate-500 font-black flex items-center gap-2 mb-1">
                                    {item.source} 
                                    <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                                    <span className={item.sentiment === 'BULLISH' ? 'text-success' : item.sentiment === 'BEARISH' ? 'text-danger' : 'text-slate-400'}>{item.sentiment}</span>
                                </div>
                                <div className="text-xs text-slate-300 font-medium leading-relaxed">{item.headline}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </aside>
    );
};

const NewsTicker = ({ news }) => {
    if(!news || news.length === 0) return (
         <div className="bg-slate-950 border-b border-white/5 h-8 flex items-center px-4 overflow-hidden shrink-0">
             <div className="flex gap-4 items-center">
                 <div className="w-2 h-2 rounded-full bg-slate-700 animate-pulse"></div>
                 <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase italic">Sentinel AI-Broadband: Synchronizing Real-Time Institutional News Wire...</span>
             </div>
         </div>
    );
    return (
        <div className="bg-slate-950 border-b border-white/5 py-1 px-4 overflow-hidden relative h-8 flex items-center shrink-0 group">
            <div className="flex gap-16 whitespace-nowrap animate-marquee">
                {[...news, ...news].map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className="flex items-center gap-3 text-[10px] md:text-[11px]">
                        <span className="text-primary font-black opacity-80 letter-spacing-1">[{item.source}]</span>
                        <span className="text-slate-200 font-medium">{item.headline}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${item.sentiment === 'BULLISH' ? 'bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)]' : item.sentiment === 'BEARISH' ? 'bg-danger shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-slate-500'}`}></div>
                        <span className={`font-black tracking-tighter ${item.sentiment === 'BULLISH' ? 'text-success' : item.sentiment === 'BEARISH' ? 'text-danger' : 'text-slate-400'}`}>
                            {item.sentiment} {item.score > 0 ? '+' : ''}{(item.score * 100).toFixed(0)}%
                        </span>
                    </div>
                ))}
            </div>
            <style>{`
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee {
                    display: inline-flex;
                    animation: marquee 60s linear infinite;
                }
                .group:hover .animate-marquee {
                    animation-play-state: paused;
                }
            `}</style>
        </div>
    );
};

// --- Main Application ---
const Dashboard = () => {
    const { user, token, logout } = useContext(AuthContext);
    const [livePrices, setLivePrices] = useState({});
    const [priceHistory, setPriceHistory] = useState({});
    const [portfolioHistory, setPortfolioHistory] = useState([]);
    const [userStats, setUserStats] = useState({ pnl: 0, pnlPerc: 0 });
    const [watchlist, setWatchlist] = useState([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setIsSidebarOpen(false);
    };
    
    // Auto-fetch helper
    const [newsFeed, setNewsFeed] = useState([
        { headline: "[Neutral] Market opens with steady volume.", sentiment: "Neutral" }
    ]);
    const [wallet, setWallet] = useState({ balance: 0 });
    const [portfolio, setPortfolio] = useState([]);
    const [orders, setOrders] = useState([]);
    const [activeTab, setActiveTab] = useState('market');
    const [notifications, setNotifications] = useState([]);
    const [tradeTape, setTradeTape] = useState([]);
    const [whaleAlerts, setWhaleAlerts] = useState([]);
    const [aiNews, setAiNews] = useState([]);
    const [showTape, setShowTape] = useState(false);
    const [showSentinel, setShowSentinel] = useState(false);
    const [biasData, setBiasData] = useState({ score: 0.8, recommendation: 'FOCUSED', tilt_detected: false });
    const ws = useRef(null);

    // Sonic Trading Initialization
    useEffect(() => {
        window.playSonicCue = (freq) => {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                gain.gain.setValueAtTime(0.05, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.5);
            } catch(e) {}
        };
    }, []);

    const loadData = async () => {
        try {
            const w = await apiFetch("/payments/wallet", "GET", null, token);
            setWallet(w);
            const p = await apiFetch("/trade/portfolio", "GET", null, token);
            setPortfolio(p);
            const wl = await apiFetch("/trade/watchlist", "GET", null, token);
            setWatchlist(wl);
            const ord = await apiFetch("/trade/orders", "GET", null, token);
            setOrders(ord);
            const s = await apiFetch("/ws/stocks/current", "GET"); // Assuming similar to REST
            if(s) setLivePrices(s);
        } catch (e) { console.error(e); }
    };

    const fetchBias = async () => {
        try {
            const data = await apiFetch("/trade/psychology/bias", "GET", null, token);
            if (data) setBiasData(data);
        } catch(e) {}
    };

    useEffect(() => {
        if (user) {
            fetchBias();
            const inv = setInterval(fetchBias, 15000);
            return () => clearInterval(inv);
        }
    }, [user, activeTab]);

    useEffect(() => {
        loadData();
        
        // Initialize WebSocket
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws.current = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
        ws.current.onopen = () => {
            console.log("WS Connected");
            ws.current.send(JSON.stringify({ type: "authenticate", email: user.email }));
        };
        ws.current.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === "stock_price_update") {
                setLivePrices(prev => ({ ...prev, ...msg.data }));
                setPriceHistory(prev => {
                    const newHist = { ...prev };
                    const nowSec = Math.floor(Date.now() / 1000);
                    for (const symbol in msg.candles) {
                        if (!newHist[symbol]) newHist[symbol] = [];
                        const candle = msg.candles[symbol];
                        const newCandle = {
                            time: nowSec,
                            open: candle.open,
                            high: candle.high,
                            low: candle.low,
                            close: candle.close,
                            value: candle.close,
                            volume: candle.volume
                        };
                        const lst = newHist[symbol];
                        if (lst.length > 0 && lst[lst.length - 1].time === nowSec) {
                            lst[lst.length - 1] = newCandle;
                        } else {
                            lst.push(newCandle);
                        }
                        if (lst.length > 300) lst.shift();
                    }
                    return newHist;
                });
            } else if (msg.type === "news_update") {
                setAiNews(prev => [msg.data, ...prev].slice(0, 20));
            } else if (msg.type === "ai_news_flash") {
                setAiNews(prev => [msg.data, ...prev].slice(0, 20));
            } else if (msg.type === "trade_tape_batch") {
                if (msg.data) setTradeTape(prev => [...msg.data, ...prev].slice(0, 200));
            } else if (msg.type === "sentiment_post") {
                window.dispatchEvent(new CustomEvent('ws_sentiment', { detail: msg.data }));
            } else if (msg.type === "wallet_updated") {
                setWallet(prev => ({ ...prev, balance: msg.data.balance }));
                addNotification(`Wallet funded: ₹${msg.data.amount_added}`);
            } else if (msg.type === "order_pending") {
                addNotification(`Order placed: ${msg.data.symbol}. Executing in 30s...`);
                apiFetch("/trade/orders", "GET", null, token).then(setOrders);
            } else if (msg.type === "order_failed") {
                addNotification(`Order Failed: ${msg.data.symbol} (${msg.data.reason})`);
                apiFetch("/trade/orders", "GET", null, token).then(setOrders);
            } else if (msg.type === "trade_executed") {
                setWallet(prev => ({ ...prev, balance: msg.data.wallet_balance }));
                addNotification(`${msg.data.side} order executed for ${msg.data.symbol}`);
                apiFetch("/trade/portfolio", "GET", null, token).then(setPortfolio);
                apiFetch("/trade/orders", "GET", null, token).then(setOrders);
            } else if (msg.type === "bot_trade_executed") {
                setWallet(prev => ({ ...prev, balance: msg.data.wallet_balance }));
                addNotification(`🤖 Bot auto-invested ${msg.data.quantity} ${msg.data.symbol} @ ₹${msg.data.price}`);
                apiFetch("/trade/portfolio", "GET", null, token).then(setPortfolio);
                apiFetch("/trade/orders", "GET", null, token).then(setOrders);
            } else if (msg.type === "achievement_unlocked") {
                addNotification(`🏆 BADGE UNLOCKED: ${msg.data.badge} - ${msg.data.desc}`);
            } else if (msg.type === "price_alert") {
                addNotification(`🚨 PRICE ALERT: ${msg.data.symbol} is ${msg.data.direction} ₹${msg.data.target} (Current: ₹${msg.data.current.toFixed(2)})`);
            } else if (msg.type === "options_settled") {
                addNotification(`⚡ CONTRACT EVENT: ${msg.data.message}`);
                apiFetch("/trade/portfolio", "GET", null, token).then(setPortfolio);
                apiFetch("/trade/orders", "GET", null, token).then(setOrders);
            } else if (msg.type === "trade_signal") {
                const dir = msg.data.direction === "Bullish" ? "🟢" : "🔴";
                addNotification(`🧠 AI SIGNAL: ${dir} ${msg.data.symbol} - ${msg.data.pattern} (${msg.data.confidence}% conf)`);
            } else if (msg.type === "whale_alert") {
                setWhaleAlerts(prev => [...prev, msg.data].slice(-10));
                if (window.playSonicCue) window.playSonicCue(150);
            }
        };
        return () => ws.current.close();
    }, []);

    useEffect(() => {
        if (!portfolio || portfolio.length === 0) return;
        let totalCurrent = 0;
        let totalInvested = 0;
        portfolio.forEach(item => {
            const currentP = livePrices[item.symbol] || item.avg_price;
            totalCurrent += currentP * item.quantity;
            totalInvested += item.avg_price * item.quantity;
        });
        const nowSec = Math.floor(Date.now() / 1000);
        setPortfolioHistory(prev => {
            const lst = [...prev];
            if (lst.length > 0 && lst[lst.length - 1].time === nowSec) {
                lst[lst.length - 1] = { time: nowSec, value: totalCurrent };
            } else {
                lst.push({ time: nowSec, value: totalCurrent });
            }
            return lst.slice(-100);
        });
        
        const pnl = totalCurrent - totalInvested;
        const pnlPerc = totalInvested ? (pnl / totalInvested) * 100 : 0;
        setUserStats({ pnl, pnlPerc });
    }, [livePrices, portfolio]);

    useEffect(() => {
        // Redraw Lucide icons whenever tab changes
        if (window.lucide) window.lucide.createIcons();
    }, [activeTab]);

    const addNotification = (msg) => {
        const id = Date.now() + Math.random();
        setNotifications(prev => [{id, msg}, ...prev].slice(0, 5));
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 6000);
    };

    const handleCommandAction = (action, payload) => {
        if (!action) return;
        
        switch(action) {
            case 'SWITCH_TAB':
                setActiveTab(payload.tab);
                addNotification(`🚀 Copilot: Navigated to ${payload.tab.replace('_', ' ')}`);
                break;
            case 'PREFILL_ORDER':
                addNotification(`🤖 Copilot: Pre-filled ${payload.side} order for ${payload.quantity} ${payload.symbol}`);
                // In a real app, this could open the trade modal or set state
                break;
            case 'SWITCH_CHART':
                addNotification(`📊 Copilot: Switching focus to ${payload.symbol}`);
                // Potentially update a 'selectedSymbol' state if shared
                break;
            case 'BLINK_BIAS_SHIELD':
                addNotification(`🦾 Copilot: Behavioral Bias Scan Complete - Status GREEN`);
                break;
            default:
                addNotification(`🦾 Copilot: Executed ${action}`);
        }
    };

    return (
        <div className="h-screen flex bg-darker text-slate-200 overflow-hidden relative w-full">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity" onClick={() => setIsSidebarOpen(false)}></div>}
            
            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-dark border-r border-slate-800 p-4 flex flex-col shrink-0 h-full overflow-y-auto transform transition-transform duration-300 ease-in-out md:relative md:w-64 md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-2xl font-bold text-primary flex items-center">
                        <i data-lucide="activity" className="mr-2"></i> Trading
                    </h1>
                    <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white p-2">
                        <i data-lucide="x" className="w-6 h-6"></i>
                    </button>
                </div>
                
                <nav className="flex-1 space-y-1 overflow-y-auto pb-4 custom-scrollbar">
                    <button onClick={() => handleTabChange('market')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='market' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="trending-up" className="mr-3"></i> Market
                    </button>
                    <button onClick={() => handleTabChange('mutual_funds')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='mutual_funds' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="landmark" className="mr-3"></i> Mutual Funds
                    </button>
                    <button onClick={() => handleTabChange('crypto')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='crypto' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="bitcoin" className="mr-3"></i> Crypto
                    </button>
                    <button onClick={() => handleTabChange('bots')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='bots' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="cpu" className="mr-3"></i> Auto-DCA Bots
                    </button>
                    <button onClick={() => handleTabChange('leaderboard')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='leaderboard' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="trophy" className="mr-3"></i> Leaderboard
                    </button>
                    <button onClick={() => handleTabChange('profile')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='profile' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="user" className="mr-3"></i> Trader Profile
                    </button>
                    <button onClick={() => handleTabChange('alerts')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='alerts' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="bell" className="mr-3"></i> Price Alerts
                    </button>
                    <button onClick={() => handleTabChange('derivatives')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='derivatives' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="zap" className="mr-3"></i> Options & Futures
                    </button>
                    <button onClick={() => handleTabChange('watchlist')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='watchlist' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="star" className="mr-3"></i> Watchlist
                    </button>
                    <button onClick={() => handleTabChange('portfolio')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='portfolio' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="pie-chart" className="mr-3"></i> Portfolio
                    </button>
                    <button onClick={() => handleTabChange('orders')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='orders' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="list" className="mr-3"></i> Orders
                    </button>
                    
                    <div className="pt-4 mt-2 border-t border-slate-800">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider pl-3 mb-2 block">Advanced Pro Features</span>
                        <button onClick={() => handleTabChange('pro_terminal')} className={`w-full flex items-center p-3 rounded-lg text-left transition font-bold shadow-lg ${activeTab==='pro_terminal' ? 'bg-primary/20 text-white border border-primary/50' : 'bg-slate-900 border border-slate-800 text-primary hover:bg-slate-800'}`}>
                            <i data-lucide="layout-grid" className="mr-3 text-primary"></i> PRO Terminal
                        </button>
                        <button onClick={() => handleTabChange('broker')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='broker' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                            <i data-lucide="briefcase" className="mr-3 text-slate-400"></i> Broker Dashboard
                        </button>
                        <button onClick={() => handleTabChange('heatmap')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='heatmap' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                            <i data-lucide="map" className="mr-3 text-blue-400"></i> Sector Heatmap
                        </button>
                        <button onClick={() => handleTabChange('global_markets')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='global_markets' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                            <i data-lucide="globe" className="mr-3 text-cyan-400"></i> Global Markets
                        </button>
                        <button onClick={() => handleTabChange('options_chain')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='options_chain' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                            <i data-lucide="network" className="mr-3 text-amber-400"></i> Options Chain
                        </button>
                        <button onClick={() => handleTabChange('options_oi')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='options_oi' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                            <i data-lucide="layers" className="mr-3 text-violet-400"></i> OI & Max Pain
                        </button>
                        <button onClick={() => handleTabChange('sentiment')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='sentiment' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                            <i data-lucide="message-circle" className="mr-3 text-pink-400"></i> Sentiment Feed
                        </button>
                        <button onClick={() => handleTabChange('strategy')} className={`w-full flex items-center p-3 rounded-lg text-left transition font-bold ${activeTab==='strategy' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-slate-900/60 border border-slate-800 text-purple-400 hover:bg-slate-800'}`}>
                            <i data-lucide="cpu" className="mr-3 text-purple-400"></i> Strategy Builder
                        </button>
                        <button onClick={() => handleTabChange('sandbox')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='sandbox' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                            <i data-lucide="flask-conical" className="mr-3 text-purple-400"></i> Quant Sandbox
                        </button>
                        <button onClick={() => handleTabChange('calendar')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='calendar' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                            <i data-lucide="calendar" className="mr-3 text-red-400"></i> Macro Calendar
                        </button>
                        <button onClick={() => handleTabChange('otc')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='otc' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                            <i data-lucide="briefcase" className="mr-3 text-slate-400"></i> OTC Dark Pool
                        </button>
                        <button onClick={() => handleTabChange('ipo')} className={`w-full flex items-center p-3 rounded-lg text-left transition font-bold border ${activeTab==='ipo' ? 'bg-slate-800/80 text-white border-yellow-500/50' : 'bg-dark border-dashed border-slate-700 text-yellow-500/80 hover:border-yellow-500/50'}`}>
                            <i data-lucide="rocket" className="mr-3 text-yellow-500"></i> IPO Center
                        </button>
                        <button onClick={() => setShowTape(p => !p)} className={`w-full flex items-center p-3 rounded-lg text-left transition ${showTape ? 'bg-success/10 text-success border border-success/30' : 'hover:bg-slate-800 text-slate-400'}`}>
                            <i data-lucide="scroll" className="mr-3"></i>
                            <span>Trade Tape</span>
                            {showTape && <span className="ml-auto text-[10px] bg-success text-white px-1.5 py-0.5 rounded font-bold">ON</span>}
                        </button>
                    </div>
                    <button onClick={() => handleTabChange('wallet')} className={`w-full flex items-center p-3 rounded-lg text-left transition ${activeTab==='wallet' ? 'bg-primary/10 text-primary' : 'hover:bg-slate-800'}`}>
                        <i data-lucide="wallet" className="mr-3"></i> Wallet (₹{wallet.balance.toFixed(2)})
                    </button>
                </nav>

                <div className="pt-4 border-t border-slate-800 mt-auto">
                    <div className="text-sm text-slate-400 mb-4 truncate font-medium">{user.email}</div>
                    <button onClick={logout} className="flex items-center justify-center text-danger hover:bg-danger/10 hover:text-red-400 bg-slate-900 rounded font-bold transition w-full p-3">
                        <i data-lucide="log-out" className="mr-2 w-4 h-4"></i> Logout
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
                <NewsTicker news={aiNews} />
                <header className="min-h-[56px] md:h-16 border-b border-slate-800 bg-dark flex items-center px-4 md:px-6 shrink-0 relative z-30 justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-slate-400 hover:text-white p-1 focus:outline-none">
                            <i data-lucide="menu" className="w-6 h-6"></i>
                        </button>
                        <h2 className="text-lg md:text-xl font-semibold capitalize whitespace-nowrap w-24 sm:w-auto overflow-hidden text-ellipsis">{activeTab.replace('_', ' ')}</h2>
                    </div>
                    
                    {/* News Ticker Bar */}
                    {newsFeed.length > 0 && (
                        <div className="flex-1 max-w-full md:mx-4 bg-slate-900 border border-slate-700/50 rounded-full py-1.5 px-3 md:px-4 overflow-hidden flex items-center gap-2 md:gap-4 shadow-inner min-w-0 absolute top-[60px] left-4 right-4 sm:relative sm:top-0 sm:left-0 sm:right-0 z-20">
                            <i data-lucide="radio" className="text-danger animate-pulse w-3 h-3 md:w-4 md:h-4 shrink-0"></i>
                            <div className="flex-1 overflow-hidden relative h-4 md:h-5">
                                <div className="absolute whitespace-nowrap text-[11px] md:text-sm flex gap-8 md:gap-12 font-medium" style={{ animation: "marquee 25s linear infinite" }}>
                                    {newsFeed.map((news, i) => (
                                        <span key={i} className={news.sentiment === 'Bullish' ? 'text-success' : news.sentiment === 'Bearish' ? 'text-danger' : 'text-slate-300'}>
                                            {news.headline}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center shrink-0 ml-auto gap-3">
                        <ThemeSwitcher />
                        <div className="bg-slate-900 rounded-full px-3 py-1.5 md:px-4 md:py-1.5 border border-slate-700 font-mono text-xs md:text-sm whitespace-nowrap flex items-center gap-2 text-primary">
                            <i data-lucide="wallet" className="w-3.5 h-3.5 md:w-4 md:h-4 hidden sm:block"></i> ₹{(wallet.balance || 0).toFixed(2)}
                        </div>
                        <button onClick={() => setShowSentinel(!showSentinel)} 
                            className={`p-2 rounded-lg border transition ${showSentinel ? 'bg-primary/20 border-primary text-primary' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'}`}>
                            <i data-lucide="shield-check" className="w-5 h-5"></i>
                        </button>
                    </div>
                </header>
                
                <div className="flex-1 flex overflow-hidden relative">
                    <main className={`flex-1 overflow-y-auto p-3 md:p-6 bg-darker ${newsFeed.length > 0 ? 'pt-14 sm:pt-4 md:pt-6' : ''}`}>
                        {activeTab === 'market' && <MarketTab livePrices={livePrices} priceHistory={priceHistory} token={token} onRefresh={loadData} filterType="STOCKS" />}
                        {activeTab === 'mutual_funds' && <MarketTab livePrices={livePrices} priceHistory={priceHistory} token={token} onRefresh={loadData} filterType="MUTUAL_FUNDS" />}
                        {activeTab === 'crypto' && <MarketTab livePrices={livePrices} priceHistory={priceHistory} token={token} onRefresh={loadData} filterType="CRYPTO" />}
                        {activeTab === 'bots' && <BotsTab livePrices={livePrices} token={token} />}
                        {activeTab === 'leaderboard' && <LeaderboardTab userStats={userStats} userEmail={user.email} token={token} />}
                        {activeTab === 'profile' && <ProfileTab user={user} token={token} />}
                        {activeTab === 'alerts' && <AlertsTab token={token} />}
                        {activeTab === 'derivatives' && <DerivativesTab token={token} livePrices={livePrices} />}
                        {activeTab === 'watchlist' && <WatchlistTab watchlist={watchlist} livePrices={livePrices} priceHistory={priceHistory} token={token} onRefresh={loadData} />}
                        {activeTab === 'portfolio' && (
                            <>
                                <RiskPanel token={token} />
                                <PortfolioTab portfolio={portfolio} livePrices={livePrices} token={token} portfolioHistory={portfolioHistory} />
                            </>
                        )}
                        {activeTab === 'orders' && <OrdersTab orders={orders} onRefresh={loadData} token={token} />}
                        {activeTab === 'pro_terminal' && <ProTerminalTab livePrices={livePrices} priceHistory={priceHistory} orders={orders} />}
                        {activeTab === 'broker' && <BrokerDashboardTab token={token} />}
                        {activeTab === 'heatmap' && <HeatmapTab livePrices={livePrices} priceHistory={priceHistory} />}
                        {activeTab === 'global_markets' && <GlobalMarketTab />}
                        {activeTab === 'options_chain' && <OptionsChainTab token={token} livePrices={livePrices} />}
                        {activeTab === 'options_oi' && <OptionsOITab token={token} livePrices={livePrices} />}
                        {activeTab === 'sentiment' && <SentimentTab token={token} livePrices={livePrices} />}
                        {activeTab === 'strategy' && <StrategyBuilderTab token={token} livePrices={livePrices} priceHistory={priceHistory} />}
                        {activeTab === 'sandbox' && <SandboxTab livePrices={livePrices} priceHistory={priceHistory} token={token} />}
                        {activeTab === 'calendar' && <CalendarTab />}
                        {activeTab === 'otc' && <OTCTab token={token} wallet={wallet} />}
                        {activeTab === 'ipo' && <IPOTab wallet={wallet} token={token} />}
                        {activeTab === 'wallet' && <WalletTab balance={wallet.balance} token={token} />}
                    </main>

                    {/* Sentinel Insight Sidebar */}
                    <SentinelInsightSidebar 
                        isOpen={showSentinel} 
                        onClose={() => setShowSentinel(false)}
                        biasData={biasData}
                        whaleAlerts={whaleAlerts}
                        news={aiNews}
                    />

                    {/* Trade Tape Side Panel */}
                    {showTape && (
                        <div className="w-52 shrink-0 hidden lg:flex flex-col h-full">
                            <TradeTapePanel tape={tradeTape} />
                        </div>
                    )}
                </div>

                {/* Notifications Toast */}
                {notifications.length > 0 && (
                    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
                        {notifications.map((n) => (
                            <div key={n.id} className="bg-slate-800 border-l-4 border-primary p-4 rounded shadow-2xl text-sm text-white animate-fade-in transition-all translate-y-0 opacity-100">
                                {n.msg}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            <WhaleTrackerAlerts alerts={whaleAlerts} />
            <CopilotOrb token={token} onCommandAction={handleCommandAction} />
        </div>
    );
};

// --- Tabs ---

const MarketTab = ({ livePrices, priceHistory, token, onRefresh, filterType = "STOCKS" }) => {
    const [selectedStock, setSelectedStock] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [orderType, setOrderType] = useState("MARKET");
    const [limitPrice, setLimitPrice] = useState("");
    const [error, setError] = useState("");
    const [aiAnalysis, setAiAnalysis] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [stopLoss, setStopLoss] = useState("");
    const [takeProfit, setTakeProfit] = useState("");
    const [trailingStop, setTrailingStop] = useState(false);
    const [showVolume, setShowVolume] = useState(true);
    const [showIndicators, setShowIndicators] = useState(false);

    // Reset state when modal closes
    useEffect(() => { if (!selectedStock) { setAiAnalysis(""); setStopLoss(""); setTakeProfit(""); setTrailingStop(false); } }, [selectedStock]);

    const handleAnalyze = async () => {
        setIsAnalyzing(true); setAiAnalysis("");
        try {
            const data = await apiFetch(`/trade/analyze/${selectedStock}`, "GET", null, token);
            setAiAnalysis(data.analysis);
        } catch (err) { setAiAnalysis("AI Analysis failed. Try again."); }
        setIsAnalyzing(false);
    };

    const handleTrade = async (side) => {
        if (!selectedStock) return;
        setError("");
        try {
            const body = { symbol: selectedStock, order_type: orderType, side: side, quantity: parseInt(quantity) };
            if (orderType === "LIMIT") {
                body.price = parseFloat(limitPrice);
                if (!body.price || isNaN(body.price) || body.price <= 0) throw new Error("Valid limit price required");
            }
            if (stopLoss) body.stop_loss_price = parseFloat(stopLoss);
            if (takeProfit) body.take_profit_price = parseFloat(takeProfit);
            if (trailingStop) body.trailing_stop_active = true;
            await apiFetch("/trade/order", "POST", body, token);
            setSelectedStock(null);
        } catch (err) { setError(err.message); }
    };
    
    const filteredPrices = Object.entries(livePrices).filter(([sym]) => {
        if (filterType === "MUTUAL_FUNDS") return MUTUAL_FUNDS.includes(sym);
        if (filterType === "CRYPTO") return CRYPTO_ASSETS.includes(sym);
        return !MUTUAL_FUNDS.includes(sym) && !CRYPTO_ASSETS.includes(sym);
    });

    // Track previous prices for flash animation
    const prevPricesRef = useRef({});
    const [flashMap, setFlashMap] = useState({});

    useEffect(() => {
        const newFlash = {};
        filteredPrices.forEach(([sym, price]) => {
            const prev = prevPricesRef.current[sym];
            if (prev !== undefined && prev !== price) {
                newFlash[sym] = price > prev ? 'up' : 'down';
            }
        });
        if (Object.keys(newFlash).length > 0) {
            setFlashMap(prev => ({ ...prev, ...newFlash }));
            setTimeout(() => setFlashMap({}), 800);
        }
        filteredPrices.forEach(([sym, price]) => { prevPricesRef.current[sym] = price; });
    }, [livePrices]);

    return (
        <div>
             <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                 <i data-lucide={filterType === "MUTUAL_FUNDS" ? "landmark" : filterType === "CRYPTO" ? "bitcoin" : "activity"} className="w-6 h-6 text-primary"></i> 
                 {filterType === "MUTUAL_FUNDS" ? "Mutual Funds Explorer" : filterType === "CRYPTO" ? "Crypto Exchange" : "Equity Market"}
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredPrices.map(([symbol, price]) => {
                    const hist = priceHistory[symbol] || [];
                    const firstPrice = hist.length >= 2 ? hist[0].close : price;
                    const pctChange = firstPrice ? ((price - firstPrice) / firstPrice * 100) : 0;
                    const flash = flashMap[symbol];
                    return (
                    <div key={symbol} onClick={() => setSelectedStock(symbol)} 
                         className={`bg-dark p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between h-44 group ${
                             flash === 'up' ? 'border-success/80 bg-success/5' :
                             flash === 'down' ? 'border-danger/80 bg-danger/5' :
                             'border-slate-800 hover:border-primary'
                         }`}
                         style={{ transition: 'border-color 0.3s, background-color 0.3s' }}>
                        <div className="flex justify-between items-start pointer-events-auto">
                            <h3 className="font-bold text-lg group-hover:text-primary transition">{symbol}</h3>
                            <button onClick={(e) => { e.stopPropagation(); apiFetch("/trade/watchlist", "POST", { symbol }, token).then(onRefresh).catch(err=>alert(err.message)); }} className="text-slate-500 hover:text-yellow-400 p-1 tooltip" title="Add to Watchlist">
                                <i data-lucide="star" className="w-4 h-4"></i>
                            </button>
                        </div>
                        
                        <div className="h-16 w-full pointer-events-none">
                            <ProChart data={hist} compact={true} />
                        </div>

                        <div className="flex justify-between items-end mt-auto pt-1">
                            <div className={`text-xl font-mono font-bold transition-colors ${
                                flash === 'up' ? 'text-success' : flash === 'down' ? 'text-danger' : 'text-white'
                            }`}>₹{price.toFixed(2)}</div>
                            <div className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                pctChange >= 0 ? 'text-success bg-success/10' : 'text-danger bg-danger/10'
                            }`}>{pctChange >= 0 ? '+' : ''}{pctChange.toFixed(2)}%</div>
                        </div>
                    </div>);
                })}
            </div>

            {/* Trade Modal */}
            {selectedStock && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-0 md:p-4 transition-all">
                    <div className="bg-dark p-4 md:p-6 rounded-t-2xl md:rounded-xl w-full max-w-2xl border-t md:border border-slate-700 shadow-2xl max-h-[92vh] md:max-h-[95vh] overflow-y-auto custom-scrollbar mt-auto md:mt-0">
                        <div className="flex justify-between items-start mb-4 border-b border-slate-800 pb-3">
                            <div>
                                <h2 className="text-xl md:text-2xl font-bold">{selectedStock}</h2>
                                <div className="text-2xl md:text-3xl font-mono text-primary mt-1">₹{(livePrices[selectedStock] || 0).toFixed(2)}</div>
                            </div>
                            <button onClick={()=>setSelectedStock(null)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full w-8 h-8 flex items-center justify-center transition focus:outline-none">&times;</button>
                        </div>
                        
                        <div className="flex flex-col md:flex-row gap-4 mb-6">
                            <div className="flex-1 relative border border-slate-800 rounded bg-[#0f172a]/50 overflow-hidden" style={{height: '14rem'}}>
                                <ProChart 
                                    data={priceHistory[selectedStock] || []} 
                                    symbol={selectedStock} 
                                    compact={false} 
                                    brackets={{
                                        stopLoss: parseFloat(stopLoss) || 0,
                                        takeProfit: parseFloat(takeProfit) || 0,
                                        entry: orderType === 'LIMIT' ? parseFloat(limitPrice) : (livePrices[selectedStock] || 0)
                                    }}
                                />
                            </div>
                            <div className="h-56 w-full md:w-48 shrink-0">
                                <OrderBook symbol={selectedStock} livePrice={livePrices[selectedStock]} />
                            </div>
                        </div>

                        {error && <div className="text-danger text-sm mb-4 bg-danger/10 p-3 rounded">{error}</div>}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-slate-400 block mb-2">Order Type</label>
                                <div className="flex bg-slate-800 rounded overflow-hidden">
                                    <button onClick={()=>setOrderType("MARKET")} className={`flex-1 py-2 text-sm font-bold ${orderType==='MARKET' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}>MARKET</button>
                                    <button onClick={()=>setOrderType("LIMIT")} className={`flex-1 py-2 text-sm font-bold ${orderType==='LIMIT' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}>LIMIT</button>
                                </div>
                            </div>
                            
                            {orderType === "LIMIT" && (
                                <div>
                                    <label className="text-sm text-slate-400 block mb-2">Limit Price (₹)</label>
                                    <input type="number" min="0.01" step="0.01" value={limitPrice} onChange={e=>setLimitPrice(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-4 py-3 text-white focus:outline-none focus:border-primary text-lg" />
                                </div>
                            )}

                            {aiAnalysis ? (
                                <div className="bg-slate-900 border border-primary/30 p-4 rounded text-sm text-slate-300 relative">
                                    <div className="absolute -top-3 right-4 bg-primary px-2 py-0.5 text-xs text-white rounded font-bold flex items-center gap-1"><i data-lucide="sparkles" className="w-3 h-3"></i> AI INSIGHT</div>
                                    <p className="leading-relaxed whitespace-pre-wrap">{aiAnalysis}</p>
                                </div>
                            ) : (
                                <button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded py-3 text-primary font-bold text-sm transition flex justify-center items-center gap-2">
                                    {isAnalyzing ? <i data-lucide="loader" className="animate-spin w-4 h-4"></i> : <i data-lucide="sparkles" className="w-4 h-4"></i>}
                                    {isAnalyzing ? "AI is analyzing..." : "Get AI Analysis"}
                                </button>
                            )}
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-slate-400 block mb-2">Quantity</label>
                                    <input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-4 py-3 text-white focus:outline-none focus:border-primary text-lg" />
                                </div>
                                <div className="flex flex-col justify-end">
                                    <label className="text-xs text-slate-500 block mb-2 uppercase tracking-widest font-black">Est. Amount</label>
                                    <div className="w-full bg-slate-800/30 border border-slate-700/50 rounded px-4 py-3 text-primary font-mono font-bold text-lg flex items-center">
                                        ₹{(parseFloat(quantity || 0) * (orderType === 'LIMIT' ? parseFloat(limitPrice || 0) : (livePrices[selectedStock] || 0))).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    </div>
                                </div>
                            </div>
                        </div>
                            
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-4">
                            <h3 className="text-sm font-bold text-slate-300 border-b border-slate-700 pb-2">Advanced Protection Brackets</h3>
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Stop Loss (₹)</label>
                                <input type="number" min="0.01" step="0.01" value={stopLoss} onChange={e=>setStopLoss(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-danger text-sm" placeholder="Optional" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Take Profit (₹)</label>
                                <input type="number" min="0.01" step="0.01" value={takeProfit} onChange={e=>setTakeProfit(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-success text-sm" placeholder="Optional" />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer pt-2">
                                <input type="checkbox" checked={trailingStop} onChange={e=>setTrailingStop(e.target.checked)} className="rounded bg-slate-900 border-slate-700 cursor-pointer" />
                                Enable Trailing Stop
                            </label>
                        </div>
                    </div>
                        
                    <div className="flex gap-4 mt-6 pt-4 border-t border-slate-800">
                            <button onClick={()=>handleTrade("BUY")} className="flex-1 bg-success hover:bg-emerald-500 text-white font-bold py-3 rounded transition uppercase">Buy</button>
                            <button onClick={()=>handleTrade("SELL")} className="flex-1 bg-danger hover:bg-red-500 text-white font-bold py-3 rounded transition uppercase">Sell</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const WatchlistTab = ({ watchlist, livePrices, priceHistory, token, onRefresh }) => {
    const [selectedStock, setSelectedStock] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [orderType, setOrderType] = useState("MARKET");
    const [limitPrice, setLimitPrice] = useState("");
    const [error, setError] = useState("");
    const [aiAnalysis, setAiAnalysis] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [stopLoss, setStopLoss] = useState("");
    const [takeProfit, setTakeProfit] = useState("");
    const [trailingStop, setTrailingStop] = useState(false);
    const [showVolume, setShowVolume] = useState(true);
    const [showIndicators, setShowIndicators] = useState(false);

    useEffect(() => { if (!selectedStock) { setAiAnalysis(""); setStopLoss(""); setTakeProfit(""); setTrailingStop(false); } }, [selectedStock]);

    const handleAnalyze = async () => {
        setIsAnalyzing(true); setAiAnalysis("");
        try {
            const data = await apiFetch(`/trade/analyze/${selectedStock}`, "GET", null, token);
            setAiAnalysis(data.analysis);
        } catch (err) { setAiAnalysis("AI Analysis failed. Try again."); }
        setIsAnalyzing(false);
    };

    if (watchlist.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <i data-lucide="star" className="w-16 h-16 mb-4 opacity-50"></i>
                <p>Your watchlist is empty.</p>
                <p className="text-sm mt-2">Add stocks from the Market view!</p>
            </div>
        );
    }

    const handleTrade = async (side) => {
        if (!selectedStock) return;
        setError("");
        try {
            const body = { symbol: selectedStock, order_type: orderType, side: side, quantity: parseInt(quantity) };
            if (orderType === "LIMIT") {
                body.price = parseFloat(limitPrice);
                if (!body.price || isNaN(body.price) || body.price <= 0) throw new Error("Valid limit price required");
            }
            if (stopLoss) body.stop_loss_price = parseFloat(stopLoss);
            if (takeProfit) body.take_profit_price = parseFloat(takeProfit);
            if (trailingStop) body.trailing_stop_active = true;
            await apiFetch("/trade/order", "POST", body, token);
            setSelectedStock(null);
            if(onRefresh) onRefresh();
        } catch (err) { setError(err.message); }
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><i data-lucide="star" className="text-primary"></i> Watchlist</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {watchlist.map(item => {
                    const symbol = item.symbol;
                    const price = livePrices[symbol] || 0;
                    return (
                        <div key={symbol} onClick={() => setSelectedStock(symbol)} 
                             className="bg-dark p-4 rounded-xl border border-slate-800 hover:border-primary cursor-pointer transition flex flex-col justify-between h-40 group relative">
                            <div className="flex justify-between items-start mb-2 pointer-events-auto">
                                <h3 className="font-bold text-lg group-hover:text-primary transition">{symbol}</h3>
                                <button onClick={(e) => { e.stopPropagation(); apiFetch(`/trade/watchlist/${symbol}`, "DELETE", null, token).then(onRefresh); }} className="text-yellow-400 hover:text-slate-400 p-1 tooltip" title="Remove from Watchlist">
                                    <i data-lucide="star" className="w-4 h-4 fill-yellow-400"></i>
                                </button>
                            </div>
                            <div className="h-20 w-full pointer-events-none mt-2">
                                <RealtimeChart data={priceHistory[symbol] || []} type="line" height={80} />
                            </div>
                            <div className="text-2xl font-mono mt-auto pt-2">₹{price.toFixed(2)}</div>
                        </div>
                    );
                })}
            </div>

            {selectedStock && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center z-[100] p-0 md:p-4 transition-all">
                    <div className="bg-dark p-4 md:p-6 rounded-t-2xl md:rounded-xl w-full max-w-2xl border-t md:border border-slate-700 shadow-2xl max-h-[92vh] md:max-h-[95vh] overflow-y-auto custom-scrollbar mt-auto md:mt-0">
                        <div className="flex justify-between items-start mb-4 border-b border-slate-800 pb-3">
                            <div>
                                <h2 className="text-xl md:text-2xl font-bold">{selectedStock}</h2>
                                <div className="text-2xl md:text-3xl font-mono text-primary mt-1">₹{(livePrices[selectedStock] || 0).toFixed(2)}</div>
                            </div>
                            <button onClick={()=>setSelectedStock(null)} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full w-8 h-8 flex items-center justify-center transition focus:outline-none">&times;</button>
                        </div>
                        
                        <div className="flex gap-4 mb-2">
                            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer hover:text-primary"><input type="checkbox" checked={showIndicators} onChange={e=>setShowIndicators(e.target.checked)} className="rounded bg-slate-900 border-slate-700" /> SMA 14/50</label>
                            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer hover:text-primary"><input type="checkbox" checked={showVolume} onChange={e=>setShowVolume(e.target.checked)} className="rounded bg-slate-900 border-slate-700" /> Volume Profile</label>
                        </div>
                        <div className="flex flex-col md:flex-row gap-4 mb-6">
                            <div className="h-48 flex-1 relative border border-slate-800 rounded bg-[#0f172a]/50">
                                <RealtimeChart data={priceHistory[selectedStock] || []} type="candlestick" height={192} showVolume={showVolume} showIndicators={showIndicators} />
                            </div>
                            <div className="h-48 w-full md:w-48 shrink-0">
                                <OrderBook symbol={selectedStock} livePrice={livePrices[selectedStock]} />
                            </div>
                        </div>

                        {error && <div className="text-danger text-sm mb-4 bg-danger/10 p-3 rounded">{error}</div>}
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-slate-400 block mb-2">Order Type</label>
                                    <div className="flex bg-slate-800 rounded overflow-hidden">
                                        <button onClick={()=>setOrderType("MARKET")} className={`flex-1 py-2 text-sm font-bold ${orderType==='MARKET' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}>MARKET</button>
                                        <button onClick={()=>setOrderType("LIMIT")} className={`flex-1 py-2 text-sm font-bold ${orderType==='LIMIT' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}>LIMIT</button>
                                    </div>
                                </div>
                            
                            {orderType === "LIMIT" && (
                                <div>
                                    <label className="text-sm text-slate-400 block mb-2">Limit Price (₹)</label>
                                    <input type="number" min="0.01" step="0.01" value={limitPrice} onChange={e=>setLimitPrice(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-4 py-3 text-white focus:outline-none focus:border-primary text-lg" />
                                </div>
                            )}

                            {aiAnalysis ? (
                                <div className="bg-slate-900 border border-primary/30 p-4 rounded text-sm text-slate-300 relative">
                                    <div className="absolute -top-3 right-4 bg-primary px-2 py-0.5 text-xs text-white rounded font-bold flex items-center gap-1"><i data-lucide="sparkles" className="w-3 h-3"></i> AI INSIGHT</div>
                                    <p className="leading-relaxed whitespace-pre-wrap">{aiAnalysis}</p>
                                </div>
                            ) : (
                                <button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded py-3 text-primary font-bold text-sm transition flex justify-center items-center gap-2">
                                    {isAnalyzing ? <i data-lucide="loader" className="animate-spin w-4 h-4"></i> : <i data-lucide="sparkles" className="w-4 h-4"></i>}
                                    {isAnalyzing ? "AI is analyzing..." : "Get AI Analysis"}
                                </button>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-slate-400 block mb-2">Quantity</label>
                                    <input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-4 py-3 text-white focus:outline-none focus:border-primary text-lg" />
                                </div>
                                <div className="flex flex-col justify-end">
                                    <label className="text-xs text-slate-500 block mb-2 uppercase tracking-widest font-black">Est. Amount</label>
                                    <div className="w-full bg-slate-800/30 border border-slate-700/50 rounded px-4 py-3 text-primary font-mono font-bold text-lg flex items-center">
                                        ₹{(parseFloat(quantity || 0) * (orderType === 'LIMIT' ? parseFloat(limitPrice || 0) : (livePrices[selectedStock] || 0))).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-4">
                            <h3 className="text-sm font-bold text-slate-300 border-b border-slate-700 pb-2">Advanced Protection Brackets</h3>
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Stop Loss (₹)</label>
                                <input type="number" min="0.01" step="0.01" value={stopLoss} onChange={e=>setStopLoss(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-danger text-sm" placeholder="Optional" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Take Profit (₹)</label>
                                <input type="number" min="0.01" step="0.01" value={takeProfit} onChange={e=>setTakeProfit(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-success text-sm" placeholder="Optional" />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer pt-2">
                                <input type="checkbox" checked={trailingStop} onChange={e=>setTrailingStop(e.target.checked)} className="rounded bg-slate-900 border-slate-700 cursor-pointer" />
                                Enable Trailing Stop
                            </label>
                        </div>
                    </div>
                        
                    <div className="flex gap-4 mt-6 pt-4 border-t border-slate-800">
                            <button onClick={()=>handleTrade("BUY")} className="flex-1 bg-success hover:bg-emerald-500 text-white font-bold py-3 rounded transition uppercase">Buy</button>
                            <button onClick={()=>handleTrade("SELL")} className="flex-1 bg-danger hover:bg-red-500 text-white font-bold py-3 rounded transition uppercase">Sell</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const OrdersTab = ({ orders, onRefresh, token }) => {
    if (!orders || orders.length === 0) return (
         <div className="h-full flex flex-col items-center justify-center text-slate-500">
             <i data-lucide="list" className="w-16 h-16 mb-4 opacity-50"></i>
             <p>No order history available.</p>
         </div>
    );
    return (
        <div className="max-w-5xl mx-auto mt-4">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><i data-lucide="list" className="text-primary"></i> Order History</h2>
            <div className="bg-dark rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                    <thead className="bg-slate-900/50 border-b border-slate-800">
                        <tr>
                            <th className="p-4 text-slate-400 font-medium">Time</th>
                            <th className="p-4 text-slate-400 font-medium">Symbol</th>
                            <th className="p-4 text-slate-400 font-medium">Side</th>
                            <th className="p-4 text-slate-400 font-medium text-center">Type</th>
                            <th className="p-4 text-slate-400 font-medium text-right">Qty</th>
                            <th className="p-4 text-slate-400 font-medium text-right">Price</th>
                            <th className="p-4 text-slate-400 font-medium text-right">Status</th>
                            <th className="p-4 text-slate-400 font-medium text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {orders.map(o => (
                            <tr key={o.id} className="hover:bg-slate-800/50 transition">
                                <td className="p-4 text-sm text-slate-400">{new Date(o.created_at || o.timestamp).toLocaleString([], {hour:'2-digit', minute:'2-digit'})}</td>
                                <td className="p-4 font-bold">{o.symbol}</td>
                                <td className={`p-4 font-bold ${o.side === 'BUY' ? 'text-success' : 'text-danger'}`}>{o.side}</td>
                                <td className="p-4 text-center text-xs text-slate-400">{o.order_type.replace('OrderType.', '')}</td>
                                <td className="p-4 text-right font-mono">{o.quantity}</td>
                                <td className="p-4 text-right font-mono">₹{o.price.toFixed(2)}</td>
                                <td className="p-4 text-right font-mono text-xs">
                                    <span className={`px-2 py-1 rounded ${o.status==='PENDING'?'bg-yellow-500/20 text-yellow-500':o.status==='EXECUTED'?'bg-success/20 text-success':'bg-danger/20 text-danger'}`}>
                                        {o.status.replace('OrderStatus.', '')}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                    {o.status === 'PENDING' && (
                                        <button onClick={() => {
                                            if(confirm("Cancel this open order?")) {
                                                apiFetch(`/trade/order/${o.id}`, "DELETE", null, token)
                                                    .then(() => onRefresh && onRefresh())
                                                    .catch(err => alert(err.message));
                                            }
                                        }} className="text-danger hover:text-red-400 text-sm underline">Cancel</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const PortfolioTab = ({ portfolio, livePrices, token, portfolioHistory }) => {
    const [selling, setSelling] = useState(null);
    const [sellAmount, setSellAmount] = useState(1);
    const [error, setError] = useState("");

    const handleSell = async (symbol) => {
        setError("");
        try {
            await apiFetch("/trade/order", "POST", { symbol: symbol, order_type: "MARKET", side: "SELL", quantity: parseInt(sellAmount) }, token);
            setSelling(null);
        } catch (err) {
            setError(err.message);
        }
    };

    let totalInvested = 0;
    let currentValue = 0;

    portfolio.forEach(item => {
        totalInvested += item.avg_price * item.quantity;
        const currentP = livePrices[item.symbol] || item.avg_price;
        currentValue += currentP * item.quantity;
    });

    const pnl = currentValue - totalInvested;
    const pnlPerc = totalInvested ? (pnl / totalInvested) * 100 : 0;

    const stocks = portfolio.filter(item => !MUTUAL_FUNDS.includes(item.symbol) && !CRYPTO_ASSETS.includes(item.symbol));
    const mfs = portfolio.filter(item => MUTUAL_FUNDS.includes(item.symbol));
    const cryptos = portfolio.filter(item => CRYPTO_ASSETS.includes(item.symbol));

    const renderTable = (items, title, icon) => (
        <div className="mb-8">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-200">
                <i data-lucide={icon} className="text-primary w-5 h-5"></i> {title}
            </h3>
            <div className="bg-dark rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap min-w-max">
                    <thead className="bg-slate-900/50">
                        <tr>
                            <th className="p-4 font-medium text-slate-400">Symbol</th>
                            <th className="p-4 font-medium text-slate-400 text-right">Qty</th>
                            <th className="p-4 font-medium text-slate-400 text-right">Avg. Price</th>
                            <th className="p-4 font-medium text-slate-400 text-right">LTP</th>
                            <th className="p-4 font-medium text-slate-400 text-right">P&L</th>
                            <th className="p-4 font-medium text-slate-400 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {items.length === 0 ? (
                            <tr><td colSpan="6" className="p-8 text-center text-slate-500">No {title.toLowerCase()} yet. Buy some from the Market!</td></tr>
                        ) : items.map(item => {
                            const ltp = livePrices[item.symbol] || item.avg_price;
                            const itemPnl = (ltp - item.avg_price) * item.quantity;
                            return (
                                <tr key={item.id} className="hover:bg-slate-800/50 transition">
                                    <td className="p-4 font-bold">{item.symbol}</td>
                                    <td className="p-4 text-right">{item.quantity}</td>
                                    <td className="p-4 text-right font-mono">₹{item.avg_price.toFixed(2)}</td>
                                    <td className="p-4 text-right font-mono text-primary">₹{ltp.toFixed(2)}</td>
                                    <td className={`p-4 text-right font-mono ${itemPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                        {itemPnl >= 0 ? '+' : ''}₹{itemPnl.toFixed(2)}
                                    </td>
                                    <td className="p-4 text-right">
                                        {selling === item.symbol ? (
                                            <div className="flex gap-2 justify-end items-center relative">
                                                <div className="absolute -top-6 right-0 text-[10px] text-slate-500 italic font-medium">
                                                    Val: ₹{(sellAmount * ltp).toLocaleString(undefined, {maximumFractionDigits:0})}
                                                </div>
                                                <input type="number" min="1" max={item.quantity} value={sellAmount} onChange={e=>setSellAmount(e.target.value)} className="w-16 p-1 text-black rounded outline-none" />
                                                <button onClick={() => handleSell(item.symbol)} className="bg-danger hover:bg-red-600 px-3 py-1 rounded text-white text-sm font-bold transition">Sell</button>
                                                <button onClick={() => setSelling(null)} className="text-slate-400 hover:text-white px-2 py-1 text-sm">Cancel</button>
                                                {error && <div className="absolute top-10 right-0 text-danger text-xs whitespace-nowrap bg-darker p-1 rounded border border-danger shadow-xl">{error}</div>}
                                            </div>
                                        ) : (
                                            <button onClick={() => { setSelling(item.symbol); setSellAmount(item.quantity); setError(""); }} className="bg-slate-700 hover:bg-danger text-white px-4 py-1 rounded text-sm transition font-bold">Sell</button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div>
            {/* Master Portfolio Chart */}
            <div className="bg-dark rounded-xl border border-slate-800 p-6 mb-8 shadow-xl">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><i data-lucide="trending-up" className="text-primary w-5 h-5"></i> Portfolio Value Tracking</h3>
                <div className="h-64 w-full relative">
                    {portfolioHistory.length > 0 ? (
                        <RealtimeChart data={portfolioHistory} type="line" height={256} />
                    ) : (
                        <div className="text-slate-500 text-sm text-center pt-20">Awaiting market ticks...</div>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-dark p-6 rounded-xl border border-slate-800">
                    <div className="text-slate-400 text-sm mb-1">Total Invested</div>
                    <div className="text-2xl font-mono">₹{totalInvested.toFixed(2)}</div>
                </div>
                <div className="bg-dark p-6 rounded-xl border border-slate-800">
                    <div className="text-slate-400 text-sm mb-1">Current Value</div>
                    <div className="text-2xl font-mono text-primary">₹{currentValue.toFixed(2)}</div>
                </div>
                <div className={`bg-dark p-6 rounded-xl border ${pnl >= 0 ? 'border-success/50' : 'border-danger/50'}`}>
                    <div className="text-slate-400 text-sm mb-1">Total P&L</div>
                    <div className={`text-2xl font-mono flex items-center ${pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                        {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)} ({pnlPerc.toFixed(2)}%)
                    </div>
                </div>
            </div>

            {renderTable(stocks, "Equity Shares", "briefcase")}
            {renderTable(mfs, "Mutual Funds", "landmark")}
            {renderTable(cryptos, "Crypto Assets", "bitcoin")}
        </div>
    );
};

const LeaderboardTab = ({ userStats, userEmail, token }) => {
    const [traders, setTraders] = useState([]);
    const [copyTarget, setCopyTarget] = useState(null);
    const [allocateAmount, setAllocateAmount] = useState("");
    
    useEffect(() => {
        const names = ["Alex Bull", "MoonWalker_99", "WallSt Whale", "HODL Master", "MumbaiTrader", "Dalal King", "Alpha Seeker", "BearHunter", "Quantum Fund", "Retail Legend"];
        const mocked = names.map(name => ({
            name,
            email: name.toLowerCase().replace(/[^a-z0-9]/g, '') + "@trader.com", // Generate a simple email
            pnlPerc: (Math.random() * 30) - 10,
            pnl: (Math.random() * 50000) - 10000
        }));
        setTraders(mocked);
    }, []);

    const allTraders = [...traders, { name: userEmail.split('@')[0] + " (You)", pnlPerc: userStats.pnlPerc || 0, pnl: userStats.pnl || 0, isYou: true }]
        .sort((a, b) => b.pnlPerc - a.pnlPerc);

    const handleCopy = async () => {
        if(!copyTarget) return;
        try {
            const data = await apiFetch("/trade/copy", "POST", {
                target_user_email: copyTarget.email,
                allocated_amount: parseFloat(allocateAmount)
            }, token);
            alert(data.message);
            setCopyTarget(null);
            setAllocateAmount("");
        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div className="max-w-5xl mx-auto mt-4">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><i data-lucide="trophy" className="text-primary"></i> Global Leaderboard</h2>
            <div className="bg-dark rounded-xl border border-slate-800 overflow-hidden shadow-xl">
                <table className="w-full text-left whitespace-nowrap">
                    <thead className="bg-slate-900/50 border-b border-slate-800">
                        <tr>
                            <th className="p-4 font-medium text-slate-400 w-16 text-center">Rank</th>
                            <th className="p-4 font-medium text-slate-400">Trader</th>
                            <th className="p-4 font-medium text-slate-400 text-right">Daily P&L</th>
                            <th className="p-4 font-medium text-slate-400 text-right">Return %</th>
                            <th className="p-4 font-medium text-slate-400 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {allTraders.map((t, idx) => (
                            <tr key={t.name} className={`${t.isYou ? 'bg-primary/20 border-l-4 border-primary' : 'hover:bg-slate-800/50 transition'}`}>
                                <td className="p-4 text-center font-bold text-slate-400 uppercase">
                                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                                </td>
                                <td className={`p-4 font-bold ${t.isYou ? 'text-white' : 'text-slate-300'}`}>
                                    {t.name}
                                    {!t.isYou && <span className="block text-xs font-normal text-slate-500">{t.email}</span>}
                                </td>
                                <td className={`p-4 text-right font-mono ${t.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {t.pnl >= 0 ? '+' : ''}₹{t.pnl.toFixed(2)}
                                </td>
                                <td className={`p-4 text-right font-bold ${t.pnlPerc >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {t.pnlPerc >= 0 ? '+' : ''}{t.pnlPerc.toFixed(2)}%
                                </td>
                                <td className="p-4 text-right">
                                    {!t.isYou && (
                                        <button onClick={()=>setCopyTarget(t)} className="bg-primary/20 hover:bg-primary/40 text-primary border border-primary/50 px-3 py-1 rounded text-xs font-bold uppercase transition focus:outline-none">
                                            Copy Trades
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {copyTarget && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-dark p-6 rounded-xl w-full max-w-sm border border-slate-700 shadow-2xl">
                        <h3 className="text-xl font-bold mb-2">Mirror Strategy</h3>
                        <p className="text-slate-400 text-sm mb-6">Automatically duplicate <span className="text-primary font-bold">{copyTarget.name}</span>'s future trades up to your allocated limit. (Submit 0 to unsubscribe)</p>
                        
                        <label className="text-sm font-bold text-slate-300 mb-2 block">Max Investment Allocation (₹)</label>
                        <input type="number" min="0" value={allocateAmount} onChange={e=>setAllocateAmount(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 focus:border-primary rounded p-3 text-white outline-none mb-6" placeholder="e.g. 50000" />
                        
                        <div className="flex gap-4">
                            <button onClick={()=>setCopyTarget(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded transition uppercase">Cancel</button>
                            <button onClick={handleCopy} className="flex-1 bg-primary hover:bg-blue-600 shadow-lg shadow-primary/30 text-white font-bold py-3 rounded transition uppercase">Confirm</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const BotsTab = ({ livePrices, token }) => {
    const [bots, setBots] = useState([]);
    const [name, setName] = useState("Alpha-1");
    const [symbol, setSymbol] = useState("");
    const [amount, setAmount] = useState("");
    const [interval, setInterval] = useState("3600");
    const [isVolAware, setIsVolAware] = useState(false);
    const [rsiMin, setRsiMin] = useState("");
    const [error, setError] = useState("");
    const [logs, setLogs] = useState([]);
    
    const loadBots = async () => {
        try {
            const data = await apiFetch("/trade/bots", "GET", null, token);
            setBots(data);
        } catch (err) { setError(err.message); }
    };
    
    useEffect(() => { 
        loadBots();
        const handleBotTrade = (e) => {
            if (e.detail?.type === 'bot_trade_executed') {
                const d = e.detail.data;
                setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${d.name || 'Bot'} executed BUY for ${d.quantity} ${d.symbol} @ ₹${d.price}`, ...prev.slice(0, 19)]);
                loadBots();
            }
        };
        window.addEventListener('trading_app_event', handleBotTrade);
        return () => window.removeEventListener('trading_app_event', handleBotTrade);
    }, []);
    
    const handleCreate = async (e) => {
        e.preventDefault();
        setError("");
        try {
            await apiFetch("/trade/bots", "POST", { 
                name,
                symbol: symbol.toUpperCase(), 
                amount_per_trade: parseFloat(amount), 
                interval_seconds: parseInt(interval),
                is_vol_aware: isVolAware,
                rsi_min: rsiMin ? parseFloat(rsiMin) : null
            }, token);
            setName("Alpha-" + (bots.length + 2)); setSymbol(""); setAmount("");
            loadBots();
        } catch (err) { setError(err.message); }
    };
    
    const handleDelete = async (id) => {
        await apiFetch(`/trade/bots/${id}`, "DELETE", null, token);
        loadBots();
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-black flex items-center gap-3 tracking-tighter uppercase italic">
                        <i data-lucide="cpu" className="text-cyan-400 w-8 h-8 fill-cyan-400/20"></i> Sentinel Autonomous Agents
                    </h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Algorithmic Wealth Deployment Hub</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Bot Forge */}
                <div className="bg-slate-900/40 p-8 rounded-3xl border border-white/5 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-[80px] -mr-16 -mt-16"></div>
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <i data-lucide="plus-circle" className="w-4 h-4 text-cyan-400"></i> Commission New Agent
                    </h3>
                    {error && <div className="text-rose-400 mb-6 text-[10px] font-black bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">{error}</div>}
                    <form onSubmit={handleCreate} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Agent Designation</label>
                            <input placeholder="E.g. HODL-Bot" value={name} onChange={e=>setName(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold outline-none focus:border-cyan-500 transition-all placeholder:text-slate-700" required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Asset</label>
                                <input placeholder="BTC_INR" value={symbol} onChange={e=>setSymbol(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold outline-none focus:border-cyan-500 transition-all" required />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Alloc (₹)</label>
                                <input type="number" min="10" placeholder="1000" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold outline-none focus:border-cyan-500 transition-all" required />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Frequency (Seconds)</label>
                            <select value={interval} onChange={e=>setInterval(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white font-bold outline-none focus:border-cyan-500 transition-all appearance-none">
                                <option value="60">Every 1 Minute (Rapid)</option>
                                <option value="3600">Every 1 Hour (Steady)</option>
                                <option value="86400">Every 1 Day (Institutional)</option>
                                <option value="604800">Every 1 Week (Passive)</option>
                            </select>
                        </div>
                        
                        <div className="pt-4 space-y-4 border-t border-white/5">
                             <div className="flex items-center justify-between">
                                 <div>
                                     <div className="text-[10px] font-black text-white uppercase tracking-wider italic">Volatility Guard</div>
                                     <div className="text-[8px] text-slate-500 font-bold">Pause during flash crashes</div>
                                 </div>
                                 <button type="button" onClick={()=>setIsVolAware(!isVolAware)} className={`w-10 h-5 rounded-full transition-all relative ${isVolAware ? 'bg-cyan-500' : 'bg-slate-800'}`}>
                                     <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isVolAware ? 'left-6' : 'left-1'}`}></div>
                                 </button>
                             </div>
                             <div className="flex items-center justify-between">
                                 <div>
                                     <div className="text-[10px] font-black text-white uppercase tracking-wider italic">RSI Oversold Floor</div>
                                     <div className="text-[8px] text-slate-500 font-bold">Buy only when RSI &lt; Value</div>
                                 </div>
                                 <input type="number" placeholder="Off" value={rsiMin} onChange={e=>setRsiMin(e.target.value)} className="w-12 bg-black/40 border border-white/10 rounded-lg text-center py-1 text-[10px] font-bold text-cyan-400 outline-none focus:border-cyan-500" />
                             </div>
                        </div>

                        <button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-400 font-black py-4 rounded-2xl text-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-cyan-500/20 transition-all active:scale-95 flex justify-center items-center gap-2">
                            <i data-lucide="zap" className="w-4 h-4 fill-black"></i> Deactivate Constraints & Deploy
                        </button>
                    </form>
                </div>

                {/* Bot Squad */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {bots.map(bot => (
                            <div key={bot.id} className="bg-slate-900/40 p-6 rounded-3xl border border-white/5 relative overflow-hidden group hover:border-white/10 transition-all">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 blur-[50px] -mr-12 -mt-12 group-hover:bg-cyan-500/10 transition-all"></div>
                                <div className="flex justify-between items-start mb-5 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                                            <i data-lucide="bot" className="text-cyan-400 w-5 h-5"></i>
                                        </div>
                                        <div>
                                            <h3 className="font-black text-white italic uppercase tracking-tighter text-lg">{bot.name}</h3>
                                            <div className="text-[8px] font-black text-cyan-500 tracking-[0.2em] flex items-center gap-1.5 uppercase">
                                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span> {bot.status}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={()=>handleDelete(bot.id)} className="text-slate-600 hover:text-rose-500 transition-colors p-2 bg-white/5 rounded-xl border border-white/5"><i data-lucide="trash-2" className="w-4 h-4"></i></button>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pb-4 border-b border-white/5 mb-4 relative z-10">
                                    <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                                        <div className="text-[8px] font-black text-slate-600 uppercase tracking-wider mb-1">Target Asset</div>
                                        <div className="text-sm font-black text-white">{bot.symbol}</div>
                                    </div>
                                    <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                                        <div className="text-[8px] font-black text-slate-600 uppercase tracking-wider mb-1">Cycle Size</div>
                                        <div className="text-sm font-black text-white">₹{bot.amount_per_trade.toLocaleString()}</div>
                                    </div>
                                </div>
                                <div className="space-y-2 relative z-10">
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500">
                                        <span>Strategy</span>
                                        <span className="text-slate-300">{bot.is_vol_aware ? 'SMART_VOL' : (bot.rsi_min ? 'RSI_DRIVEN' : 'DCA_CORE')}</span>
                                    </div>
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500">
                                        <span>Last Pulse</span>
                                        <span className="text-slate-300">{bot.last_executed ? new Date(bot.last_executed + 'Z').toLocaleTimeString() : 'Awaiting Engine...'}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {bots.length === 0 && (
                            <div className="col-span-2 text-slate-600 text-center py-20 border border-dashed border-slate-800 rounded-3xl italic text-xs flex flex-col items-center">
                                <i data-lucide="cpu" className="w-12 h-12 mb-4 opacity-10"></i>
                                Central Bot Engine Online. No sub-agents detected.
                            </div>
                        )}
                    </div>

                    {/* Central Log */}
                    <div className="bg-black/40 border border-white/5 rounded-3xl p-6 h-[280px] flex flex-col relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 text-cyan-400"><i data-lucide="terminal" className="w-24 h-24"></i></div>
                        <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                             <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span> Centralized Execution Kernel (128-bit)
                        </h3>
                        <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[9px] space-y-2 pr-2">
                             {logs.map((log, i) => (
                                 <div key={i} className="text-slate-400 flex items-start gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                                     <span className="text-cyan-500 opacity-40 shrink-0">≫</span>
                                     <span className="opacity-80 lowercase tracking-tighter">{log}</span>
                                 </div>
                             ))}
                             {logs.length === 0 && <div className="text-slate-700 italic">No execution pulses recorded in current session...</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ProfileTab = ({ user, token }) => {
    const [achievements, setAchievements] = useState([]);
    useEffect(() => {
        apiFetch("/trade/achievements", "GET", null, token).then(setAchievements).catch(console.error);
    }, [token]);

    const ICONS = {
        "Plutocrat": "crown",
        "High Roller": "gem"
    };

    const xpToNext = 1000 - (user?.xp % 1000 || 0);
    const progress = ((user?.xp % 1000) / 1000) * 100 || 5;

    return (
        <div className="max-w-6xl mx-auto space-y-10 pb-20">
            <div className="flex flex-col lg:flex-row gap-10">
                {/* ID Dossier Column */}
                <div className="lg:w-1/3 space-y-6">
                    <div className="bg-slate-900/60 p-8 rounded-[2rem] border border-white/5 relative overflow-hidden shadow-2xl backdrop-blur-xl group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[80px] -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-all"></div>
                        <div className="flex flex-col items-center text-center">
                            <div className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-tr from-indigo-600 to-violet-500 p-1 mb-6 shadow-2xl shadow-indigo-500/20">
                                <div className="w-full h-full rounded-[2.2rem] bg-slate-900 flex items-center justify-center text-5xl font-black italic text-white">
                                    {user?.email?.[0].toUpperCase()}
                                </div>
                            </div>
                            <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase">{user?.email?.split('@')[0]}</h3>
                            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest">
                                <i data-lucide="shield-check" className="w-3.5 h-3.5"></i> Sentinel Level {user?.level || 1}
                            </div>
                        </div>

                        <div className="mt-10 space-y-4 pt-10 border-t border-white/5">
                            <div className="flex justify-between items-end mb-1">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">XP Progression</span>
                                <span className="text-[10px] font-black text-slate-300 italic">{user?.xp || 0} / 1000 XP</span>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                                <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-400 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                            </div>
                            <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest text-center">{xpToNext} XP until Tier Advancement</p>
                        </div>
                    </div>

                    <div className="bg-black/20 p-6 rounded-3xl border border-white/5 space-y-4">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <i data-lucide="crosshair" className="w-4 h-4 text-rose-500"></i> Tactical Profile
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center">
                                <div className="text-[8px] font-black text-slate-600 uppercase mb-1">Archetype</div>
                                <div className="text-xs font-black text-indigo-400">{user?.trading_style || "SCALPER"}</div>
                            </div>
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center">
                                <div className="text-[8px] font-black text-slate-600 uppercase mb-1">Risk DNA</div>
                                <div className="text-xs font-black text-rose-400">Chaos-Edge</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Analytics & Awards Column */}
                <div className="lg:w-2/3 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Risk DNA Gauge */}
                        <div className="bg-slate-900/40 p-8 rounded-[2rem] border border-white/5 relative overflow-hidden group">
                           <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Risk Spectrum Analyzer</h4>
                           <div className="relative h-24 flex items-center justify-center">
                                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 opacity-20 blur-2xl rounded-full"></div>
                                <div className="w-full h-4 bg-black/40 rounded-full border border-white/5 p-1 relative z-10">
                                    <div className="absolute top-1/2 left-[70%] -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-2xl shadow-white/50 border-4 border-slate-900 z-20"></div>
                                    <div className="h-full w-[70%] bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 rounded-full"></div>
                                </div>
                                <div className="absolute bottom-0 w-full flex justify-between px-2 pt-4">
                                    <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">CONSERVATIVE</span>
                                    <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest italic">CHAOS</span>
                                </div>
                           </div>
                        </div>

                        {/* Summary Stats */}
                        <div className="bg-slate-900/40 p-8 rounded-[2rem] border border-white/5 grid grid-cols-2 gap-4">
                            <div className="text-center p-4 border-r border-white/5">
                                <div className="text-[8px] font-black text-slate-500 uppercase mb-2 italic">Trades</div>
                                <div className="text-3xl font-black text-white italic">42</div>
                            </div>
                            <div className="text-center p-4">
                                <div className="text-[8px] font-black text-slate-500 uppercase mb-2 italic">Win Velocity</div>
                                <div className="text-3xl font-black text-emerald-400 italic">82%</div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-4 flex items-center gap-2">
                            <i data-lucide="award" className="text-amber-400"></i> Sentinel Service Ribbons
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {achievements.map((ach, i) => (
                                <div key={i} className="bg-white/5 p-5 rounded-[1.5rem] border border-white/5 flex items-start gap-5 hover:bg-white/10 transition-all hover:scale-[1.02] active:scale-95 group">
                                    <div className="w-14 h-14 bg-gradient-to-tr from-slate-800 to-slate-700/50 rounded-2xl flex items-center justify-center shrink-0 border border-white/5 group-hover:border-amber-400/50 transition-all">
                                        <i data-lucide={ICONS[ach.badge_name] || "star"} className="text-amber-400 w-7 h-7 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]"></i>
                                    </div>
                                    <div>
                                        <h4 className="font-black text-base text-white uppercase italic tracking-tighter">{ach.badge_name}</h4>
                                        <p className="text-[10px] text-slate-400 font-bold tracking-tight mt-1 leading-relaxed">{ach.description}</p>
                                        <div className="text-[8px] text-slate-600 mt-4 font-black uppercase tracking-widest flex items-center gap-1.5 opacity-60">
                                            <i data-lucide="calendar" className="w-3 h-3"></i> {new Date(ach.unlocked_at + 'Z').toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {achievements.length === 0 && (
                                <div className="col-span-2 text-center py-20 border border-dashed border-slate-800 rounded-[2rem] bg-black/20">
                                    <i data-lucide="lock" className="w-16 h-16 mx-auto mb-4 opacity-10 text-slate-400"></i>
                                    <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">No Service Ribbons Awarded</p>
                                    <p className="text-[8px] text-slate-700 font-bold mt-2 uppercase tracking-tight">Deploy capital to initiate carrier progression.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AlertsTab = ({ token }) => {
    const [alerts, setAlerts] = useState([]);
    const [symbol, setSymbol] = useState("");
    const [price, setPrice] = useState("");
    const [direction, setDirection] = useState("ABOVE");
    const [error, setError] = useState("");

    const loadAlerts = async () => {
        try {
            const data = await apiFetch("/trade/alerts", "GET", null, token);
            setAlerts(data);
        } catch (err) { setError(err.message); }
    };
    
    useEffect(() => { loadAlerts(); }, [token]);

    const handleCreate = async (e) => {
        e.preventDefault();
        setError("");
        try {
            await apiFetch("/trade/alerts", "POST", { symbol: symbol.toUpperCase(), price_target: parseFloat(price), direction }, token);
            setSymbol(""); setPrice(""); setDirection("ABOVE");
            loadAlerts();
        } catch (err) { setError(err.message); }
    };

    const handleDelete = async (id) => {
        await apiFetch(`/trade/alerts/${id}`, "DELETE", null, token);
        loadAlerts();
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><i data-lucide="bell" className="text-primary"></i> Price Threshold Alerts</h2>
            
            <div className="bg-dark p-6 rounded-xl border border-slate-800 mb-8 max-w-xl shadow-lg">
                <h3 className="text-lg font-bold mb-4 flex items-center"><i data-lucide="plus-circle" className="w-5 h-5 mr-2"></i> Create New Alert</h3>
                {error && <div className="text-danger mb-4 text-sm bg-danger/10 p-3 rounded border border-danger/30">{error}</div>}
                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="flex gap-4 flex-col md:flex-row">
                        <div className="flex-1">
                            <label className="text-slate-400 text-sm block mb-1">Target Symbol</label>
                            <input placeholder="BTC_INR" value={symbol} onChange={e=>setSymbol(e.target.value)} className="w-full bg-slate-900 border border-slate-700/50 rounded px-4 py-2 text-white focus:border-primary transition outline-none" required />
                        </div>
                        <div className="flex-1">
                            <label className="text-slate-400 text-sm block mb-1">Threshold Price (₹)</label>
                            <input type="number" step="0.01" min="0" placeholder="50000" value={price} onChange={e=>setPrice(e.target.value)} className="w-full bg-slate-900 border border-slate-700/50 rounded px-4 py-2 text-white focus:border-primary transition outline-none" required />
                        </div>
                        <div className="flex-1">
                            <label className="text-slate-400 text-sm block mb-1">Direction</label>
                            <select value={direction} onChange={e=>setDirection(e.target.value)} className="w-full bg-slate-900 border border-slate-700/50 rounded px-4 py-2.5 text-white focus:border-primary transition outline-none cursor-pointer">
                                <option value="ABOVE">Moves Above</option>
                                <option value="BELOW">Drops Below</option>
                            </select>
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-primary hover:bg-blue-600 font-bold py-3 rounded text-white shadow-lg shadow-primary/20 transition flex justify-center items-center gap-2"><i data-lucide="bell-ring" className="w-4 h-4"></i> Establish Monitor</button>
                </form>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {alerts.map(alert => (
                    <div key={alert.id} className="bg-slate-900 p-5 rounded-xl border border-slate-700 relative overflow-hidden shadow-lg group hover:border-primary/50 transition">
                        <div className="flex justify-between items-start mb-4 relative z-10 border-b border-slate-800 pb-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${alert.direction === 'ABOVE' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                                    <i data-lucide={alert.direction === 'ABOVE' ? "trending-up" : "trending-down"} className="w-5 h-5"></i>
                                </div>
                                <div>
                                    <h3 className="font-bold text-xl tracking-tight">{alert.symbol}</h3>
                                    <div className="text-xs text-slate-400 mt-0.5">Alert Condition</div>
                                </div>
                            </div>
                            <button onClick={()=>handleDelete(alert.id)} className="text-slate-500 hover:text-white hover:bg-danger bg-slate-800 p-2.5 rounded transition border border-slate-700 shadow-sm"><i data-lucide="trash-2" className="w-4 h-4"></i></button>
                        </div>
                        <div className="space-y-3 text-sm text-slate-300 relative z-10 pt-2">
                            <div className="flex justify-between items-center"><span className="text-slate-500">Direction</span> <span className="font-medium bg-slate-800 px-2 py-0.5 rounded text-xs">{alert.direction}</span></div>
                            <div className="flex justify-between items-center"><span className="text-slate-500">Target Level</span> <span className="font-mono font-bold text-white text-base">₹{alert.price_target.toFixed(2)}</span></div>
                            <div className="flex justify-between items-center pt-2"><span className="text-slate-500 text-xs">Created</span> <span className="text-xs font-mono opacity-80">{new Date(alert.created_at + 'Z').toLocaleTimeString()}</span></div>
                        </div>
                    </div>
                ))}
                {alerts.length === 0 && <div className="text-slate-500 col-span-3 text-center py-12 border border-dashed border-slate-800 rounded-xl bg-darker/50"><i data-lucide="bell-off" className="w-12 h-12 mx-auto mb-4 opacity-20"></i>No active price monitors. Target a threshold above.</div>}
            </div>
        </div>
    );
};

const DerivativesTab = ({ token, livePrices }) => {
    const [subTab, setSubTab] = useState('manual'); // 'manual', 'wizard', 'surface'
    const [options, setOptions] = useState([]);
    const [preFill, setPreFill] = useState(null);

    const loadOptions = async () => {
        try {
            const data = await apiFetch("/trade/options", "GET", null, token);
            setOptions(data);
        } catch(e) { console.error(e); }
    };
    useEffect(() => { loadOptions(); }, [token]);

    const handleSelect = (symbol, strike, type) => {
        setPreFill({ symbol, strike, type });
        setSubTab('manual');
    };

    return (
        <div className="max-w-7xl mx-auto pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                  <h2 className="text-3xl font-black flex items-center gap-3 tracking-tighter uppercase italic">
                      <i data-lucide="zap" className="text-amber-400 w-8 h-8 fill-amber-400/20"></i> Sentinel Strategy Forge
                  </h2>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">High-Precision Derivative Architecture</p>
                </div>
                
                <div className="flex p-1 bg-slate-900 border border-white/5 rounded-xl gap-1 shrink-0">
                    {[
                        { id: 'manual', label: 'Manual Order', icon: 'mouse-pointer-2' },
                        { id: 'wizard', label: 'Strategy Wizard', icon: 'wand-2' },
                        { id: 'surface', label: 'Greek Surface', icon: 'layers' }
                    ].map(t => (
                        <button key={t.id} onClick={() => setSubTab(t.id)} 
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all ${subTab === t.id ? 'bg-amber-500 text-black shadow-lg shadow-amber-900/30' : 'text-slate-500 hover:text-slate-300'}`}>
                            <i data-lucide={t.icon} className="w-3.5 h-3.5"></i> {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-3">
                    {subTab === 'manual' && <ManualOptionsForm onRefresh={loadOptions} token={token} livePrices={livePrices} preFill={preFill} />}
                    {subTab === 'wizard' && <StrategyWizard token={token} livePrices={livePrices} onSelect={handleSelect} />}
                    {subTab === 'surface' && <GreekSurface token={token} livePrices={livePrices} />}
                </div>
                
                <div className="space-y-6">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2 flex justify-between items-center">
                        Active Contracts
                        <span className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded text-[8px] animate-pulse">LIVE POLLING</span>
                    </h3>
                    <div className="space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                        {options.map(opt => <OptionContractCard key={opt.id} opt={opt} />)}
                        {options.length === 0 && <div className="text-slate-600 text-center py-12 border border-dashed border-slate-800 rounded-2xl italic text-[10px]">No active derivative exposure.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ManualOptionsForm = ({ onRefresh, token, livePrices, preFill }) => {
    const [symbol, setSymbol] = useState(preFill?.symbol || "");
    const [strike, setStrike] = useState(preFill?.strike || "");
    const [qty, setQty] = useState("");
    const [type, setType] = useState(preFill?.type || "CALL");
    const [expiry, setExpiry] = useState("43200"); // 30 days
    const [error, setError] = useState("");

    useEffect(() => {
        if (preFill) {
            setSymbol(preFill.symbol);
            setStrike(preFill.strike);
            setType(preFill.type);
        }
    }, [preFill]);

    const handleBuy = async (e) => {
        e.preventDefault();
        setError("");
        try {
            await apiFetch("/trade/options/buy", "POST", { 
                symbol: symbol.toUpperCase(), 
                strike_price: parseFloat(strike), 
                quantity: parseInt(qty), 
                option_type: type, 
                expires_in_minutes: parseInt(expiry) 
            }, token);
            onRefresh();
            setSymbol(""); setStrike(""); setQty("");
        } catch(e) { setError(e.message); }
    };

    return (
        <div className="bg-slate-900/40 p-8 rounded-3xl border border-white/5 shadow-3xl backdrop-blur-3xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] -mr-32 -mt-32"></div>
            <h3 className="text-lg font-black mb-6 flex items-center gap-2 uppercase italic tracking-tighter">
                <i data-lucide="crosshair" className="text-amber-400 w-5 h-5"></i> Tactile Execution Entry
            </h3>
            {error && <div className="text-rose-400 mb-6 text-[10px] font-black bg-rose-500/10 p-4 rounded-xl border border-rose-500/20 flex items-center gap-2 uppercase tracking-widest"><i data-lucide="alert-triangle" className="w-4 h-4"></i> {error}</div>}
            <form onSubmit={handleBuy} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Asset Identifier</label>
                        <input placeholder="NIFTY_50" value={symbol} onChange={e=>setSymbol(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-slate-700" required />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Volume (Contracts)</label>
                        <input type="number" min="1" placeholder="50" value={qty} onChange={e=>setQty(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all" required />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Strike Target (₹)</label>
                        <input type="number" step="0.01" min="1" placeholder="22000" value={strike} onChange={e=>setStrike(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all" required />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Contract Type</label>
                        <div className="flex p-1 bg-black/40 rounded-2xl border border-white/10">
                            {['CALL','PUT'].map(t => (
                                <button key={t} type="button" onClick={() => setType(t)} className={`flex-1 py-3 text-[10px] font-black rounded-xl transition-all ${type === t ? (t === 'CALL' ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20' : 'bg-rose-500 text-white shadow-xl shadow-rose-500/20') : 'text-slate-500 hover:text-slate-300'}`}>
                                    {t === 'CALL' ? 'BULL CALL' : 'BEAR PUT'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Time Horizon</label>
                        <select value={expiry} onChange={e=>setExpiry(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-amber-500 transition-all text-sm appearance-none">
                            <option value="60">1 Hour (Intraday)</option>
                            <option value="1440">1 Day (Swing)</option>
                            <option value="10080">1 Week (Tactical)</option>
                            <option value="43200">30 Days (Institutional)</option>
                        </select>
                    </div>
                </div>
                <button type="submit" className={`w-full font-black py-5 rounded-2xl text-xs uppercase tracking-[0.2em] transition-all flex justify-center items-center gap-3 active:scale-[0.98] ${type==='CALL'?'bg-emerald-500 hover:bg-emerald-400 text-white shadow-2xl shadow-emerald-500/30' : 'bg-rose-500 hover:bg-rose-400 text-white shadow-2xl shadow-rose-500/30'}`}>
                    <i data-lucide="zap" className="w-4 h-4 fill-white"></i> Initiate Authorization Logic
                </button>
            </form>
        </div>
    );
};

const StrategyWizard = ({ token, livePrices, onTrade }) => {
    const [outlook, setOutlook] = useState('bullish'); // bullish, bearish, neutral, high_vol
    const [symbol] = useState('NIFTY_50');
    
    const strategies = {
        bullish: [
            { name: 'Long Call', risk: 'Limited', reward: 'Unlimited', confidence: 95, icon: 'trending-up', color: 'emerald' },
            { name: 'Bull Call Spread', risk: 'Low', reward: 'Capped', confidence: 80, icon: 'layers', color: 'emerald' }
        ],
        bearish: [
            { name: 'Long Put', risk: 'Limited', reward: 'Unlimited', confidence: 92, icon: 'trending-down', color: 'rose' },
            { name: 'Bear Put Spread', risk: 'Low', reward: 'Capped', confidence: 82, icon: 'layers', color: 'rose' }
        ],
        neutral: [
            { name: 'Iron Condor', risk: 'Low', reward: 'Fixed', confidence: 75, icon: 'binary', color: 'amber' },
            { name: 'Short Straddle', risk: 'Very High', reward: 'Fixed', confidence: 60, icon: 'refresh-cw', color: 'orange' }
        ],
        high_vol: [
            { name: 'Long Straddle', risk: 'Limited', reward: 'Unlimited', confidence: 88, icon: 'zap', color: 'blue' },
            { name: 'Long Strangle', risk: 'Lower Premium', reward: 'Unlimited', confidence: 85, icon: 'arrow-up-right', color: 'cyan' }
        ]
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-slate-900/40 p-8 rounded-3xl border border-white/5">
                <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <i data-lucide="compass" className="w-4 h-4"></i> Select Market Sentiment
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { id: 'bullish', label: 'BULLISH', hint: 'Price up 📈', color: 'emerald' },
                        { id: 'bearish', label: 'BEARISH', hint: 'Price down 📉', color: 'rose' },
                        { id: 'neutral', label: 'NEUTRAL', hint: 'Sideways ↔️', color: 'amber' },
                        { id: 'high_vol', label: 'VOLATILE', hint: 'Big move ⚡', color: 'purple' }
                    ].map(opt => (
                        <button key={opt.id} onClick={() => setOutlook(opt.id)}
                            className={`p-6 rounded-2xl border text-left transition-all duration-300 group ${outlook === opt.id ? `bg-${opt.color}-500/10 border-${opt.color}-500/40 ring-4 ring-${opt.color}-500/5` : 'bg-black/20 border-white/5 hover:border-white/10'}`}>
                            <div className={`text-[10px] font-black mb-1 transition-colors ${outlook === opt.id ? `text-${opt.color}-400` : 'text-slate-600'}`}>{opt.label}</div>
                            <div className="text-xs font-bold text-slate-300">{opt.hint}</div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {strategies[outlook].map((strat, idx) => (
                    <div key={idx} className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-colors relative group overflow-hidden">
                        <div className={`absolute top-0 right-0 w-32 h-32 bg-${strat.color}-500/5 blur-[50px] -mr-16 -mt-16 group-hover:bg-${strat.color}-500/10 transition-all`}></div>
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl bg-${strat.color}-500/10 border border-${strat.color}-500/20 flex items-center justify-center`}>
                                    <i data-lucide={strat.icon} className={`w-5 h-5 text-${strat.color}-400`}></i>
                                </div>
                                <div>
                                    <h4 className="font-black text-white italic uppercase tracking-tighter">{strat.name}</h4>
                                    <div className="flex gap-2 mt-1">
                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded bg-white/5 text-slate-500`}>RISK: {strat.risk}</span>
                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded bg-white/5 text-slate-500`}>REWARD: {strat.reward}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={`text-[10px] font-black text-${strat.color}-400`}>{strat.confidence}%</div>
                                <div className="text-[8px] text-slate-600 uppercase font-bold">SENTINEL SCORE</div>
                            </div>
                        </div>
                        <button onClick={() => onSelect(symbol, livePrices[symbol] || 0, strat.name.includes('Put') ? 'PUT' : 'CALL')} 
                            className={`w-full py-3 rounded-xl bg-${strat.color}-500/10 border border-${strat.color}-500/20 text-${strat.color}-400 text-[10px] font-black uppercase tracking-widest hover:bg-${strat.color}-500 hover:text-white transition-all`}>
                            Configure Setup
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

const GreekSurface = ({ symbol = 'NIFTY_50', token }) => {
    const [chain, setChain] = useState([]);
    useEffect(() => {
        const fetch = async () => {
            try {
                const data = await apiFetch(`/trade/options/chain/${symbol}`, 'GET', null, token);
                setChain(data.chain);
            } catch(e) {}
        };
        fetch();
    }, [symbol]);

    return (
        <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-8">
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <i data-lucide="layers" className="w-4 h-4 text-purple-400"></i> Derivative Greek Heatmap
            </h3>
            <div className="grid grid-cols-5 gap-1 shrink-0 mb-2 px-2">
                {['Strike','Delta','Gamma','Theta','Vega'].map(h => <div key={h} className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">{h}</div>)}
            </div>
            <div className="space-y-1 h-[400px] overflow-y-auto custom-scrollbar pr-2">
                 {chain.map((row, i) => (
                     <div key={i} className="grid grid-cols-5 gap-1 group">
                         <div className="bg-black/20 p-2 text-[9px] font-mono text-slate-400 border border-white/5 transition-colors group-hover:border-white/20">₹{row.strike}</div>
                         <GreekCell val={row.call.delta} type="delta" />
                         <GreekCell val={row.call.gamma} type="gamma" />
                         <GreekCell val={row.call.theta} type="theta" />
                         <GreekCell val={row.call.vega} type="vega" />
                     </div>
                 ))}
            </div>
        </div>
    );
};

const GreekCell = ({ val, type }) => {
    const opacity = type === 'delta' ? Math.abs(val) : Math.min(Math.abs(val) * 10, 1);
    const color = val >= 0 ? 'rgba(16,185,129,' : 'rgba(239,68,68,';
    return (
        <div className="p-2 text-[9px] font-mono flex items-center justify-center border border-white/5" style={{ backgroundColor: `${color}${opacity * 0.2})`, color: val>=0?'#10b981':'#ef4444' }}>
            {val.toFixed(3)}
        </div>
    );
};

const OptionContractCard = ({ opt }) => (
    <div className={`bg-slate-900/40 p-5 rounded-2xl border transition-all hover:bg-slate-900/60 group relative overflow-hidden ${opt.is_settled ? 'border-slate-800 opacity-60' : 'border-white/5'}`}>
        {!opt.is_settled && <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 blur-2xl"></div>}
        <div className="flex justify-between items-start mb-4 relative z-10">
            <div>
                <h4 className="font-black text-sm tracking-tight text-white">{opt.symbol}</h4>
                <div className={`text-[8px] font-black mt-1 inline-flex items-center px-1.5 py-0.5 rounded ${opt.option_type==='CALL'?'bg-emerald-500/20 text-emerald-400':'bg-rose-500/20 text-rose-400'}`}>{opt.option_type} CONTRACT</div>
            </div>
            <div className="text-right">
                <div className="font-mono text-[10px] text-slate-300">STRIKE: ₹{opt.strike_price.toLocaleString()}</div>
                <div className="text-[9px] text-slate-500 mt-0.5">QTY: {opt.quantity}</div>
            </div>
        </div>
        <div className="space-y-1.5 text-[10px] text-slate-400 relative z-10 font-medium">
            <div className="flex justify-between"><span>Premium Net</span> <span className="font-mono text-slate-300">₹{opt.premium_paid.toLocaleString()}</span></div>
            <div className="flex justify-between items-center py-2 border-t border-white/5 mt-2">
                <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full font-bold">{opt.is_settled ? 'FINALIZED' : 'OPEN POS'}</span>
                <span className="text-[8px] font-mono opacity-40">{new Date(opt.expires_at+'Z').toLocaleDateString()} {new Date(opt.expires_at+'Z').toLocaleTimeString()}</span>
            </div>
        </div>
    </div>
);

const WalletTab = ({ balance, token }) => {
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");

    const handleAddMoney = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg("");
        try {
            await apiFetch("/payments/add-money", "POST", { amount: parseFloat(amount), upi_id: "user@upi" }, token);
            setMsg("Payment processing initiated. Please wait...");
            setAmount("");
        } catch (err) {
            setMsg(err.message);
        }
        setLoading(false);
    };

    const handleWithdraw = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg("");
        try {
            await apiFetch("/payments/withdraw", "POST", { amount: parseFloat(amount), account_details: "userbank@upi" }, token);
            setMsg("Withdrawal processed successfully.");
            setAmount("");
        } catch (err) {
            setMsg(err.message);
        }
        setLoading(false);
    };

    return (
        <div className="max-w-md mx-auto mt-10">
            <div className="bg-dark p-6 rounded-xl border border-slate-800 shadow-xl">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                    <i data-lucide="wallet" className="text-primary"></i> Wallet
                </h2>
                
                <div className="mb-8 p-6 bg-darker rounded-lg text-center border border-slate-700">
                    <p className="text-slate-400 mb-2">Available Balance</p>
                    <h3 className="text-4xl font-mono font-bold text-slate-100">₹{balance.toFixed(2)}</h3>
                </div>

                <form>
                    <label className="block text-sm font-bold mb-2">Amount to Add / Withdraw (₹)</label>
                    <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} required min="1"
                           className="w-full p-3 rounded bg-darker border border-slate-700 focus:border-primary outline-none transition mb-4" />
                    
                    <div className="flex gap-4 mt-2">
                        <button onClick={handleAddMoney} disabled={loading} className={`flex-1 font-bold py-3 rounded transition ${loading ? 'bg-slate-700 text-slate-400' : 'bg-primary hover:bg-blue-600 text-white'}`}>
                            Add Money
                        </button>
                        <button onClick={handleWithdraw} disabled={loading} className={`flex-1 font-bold py-3 rounded transition ${loading ? 'bg-slate-700 text-slate-400' : 'bg-danger hover:bg-red-600 text-white'}`}>
                            Withdraw
                        </button>
                    </div>
                </form>

                {msg && <div className="mt-4 p-3 bg-slate-800 text-slate-300 rounded text-sm text-center border border-slate-700">{msg}</div>}
            </div>
        </div>
    );
};

const PsychologyMeter = ({ token }) => {
    const [bias, setBias] = useState({ score: 0.5, recommendation: 'STABLE', tilt_detected: false });
    
    useEffect(() => {
        const fetchBias = async () => {
            try {
                const data = await apiFetch("/trade/psychology/bias", "GET", null, token);
                setBias(data);
            } catch(e) {}
        };
        fetchBias();
        const int = setInterval(fetchBias, 10000); 
        return () => clearInterval(int);
    }, [token]);

    return (
        <div className={`px-4 py-2 rounded-xl border backdrop-blur-md shadow-lg transition-all duration-500 ${bias.tilt_detected ? 'bg-red-500/20 border-red-500/40 animate-pulse' : 'bg-slate-900/40 border-white/5'}`}>
            <div className="flex items-center gap-3">
                <div className="relative w-8 h-8">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="16" cy="16" r="14" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                        <circle cx="16" cy="16" r="14" fill="transparent" 
                            stroke={bias.tilt_detected ? '#ef4444' : '#3b82f6'} 
                            strokeWidth="3" 
                            strokeDasharray={88} 
                            strokeDashoffset={88 - (88 * bias.score)}
                            className="transition-all duration-1000" 
                        />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white">
                        {Math.round(bias.score * 100)}%
                    </div>
                </div>
                <div>
                    <div className="text-[9px] font-black text-slate-500 uppercase flex items-center gap-1">
                        <i data-lucide="brain" className="w-3 h-3"></i> Bias Shield
                    </div>
                    <div className={`text-[10px] font-bold leading-none mt-0.5 ${bias.tilt_detected ? 'text-red-400' : 'text-blue-400'}`}>
                        {bias.tilt_detected ? 'REVENGE DETECTED' : bias.recommendation}
                    </div>
                </div>
            </div>
        </div>
    );
};

const OrderBookDepth = ({ symbol }) => {
    return (
        <div className="h-full flex flex-col font-mono text-[10px]">
            <div className="flex-1 overflow-y-auto">
                <div className="p-2 space-y-1">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex justify-between items-center px-2 py-0.5 bg-red-400/5 hover:bg-red-400/10 transition-colors group">
                            <span className="text-red-400 font-bold">{(22000 + (6-i)*0.5).toFixed(2)}</span>
                            <div className="flex-1 mx-2 h-1 bg-red-400/10 rounded-full overflow-hidden relative">
                                <div className="h-full bg-red-400/40" style={{ width: `${30 + Math.random()*60}%` }}></div>
                            </div>
                            <span className="text-slate-500 font-bold group-hover:text-red-400">{Math.floor(Math.random()*200)}</span>
                        </div>
                    ))}
                    <div className="py-2 text-center border-y border-white/10 my-1 bg-white/5 font-black text-white text-xs">
                        22,000.45 <span className="text-[8px] opacity-40 ml-1">LTP</span>
                    </div>
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex justify-between items-center px-2 py-0.5 bg-emerald-400/5 hover:bg-emerald-400/10 transition-colors group">
                            <span className="text-emerald-400 font-bold">{(22000 - (i+1)*0.5).toFixed(2)}</span>
                            <div className="flex-1 mx-2 h-1 bg-emerald-400/10 rounded-full overflow-hidden relative">
                                <div className="h-full bg-emerald-400/40" style={{ width: `${20 + Math.random()*70}%` }}></div>
                            </div>
                            <span className="text-slate-500 font-bold group-hover:text-emerald-400">{Math.floor(Math.random()*250)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

const ProOptionsChain = ({ symbol, token }) => {
    const [chain, setChain] = useState(null);
    const [loading, setLoading] = useState(false);
    const [side, setSide] = useState('CALL');
    const [qty, setQty] = useState(50);
    const [buying, setBuying] = useState(false);

    const loadChain = async () => {
        setLoading(true);
        try {
            const data = await apiFetch(`/trade/options/chain/${symbol}`, 'GET', null, token);
            setChain(data.chain);
        } catch(e) {}
        setLoading(false);
    };

    useEffect(() => { if(symbol) loadChain(); }, [symbol]);

    const handleBuy = async (strike) => {
        setBuying(true);
        try {
            await apiFetch("/trade/options/buy", "POST", {
                symbol: symbol,
                strike_price: strike,
                quantity: qty,
                option_type: side,
                expires_in_minutes: 43200 // 30 days
            }, token);
            alert(`Derivative Position Opened: ${qty} x ${symbol} ₹${strike} ${side}`);
        } catch (e) {
            alert(e.message);
        }
        setBuying(false);
    };

    if (loading) return <div className="p-10 text-center animate-pulse text-amber-500 italic text-[10px] font-black tracking-widest uppercase">Initializing Greeks Architecture...</div>;
    if (!chain) return <div className="p-10 text-center text-slate-500 italic text-[10px] uppercase font-black">No derivative depth found for {symbol}</div>;

    return (
        <div className="flex flex-col h-full font-mono">
            <div className="bg-slate-900 px-4 py-3 border-b border-white/5 flex justify-between items-center shrink-0">
               <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/5">
                    <button onClick={() => setSide('CALL')} className={`px-4 py-1.5 rounded-md text-[9px] font-black transition-all ${side === 'CALL' ? 'bg-emerald-500 text-white shadow-xl shadow-emerald-500/20' : 'text-slate-500'}`}>CALLS</button>
                    <button onClick={() => setSide('PUT')} className={`px-4 py-1.5 rounded-md text-[9px] font-black transition-all ${side === 'PUT' ? 'bg-rose-500 text-white shadow-xl shadow-rose-500/20' : 'text-slate-500'}`}>PUTS</button>
               </div>
               <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-500 uppercase font-black">Qty</span>
                    <input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} className="w-12 bg-black/40 border border-white/5 rounded px-2 py-1 text-[10px] text-white font-bold" />
               </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-[9px]">
                    <thead className="sticky top-0 bg-slate-900 z-10 border-b border-white/10">
                        <tr className="text-slate-600 font-black uppercase">
                            <th className="p-3">Strike</th>
                            <th className="p-3 text-right">Premium</th>
                            <th className="p-3 text-right">Delta</th>
                            <th className="p-3 text-center">Trade</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {chain.map((row, idx) => {
                            const data = side === 'CALL' ? row.call : row.put;
                            const isATM = row.moneyness === 'ATM';
                            return (
                                <tr key={idx} className={`group hover:bg-white/5 transition-all ${isATM ? 'bg-blue-500/10' : ''}`}>
                                    <td className="p-3 font-bold text-slate-200">
                                        ₹{row.strike.toLocaleString()}
                                        {isATM && <span className="ml-1 text-[7px] bg-blue-500/40 text-blue-400 px-1 rounded uppercase">ATM</span>}
                                    </td>
                                    <td className={`p-3 text-right font-black ${side === 'CALL' ? 'text-emerald-400' : 'text-rose-400'}`}>₹{data.price.toFixed(2)}</td>
                                    <td className="p-3 text-right font-medium text-slate-500">{data.delta.toFixed(2)}</td>
                                    <td className="p-3 text-center">
                                        <button disabled={buying} onClick={() => handleBuy(row.strike)} className={`px-2 py-1 rounded font-black text-[8px] uppercase transition-all shadow-lg ${side === 'CALL' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white'}`}>
                                            Enter
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ProTerminalTab = ({ livePrices, priceHistory, orders, token }) => {
    const allSymbols = Object.keys(livePrices);
    const defaultSymbols = allSymbols.length >= 4 
        ? allSymbols.filter(s => !s.includes('_INR')).slice(0, 4) 
        : ["RELIANCE", "TCS", "INFY", "HDFCBANK"];
    
    const [panelSymbols, setPanelSymbols] = useState(defaultSymbols.slice(0, 4));
    const [layout, setLayout] = useState('2x2'); // '2x2', '1+2', '1x1'
    const [editingPanel, setEditingPanel] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showPatterns, setShowPatterns] = useState(false);
    const [sidebarTab, setSidebarTab] = useState('depth'); // 'depth' or 'options'
    const [detectedPatterns, setDetectedPatterns] = useState({}); // { symbol: [patterns] }

    const fetchPatterns = async (symbol) => {
        try {
            const data = await apiFetch(`/trade/patterns/${symbol}`, 'GET');
            if (data && data.patterns) {
                setDetectedPatterns(prev => ({ ...prev, [symbol]: data.patterns }));
            }
        } catch(e) {}
    };

    useEffect(() => {
        if (showPatterns) {
            panelSymbols.forEach(sym => {
                if (!detectedPatterns[sym]) fetchPatterns(sym);
            });
        }
    }, [showPatterns, panelSymbols]);
    
    const panelCount = layout === '2x2' ? 4 : layout === '1+2' ? 3 : 1;
    const displaySymbols = panelSymbols.slice(0, panelCount);
    
    const selectSymbol = (sym) => {
        const updated = [...panelSymbols];
        updated[editingPanel] = sym;
        setPanelSymbols(updated);
        setEditingPanel(null);
        setSearchQuery('');
    };
    
    const filteredSymbols = allSymbols.filter(s => 
        s.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 20);
    
    const gridClass = layout === '2x2' 
        ? 'grid-cols-1 md:grid-cols-2'
        : layout === '1+2' 
        ? 'grid-cols-1 md:grid-cols-3'
        : 'grid-cols-1';

    return (
        <div className="h-full flex flex-col absolute inset-0 md:relative md:inset-auto p-2 md:p-0">
            {/* Extended Toolbar */}
            <div className="flex flex-wrap justify-between items-center mb-3 gap-2 px-1">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-black italic bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                        PRO TERMINAL
                    </h2>
                    <PsychologyMeter token={token} />
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-slate-800 p-0.5 rounded-lg mr-2 border border-slate-700">
                        {[{id:'1x1',label:'1'},{id:'1+2',label:'1+2'},{id:'2x2',label:'2×2'}].map(l => (
                            <button key={l.id} onClick={() => setLayout(l.id)}
                                className={`px-2.5 py-1 rounded text-[10px] font-black uppercase transition ${
                                    layout === l.id ? 'bg-primary text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-slate-300'
                                }`}>{l.label}</button>
                        ))}
                    </div>
                    <button onClick={() => setShowPatterns(!showPatterns)}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black transition border ${
                            showPatterns ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' : 'bg-slate-900/50 text-slate-500 border-white/5 hover:text-slate-300'
                        }`}>
                        <i data-lucide="brain" className="w-4 h-4"></i> AI PATTERNS
                    </button>
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Live Connectivity</span>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 flex gap-4 overflow-hidden">
                <div className={`grid ${gridClass} gap-4 flex-1 overflow-hidden`}>
                    {displaySymbols.map((symbol, idx) => {
                        const hist = priceHistory[symbol] || [];
                        const firstPrice = hist.length >= 2 ? hist[0].close : (livePrices[symbol] || 0);
                        const liveP = livePrices[symbol] || 0;
                        const pctChange = firstPrice ? ((liveP - firstPrice) / firstPrice * 100) : 0;
                        return (
                            <div key={idx}
                                className={`bg-dark/60 border border-white/5 hover:border-blue-500/30 transition-all rounded-2xl flex flex-col overflow-hidden shadow-2xl relative group/chart ${
                                    layout === '1+2' && idx === 0 ? 'md:col-span-2 md:row-span-1' : ''
                                }`}>
                                {/* Panel header */}
                                <div className="flex justify-between items-center px-4 py-3 border-b border-white/5 z-10 bg-slate-900/40 backdrop-blur-xl shrink-0">
                                    <button onClick={() => setEditingPanel(idx)} className="font-black text-white flex items-center gap-2 hover:text-blue-400 transition group tracking-tight text-sm uppercase italic">
                                        <i data-lucide="crosshair" className="w-3.5 h-3.5 text-blue-400"></i>
                                        <span>{symbol}</span>
                                        <i data-lucide="search" className="w-3 h-3 text-slate-500 group-hover:text-blue-400 opacity-0 group-hover:opacity-100"></i>
                                    </button>
                                    <div className="flex items-center gap-4">
                                        <span className={`text-[10px] font-black italic ${pctChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {pctChange >= 0 ? '▲' : '▼'}{Math.abs(pctChange).toFixed(2)}%
                                        </span>
                                        <span className="text-white font-black font-mono text-sm leading-none tabular-nums tracking-tighter">₹{liveP.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                    </div>
                                </div>
                                <div className="flex-1 w-full relative overflow-hidden bg-black/20">
                                    {(() => {
                                        const activeOrder = (orders || []).find(o => o.symbol === symbol && o.status === 'EXECUTED' && o.side === 'BUY');
                                        const brackets = activeOrder ? { stopLoss: activeOrder.stop_loss_price, takeProfit: activeOrder.take_profit_price, entry: activeOrder.price } : null;
                                        const patterns = showPatterns ? (detectedPatterns[symbol] || []) : [];
                                        return <ProChart data={hist} symbol={symbol} compact={true} patterns={patterns} brackets={brackets} />;
                                    })()}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Institutional Sidebar (DOM / Options) */}
                <div className="hidden xl:flex w-80 bg-dark/40 rounded-2xl border border-white/5 flex-col overflow-hidden shadow-2xl backdrop-blur-md">
                    <div className="p-1 border-b border-white/5 flex justify-between items-center bg-slate-900/60 shrink-0">
                        <button onClick={() => setSidebarTab('depth')} 
                            className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${sidebarTab === 'depth' ? 'text-orange-400 bg-orange-400/10' : 'text-slate-500 hover:text-slate-300'}`}>
                            <i data-lucide="layers" className="w-3.5 h-3.5"></i> DEPTH
                        </button>
                        <button onClick={() => setSidebarTab('options')} 
                            className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${sidebarTab === 'options' ? 'text-amber-400 bg-amber-400/10' : 'text-slate-500 hover:text-slate-300'}`}>
                            <i data-lucide="network" className="w-3.5 h-3.5"></i> OPTIONS
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {sidebarTab === 'depth' ? (
                            <OrderBookDepth symbol={displaySymbols[0]} />
                        ) : (
                            <ProOptionsChain symbol={displaySymbols[0]} token={token} />
                        )}
                    </div>
                    <div className="p-4 bg-slate-900/80 border-t border-white/5 text-[10px] font-medium text-slate-500 italic">
                        {sidebarTab === 'depth' ? 'Real-time liquidity heatmap from Institutional Gateways.' : 'High-Greeks Derivatives Chain (Black-Scholes)'}
                    </div>
                </div>
            </div>

            {/* Symbol Picker Modal */}
            {editingPanel !== null && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4">
                    <div className="bg-slate-900 rounded-3xl border border-white/10 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150">
                        <div className="p-6 border-b border-white/5">
                            <h3 className="text-lg font-black text-white mb-4 uppercase italic">Search Asset</h3>
                            <div className="relative">
                                <input autoFocus type="text" placeholder="Type symbol..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} 
                                    className="w-full bg-slate-800 border-none rounded-xl px-12 py-4 text-white text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                                <i data-lucide="search" className="absolute left-4 top-4 text-slate-500 w-5 h-5"></i>
                            </div>
                        </div>
                        <div className="max-h-80 overflow-y-auto p-2 custom-scrollbar">
                            {filteredSymbols.map(sym => (
                                <button key={sym} onClick={() => selectSymbol(sym)}
                                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-blue-600/10 text-sm font-bold text-slate-300 hover:text-blue-400 transition-all flex justify-between items-center group"
                                >
                                    <span>{sym}</span>
                                    <span className="text-[10px] font-mono p-1 bg-white/5 rounded text-slate-500 group-hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">SELECT</span>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setEditingPanel(null)} className="w-full p-4 text-slate-500 text-xs font-black uppercase tracking-widest bg-black/40 hover:text-white transition-colors">Close Search</button>
                    </div>
                </div>
            )}
        </div>
    );
};

const IPOTab = ({ wallet, token }) => {
    const [ipos, setIpos] = useState([]);
    const [bids, setBids] = useState({});
    
    useEffect(() => {
        apiFetch("/trade/ipos", "GET", null, token)
            .then(data => {
                setIpos(data);
                const newBids = {};
                data.forEach(i => { if(i.has_bid) newBids[i.symbol] = true; });
                setBids(newBids);
            })
            .catch(console.error);
    }, [token]);

    const handleBid = async (symbol, cost) => {
        if(wallet.balance < cost) return alert("Insufficient funds to place IPO bid!");
        try {
            await apiFetch(`/trade/ipo/${symbol}/bid`, "POST", null, token);
            setBids(prev => ({...prev, [symbol]: true}));
            alert(`Successfully queued bid for ${symbol}! Allocation results will be announced dynamically.`);
            apiFetch("/trade/ipos", "GET", null, token).then(setIpos);
        } catch (e) {
            alert(e.message);
        }
    };

    return (
        <div className="max-w-4xl mx-auto md:mt-4">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-3"><i data-lucide="rocket" className="text-yellow-500 w-8 h-8"></i> IPO Bidding Center</h2>
                    <p className="mt-2 text-sm text-slate-400">Lock funds to bid for upcoming high-profile mock Initial Public Offerings.</p>
                </div>
                <div className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 px-3 py-1.5 rounded text-sm font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(234,179,8,0.15)]"><i data-lucide="alert-triangle" className="w-4 h-4"></i> EXTREME VOLATILITY</div>
            </div>

            <div className="grid gap-5">
                {ipos.map((ipo, idx) => {
                    const cost = ipo.price * ipo.minQty;
                    const hasBid = bids[ipo.symbol];
                    return (
                        <div key={idx} className={`bg-dark border rounded-xl p-5 md:p-6 relative overflow-hidden transition shadow-xl ${ipo.status === 'OPEN' ? 'border-slate-700 hover:border-slate-500' : 'border-slate-800 opacity-60'}`}>
                            {hasBid && <div className="absolute top-0 right-0 bg-success text-white text-[10px] font-bold px-8 py-1 transform translate-x-6 translate-y-3 md:translate-y-4 rotate-45 shadow-lg tracking-widest">BID PLACED</div>}
                            <div className="flex flex-col md:flex-row justify-between gap-6 md:items-center">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-xl md:text-2xl font-bold text-white">{ipo.name}</h3>
                                        <span className="bg-slate-900 border border-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded font-mono shadow-inner">{ipo.symbol}</span>
                                        {ipo.status === 'OPEN' ? <span className="bg-success/20 text-success text-[10px] font-bold px-2 py-0.5 rounded border border-success/30 animate-pulse tracking-wide">LIVE NOW</span> : <span className="bg-danger/10 text-danger text-[10px] font-bold px-2 py-0.5 rounded border border-danger/30">CLOSED</span>}
                                    </div>
                                    <p className="text-slate-400 text-sm mb-5 leading-relaxed">{ipo.description}</p>
                                    
                                    <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm bg-slate-900/50 p-3 rounded-lg border border-slate-800/80 inline-flex w-full md:w-auto">
                                        <div><span className="text-slate-500 block text-xs uppercase tracking-wider mb-1">Issue Price</span> <span className="font-mono font-bold text-lg text-white">₹{ipo.price.toLocaleString()}</span></div>
                                        <div className="border-l border-slate-700 pl-8"><span className="text-slate-500 block text-xs uppercase tracking-wider mb-1">Lot Size</span> <span className="font-bold text-lg text-white">{ipo.minQty} Shares</span></div>
                                        <div className="border-l border-slate-700 pl-8"><span className="text-slate-500 block text-xs uppercase tracking-wider mb-1">Req. Margin</span> <span className="font-mono font-bold text-lg text-yellow-500">₹{cost.toLocaleString()}</span></div>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col items-end gap-3 min-w-[200px] border-t md:border-t-0 md:border-l border-slate-800 pt-5 md:pt-0 md:pl-6 mt-2 md:mt-0">
                                    <div className="text-right w-full flex md:flex-col justify-between md:justify-start items-center md:items-end mb-2 md:mb-0">
                                        <span className="text-xs text-slate-500 uppercase font-bold tracking-widest block mb-1">Bidding Closes In</span>
                                        <span className="font-mono text-xl text-slate-300 font-bold bg-darker px-2 py-1 rounded">{ipo.endsIn}</span>
                                    </div>
                                    <button 
                                        disabled={ipo.status !== 'OPEN' || hasBid} 
                                        onClick={()=>handleBid(ipo.symbol, cost)}
                                        className={`w-full py-4 rounded font-bold uppercase transition shadow-xl tracking-wider text-sm ${hasBid ? 'bg-slate-800/50 text-success border border-success/30 cursor-not-allowed' : ipo.status !== 'OPEN' ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed' : 'bg-primary hover:bg-blue-600 text-white hover:scale-[1.02] shadow-[0_5px_15px_rgba(59,130,246,0.3)]'}`}>
                                        {hasBid ? "Allocation Pending" : ipo.status === 'OPEN' ? "Place Bid Now" : "Bidding Closed"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- New Features Components ---

const BrokerDashboardTab = ({ token }) => {
    const [brokers, setBrokers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showConnect, setShowConnect] = useState(false);
    const [setup2FA, setSetup2FA] = useState(false);
    const [formData, setFormData] = useState({ broker_name: 'ALPACA', api_key: '', api_secret: '', is_live: false });

    useEffect(() => { 
        loadBrokers(); 
        if (window.lucide) window.lucide.createIcons();
    }, []);

    const loadBrokers = async () => {
        try {
            const data = await apiFetch("/trade/brokers", "GET", null, token);
            setBrokers(data || []);
        } catch(e) {}
    };

    const handleConnect = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await apiFetch("/trade/brokers/connect", "POST", formData, token);
            setShowConnect(false);
            loadBrokers();
        } catch(e) {
            alert("Connection failed. Check your API credentials.");
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col h-full gap-6 p-4 max-w-6xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center bg-dark/40 backdrop-blur-xl p-6 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h2 className="text-3xl font-black bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent italic">BROKER HUB</h2>
                    <p className="text-slate-400 text-sm font-medium tracking-tight">Manage your institutional execution gateways</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setSetup2FA(true)} className="flex items-center gap-2 px-5 py-2.5 bg-slate-800/50 hover:bg-slate-700/50 text-slate-200 rounded-xl border border-white/5 transition-all font-bold text-sm">
                        <i data-lucide="shield" className="w-4 h-4 text-emerald-400"></i>
                        Security Settings
                    </button>
                    <button onClick={() => setShowConnect(true)} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all font-bold text-sm">
                        <i data-lucide="link" className="w-4 h-4"></i>
                        Connect Broker
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="col-span-2 space-y-4">
                    <h3 className="text-slate-300 font-bold flex items-center gap-2 px-2">
                        <i data-lucide="activity" className="w-4 h-4 text-blue-400"></i> Connected Gateways
                    </h3>
                    {brokers.length === 0 ? (
                        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
                            <i data-lucide="monitor" className="w-12 h-12 text-slate-700 mx-auto mb-4"></i>
                            <p className="text-slate-500 font-medium">No active brokerage connections</p>
                            <p className="text-slate-600 text-xs mt-1">Simulated execution is currently active</p>
                        </div>
                    ) : (
                        brokers.map(b => (
                            <div key={b.id} className="bg-slate-900/60 border border-white/5 p-5 rounded-2xl flex justify-between items-center group hover:bg-slate-900/80 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                        <i data-lucide="key" className="w-6 h-6 text-blue-400"></i>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-100">{b.broker_name}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${b.is_live ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-400'}`}>
                                                {b.is_live ? 'Live' : 'Paper'}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono mt-1">API Key: ****{b.id}88</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold justify-end">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                                            Active
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-1">Latency: 14ms</div>
                                    </div>
                                    <button className="p-2 hover:bg-red-500/10 hover:text-red-400 text-slate-600 rounded-lg transition-colors">
                                        <i data-lucide="smartphone" className="w-5 h-5"></i>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/40 border border-indigo-500/10 p-6 rounded-2xl shadow-xl">
                        <h4 className="font-bold text-white mb-4 flex items-center gap-2">
                            <i data-lucide="shield" className="w-4 h-4 text-emerald-400"></i> Account Security
                        </h4>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-400">2FA Protection</span>
                                <span className="text-[10px] font-black bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded uppercase tracking-wider">Enabled</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-400">Trading PIN</span>
                                <span className="text-xs text-blue-400 underline cursor-pointer">Set PIN</span>
                            </div>
                            <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 mt-2">
                                <div className="flex gap-2 text-[10px] text-red-200 font-medium">
                                    <i data-lucide="alert-circle" className="w-4 h-4 flex-shrink-0"></i>
                                    Live trading requires mandatory IP white-listing.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showConnect && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-8">
                            <h3 className="text-2xl font-black text-white mb-2">CONNECT GATEWAY</h3>
                            <p className="text-slate-400 text-sm mb-6 font-medium italic">Link your institutional brokerage account</p>
                            <form onSubmit={handleConnect} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Broker Provider</label>
                                    <select value={formData.broker_name} onChange={e => setFormData({...formData, broker_name: e.target.value})}
                                        className="w-full bg-slate-800 border-white/5 rounded-xl px-4 py-3 text-slate-100 font-bold focus:ring-2 focus:ring-blue-500 outline-none appearance-none">
                                        <option value="ALPACA">Alpaca (Global Stocks)</option>
                                        <option value="BINANCE">Binance (Crypto)</option>
                                        <option value="ZERODHA">Kite Zerodha (India)</option>
                                        <option value="PAPER">Unified Paper Engine</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1">API Key</label>
                                    <input type="text" value={formData.api_key} onChange={e => setFormData({...formData, api_key: e.target.value})}
                                        placeholder="Enter your public key" required
                                        className="w-full bg-slate-800 border-white/5 rounded-xl px-4 py-3 text-slate-100 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1">API Secret</label>
                                    <input type="password" value={formData.api_secret} onChange={e => setFormData({...formData, api_secret: e.target.value})}
                                        placeholder="Enter your private secret" required
                                        className="w-full bg-slate-800 border-white/5 rounded-xl px-4 py-3 text-slate-100 font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                                <label className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl cursor-pointer group">
                                    <input type="checkbox" checked={formData.is_live} onChange={e => setFormData({...formData, is_live: e.target.checked})}
                                        className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-orange-500 focus:ring-orange-500" />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-200 group-hover:text-white transition">Enable Live Trading</span>
                                        <span className="text-[10px] text-orange-500 font-bold">WARNING: Real capital at risk</span>
                                    </div>
                                </label>
                                <div className="flex gap-3 pt-4">
                                    <button type="button" onClick={() => setShowConnect(false)} className="flex-1 py-3.5 text-slate-400 font-bold hover:text-white transition uppercase text-xs tracking-widest">Cancel</button>
                                    <button type="submit" disabled={loading} className="flex-2 px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-600/20 font-black text-xs tracking-widest uppercase disabled:opacity-50">
                                        {loading ? 'Authenticating...' : 'Connect Identity'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const HeatmapTab = ({ livePrices, priceHistory }) => {
    const [hoveredSym, setHoveredSym] = useState(null);
    const [filterSector, setFilterSector] = useState(null);
    const [whaleMode, setWhaleMode] = useState(false);
    
    // Map whale status (this would come from real trade tape history)
    const mockWhales = {"RELIANCE": true, "TCS": true, "HDFCBANK": true, "BTC_INR": true};
    
    // Realistic sector groupings with weighted flex
    const sectors = [
        { name: "IT & Technology", color: "#3b82f6", symbols: [
            { sym: "TCS", cap: 8 }, { sym: "INFY", cap: 6 }, { sym: "WIPRO", cap: 4 },
            { sym: "HCLTECH", cap: 5 }, { sym: "TECHM", cap: 3 }, { sym: "LTIM", cap: 2 }
        ]},
        { name: "Banking & Finance", color: "#10b981", symbols: [
            { sym: "HDFCBANK", cap: 9 }, { sym: "ICICIBANK", cap: 7 }, { sym: "SBIN", cap: 8 },
            { sym: "AXISBANK", cap: 5 }, { sym: "KOTAKBANK", cap: 6 }, { sym: "INDUSINDBK", cap: 3 }
        ]},
        { name: "Energy & Oil", color: "#f59e0b", symbols: [
            { sym: "RELIANCE", cap: 10 }, { sym: "ONGC", cap: 5 }, { sym: "BPCL", cap: 4 },
            { sym: "IOC", cap: 4 }, { sym: "NTPC", cap: 4 }
        ]},
        { name: "Auto & Industrial", color: "#8b5cf6", symbols: [
            { sym: "TATAMOTORS", cap: 6 }, { sym: "MARUTI", cap: 5 }, { sym: "BAJAJ-AUTO", cap: 4 },
            { sym: "HEROMOTOCO", cap: 3 }, { sym: "EICHERMOT", cap: 3 }
        ]},
        { name: "Crypto", color: "#f97316", symbols: [
            { sym: "BTC_INR", cap: 10 }, { sym: "ETH_INR", cap: 7 }, { sym: "SOL_INR", cap: 4 },
            { sym: "XRP_INR", cap: 4 }, { sym: "DOGE_INR", cap: 3 }
        ]},
        { name: "Mutual Funds", color: "#06b6d4", symbols: [
            { sym: "NIPPONIND", cap: 6 }, { sym: "ICICIPRU", cap: 5 }, { sym: "MIRAEASSET", cap: 5 },
            { sym: "AXISBLUECHIP", cap: 4 }, { sym: "HDFCMIDCAP", cap: 4 }
        ]},
    ];

    const displaySectors = filterSector ? sectors.filter(s => s.name === filterSector) : sectors;

    const getHeatColor = (pct, isPositive) => {
        const abs = Math.abs(pct);
        if (!isPositive) {
            if (abs < 0.5) return 'rgba(239,68,68,0.15)';
            if (abs < 1.5) return 'rgba(239,68,68,0.35)';
            if (abs < 3) return 'rgba(239,68,68,0.60)';
            return 'rgba(239,68,68,0.90)';
        } else {
            if (abs < 0.5) return 'rgba(16,185,129,0.15)';
            if (abs < 1.5) return 'rgba(16,185,129,0.35)';
            if (abs < 3) return 'rgba(16,185,129,0.60)';
            return 'rgba(16,185,129,0.90)';
        }
    };

    return (
        <div className="flex flex-col h-full mt-2">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4 max-w-7xl mx-auto w-full">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <i data-lucide="map" className="text-blue-400"></i> Market Sector Heatmap
                </h2>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => setFilterSector(null)} className={`px-3 py-1 rounded text-xs font-bold border transition ${
                        !filterSector ? 'bg-primary text-white border-primary' : 'border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}>All Sectors</button>
                    {sectors.map(s => (
                        <button key={s.name} onClick={() => setFilterSector(filterSector === s.name ? null : s.name)}
                            className={`px-3 py-1 rounded text-xs font-bold border transition ${
                                filterSector === s.name ? 'text-white border-current' : 'border-slate-700 text-slate-400 hover:border-slate-500'
                            }`}
                            style={filterSector === s.name ? { backgroundColor: s.color + '33', borderColor: s.color, color: s.color } : {}}>
                            {s.name}
                        </button>
                    ))}
                    <button onClick={() => setWhaleMode(!whaleMode)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold border transition ${
                            whaleMode ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'border-slate-700 text-slate-500 hover:text-slate-300'
                        }`}>
                        <i data-lucide="waves" className="w-3.5 h-3.5"></i>
                        <span>Whale Mode</span>
                    </button>
                </div>
            </div>
            
            <div className="bg-darker rounded-xl border border-slate-800 overflow-hidden shadow-2xl max-w-7xl mx-auto w-full flex flex-col gap-1.5 p-2">
                {displaySectors.map(sector => (
                    <div key={sector.name} className="flex flex-col rounded-lg overflow-hidden border border-slate-800" style={{ minHeight: '80px' }}>
                        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b border-slate-800/80 flex items-center gap-2"
                             style={{ backgroundColor: sector.color + '15', color: sector.color }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sector.color }}></span>
                            {sector.name}
                        </div>
                        <div className="flex flex-1 w-full">
                            {sector.symbols.map(({ sym, cap }) => {
                                const hist = priceHistory[sym] || [];
                                const currentP = livePrices[sym] || 0;
                                let percentChange = 0;
                                if (hist.length > 3) {
                                    const oldP = hist[Math.max(0, hist.length - Math.min(hist.length, 10))].close;
                                    percentChange = oldP ? ((currentP - oldP) / oldP * 100) : 0;
                                } else {
                                    // Seeded pseudo-random based on symbol name for consistency
                                    const seed = sym.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                                    percentChange = ((seed % 100) / 100 * 10) - 5;
                                }

                                const isPositive = percentChange >= 0;
                                const bgColor = getHeatColor(percentChange, isPositive);
                                const isHovered = hoveredSym === sym;

                                return (
                                    <div key={sym}
                                        onMouseEnter={() => setHoveredSym(sym)}
                                        onMouseLeave={() => setHoveredSym(null)}
                                        className={`flex flex-col items-center justify-center text-center cursor-default border-r border-black/20 last:border-0 relative transition-all overflow-hidden group ${
                                            whaleMode && !mockWhales[sym] ? 'opacity-20 grayscale' : 'opacity-100 grayscale-0'
                                        }`}
                                        style={{ 
                                            flexGrow: cap, 
                                            backgroundColor: bgColor,
                                            padding: '6px',
                                            minWidth: '60px'
                                        }}>
                                        {isHovered && (
                                            <div className="absolute inset-0 bg-white/5 z-0"></div>
                                        )}
                                        <div className="font-bold text-white text-xs md:text-sm leading-tight drop-shadow">{sym}</div>
                                        <div className={`text-xs font-mono font-bold ${isPositive ? 'text-green-200' : 'text-red-200'}`}>
                                            {isPositive ? '+' : ''}{percentChange.toFixed(2)}%
                                        </div>
                                        {currentP > 0 && (
                                            <div className="text-[10px] text-white/60 mt-0.5">₹{currentP.toFixed(currentP > 1000 ? 0 : 2)}</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <p className="text-xs text-slate-600 mt-3 text-center max-w-7xl mx-auto w-full">Color intensity reflects price momentum. Click a sector filter to focus.</p>
        </div>
    );
};

const SandboxEquityCurve = ({ capital, finalValue, trades }) => {
    const canvasRef = useRef();
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width = canvas.offsetWidth;
        const H = canvas.height = canvas.offsetHeight;
        
        // Generate synthetic equity curve
        const points = [capital];
        const totalTrades = Math.max(trades, 10);
        let current = capital;
        for (let i = 1; i <= totalTrades; i++) {
            const noisePos = Math.random() > 0.45;
            const noiseAmt = (Math.random() * 0.04) * current;
            current += noisePos ? noiseAmt : -noiseAmt * 0.6;
            points.push(current);
        }
        // Force endpoint near finalValue
        points[points.length - 1] = finalValue;
        
        const minVal = Math.min(...points);
        const maxVal = Math.max(...points);
        const range = maxVal - minVal || 1;
        const pad = 10;
        
        const toX = i => pad + (i / (points.length - 1)) * (W - pad * 2);
        const toY = v => H - pad - ((v - minVal) / range) * (H - pad * 2);
        
        // Gradient fill
        const isProfit = finalValue >= capital;
        const gradient = ctx.createLinearGradient(0, 0, 0, H);
        gradient.addColorStop(0, isProfit ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.clearRect(0, 0, W, H);
        
        // Horizontal baseline
        const baseY = toY(capital);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(100,116,139,0.3)';
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 1;
        ctx.moveTo(pad, baseY); ctx.lineTo(W - pad, baseY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Fill area
        ctx.beginPath();
        ctx.moveTo(toX(0), H);
        points.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
        ctx.lineTo(toX(points.length - 1), H);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Line
        ctx.beginPath();
        ctx.strokeStyle = isProfit ? '#10b981' : '#ef4444';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        points.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
        ctx.stroke();
    }, [capital, finalValue, trades]);
    
    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};

const SandboxTab = ({ livePrices, priceHistory, token }) => {
    const [strategy, setStrategy] = useState("sma_crossover");
    const [asset, setAsset] = useState("RELIANCE");
    const [capital, setCapital] = useState("100000");
    const [isSimulating, setIsSimulating] = useState(false);
    const [result, setResult] = useState(null);

    const runSimulation = async () => {
        setIsSimulating(true);
        setResult(null);
        try {
            const data = await apiFetch("/trade/sandbox", "POST", { strategy, asset, capital: parseFloat(capital) }, token);
            setResult(data);
        } catch (e) { alert(e.message); }
        setIsSimulating(false);
    };

    const stratLabels = {
        sma_crossover: { name: 'SMA Golden Cross', desc: 'Buy when SMA50 crosses above SMA200. Classic trend-following.', color: '#facc15' },
        mean_reversion: { name: 'BB Mean Reversion', desc: 'Buy when price touches lower Bollinger Band. Sell at mean.', color: '#06b6d4' },
        momentum: { name: 'RSI Momentum', desc: 'Enter positions when RSI breaks out of oversold zone above 30.', color: '#a855f7' },
    };
    const activeStrat = stratLabels[strategy];

    return (
        <div className="max-w-5xl mx-auto mt-4">
            <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
                <i data-lucide="flask-conical" className="text-purple-400"></i> Quant Sandbox
            </h2>
            <p className="text-slate-400 mb-6 text-sm">Design algorithmic conditional strategies and backtest them against historical data.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {/* Config Panel */}
                <div className="md:col-span-2 bg-dark border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                    <h3 className="text-lg font-bold mb-4 border-b border-slate-700/50 pb-2">Strategy Parameters</h3>
                    
                    <div className="space-y-4 relative z-10">
                        <div>
                            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">Algorithm</label>
                            <div className="space-y-2">
                                {Object.entries(stratLabels).map(([key, s]) => (
                                    <button key={key} onClick={() => setStrategy(key)}
                                        className={`w-full text-left px-3 py-2.5 rounded border transition ${
                                            strategy === key ? 'border-current bg-opacity-10' : 'border-slate-700 hover:border-slate-600'
                                        }`}
                                        style={strategy === key ? { borderColor: s.color, backgroundColor: s.color + '15', color: s.color } : {}}>
                                        <div className="font-bold text-sm">{s.name}</div>
                                        <div className="text-xs opacity-70">{s.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Asset</label>
                                <select value={asset} onChange={e=>setAsset(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 focus:outline-none focus:border-purple-400 text-sm">
                                    {["RELIANCE","BTC_INR","HDFCBANK","TCS","NIPPONIND","ETH_INR","INFY","SBIN"].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Simulated Capital (₹)</label>
                            <input type="number" value={capital} onChange={e=>setCapital(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 focus:outline-none focus:border-purple-400 text-sm font-mono" />
                        </div>
                        <button onClick={runSimulation} disabled={isSimulating}
                            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded transition shadow-lg shadow-purple-900/50 flex justify-center items-center gap-2">
                            {isSimulating ? <i data-lucide="loader" className="animate-spin w-4 h-4"></i> : <i data-lucide="play" className="w-4 h-4"></i>}
                            {isSimulating ? "Backtesting..." : "Run Backtest"}
                        </button>
                    </div>
                </div>

                {/* Results Panel */}
                <div className="md:col-span-3 bg-slate-900/50 border border-slate-800 rounded-xl p-6 shadow-inner flex flex-col">
                    {!result && !isSimulating && (
                        <div className="flex-1 text-slate-500 flex flex-col items-center justify-center">
                            <i data-lucide="bar-chart-2" className="w-16 h-16 mb-4 opacity-20"></i>
                            <p className="text-center">Configure parameters and run a simulation<br/>to generate backtest analytics.</p>
                        </div>
                    )}
                    {isSimulating && (
                        <div className="flex-1 text-purple-400 flex flex-col items-center justify-center animate-pulse">
                            <i data-lucide="activity" className="w-16 h-16 mb-4"></i>
                            <p className="font-mono text-sm">Simulating {asset} market conditions...</p>
                        </div>
                    )}
                    {result && !isSimulating && (
                        <div className="flex flex-col h-full">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <div className="text-slate-500 text-xs uppercase tracking-wider">Net P&L</div>
                                    <div className={`text-3xl font-bold font-mono ${result.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                        {result.pnl >= 0 ? '+' : ''}₹{result.pnl.toFixed(0)}
                                    </div>
                                    <div className="text-slate-400 font-mono text-sm">Final: ₹{result.finalValue.toFixed(0)}</div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-xs font-bold px-2 py-1 rounded border ${
                                        result.pnl >= 0 ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'
                                    }`}>{result.pnl >= 0 ? 'PROFITABLE' : 'UNPROFITABLE'}</div>
                                </div>
                            </div>
                            
                            {/* Equity Curve */}
                            <div className="flex-1 min-h-[150px] bg-dark rounded-lg border border-slate-800 overflow-hidden mb-4">
                                <SandboxEquityCurve capital={parseFloat(capital)} finalValue={result.finalValue} trades={result.trades} />
                            </div>
                            
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-dark p-3 rounded border border-slate-800 text-center">
                                    <div className="text-xs text-slate-500 uppercase">Win Rate</div>
                                    <div className="text-xl font-bold text-white">{result.winRate}%</div>
                                </div>
                                <div className="bg-dark p-3 rounded border border-slate-800 text-center">
                                    <div className="text-xs text-slate-500 uppercase">Total Trades</div>
                                    <div className="text-xl font-bold text-white">{result.trades}</div>
                                </div>
                                <div className="bg-dark p-3 rounded border border-slate-800 text-center">
                                    <div className="text-xs text-slate-500 uppercase">ROI</div>
                                    <div className={`text-xl font-bold ${result.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                        {((result.pnl / parseFloat(capital)) * 100).toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const CalendarTab = () => {
    const events = [
        { time: "00:15", title: "Federal Reserve Interest Rate Decision", impact: "HIGH", actual: "5.50%", forecast: "5.50%", prev: "5.25%", currency: "USD" },
        { time: "01:00", title: "Non-Farm Payrolls", impact: "HIGH", actual: "185K", forecast: "160K", prev: "150K", currency: "USD" },
        { time: "04:30", title: "RBI Monetary Policy Meeting", impact: "HIGH", actual: "Waiting", forecast: "6.50%", prev: "6.50%", currency: "INR" },
        { time: "11:00", title: "Crude Oil Inventories", impact: "MED", actual: "-1.2M", forecast: "0.5M", prev: "1.0M", currency: "USD" },
        { time: "14:15", title: "ECB President Lagarde Speaks", impact: "MED", actual: "--", forecast: "--", prev: "--", currency: "EUR" }
    ];

    return (
        <div className="max-w-5xl mx-auto mt-4">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2"><i data-lucide="calendar" className="text-red-400"></i> Global Macro Calendar</h2>
                <div className="bg-red-500/10 text-red-400 border border-red-500/30 px-3 py-1 text-xs font-bold rounded shadow-[0_0_10px_rgba(239,68,68,0.2)] animate-pulse">
                    VOLATILITY WARNING OVERRIDE
                </div>
            </div>

            <div className="bg-dark rounded-xl border border-slate-800 shadow-xl overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                    <thead className="bg-slate-900/80 border-b border-slate-800">
                        <tr>
                            <th className="p-4 text-slate-400 text-sm w-24">Time (IST)</th>
                            <th className="p-4 text-slate-400 text-sm w-16 text-center">Impact</th>
                            <th className="p-4 text-slate-400 text-sm">Event Trigger</th>
                            <th className="p-4 text-slate-400 text-sm text-right">Actual</th>
                            <th className="p-4 text-slate-400 text-sm text-right">Forecast</th>
                            <th className="p-4 text-slate-400 text-sm text-right hidden sm:table-cell">Previous</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {events.map((ev, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/30 transition group">
                                <td className="p-4 font-mono text-slate-300">{ev.time}</td>
                                <td className="p-4 text-center">
                                    <div className="flex justify-center gap-0.5" title={ev.impact}>
                                        <div className={`w-2 h-4 rounded-sm ${ev.impact === 'HIGH' || ev.impact === 'MED' ? (ev.impact === 'HIGH' ? 'bg-danger' : 'bg-yellow-500') : 'bg-slate-700'}`}></div>
                                        <div className={`w-2 h-4 rounded-sm ${ev.impact === 'HIGH' ? 'bg-danger' : 'bg-slate-700'}`}></div>
                                        <div className={`w-2 h-4 rounded-sm ${ev.impact === 'HIGH' ? 'bg-danger' : 'bg-slate-700'}`}></div>
                                    </div>
                                </td>
                                <td className="p-4 font-bold text-slate-200">
                                    <span className="text-xs font-bold bg-slate-800 text-primary px-2 py-0.5 rounded mr-2 border border-slate-700">{ev.currency}</span>
                                    {ev.title}
                                    {ev.actual === "Waiting" && <span className="ml-2 text-[10px] bg-red-500 text-white px-2 py-0.5 rounded animate-pulse">LIVE IMMINENT</span>}
                                </td>
                                <td className={`p-4 text-right font-bold ${ev.actual === 'Waiting' ? 'text-slate-500 animate-pulse' : 'text-white'}`}>{ev.actual}</td>
                                <td className="p-4 text-right text-slate-400">{ev.forecast}</td>
                                <td className="p-4 text-right text-slate-500 hidden sm:table-cell">{ev.prev}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-slate-500 mt-4 text-center">If a macro event triggers, global assets mapped to {`"USD"`} or {`"INR"`} may temporarily experience hyper-volatility spikes.</p>
        </div>
    );
};

const OTCTab = ({ token, wallet }) => {
    const [listings, setListings] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [newListing, setNewListing] = useState({ symbol: '', quantity: 1000, price: '' });

    const loadListings = () => {
        apiFetch("/trade/otc", "GET", null, token).then(setListings).catch(console.error);
    };
    useEffect(loadListings, [token]);

    const handleBuy = async (id, cost) => {
        if (wallet.balance < cost) return alert("Insufficient funds to buy this OTC block!");
        try {
            await apiFetch(`/trade/otc/${id}/buy`, "POST", null, token);
            alert("OTC Dark Pool Block successfully settled! (Simulated)");
            loadListings();
        } catch(e) { alert(e.message); }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await apiFetch("/trade/otc", "POST", { symbol: newListing.symbol.toUpperCase(), quantity: parseInt(newListing.quantity), price: parseFloat(newListing.price) }, token);
            alert("OTC Listing created!");
            setNewListing({ symbol: '', quantity: 1000, price: '' });
            setShowCreate(false);
            loadListings();
        } catch(e) { alert(e.message); }
    };

    return (
        <div className="max-w-6xl mx-auto mt-4">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2"><i data-lucide="briefcase" className="text-slate-400"></i> Peer-to-Peer OTC Dark Pool</h2>
                    <p className="text-slate-400 text-sm mt-1">Buy enormous blocks of assets directly from other traders off-market.</p>
                </div>
                <button onClick={() => setShowCreate(!showCreate)} className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded font-bold shadow-lg transition">Create Block Listing</button>
            </div>
            
            {showCreate && (
                <div className="bg-dark p-6 rounded-xl border border-primary/30 shadow-2xl mb-6">
                    <h3 className="text-lg font-bold mb-4">Create new off-market listing</h3>
                    <form onSubmit={handleCreate} className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="block text-xs text-slate-400 mb-1">Asset Symbol</label>
                            <input required value={newListing.symbol} onChange={e=>setNewListing({...newListing, symbol: e.target.value})} className="w-full bg-slate-800 border-none rounded p-2 text-white" placeholder="RELIANCE" />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs text-slate-400 mb-1">Quantity</label>
                            <input required type="number" value={newListing.quantity} onChange={e=>setNewListing({...newListing, quantity: e.target.value})} className="w-full bg-slate-800 border-none rounded p-2 text-white" />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs text-slate-400 mb-1">Total Asking Price Per Share</label>
                            <input required type="number" step="0.01" value={newListing.price} onChange={e=>setNewListing({...newListing, price: e.target.value})} className="w-full bg-slate-800 border-none rounded p-2 text-white" />
                        </div>
                        <button type="submit" className="bg-success hover:bg-green-600 text-white font-bold px-6 py-2 rounded">List Now</button>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map(l => {
                    const totalCost = l.quantity * l.price;
                    return (
                        <div key={l.id} className="bg-dark/80 backdrop-blur border border-slate-700 hover:border-slate-500 rounded-xl p-5 shadow-2xl relative overflow-hidden transition group">
                            {l.status === 'FILLED' && <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10"><div className="border-2 border-danger text-danger text-xl font-bold px-4 py-2 transform rotate-[-15deg] uppercase tracking-widest bg-dark shadow-2xl">FILLED / CLEARED</div></div>}
                            
                            <div className="flex justify-between items-start mb-3 border-b border-slate-800 pb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center"><i data-lucide="user" className="w-4 h-4 text-slate-400"></i></div>
                                    <span className="font-bold text-slate-300 text-sm">{l.seller}</span>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${l.status === 'OPEN' ? 'bg-success/20 text-success border-success/30' : 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30'}`}>
                                    {l.status}
                                </span>
                            </div>

                            <div className="flex justify-between items-end mb-4">
                                <div>
                                    <h3 className="text-2xl font-bold text-white mb-1"><span className="text-primary font-mono">{l.quantity.toLocaleString()}</span> {l.symbol}</h3>
                                    <div className="text-slate-500 text-sm">Offered @ ₹{l.price.toLocaleString()}/ea</div>
                                </div>
                            </div>

                            <div className="bg-slate-900 border border-slate-800 rounded p-3 mb-5">
                                <span className="text-xs text-slate-500 uppercase block mb-1">Total Block Settlement</span>
                                <span className="font-mono text-xl font-bold text-white">₹{totalCost.toLocaleString()}</span>
                            </div>

                            <button onClick={()=>handleBuy(l.id, totalCost)} disabled={l.status !== 'OPEN'} className="w-full bg-slate-800 hover:bg-primary border border-slate-700 hover:border-primary text-white font-bold py-3 rounded transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group-hover:shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                                <i data-lucide="shield-check" className="w-4 h-4"></i> Secure OTC Buy
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════
// FEATURE 1: SOCIAL SENTIMENT FEED TAB
// ═══════════════════════════════════════════════════════════════════
const SentimentTab = ({ token, livePrices }) => {
    const [posts, setPosts] = useState([]);
    const [trending, setTrending] = useState([]);
    const [filter, setFilter] = useState('ALL'); // ALL, BULLISH, BEARISH, NEUTRAL
    const [newPosts, setNewPosts] = useState([]);

    const loadData = async () => {
        try {
            const [feed, trend] = await Promise.all([
                apiFetch("/trade/sentiment/feed", "GET", null, token),
                apiFetch("/trade/sentiment/trending", "GET", null, token)
            ]);
            setPosts(feed.sort((a,b) => b.timestamp - a.timestamp));
            setTrending(trend);
        } catch(e) { console.error(e); }
    };

    useEffect(() => { loadData(); }, [token]);

    // Listen for real-time sentiment posts via WebSocket
    useEffect(() => {
        const handler = (e) => {
            try {
                const msg = JSON.parse(e.data || e);
                if (msg.type === 'sentiment_post') {
                    setNewPosts(prev => [msg.data, ...prev].slice(0, 50));
                }
            } catch {}
        };
        // Posts come through WebSocket in the Dashboard component
        // We piggyback on the global ws via a custom event
        window.addEventListener('ws_sentiment', (e) => {
            setNewPosts(prev => [e.detail, ...prev].slice(0, 50));
        });
        return () => window.removeEventListener('ws_sentiment', () => {});
    }, []);

    const allPosts = [...newPosts, ...posts].slice(0, 60);
    const filteredPosts = filter === 'ALL' ? allPosts : allPosts.filter(p => p.sentiment === filter);

    const sentBadge = (s) => {
        if (s === 'BULLISH') return 'text-success bg-success/10 border-success/30';
        if (s === 'BEARISH') return 'text-danger bg-danger/10 border-danger/30';
        return 'text-slate-400 bg-slate-800 border-slate-700';
    };
    const sentIcon = (s) => s === 'BULLISH' ? 'trending-up' : s === 'BEARISH' ? 'trending-down' : 'minus';

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <i data-lucide="message-circle" className="text-pink-400 w-6 h-6"></i> Social Sentiment Feed
                </h2>
                <div className="flex gap-2">
                    {['ALL','BULLISH','BEARISH','NEUTRAL'].map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-3 py-1 rounded text-xs font-bold border transition ${
                                filter === f 
                                    ? f === 'BULLISH' ? 'bg-success text-white border-success' 
                                    : f === 'BEARISH' ? 'bg-danger text-white border-danger'
                                    : f === 'NEUTRAL' ? 'bg-slate-600 text-white border-slate-500'
                                    : 'bg-primary text-white border-primary'
                                    : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                            {f}
                        </button>
                    ))}
                    <button onClick={loadData} className="px-3 py-1 rounded border border-slate-700 text-slate-400 hover:text-white text-xs transition">
                        <i data-lucide="refresh-cw" className="w-3 h-3 inline mr-1"></i>Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Feed */}
                <div className="lg:col-span-2 space-y-3 max-h-[75vh] overflow-y-auto pr-1 custom-scrollbar">
                    {filteredPosts.map((post, i) => (
                        <div key={post.id || i} className="bg-dark border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-xs font-bold">
                                        {post.user?.[0]}
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm">{post.user}</div>
                                        <div className="text-xs text-slate-500">
                                            {new Date(post.timestamp * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold bg-slate-800 text-primary px-2 py-0.5 rounded border border-slate-700">
                                        #{post.symbol}
                                    </span>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${sentBadge(post.sentiment)} flex items-center gap-1`}>
                                        <i data-lucide={sentIcon(post.sentiment)} className="w-3 h-3"></i>
                                        {post.sentiment}
                                    </span>
                                </div>
                            </div>
                            <p className="text-slate-200 text-sm leading-relaxed ml-10">{post.text}</p>
                            <div className="flex items-center gap-4 mt-2 ml-10">
                                <span className="text-xs text-slate-500 flex items-center gap-1 hover:text-pink-400 cursor-pointer transition">
                                    <i data-lucide="heart" className="w-3 h-3"></i> {post.likes}
                                </span>
                                <span className="text-xs text-slate-600 flex items-center gap-1">
                                    <i data-lucide="bar-chart" className="w-3 h-3"></i>
                                    ₹{(livePrices[post.symbol] || 0).toFixed(livePrices[post.symbol] > 1000 ? 0 : 2)}
                                </span>
                            </div>
                        </div>
                    ))}
                    {filteredPosts.length === 0 && (
                        <div className="text-slate-500 text-center py-20 border border-dashed border-slate-800 rounded-xl">
                            <i data-lucide="message-circle" className="w-12 h-12 mx-auto mb-3 opacity-20"></i>
                            <p>No {filter !== 'ALL' ? filter.toLowerCase() : ''} posts yet. Sentiment data streams live.</p>
                        </div>
                    )}
                </div>

                {/* Trending Sidebar */}
                <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <i data-lucide="flame" className="w-4 h-4 text-orange-400"></i> Trending Tickers
                    </h3>
                    <div className="space-y-2">
                        {trending.map((t, i) => (
                            <div key={t.symbol} className="bg-dark border border-slate-800 rounded-lg p-3 flex items-start gap-3">
                                <div className="text-slate-500 font-bold text-sm w-6 text-center pt-0.5">#{i+1}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-bold text-sm">{t.symbol}</span>
                                        <span className="text-xs text-slate-500">{t.mentions} mentions</span>
                                    </div>
                                    <div className="flex h-2 rounded-full overflow-hidden">
                                        <div className="bg-success" style={{ width: `${t.bull_pct}%` }}></div>
                                        <div className="bg-danger" style={{ width: `${t.bear_pct}%` }}></div>
                                        <div className="bg-slate-700 flex-1"></div>
                                    </div>
                                    <div className="flex justify-between text-[10px] mt-1">
                                        <span className="text-success">{t.bull_pct}% bull</span>
                                        <span className="text-danger">{t.bear_pct}% bear</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <i data-lucide="zap" className="w-4 h-4 text-yellow-400"></i> Sentiment Gauge
                        </h3>
                        <div className="bg-dark border border-slate-800 rounded-xl p-4">
                            {(() => {
                                const bullish = allPosts.filter(p => p.sentiment === 'BULLISH').length;
                                const bearish = allPosts.filter(p => p.sentiment === 'BEARISH').length;
                                const total = allPosts.length || 1;
                                const bullPct = Math.round(bullish / total * 100);
                                const bearPct = Math.round(bearish / total * 100);
                                const score = bullPct - bearPct;
                                return (
                                    <>
                                        <div className={`text-3xl font-bold text-center mb-2 ${score > 10 ? 'text-success' : score < -10 ? 'text-danger' : 'text-slate-300'}`}>
                                            {score > 20 ? '🚀 Extremely Bullish' : score > 5 ? '📈 Bullish' : score < -20 ? '💀 Extremely Bearish' : score < -5 ? '📉 Bearish' : '↔ Neutral'}
                                        </div>
                                        <div className="flex h-3 rounded-full overflow-hidden mb-2">
                                            <div className="bg-success transition-all" style={{ width: `${bullPct}%` }}></div>
                                            <div className="bg-danger transition-all" style={{ width: `${bearPct}%` }}></div>
                                            <div className="bg-slate-700 flex-1"></div>
                                        </div>
                                        <div className="flex justify-between text-xs text-slate-500">
                                            <span className="text-success font-bold">{bullPct}% 🐂</span>
                                            <span className="text-danger font-bold">{bearPct}% 🐻</span>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════
// FEATURE 2: LIVE TRADE TAPE (real-time scrolling feed)
// ═══════════════════════════════════════════════════════════════════
const TradeTapePanel = ({ tape }) => {
    const listRef = useRef(null);
    const [paused, setPaused] = useState(false);
    const [filterSym, setFilterSym] = useState('');
    const displayTape = (filterSym
        ? tape.filter(t => t.symbol?.toLowerCase().includes(filterSym.toLowerCase()))
        : tape).slice(0, 80);

    useEffect(() => {
        if (!paused && listRef.current) {
            listRef.current.scrollTop = 0;
        }
    }, [tape, paused]);

    return (
        <div className="flex flex-col h-full bg-darker border-l border-slate-800">
            <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                    TRADE TAPE
                </div>
                <button onClick={() => setPaused(p => !p)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition ${paused ? 'border-primary text-primary' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>
                    {paused ? '▶ LIVE' : '⏸ PAUSE'}
                </button>
            </div>
            <div className="px-2 py-1.5 border-b border-slate-800 shrink-0">
                <input placeholder="Filter symbol..." value={filterSym} onChange={e => setFilterSym(e.target.value)}
                    className="w-full bg-slate-900 text-xs rounded px-2 py-1 outline-none border border-slate-800 focus:border-primary text-white" />
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto text-xs font-mono">
                <table className="w-full">
                    <thead className="sticky top-0 bg-darker border-b border-slate-800/50 text-[10px] uppercase text-slate-600">
                        <tr>
                            <th className="p-1 text-left">Sym</th>
                            <th className="p-1 text-center">Side</th>
                            <th className="p-1 text-right">Qty</th>
                            <th className="p-1 text-right">Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayTape.map((t, i) => (
                            <tr key={i} className={`border-b border-slate-900 ${t.side === 'BUY' ? 'bg-success/5' : 'bg-danger/5'}`}>
                                <td className="p-1 text-white font-bold">{t.symbol}</td>
                                <td className={`p-1 text-center font-bold ${t.side === 'BUY' ? 'text-success' : 'text-danger'}`}>{t.side}</td>
                                <td className="p-1 text-right text-slate-300">{t.qty}</td>
                                <td className="p-1 text-right">
                                    <span className={`${t.qty > 30 ? 'text-yellow-400 font-bold' : 'text-slate-400'}`}>
                                        ₹{(t.price || 0).toFixed(t.price > 1000 ? 0 : 2)}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {displayTape.length === 0 && (
                    <div className="text-slate-600 text-center py-8 text-[10px] px-2">
                        Awaiting trade executions...
                    </div>
                )}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════
// FEATURE 3: ADVANCED OPTIONS CHAIN WITH GREEKS + PAYOFF DIAGRAM
// ═══════════════════════════════════════════════════════════════════
const PayoffCanvas = ({ chain, spot, optionType, selectedStrike }) => {
    const canvasRef = useRef();
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !chain || !chain.length) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width = canvas.offsetWidth;
        const H = canvas.height = canvas.offsetHeight;
        ctx.clearRect(0, 0, W, H);

        const strikes = chain.map(c => c.strike);
        const minS = strikes[0];
        const maxS = strikes[strikes.length - 1];
        const pad = { t: 15, b: 30, l: 50, r: 15 };
        const dw = W - pad.l - pad.r;
        const dh = H - pad.t - pad.b;

        const toX = s => pad.l + (s - minS) / (maxS - minS) * dw;

        // Use selected strike if provided, else ATM fallback
        const targetStrikeItem = chain.find(c => c.strike === selectedStrike) || chain.find(c => c.moneyness === 'ATM') || chain[Math.floor(chain.length/2)];
        const strike = targetStrikeItem.strike;
        const premium = optionType === 'CALL' ? targetStrikeItem.call.price : targetStrikeItem.put.price;

        const priceRange = strikes;
        const payoffs = priceRange.map(p => {
            if (optionType === 'CALL') return Math.max(0, p - strike) - premium;
            else return Math.max(0, strike - p) - premium;
        });

        const minP = Math.min(...payoffs);
        const maxP = Math.max(...payoffs);
        const range = maxP - minP || 1;
        const toY = p => pad.t + dh - ((p - minP) / range * dh);

        // Grid
        ctx.strokeStyle = 'rgba(100,116,139,0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        const zeroY = toY(0);
        ctx.moveTo(pad.l, zeroY); ctx.lineTo(W - pad.r, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Labels
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(maxP.toFixed(0), pad.l - 4, pad.t + 8);
        ctx.fillText('0', pad.l - 4, zeroY + 4);
        ctx.fillText(minP.toFixed(0), pad.l - 4, H - pad.b - 4);
        ctx.textAlign = 'center';
        ctx.fillText(`Strike ₹${strike.toFixed(0)}`, toX(strike), H - 5);

        // Strike line
        ctx.strokeStyle = 'rgba(148,163,184,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(toX(strike), pad.t);
        ctx.lineTo(toX(strike), H - pad.b);
        ctx.stroke();
        ctx.setLineDash([]);

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
        gradient.addColorStop(0, optionType === 'CALL' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.moveTo(pad.l, H - pad.b);
        priceRange.forEach((p, i) => ctx.lineTo(toX(p), toY(payoffs[i])));
        ctx.lineTo(toX(priceRange[priceRange.length - 1]), H - pad.b);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Profit/Loss line
        ctx.beginPath();
        ctx.strokeStyle = optionType === 'CALL' ? '#10b981' : '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        priceRange.forEach((p, i) => i === 0 ? ctx.moveTo(toX(p), toY(payoffs[i])) : ctx.lineTo(toX(p), toY(payoffs[i])));
        ctx.stroke();
    }, [chain, spot, optionType]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};

const OptionsChainTab = ({ token, livePrices }) => {
    const [symbol, setSymbol] = useState('NIFTY_50');
    const [chain, setChain] = useState(null);
    const [loading, setLoading] = useState(false);
    const [chainType, setChainType] = useState('CALL'); // CALL or PUT
    const [spot, setSpot] = useState(0);
    const [qty, setQty] = useState(50);
    const [buying, setBuying] = useState(null); // strike being bought
    const [error, setError] = useState('');
    const [selectedStrike, setSelectedStrike] = useState(null);

    const loadChain = async () => {
        setLoading(true); setError(''); setChain(null);
        try {
            const data = await apiFetch(`/trade/options/chain/${symbol.toUpperCase()}`, 'GET', null, token);
            setChain(data.chain);
            setSpot(data.spot);
            // Default select ATM
            const atm = data.chain.find(c => c.moneyness === 'ATM');
            if(atm) setSelectedStrike(atm.strike);
        } catch(e) { setError(e.message); }
        setLoading(false);
    };

    useEffect(() => { loadChain(); }, []);

    const handleBuy = async (strike) => {
        setBuying(strike);
        try {
            await apiFetch("/trade/options/buy", "POST", {
                symbol: symbol.toUpperCase(),
                strike_price: strike,
                quantity: qty,
                option_type: chainType,
                expires_in_minutes: 43200 // 30 days
            }, token);
            alert(`Derivative Position Opened: ${qty} x ${symbol} ₹${strike} ${chainType}`);
        } catch (e) {
            alert(e.message);
        }
        setBuying(null);
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-5">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <i data-lucide="network" className="text-amber-400 w-6 h-6"></i> Options Chain (Black-Scholes)
                </h2>
                <div className="flex gap-2 items-center flex-wrap">
                    <div className="flex bg-slate-900 border border-slate-700 rounded overflow-hidden">
                        <span className="bg-slate-800 px-3 py-1.5 text-[10px] font-black text-slate-500 uppercase flex items-center">Symbol</span>
                        <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                            className="bg-transparent px-3 py-1.5 text-sm outline-none w-28 text-white font-bold"
                            placeholder="Symbol" />
                    </div>
                    <div className="flex bg-slate-900 border border-slate-700 rounded overflow-hidden">
                        <span className="bg-slate-800 px-3 py-1.5 text-[10px] font-black text-slate-500 uppercase flex items-center">Qty</span>
                        <input type="number" value={qty} onChange={e => setQty(Number(e.target.value))}
                            className="bg-transparent px-3 py-1.5 text-sm outline-none w-20 text-white font-bold" />
                    </div>
                    <button onClick={loadChain} disabled={loading}
                        className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold px-4 py-1.5 rounded text-sm transition flex items-center gap-1 shadow-lg shadow-amber-900/20">
                        {loading ? <i data-lucide="loader" className="animate-spin w-4 h-4"></i> : <i data-lucide="zap" className="w-4 h-4 text-black fill-black"></i>}
                        PROCESS CHAIN
                    </button>
                    <div className="flex rounded-lg overflow-hidden border border-slate-700 p-0.5 bg-slate-900">
                        <button onClick={() => setChainType('CALL')} className={`px-4 py-1 text-xs font-black transition-all rounded-md ${chainType === 'CALL' ? 'bg-success text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>CALLS</button>
                        <button onClick={() => setChainType('PUT')} className={`px-4 py-1 text-xs font-black transition-all rounded-md ${chainType === 'PUT' ? 'bg-danger text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>PUTS</button>
                    </div>
                </div>
            </div>

            {error && <div className="text-danger text-sm bg-danger/10 p-3 rounded mb-4 border border-danger/30 flex items-center gap-2"><i data-lucide="alert-circle" className="w-4 h-4"></i>{error}</div>}

            {spot > 0 && (
                <div className="flex items-center gap-4 mb-4 bg-slate-900 border border-white/5 p-4 rounded-xl shadow-inner">
                    <div>
                        <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-0.5">Spot Price</span>
                        <div className="text-2xl font-black font-mono text-white tabular-nums tracking-tighter">₹{spot.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    </div>
                    <div className="h-10 w-px bg-slate-800 mx-2"></div>
                    <div className="flex-1">
                        <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-0.5">Chain IV Profile</span>
                        <div className="flex gap-2 items-center">
                            <span className="text-xs font-bold text-slate-300">σ 25% (Constant)</span>
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-bold">EXPIRES: 30D</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 pb-12">
                {/* Chain Table */}
                <div className="xl:col-span-3 bg-dark rounded-xl border border-slate-800 overflow-auto max-h-[70vh] shadow-2xl custom-scrollbar">
                    {loading && (
                        <div className="text-amber-400 flex flex-col items-center justify-center py-32 animate-pulse">
                            <i data-lucide="loader" className="animate-spin w-12 h-12 mb-4"></i>
                            <p className="text-sm font-black tracking-widest uppercase italic">Synthesizing Greeks Matrix...</p>
                        </div>
                    )}
                    {chain && (
                        <table className="w-full text-xs whitespace-nowrap">
                            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
                                <tr>
                                    <th className="p-4 text-left text-slate-400 uppercase font-black text-[10px] tracking-widest">Strike</th>
                                    <th className="p-4 text-right text-slate-400 uppercase font-black text-[10px] tracking-widest">Premium</th>
                                    <th className="p-4 text-right text-slate-400 uppercase font-black text-[10px] tracking-widest">Δ Delta</th>
                                    <th className="p-4 text-right text-slate-400 uppercase font-black text-[10px] tracking-widest">Γ Gamma</th>
                                    <th className="p-4 text-right text-slate-400 uppercase font-black text-[10px] tracking-widest">Θ Theta</th>
                                    <th className="p-4 text-right text-slate-400 uppercase font-black text-[10px] tracking-widest">Vega</th>
                                    <th className="p-4 text-center text-slate-400 uppercase font-black text-[10px] tracking-widest">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {chain.map((row, i) => {
                                    const g = chainType === 'CALL' ? row.call : row.put;
                                    const isATM = row.moneyness === 'ATM';
                                    const isSelected = selectedStrike === row.strike;
                                    const isITM = chainType === 'CALL' ? row.moneyness === 'ITM' : row.moneyness === 'OTM';
                                    return (
                                        <tr key={i} 
                                            onClick={() => setSelectedStrike(row.strike)}
                                            className={`transition cursor-pointer group ${isSelected ? 'bg-primary/20 ring-1 ring-primary/50' : isATM ? 'bg-amber-500/10' : isITM ? 'bg-slate-800/20' : 'hover:bg-slate-800/10'}`}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-black text-white text-sm">₹{row.strike.toLocaleString()}</span>
                                                    {isATM && <span className="text-[10px] bg-amber-500 text-black px-1.5 py-0.5 rounded font-black italic">ATM</span>}
                                                </div>
                                            </td>
                                            <td className={`p-4 text-right font-mono font-black text-base ${chainType === 'CALL' ? 'text-success' : 'text-danger'}`}>₹{g.price.toFixed(2)}</td>
                                            <td className="p-4 text-right font-mono text-slate-200 font-bold">{g.delta.toFixed(3)}</td>
                                            <td className="p-4 text-right font-mono text-slate-500">{g.gamma.toFixed(4)}</td>
                                            <td className="p-4 text-right font-mono text-rose-500/80">{g.theta.toFixed(3)}</td>
                                            <td className="p-4 text-right font-mono text-purple-400/80">{g.vega.toFixed(3)}</td>
                                            <td className="p-4 text-center">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleBuy(row.strike); }}
                                                    disabled={buying === row.strike}
                                                    className={`px-6 py-2 rounded-lg font-black uppercase text-[10px] transition-all shadow-xl hover:scale-105 active:scale-95 ${chainType === 'CALL' ? 'bg-success/20 text-success border border-success/30 hover:bg-success hover:text-white' : 'bg-danger/20 text-danger border border-danger/30 hover:bg-danger hover:text-white'}`}>
                                                    {buying === row.strike ? "BUYING..." : `TRADE ${chainType}`}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Payoff Diagram */}
                <div className="bg-dark rounded-xl border border-slate-800 p-6 flex flex-col shadow-2xl h-fit sticky top-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <i data-lucide="chart-line" className="w-4 h-4 text-amber-400"></i> RISK PROFILE
                        </h3>
                        <span className="text-[10px] font-black text-slate-500 border border-slate-800 px-2 py-0.5 rounded">EXPIRY: 30D</span>
                    </div>

                    <div className="space-y-4 mb-6">
                        <div className="bg-slate-900 border border-white/5 p-4 rounded-xl">
                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-tighter mb-1">Selected Strategy</div>
                            <div className="text-sm font-bold text-white flex justify-between items-center">
                                <span>Long {selectedStrike || '--'} {chainType}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded ${chainType === 'CALL' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>BULLISH BIAS [MOCK]</span>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                                <span className="text-[9px] text-slate-600 font-bold uppercase block mb-1">Max Profit</span>
                                <span className="text-sm font-black text-emerald-400 italic">UNLIMITED 🚀</span>
                            </div>
                            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 text-right">
                                <span className="text-[9px] text-slate-600 font-bold uppercase block mb-1">Max Risk</span>
                                <span className="text-sm font-black text-rose-500 italic">
                                    ₹{(selectedStrike && chain ? (chainType === 'CALL' ? chain.find(c=>c.strike === selectedStrike)?.call.price : chain.find(c=>c.strike === selectedStrike)?.put.price || 0) * qty : 0).toFixed(0)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="h-64 bg-black/40 rounded-xl overflow-hidden border border-white/5 p-2 mb-4">
                        {chain && selectedStrike ? (
                            <PayoffCanvas chain={chain} spot={spot} optionType={chainType} selectedStrike={selectedStrike} />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 text-sm italic">
                                <i data-lucide="info" className="w-8 h-8 mb-2 opacity-10"></i>
                                Select a strike to analyze
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════
// FEATURE 4: RISK ANALYTICS PANEL (injected into PortfolioTab)  
// ═══════════════════════════════════════════════════════════════════
const RiskPanel = ({ token }) => {
    const [risk, setRisk] = useState(null); 
    const [loading, setLoading] = useState(false);

    const loadRisk = async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/trade/portfolio/risk", "GET", null, token);
            setRisk(data);
        } catch(e) { console.error(e); }
        setLoading(false);
    };

    useEffect(() => { loadRisk(); }, [token]);

    if (loading) return (
        <div className="bg-dark border border-slate-800 rounded-xl p-6 mb-8 animate-pulse">
            <div className="h-4 bg-slate-800 rounded w-48 mb-4"></div>
            <div className="grid grid-cols-3 gap-4">
                {[1,2,3].map(i => <div key={i} className="h-20 bg-slate-800 rounded"></div>)}
            </div>
        </div>
    );

    if (!risk || risk.total_value === 0) return (
        <div className="bg-dark border border-slate-800 rounded-xl p-5 mb-8 text-slate-500 text-sm flex items-center gap-3">
            <span className="opacity-40 text-lg">🛡️</span>
            Risk analytics will appear once you hold portfolio positions.
        </div>
    );

    const betaColor = risk.portfolio_beta > 1.5 ? 'text-danger' : risk.portfolio_beta > 1.1 ? 'text-yellow-400' : 'text-success';
    const sharpeColor = risk.sharpe > 1 ? 'text-success' : risk.sharpe > 0 ? 'text-yellow-400' : 'text-danger';

    return (
        <div className="bg-dark border border-slate-800 rounded-xl p-5 mb-8 shadow-xl">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <span className="text-amber-400 text-base">⚠️</span>
                    AI Risk Analytics
                </h3>
                <button onClick={loadRisk} className="text-xs text-slate-500 hover:text-white flex items-center gap-1 transition">
                    <span>↻</span> Refresh
                </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 text-center">
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Portfolio Beta</div>
                    <div className={`text-2xl font-bold font-mono ${betaColor}`}>{risk.portfolio_beta.toFixed(2)}</div>
                    <div className="text-[10px] text-slate-600 mt-1">vs NIFTY_50</div>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 text-center">
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">VaR (95%)</div>
                    <div className="text-2xl font-bold font-mono text-danger">₹{risk.var_95.toFixed(0)}</div>
                    <div className="text-[10px] text-slate-600 mt-1">Daily max expected loss</div>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 text-center">
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Sharpe Ratio</div>
                    <div className={`text-2xl font-bold font-mono ${sharpeColor}`}>{risk.sharpe.toFixed(2)}</div>
                    <div className="text-[10px] text-slate-600 mt-1">Risk-adjusted return</div>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 text-center">
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total Exposure</div>
                    <div className="text-2xl font-bold font-mono text-primary">₹{(risk.total_value/1000).toFixed(1)}K</div>
                    <div className="text-[10px] text-slate-600 mt-1">Market value</div>
                </div>
            </div>

            {/* Allocation bar chart */}
            <div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Holdings Concentration</div>
                <div className="space-y-1.5">
                    {risk.allocation.slice(0, 6).map(a => (
                        <div key={a.symbol} className="flex items-center gap-3 text-xs">
                            <div className="w-20 truncate text-slate-300 font-bold shrink-0">{a.symbol}</div>
                            <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                    style={{ width: `${a.weight_pct}%`, backgroundColor: a.pnl >= 0 ? '#10b981' : '#ef4444', opacity: 0.8 }}></div>
                            </div>
                            <div className="w-14 text-right text-slate-400 shrink-0">{a.weight_pct}%</div>
                            <div className={`w-16 text-right shrink-0 ${a.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                {a.pnl >= 0 ? '+' : ''}₹{a.pnl.toFixed(0)}
                            </div>
                            <div className="w-10 text-right text-slate-600 shrink-0 text-[10px]">β{a.beta}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════
// FEATURE 5: THEME SWITCHER  
// ═══════════════════════════════════════════════════════════════════
const THEMES = {
    dark: {
        name: 'Dark', icon: '🌑',
        '--bg-darker': '#020617', '--bg-dark': '#0f172a',
        '--color-primary': '#3b82f6', '--color-success': '#10b981', '--color-danger': '#ef4444',
        '--text': '#f8fafc', '--border': '#1e293b', '--sidebar': '#0a1628',
    },
    midnight: {
        name: 'Midnight', icon: '🌌',
        '--bg-darker': '#0d0a1e', '--bg-dark': '#1a1030',
        '--color-primary': '#a855f7', '--color-success': '#06b6d4', '--color-danger': '#f43f5e',
        '--text': '#f1f0ff', '--border': '#2d1f50', '--sidebar': '#12092a',
    },
    solarized: {
        name: 'Solarized', icon: '☀️',
        '--bg-darker': '#1b1c1d', '--bg-dark': '#252629',
        '--color-primary': '#f59e0b', '--color-success': '#84cc16', '--color-danger': '#f43f5e',
        '--text': '#fef3c7', '--border': '#3a3118', '--sidebar': '#1c1a0a',
    },
    terminal: {
        name: 'Terminal', icon: '💻',
        '--bg-darker': '#000000', '--bg-dark': '#001100',
        '--color-primary': '#00ff41', '--color-success': '#00ff41', '--color-danger': '#ff0040',
        '--text': '#00ff41', '--border': '#003300', '--sidebar': '#000800',
    },
};

const ThemeSwitcher = () => {
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const t = THEMES[theme];
        if (!t) return;
        const style = document.documentElement.style;
        // We apply overriding CSS via style tag for Tailwind compat
        let tag = document.getElementById('theme-vars');
        if (!tag) { tag = document.createElement('style'); tag.id = 'theme-vars'; document.head.appendChild(tag); }
        tag.textContent = `
            :root { ${Object.entries(t).filter(([k]) => k.startsWith('--')).map(([k, v]) => `${k}: ${v}`).join(';')} }
            body { background-color: ${t['--bg-darker']} !important; color: ${t['--text']} !important; }
            .bg-darker { background-color: ${t['--bg-darker']} !important; }
            .bg-dark { background-color: ${t['--bg-dark']} !important; }
            .text-primary { color: ${t['--color-primary']} !important; }
            .bg-primary { background-color: ${t['--color-primary']} !important; }
            .text-success { color: ${t['--color-success']} !important; }
            .bg-success { background-color: ${t['--color-success']} !important; }
            .text-danger { color: ${t['--color-danger']} !important; }
            .bg-danger { background-color: ${t['--color-danger']} !important; }
            .border-slate-800 { border-color: ${t['--border']} !important; }
        `;
        localStorage.setItem('theme', theme);
    }, [theme]);

    return (
        <div className="relative">
            <button onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-700 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition">
                <span>{THEMES[theme]?.icon}</span>
                <span className="hidden sm:inline">{THEMES[theme]?.name}</span>
                <i data-lucide="chevron-down" className="w-3 h-3"></i>
            </button>
            {open && (
                <div className="absolute top-full right-0 mt-1 bg-dark border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-50 w-36">
                    {Object.entries(THEMES).map(([key, t]) => (
                        <button key={key} onClick={() => { setTheme(key); setOpen(false); }}
                            className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition hover:bg-slate-800 ${theme === key ? 'text-primary font-bold' : 'text-slate-300'}`}>
                            <span>{t.icon}</span> {t.name}
                            {theme === key && <i data-lucide="check" className="w-3 h-3 ml-auto"></i>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};


// ═══════════════════════════════════════════════════════════════════
// FEATURE A: GLOBAL MARKETS DASHBOARD
// ═══════════════════════════════════════════════════════════════════
const GLOBAL_MARKETS_BASE = {
    indices: [
        { id: 'nifty50', name: 'NIFTY 50', base: 22350, flag: '🇮🇳', region: 'India' },
        { id: 'sensex', name: 'SENSEX', base: 73500, flag: '🇮🇳', region: 'India' },
        { id: 'sp500', name: 'S&P 500', base: 5120, flag: '🇺🇸', region: 'US' },
        { id: 'nasdaq', name: 'NASDAQ', base: 16200, flag: '🇺🇸', region: 'US' },
        { id: 'dowjones', name: 'DOW JONES', base: 38900, flag: '🇺🇸', region: 'US' },
        { id: 'ftse', name: 'FTSE 100', base: 7850, flag: '🇬🇧', region: 'UK' },
        { id: 'nikkei', name: 'NIKKEI 225', base: 38200, flag: '🇯🇵', region: 'Japan' },
        { id: 'hangseng', name: 'HANG SENG', base: 16900, flag: '🇭🇰', region: 'HK' },
        { id: 'dax', name: 'DAX', base: 17800, flag: '🇩🇪', region: 'Germany' },
        { id: 'cac40', name: 'CAC 40', base: 7950, flag: '🇫🇷', region: 'France' },
    ],
    commodities: [
        { id: 'gold', name: 'GOLD', base: 72000, flag: '🥇', unit: '₹/10g', region: 'Commodity' },
        { id: 'silver', name: 'SILVER', base: 85000, flag: '🥈', unit: '₹/kg', region: 'Commodity' },
        { id: 'crude', name: 'CRUDE OIL', base: 6600, flag: '🛢️', unit: '₹/bbl', region: 'Commodity' },
        { id: 'natgas', name: 'NATURAL GAS', base: 240, flag: '🔥', unit: '₹/mmBtu', region: 'Commodity' },
        { id: 'copper', name: 'COPPER', base: 780, flag: '🟤', unit: '₹/kg', region: 'Commodity' },
    ],
    forex: [
        { id: 'usdinr', name: 'USD/INR', base: 83.5, flag: '💵', region: 'Forex' },
        { id: 'eurinr', name: 'EUR/INR', base: 90.2, flag: '💶', region: 'Forex' },
        { id: 'gbpinr', name: 'GBP/INR', base: 105.8, flag: '💷', region: 'Forex' },
        { id: 'jpyinr', name: 'JPY/INR', base: 0.56, flag: '¥', region: 'Forex' },
        { id: 'eurusd', name: 'EUR/USD', base: 1.081, flag: '🌍', region: 'Forex' },
    ],
};

const useGlobalPrices = () => {
    const [prices, setPrices] = useState(() => {
        const init = {};
        const all = [...GLOBAL_MARKETS_BASE.indices, ...GLOBAL_MARKETS_BASE.commodities, ...GLOBAL_MARKETS_BASE.forex];
        all.forEach(m => {
            const chg = (Math.random() - 0.48) * 0.025;
            init[m.id] = { price: m.base * (1 + chg), prevClose: m.base, pct: chg * 100 };
        });
        return init;
    });

    useEffect(() => {
        const iv = setInterval(() => {
            setPrices(prev => {
                const next = { ...prev };
                const all = [...GLOBAL_MARKETS_BASE.indices, ...GLOBAL_MARKETS_BASE.commodities, ...GLOBAL_MARKETS_BASE.forex];
                all.forEach(m => {
                    const old = prev[m.id];
                    if (!old) return;
                    const tick = (Math.random() - 0.5) * 0.002;
                    const newPrice = old.price * (1 + tick);
                    next[m.id] = { price: newPrice, prevClose: old.prevClose, pct: (newPrice - old.prevClose) / old.prevClose * 100 };
                });
                return next;
            });
        }, 1500);
        return () => clearInterval(iv);
    }, []);

    return prices;
};

const GlobalMarketCard = ({ item, price }) => {
    const p = price || {};
    const pct = p.pct || 0;
    const positive = pct >= 0;
    const fmt = (v) => {
        if (v >= 10000) return v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        if (v >= 100) return v.toFixed(2);
        return v.toFixed(3);
    };

    return (
        <div className={`bg-dark border rounded-xl p-4 flex flex-col gap-1 hover:scale-[1.02] transition-all cursor-default ${positive ? 'border-success/20 hover:border-success/40' : 'border-danger/20 hover:border-danger/40'}`}>
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                    <span className="text-base">{item.flag}</span>
                    <div>
                        <div className="text-xs font-bold text-slate-300">{item.name}</div>
                        <div className="text-[10px] text-slate-600">{item.region}</div>
                    </div>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${positive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                    {positive ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
                </span>
            </div>
            <div className={`text-lg font-bold font-mono mt-1 ${positive ? 'text-success' : 'text-danger'}`}>
                {item.unit ? '' : (item.region === 'Forex' ? '' : '₹')}{fmt(p.price || item.base)}
            </div>
            <div className="text-[10px] text-slate-600">{item.unit || ''}</div>
        </div>
    );
};

const GlobalMarketTab = () => {
    const prices = useGlobalPrices();
    const [filter, setFilter] = useState('ALL');
    const gainers = [...GLOBAL_MARKETS_BASE.indices].sort((a,b) => (prices[b.id]?.pct||0) - (prices[a.id]?.pct||0));
    const globalSentiment = Object.values(prices).filter(p => p.pct >= 0).length / Object.values(prices).length * 100;

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <i data-lucide="globe" className="text-cyan-400 w-6 h-6"></i> Global Markets
                    <span className="text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded ml-2">LIVE SIMULATION</span>
                </h2>
                <div className="flex gap-2">
                    {['ALL','INDICES','COMMODITIES','FOREX'].map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-3 py-1 text-xs font-bold rounded border transition ${filter===f ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Global Sentiment Bar */}
            <div className="bg-dark border border-slate-800 rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Global Risk Sentiment</span>
                    <span className={`text-sm font-bold ${globalSentiment > 60 ? 'text-success' : globalSentiment < 40 ? 'text-danger' : 'text-yellow-400'}`}>
                        {globalSentiment > 60 ? '🌐 Risk-On' : globalSentiment < 40 ? '🛡️ Risk-Off' : '⚖️ Balanced'}
                    </span>
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-800">
                    <div className="bg-success transition-all duration-1000" style={{ width: `${globalSentiment}%` }}></div>
                    <div className="bg-danger flex-1 transition-all duration-1000"></div>
                </div>
                <div className="flex justify-between text-[10px] mt-1 text-slate-500">
                    <span>{Math.round(globalSentiment)}% markets advancing</span>
                    <span>{Math.round(100 - globalSentiment)}% declining</span>
                </div>
            </div>

            {/* Indices */}
            {(filter === 'ALL' || filter === 'INDICES') && (
                <div className="mb-6">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <i data-lucide="bar-chart-2" className="w-4 h-4 text-cyan-400"></i> Equity Indices
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {GLOBAL_MARKETS_BASE.indices.map(m => <GlobalMarketCard key={m.id} item={m} price={prices[m.id]} />)}
                    </div>
                </div>
            )}

            {/* Commodities */}
            {(filter === 'ALL' || filter === 'COMMODITIES') && (
                <div className="mb-6">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <i data-lucide="package" className="w-4 h-4 text-amber-400"></i> Commodities
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {GLOBAL_MARKETS_BASE.commodities.map(m => <GlobalMarketCard key={m.id} item={m} price={prices[m.id]} />)}
                    </div>
                </div>
            )}

            {/* Forex */}
            {(filter === 'ALL' || filter === 'FOREX') && (
                <div className="mb-6">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <i data-lucide="refresh-cw" className="w-4 h-4 text-purple-400"></i> Foreign Exchange
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {GLOBAL_MARKETS_BASE.forex.map(m => <GlobalMarketCard key={m.id} item={m} price={prices[m.id]} />)}
                    </div>
                </div>
            )}

            {/* Top Movers */}
            {filter === 'ALL' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-dark border border-slate-800 rounded-xl p-4">
                        <h3 className="text-xs font-bold text-success uppercase tracking-wider mb-3 flex items-center gap-2">
                            <i data-lucide="trending-up" className="w-4 h-4"></i> Top Gainers (Indices)
                        </h3>
                        {gainers.slice(0,4).map((m,i) => (
                            <div key={m.id} className="flex justify-between items-center py-1.5 border-b border-slate-900 last:border-0">
                                <span className="text-sm">{m.flag} {m.name}</span>
                                <span className="text-success font-bold text-sm">+{(prices[m.id]?.pct||0).toFixed(2)}%</span>
                            </div>
                        ))}
                    </div>
                    <div className="bg-dark border border-slate-800 rounded-xl p-4">
                        <h3 className="text-xs font-bold text-danger uppercase tracking-wider mb-3 flex items-center gap-2">
                            <i data-lucide="trending-down" className="w-4 h-4"></i> Top Losers (Indices)
                        </h3>
                        {[...gainers].reverse().slice(0,4).map((m,i) => (
                            <div key={m.id} className="flex justify-between items-center py-1.5 border-b border-slate-900 last:border-0">
                                <span className="text-sm">{m.flag} {m.name}</span>
                                <span className="text-danger font-bold text-sm">{(prices[m.id]?.pct||0).toFixed(2)}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════
// FEATURE B: OPTIONS OI + MAX PAIN CHART
// ═══════════════════════════════════════════════════════════════════
const OIBarChart = ({ data, maxPain, spot, type }) => {
    const canvasRef = useRef();
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data || !data.length) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width = canvas.offsetWidth;
        const H = canvas.height = canvas.offsetHeight;
        ctx.clearRect(0, 0, W, H);

        const pad = { t: 20, b: 40, l: 60, r: 20 };
        const dw = W - pad.l - pad.r;
        const dh = H - pad.t - pad.b;
        const barW = dw / data.length * 0.7;
        const gap = dw / data.length;

        const maxOI = Math.max(...data.map(d => Math.max(d.callOI, d.putOI)));
        const toY = v => pad.t + dh - (v / (maxOI || 1)) * dh;
        const toX = i => pad.l + i * gap + gap * 0.15;

        // Grid lines
        [0.25, 0.5, 0.75, 1].forEach(f => {
            ctx.strokeStyle = 'rgba(100,116,139,0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const y = pad.t + dh - f * dh;
            ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y);
            ctx.stroke();
            ctx.fillStyle = '#4b5563';
            ctx.font = '9px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(((maxOI * f) / 1000).toFixed(0) + 'K', pad.l - 4, y + 3);
        });

        // Bars
        data.forEach((d, i) => {
            const x = toX(i);
            const isMaxPain = d.strike === maxPain;
            const isATM = Math.abs(d.strike - spot) < (data[1]?.strike - data[0]?.strike) / 2;

            // Call OI
            const callH = (d.callOI / maxOI) * dh;
            ctx.fillStyle = isMaxPain ? 'rgba(234,179,8,0.8)' : 'rgba(16,185,129,0.6)';
            ctx.fillRect(x, pad.t + dh - callH, barW / 2 - 1, callH);

            // Put OI
            const putH = (d.putOI / maxOI) * dh;
            ctx.fillStyle = isMaxPain ? 'rgba(234,179,8,0.6)' : 'rgba(239,68,68,0.6)';
            ctx.fillRect(x + barW / 2 + 1, pad.t + dh - putH, barW / 2 - 1, putH);

            // Strike label
            ctx.fillStyle = isATM ? '#3b82f6' : isMaxPain ? '#eab308' : '#4b5563';
            ctx.font = isATM || isMaxPain ? 'bold 9px monospace' : '8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(d.strike.toLocaleString(), x + barW / 2, H - pad.b + 12);

            // ATM marker
            if (isATM) {
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(x + barW / 2, pad.t);
                ctx.lineTo(x + barW / 2, H - pad.b);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Max pain marker
            if (isMaxPain) {
                ctx.strokeStyle = '#eab308';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 3]);
                ctx.beginPath();
                ctx.moveTo(x + barW / 2, pad.t);
                ctx.lineTo(x + barW / 2, H - pad.b);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });

        // Legend
        [['#10b981', 'Call OI'], ['#ef4444', 'Put OI'], ['#eab308', 'Max Pain']].forEach(([c, l], i) => {
            ctx.fillStyle = c;
            ctx.fillRect(pad.l + i * 80, pad.t - 14, 10, 10);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(l, pad.l + i * 80 + 13, pad.t - 5);
        });
    }, [data, maxPain, spot]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};

const OptionsOITab = ({ token, livePrices }) => {
    const [symbol, setSymbol] = useState('NIFTY_50');
    const [expiry, setExpiry] = useState('near');
    const [oiData, setOiData] = useState(null);
    const [loading, setLoading] = useState(false);

    const generateOI = (sym) => {
        const spot = livePrices[sym] || 22500;
        const step = spot > 10000 ? 100 : spot > 1000 ? 50 : 10;
        const strikes = [];
        for (let i = -10; i <= 10; i++) strikes.push(Math.round(spot / step) * step + i * step);

        let totalPain = Infinity;
        let maxPainStrike = strikes[0];
        const chain = strikes.map(k => {
            const moneyness = k < spot ? 'ITM_CALL' : k > spot ? 'OTM_CALL' : 'ATM';
            const dist = Math.abs(k - spot) / spot;
            const callBias = k < spot ? (1 - dist * 3) : Math.exp(-dist * 15);
            const putBias  = k > spot ? (1 - dist * 3) : Math.exp(-dist * 15);
            return {
                strike: k,
                callOI: Math.max(100, Math.round(callBias * 800000 + Math.random() * 200000)),
                putOI:  Math.max(100, Math.round(putBias  * 750000 + Math.random() * 200000)),
                callIV: (20 + dist * 30 + Math.random() * 3).toFixed(1),
                putIV:  (22 + dist * 28 + Math.random() * 3).toFixed(1),
            };
        });

        // Max Pain: strike where combined option writer pain is minimized
        chain.forEach(row => {
            const pain = chain.reduce((sum, d) => {
                const callPain = d.callOI * Math.max(0, d.strike - row.strike);
                const putPain  = d.putOI  * Math.max(0, row.strike - d.strike);
                return sum + callPain + putPain;
            }, 0);
            if (pain < totalPain) { totalPain = pain; maxPainStrike = row.strike; }
        });

        const totalCallOI = chain.reduce((s, d) => s + d.callOI, 0);
        const totalPutOI  = chain.reduce((s, d) => s + d.putOI, 0);
        const pcr = (totalPutOI / totalCallOI).toFixed(2);

        return { chain, maxPain: maxPainStrike, spot, pcr, totalCallOI, totalPutOI };
    };

    const loadOI = () => {
        setLoading(true);
        setTimeout(() => {
            setOiData(generateOI(symbol));
            setLoading(false);
        }, 600);
    };

    useEffect(() => { loadOI(); }, []);

    const pcrSentiment = oiData ? (parseFloat(oiData.pcr) > 1.2 ? '🐂 Bullish' : parseFloat(oiData.pcr) < 0.8 ? '🐻 Bearish' : '↔ Neutral') : '';

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-5">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <i data-lucide="layers" className="text-violet-400 w-6 h-6"></i> Open Interest & Max Pain
                </h2>
                <div className="flex gap-2 items-center flex-wrap">
                    <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                        className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm outline-none focus:border-primary w-36" placeholder="Symbol" />
                    <div className="flex rounded overflow-hidden border border-slate-700">
                        {['near','mid','far'].map(e => (
                            <button key={e} onClick={() => setExpiry(e)}
                                className={`px-3 py-1.5 text-xs font-bold transition ${expiry===e ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                                {e === 'near' ? '28 Mar' : e === 'mid' ? '25 Apr' : '30 May'}
                            </button>
                        ))}
                    </div>
                    <button onClick={loadOI} disabled={loading}
                        className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-4 py-1.5 rounded text-sm flex items-center gap-1 transition">
                        {loading ? <i data-lucide="loader" className="animate-spin w-4 h-4"></i> : <i data-lucide="refresh-cw" className="w-4 h-4"></i>}
                        Refresh OI
                    </button>
                </div>
            </div>

            {oiData && (
                <>
                    {/* KPI strip */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                        {[
                            { label: 'Spot Price', value: `₹${oiData.spot.toFixed(0)}`, color: 'text-primary' },
                            { label: 'Max Pain', value: `₹${oiData.maxPain.toLocaleString()}`, color: 'text-yellow-400' },
                            { label: 'Pain Gap', value: `${((oiData.maxPain - oiData.spot) / oiData.spot * 100).toFixed(2)}%`, color: oiData.maxPain > oiData.spot ? 'text-success' : 'text-danger' },
                            { label: 'PCR', value: oiData.pcr, color: parseFloat(oiData.pcr) > 1 ? 'text-success' : 'text-danger' },
                            { label: 'Sentiment', value: pcrSentiment, color: 'text-white' },
                        ].map(k => (
                            <div key={k.label} className="bg-dark border border-slate-800 rounded-lg p-3 text-center">
                                <div className="text-xs text-slate-500 uppercase tracking-wider">{k.label}</div>
                                <div className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* OI Bar Chart */}
                    <div className="bg-dark border border-slate-800 rounded-xl p-4 mb-5">
                        <div className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                            <i data-lucide="bar-chart" className="w-4 h-4 text-violet-400"></i>
                            Call vs Put Open Interest by Strike — {symbol} | Expiry: {expiry === 'near' ? '28 Mar' : expiry === 'mid' ? '25 Apr' : '30 May'}
                        </div>
                        <div className="bg-slate-900 rounded-lg" style={{ height: '280px' }}>
                            <OIBarChart data={oiData.chain} maxPain={oiData.maxPain} spot={oiData.spot} />
                        </div>
                    </div>

                    {/* OI Table */}
                    <div className="bg-dark border border-slate-800 rounded-xl overflow-auto max-h-64 custom-scrollbar">
                        <table className="w-full text-xs whitespace-nowrap">
                            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800">
                                <tr>
                                    <th className="p-3 text-right text-success">Call OI</th>
                                    <th className="p-3 text-right text-slate-400">Call IV%</th>
                                    <th className="p-3 text-center text-white border-x border-slate-700">STRIKE</th>
                                    <th className="p-3 text-left text-slate-400">Put IV%</th>
                                    <th className="p-3 text-left text-danger">Put OI</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-900">
                                {oiData.chain.map((row, i) => {
                                    const isATM = Math.abs(row.strike - oiData.spot) < 75;
                                    const isMP = row.strike === oiData.maxPain;
                                    return (
                                        <tr key={i} className={`${isMP ? 'bg-yellow-500/5 border-l-2 border-yellow-500' : isATM ? 'bg-primary/5 border-l-2 border-primary' : 'hover:bg-slate-800/20'}`}>
                                            <td className="p-2 text-right font-mono text-success">{(row.callOI/1000).toFixed(0)}K</td>
                                            <td className="p-2 text-right font-mono text-slate-500">{row.callIV}%</td>
                                            <td className="p-2 text-center font-bold border-x border-slate-700">
                                                {row.strike.toLocaleString()}
                                                {isMP && <span className="ml-1 text-[9px] bg-yellow-500 text-black px-1 rounded font-bold">MAX PAIN</span>}
                                                {isATM && !isMP && <span className="ml-1 text-[9px] bg-primary text-white px-1 rounded font-bold">ATM</span>}
                                            </td>
                                            <td className="p-2 text-left font-mono text-slate-500">{row.putIV}%</td>
                                            <td className="p-2 text-left font-mono text-danger">{(row.putOI/1000).toFixed(0)}K</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════
// FEATURE C: VISUAL STRATEGY BUILDER
// ═══════════════════════════════════════════════════════════════════
const CONDITION_OPTIONS = [
    { id: 'price_above', label: 'Price >', params: ['value'], hint: '₹ price level' },
    { id: 'price_below', label: 'Price <', params: ['value'], hint: '₹ price level' },
    { id: 'rsi_above', label: 'RSI >', params: ['value'], hint: 'RSI level (0-100)' },
    { id: 'rsi_below', label: 'RSI <', params: ['value'], hint: 'RSI level (0-100)' },
    { id: 'pct_change_up', label: '% Change >', params: ['value'], hint: 'e.g. 2 for 2%' },
    { id: 'pct_change_down', label: '% Change <', params: ['value'], hint: 'e.g. -2 for -2%' },
    { id: 'ema_cross_up', label: 'EMA(9) > EMA(21)', params: [], hint: 'Golden cross' },
    { id: 'ema_cross_down', label: 'EMA(9) < EMA(21)', params: [], hint: 'Death cross' },
    { id: 'price_near_high', label: 'Near 52W High', params: ['pct'], hint: 'Within % of high' },
];

const ACTION_OPTIONS = [
    { id: 'buy', label: '🟢 BUY', color: 'text-success bg-success/10 border-success/30' },
    { id: 'sell', label: '🔴 SELL', color: 'text-danger bg-danger/10 border-danger/30' },
    { id: 'alert', label: '🔔 ALERT', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
    { id: 'watch', label: '👁️ ADD TO WATCHLIST', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
];

const StrategyBuilderTab = ({ token, livePrices, priceHistory }) => {
    const [rules, setRules] = useState([
        { id: 1, symbol: 'RELIANCE', condition: 'rsi_below', condValue: '35', action: 'buy', qty: 10, active: false },
    ]);
    const [results, setResults] = useState([]);
    const [running, setRunning] = useState(false);
    const [log, setLog] = useState([]);
    const [newRule, setNewRule] = useState({ symbol: 'NIFTY_50', condition: 'pct_change_up', condValue: '1.5', action: 'alert', qty: 1 });
    const [showAdd, setShowAdd] = useState(false);

    const computeRSI = (symbol, period = 14) => {
        const hist = priceHistory[symbol];
        if (!hist || hist.length < period + 1) return 50;
        const closes = hist.slice(-period - 1).map(c => c.close);
        let gains = 0, losses = 0;
        for (let i = 1; i < closes.length; i++) {
            const d = closes[i] - closes[i-1];
            if (d > 0) gains += d; else losses -= d;
        }
        const rs = losses === 0 ? 100 : gains / losses;
        return 100 - 100 / (1 + rs);
    };

    const computeEMA = (symbol, period) => {
        const hist = priceHistory[symbol];
        if (!hist || hist.length < period) return livePrices[symbol] || 0;
        const k = 2 / (period + 1);
        let ema = hist[0].close;
        hist.slice(-period).forEach(c => { ema = c.close * k + ema * (1-k); });
        return ema;
    };

    const evaluateRule = (rule) => {
        const price = livePrices[rule.symbol] || 0;
        const hist = priceHistory[rule.symbol] || [];
        const prevClose = hist.length > 1 ? hist[hist.length - 2]?.close || price : price;
        const pctChange = prevClose ? (price - prevClose) / prevClose * 100 : 0;
        const rsi = computeRSI(rule.symbol);
        const ema9 = computeEMA(rule.symbol, 9);
        const ema21 = computeEMA(rule.symbol, 21);
        const maxClose = hist.length ? Math.max(...hist.map(c => c.close)) : price;

        switch (rule.condition) {
            case 'price_above': return price > parseFloat(rule.condValue);
            case 'price_below': return price < parseFloat(rule.condValue);
            case 'rsi_above': return rsi > parseFloat(rule.condValue);
            case 'rsi_below': return rsi < parseFloat(rule.condValue);
            case 'pct_change_up': return pctChange > parseFloat(rule.condValue);
            case 'pct_change_down': return pctChange < parseFloat(rule.condValue);
            case 'ema_cross_up': return ema9 > ema21;
            case 'ema_cross_down': return ema9 < ema21;
            case 'price_near_high': return price >= maxClose * (1 - parseFloat(rule.condValue || 5) / 100);
            default: return false;
        }
    };

    const runBacktest = () => {
        setRunning(true);
        setLog([]);
        const newLog = [];

        setTimeout(() => {
            const res = rules.map(rule => {
                const triggered = evaluateRule(rule);
                const rsi = computeRSI(rule.symbol).toFixed(1);
                const price = livePrices[rule.symbol] || 0;
                const cond = CONDITION_OPTIONS.find(c => c.id === rule.condition);
                const act = ACTION_OPTIONS.find(a => a.id === rule.action);

                newLog.push({
                    time: new Date().toLocaleTimeString(),
                    rule: `${rule.symbol}: ${cond?.label} ${rule.condValue || ''} → ${act?.label}`,
                    triggered,
                    rsi, price
                });

                return { ...rule, triggered, rsi, currentPrice: price };
            });
            setResults(res);
            setLog(newLog);
            setRunning(false);
        }, 800);
    };

    const addRule = () => {
        setRules(prev => [...prev, { ...newRule, id: Date.now(), active: false }]);
        setShowAdd(false);
        setNewRule({ symbol: 'NIFTY_50', condition: 'pct_change_up', condValue: '1.5', action: 'alert', qty: 1 });
    };

    const removeRule = (id) => setRules(prev => prev.filter(r => r.id !== id));

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <i data-lucide="cpu" className="text-purple-400 w-6 h-6"></i> Strategy Builder
                    <span className="text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded ml-2">IF → THEN Rules Engine</span>
                </h2>
                <div className="flex gap-2">
                    <button onClick={() => setShowAdd(p => !p)}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold text-sm transition">
                        <i data-lucide="plus" className="w-4 h-4"></i> Add Rule
                    </button>
                    <button onClick={runBacktest} disabled={running || rules.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-green-500 text-white rounded font-bold text-sm transition disabled:opacity-50">
                        {running ? <i data-lucide="loader" className="animate-spin w-4 h-4"></i> : <i data-lucide="play" className="w-4 h-4"></i>}
                        Run Now
                    </button>
                </div>
            </div>

            {/* Add Rule Form */}
            {showAdd && (
                <div className="bg-dark border border-purple-500/30 rounded-xl p-5 mb-5 shadow-2xl">
                    <h3 className="font-bold text-purple-400 mb-4 flex items-center gap-2">
                        <i data-lucide="plus-circle" className="w-4 h-4"></i> New Strategy Rule
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Symbol</label>
                            <input value={newRule.symbol} onChange={e => setNewRule({...newRule, symbol: e.target.value.toUpperCase()})}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-purple-500" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Condition</label>
                            <select value={newRule.condition} onChange={e => setNewRule({...newRule, condition: e.target.value})}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-purple-500 text-white">
                                {CONDITION_OPTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">{CONDITION_OPTIONS.find(c=>c.id===newRule.condition)?.hint || 'Value'}</label>
                            <input value={newRule.condValue} onChange={e => setNewRule({...newRule, condValue: e.target.value})}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-purple-500"
                                type="number" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1">Action</label>
                            <select value={newRule.action} onChange={e => setNewRule({...newRule, action: e.target.value})}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm outline-none focus:border-purple-500 text-white">
                                {ACTION_OPTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                            </select>
                        </div>
                        <button onClick={addRule} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded transition">
                            Add Rule
                        </button>
                    </div>
                </div>
            )}

            {/* Rules List */}
            <div className="space-y-3 mb-6">
                {rules.map((rule, i) => {
                    const result = results.find(r => r.id === rule.id);
                    const cond = CONDITION_OPTIONS.find(c => c.id === rule.condition);
                    const act = ACTION_OPTIONS.find(a => a.id === rule.action);
                    const triggered = result?.triggered;

                    return (
                        <div key={rule.id} className={`bg-dark border rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center gap-4 transition ${
                            result !== undefined ? (triggered ? 'border-success/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-slate-700') : 'border-slate-800'
                        }`}>
                            {/* Rule number */}
                            <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-600/40 flex items-center justify-center text-purple-400 font-bold text-sm shrink-0">
                                {i + 1}
                            </div>

                            {/* IF block */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-500 bg-slate-800 px-2 py-1 rounded">IF</span>
                                <span className="font-bold text-white text-sm">{rule.symbol}</span>
                                <span className="text-xs bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-300">{cond?.label}</span>
                                {rule.condValue && <span className="font-mono text-primary font-bold">{rule.condValue}</span>}
                                <span className="text-xs font-bold text-slate-500 bg-slate-800 px-2 py-1 rounded">THEN</span>
                                <span className={`text-xs font-bold px-2 py-1 rounded border ${act?.color}`}>{act?.label}</span>
                            </div>

                            {/* Result */}
                            <div className="flex items-center gap-3 ml-auto shrink-0">
                                {result && (
                                    <>
                                        <div className="text-xs text-slate-500">RSI: <span className="text-white">{result.rsi}</span></div>
                                        <div className="text-xs text-slate-500">₹<span className="text-white font-mono">{(result.currentPrice||0).toFixed(0)}</span></div>
                                        <div className={`text-xs font-bold px-2 py-1 rounded border ${triggered ? 'text-success bg-success/10 border-success/30 animate-pulse' : 'text-slate-500 border-slate-700'}`}>
                                            {triggered ? '✓ TRIGGERED' : '○ NOT MET'}
                                        </div>
                                    </>
                                )}
                                <button onClick={() => removeRule(rule.id)} className="text-slate-600 hover:text-danger transition ml-2">
                                    <i data-lucide="x" className="w-4 h-4"></i>
                                </button>
                            </div>
                        </div>
                    );
                })}
                {rules.length === 0 && (
                    <div className="text-slate-600 text-center py-12 border border-dashed border-slate-800 rounded-xl">
                        <i data-lucide="cpu" className="w-10 h-10 mx-auto mb-3 opacity-20"></i>
                        <p>No rules yet. Click "Add Rule" to build your first strategy.</p>
                    </div>
                )}
            </div>

            {/* Run Log */}
            {log.length > 0 && (
                <div className="bg-dark border border-slate-800 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <i data-lucide="terminal" className="w-4 h-4 text-purple-400"></i> Execution Log
                    </h3>
                    <div className="space-y-2 font-mono text-xs">
                        {log.map((l, i) => (
                            <div key={i} className={`flex gap-3 items-start p-2 rounded ${l.triggered ? 'bg-success/5 border border-success/20' : 'bg-slate-900/50'}`}>
                                <span className="text-slate-600 shrink-0">[{l.time}]</span>
                                <span className="text-slate-400 truncate">{l.rule}</span>
                                <span className={`ml-auto shrink-0 font-bold ${l.triggered ? 'text-success' : 'text-slate-600'}`}>
                                    {l.triggered ? '⚡ SIGNAL' : 'WAIT'}
                                </span>
                            </div>
                        ))}
                    </div>
                    {log.filter(l => l.triggered).length > 0 && (
                        <div className="mt-3 bg-success/10 border border-success/30 rounded-lg p-3 text-success text-sm font-bold flex items-center gap-2">
                            <i data-lucide="zap" className="w-4 h-4"></i>
                            {log.filter(l => l.triggered).length} rule(s) triggered! In a live system, orders would be sent automatically.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════
// NEW: AI COPILOT & WHALE TRACKER
// ═══════════════════════════════════════════════════════════════════
const CopilotOrb = ({ token, onCommandAction }) => {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const [response, setResponse] = useState(null);
    const scrollRef = useRef();

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!query.trim()) return;
        setLoading(true);
        setResponse(null);
        try {
            const data = await apiFetch("/trade/command", "POST", { query }, token);
            setResponse(data);
            setHistory(prev => [...prev, { q: query, r: data.message }]);
            if (data.action) onCommandAction(data.action, data.payload);
        } catch (err) {
            setResponse({ type: 'error', message: 'Fault in neural link. Try again.' });
        }
        setQuery('');
        setLoading(false);
    };

    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [history, loading]);

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
            {active && (
                <div className="bg-darker/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl w-80 shadow-2xl mb-4 overflow-hidden flex flex-col max-h-[500px]">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                        <span className="text-xs font-bold text-primary flex items-center gap-2">
                            <i data-lucide="zap" className="w-4 h-4"></i> AI TRADING COPILOT
                        </span>
                        <button onClick={() => setActive(false)} className="text-slate-500 hover:text-white"><i data-lucide="x" className="w-4 h-4"></i></button>
                    </div>
                    
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-sm min-h-[100px]">
                        {history.length === 0 && !loading && (
                            <div className="text-slate-600 italic">"Buy 10 TCS", "Show my P&L", or "Analyze NIFTY"... I'm listening.</div>
                        )}
                        {history.map((h, i) => (
                            <div key={i}>
                                <div className="text-slate-400 font-bold text-[10px] mb-1">TRADER</div>
                                <div className="bg-slate-800/50 px-3 py-2 rounded-lg mb-2">{h.q}</div>
                                <div className="text-primary font-bold text-[10px] mb-1">COPILOT</div>
                                <div className="bg-primary/10 border-l-2 border-primary px-3 py-2 rounded-r-lg whitespace-pre-wrap">{h.r}</div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-2 items-center text-primary animate-pulse">
                                <i data-lucide="loader" className="animate-spin w-4 h-4"></i> Processing...
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="p-3 bg-slate-900/80 border-t border-slate-800">
                        <div className="relative">
                            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-full px-4 py-2 pr-10 text-sm outline-none focus:border-primary transition"
                                placeholder="Command Copilot..." />
                            <button type="submit" className="absolute right-2 top-1.5 p-1 text-primary hover:scale-110 transition">
                                <i data-lucide="send" className="w-4 h-4"></i>
                            </button>
                        </div>
                    </form>
                </div>
            )}
            
            <button onClick={() => setActive(!active)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl relative group ${active ? 'bg-primary scale-90 rotate-90' : 'bg-slate-900 border-2 border-primary hover:scale-110'}`}>
                <div className={`absolute inset-0 rounded-full bg-primary/20 animate-ping group-hover:block hidden`}></div>
                <div className={`absolute inset-[-2px] rounded-full border-2 border-primary/30 animate-pulse`}></div>
                <i data-lucide="cpu" className={`w-4 h-4 ${active ? 'text-white' : 'text-primary'}`}></i>
            </button>
        </div>
    );
};

const WhaleTrackerAlerts = ({ alerts }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
        <div className="fixed bottom-6 right-16 z-[90] flex flex-col items-end">
            {isOpen && (
                <div className="bg-darker/95 backdrop-blur-3xl border border-amber-500/30 rounded-2xl w-80 shadow-2xl mb-4 overflow-hidden flex flex-col max-h-[500px] animate-in zoom-in-95 fade-in duration-200 origin-bottom-right">
                    <div className="p-4 border-b border-amber-500/20 flex justify-between items-center bg-amber-500/5">
                        <span className="text-xs font-black text-amber-500 flex items-center gap-2">
                             <i data-lucide="waves" className="w-4 h-4"></i> WHALE MONITOR (REAL-TIME)
                        </span>
                        <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                            <i data-lucide="x" className="w-4 h-4"></i>
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-[120px]">
                        {alerts.length === 0 ? (
                            <div className="text-slate-600 text-center py-10 italic">
                                <i data-lucide="shield-alert" className="w-10 h-10 mx-auto mb-3 opacity-10"></i>
                                <p className="text-[10px] font-bold uppercase tracking-widest">No massive block trades detected.</p>
                            </div>
                        ) : (
                            [...alerts].reverse().slice(0, 15).map((alert, i) => (
                                <div key={i} className="bg-slate-900/60 p-3 rounded-xl border border-white/5 hover:border-amber-500/20 transition-all group/whale">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[9px] font-bold text-amber-500 uppercase tracking-tighter shrink-0">{alert.side} ORDER</span>
                                        <span className="text-[8px] text-slate-500 font-mono tracking-tighter">{new Date(alert.timestamp*1000).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <div className="text-sm font-black text-white group-hover/whale:text-amber-400 transition-colors uppercase tracking-tight">{alert.symbol}</div>
                                            <div className="text-[9px] text-slate-400 font-mono">QTY: {alert.volume.toLocaleString()} @ ₹{alert.price.toFixed(1)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs font-black text-amber-500 italic">₹{(alert.value / 100000).toFixed(1)}L</div>
                                            <div className="text-[8px] font-bold uppercase tracking-widest text-slate-600">BLOCK VALUE</div>
                                        </div>
                                    </div>
                                    <div className="mt-2 h-[1px] bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-amber-500 to-amber-200 animate-shrink-width" style={{animationDuration: '5s'}}></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="p-3 bg-amber-500/5 text-center border-t border-amber-500/10">
                        <span className="text-[9px] font-black text-amber-600 uppercase tracking-[0.2em]">Institutional Surveillance Active</span>
                    </div>
                </div>
            )}
            
            <button onClick={() => setIsOpen(!isOpen)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 shadow-[0_10px_30px_rgba(245,158,11,0.2)] relative group ${isOpen ? 'bg-amber-500 scale-90 rotate-90' : 'bg-slate-900 border-2 border-amber-500/50 hover:scale-110 hover:border-amber-500'}`}>
                {alerts.length > 0 && !isOpen && (
                   <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[8px] font-black rounded-full flex items-center justify-center animate-bounce shadow-lg ring-[2px] ring-darker">
                      {alerts.length > 99 ? '99+' : alerts.length}
                   </span>
                )}
                <div className={`absolute inset-[-2px] rounded-full border-2 border-amber-500/30 animate-pulse ${alerts.length > 0 ? 'block' : 'hidden'}`}></div>
                <i data-lucide="waves" className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-amber-500'}`}></i>
            </button>
        </div>
    );
};


const App = () => {
    return (
        <AuthProvider>
            <AuthConsumer />
        </AuthProvider>
    );
};

const AuthConsumer = () => {
    const { user, loading } = useContext(AuthContext);
    if (loading) return <div className="min-h-screen flex items-center justify-center bg-darker text-primary">Loading...</div>;
    return user ? <Dashboard /> : <AuthScreen />;
};

const domNode = document.getElementById('root');
if (domNode) {
    console.log("Root element found, mounting React...");
    const root = createRoot(domNode);
    root.render(<App />);
} else {
    console.error("Root element not found!");
}

