const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// ===== IN-MEMORY STORAGE (NO FILES, NO SQLITE) =====
const inventory = [
    { id: 1, name: '🍕 Margherita Pizza', price: 12.99, stock: 50, category: 'Pizza' },
    { id: 2, name: '🍕 Pepperoni Pizza', price: 15.99, stock: 40, category: 'Pizza' },
    { id: 3, name: '🥗 Caesar Salad', price: 8.99, stock: 30, category: 'Salads' },
    { id: 4, name: '🍝 Spaghetti Carbonara', price: 14.99, stock: 25, category: 'Pasta' },
    { id: 5, name: '🍰 Tiramisu', price: 6.99, stock: 20, category: 'Desserts' },
    { id: 6, name: '🥤 Coca Cola', price: 2.99, stock: 100, category: 'Drinks' },
    { id: 7, name: '☕ Espresso', price: 3.50, stock: 80, category: 'Drinks' }
];

const transactions = [];
const offline = [];

console.log('✅ IN-MEMORY STORAGE - NO SQLITE!');

// ===== API =====

app.get('/api/inventory', (req, res) => {
    res.json(inventory);
});

app.post('/api/update-stock', (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Invalid items' });
    }
    items.forEach(item => {
        const found = inventory.find(i => i.id === item.id);
        if (found) found.stock = Math.max(0, found.stock - item.quantity);
    });
    res.json({ success: true });
});

app.post('/api/transaction', (req, res) => {
    const { transaction_id, items, total, payment_method } = req.body;
    transactions.push({
        id: transactions.length + 1,
        transaction_id,
        items: JSON.stringify(items),
        total,
        payment_method,
        timestamp: new Date().toISOString()
    });
    console.log('✅ Transaction saved:', transaction_id);
    res.json({ success: true });
});

app.post('/api/offline-transaction', (req, res) => {
    const { transaction_id, items, total, payment_method } = req.body;
    offline.push({
        id: offline.length + 1,
        transaction_id,
        items: JSON.stringify(items),
        total,
        payment_method,
        timestamp: new Date().toISOString(),
        synced: false
    });
    console.log('✅ Offline transaction saved:', transaction_id);
    res.json({ success: true });
});

app.get('/api/sync-offline', (req, res) => {
    const unsynced = offline.filter(t => !t.synced);
    unsynced.forEach(t => {
        transactions.push({
            id: transactions.length + 1,
            transaction_id: t.transaction_id,
            items: t.items,
            total: t.total,
            payment_method: t.payment_method,
            timestamp: t.timestamp
        });
        t.synced = true;
    });
    console.log('✅ Synced:', unsynced.length);
    res.json({ synced: unsynced.length });
});

app.post('/api/generate-qr', async (req, res) => {
    try {
        const { transaction_id, total, items } = req.body;
        const receiptData = {
            transaction_id,
            total: total.toFixed(2),
            date: new Date().toLocaleString(),
            items: items || [],
            link: `http://localhost:${PORT}/receipt/${transaction_id}`
        };
        const qr = await QRCode.toDataURL(JSON.stringify(receiptData), {
            errorCorrectionLevel: 'H',
            width: 300,
            margin: 2
        });
        res.json({ qr_code: qr });
    } catch (err) {
        console.error('QR error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ai-upsell', (req, res) => {
    const { items } = req.body;
    if (!items || items.length === 0) {
        return res.json({ recommendation: null });
    }
    const hasPizza = items.some(i => i.category && i.category.toLowerCase() === 'pizza');
    const hasDrink = items.some(i => i.category && i.category.toLowerCase() === 'drinks');
    const hasDessert = items.some(i => i.category && i.category.toLowerCase() === 'desserts');
    
    let recommendation = null;
    if (hasPizza && !hasDrink) {
        recommendation = { name: '🥤 Coca Cola', price: 2.99, message: '80% of customers add a drink with pizza!' };
    } else if (hasPizza && hasDrink && !hasDessert) {
        recommendation = { name: '🍰 Tiramisu', price: 6.99, message: 'Complete your meal with dessert!' };
    }
    res.json({ recommendation });
});

app.get('/receipt/:transaction_id', (req, res) => {
    const t = transactions.find(tx => tx.transaction_id === req.params.transaction_id);
    if (!t) {
        return res.send('<h1>Not Found</h1><a href="/">Back</a>');
    }
    const items = JSON.parse(t.items);
    const rows = items.map(i => 
        `<tr><td>${i.name} x${i.quantity}</td><td>$${(i.price * i.quantity).toFixed(2)}</td></tr>`
    ).join('');
    
    res.send(`
        <html>
        <head>
            <title>Receipt</title>
            <style>
                body { font-family: Arial; max-width: 500px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
                .receipt { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { text-align: center; border-bottom: 2px dashed #ddd; padding-bottom: 15px; }
                .header h1 { color: #2c3e50; }
                .header p { color: #7f8c8d; }
                table { width: 100%; margin: 20px 0; border-collapse: collapse; }
                td { padding: 8px 0; border-bottom: 1px solid #eee; }
                .total { font-size: 1.4rem; text-align: right; font-weight: bold; border-top: 2px solid #2c3e50; padding-top: 15px; }
                .total span { color: #27ae60; }
                .payment { background: #f8f9fa; padding: 10px; border-radius: 8px; text-align: center; margin: 10px 0; }
                .footer { text-align: center; margin-top: 20px; color: #95a5a6; }
                .back { display: inline-block; margin-top: 15px; padding: 10px 20px; background: #3498db; color: white; text-decoration: none; border-radius: 8px; }
                .print { display: inline-block; margin-top: 15px; padding: 10px 20px; background: #27ae60; color: white; border: none; border-radius: 8px; cursor: pointer; margin-left: 10px; }
            </style>
        </head>
        <body>
        <div class="receipt">
            <div class="header">
                <h1>🧾 Receipt</h1>
                <p><strong>Transaction:</strong> ${t.transaction_id}</p>
                <p>${new Date(t.timestamp).toLocaleString()}</p>
            </div>
            <table><tbody>${rows}</tbody></table>
            <div class="total">Total: <span>$${t.total.toFixed(2)}</span></div>
            <div class="payment">💳 ${t.payment_method}</div>
            <div class="footer">Thank you for your order! 🎉</div>
            <a href="/" class="back">🏠 Back</a>
            <button onclick="window.print()" class="print">🖨️ Print</button>
        </div>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`🚀 POS RUNNING!`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`✅ NO SQLITE - Using in-memory storage`);
    console.log(`========================================\n`);
});