let inventory = [];
let cart = [];
let total = 0;
let isOnline = navigator.onLine;
let transactionId = 'TXN-' + Date.now();

const menuContainer = document.getElementById('menuContainer');
const cartContainer = document.getElementById('cart');
const totalDisplay = document.getElementById('totalDisplay');
const statusBadge = document.getElementById('statusBadge');
const checkoutBtn = document.getElementById('checkoutBtn');
const syncBtn = document.getElementById('syncBtn');
const paymentMethod = document.getElementById('paymentMethod');
const qrContainer = document.getElementById('qrContainer');
const qrImage = document.getElementById('qrImage');
const aiUpsell = document.getElementById('aiUpsell');
const upsellMessage = document.getElementById('upsellMessage');
const addUpsellBtn = document.getElementById('addUpsellBtn');

window.addEventListener('online', () => {
    isOnline = true;
    statusBadge.textContent = '🟢 Online';
    statusBadge.className = 'online';
});

window.addEventListener('offline', () => {
    isOnline = false;
    statusBadge.textContent = '🔴 Offline';
    statusBadge.className = 'offline';
});

async function loadInventory() {
    try {
        const res = await fetch('/api/inventory');
        inventory = await res.json();
        renderMenu();
        console.log('✅ Loaded', inventory.length, 'items');
    } catch (err) {
        console.error(err);
        inventory = [];
        renderMenu();
    }
}

function renderMenu() {
    if (!menuContainer) return;
    if (inventory.length === 0) {
        menuContainer.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No items</p>';
        return;
    }
    menuContainer.innerHTML = inventory.map(item => `
        <div class="menu-item" onclick="addToCart(${item.id})">
            <h4>${item.name}</h4>
            <p class="price">$${item.price.toFixed(2)}</p>
            <small class="stock">📦 Stock: ${item.stock}</small>
        </div>
    `).join('');
}

function addToCart(itemId) {
    const item = inventory.find(i => i.id === itemId);
    if (!item || item.stock <= 0) {
        alert('Out of stock!');
        return;
    }
    const existing = cart.find(i => i.id === itemId);
    if (existing) {
        existing.quantity++;
    } else {
        cart.push({ ...item, quantity: 1 });
    }
    total += item.price;
    renderCart();
    checkAIUpsell();
}

function renderCart() {
    if (!cartContainer) return;
    if (cart.length === 0) {
        cartContainer.innerHTML = '<p class="empty">🛒 No items</p>';
    } else {
        cartContainer.innerHTML = cart.map((item, index) => `
            <div class="cart-item">
                <span>${item.name} x${item.quantity}</span>
                <span>$${(item.price * item.quantity).toFixed(2)}</span>
                <button onclick="removeFromCart(${index})">✕</button>
            </div>
        `).join('');
    }
    totalDisplay.innerHTML = `<strong>Total: $${total.toFixed(2)}</strong>`;
}

function removeFromCart(index) {
    total -= cart[index].price * cart[index].quantity;
    cart.splice(index, 1);
    renderCart();
    checkAIUpsell();
}

async function checkAIUpsell() {
    if (!aiUpsell || cart.length === 0) {
        aiUpsell.style.display = 'none';
        return;
    }
    try {
        const res = await fetch('/api/ai-upsell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cart })
        });
        const data = await res.json();
        if (data.recommendation) {
            aiUpsell.style.display = 'block';
            upsellMessage.textContent = `💡 ${data.recommendation.message} Add ${data.recommendation.name} ($${data.recommendation.price})?`;
            addUpsellBtn.onclick = () => {
                cart.push({ id: Date.now(), name: data.recommendation.name, price: data.recommendation.price, quantity: 1, category: 'Upsell' });
                total += data.recommendation.price;
                renderCart();
                aiUpsell.style.display = 'none';
            };
        } else {
            aiUpsell.style.display = 'none';
        }
    } catch (err) {
        console.error(err);
    }
}

checkoutBtn.addEventListener('click', async () => {
    if (cart.length === 0) {
        alert('Cart is empty!');
        return;
    }

    checkoutBtn.disabled = true;
    checkoutBtn.textContent = '⏳ Processing...';

    try {
        const stockRes = await fetch('/api/update-stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cart.map(i => ({ id: i.id, quantity: i.quantity })) })
        });
        if (!stockRes.ok) throw new Error('Stock update failed');

        const endpoint = isOnline ? '/api/transaction' : '/api/offline-transaction';
        const saveRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transaction_id: transactionId,
                items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, category: i.category })),
                total: total,
                payment_method: paymentMethod.value
            })
        });
        if (!saveRes.ok) throw new Error('Transaction save failed');

        try {
            const qrRes = await fetch('/api/generate-qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transaction_id: transactionId, total: total, items: cart })
            });
            if (qrRes.ok) {
                const qrData = await qrRes.json();
                qrImage.src = qrData.qr_code;
                qrContainer.style.display = 'block';
            }
        } catch (qrErr) {
            console.warn('QR failed:', qrErr);
        }

        const oldTxnId = transactionId;
        cart = [];
        total = 0;
        transactionId = 'TXN-' + Date.now();
        renderCart();
        aiUpsell.style.display = 'none';

        alert(`✅ Order placed!\nTransaction: ${oldTxnId}\nView: http://localhost:3000/receipt/${oldTxnId}`);

        setTimeout(() => {
            qrContainer.style.display = 'none';
        }, 10000);

    } catch (err) {
        alert('❌ Error: ' + err.message);
        console.error(err);
    } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = '✅ Checkout';
    }
});

syncBtn.addEventListener('click', async () => {
    if (!isOnline) {
        alert('You are offline!');
        return;
    }
    try {
        const res = await fetch('/api/sync-offline');
        const data = await res.json();
        alert(`✅ Synced ${data.synced} offline orders!`);
    } catch (err) {
        alert('Sync failed!');
    }
});

loadInventory();
console.log('🚀 POS Ready!');