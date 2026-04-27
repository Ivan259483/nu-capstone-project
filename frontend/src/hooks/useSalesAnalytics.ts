import { useState, useEffect } from 'react';
import api from '@/lib/api';

export type TransactionStatus = 'completed' | 'pending' | 'processing' | 'voided';
export type PaymentMethod = 'cash' | 'card' | 'gcash' | 'maya' | 'bank_transfer';

export interface Transaction {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  vehiclePlate: string;
  vehicleInfo: string;
  services: { name: string; price: number; qty: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  dateTime: string;
  staffName: string;
  notes: string;
}

export function useSalesAnalytics() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const { data } = await api.get('/orders?limit=500', { meta: { suppressErrorToast: true } });
        if (data.success && Array.isArray(data.data)) {
          const mapped: Transaction[] = data.data.map((o: any) => ({
            id: o.bookingReference || o.id,
            customerId: o.customer?._id || o.customerId || 'unknown',
            customerName: o.customerName || 'Walk-in Customer',
            customerPhone: o.customerPhone || '',
            vehiclePlate: o.vehiclePlate || 'N/A',
            vehicleInfo: o.vehicleInfo || '',
            services: o.items ? o.items.map((i: any) => ({
              name: i.product?.name || i.name || 'Service',
              price: i.price || 0,
              qty: i.quantity || 1
            })) : [],
            subtotal: o.totalAmount || 0,
            discount: 0,
            tax: 0,
            total: o.totalPrice || o.totalAmount || 0,
            paymentMethod: o.paymentMethod || 'cash',
            status: (o.status === 'confirmed' || o.status === 'in_progress' ? 'processing' : o.status === 'cancelled' ? 'voided' : o.status) as TransactionStatus,
            dateTime: o.createdAt || o.date || new Date().toISOString(),
            staffName: o.assignedDetailer?.name || 'Unassigned',
            notes: o.notes || ''
          }));
          // Sort descending so recentTransactions gets the latest
          mapped.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
          
          setTransactions(mapped);
        }
      } catch (error) {
        console.error('Failed to fetch sales transactions:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, []);

  // --- Compute KPIs ---
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayTxns = transactions.filter(t => new Date(t.dateTime) >= today);
  const yesterdayTxns = transactions.filter(t => {
    const d = new Date(t.dateTime);
    return d >= yesterday && d < today;
  });

  const totalSalesToday = todayTxns.reduce((sum, t) => sum + (t.status !== 'voided' ? t.total : 0), 0);
  const totalSalesYesterday = yesterdayTxns.reduce((sum, t) => sum + (t.status !== 'voided' ? t.total : 0), 0);

  const pendingPayments = todayTxns.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.total, 0);
  const pendingCount = todayTxns.filter(t => t.status === 'pending').length;

  const completedPayments = todayTxns.filter(t => t.status === 'completed').reduce((sum, t) => sum + t.total, 0);
  const completedCount = todayTxns.filter(t => t.status === 'completed').length;

  // Service Mix Today
  const serviceRevenue: Record<string, number> = {};
  todayTxns.forEach(t => {
    if (t.status !== 'voided') {
      t.services.forEach(s => {
        serviceRevenue[s.name] = (serviceRevenue[s.name] || 0) + (s.price * s.qty);
      });
    }
  });

  const sortedServices = Object.entries(serviceRevenue).sort((a, b) => b[1] - a[1]);
  const topServiceToday = sortedServices.length > 0 ? sortedServices[0][0] : '—';
  const topServiceRevenue = sortedServices.length > 0 ? sortedServices[0][1] : 0;

  const avgTransactionValue = todayTxns.length > 0 ? totalSalesToday / todayTxns.length : 0;

  const kpis = {
    totalSalesToday,
    totalSalesYesterday,
    transactionCount: todayTxns.length,
    transactionCountYesterday: yesterdayTxns.length,
    pendingPayments,
    pendingCount,
    completedPayments,
    completedCount,
    topServiceToday,
    topServiceRevenue,
    avgTransactionValue,
  };

  // --- Compute Hourly Sales (Today) ---
  const hourlyMap: Record<string, { revenue: number; transactions: number; hourNum: number }> = {};
  
  // Initialize standard business hours
  for (let i = 8; i <= 18; i++) {
    const hourLabel = i === 12 ? '12PM' : i > 12 ? `${i - 12}PM` : `${i}AM`;
    hourlyMap[hourLabel] = { revenue: 0, transactions: 0, hourNum: i };
  }

  todayTxns.forEach(t => {
    if (t.status !== 'voided') {
      const h = new Date(t.dateTime).getHours();
      const hourLabel = h === 12 ? '12PM' : h === 0 ? '12AM' : h > 12 ? `${h - 12}PM` : `${h}AM`;
      
      // If hour is outside standard hours, initialize it dynamically
      if (!hourlyMap[hourLabel]) {
        hourlyMap[hourLabel] = { revenue: 0, transactions: 0, hourNum: h };
      }
      
      hourlyMap[hourLabel].revenue += Number(t.total) || 0;
      hourlyMap[hourLabel].transactions += 1;
    }
  });

  // Sort by hour visually
  const hourlySales = Object.values(hourlyMap)
    .sort((a, b) => a.hourNum - b.hourNum)
    .map(({ hourNum, ...data }) => {
      const hourLabel = hourNum === 12 ? '12PM' : hourNum === 0 ? '12AM' : hourNum > 12 ? `${hourNum - 12}PM` : `${hourNum}AM`;
      return {
        hour: hourLabel,
        revenue: data.revenue,
        transactions: data.transactions
      };
    });

  // --- Compute Service Mix (Today) ---
  const totalRevenueForMix = Object.values(serviceRevenue).reduce((a, b) => a + b, 0);
  const colors = ['#0F52BA', '#8B5CF6', '#10B981', '#F59E0B', '#64748B'];
  const serviceMix = sortedServices.slice(0, 5).map(([name, value], i) => ({
    name,
    value,
    pct: totalRevenueForMix > 0 ? Math.round((value / totalRevenueForMix) * 100) : 0,
    fill: colors[i % colors.length]
  }));

  // --- Compute 7-Day Trend ---
  const sevenDaySales = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const dayEnd = new Date(d);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayRevenue = transactions
      .filter(t => t.status !== 'voided')
      .filter(t => {
        const td = new Date(t.dateTime);
        return td >= d && td < dayEnd;
      })
      .reduce((sum, t) => sum + t.total, 0);

    sevenDaySales.push({ date: dateStr, revenue: dayRevenue });
  }

  return {
    transactions,
    isLoading,
    kpis,
    hourlySales,
    serviceMix,
    sevenDaySales,
    recentTransactions: transactions.slice(0, 6)
  };
}
