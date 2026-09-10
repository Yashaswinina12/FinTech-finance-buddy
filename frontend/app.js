// SmartSettle Frontend Application

const API_BASE = 'http://localhost:5000/api';

let currentUser = null;
let allUsers = [];
let allDebts = [];
let allSettlements = [];

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    initializeEventListeners();
    await loadUsers();
    await loadDebts();
    await loadSettlements();
});

// Event Listeners
function initializeEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            switchPage(page);
        });
    });

    // User Selector
    document.getElementById('currentUser').addEventListener('change', (e) => {
        currentUser = e.target.value;
        if (currentUser) {
            updateDashboard();
        }
    });

    document.getElementById('profileUser').addEventListener('change', (e) => {
        const userId = e.target.value;
        if (userId) {
            loadUserProfile(userId);
        }
    });

    // Find Settlements Button
    document.getElementById('findSettlements').addEventListener('click', findSettlements);

    // History Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.tab).classList.add('active');
        });
    });

    // Modal Close
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('settlementModal').addEventListener('click', (e) => {
        if (e.target.id === 'settlementModal') closeModal();
    });
}

// Page Navigation
function switchPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById(page).classList.add('active');
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    if (page === 'settlements') {
        loadSettlements();
    } else if (page === 'history') {
        loadHistory();
    } else if (page === 'profile') {
        loadProfileUsers();
    }
}

// API Functions
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/users`);
        const data = await response.json();
        if (data.success) {
            allUsers = data.data;
            populateUserSelectors();
        }
    } catch (error) {
        showToast('Error loading users', 'error');
    }
}

async function loadDebts() {
    try {
        const response = await fetch(`${API_BASE}/debts`);
        const data = await response.json();
        if (data.success) {
            allDebts = data.data;
            if (currentUser) updateDashboard();
        }
    } catch (error) {
        showToast('Error loading debts', 'error');
    }
}

async function loadSettlements() {
    try {
        const response = await fetch(`${API_BASE}/settlements`);
        const data = await response.json();
        if (data.success) {
            allSettlements = data.data;
            displaySettlements();
        }
    } catch (error) {
        showToast('Error loading settlements', 'error');
    }
}

async function loadHistory() {
    try {
        const [historyRes, paymentsRes, settlementsRes] = await Promise.all([
            fetch(`${API_BASE}/history`),
            fetch(`${API_BASE}/history`),
            fetch(`${API_BASE}/history/settlements`)
        ]);

        const history = await historyRes.json();
        const payments = await paymentsRes.json();
        const settlements = await settlementsRes.json();

        if (history.success) displayTimeline(history.data);
        if (payments.success) displayPayments(payments.data);
        if (settlements.success) displaySettlementsHistory(settlements.data);
    } catch (error) {
        showToast('Error loading history', 'error');
    }
}

async function loadUserProfile(userId) {
    try {
        const [summaryRes, historyRes] = await Promise.all([
            fetch(`${API_BASE}/users/${userId}/summary`),
            fetch(`${API_BASE}/users/${userId}/history`)
        ]);

        const summary = await summaryRes.json();
        const history = await historyRes.json();

        if (summary.success && history.success) {
            displayUserProfile(summary.data, history.data);
        }
    } catch (error) {
        showToast('Error loading profile', 'error');
    }
}

async function findSettlements() {
    try {
        const response = await fetch(`${API_BASE}/settlements/chains`);
        const data = await response.json();
        if (data.success) {
            displaySettlementChains(data.data);
        } else {
            showToast('No settlement chains found', 'info');
        }
    } catch (error) {
        showToast('Error finding settlements', 'error');
    }
}

async function createSettlement(chainIndex) {
    try {
        const response = await fetch(`${API_BASE}/settlements/chains`);
        const data = await response.json();
        if (data.success && data.data[chainIndex]) {
            const chain = data.data[chainIndex];
            const settlement = chain.settlement;

            const proposalRes = await fetch(`${API_BASE}/settlements/proposals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    first_debt_id: chain.first_debt.id,
                    second_debt_id: chain.second_debt.id,
                    amount: settlement.amount
                })
            });

            const proposalData = await proposalRes.json();
            if (proposalData.success) {
                showSettlementModal(proposalData.data);
                showToast('Settlement proposal created', 'success');
            } else {
                showToast(proposalData.message || 'Error creating proposal', 'error');
            }
        }
    } catch (error) {
        showToast('Error creating settlement', 'error');
    }
}

async function approveSettlement(proposalId, userId) {
    try {
        const response = await fetch(`${API_BASE}/settlements/${proposalId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });

        const data = await response.json();
        if (data.success) {
            showToast('Settlement approved', 'success');
            await loadSettlements();
            showSettlementModal(data.data);
        } else {
            showToast(data.message || 'Error approving settlement', 'error');
        }
    } catch (error) {
        showToast('Error approving settlement', 'error');
    }
}

async function rejectSettlement(proposalId, userId) {
    try {
        const response = await fetch(`${API_BASE}/settlements/${proposalId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });

        const data = await response.json();
        if (data.success) {
            showToast('Settlement rejected', 'info');
            await loadSettlements();
            closeModal();
        } else {
            showToast(data.message || 'Error rejecting settlement', 'error');
        }
    } catch (error) {
        showToast('Error rejecting settlement', 'error');
    }
}

async function finalizeSettlement(proposalId) {
    try {
        const response = await fetch(`${API_BASE}/settlements/${proposalId}/finalize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        if (data.success) {
            showToast('Settlement completed successfully!', 'success');
            await loadSettlements();
            await loadDebts();
            await loadHistory();
            closeModal();
        } else {
            showToast(data.message || 'Error finalizing settlement', 'error');
        }
    } catch (error) {
        showToast('Error finalizing settlement', 'error');
    }
}

// Display Functions
function populateUserSelectors() {
    const userSelect = document.getElementById('currentUser');
    const profileSelect = document.getElementById('profileUser');

    allUsers.forEach(user => {
        const option1 = document.createElement('option');
        option1.value = user.id;
        option1.textContent = user.name;
        userSelect.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = user.id;
        option2.textContent = user.name;
        profileSelect.appendChild(option2);
    });
}

function updateDashboard() {
    if (!currentUser) return;

    const userSummary = fetch(`${API_BASE}/users/${currentUser}/summary`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                document.getElementById('totalOwe').textContent = `₹${data.data.totalOwedByMe}`;
                document.getElementById('totalOwed').textContent = `₹${data.data.totalOwedToMe}`;
                document.getElementById('totalPaid').textContent = `₹${data.data.totalPaid}`;
                document.getElementById('totalReceived').textContent = `₹${data.data.totalReceived}`;
            }
        });

    const userDebts = allDebts.filter(
        d => (d.debtor_id === currentUser || d.creditor_id === currentUser) &&
        (d.status === 'active' || d.status === 'partially_paid')
    );

    const debtsContainer = document.getElementById('currentDebts');
    if (userDebts.length === 0) {
        debtsContainer.innerHTML = '<p class="empty-state">No active debts</p>';
    } else {
        debtsContainer.innerHTML = userDebts.map(debt => `
            <div class="debt-item">
                <div class="item-content">
                    <div class="item-title">
                        ${debt.debtor_id === currentUser ? '↗️ I owe' : '↙️ Owed to me'}
                        ${debt.debtor_id === currentUser ? debt.creditor_name : debt.debtor_name}
                    </div>
                    <div class="item-subtitle">${debt.reason}</div>
                </div>
                <div class="item-amount">₹${debt.remaining_amount}</div>
                <span class="item-status status-${debt.status}">${debt.status.replace('_', ' ')}</span>
            </div>
        `).join('');
    }
}

function displaySettlementChains(chains) {
    const container = document.getElementById('settlementChains');
    if (chains.length === 0) {
        container.innerHTML = '<p class="empty-state">No settlement chains found</p>';
        return;
    }

    container.innerHTML = chains.map((chain, index) => `
        <div class="chain-item">
            <div class="item-content">
                <div class="item-title">Settlement Chain #${index + 1}</div>
                <div class="chain-visual">
                    <div class="chain-user">${chain.settlement.from_name}</div>
                    <div class="chain-arrow">→</div>
                    <div class="chain-user">${chain.settlement.middle_name}</div>
                    <div class="chain-arrow">→</div>
                    <div class="chain-user">${chain.settlement.to_name}</div>
                </div>
                <div class="item-subtitle" style="margin-top: 0.5rem;">
                    <strong>Suggestion:</strong> ${chain.settlement.from_name} pays ${chain.settlement.to_name} directly
                </div>
                <div class="chain-visual" style="margin-top: 0.5rem;">
                    <div class="chain-user">${chain.settlement.from_name}</div>
                    <div class="chain-arrow">→</div>
                    <div class="chain-user">${chain.settlement.to_name}</div>
                    <div class="chain-amount">₹${chain.settlement.amount}</div>
                </div>
            </div>
            <button class="btn-primary" onclick="createSettlement(${index})">Create Settlement</button>
        </div>
    `).join('');
}

function displaySettlements() {
    const pending = allSettlements.filter(s => s.status === 'pending');
    const completed = allSettlements.filter(s => s.status === 'completed');

    const pendingContainer = document.getElementById('pendingProposals');
    if (pending.length === 0) {
        pendingContainer.innerHTML = '<p class="empty-state">No pending proposals</p>';
    } else {
        pendingContainer.innerHTML = pending.map(settlement => `
            <div class="proposal-item">
                <div class="item-content">
                    <div class="item-title">
                        ${settlement.from_name} → ${settlement.to_name}
                    </div>
                    <div class="item-subtitle">Via: ${settlement.middle_name}</div>
                </div>
                <div class="item-amount">₹${settlement.amount}</div>
                <span class="item-status status-${settlement.status}">${settlement.status}</span>
                <button class="btn-secondary" onclick="showSettlementModal({id: '${settlement.id}'})">View Details</button>
            </div>
        `).join('');
    }

    const completedContainer = document.getElementById('completedSettlements');
    if (completed.length === 0) {
        completedContainer.innerHTML = '<p class="empty-state">No completed settlements</p>';
    } else {
        completedContainer.innerHTML = completed.map(settlement => `
            <div class="proposal-item">
                <div class="item-content">
                    <div class="item-title">
                        ${settlement.from_name} → ${settlement.to_name}
                    </div>
                    <div class="item-subtitle">Via: ${settlement.middle_name}</div>
                </div>
                <div class="item-amount">₹${settlement.amount}</div>
                <span class="item-status status-${settlement.status}">${settlement.status}</span>
            </div>
        `).join('');
    }
}

function displayTimeline(timeline) {
    const container = document.getElementById('activityTimeline');
    if (timeline.length === 0) {
        container.innerHTML = '<p class="empty-state">No activity</p>';
        return;
    }

    container.innerHTML = timeline.slice(0, 20).map(item => `
        <div class="timeline-item">
            <div class="timeline-content">
                <div class="timeline-date">${new Date(item.created_at).toLocaleString()}</div>
                <div class="timeline-description">${item.description}</div>
                ${item.amount ? `<div class="timeline-amount">₹${item.amount}</div>` : ''}
            </div>
        </div>
    `).join('');
}

function displayPayments(payments) {
    const container = document.getElementById('paymentsList');
    if (payments.length === 0) {
        container.innerHTML = '<p class="empty-state">No payments</p>';
        return;
    }

    container.innerHTML = `
        <table class="profile-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Amount</th>
                    <th>Note</th>
                </tr>
            </thead>
            <tbody>
                ${payments.slice(0, 50).map(p => `
                    <tr>
                        <td>${new Date(p.payment_date || p.created_at).toLocaleDateString()}</td>
                        <td>${p.payer_name || 'N/A'}</td>
                        <td>${p.receiver_name || 'N/A'}</td>
                        <td>₹${p.amount}</td>
                        <td>${p.note || '-'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function displaySettlementsHistory(settlements) {
    const container = document.getElementById('settlementsList');
    if (settlements.length === 0) {
        container.innerHTML = '<p class="empty-state">No settlements</p>';
        return;
    }

    container.innerHTML = `
        <table class="profile-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Route</th>
                    <th>Amount</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${settlements.map(s => `
                    <tr>
                        <td>${new Date(s.settlement_date).toLocaleDateString()}</td>
                        <td>${s.from_name} → ${s.to_name}</td>
                        <td>₹${s.amount}</td>
                        <td><span class="item-status status-${s.status}">${s.status}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function displayUserProfile(summary, history) {
    const container = document.getElementById('profileContent');

    container.innerHTML = `
        <div class="summary-grid">
            <div class="summary-card card-owe">
                <div class="card-label">Total I Owe</div>
                <div class="card-amount">₹${summary.totalOwedByMe}</div>
            </div>
            <div class="summary-card card-owed">
                <div class="card-label">Total Owed to Me</div>
                <div class="card-amount">₹${summary.totalOwedToMe}</div>
            </div>
            <div class="summary-card card-paid">
                <div class="card-label">Total Paid</div>
                <div class="card-amount">₹${summary.totalPaid}</div>
            </div>
            <div class="summary-card card-received">
                <div class="card-label">Total Received</div>
                <div class="card-amount">₹${summary.totalReceived}</div>
            </div>
        </div>

        <div class="profile-section">
            <h3>💸 Money I Owe</h3>
            ${history.moneyIOwe.length === 0 ? '<p class="empty-state">No debts</p>' : `
                <table class="profile-table">
                    <thead>
                        <tr>
                            <th>Person</th>
                            <th>Original</th>
                            <th>Paid</th>
                            <th>Remaining</th>
                            <th>Reason</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.moneyIOwe.map(d => `
                            <tr>
                                <td>${d.creditor_name}</td>
                                <td>₹${d.original_amount}</td>
                                <td>₹${d.paid_amount}</td>
                                <td>₹${d.remaining_amount}</td>
                                <td>${d.reason}</td>
                                <td><span class="item-status status-${d.status}">${d.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>

        <div class="profile-section">
            <h3>💰 Money Owed to Me</h3>
            ${history.moneyOwedToMe.length === 0 ? '<p class="empty-state">No debts</p>' : `
                <table class="profile-table">
                    <thead>
                        <tr>
                            <th>Person</th>
                            <th>Original</th>
                            <th>Paid</th>
                            <th>Remaining</th>
                            <th>Reason</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.moneyOwedToMe.map(d => `
                            <tr>
                                <td>${d.debtor_name}</td>
                                <td>₹${d.original_amount}</td>
                                <td>₹${d.paid_amount}</td>
                                <td>₹${d.remaining_amount}</td>
                                <td>${d.reason}</td>
                                <td><span class="item-status status-${d.status}">${d.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>

        <div class="profile-section">
            <h3>📋 Payment History</h3>
            ${history.paymentHistory.length === 0 ? '<p class="empty-state">No payments</p>' : `
                <table class="profile-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>From</th>
                            <th>To</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.paymentHistory.map(p => `
                            <tr>
                                <td>${new Date(p.payment_date).toLocaleDateString()}</td>
                                <td>${p.payer_name}</td>
                                <td>${p.receiver_name}</td>
                                <td>₹${p.amount}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>

        <div class="profile-section">
            <h3>🔄 Settlement History</h3>
            ${history.settlementHistory.length === 0 ? '<p class="empty-state">No settlements</p>' : `
                <table class="profile-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Route</th>
                            <th>Amount</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.settlementHistory.map(s => `
                            <tr>
                                <td>${new Date(s.settlement_date).toLocaleDateString()}</td>
                                <td>${s.from_name} → ${s.to_name}</td>
                                <td>₹${s.amount}</td>
                                <td><span class="item-status status-${s.status}">${s.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>
    `;
}

function loadProfileUsers() {
    // Profile page already has user selector populated
}

function showSettlementModal(settlement) {
    if (!settlement.id) return;
    
    fetch(`${API_BASE}/settlements/${settlement.id}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                const s = data.data;
                const allApproved = s.approvals && s.approvals.length === 3 && s.approvals.every(a => a.approved === 1);
                
                document.getElementById('modalBody').innerHTML = `
                    <div class="modal-section">
                        <h3>Original Debts</h3>
                        <div class="modal-info">
                            <div class="modal-row">
                                <span class="modal-label">Debt 1:</span>
                                <span class="modal-value">${s.from_name} → ${s.middle_name}: ₹${s.amount}</span>
                            </div>
                            <div class="modal-row">
                                <span class="modal-label">Debt 2:</span>
                                <span class="modal-value">${s.middle_name} → ${s.to_name}: ₹${s.amount}</span>
                            </div>
                        </div>
                    </div>

                    <div class="modal-section">
                        <h3>Suggested Settlement</h3>
                        <div class="modal-info">
                            <div class="chain-visual">
                                <div class="chain-user">${s.from_name}</div>
                                <div class="chain-arrow">→</div>
                                <div class="chain-user">${s.to_name}</div>
                                <div class="chain-amount">₹${s.amount}</div>
                            </div>
                        </div>
                    </div>

                    <div class="modal-section">
                        <h3>Why This Works</h3>
                        <ul style="margin-left: 1.5rem; color: #666; line-height: 1.8;">
                            <li>Removes the chain: ${s.from_name} → ${s.middle_name} → ${s.to_name}</li>
                            <li>Reduces total transaction count</li>
                            <li>Preserves all balances</li>
                            <li>Simplifies the debt network</li>
                        </ul>
                    </div>

                    <div class="modal-section">
                        <h3>Approvals Required</h3>
                        <div class="approval-container">
                            ${s.approvals ? s.approvals.map(a => `
                                <div class="approval-item">
                                    <div class="approval-user">${a.name}</div>
                                    <div class="approval-status ${a.approved === 1 ? 'approval-approved' : a.approved === 0 ? 'approval-rejected' : 'approval-pending'}">
                                        ${a.approved === 1 ? 'Approved' : a.approved === 0 ? 'Rejected' : 'Pending'}
                                    </div>
                                </div>
                            `).join('') : ''}
                        </div>
                    </div>

                    <div class="modal-section">
                        <h3>Your Action</h3>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            ${s.status === 'pending' ? `
                                <button class="btn-success" onclick="approveSettlement('${s.id}', '${s.from_name === allUsers.find(u => u.id === currentUser)?.name ? currentUser : (s.middle_name === allUsers.find(u => u.id === currentUser)?.name ? currentUser : currentUser)})">Approve</button>
                                <button class="btn-danger" onclick="rejectSettlement('${s.id}', '${currentUser}')">Reject</button>
                                ${allApproved ? `<button class="btn-primary" onclick="finalizeSettlement('${s.id}')">Finalize Settlement</button>` : ''}
                            ` : `
                                <button class="btn-secondary" disabled>Status: ${s.status}</button>
                            `}
                        </div>
                    </div>
                `;
                document.getElementById('settlementModal').classList.add('active');
            }
        })
        .catch(error => showToast('Error loading settlement details', 'error'));
}

function closeModal() {
    document.getElementById('settlementModal').classList.remove('active');
}

// Utility Functions
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast active ${type}`;
    setTimeout(() => {
        toast.classList.remove('active');
    }, 3000);
}
