import re

with open('frontend/app.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# IPOTab replacement logic
ipo_old = r"""const IPOTab = \(\{ wallet, token \}\) => \{
    const \[bids, setBids\] = useState\(\{\}\);
    
    const ipos = \[[\s\S]*?\];

    const handleBid = \(symbol, cost\) => \{[\s\S]*?\};"""

ipo_new = """const IPOTab = ({ wallet, token }) => {
    const [ipos, setIpos] = useState([]);
    const [bids, setBids] = useState({});
    
    useEffect(() => {
        apiFetch(\"/trade/ipos\", \"GET\", null, token)
            .then(data => {
                setIpos(data);
                const newBids = {};
                data.forEach(i => { if(i.has_bid) newBids[i.symbol] = true; });
                setBids(newBids);
            })
            .catch(console.error);
    }, [token]);

    const handleBid = async (symbol, cost) => {
        if(wallet.balance < cost) return alert(\"Insufficient funds to place IPO bid!\");
        try {
            await apiFetch(`/trade/ipo/${symbol}/bid`, \"POST\", null, token);
            setBids(prev => ({...prev, [symbol]: true}));
            alert(`Successfully queued bid for ${symbol}! Allocation results will be announced dynamically.`);
            apiFetch(\"/trade/ipos\", \"GET\", null, token).then(setIpos);
        } catch (e) {
            alert(e.message);
        }
    };"""

code = re.sub(ipo_old, ipo_new, code)

# OTCTab replacement logic
otc_old = r"""const OTCTab = \(\{ token, wallet \}\) => \{
    // Basic mock logic for OTC\. Real integration requires a separate database table for `otc_listings`\.
    const \[listings, setListings\] = useState\([\s\S]*?\]\);

    const handleBuy = \(id, cost\) => \{[\s\S]*?\};

    return \(
        <div className="max-w-6xl mx-auto mt-4">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2"><i data-lucide="briefcase" className="text-slate-400"></i> Peer-to-Peer OTC Dark Pool</h2>
                    <p className="text-slate-400 text-sm mt-1">Buy enormous blocks of assets directly from other traders off-market\.</p>
                </div>
                <button className="bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded font-bold shadow-lg transition">Create Block Listing</button>
            </div>"""

otc_new = """const OTCTab = ({ token, wallet }) => {
    const [listings, setListings] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [newListing, setNewListing] = useState({ symbol: '', quantity: 1000, price: '' });

    const loadListings = () => {
        apiFetch(\"/trade/otc\", \"GET\", null, token).then(setListings).catch(console.error);
    };
    useEffect(loadListings, [token]);

    const handleBuy = async (id, cost) => {
        if (wallet.balance < cost) return alert(\"Insufficient funds to buy this OTC block!\");
        try {
            await apiFetch(`/trade/otc/${id}/buy`, \"POST\", null, token);
            alert(\"OTC Dark Pool Block successfully settled! (Simulated)\");
            loadListings();
        } catch(e) { alert(e.message); }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await apiFetch(\"/trade/otc\", \"POST\", { symbol: newListing.symbol.toUpperCase(), quantity: parseInt(newListing.quantity), price: parseFloat(newListing.price) }, token);
            alert(\"OTC Listing created!\");
            setNewListing({ symbol: '', quantity: 1000, price: '' });
            setShowCreate(false);
            loadListings();
        } catch(e) { alert(e.message); }
    };

    return (
        <div className=\"max-w-6xl mx-auto mt-4\">
            <div className=\"flex justify-between items-center mb-6\">
                <div>
                    <h2 className=\"text-2xl font-bold flex items-center gap-2\"><i data-lucide=\"briefcase\" className=\"text-slate-400\"></i> Peer-to-Peer OTC Dark Pool</h2>
                    <p className=\"text-slate-400 text-sm mt-1\">Buy enormous blocks of assets directly from other traders off-market.</p>
                </div>
                <button onClick={() => setShowCreate(!showCreate)} className=\"bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded font-bold shadow-lg transition\">Create Block Listing</button>
            </div>
            
            {showCreate && (
                <div className=\"bg-dark p-6 rounded-xl border border-primary/30 shadow-2xl mb-6\">
                    <h3 className=\"text-lg font-bold mb-4\">Create new off-market listing</h3>
                    <form onSubmit={handleCreate} className=\"flex gap-4 items-end\">
                        <div className=\"flex-1\">
                            <label className=\"block text-xs text-slate-400 mb-1\">Asset Symbol</label>
                            <input required value={newListing.symbol} onChange={e=>setNewListing({...newListing, symbol: e.target.value})} className=\"w-full bg-slate-800 border-none rounded p-2 text-white\" placeholder=\"RELIANCE\" />
                        </div>
                        <div className=\"flex-1\">
                            <label className=\"block text-xs text-slate-400 mb-1\">Quantity</label>
                            <input required type=\"number\" value={newListing.quantity} onChange={e=>setNewListing({...newListing, quantity: e.target.value})} className=\"w-full bg-slate-800 border-none rounded p-2 text-white\" />
                        </div>
                        <div className=\"flex-1\">
                            <label className=\"block text-xs text-slate-400 mb-1\">Total Asking Price Per Share</label>
                            <input required type=\"number\" step=\"0.01\" value={newListing.price} onChange={e=>setNewListing({...newListing, price: e.target.value})} className=\"w-full bg-slate-800 border-none rounded p-2 text-white\" />
                        </div>
                        <button type=\"submit\" className=\"bg-success hover:bg-green-600 text-white font-bold px-6 py-2 rounded\">List Now</button>
                    </form>
                </div>
            )}"""

code = re.sub(otc_old, otc_new, code)

with open('frontend/app.jsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Patching complete.")
