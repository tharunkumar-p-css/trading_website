console.log("App.jsx is executing...");
const { useState, useEffect, useContext, createContext, useRef } = React;
const { createRoot } = ReactDOM;
const { LightweightCharts } = window;
if (!LightweightCharts) console.error("LightweightCharts is not loaded!");

const RealtimeChart = ({ data, type = "candlestick", height, showVolume = false, showIndicators = false }) => {
    const chartContainerRef = useRef();
    const chartRef = useRef();
    const seriesRef = useRef();

    useEffect(() => {
        const chart = LightweightCharts.createChart(chartContainerRef.current, {
            autoSize: true,
            layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#94a3b8' },
            grid: { 
                vertLines: { color: type === 'line' ? 'transparent' : '#1e293b' }, 
                horzLines: { color: type === 'line' ? 'transparent' : '#1e293b' } 
            },
            timeScale: { visible: type !== 'line', timeVisible: true, secondsVisible: true, borderVisible: false },
            rightPriceScale: { visible: type !== 'line', borderVisible: false },
            handleScroll: type !== 'line',
            handleScale: type !== 'line'
        });
        chartRef.current = chart;
        
        const mainSeries = type === "candlestick" 
            ? chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444' })
            : chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, crosshairMarkerVisible: false });
        
        let volumeSeries, sma14, sma50;
        if (showVolume && type === "candlestick") {
            volumeSeries = chart.addHistogramSeries({
                color: '#26a69a',
                priceFormat: { type: 'volume' },
                priceScaleId: '', 
            });
            chart.priceScale('').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        }
        
        if (showIndicators && type === "candlestick") {
            sma14 = chart.addLineSeries({ color: 'rgba(255, 193, 7, 0.8)', lineWidth: 2, title: 'SMA 14', crosshairMarkerVisible: false });
            sma50 = chart.addLineSeries({ color: 'rgba(156, 39, 176, 0.8)', lineWidth: 2, title: 'SMA 50', crosshairMarkerVisible: false });
        }
        
        seriesRef.current = { main: mainSeries, volume: volumeSeries, sma14, sma50 };

        return () => { 
            chart.remove(); 
        };
    }, [type, showVolume, showIndicators]);

    useEffect(() => {
        if (!seriesRef.current || !seriesRef.current.main || !data || data.length === 0) return;
        
        seriesRef.current.main.setData(data);
        
        if (showVolume && seriesRef.current.volume) {
            const volData = data.map(d => ({
                time: d.time,
                value: typeof d.volume === 'number' ? d.volume : Math.abs(d.close - d.open) * (Math.random()*500 + 100), 
                color: d.close >= d.open ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)'
            }));
            seriesRef.current.volume.setData(volData);
        }
        
        if (showIndicators && seriesRef.current.sma14) {
            const getSMA = (period) => {
                const sData = [];
                for(let i=0; i<data.length; i++) {
                    if(i < period - 1) continue;
                    let sum = 0;
                    for(let j=0; j<period; j++) sum += data[i-j].close;
                    sData.push({ time: data[i].time, value: sum/period });
                }
                return sData;
            };
            seriesRef.current.sma14.setData(getSMA(14));
            seriesRef.current.sma50.setData(getSMA(50));
        }
    }, [data, showVolume, showIndicators]);

    return <div ref={chartContainerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />;
};

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
const MUTUAL_FUNDS = ["PARAGPARIKH", "QUANTUM", "SBISMALL", "MIRAEASSET", "HDFCMIDCAP", "NIPPONIND", "AXISBLUECHIP", "SBIBLUECHIP", "ICICIPRU", "MOTILALOSWAL", "KOTAKSMALL", "UTINIFTY", "DSPMIDCAP", "FRANKLININD", "TATAELSS"];
const CRYPTO_ASSETS = ["BTC_INR", "ETH_INR", "SOL_INR", "DOGE_INR", "PEPE_INR", "ADA_INR", "DOT_INR", "XRP_INR", "LINK_INR", "MATIC_INR", "SHIB_INR", "AVAX_INR", "UNI_INR", "LTC_INR"];
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
    const ws = useRef(null);

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
                            value: candle.close
                        };
                        const lst = newHist[symbol];
                        if (lst.length > 0 && lst[lst.length - 1].time === nowSec) {
                            lst[lst.length - 1] = newCandle;
                        } else {
                            lst.push(newCandle);
                        }
                        if (lst.length > 100) lst.shift();
                    }
                    return newHist;
                });
            } else if (msg.type === "news_update") {
                setNewsFeed(prev => [msg.data, ...prev].slice(0, 10)); // Keep last 10
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
        setNotifications(prev => [msg, ...prev].slice(0, 5));
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
                    <button onClick={() => handleTabChange('pro_terminal')} className={`w-full flex items-center p-3 rounded-lg text-left transition font-bold shadow-lg mt-4 ${activeTab==='pro_terminal' ? 'bg-primary/20 text-white border border-primary/50' : 'bg-slate-900 border border-slate-800 text-primary hover:bg-slate-800'}`}>
                        <i data-lucide="layout-grid" className="mr-3 text-primary"></i> PRO Terminal
                    </button>
                    <button onClick={() => handleTabChange('ipo')} className={`w-full flex items-center p-3 rounded-lg text-left transition font-bold border ${activeTab==='ipo' ? 'bg-slate-800/80 text-white border-yellow-500/50' : 'bg-dark border-dashed border-slate-700 text-yellow-500/80 hover:border-yellow-500/50'}`}>
                        <i data-lucide="rocket" className="mr-3 text-yellow-500"></i> IPO Center
                    </button>
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
                        <div className="bg-slate-900 rounded-full px-3 py-1.5 md:px-4 md:py-1.5 border border-slate-700 font-mono text-xs md:text-sm whitespace-nowrap flex items-center gap-2 text-primary">
                            <i data-lucide="wallet" className="w-3.5 h-3.5 md:w-4 md:h-4 hidden sm:block"></i> ₹{(wallet.balance || 0).toFixed(2)}
                        </div>
                    </div>
                </header>
                
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
                    {activeTab === 'portfolio' && <PortfolioTab portfolio={portfolio} livePrices={livePrices} token={token} portfolioHistory={portfolioHistory} />}
                    {activeTab === 'orders' && <OrdersTab orders={orders} onRefresh={loadData} token={token} />}
                    {activeTab === 'pro_terminal' && <ProTerminalTab livePrices={livePrices} priceHistory={priceHistory} />}
                    {activeTab === 'ipo' && <IPOTab wallet={wallet} token={token} />}
                    {activeTab === 'wallet' && <WalletTab balance={wallet.balance} token={token} />}
                </main>

                {/* Notifications Toast */}
                {notifications.length > 0 && (
                    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                        {notifications.map((n, i) => (
                            <div key={i} className="bg-slate-800 border-l-4 border-primary p-4 rounded shadow-lg text-sm text-white animate-pulse">
                                {n}
                            </div>
                        ))}
                    </div>
                )}
            </div>
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

    return (
        <div>
             <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                 <i data-lucide={filterType === "MUTUAL_FUNDS" ? "landmark" : filterType === "CRYPTO" ? "bitcoin" : "activity"} className="w-6 h-6 text-primary"></i> 
                 {filterType === "MUTUAL_FUNDS" ? "Mutual Funds Explorer" : filterType === "CRYPTO" ? "Crypto Exchange" : "Equity Market"}
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredPrices.map(([symbol, price]) => (
                    <div key={symbol} onClick={() => setSelectedStock(symbol)} 
                         className="bg-dark p-4 rounded-xl border border-slate-800 hover:border-primary cursor-pointer transition flex flex-col justify-between h-40 group">
                        <div className="flex justify-between items-start mb-2 pointer-events-auto">
                            <h3 className="font-bold text-lg group-hover:text-primary transition">{symbol}</h3>
                            <button onClick={(e) => { e.stopPropagation(); apiFetch("/trade/watchlist", "POST", { symbol }, token).then(onRefresh).catch(err=>alert(err.message)); }} className="text-slate-500 hover:text-yellow-400 p-1 tooltip" title="Add to Watchlist">
                                <i data-lucide="star" className="w-4 h-4"></i>
                            </button>
                        </div>
                        
                        <div className="h-20 w-full pointer-events-none mt-2">
                            <RealtimeChart data={priceHistory[symbol] || []} type="line" height={80} />
                        </div>

                        <div className="text-2xl font-mono mt-auto pt-2">₹{price.toFixed(2)}</div>
                    </div>
                ))}
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
                            
                            <div>
                                <label className="text-sm text-slate-400 block mb-2">Quantity</label>
                                <input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-4 py-3 text-white focus:outline-none focus:border-primary text-lg" />
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

                            <div>
                                <label className="text-sm text-slate-400 block mb-2">Quantity</label>
                                <input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-4 py-3 text-white focus:outline-none focus:border-primary text-lg" />
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
    const [symbol, setSymbol] = useState("");
    const [amount, setAmount] = useState("");
    const [interval, setInterval] = useState("");
    const [error, setError] = useState("");
    
    const loadBots = async () => {
        try {
            const data = await apiFetch("/trade/bots", "GET", null, token);
            setBots(data);
        } catch (err) { setError(err.message); }
    };
    
    useEffect(() => { loadBots(); }, []);
    
    const handleCreate = async (e) => {
        e.preventDefault();
        setError("");
        try {
            await apiFetch("/trade/bots", "POST", { symbol: symbol.toUpperCase(), amount_per_trade: parseFloat(amount), interval_seconds: parseInt(interval) }, token);
            setSymbol(""); setAmount(""); setInterval("");
            loadBots();
        } catch (err) { setError(err.message); }
    };
    
    const handleDelete = async (id) => {
        await apiFetch(`/trade/bots/${id}`, "DELETE", null, token);
        loadBots();
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><i data-lucide="cpu" className="text-primary"></i> Automated DCA Bots</h2>
            
            <div className="bg-dark p-6 rounded-xl border border-slate-800 mb-8 max-w-xl shadow-lg">
                <h3 className="text-lg font-bold mb-4 flex items-center"><i data-lucide="settings" className="w-5 h-5 mr-2"></i> Configure Parameters</h3>
                {error && <div className="text-danger mb-4 text-sm bg-danger/10 p-3 rounded border border-danger/30">{error}</div>}
                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="flex gap-4 flex-col md:flex-row">
                        <div className="flex-1">
                            <label className="text-slate-400 text-sm block mb-1">Target Symbol</label>
                            <input placeholder="BTC_INR" value={symbol} onChange={e=>setSymbol(e.target.value)} className="w-full bg-slate-900 border border-slate-700/50 rounded px-4 py-2.5 text-white focus:border-primary transition outline-none" required />
                        </div>
                        <div className="flex-1">
                            <label className="text-slate-400 text-sm block mb-1">Trade Size (₹)</label>
                            <input type="number" min="10" placeholder="1000" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full bg-slate-900 border border-slate-700/50 rounded px-4 py-2.5 text-white focus:border-primary transition outline-none" required />
                        </div>
                        <div className="flex-1">
                            <label className="text-slate-400 text-sm block mb-1">Cycle (Seconds)</label>
                            <input type="number" min="5" placeholder="10" value={interval} onChange={e=>setInterval(e.target.value)} className="w-full bg-slate-900 border border-slate-700/50 rounded px-4 py-2.5 text-white focus:border-primary transition outline-none" required />
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-primary hover:bg-blue-600 font-bold py-3 rounded text-white shadow-lg shadow-primary/20 transition flex justify-center items-center gap-2"><i data-lucide="zap" className="w-4 h-4"></i> Deploy Autonomous Bot</button>
                </form>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {bots.map(bot => (
                    <div key={bot.id} className="bg-slate-900 p-5 rounded-xl border border-primary/20 relative overflow-hidden shadow-lg group">
                        <div className="absolute -top-4 -right-4 p-2 opacity-5 text-primary group-hover:scale-110 transition"><i data-lucide="cpu" className="w-32 h-32"></i></div>
                        <div className="flex justify-between items-start mb-4 relative z-10 border-b border-slate-800 pb-4">
                            <div>
                                <h3 className="font-bold text-2xl tracking-tight">{bot.symbol}</h3>
                                <div className="text-xs text-primary font-mono tracking-widest mt-1 flex items-center "><span className="w-2 h-2 rounded-full bg-primary inline-block mr-2 animate-pulse"></span>ACTIVE POLLING</div>
                            </div>
                            <button onClick={()=>handleDelete(bot.id)} className="text-slate-500 hover:text-white hover:bg-danger bg-slate-800 p-2.5 rounded transition border border-slate-700 shadow-sm"><i data-lucide="trash-2" className="w-4 h-4"></i></button>
                        </div>
                        <div className="space-y-3 text-sm text-slate-300 relative z-10 pt-2">
                            <div className="flex justify-between items-center"><span className="text-slate-500">Execution Size</span> <span className="font-mono font-bold text-white text-base">₹{bot.amount_per_trade.toFixed(2)}</span></div>
                            <div className="flex justify-between items-center"><span className="text-slate-500">Frequency Vector</span> <span className="font-medium bg-slate-800 px-2 py-0.5 rounded text-xs">Every {bot.interval_seconds}s</span></div>
                            <div className="flex justify-between items-center pt-2"><span className="text-slate-500 text-xs">Last Action</span> <span className="text-xs font-mono opacity-80">{bot.last_executed ? new Date(bot.last_executed + 'Z').toLocaleTimeString() : 'Awaiting Engine...'}</span></div>
                        </div>
                    </div>
                ))}
                {bots.length === 0 && <div className="text-slate-500 col-span-3 text-center py-12 border border-dashed border-slate-800 rounded-xl bg-darker/50"><i data-lucide="server" className="w-12 h-12 mx-auto mb-4 opacity-20"></i>No active algorithms. Deploy your first autonomous DCA node above.</div>}
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

    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3"><i data-lucide="user" className="text-primary w-8 h-8"></i> Trader Profile</h2>
            
            <div className="bg-dark p-8 rounded-2xl border border-slate-800 flex items-center gap-6 mb-8 shadow-xl">
                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center text-4xl font-bold shadow-lg">
                    {user?.email?.[0].toUpperCase()}
                </div>
                <div>
                    <h3 className="text-3xl font-bold">{user?.email}</h3>
                    <p className="text-slate-400 mt-1 flex items-center gap-2"><i data-lucide="shield-check" className="w-4 h-4 text-success"></i> Verified Trader Account</p>
                </div>
            </div>

            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><i data-lucide="award" className="text-amber-400"></i> Unlockable Achievements</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {achievements.map((ach, i) => (
                    <div key={i} className="bg-gradient-to-br from-slate-900 to-dark p-6 rounded-xl border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)] flex items-start gap-4 transform transition hover:-translate-y-1">
                        <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center shrink-0">
                            <i data-lucide={ICONS[ach.badge_name] || "star"} className="text-amber-400 w-6 h-6"></i>
                        </div>
                        <div>
                            <h4 className="font-bold text-lg text-amber-500">{ach.badge_name}</h4>
                            <p className="text-sm text-slate-300 mt-1">{ach.description}</p>
                            <div className="text-xs text-slate-500 mt-3 flex items-center gap-1"><i data-lucide="calendar" className="w-3 h-3"></i> Unlocked {new Date(ach.unlocked_at + 'Z').toLocaleDateString()}</div>
                        </div>
                    </div>
                ))}
                {achievements.length === 0 && (
                    <div className="col-span-2 text-center py-16 border border-dashed border-slate-800 rounded-xl bg-darker/50">
                        <i data-lucide="lock" className="w-16 h-16 mx-auto mb-4 opacity-20 text-slate-400"></i>
                        <p className="text-slate-400 font-medium">No Badges Unlocked Yet</p>
                        <p className="text-sm text-slate-500 mt-1">Keep trading scaling volume to earn rare milestones.</p>
                    </div>
                )}
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
    const [options, setOptions] = useState([]);
    const [symbol, setSymbol] = useState("");
    const [strike, setStrike] = useState("");
    const [qty, setQty] = useState("");
    const [type, setType] = useState("CALL");
    const [expiry, setExpiry] = useState("5");
    const [error, setError] = useState("");

    const loadOptions = async () => {
        try {
            const data = await apiFetch("/trade/options", "GET", null, token);
            setOptions(data);
        } catch(e) { console.error(e); }
    };
    
    useEffect(() => { loadOptions(); }, [token]);

    const handleBuy = async (e) => {
        e.preventDefault();
        setError("");
        try {
            await apiFetch("/trade/options", "POST", { symbol: symbol.toUpperCase(), strike_price: parseFloat(strike), quantity: parseInt(qty), option_type: type, expires_in_minutes: parseInt(expiry) }, token);
            loadOptions();
            setSymbol(""); setStrike(""); setQty("");
        } catch(e) { setError(e.message); }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><i data-lucide="zap" className="text-primary w-6 h-6"></i> Options Engine</h2>
            
            <div className="bg-gradient-to-br from-slate-900 to-dark p-6 rounded-xl border border-primary/30 mb-8 shadow-2xl flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                    <h3 className="text-lg font-bold mb-4 flex items-center"><i data-lucide="shopping-cart" className="w-5 h-5 mr-2"></i> Purchase Contract</h3>
                    {error && <div className="text-danger mb-4 text-sm bg-danger/10 p-3 rounded border border-danger/30">{error}</div>}
                    <form onSubmit={handleBuy} className="space-y-4">
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="text-slate-400 text-xs block mb-1">Asset Symbol</label>
                                <input placeholder="BTC_INR" value={symbol} onChange={e=>setSymbol(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2 text-white outline-none focus:border-primary" required />
                            </div>
                            <div className="flex-1">
                                <label className="text-slate-400 text-xs block mb-1">Contract Quantity</label>
                                <input type="number" min="1" placeholder="100" value={qty} onChange={e=>setQty(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2 text-white outline-none focus:border-primary" required />
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="text-slate-400 text-xs block mb-1">Strike Target (₹)</label>
                                <input type="number" step="0.01" min="1" placeholder="90000" value={strike} onChange={e=>setStrike(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2 text-white outline-none focus:border-primary" required />
                            </div>
                            <div className="flex-1">
                                <label className="text-slate-400 text-xs block mb-1">Type</label>
                                <select value={type} onChange={e=>setType(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2.5 text-white outline-none focus:border-primary">
                                    <option value="CALL">Call (Bullish)</option>
                                    <option value="PUT">Put (Bearish)</option>
                                </select>
                            </div>
                            <div className="flex-1">
                                <label className="text-slate-400 text-xs block mb-1">Expiry Frame</label>
                                <select value={expiry} onChange={e=>setExpiry(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2.5 text-white outline-none focus:border-primary">
                                    <option value="1">1 Minute (Turbo)</option>
                                    <option value="5">5 Minutes</option>
                                    <option value="15">15 Minutes</option>
                                    <option value="60">1 Hour</option>
                                </select>
                            </div>
                        </div>
                        <button type="submit" className={`w-full font-bold py-3 rounded text-white shadow-lg transition flex justify-center items-center gap-2 ${type==='CALL'?'bg-success hover:bg-green-600 shadow-success/20':'bg-danger hover:bg-red-600 shadow-danger/20'}`}><i data-lucide="bolt" className="w-4 h-4"></i> Execute {type} Order ~{(livePrices[symbol.toUpperCase()] ? (livePrices[symbol.toUpperCase()]*0.05*qty).toFixed(2) : 'Est.')}</button>
                    </form>
                </div>
            </div>
            
            <h3 className="text-lg font-bold mb-4 flex items-center border-b border-slate-800 pb-2"><i data-lucide="layers" className="w-5 h-5 mr-2"></i> Active & Settled Contracts</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {options.map(opt => {
                    const isMatured = new Date(opt.expires_at+'Z') < new Date();
                    return (
                    <div key={opt.id} className={`bg-slate-900 p-5 rounded-xl border relative shadow-lg ${opt.is_settled ? 'border-slate-800 opacity-60' : (opt.option_type==='CALL'?'border-success/30':'border-danger/30')}`}>
                        <div className="flex justify-between items-start mb-4 relative z-10 border-b border-slate-800 pb-3">
                            <div>
                                <h3 className="font-bold text-xl tracking-tight">{opt.symbol}</h3>
                                <div className={`text-xs font-bold mt-1 inline-flex items-center px-2 py-0.5 rounded ${opt.option_type==='CALL'?'bg-success/20 text-success':'bg-danger/20 text-danger'}`}>{opt.option_type} CONTRACT</div>
                            </div>
                            <div className="text-right">
                                <div className="font-mono text-sm">Strike ₹{opt.strike_price.toFixed(2)}</div>
                                <div className="text-xs text-slate-500 mt-1">QTY: {opt.quantity}</div>
                            </div>
                        </div>
                        <div className="space-y-2 text-sm text-slate-300">
                            <div className="flex justify-between"><span className="text-slate-500">Premium Paid</span> <span className="font-mono">₹{opt.premium_paid.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Status</span> <span className={`font-bold ${opt.is_settled?'text-slate-400':'text-primary animate-pulse'}`}>{opt.is_settled ? 'Settled' : 'Live Polling...'}</span></div>
                            <div className="flex justify-between items-center pt-2"><span className="text-slate-500 text-xs">Expires At</span> <span className="text-xs font-mono">{new Date(opt.expires_at+'Z').toLocaleTimeString()}</span></div>
                        </div>
                    </div>
                )})}
                {options.length === 0 && <div className="text-slate-500 col-span-3 text-center py-12 border border-dashed border-slate-800 rounded-xl bg-darker/50"><i data-lucide="slash" className="w-12 h-12 mx-auto mb-4 opacity-20"></i>No derivative contracts found in ledger.</div>}
            </div>
        </div>
    );
};

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

const ProTerminalTab = ({ livePrices, priceHistory }) => {
    const allSymbols = Object.keys(livePrices);
    const assets = allSymbols.length >= 4 ? allSymbols.slice(0,4) : ["RELIANCE", "TCS", "INFY", "HDFCBANK"];

    return (
        <div className="h-full flex flex-col absolute inset-0 md:relative md:inset-auto p-4 md:p-0">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-white"><i data-lucide="layout-grid" className="text-primary w-6 h-6"></i> Pro Terminal Dashboard</h2>
                    <p className="text-slate-400 text-sm hidden md:block mt-1">Multi-asset 4-way sync rendering engine.</p>
                </div>
                <div className="text-xs text-primary font-bold bg-primary/10 border border-primary/30 px-3 py-1.5 rounded animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.3)]">LIVE MULTI-CHART</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 mt-2 min-h-[80vh]">
                {assets.map((symbol, idx) => (
                    <div key={idx} className="bg-darker border border-slate-800 hover:border-primary/40 transition rounded-xl flex flex-col p-4 overflow-hidden shadow-2xl relative min-h-[300px]">
                        <div className="flex justify-between items-center mb-3 z-10">
                            <h3 className="font-bold text-slate-100 flex items-center gap-2 text-lg"><span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse shadow-[0_0_8px_#22c55e]"></span> {symbol}</h3>
                            <span className="text-primary font-bold font-mono text-xl bg-slate-900 px-3 py-1 rounded border border-slate-800 shadow-inner">₹{(livePrices[symbol] || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex-1 w-full relative mt-0 rounded-lg border border-slate-800 bg-[#0f172a]/30 overflow-hidden">
                            <RealtimeChart data={priceHistory[symbol] || []} type="candlestick" height={null} showVolume={true} showIndicators={true} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const IPOTab = ({ wallet, token }) => {
    const [bids, setBids] = useState({});
    
    const ipos = [
        { name: "Neuralink Corp", symbol: "NRLNK", price: 1540, minQty: 10, status: "OPEN", endsIn: "24:00:00", description: "Brain-computer interface technologies." },
        { name: "SpaceX Exploration", symbol: "SPCX", price: 3200, minQty: 5, status: "OPEN", endsIn: "48:30:00", description: "Aerospace manufacturer and space transport services." },
        { name: "Stark Industries", symbol: "STARK", price: 8500, minQty: 1, status: "CLOSED", endsIn: "00:00:00", description: "Advanced defense and clean energy tech." }
    ];

    const handleBid = (symbol, cost) => {
        if(wallet.balance < cost) return alert("Insufficient funds to place IPO bid!");
        setBids(prev => ({...prev, [symbol]: true}));
        alert(`Successfully queued bid for ${symbol}! Allocation results will be announced dynamically.`);
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
