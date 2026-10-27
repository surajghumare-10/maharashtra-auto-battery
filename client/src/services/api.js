const API_BASE = '/api';

export async function apiRequest(endpoint, method = 'GET', data = null) {
  const token = localStorage.getItem('mab_token');
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);

  if (response.status === 401 || response.status === 403) {
    // If token expired, clear and notify
    if (endpoint !== '/auth/login') {
      localStorage.removeItem('mab_token');
      localStorage.removeItem('mab_user');
      window.dispatchEvent(new Event('auth_expired'));
    }
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = result.error || result.warning || result.message || `Request failed (${response.status})`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = result;
    throw error;
  }

  return result;
}

export const api = {
  // Auth
  login: (username, password, rememberMe) => apiRequest('/auth/login', 'POST', { username, password, rememberMe }),
  getMe: () => apiRequest('/auth/me'),
  getUsers: () => apiRequest('/auth/users'),
  createUser: (data) => apiRequest('/auth/users', 'POST', data),
  updateUser: (id, data) => apiRequest(`/auth/users/${id}`, 'PUT', data),
  resetPassword: (id, newPassword) => apiRequest(`/auth/users/${id}/reset-password`, 'PUT', { newPassword }),
  deleteUser: (id) => apiRequest(`/auth/users/${id}`, 'DELETE'),

  // Batteries
  getBatteries: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/batteries${query ? '?' + query : ''}`);
  },
  createBattery: (data) => apiRequest('/batteries', 'POST', data),
  updateBattery: (id, data) => apiRequest(`/batteries/${id}`, 'PUT', data),
  deleteBattery: (id) => apiRequest(`/batteries/${id}`, 'DELETE'),

  // Customers
  lookupCustomer: (mobile) => apiRequest(`/customers/lookup/${mobile}`),
  getCustomers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/customers${query ? '?' + query : ''}`);
  },
  getCustomerDetail: (id) => apiRequest(`/customers/${id}`),

  // Bills
  getBills: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/bills${query ? '?' + query : ''}`);
  },
  getBill: (id) => apiRequest(`/bills/${id}`),
  createBill: (data) => apiRequest('/bills', 'POST', data),
  updateBill: (id, data) => apiRequest(`/bills/${id}`, 'PUT', data),
  deleteBill: (id) => apiRequest(`/bills/${id}`, 'DELETE'),
  resendBillMessage: (id) => apiRequest(`/bills/${id}/resend-message`, 'POST'),

  // Payments (Dues)
  recordPayment: (data) => apiRequest('/payments', 'POST', data),
  getCustomerPayments: (customerId) => apiRequest(`/payments/customer/${customerId}`),

  // Stock
  addStock: (data) => apiRequest('/stock/add', 'POST', data),
  adjustStock: (data) => apiRequest('/stock/adjust', 'POST', data),
  getStockMovements: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/stock/movements${query ? '?' + query : ''}`);
  },
  getOldBatteries: () => apiRequest('/stock/old-batteries'),
  sellScrap: (data) => apiRequest('/stock/old-batteries/scrap-sale', 'POST', data),

  // Reports
  getDashboard: () => apiRequest('/reports/dashboard'),
  getDuesReport: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/reports/dues${query ? '?' + query : ''}`);
  },
  sendDueReminder: (customerId) => apiRequest(`/reports/dues/${customerId}/send-reminder`, 'POST'),
  getInventoryReport: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/reports/inventory${query ? '?' + query : ''}`);
  },

  // Settings
  getSettings: () => apiRequest('/settings'),
  updateSettings: (data) => apiRequest('/settings', 'PUT', data),

  // Backups
  triggerBackup: () => apiRequest('/backup/create', 'POST'),
  listBackups: () => apiRequest('/backup/list'),
};
