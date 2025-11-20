// Balance and Transaction History Service
// Handles all balance-related API calls

const BASE_URL = 'https://gebeta-delivery1.onrender.com';

/**
 * Get current balance
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Balance data with amount and currency
 */
export const getBalance = async (token) => {
  try {
    const response = await fetch(`${BASE_URL}/api/v1/balance`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (response.ok && data.status === 'success') {
      return {
        success: true,
        data: data.data,
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to fetch balance',
        requiresAuth: response.status === 401 || data.message?.toLowerCase().includes('log in again') || data.message?.toLowerCase().includes('password changed'),
      };
    }
  } catch (error) {
    console.error('Error fetching balance:', error);
    return {
      success: false,
      message: error.message === 'Failed to fetch' || error.message.includes('Network request failed')
        ? 'Unable to connect to server. Please check your internet connection.'
        : 'Something went wrong while fetching balance.',
    };
  }
};

/**
 * Request withdrawal
 * @param {string} token - Authentication token
 * @param {number} amount - Amount to withdraw
 * @returns {Promise<Object>} Withdrawal response
 */
export const requestWithdrawal = async (token, amount) => {
  try {
    const response = await fetch(`${BASE_URL}/api/v1/balance/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ amount }),
    });

    const data = await response.json();

    if (response.ok && data.status === 'success') {
      return {
        success: true,
        data: data.data,
        message: data.message || 'Withdrawal request submitted successfully',
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to request withdrawal',
        requiresAuth: response.status === 401 || data.message?.toLowerCase().includes('log in again'),
      };
    }
  } catch (error) {
    console.error('Error requesting withdrawal:', error);
    return {
      success: false,
      message: error.message === 'Failed to fetch' || error.message.includes('Network request failed')
        ? 'Unable to connect to server. Please check your internet connection.'
        : 'Something went wrong while requesting withdrawal.',
    };
  }
};

/**
 * Get transaction history
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Transaction history with total balance and transactions
 */
export const getTransactionHistory = async (token) => {
  try {
    const response = await fetch(`${BASE_URL}/api/v1/balance/history`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (response.ok && data.status === 'success') {
      return {
        success: true,
        data: {
          transactions: data.transactions || [],
          totalBalance: data.totalBalance,
          requesterType: data.requesterType,
        },
      };
    } else {
      return {
        success: false,
        message: data.message || 'Failed to fetch transaction history',
        requiresAuth: response.status === 401 || data.message?.toLowerCase().includes('log in again') || data.message?.toLowerCase().includes('password changed'),
      };
    }
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return {
      success: false,
      message: error.message === 'Failed to fetch' || error.message.includes('Network request failed')
        ? 'Unable to connect to server. Please check your internet connection.'
        : 'Something went wrong while fetching transaction history.',
    };
  }
};

/**
 * Format currency for Ethiopian Birr
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string (e.g., "ETB 1,234.56")
 */
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB'
  }).format(amount || 0);
};

/**
 * Get transaction type color
 * @param {string} type - Transaction type (Deposit/Withdraw)
 * @returns {string} Color code
 */
export const getTransactionTypeColor = (type) => {
  return type === 'Deposit' ? '#10B981' : '#EF4444';
};

/**
 * Get transaction status color
 * @param {string} status - Transaction status
 * @returns {Object} Color and background color
 */
export const getTransactionStatusColor = (status) => {
  switch (status) {
    case 'COMPLETED':
      return { color: '#10B981', backgroundColor: '#D1FAE5' };
    case 'PENDING':
      return { color: '#F59E0B', backgroundColor: '#FEF3C7' };
    case 'FAILED':
      return { color: '#EF4444', backgroundColor: '#FEE2E2' };
    default:
      return { color: '#6B7280', backgroundColor: '#F3F4F6' };
  }
};

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
export const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  // If less than 24 hours, show relative time
  if (diffInSeconds < 86400) {
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    return `${Math.floor(diffInSeconds / 3600)}h ago`;
  }

  // Otherwise show formatted date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

/**
 * Format full date and time for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date and time
 */
export const formatDateTime = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};




